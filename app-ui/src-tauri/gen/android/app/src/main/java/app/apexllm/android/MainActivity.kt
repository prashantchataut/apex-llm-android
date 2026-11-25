package app.apexllm.android

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Edge-to-edge shell (targetSdk 37 enforces edge-to-edge, so `setDecorFitsSystemWindows(true)` is ignored and the
 * WebView always draws behind the status bar). Android WebViews usually report `env(safe-area-inset-top) = 0`, which
 * made the app header collide with the clock / battery. Fix, in three redundant layers:
 *  1. The real system-bar insets are captured in [Insets] and pushed to the page as `--safe-top` / `--safe-bottom`
 *     (CSS px) on every inset change, on resume, and repeatedly during the first two seconds (the old one-shot script
 *     ran before the document existed and was lost).
 *  2. `window.ApexBars.insets()` returns the same numbers synchronously, so the web layer can pull them at any time.
 *  3. The CSS keeps a 38px / 14px Android fallback when neither value is available.
 * The web layer also tells us the active theme's canvas colour via `window.ApexBars.set(...)`.
 */
class MainActivity : TauriActivity() {
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Dark backdrop until the web layer reports its theme, so the bars never flash white.
    window.decorView.setBackgroundColor(Color.parseColor("#0D0D0F"))
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(Bars(this), "ApexBars")
    webView.addJavascriptInterface(Haptics(this), "ApexHaptics")
    val listener = androidx.core.view.OnApplyWindowInsetsListener { v, insets ->
      Insets.capture(insets, v.resources.displayMetrics.density)
      pushInsets()
      insets
    }
    ViewCompat.setOnApplyWindowInsetsListener(webView, listener)
    // Late page loads / reloads: keep pushing for the first seconds so the value lands after the document exists.
    repeat(8) { i -> webView.postDelayed({ refreshFromRoot(webView); pushInsets() }, 250L * (i + 1)) }
  }

  override fun onResume() {
    super.onResume()
    webView?.let { w -> refreshFromRoot(w); w.postDelayed({ pushInsets() }, 120) }
  }

  private fun refreshFromRoot(w: WebView) {
    ViewCompat.getRootWindowInsets(w)?.let { Insets.capture(it, w.resources.displayMetrics.density) }
  }

  private fun pushInsets() {
    val w = webView ?: return
    val js = "(function(){var s=document.documentElement.style;" +
      "s.setProperty('--safe-top','${Insets.top}px');s.setProperty('--safe-bottom','${Insets.bottom}px');" +
      "s.setProperty('--apex-inset-top','${Insets.top}px');s.setProperty('--apex-inset-bottom','${Insets.bottom}px');" +
      "s.setProperty('--apex-kb','${Insets.kb}px');document.documentElement.dataset.nativeInsets='1';})()"
    w.post { w.evaluateJavascript(js, null) }
  }

  /** Last known system-bar insets in CSS px. */
  object Insets {
    @Volatile var top = 0f
    @Volatile var bottom = 0f
    @Volatile var kb = 0f
    fun capture(insets: WindowInsetsCompat, density: Float) {
      val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      top = b.top / density
      bottom = b.bottom / density
      kb = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom / density
    }
  }

  class Bars(private val activity: Activity) {
    /** "top,bottom,keyboard" in CSS px; read synchronously by the web layer (`src/lib/insets.ts`). */
    @JavascriptInterface
    fun insets(): String {
      ViewCompat.getRootWindowInsets(activity.window.decorView)?.let { Insets.capture(it, activity.resources.displayMetrics.density) }
      return "${Insets.top},${Insets.bottom},${Insets.kb}"
    }

    @JavascriptInterface
    fun set(color: String, lightIcons: Boolean) {
      val c = try { Color.parseColor(color) } catch (e: IllegalArgumentException) { return }
      activity.runOnUiThread {
        val w = activity.window
        w.decorView.setBackgroundColor(c)
        @Suppress("DEPRECATION")
        run {
          w.statusBarColor = Color.TRANSPARENT
          w.navigationBarColor = Color.TRANSPARENT
        }
        if (Build.VERSION.SDK_INT >= 29) {
          w.isNavigationBarContrastEnforced = false
          w.isStatusBarContrastEnforced = false
        }
        val ctl = WindowInsetsControllerCompat(w, w.decorView)
        ctl.isAppearanceLightStatusBars = !lightIcons
        ctl.isAppearanceLightNavigationBars = !lightIcons
      }
    }
  }

  /**
   * Native haptics for the WebView (`window.ApexHaptics`). `play` takes a navigator.vibrate-style pattern
   * ("on,off,on,…" in ms) and an amplitude 1..255; `predefined` uses the system's tuned tick/click/heavy effects.
   */
  class Haptics(ctx: Context) {
    private val vib: Vibrator? =
      if (Build.VERSION.SDK_INT >= 31) ctx.getSystemService(VibratorManager::class.java)?.defaultVibrator
      else @Suppress("DEPRECATION") (ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)

    @JavascriptInterface
    fun available(): Boolean = vib?.hasVibrator() == true

    @JavascriptInterface
    fun play(pattern: String, amplitude: Int) {
      val v = vib ?: return
      if (!v.hasVibrator()) return
      val on = pattern.split(",").mapNotNull { it.trim().toLongOrNull() }.filter { it >= 0 }
      if (on.isEmpty()) return
      val amp = if (v.hasAmplitudeControl()) amplitude.coerceIn(1, 255) else VibrationEffect.DEFAULT_AMPLITUDE
      val effect = if (on.size == 1) {
        VibrationEffect.createOneShot(on[0].coerceAtLeast(1), amp)
      } else {
        // JS pattern = on,off,on…; Android waveform = off,on,off,on…
        val timings = LongArray(on.size + 1)
        val amps = IntArray(on.size + 1)
        for (i in on.indices) {
          timings[i + 1] = on[i]
          amps[i + 1] = if (i % 2 == 0 && v.hasAmplitudeControl()) amp else 0
        }
        VibrationEffect.createWaveform(timings, amps, -1)
      }
      v.vibrate(effect)
    }

    @JavascriptInterface
    fun predefined(name: String): Boolean {
      val v = vib ?: return false
      if (Build.VERSION.SDK_INT < 29 || !v.hasVibrator()) return false
      val id = when (name) {
        "tick" -> VibrationEffect.EFFECT_TICK
        "click" -> VibrationEffect.EFFECT_CLICK
        "heavy" -> VibrationEffect.EFFECT_HEAVY_CLICK
        else -> return false
      }
      v.vibrate(VibrationEffect.createPredefined(id))
      return true
    }
  }
}
