package com.gamescroll.screenrate;

import android.app.Activity;
import android.content.Context;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Display;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.TreeSet;

/**
 * The screen's refresh rates, and a wish for one while a game plays (src/kit/screenrate.js). A web
 * page can't ask for a refresh rate, and adaptive screens (LTPO, like the Fold's) pick their own, so a
 * card could drop to 60 Hz under a game that frame generation was filling to 120.
 *
 * get() -> { platform: 'android', hz, rates, arr, want }: hz the rate now; rates the ones the screen
 * offers at its current size (whole numbers, lowest first; Android 16 adds the in-between steps of
 * adaptive refresh); arr whether the screen moves between rates without a mode switch (Android 16's
 * hasArrSupport, false where unknown).
 *
 * set({ hz }) asks for that rate (0: no wish, the phone decides): the window's preferred display mode
 * where the screen has a mode at that rate, its preferred refresh rate otherwise, and on Android 15+ a
 * vote on the web view (what adaptive refresh listens to). It's a wish: the phone's own settings
 * (Samsung's Motion smoothness, battery saver, Game Booster) can still overrule it. Kept across a fold
 * or unfold (the other screen has other modes) and a return to the app.
 */
@CapacitorPlugin(name = "ScreenRate")
public class ScreenRatePlugin extends Plugin {
    private volatile float want = 0;
    private DisplayManager.DisplayListener listener;

    @Override
    public void load() {
        DisplayManager dm = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        if (dm == null) return;
        listener = new DisplayManager.DisplayListener() {
            @Override public void onDisplayAdded(int id) {}
            @Override public void onDisplayRemoved(int id) {}
            // a fold or unfold, or the phone changed the mode: the wish again, for this screen's modes
            @Override public void onDisplayChanged(int id) { if (want > 0) apply(); }
        };
        dm.registerDisplayListener(listener, new Handler(Looper.getMainLooper()));
    }

    @Override
    protected void handleOnResume() { if (want > 0) apply(); }

    @Override
    protected void handleOnDestroy() {
        DisplayManager dm = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        if (dm != null && listener != null) dm.unregisterDisplayListener(listener);
    }

    private Display display() {
        Activity a = getActivity();
        if (a == null) return null;
        if (Build.VERSION.SDK_INT >= 30) return a.getDisplay();
        return a.getWindowManager().getDefaultDisplay();
    }

    private static boolean sameSize(Display.Mode m, Display.Mode cur) {
        return m.getPhysicalWidth() == cur.getPhysicalWidth() && m.getPhysicalHeight() == cur.getPhysicalHeight();
    }

    @PluginMethod
    public void get(PluginCall call) {
        JSObject o = new JSObject();
        o.put("platform", "android");
        o.put("want", want);
        Display d = display();
        JSArray rates = new JSArray();
        boolean arr = false;
        float hz = 60;
        if (d != null) {
            Display.Mode cur = d.getMode();
            hz = cur.getRefreshRate();
            TreeSet<Integer> s = new TreeSet<>();
            for (Display.Mode m : d.getSupportedModes()) if (sameSize(m, cur)) s.add(Math.round(m.getRefreshRate()));
            if (Build.VERSION.SDK_INT >= 36) {
                // Android 16: the rates adaptive refresh can show, which can be more than the modes
                float[] more = d.getSupportedRefreshRates();
                if (more != null) for (float f : more) s.add(Math.round(f));
                try { arr = (Boolean) Display.class.getMethod("hasArrSupport").invoke(d); } catch (Exception e) { arr = false; }
            }
            for (Integer r : s) rates.put(r);
        }
        o.put("hz", Math.round(hz));
        o.put("rates", rates);
        o.put("arr", arr);
        call.resolve(o);
    }

    @PluginMethod
    public void set(PluginCall call) {
        Double hz = call.getDouble("hz", 0.0);
        float w = hz == null || hz.isNaN() || hz < 0 ? 0 : hz.floatValue();
        want = Math.min(w, 1000);
        apply();
        call.resolve();
    }

    private void apply() {
        Activity a = getActivity();
        if (a == null) return;
        a.runOnUiThread(() -> {
            Window win = a.getWindow();
            Display d = display();
            if (win == null || d == null) return;
            float rate = want;
            int mode = 0;
            if (rate > 0) {
                // this screen's mode at its current size nearest the wish (within 1 Hz), if it has one
                Display.Mode cur = d.getMode();
                float best = 1;
                for (Display.Mode m : d.getSupportedModes()) {
                    float off = Math.abs(m.getRefreshRate() - rate);
                    if (sameSize(m, cur) && off < best) { best = off; mode = m.getModeId(); }
                }
            }
            WindowManager.LayoutParams lp = win.getAttributes();
            if (lp.preferredDisplayModeId != mode || lp.preferredRefreshRate != rate) {
                lp.preferredDisplayModeId = mode;
                lp.preferredRefreshRate = rate;
                win.setAttributes(lp);
            }
            if (Build.VERSION.SDK_INT >= 35 && getBridge() != null) {
                WebView v = getBridge().getWebView();
                if (v != null) v.setRequestedFrameRate(rate > 0 ? rate : View.REQUESTED_FRAME_RATE_CATEGORY_DEFAULT);
            }
        });
    }
}
