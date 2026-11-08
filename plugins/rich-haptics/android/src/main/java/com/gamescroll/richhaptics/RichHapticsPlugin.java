package com.gamescroll.richhaptics;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/**
 * Rich haptics for Game Scroll games (gs.device.feel in src/kit/device.js).
 *
 * Same JS shape as the iPhone plugin: play({ events: [{ at, len, strength, sharpness, to? }] }) with at
 * and len in seconds, strength and sharpness 0..1; stop(); supported() -> { supported, amplitude, primitives }.
 *
 * Short taps use the phone's haptic primitives where it has them (Android 12+: sharp = CLICK or TICK,
 * soft = THUD), and buzzes become a waveform of 10 ms steps with the vibrator's amplitude control, so
 * fades and swells work. Phones without amplitude control get plain on/off buzzes.
 */
@CapacitorPlugin(name = "RichHaptics")
public class RichHapticsPlugin extends Plugin {
    private static final int STEP = 10;   // ms per waveform step
    private Vibrator vib;

    @Override
    public void load() {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= 31) {
            VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            vib = vm != null ? vm.getDefaultVibrator() : null;
        } else {
            vib = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
        }
    }

    private boolean primitives() {
        if (vib == null || Build.VERSION.SDK_INT < 31) return false;   // THUD arrived in Android 12
        return vib.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_CLICK, VibrationEffect.Composition.PRIMITIVE_TICK, VibrationEffect.Composition.PRIMITIVE_THUD);
    }

    @PluginMethod
    public void supported(PluginCall call) {
        JSObject r = new JSObject();
        boolean has = vib != null && vib.hasVibrator();
        r.put("supported", has);
        r.put("amplitude", has && vib.hasAmplitudeControl());
        r.put("primitives", has && primitives());
        call.resolve(r);
    }

    private static double num(JSONObject o, String k, double d) { return o.has(k) ? o.optDouble(k, d) : d; }
    private static double clamp(double v, double lo, double hi) { return Math.max(lo, Math.min(hi, v)); }

    @PluginMethod
    public void play(PluginCall call) {
        JSObject res = new JSObject();
        if (vib == null || !vib.hasVibrator()) { res.put("played", false); call.resolve(res); return; }
        JSArray list = call.getArray("events", new JSArray());
        List<JSONObject> events = new ArrayList<>();
        for (int i = 0; i < Math.min(64, list.length()); i++) { JSONObject o = list.optJSONObject(i); if (o != null) events.add(o); }
        if (events.isEmpty()) { res.put("played", false); call.resolve(res); return; }

        // all taps and no buzzes, on a phone with primitives: one composition (the crispest feel)
        boolean taps = true;
        for (JSONObject e : events) if (num(e, "len", 0) >= 0.02) { taps = false; break; }
        try {
            if (taps && primitives()) {
                VibrationEffect.Composition comp = VibrationEffect.startComposition();
                events.sort((a, b) -> Double.compare(num(a, "at", 0), num(b, "at", 0)));
                double last = 0;
                for (JSONObject e : events) {
                    double at = clamp(num(e, "at", 0), 0, 10), sharp = clamp(num(e, "sharpness", .5), 0, 1);
                    float s = (float) clamp(num(e, "strength", 1), 0, 1);
                    int prim = sharp > .7 ? VibrationEffect.Composition.PRIMITIVE_CLICK : sharp > .35 ? VibrationEffect.Composition.PRIMITIVE_TICK : VibrationEffect.Composition.PRIMITIVE_THUD;
                    comp.addPrimitive(prim, s, (int) Math.round((at - last) * 1000));
                    last = at;
                }
                vib.vibrate(comp.compose());
                res.put("played", true); call.resolve(res); return;
            }
            // otherwise: a waveform in 10 ms steps, each step the loudest event playing then
            double end = 0;
            for (JSONObject e : events) end = Math.max(end, clamp(num(e, "at", 0), 0, 10) + Math.max(.03, clamp(num(e, "len", 0), 0, 10)));
            int n = (int) Math.ceil(end * 1000 / STEP);
            int[] amp = new int[n];
            for (JSONObject e : events) {
                double at = clamp(num(e, "at", 0), 0, 10), len = Math.max(.03, clamp(num(e, "len", 0), 0, 10));
                double s = clamp(num(e, "strength", 1), 0, 1), to = e.has("to") ? clamp(num(e, "to", s), 0, 1) : s;
                int a = (int) (at * 1000 / STEP), b = Math.min(n, (int) Math.ceil((at + len) * 1000 / STEP));
                for (int k = a; k < b; k++) {
                    double f = b - a > 1 ? (k - a) / (double) (b - a - 1) : 0, v = s + (to - s) * f;
                    amp[k] = Math.max(amp[k], (int) Math.round(v * 255));
                }
            }
            long[] timings = new long[n];
            for (int k = 0; k < n; k++) timings[k] = STEP;
            if (vib.hasAmplitudeControl()) {
                vib.vibrate(VibrationEffect.createWaveform(timings, amp, -1));
            } else {
                // on/off only: merge steps into runs of "on" and "off"
                List<Long> runs = new ArrayList<>();   // off, on, off, on... starting with how long to wait
                boolean on = false; long cur = 0;
                for (int k = 0; k < n; k++) {
                    boolean v = amp[k] > 40;
                    if (v != on) { runs.add(cur); cur = 0; on = v; }
                    cur += STEP;
                }
                runs.add(cur);
                long[] pat = new long[runs.size()];
                for (int k = 0; k < pat.length; k++) pat[k] = runs.get(k);
                vib.vibrate(VibrationEffect.createWaveform(pat, -1));
            }
            res.put("played", true);
        } catch (Exception ex) {
            res.put("played", false); res.put("reason", String.valueOf(ex.getMessage()));
        }
        call.resolve(res);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (vib != null) vib.cancel();
        call.resolve();
    }
}
