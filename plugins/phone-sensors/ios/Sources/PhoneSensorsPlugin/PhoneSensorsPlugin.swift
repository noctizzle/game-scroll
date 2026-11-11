import Foundation
import Capacitor
import CoreMotion
import AVFoundation

/// Extra phone sensors for games (src/kit/sensors.js): steps (CMPedometer) and air pressure
/// (CMAltimeter). iPhones don't let apps read the room light, and proximity turns the screen off, so
/// those two report as unavailable (games fall back to touch). Nothing is stored or sent anywhere.
///
/// available() -> { steps, pressure, light: false, near: false }
/// start({ kind }) -> 'reading' events { kind, value, max }: steps since start; pressure in hPa
/// stop({ kind }) / stopAll()
/// output() -> { headphones, kind }: where the sound goes (src/kit/real.js). kind: 'wired', 'usb',
///   'bluetooth' (headphones or a speaker: iOS doesn't say which), 'airplay' or 'speaker'.
@objc(PhoneSensorsPlugin)
public class PhoneSensorsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhoneSensorsPlugin"
    public let jsName = "PhoneSensors"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "output", returnType: CAPPluginReturnPromise)
    ]
    private let pedometer = CMPedometer()
    private let altimeter = CMAltimeter()
    private var steps = false, pressure = false

    @objc func available(_ call: CAPPluginCall) {
        call.resolve(["steps": CMPedometer.isStepCountingAvailable(), "pressure": CMAltimeter.isRelativeAltitudeAvailable(), "light": false, "near": false])
    }

    @objc func start(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? ""
        switch kind {
        case "steps":
            guard CMPedometer.isStepCountingAvailable() else { call.reject("no steps sensor"); return }
            if steps { call.resolve(); return }
            steps = true
            // the first update tells us whether the player allowed motion and fitness access
            pedometer.startUpdates(from: Date()) { [weak self] data, error in
                guard let self = self else { return }
                if error != nil { self.steps = false; self.notifyListeners("refused", data: ["kind": "steps"]); return }
                if let d = data { self.notifyListeners("reading", data: ["kind": "steps", "value": d.numberOfSteps.intValue, "max": 0]) }
            }
            call.resolve()
        case "pressure":
            guard CMAltimeter.isRelativeAltitudeAvailable() else { call.reject("no pressure sensor"); return }
            if pressure { call.resolve(); return }
            pressure = true
            altimeter.startRelativeAltitudeUpdates(to: .main) { [weak self] data, error in
                guard let self = self, let d = data, error == nil else { return }
                self.notifyListeners("reading", data: ["kind": "pressure", "value": d.pressure.doubleValue * 10, "max": 0])   // kPa -> hPa
            }
            call.resolve()
        default:
            call.reject("no \(kind) sensor")
        }
    }

    @objc func output(_ call: CAPPluginCall) {
        var kind = "speaker"
        for o in AVAudioSession.sharedInstance().currentRoute.outputs {
            switch o.portType {
            case .headphones: kind = "wired"
            case .usbAudio: kind = "usb"
            case .bluetoothA2DP, .bluetoothLE, .bluetoothHFP: kind = "bluetooth"
            case .airPlay: kind = "airplay"
            default: break
            }
        }
        call.resolve(["headphones": kind == "wired" || kind == "usb" || kind == "bluetooth", "kind": kind])
    }

    @objc func stop(_ call: CAPPluginCall) { end(call.getString("kind") ?? ""); call.resolve() }
    @objc func stopAll(_ call: CAPPluginCall) { end("steps"); end("pressure"); call.resolve() }

    private func end(_ kind: String) {
        if kind == "steps" && steps { pedometer.stopUpdates(); steps = false }
        if kind == "pressure" && pressure { altimeter.stopRelativeAltitudeUpdates(); pressure = false }
    }
}
