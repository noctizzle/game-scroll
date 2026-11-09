import Foundation
import Capacitor
import Speech
import AVFoundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Game Scroll's on-device smarts (src/kit/hear.js Voice, src/kit/phoneai.js PhoneAI).
///
/// Speech: Apple's recogniser with requiresOnDeviceRecognition, so what the player says never leaves
/// the phone. Where on-device recognition isn't supported for the language, speechAvailable is false
/// and games use their touch controls instead.
///   speechAvailable({ language }) -> { available }
///   speechStart({ language, words }) -> { started }; events 'speech' { text, final } and 'speechEnd' {}
///   speechStop()
///
/// Language model: Apple Foundation Models (iOS 26+, Apple Intelligence on), where the phone has it.
///   modelAvailable() -> { available, status }
///   modelAsk({ prompt, instructions, maxTokens, temperature }) -> { text } (null when it couldn't answer)
@objc(PhoneAIPlugin)
public class PhoneAIPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhoneAIPlugin"
    public let jsName = "PhoneAI"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "speechAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speechStart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speechStop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "modelAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "modelAsk", returnType: CAPPluginReturnPromise)
    ]

    private let audio = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var recognizer: SFSpeechRecognizer?
    private var oldSession: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?

    // ------------------------------------------------------------------ speech

    private func onDevice(_ language: String) -> SFSpeechRecognizer? {
        guard let r = SFSpeechRecognizer(locale: Locale(identifier: language)), r.supportsOnDeviceRecognition, r.isAvailable else { return nil }
        return r
    }

    @objc func speechAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": onDevice(call.getString("language") ?? "en-GB") != nil])
    }

    @objc func speechStart(_ call: CAPPluginCall) {
        let language = call.getString("language") ?? "en-GB"
        let words = (call.getArray("words", String.self) ?? []).prefix(100).map { $0 }
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else { call.resolve(["started": false]); return }
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                DispatchQueue.main.async {
                    guard granted, let r = self.onDevice(language) else { call.resolve(["started": false]); return }
                    do {
                        try self.begin(r, words: Array(words))
                        call.resolve(["started": true])
                    } catch {
                        self.finish()
                        call.resolve(["started": false])
                    }
                }
            }
        }
    }

    private func begin(_ r: SFSpeechRecognizer, words: [String]) throws {
        finish()
        let session = AVAudioSession.sharedInstance()
        if oldSession == nil { oldSession = (session.category, session.mode, session.categoryOptions) }
        // play and record together, mixed with the game's own sounds, out of the speaker
        try session.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .defaultToSpeaker, .allowBluetooth])
        try session.setActive(true, options: [])
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        req.requiresOnDeviceRecognition = true
        if #available(iOS 16.0, *) { req.addsPunctuation = false }
        if !words.isEmpty { req.contextualStrings = words }
        let input = audio.inputNode
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in req.append(buffer) }
        audio.prepare()
        try audio.start()
        request = req
        recognizer = r
        task = r.recognitionTask(with: req) { [weak self] result, error in
            guard let self = self else { return }
            if let result = result {
                self.notifyListeners("speech", data: ["text": result.bestTranscription.formattedString, "final": result.isFinal])
            }
            if error != nil || (result?.isFinal ?? false) {
                DispatchQueue.main.async { self.finish(); self.notifyListeners("speechEnd", data: [:]) }
            }
        }
    }

    private func finish() {
        if audio.isRunning { audio.stop() }
        audio.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        task = nil; request = nil; recognizer = nil
        if let old = oldSession {
            try? AVAudioSession.sharedInstance().setCategory(old.0, mode: old.1, options: old.2)
            oldSession = nil
        }
    }

    @objc func speechStop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.finish(); call.resolve() }
    }

    // ------------------------------------------------------------------ language model

    @objc func modelAvailable(_ call: CAPPluginCall) {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                call.resolve(["available": true, "status": "available"]); return
            default:
                call.resolve(["available": false, "status": "unavailable"]); return
            }
        }
        #endif
        call.resolve(["available": false, "status": "unavailable"])
    }

    @objc func modelAsk(_ call: CAPPluginCall) {
        let prompt = call.getString("prompt") ?? ""
        let instructions = call.getString("instructions") ?? ""
        let maxTokens = max(8, min(256, call.getInt("maxTokens") ?? 80))
        let temperature = max(0, min(1.5, call.getDouble("temperature") ?? 0.8))
        guard !prompt.isEmpty else { call.resolve(["text": NSNull()]); return }
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            guard case .available = SystemLanguageModel.default.availability else { call.resolve(["text": NSNull()]); return }
            Task {
                do {
                    let session = instructions.isEmpty ? LanguageModelSession() : LanguageModelSession(instructions: instructions)
                    let options = GenerationOptions(temperature: temperature, maximumResponseTokens: maxTokens)
                    let response = try await session.respond(to: prompt, options: options)
                    call.resolve(["text": response.content])
                } catch {
                    // includes Apple's own safety guard rails refusing a prompt
                    call.resolve(["text": NSNull()])
                }
            }
            return
        }
        #endif
        call.resolve(["text": NSNull()])
    }
}
