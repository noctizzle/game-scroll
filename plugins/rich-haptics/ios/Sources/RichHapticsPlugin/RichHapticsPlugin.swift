import Foundation
import Capacitor
import CoreHaptics

/// Rich haptics for Game Scroll games (gs.device.feel in src/kit/device.js), using Core Haptics.
///
/// play({ events: [{ at, len, strength, sharpness, to? }] }): at and len in seconds, strength and
/// sharpness 0..1. An event with len 0 is a single tap (transient); a longer one is a steady buzz
/// (continuous) that can fade or swell to strength `to` by its end. stop() ends whatever is playing.
/// supported() -> { supported } (false on phones without a Taptic Engine, and on iPads).
@objc(RichHapticsPlugin)
public class RichHapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RichHapticsPlugin"
    public let jsName = "RichHaptics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "supported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private var engine: CHHapticEngine?
    private var player: CHHapticAdvancedPatternPlayer?

    private var canPlay: Bool { CHHapticEngine.capabilitiesForHardware().supportsHaptics }

    private func readyEngine() throws -> CHHapticEngine {
        if let e = engine { return e }
        let e = try CHHapticEngine()
        e.playsHapticsOnly = true
        e.isAutoShutdownEnabled = true
        // the engine stops when the app goes to the background; start it again on the next play
        e.stoppedHandler = { [weak self] _ in self?.engine = nil; self?.player = nil }
        e.resetHandler = { [weak self] in self?.engine = nil; self?.player = nil }
        try e.start()
        engine = e
        return e
    }

    @objc func supported(_ call: CAPPluginCall) {
        call.resolve(["supported": canPlay])
    }

    @objc func play(_ call: CAPPluginCall) {
        guard canPlay else { call.resolve(["played": false]); return }
        let list = call.getArray("events", JSObject.self) ?? []
        var events: [CHHapticEvent] = []
        var curves: [CHHapticParameterCurve] = []
        for ev in list.prefix(64) {
            let at = max(0, min(10, (ev["at"] as? Double) ?? 0))
            let len = max(0, min(10, (ev["len"] as? Double) ?? 0))
            let strength = Float(max(0, min(1, (ev["strength"] as? Double) ?? 1)))
            let sharpness = Float(max(0, min(1, (ev["sharpness"] as? Double) ?? 0.5)))
            let params = [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: strength),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness)
            ]
            if len < 0.02 {
                events.append(CHHapticEvent(eventType: .hapticTransient, parameters: params, relativeTime: at))
            } else {
                events.append(CHHapticEvent(eventType: .hapticContinuous, parameters: params, relativeTime: at, duration: len))
                if let to = ev["to"] as? Double {
                    // a fade or swell over the buzz: the curve scales its intensity from 1 to to/strength
                    let end = Float(max(0, min(1, to))) / max(strength, 0.01)
                    curves.append(CHHapticParameterCurve(parameterID: .hapticIntensityControl, controlPoints: [
                        CHHapticParameterCurve.ControlPoint(relativeTime: 0, value: 1),
                        CHHapticParameterCurve.ControlPoint(relativeTime: len, value: min(1, end))
                    ], relativeTime: at))
                }
            }
        }
        guard !events.isEmpty else { call.resolve(["played": false]); return }
        do {
            let e = try readyEngine()
            try player?.stop(atTime: CHHapticTimeImmediate)
            let pattern = try CHHapticPattern(events: events, parameterCurves: curves)
            let p = try e.makeAdvancedPlayer(with: pattern)
            player = p
            try p.start(atTime: CHHapticTimeImmediate)
            call.resolve(["played": true])
        } catch {
            engine = nil; player = nil
            call.resolve(["played": false, "reason": error.localizedDescription])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        try? player?.stop(atTime: CHHapticTimeImmediate)
        player = nil
        call.resolve()
    }
}
