package dev.apex.llm

import android.app.Activity
import android.graphics.Color
import android.os.Build
import android.os.Bundle
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
    ViewCompat.setOnApplyWindowInsetsListener(webView) { v, insets ->
      val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val d = v.resources.displayMetrics.density
      val js = "(function(){var s=document.documentElement.style;" +
        "s.setProperty('--apex-inset-top','${b.top / d}px');" +
        "s.setProperty('--apex-inset-bottom','${b.bottom / d}px');})()"
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
}
