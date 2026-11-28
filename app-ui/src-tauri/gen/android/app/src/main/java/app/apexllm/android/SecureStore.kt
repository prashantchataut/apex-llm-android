package app.apexllm.android

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Per-user secret storage (the user's own GitHub token).
 *
 * - The AES-256-GCM key lives in the Android Keystore and is non-exportable; only the ciphertext is written to
 *   app-private SharedPreferences. Nothing is stored in the WebView's localStorage.
 * - The page reaches it through `WebViewCompat.addWebMessageListener` (window.ApexSecure.postMessage), restricted to
 *   the app's own origins AND the main frame. `addJavascriptInterface` is deliberately NOT used: it is injected into
 *   every frame, which would expose the token to sandboxed artifact previews.
 * - Only an allow-listed set of names can be stored.
 */
class SecureStore(ctx: Context) {
  private val prefs = ctx.applicationContext.getSharedPreferences("apex_secure_v1", Context.MODE_PRIVATE)

  private fun key(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    gen.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return gen.generateKey()
  }

  fun put(name: String, value: String) {
    val c = Cipher.getInstance("AES/GCM/NoPadding")
    c.init(Cipher.ENCRYPT_MODE, key())
    val ct = c.doFinal(value.toByteArray(Charsets.UTF_8))
    prefs.edit().putString(name, Base64.encodeToString(c.iv + ct, Base64.NO_WRAP)).apply()
  }

  fun get(name: String): String {
    val raw = prefs.getString(name, null) ?: return ""
    return try {
      val b = Base64.decode(raw, Base64.NO_WRAP)
      val c = Cipher.getInstance("AES/GCM/NoPadding")
      c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, b.copyOfRange(0, 12)))
      String(c.doFinal(b.copyOfRange(12, b.size)), Charsets.UTF_8)
    } catch (_: Exception) {
      prefs.edit().remove(name).apply() // undecryptable (key lost on restore): drop it, the user signs in again
      ""
    }
  }

  fun remove(name: String) {
    prefs.edit().remove(name).apply()
  }

  companion object {
    private const val ALIAS = "apex_secure_store_v1"
    private val ALLOWED = setOf("github.token.v1")

    /** Registers `window.ApexSecure` for the app's own origins, main frame only. Returns false when unsupported. */
    fun install(webView: WebView, store: SecureStore): Boolean {
      if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return false
      WebViewCompat.addWebMessageListener(
        webView,
        "ApexSecure",
        setOf("http://tauri.localhost", "https://tauri.localhost", "tauri://localhost"),
      ) { _, message: WebMessageCompat, _, isMainFrame, reply: JavaScriptReplyProxy ->
        val out = JSONObject()
        try {
          val req = JSONObject(message.data ?: "{}")
          out.put("id", req.optString("id"))
          val name = req.optString("name")
          if (!isMainFrame || !ALLOWED.contains(name)) {
            out.put("ok", false).put("error", "denied")
          } else {
            when (req.optString("op")) {
              "get" -> out.put("ok", true).put("value", store.get(name))
              "set" -> { store.put(name, req.optString("value")); out.put("ok", true) }
              "remove" -> { store.remove(name); out.put("ok", true) }
              else -> out.put("ok", false).put("error", "bad op")
            }
          }
        } catch (e: Exception) {
          out.put("ok", false).put("error", "failed")
        }
        reply.postMessage(out.toString())
      }
      return true
    }
  }
}
