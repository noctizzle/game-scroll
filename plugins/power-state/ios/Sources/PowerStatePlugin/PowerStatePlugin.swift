import Foundation
import Capacitor

/// How warm the phone is and whether it's saving power, for frame generation's power saving
/// (src/kit/power.js): get() -> { platform: 'ios', thermal, headroom: -1, saver }.
///
/// thermal: ProcessInfo's thermal state: 0 nominal, 1 fair, 2 serious, 3 critical. saver: Low Power Mode is on.
@objc(PowerStatePlugin)
public class PowerStatePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PowerStatePlugin"
    public let jsName = "PowerState"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise)
    ]

    @objc func get(_ call: CAPPluginCall) {
        let p = ProcessInfo.processInfo
        let thermal: Int
        switch p.thermalState {
        case .nominal: thermal = 0
        case .fair: thermal = 1
        case .serious: thermal = 2
        case .critical: thermal = 3
        @unknown default: thermal = 0
        }
        call.resolve(["platform": "ios", "thermal": thermal, "headroom": -1, "saver": p.isLowPowerModeEnabled])
    }
}
