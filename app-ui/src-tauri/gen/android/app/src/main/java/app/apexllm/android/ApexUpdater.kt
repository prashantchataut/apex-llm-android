package app.apexllm.android

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * In-app APK updater (`window.ApexUpdater`). The app never leaves for Chrome / GitHub:
 *  1. [start] streams the release asset on a background thread with HttpURLConnection (GitHub answers with a 302 to
 *     objects.githubusercontent.com, which is followed natively, so no WebView CORS is involved).
 *  2. Progress is pushed to the page every ~100 ms as an `apex-update` CustomEvent
 *     `{ status, percent, downloadedMB, totalMB, speedKBps, version, message? }`.
 *  3. When the file is complete it is validated (ZIP magic) and handed to Android's package installer through
 *     FileProvider (`<applicationId>.fileprovider`, path `Download/` in the app's external files dir).
 * Only https URLs on GitHub hosts are accepted. Content-Length is optional; `expectedBytes` is the fallback total.
 */
class ApexUpdater(private val activity: Activity, private val webView: () -> WebView?) {
  private val exec = Executors.newSingleThreadExecutor()
  @Volatile private var running = false
  @Volatile private var cancelled = false
  @Volatile private var last = "{\"status\":\"idle\",\"percent\":0,\"downloadedMB\":0,\"totalMB\":0,\"speedKBps\":0}"

  private fun apkFile(): File {
    val dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: activity.cacheDir
    if (!dir.exists()) dir.mkdirs()
    return File(dir, "Apex-LLM-update.apk")
  }

  private fun allowed(u: String): Boolean {
    val uri = try { Uri.parse(u) } catch (e: Exception) { return false }
    val host = uri.host ?: return false
    return uri.scheme == "https" && (host == "github.com" || host.endsWith(".github.com") || host.endsWith(".githubusercontent.com"))
  }

  private fun emit(status: String, version: String, done: Long, total: Long, speedKBps: Long, message: String? = null) {
    val pct = if (total > 0) ((done * 100.0) / total).coerceIn(0.0, 100.0) else 0.0
    val o = JSONObject()
    o.put("status", status)
    o.put("version", version)
    o.put("percent", Math.round(pct * 10.0) / 10.0)
    o.put("downloadedMB", Math.round(done / 1048.576) / 1000.0)
    o.put("totalMB", Math.round(total / 1048.576) / 1000.0)
    o.put("speedKBps", speedKBps)
    if (message != null) o.put("message", message)
    val json = o.toString()
    last = json
    val w = webView() ?: return
    val js = "window.dispatchEvent(new CustomEvent('apex-update',{detail:$json}))"
    w.post { w.evaluateJavascript(js, null) }
  }

  /** True when the OS lets this app launch the package installer (Android 8+ per-app "install unknown apps"). */
  @JavascriptInterface
  fun canInstall(): Boolean = Build.VERSION.SDK_INT < 26 || activity.packageManager.canRequestPackageInstalls()

  /** Opens the "Install unknown apps" screen for this app. */
  @JavascriptInterface
  fun openInstallSettings() {
    if (Build.VERSION.SDK_INT < 26) return
    activity.runOnUiThread {
      try {
        activity.startActivity(
          Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
      } catch (e: Exception) { /* ignore */ }
    }
  }

  /** Last emitted event as JSON (lets the page resync after a reload). */
  @JavascriptInterface
  fun status(): String = last

  @JavascriptInterface
  fun cancel() { cancelled = true }

  /** Re-launches the installer for an APK that was already downloaded. */
  @JavascriptInterface
  fun install(version: String): Boolean {
    val f = apkFile()
    if (!f.exists() || f.length() < 1_000_000) return false
    return launchInstaller(f, version)
  }

  /** Downloads [apkUrl] inside the app and opens the system installer. Returns false when rejected / already running. */
  @JavascriptInterface
  fun start(apkUrl: String, version: String, expectedBytes: Double): Boolean {
    if (!allowed(apkUrl) || running) return false
    running = true
    cancelled = false
    exec.execute {
      try {
        download(apkUrl, version, expectedBytes.toLong())
      } catch (e: Exception) {
        emit("error", version, 0, 0, 0, e.message ?: "Download failed")
      } finally {
        running = false
      }
    }
    return true
  }

  private fun download(apkUrl: String, version: String, expected: Long) {
    val target = apkFile()
    val part = File(target.parentFile, "Apex-LLM-update.apk.part")
    if (target.exists()) target.delete()
    if (part.exists()) part.delete()
    emit("starting", version, 0, expected, 0)

    val conn = URL(apkUrl).openConnection() as HttpURLConnection
    conn.instanceFollowRedirects = true
    conn.connectTimeout = 15_000
    conn.readTimeout = 20_000
    conn.setRequestProperty("User-Agent", "ApexLLM-Updater/$version")
    conn.setRequestProperty("Accept", "application/octet-stream")
    try {
      val code = conn.responseCode
      if (code !in 200..299) throw IllegalStateException("Server answered HTTP $code")
      val len = conn.contentLengthLong
      val total = if (len > 0) len else expected
      var done = 0L
      var lastEmit = 0L
      val t0 = System.currentTimeMillis()
      conn.inputStream.use { input ->
        FileOutputStream(part).use { out ->
          val buf = ByteArray(64 * 1024)
          while (true) {
            if (cancelled) {
              part.delete()
              emit("error", version, done, total, 0, "Download cancelled")
              return
            }
            val n = input.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
            done += n
            val now = System.currentTimeMillis()
            if (now - lastEmit >= 100) {
              lastEmit = now
              val kbps = (done / 1024) * 1000 / (now - t0).coerceAtLeast(1)
              emit("downloading", version, done, if (total > 0) total else done, kbps)
            }
          }
          out.flush()
        }
      }
      val ms = (System.currentTimeMillis() - t0).coerceAtLeast(1)
      if (done < 1_000_000) throw IllegalStateException("Downloaded file is too small to be an APK")
      if (len > 0 && done != len) throw IllegalStateException("Download was cut short ($done of $len bytes)")
      if (!part.renameTo(target)) throw IllegalStateException("Could not save the update file")
      emit("downloading", version, done, done, (done / 1024) * 1000 / ms)
    } finally {
      conn.disconnect()
    }

    // ZIP magic "PK": an HTML error page must never reach the installer.
    val magic = ByteArray(2)
    target.inputStream().use { it.read(magic) }
    if (magic[0] != 'P'.code.toByte() || magic[1] != 'K'.code.toByte()) {
      target.delete()
      throw IllegalStateException("Downloaded file is not an APK")
    }
    launchInstaller(target, version)
  }

  private fun launchInstaller(file: File, version: String): Boolean {
    return try {
      val uri = FileProvider.getUriForFile(activity, activity.packageName + ".fileprovider", file)
      val intent = Intent(Intent.ACTION_VIEW)
      intent.setDataAndType(uri, "application/vnd.android.package-archive")
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      activity.startActivity(intent)
      val size = file.length()
      emit("installing", version, size, size, 0)
      true
    } catch (e: Exception) {
      emit("error", version, 0, 0, 0, "Installer could not be opened: ${e.message}")
      false
    }
  }
}
