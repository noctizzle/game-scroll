import Foundation
import Capacitor
import ARKit
import AVFoundation

/// Native AR for the AR · 3D games (src/kit/ar3d.js), using ARKit world tracking.
///
/// An ARSCNView draws the camera picture BEHIND the (see-through) WebView, and every frame the phone's
/// pose, the projection and the light estimate go to JavaScript as a "frame" event, where three.js draws
/// the game on top. Horizontal surfaces go out as a "planes" event a few times a second (with the
/// feature points ARKit is tracking, while the game asks for them with points({ on })), and hitTest()
/// finds where a screen point meets a real surface.
///
/// Same JS shape as the Android plugin: start() -> { started, reason? }, stop(), hitTest({ x, y }) (CSS
/// pixels, which are iOS points) -> { hits: [{ pose, kind, surface? }] } (nearest first), points({ on }),
/// available() -> { supported, installed, status }. Matrices are 16 floats, column-major, in metres.
/// Where the phone can tell what a surface is, planes carry "kind" and hits "surface": floor, table,
/// seat or other. A frame's "why" says why tracking is poor, in ARCore's words.
@objc(NativeARPlugin)
public class NativeARPlugin: CAPPlugin, CAPBridgedPlugin, ARSessionDelegate {
    public let identifier = "NativeARPlugin"
    public let jsName = "NativeAR"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hitTest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "points", returnType: CAPPluginReturnPromise)
    ]

    private var arView: ARSCNView?
    private var running = false
    private var frameNo = 0
    private var wantPoints = false
    private static let maxPoints = 240
    private static let maxHits = 4
    private var savedOpaque = true
    private var savedBackground: UIColor?
    private var savedScrollBackground: UIColor?

    @objc func available(_ call: CAPPluginCall) {
        let ok = ARWorldTrackingConfiguration.isSupported
        call.resolve(["supported": ok, "installed": ok, "status": ok ? "SUPPORTED_INSTALLED" : "UNSUPPORTED"])
    }

    @objc func start(_ call: CAPPluginCall) {
        guard ARWorldTrackingConfiguration.isSupported else {
            call.resolve(["started": false, "reason": "unsupported"])
            return
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            begin(call)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { ok in
                if ok { self.begin(call) } else { call.resolve(["started": false, "reason": "camera"]) }
            }
        default:
            call.resolve(["started": false, "reason": "camera"])
        }
    }

    private func begin(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let web = self.bridge?.webView, let parent = web.superview else {
                call.resolve(["started": false, "reason": "no-view"])
                return
            }
            let view = self.arView ?? ARSCNView(frame: web.frame)
            if self.arView == nil {
                view.automaticallyUpdatesLighting = false
                view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
                view.session.delegate = self
                self.arView = view
            }
            if view.superview == nil {
                view.frame = web.frame
                parent.insertSubview(view, belowSubview: web) // behind the page, which goes see-through
                self.savedOpaque = web.isOpaque
                self.savedBackground = web.backgroundColor
                self.savedScrollBackground = web.scrollView.backgroundColor
            }
            web.isOpaque = false
            web.backgroundColor = .clear
            web.scrollView.backgroundColor = .clear

            let cfg = ARWorldTrackingConfiguration()
            cfg.planeDetection = [.horizontal]
            cfg.isLightEstimationEnabled = true
            cfg.worldAlignment = .gravity
            view.session.run(cfg)   // keeps the room map between rounds, so the floor is found at once
            self.running = true
            self.frameNo = 0
            self.wantPoints = false
            call.resolve(["started": true])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.running = false
            self.wantPoints = false
            if let view = self.arView {
                view.session.pause()
                view.removeFromSuperview()
            }
            if let web = self.bridge?.webView {
                web.isOpaque = self.savedOpaque
                web.backgroundColor = self.savedBackground
                web.scrollView.backgroundColor = self.savedScrollBackground
            }
            call.resolve()
        }
    }

    /// Send the feature points ARKit is tracking with each "planes" event ({ on: true }), or stop.
    /// The game's floor search uses them, and turns them off once the floor is settled.
    @objc func points(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        DispatchQueue.main.async {
            self.wantPoints = on
            call.resolve()
        }
    }

    /// Where a point on the screen (CSS pixels = points) meets a real surface.
    @objc func hitTest(_ call: CAPPluginCall) {
        let x = call.getDouble("x") ?? 0, y = call.getDouble("y") ?? 0
        DispatchQueue.main.async {
            guard self.running, let view = self.arView else { call.resolve(["hits": [] as [Any]]); return }
            let pt = CGPoint(x: x, y: y)
            var hits: [[String: Any]] = []
            // mapped surfaces first: nearest first, and a few, so the floor search can look past a table top
            if let q = view.raycastQuery(from: pt, allowing: .existingPlaneGeometry, alignment: .horizontal) {
                for r in view.session.raycast(q).prefix(Self.maxHits) {
                    var h: [String: Any] = ["pose": Self.flat(r.worldTransform), "kind": "plane"]
                    if let a = r.anchor as? ARPlaneAnchor, let what = Self.surface(a) { h["surface"] = what }
                    hits.append(h)
                }
            }
            // nothing mapped there yet: ARKit's own estimate of a flat surface at that spot
            if hits.isEmpty, let q = view.raycastQuery(from: pt, allowing: .estimatedPlane, alignment: .horizontal),
               let r = view.session.raycast(q).first {
                hits.append(["pose": Self.flat(r.worldTransform), "kind": "point"])
            }
            call.resolve(["hits": hits])
        }
    }

    // MARK: ARSessionDelegate (main queue)

    public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard running, let view = arView else { return }
        let orient = view.window?.windowScene?.interfaceOrientation ?? .portrait
        let cam = frame.camera
        let pose = cam.viewMatrix(for: orient).inverse
        let proj = cam.projectionMatrix(for: orient, viewportSize: view.bounds.size, zNear: 0.05, zFar: 100)
        var why = Self.why(cam.trackingState)
        // ARKit has no "too dark" reason of its own: a dim picture with nothing to hold on to is that
        if why == "INSUFFICIENT_FEATURES", let le = frame.lightEstimate, le.ambientIntensity < 150 { why = "INSUFFICIENT_LIGHT" }
        var d: [String: Any] = [
            "t": frame.timestamp * 1000,
            "tracking": Self.tracking(cam.trackingState),
            "why": why,
            "pose": Self.flat(pose),
            "proj": Self.flat(proj)
        ]
        if let le = frame.lightEstimate {
            // ~1000 lumens is a normally lit room; the kit expects about 0.5 for that, as on Android.
            d["light"] = ["intensity": Double(le.ambientIntensity) / 2000, "color": Self.kelvin(Double(le.ambientColorTemperature))] as [String: Any]
        }
        notifyListeners("frame", data: d)
        frameNo += 1
        if frameNo % 20 == 1 { sendPlanes(frame) }
    }

    public func session(_ session: ARSession, didFailWithError error: Error) {
        notifyListeners("frame", data: ["tracking": "STOPPED", "error": error.localizedDescription])
    }

    private func sendPlanes(_ frame: ARFrame) {
        var list: [[String: Any]] = []
        for case let p as ARPlaneAnchor in frame.anchors where p.alignment == .horizontal {
            if ARPlaneAnchor.isClassificationSupported && p.classification == .ceiling { continue }
            var m = p.transform
            let c = p.center
            m = simd_mul(m, simd_float4x4(columns: (SIMD4(1, 0, 0, 0), SIMD4(0, 1, 0, 0), SIMD4(0, 0, 1, 0), SIMD4(c.x, c.y, c.z, 1))))
            var o: [String: Any] = ["id": p.identifier.uuidString, "pose": Self.flat(m), "w": p.extent.x, "d": p.extent.z]
            if let what = Self.surface(p) { o["kind"] = what }
            list.append(o)
        }
        var d: [String: Any] = ["planes": list]
        if wantPoints, case .normal = frame.camera.trackingState, let cloud = frame.rawFeaturePoints {
            // up to maxPoints of the feature points ARKit is tracking, as x, y, z, x, y, z... in millimetres
            let pts = cloud.points
            let step = max(1, (pts.count + Self.maxPoints - 1) / Self.maxPoints)
            var out: [Int] = []
            out.reserveCapacity((pts.count / step + 1) * 3)
            var i = 0
            while i < pts.count {
                let q = pts[i]
                if abs(q.x) < 100 && abs(q.y) < 100 && abs(q.z) < 100 {   // (also false for NaN and infinity)
                    out.append(Int((q.x * 1000).rounded()))
                    out.append(Int((q.y * 1000).rounded()))
                    out.append(Int((q.z * 1000).rounded()))
                }
                i += step
            }
            d["points"] = out
        }
        notifyListeners("planes", data: d)
    }

    /// What ARKit takes a horizontal surface for, on phones that can tell; nil when it can't or doesn't know.
    private static func surface(_ p: ARPlaneAnchor) -> String? {
        guard ARPlaneAnchor.isClassificationSupported else { return nil }
        switch p.classification {
        case .floor: return "floor"
        case .table: return "table"
        case .seat: return "seat"
        case .none: return nil
        default: return "other"
        }
    }

    /// Why tracking is poor, in ARCore's words, so the game shows the same help on both kinds of phone.
    private static func why(_ s: ARCamera.TrackingState) -> String {
        guard case .limited(let reason) = s else { return "NONE" }
        switch reason {
        case .excessiveMotion: return "EXCESSIVE_MOTION"
        case .insufficientFeatures: return "INSUFFICIENT_FEATURES"
        case .initializing: return "INITIALIZING"
        case .relocalizing: return "RELOCALIZING"
        @unknown default: return "NONE"
        }
    }

    private static func tracking(_ s: ARCamera.TrackingState) -> String {
        switch s {
        case .normal: return "TRACKING"
        case .limited: return "LIMITED"
        case .notAvailable: return "PAUSED"
        }
    }

    private static func flat(_ m: simd_float4x4) -> [Float] {
        let c = [m.columns.0, m.columns.1, m.columns.2, m.columns.3]
        return c.flatMap { [$0.x, $0.y, $0.z, $0.w] }
    }

    /// A rough colour for a light temperature (6500 K = white), scaled so green is 1 like ARCore's.
    private static func kelvin(_ k: Double) -> [Double] {
        let t = max(1000, min(40000, k)) / 100
        let r = t <= 66 ? 255 : 329.7 * pow(t - 60, -0.1332)
        let g = t <= 66 ? 99.47 * log(t) - 161.12 : 288.12 * pow(t - 60, -0.0755)
        let b = t >= 66 ? 255 : (t <= 19 ? 0 : 138.52 * log(t - 10) - 305.04)
        let gg = max(1, g)
        return [min(255, r) / gg, 1, max(0, min(255, b)) / gg]
    }
}
