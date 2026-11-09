import Foundation
import Capacitor
import AVFoundation
import CryptoKit
import OnnxRuntimeBindings

/// The phone's AI chip for Game Scroll (src/kit/npu.js): face and hand tracking and sound recognition
/// run here, in ONNX Runtime with its Core ML execution provider, so the models run on the Neural Engine
/// (and the CPU for any step it can't do). The GPU is left to the game. The front camera and the mic are
/// read here too, so pictures and sound never go through the web view: JavaScript asks for a crop of the
/// newest picture to be run through a model and gets the model's numbers back (base64 little-endian float32s).
///
///   available() -> { available, backend: 'coreml', chip }
///   loadModel({ name, version, url, sha256 }) -> { loaded, backend, reason? }   (downloads once, from our games host only)
///   cameraStart({ width, height }) -> { started, w, h, reason? }; cameraStop()
///   frame({ after }) -> { id, w, h }   holds the newest upright picture (id -1 if none yet)
///   runImage({ model, frame, rect: { cx, cy, w, h, a }, size, lo, hi }) -> { outputs: [base64] }
///   runTensor({ model, data }) -> { outputs }
///   micStart({ rate }) -> { started }; micStop(); runMic({ model, samples }) -> { outputs }
///
/// Pictures are upright and NOT mirrored (as the camera sees), like the web camera's frames and Android's.
@objc(NPUPlugin)
public class NPUPlugin: CAPPlugin, CAPBridgedPlugin, AVCaptureVideoDataOutputSampleBufferDelegate {
    public let identifier = "NPUPlugin"
    public let jsName = "NPU"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadModel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "runTensor", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cameraStart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cameraStop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "frame", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "runImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "micStart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "micStop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "runMic", returnType: CAPPluginReturnPromise)
    ]

    private static let hosts = ["assets.game-scroll.com"]
    private let work = DispatchQueue(label: "gamescroll.npu.models")     // the models, one at a time
    private let camQueue = DispatchQueue(label: "gamescroll.npu.camera")
    private var env: ORTEnv?
    private var sessions: [String: ORTSession] = [:]
    private var outputNames: [String: [String]] = [:]
    private var inputShapes: [String: [NSNumber]] = [:]
    private var backends: [String: String] = [:]

    // ------------------------------------------------------------------ models

    private static func chip() -> String {
        var s = utsname(); uname(&s)
        return withUnsafePointer(to: &s.machine) { $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) } }
    }

    @objc func available(_ call: CAPPluginCall) {
        call.resolve(["available": true, "backend": "coreml", "chip": NPUPlugin.chip()])
    }

    @objc func loadModel(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? "", version = call.getString("version") ?? "", url = call.getString("url") ?? "", sha = call.getString("sha256") ?? ""
        guard name.range(of: "^[a-z0-9-]+$", options: .regularExpression) != nil,
              version.range(of: "^[a-z0-9.-]+$", options: .regularExpression) != nil,
              sha.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil else { call.reject("bad name"); return }
        work.async {
            do {
                if self.sessions[name] == nil {
                    let file = try self.fetch(name: name, version: version, url: url, sha: sha)
                    try self.open(name: name, file: file)
                }
                call.resolve(["loaded": true, "backend": self.backends[name] ?? "cpu"])
            } catch {
                CAPLog.print("NPU load \(name): \(error)")
                call.resolve(["loaded": false, "reason": error.localizedDescription])
            }
        }
    }

    private struct Failure: LocalizedError { let errorDescription: String?; init(_ s: String) { errorDescription = s } }

    // The model file: from the app's own files (dev builds) or downloaded once from our games host.
    // Either way it must have the SHA-256 the app was built with (src/kit/npu-files.js), so a changed
    // file on the host is never run.
    private static func sha256(_ d: Data) -> String { SHA256.hash(data: d).map { String(format: "%02x", $0) }.joined() }
    private func fetch(name: String, version: String, url: String, sha: String) throws -> URL {
        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let dir = support.appendingPathComponent("npu/\(version)", isDirectory: true)
        let file = dir.appendingPathComponent("\(name).onnx")
        if let have = try? Data(contentsOf: file), NPUPlugin.sha256(have) == sha { return file }
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        guard let u = URL(string: url) else { throw Failure("bad url") }
        let data: Data
        if u.scheme == "https", let host = u.host?.lowercased(), NPUPlugin.hosts.contains(host) || host.hasSuffix(".r2.dev") {
            data = try download(u)
        } else if u.path.hasPrefix("/ml/"), let res = Bundle.main.resourceURL {
            data = try Data(contentsOf: res.appendingPathComponent("public" + u.path))   // served with the app (no games host)
        } else { throw Failure("not our host: \(u.host ?? "")") }
        guard NPUPlugin.sha256(data) == sha else { throw Failure("\(name) is not the file the app expects") }
        try data.write(to: file, options: .atomic)
        var keep = file; var v = URLResourceValues(); v.isExcludedFromBackup = true; try? keep.setResourceValues(v)
        return file
    }
    private func download(_ u: URL) throws -> Data {
        let done = DispatchSemaphore(value: 0)
        var result: Result<Data, Error> = .failure(Failure("timed out"))
        var req = URLRequest(url: u); req.timeoutInterval = 30
        URLSession.shared.dataTask(with: req) { data, resp, err in
            if let err = err { result = .failure(err) }
            else if let code = (resp as? HTTPURLResponse)?.statusCode, code != 200 { result = .failure(Failure("download \(code)")) }
            else if let data = data { result = .success(data) }
            done.signal()
        }.resume()
        _ = done.wait(timeout: .now() + 60)
        return try result.get()
    }

    // Core ML on the Neural Engine (and the CPU), as an ML Program, compiled once and kept in the
    // cache folder so later starts are quick. If Core ML won't take the model: ONNX Runtime on the CPU.
    private func open(name: String, file: URL) throws {
        if env == nil { env = try ORTEnv(loggingLevel: .warning) }
        guard let env = env else { return }
        let cache = (try? FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true))?.appendingPathComponent("npu-coreml", isDirectory: true)
        if let cache = cache { try? FileManager.default.createDirectory(at: cache, withIntermediateDirectories: true) }
        var session: ORTSession?
        do {
            let o = try ORTSessionOptions()
            var opts: [String: String] = ["MLComputeUnits": "CPUAndNeuralEngine", "ModelFormat": "MLProgram", "RequireStaticInputShapes": "1"]
            if let cache = cache { opts["ModelCacheDirectory"] = cache.path }
            try o.appendCoreMLExecutionProvider(withOptionsV2: opts)
            session = try ORTSession(env: env, modelPath: file.path, sessionOptions: o)
            backends[name] = "coreml"
        } catch {
            CAPLog.print("NPU: Core ML did not take \(name), using the CPU: \(error)")
            let o = try ORTSessionOptions()
            try o.setIntraOpNumThreads(2)
            session = try ORTSession(env: env, modelPath: file.path, sessionOptions: o)
            backends[name] = "cpu"
        }
        guard let s = session else { throw Failure("no session") }
        sessions[name] = s
        // out0, out1... in order
        outputNames[name] = (try s.outputNames()).sorted { (Int($0.dropFirst(3)) ?? 0) < (Int($1.dropFirst(3)) ?? 0) }
    }

    private func run(_ model: String, _ data: NSMutableData, _ shape: [NSNumber]) throws -> [String: Any] {
        guard let s = sessions[model], let names = outputNames[model] else { throw Failure("not loaded: \(model)") }
        let input = try ORTValue(tensorData: data, elementType: .float, shape: shape)
        let out = try s.run(withInputs: ["input": input], outputNames: Set(names), runOptions: nil)
        var outs: [String] = []
        for n in names {
            guard let v = out[n] else { break }
            let d = try v.tensorData() as Data
            outs.append(d.base64EncodedString())   // the phone is little-endian, as JavaScript expects
        }
        return ["outputs": outs]
    }

    @objc func runTensor(_ call: CAPPluginCall) {
        let model = call.getString("model") ?? "", b64 = call.getString("data") ?? ""
        work.async {
            do {
                guard let d = Data(base64Encoded: b64) else { throw Failure("bad data") }
                let shape = try self.inputShape(model, count: d.count / 4)
                call.resolve(try self.run(model, NSMutableData(data: d), shape))
            } catch { call.reject(error.localizedDescription) }
        }
    }
    // The input's shape, from the model; a free size (-1) takes up the rest of the numbers given.
    private func inputShape(_ model: String, count: Int) throws -> [NSNumber] {
        if let s = inputShapes[model] { return s }
        guard sessions[model] != nil else { throw Failure("not loaded: \(model)") }
        // ONNX Runtime's Objective-C API doesn't list input shapes; our models' tensor inputs are flat
        // except the blendshape model, which takes 146 (x, y) points.
        let shape: [NSNumber] = model == "face-shapes" ? [1, NSNumber(value: count / 2), 2] : [NSNumber(value: count)]
        inputShapes[model] = shape
        return shape
    }

    // ------------------------------------------------------------------ camera

    private var capture: AVCaptureSession?
    private let frameLock = NSLock()
    private var latest: [UInt8]?, held: [UInt8]?     // upright BGRA pictures
    private var latestW = 0, latestH = 0, latestId = -1, heldW = 0, heldH = 0, heldId = -1, nextId = 0

    @objc func cameraStart(_ call: CAPPluginCall) {
        AVCaptureDevice.requestAccess(for: .video) { granted in
            guard granted else { call.resolve(["started": false, "reason": "permission"]); return }
            self.camQueue.async { self.beginCamera(call) }
        }
    }

    private func beginCamera(_ call: CAPPluginCall) {
        if capture?.isRunning == true { reportStart(call); return }
        guard let dev = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
              let input = try? AVCaptureDeviceInput(device: dev) else { call.resolve(["started": false, "reason": "no camera"]); return }
        let s = AVCaptureSession()
        s.beginConfiguration()
        s.sessionPreset = .vga640x480
        guard s.canAddInput(input) else { call.resolve(["started": false, "reason": "camera busy"]); return }
        s.addInput(input)
        let out = AVCaptureVideoDataOutput()
        out.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        out.alwaysDiscardsLateVideoFrames = true
        out.setSampleBufferDelegate(self, queue: camQueue)
        guard s.canAddOutput(out) else { call.resolve(["started": false, "reason": "camera busy"]); return }
        s.addOutput(out)
        if let c = out.connection(with: .video) {
            if #available(iOS 17.0, *) { if c.isVideoRotationAngleSupported(90) { c.videoRotationAngle = 90 } }
            else if c.isVideoOrientationSupported { c.videoOrientation = .portrait }
            if c.isVideoMirroringSupported { c.automaticallyAdjustsVideoMirroring = false; c.isVideoMirrored = false }
        }
        s.commitConfiguration()
        s.startRunning()
        capture = s
        reportStart(call)
    }
    // the first picture tells the upright size
    private func reportStart(_ call: CAPPluginCall) {
        let until = Date().addingTimeInterval(3)
        DispatchQueue.global().async {
            while Date() < until {
                self.frameLock.lock(); let have = self.latest != nil; self.frameLock.unlock()
                if have { break }
                Thread.sleep(forTimeInterval: 0.02)
            }
            self.frameLock.lock(); defer { self.frameLock.unlock() }
            var r: [String: Any] = ["started": self.latest != nil, "w": self.latestW, "h": self.latestH]
            if self.latest == nil { r["reason"] = "no pictures" }
            call.resolve(r)
        }
    }

    public func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pb = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        CVPixelBufferLockBaseAddress(pb, .readOnly); defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(pb) else { return }
        let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb), row = CVPixelBufferGetBytesPerRow(pb)
        var px = [UInt8](repeating: 0, count: w * h * 4)
        px.withUnsafeMutableBytes { dst in
            for y in 0..<h { memcpy(dst.baseAddress! + y * w * 4, base + y * row, w * 4) }
        }
        frameLock.lock(); latest = px; latestW = w; latestH = h; latestId = nextId; nextId += 1; frameLock.unlock()
    }

    @objc func cameraStop(_ call: CAPPluginCall) {
        camQueue.async {
            self.capture?.stopRunning(); self.capture = nil
            self.frameLock.lock(); self.latest = nil; self.held = nil; self.latestId = -1; self.heldId = -1; self.frameLock.unlock()
            call.resolve()
        }
    }

    @objc func frame(_ call: CAPPluginCall) {
        let after = call.getInt("after") ?? -1
        frameLock.lock(); defer { frameLock.unlock() }
        if latest != nil && latestId > after { held = latest; heldW = latestW; heldH = latestH; heldId = latestId }
        call.resolve(["id": latestId > after ? heldId : -1, "w": heldW, "h": heldH])
    }

    @objc func runImage(_ call: CAPPluginCall) {
        let model = call.getString("model") ?? ""
        let rect = call.getObject("rect") ?? [:]
        let size = call.getInt("size") ?? 128
        let lo = Float(call.getDouble("lo") ?? 0), hi = Float(call.getDouble("hi") ?? 1)
        frameLock.lock(); let px = held, W = heldW, H = heldH; frameLock.unlock()
        guard let pic = px else { call.reject("no picture"); return }
        func num(_ k: String, _ d: Double) -> Double { (rect[k] as? NSNumber)?.doubleValue ?? d }
        let cx = num("cx", Double(W) / 2), cy = num("cy", Double(H) / 2), rw = num("w", Double(W)), rh = num("h", Double(H)), a = num("a", 0)
        work.async {
            do {
                let t = NPUPlugin.crop(pic, W, H, cx, cy, rw, rh, a, size, lo, hi)
                call.resolve(try self.run(model, t, [1, NSNumber(value: size), NSNumber(value: size), 3]))
            } catch { call.reject(error.localizedDescription) }
        }
    }

    // The same crop as src/kit/vision-npu.js cropToTensor: the rect's square, sampled bilinearly, black outside.
    static func crop(_ px: [UInt8], _ W: Int, _ H: Int, _ cx: Double, _ cy: Double, _ rw: Double, _ rh: Double, _ a: Double, _ size: Int, _ lo: Float, _ hi: Float) -> NSMutableData {
        let out = NSMutableData(length: size * size * 3 * 4)!
        let f = out.mutableBytes.assumingMemoryBound(to: Float.self)
        let c = cos(a), s = sin(a), k = Double(hi - lo) / 255
        px.withUnsafeBufferPointer { p in
            func at(_ x: Int, _ y: Int, _ ch: Int) -> Double { (x < 0 || y < 0 || x >= W || y >= H) ? 0 : Double(p[(y * W + x) * 4 + ch]) }
            var i = 0
            for v in 0..<size {
                for u in 0..<size {
                    let x0 = ((Double(u) + 0.5) / Double(size) - 0.5) * rw, y0 = ((Double(v) + 0.5) / Double(size) - 0.5) * rh
                    let x = cx + x0 * c - y0 * s - 0.5, y = cy + x0 * s + y0 * c - 0.5
                    let ix = Int(floor(x)), iy = Int(floor(y)), fx = x - Double(ix), fy = y - Double(iy)
                    for ch in [2, 1, 0] {   // BGRA: R, G, B
                        let val = at(ix, iy, ch) * (1 - fx) * (1 - fy) + at(ix + 1, iy, ch) * fx * (1 - fy) + at(ix, iy + 1, ch) * (1 - fx) * fy + at(ix + 1, iy + 1, ch) * fx * fy
                        f[i] = Float(Double(lo) + val * k); i += 1
                    }
                }
            }
        }
        return out
    }

    // ------------------------------------------------------------------ mic

    private let audio = AVAudioEngine()
    private var converter: AVAudioConverter?
    private var ring = [Float](repeating: 0, count: 16000 * 2)
    private var ringAt = 0
    private let ringLock = NSLock()
    private var micOn = false
    private var oldSession: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?

    @objc func micStart(_ call: CAPPluginCall) {
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            DispatchQueue.main.async {
                guard granted else { call.resolve(["started": false]); return }
                do { try self.beginMic(); call.resolve(["started": true]) }
                catch { CAPLog.print("NPU mic: \(error)"); self.endMic(); call.resolve(["started": false]) }
            }
        }
    }

    private func beginMic() throws {
        if micOn { return }
        let session = AVAudioSession.sharedInstance()
        if oldSession == nil { oldSession = (session.category, session.mode, session.categoryOptions) }
        // play and record together, mixed with the game's own sounds, out of the speaker
        try session.setCategory(.playAndRecord, mode: .measurement, options: [.mixWithOthers, .defaultToSpeaker, .allowBluetooth])
        try session.setActive(true, options: [])
        let input = audio.inputNode, from = input.outputFormat(forBus: 0)
        guard let to = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false),
              let conv = AVAudioConverter(from: from, to: to) else { throw Failure("no converter") }
        converter = conv
        input.installTap(onBus: 0, bufferSize: 4096, format: from) { [weak self] buf, _ in
            guard let self = self, let conv = self.converter else { return }
            let cap = AVAudioFrameCount(Double(buf.frameLength) * 16000 / from.sampleRate) + 16
            guard let o = AVAudioPCMBuffer(pcmFormat: to, frameCapacity: cap) else { return }
            var given = false
            conv.convert(to: o, error: nil) { _, status in
                if given { status.pointee = .noDataNow; return nil }
                given = true; status.pointee = .haveData; return buf
            }
            guard let ch = o.floatChannelData?[0] else { return }
            let n = Int(o.frameLength)
            self.ringLock.lock()
            for i in 0..<n { self.ring[self.ringAt] = ch[i]; self.ringAt = (self.ringAt + 1) % self.ring.count }
            self.ringLock.unlock()
        }
        audio.prepare()
        try audio.start()
        micOn = true
    }

    private func endMic() {
        if audio.isRunning { audio.stop() }
        audio.inputNode.removeTap(onBus: 0)
        converter = nil; micOn = false
        if let old = oldSession {
            try? AVAudioSession.sharedInstance().setCategory(old.0, mode: old.1, options: old.2)
            oldSession = nil
        }
    }

    @objc func micStop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.endMic(); call.resolve() }
    }

    @objc func runMic(_ call: CAPPluginCall) {
        let model = call.getString("model") ?? "yamnet"
        let n = min(call.getInt("samples") ?? 15600, ring.count)
        guard micOn else { call.reject("mic is off"); return }
        let d = NSMutableData(length: n * 4)!
        let f = d.mutableBytes.assumingMemoryBound(to: Float.self)
        ringLock.lock()
        for i in 0..<n { f[i] = ring[(ringAt - n + i + ring.count) % ring.count] }
        ringLock.unlock()
        work.async {
            do { call.resolve(try self.run(model, d, [NSNumber(value: n)])) } catch { call.reject(error.localizedDescription) }
        }
    }
}
