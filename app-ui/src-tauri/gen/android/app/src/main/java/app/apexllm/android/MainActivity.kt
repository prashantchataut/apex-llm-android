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
 * Edge-to-edge shell. The WebView draws behind both system bars; the web layer tells us the active theme's
 * canvas colour + whether its icons should be light or dark through `window.ApexBars.set(...)`, and receives
 * the real system-bar insets as CSS variables (--apex-inset-top / --apex-inset-bottom).
 */
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    webView.addJavascriptInterface(Bars(this), "ApexBars")
    webView.addJavascriptInterface(Haptics(this), "ApexHaptics")
    ViewCompat.setOnApplyWindowInsetsListener(webView) { v, insets ->
      val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val d = v.resources.displayMetrics.density
      val kb = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      val js = "(function(){var s=document.documentElement.style;" +
        "s.setProperty('--apex-inset-top','${b.top / d}px');" +
        "s.setProperty('--apex-inset-bottom','${b.bottom / d}px');" +
        "s.setProperty('--apex-kb','${kb / d}px');})()"
      v.post { (v as WebView).evaluateJavascript(js, null) }
      insets
    }
  }

  class Bars(private val activity: Activity) {
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
