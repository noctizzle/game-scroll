package com.gamescroll.powerstate;

import android.content.Context;
import android.os.Build;
import android.os.PowerManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * How warm the phone is and whether it's saving power, for frame generation's power saving
 * (src/kit/power.js): get() -> { platform: 'android', thermal, headroom, saver }.
 *
 * thermal: PowerManager's thermal status (Android 10+): 0 none, 1 light, 2 moderate, 3 severe,
 * 4 critical, 5 emergency, 6 shutdown; 0 on older phones. headroom: how close the phone is to slowing
 * itself down in the next 10 s (Android 11+; 1 = it will), -1 where it isn't known. saver: battery saver is on.
 */
@CapacitorPlugin(name = "PowerState")
public class PowerStatePlugin extends Plugin {
    @PluginMethod
    public void get(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        JSObject o = new JSObject();
        o.put("platform", "android");
        int thermal = 0;
        double headroom = -1;
        boolean saver = false;
        if (pm != null) {
            if (Build.VERSION.SDK_INT >= 29) thermal = pm.getCurrentThermalStatus();
            if (Build.VERSION.SDK_INT >= 30) {
                float h = pm.getThermalHeadroom(10);
                if (!Float.isNaN(h)) headroom = h;
            }
            saver = pm.isPowerSaveMode();
        }
        o.put("thermal", thermal);
        o.put("headroom", headroom);
        o.put("saver", saver);
        call.resolve(o);
    }
}
