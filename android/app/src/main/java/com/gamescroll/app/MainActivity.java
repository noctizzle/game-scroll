package com.gamescroll.app;

import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.view.DisplayCutout;
import android.view.WindowInsets;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private String lastCutouts = "";

    // The status and navigation bars are hidden all the time (capacitor.config.json SystemBars.hidden).
    // A swipe from the screen edge shows them only for a moment: the system hides them again by itself.
    // Without this they stayed on screen after the first swipe.
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        transientBars();
        watchCutouts();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) transientBars();
    }

    private void transientBars() {
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    // With the status bar hidden, the safe-area inset at the top is only there for the camera (a punch
    // hole on most phones, one in a corner on the Fold's inner screen). It covers the whole width though,
    // so the page gets the camera's real shape too, as window.__gsCutouts (CSS pixels, relative to the
    // web view) and a 'gs-cutouts' event: the top bar then sits beside the camera (src/topbar.js).
    private void watchCutouts() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P || bridge == null) return;
        WebView wv = bridge.getWebView();
        wv.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> sendCutouts(true));
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                sendCutouts(false);
            }
        });
    }

    private void sendCutouts(boolean onlyIfChanged) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P || bridge == null) return;
        WebView wv = bridge.getWebView();
        WindowInsets wi = wv.getRootWindowInsets();
        DisplayCutout dc = wi == null ? null : wi.getDisplayCutout();
        float d = getResources().getDisplayMetrics().density;
        int[] at = new int[2];
        wv.getLocationInWindow(at);
        StringBuilder js = new StringBuilder("[");
        if (dc != null) {
            for (Rect c : dc.getBoundingRects()) {
                if (js.length() > 1) js.append(',');
                js.append(String.format(Locale.US, "{\"l\":%.1f,\"t\":%.1f,\"r\":%.1f,\"b\":%.1f}",
                    (c.left - at[0]) / d, (c.top - at[1]) / d, (c.right - at[0]) / d, (c.bottom - at[1]) / d));
            }
        }
        js.append(']');
        String list = js.toString();
        if (onlyIfChanged && list.equals(lastCutouts)) return;
        lastCutouts = list;
        wv.post(() -> wv.evaluateJavascript(
            "window.__gsCutouts=" + list + ";window.dispatchEvent(new Event('gs-cutouts'))", null));
    }
}
