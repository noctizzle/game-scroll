package com.gamescroll.phonesensors;

import android.Manifest;
import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.HashMap;
import java.util.Map;

/**
 * Extra phone sensors for games (src/kit/sensors.js). Nothing is stored or sent anywhere: readings go
 * straight to the game being played, and every sensor stops when it leaves.
 *
 * available() -> { steps, pressure, light, near } (true where the phone has the sensor)
 * start({ kind }) -> starts one: 'steps' (asks for physical activity access on Android 10+),
 *   'pressure', 'light' or 'near'. Readings arrive as 'reading' events: { kind, value, max }.
 *   steps: steps since start; pressure: hPa; light: lux; near: centimetres (max = the sensor's range).
 * stop({ kind }) / stopAll()
 */
@CapacitorPlugin(name = "PhoneSensors", permissions = {
    @Permission(alias = "activity", strings = { Manifest.permission.ACTIVITY_RECOGNITION })
})
public class PhoneSensorsPlugin extends Plugin {
    private final Map<String, SensorEventListener> running = new HashMap<>();
    private final Map<String, Long> lastSent = new HashMap<>();
    private float stepBase = -1;

    private SensorManager sm() { return (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE); }
    private int typeOf(String kind) {
        switch (kind) {
            case "steps": return Sensor.TYPE_STEP_COUNTER;
            case "pressure": return Sensor.TYPE_PRESSURE;
            case "light": return Sensor.TYPE_LIGHT;
            case "near": return Sensor.TYPE_PROXIMITY;
            default: return -1;
        }
    }

    @PluginMethod
    public void available(PluginCall call) {
        SensorManager s = sm();
        JSObject o = new JSObject();
        for (String k : new String[] { "steps", "pressure", "light", "near" }) o.put(k, s != null && s.getDefaultSensor(typeOf(k)) != null);
        call.resolve(o);
    }

    @PluginMethod
    public void start(PluginCall call) {
        String kind = call.getString("kind", "");
        if (typeOf(kind) < 0) { call.reject("unknown sensor " + kind); return; }
        if (kind.equals("steps") && Build.VERSION.SDK_INT >= 29 && getPermissionState("activity") != PermissionState.GRANTED) {
            requestPermissionForAlias("activity", call, "activityAnswered");
            return;
        }
        begin(call, kind);
    }

    @PermissionCallback
    private void activityAnswered(PluginCall call) {
        if (getPermissionState("activity") == PermissionState.GRANTED) begin(call, "steps");
        else call.reject("not allowed");
    }

    private void begin(PluginCall call, String kind) {
        SensorManager s = sm();
        Sensor sensor = s == null ? null : s.getDefaultSensor(typeOf(kind));
        if (sensor == null) { call.reject("no " + kind + " sensor"); return; }
        if (running.containsKey(kind)) { call.resolve(); return; }
        final float max = sensor.getMaximumRange();
        if (kind.equals("steps")) stepBase = -1;
        SensorEventListener l = new SensorEventListener() {
            @Override public void onSensorChanged(SensorEvent e) {
                float v = e.values[0];
                if (kind.equals("steps")) { if (stepBase < 0) stepBase = v; v -= stepBase; }
                long now = System.currentTimeMillis();
                Long was = lastSent.get(kind);
                // light and pressure can change many times a second: a few readings a second is plenty
                if (!kind.equals("steps") && !kind.equals("near") && was != null && now - was < 100) return;
                lastSent.put(kind, now);
                JSObject o = new JSObject();
                o.put("kind", kind); o.put("value", v); o.put("max", max);
                notifyListeners("reading", o);
            }
            @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}
        };
        running.put(kind, l);
        s.registerListener(l, sensor, kind.equals("steps") ? SensorManager.SENSOR_DELAY_NORMAL : SensorManager.SENSOR_DELAY_UI);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) { end(call.getString("kind", "")); call.resolve(); }

    @PluginMethod
    public void stopAll(PluginCall call) { for (String k : running.keySet().toArray(new String[0])) end(k); call.resolve(); }

    private void end(String kind) {
        SensorEventListener l = running.remove(kind);
        SensorManager s = sm();
        if (l != null && s != null) s.unregisterListener(l);
    }

    @Override
    protected void handleOnPause() { for (String k : running.keySet().toArray(new String[0])) end(k); }
}
