import Foundation
import Capacitor
import CryptoKit
import DeviceCheck

/// Apple App Attest: proves to api.game-scroll.com that requests come from the real Game Scroll app
/// on a real iPhone. Needs the App Attest capability on the App target (paid Apple Developer account).
///
/// integrity({ challenge, keyId? }):
///   - no keyId: makes a new Secure Enclave key and has Apple attest it
///       -> { platform: "ios", keyId, attestation }
///   - keyId:    signs the challenge with that key
///       -> { platform: "ios", keyId, assertion }
/// The app keeps keyId and sends it back next time. Data is base64; the server checks it all.
extension GameServicesPlugin {
    @objc func integrity(_ call: CAPPluginCall) {
        guard let challenge = call.getString("challenge"), !challenge.isEmpty else { call.reject("challenge is required"); return }
        let service = DCAppAttestService.shared
        guard service.isSupported else { call.reject("App Attest is not supported on this device", "UNSUPPORTED"); return }
        let clientDataHash = Data(SHA256.hash(data: Data(challenge.utf8)))

        if let keyId = call.getString("keyId"), !keyId.isEmpty {
            service.generateAssertion(keyId, clientDataHash: clientDataHash) { assertion, error in
                if let error = error as? DCError, error.code == .invalidKey {
                    call.reject("App Attest key is no longer valid", "INVALID_KEY"); return
                }
                guard let assertion = assertion else { call.reject(error?.localizedDescription ?? "App Attest assertion failed"); return }
                call.resolve(["platform": "ios", "keyId": keyId, "assertion": assertion.base64EncodedString()])
            }
            return
        }

        service.generateKey { keyId, error in
            guard let keyId = keyId else { call.reject(error?.localizedDescription ?? "App Attest key failed"); return }
            service.attestKey(keyId, clientDataHash: clientDataHash) { attestation, error in
                guard let attestation = attestation else { call.reject(error?.localizedDescription ?? "App Attest failed"); return }
                call.resolve(["platform": "ios", "keyId": keyId, "attestation": attestation.base64EncodedString()])
            }
        }
    }
}
