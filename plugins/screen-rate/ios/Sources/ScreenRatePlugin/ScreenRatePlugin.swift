import Foundation
import Capacitor
import UIKit
import WebKit

/// The screen's refresh rate on iPhone, and the web view's 60 Hz cap (src/kit/screenrate.js).
///
/// WKWebView draws pages near 60 frames a second even on 120 Hz ProMotion screens, because WebKit's
/// own preference "Prefer Page Rendering Updates near 60fps" is on by default (Safari has it under
/// Settings › Apps › Safari › Advanced › Feature Flags). There's no public API for apps yet (WebKit bug
/// 294338), so load() turns it off through WebKit's list of features (+[WKPreferences _features] and
/// -[WKPreferences _setEnabled:forFeature:], what Safari's Feature Flags page uses), before the page
/// loads. Then games can run at 120 and frame generation can fill a 120 Hz screen. Info.plist's
/// CADisableMinimumFrameDurationOnPhone lets the app's display link run above 60 too.
///
/// It's private WebKit API: looked up by name at run time and skipped if missing, so a WebKit without
/// it just stays at 60. App Review could object to it: set GSHighRefreshWebView to NO in Info.plist to
/// leave the cap on without touching code.
///
/// get() -> { platform: 'ios', hz: the screen's top rate, rates: [hz], lifted: whether the cap came off }.
/// set() does nothing on iPhone: ProMotion follows what the page draws by itself.
@objc(ScreenRatePlugin)
public class ScreenRatePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ScreenRatePlugin"
    public let jsName = "ScreenRate"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise)
    ]
    private var lifted = false

    override public func load() {
        let on = Bundle.main.object(forInfoDictionaryKey: "GSHighRefreshWebView") as? Bool ?? true
        guard on else { return }
        if Thread.isMainThread { lift() } else { DispatchQueue.main.async { [weak self] in self?.lift() } }
    }

    private func lift() {
        guard let prefs = bridge?.webView?.configuration.preferences else { return }
        lifted = ScreenRatePlugin.setFeature("PreferPageRenderingUpdatesNear60FPSEnabled", false, on: prefs)
    }

    /// Sets one of WebKit's features (by its key) on these preferences; false if this WebKit hasn't got it.
    static func setFeature(_ key: String, _ value: Bool, on prefs: WKPreferences) -> Bool {
        // iOS 16.4+: _features / _setEnabled:forFeature:; older: _experimentalFeatures / _setEnabled:forExperimentalFeature:
        for (list, setter) in [("_features", "_setEnabled:forFeature:"), ("_experimentalFeatures", "_setEnabled:forExperimentalFeature:")] {
            let listSel = NSSelectorFromString(list), setSel = NSSelectorFromString(setter)
            guard let listMethod = class_getClassMethod(WKPreferences.self, listSel), prefs.responds(to: setSel) else { continue }
            typealias ListFn = @convention(c) (AnyObject, Selector) -> Unmanaged<AnyObject>?
            let listFn = unsafeBitCast(method_getImplementation(listMethod), to: ListFn.self)
            guard let features = listFn(WKPreferences.self as AnyObject, listSel)?.takeUnretainedValue() as? [NSObject] else { continue }
            guard let feature = features.first(where: { ($0.value(forKey: "key") as? String) == key }) else { continue }
            typealias SetFn = @convention(c) (AnyObject, Selector, Bool, AnyObject) -> Void
            let setFn = unsafeBitCast(prefs.method(for: setSel), to: SetFn.self)
            setFn(prefs, setSel, value, feature)
            return true
        }
        return false
    }

    @objc func get(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            let screen = self?.bridge?.viewController?.view.window?.windowScene?.screen ?? UIScreen.main
            let hz = screen.maximumFramesPerSecond
            call.resolve(["platform": "ios", "hz": hz, "rates": [hz], "arr": false, "want": 0, "lifted": self?.lifted ?? false])
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        call.resolve()
    }
}
