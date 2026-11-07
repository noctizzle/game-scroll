import Foundation
import Capacitor
import ARKit
import AVFoundation

/// Native AR for the AR · 3D games (src/kit/ar3d.js), using ARKit world tracking.
///
/// An ARSCNView draws the camera picture BEHIND the (see-through) WebView, and every frame the phone's
/// pose, the projection and the light estimate go to JavaScript as a "frame" event, where three.js draws
/// the game on top. Horizontal surfaces go out as a "planes" event a few times a second, and hitTest()
/// finds where a screen point meets a real surface.
///
/// Same JS shape as the Android plugin: start() -> { started, reason? }, stop(), hitTest({ x, y }) (CSS
/// pixels, which are iOS points) -> { hits: [{ pose, kind }] }, available() -> { supported, installed, status }.
/// Matrices are 16 floats, column-major, in metres.
@objc(NativeARPlugin)
public class NativeARPlugin: CAPPlugin, CAPBridgedPlugin, ARSessionDelegate {
    public let identifier = "NativeARPlugin"
    public let jsName = "NativeAR"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hitTest", returnType: CAPPluginReturnPromise)
    ]

    private var arView: ARSCNView?
    private var running = false
    private var frameNo = 0
    private var savedOpaque = true
    private var savedBackground: UIColor?

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
            }
            web.isOpaque = false
            web.backgroundColor = .clear
            web.scrollView.backgroundColor = .clear

            let cfg = ARWorldTrackingConfiguration()
            cfg.planeDetection = [.horizontal]
            cfg.isLightEstimationEnabled = true
            cfg.worldAlignment = .gravity
            view.session.run(cfg, options: self.running ? [] : [.resetTracking, .removeExistingAnchors])
            self.running = true
            self.frameNo = 0
            call.resolve(["started": true])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.running = false
            if let view = self.arView {
                view.session.pause()
                view.removeFromSuperview()
            }
            if let web = self.bridge?.webView {
                web.isOpaque = self.savedOpaque
                web.backgroundColor = self.savedBackground
            }
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
            for target in [ARRaycastQuery.Target.existingPlaneGeometry, .estimatedPlane] {
                guard let q = view.raycastQuery(from: pt, allowing: target, alignment: .horizontal),
                      let r = view.session.raycast(q).first else { continue }
                hits.append(["pose": Self.flat(r.worldTransform), "kind": target == .estimatedPlane ? "point" : "plane"])
                break
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
        var d: [String: Any] = [
            "t": frame.timestamp * 1000,
            "tracking": Self.tracking(cam.trackingState),
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
            list.append(["id": p.identifier.uuidString, "pose": Self.flat(m), "w": p.extent.x, "d": p.extent.z])
        }
        notifyListeners("planes", data: ["planes": list])
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
