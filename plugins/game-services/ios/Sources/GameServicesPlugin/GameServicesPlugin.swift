import Foundation
import Capacitor
import GameKit

/// Apple Game Center: sign-in, achievements, leaderboards and saved games (iCloud).
/// Needs the Game Center and iCloud (iCloud Documents) capabilities on the App target.
@objc(GameServicesPlugin)
public class GameServicesPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "GameServicesPlugin"
    public let jsName = "GameServices"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unlockAchievement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showAchievements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLeaderboards", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveGame", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadGame", returnType: CAPPluginReturnPromise)
    ]

    private var pendingSignIn: [CAPPluginCall] = []
    private var handlerSet = false
    /// Saves that disagree across devices; replaced by one merged save on the next saveGame.
    private var conflicts: [GKSavedGame] = []

    private var local: GKLocalPlayer { GKLocalPlayer.local }

    private func signedInResult() -> [String: Any] {
        local.isAuthenticated ? ["signedIn": true, "playerName": local.displayName] : ["signedIn": false]
    }

    @objc func signIn(_ call: CAPPluginCall) {
        if local.isAuthenticated { call.resolve(signedInResult()); return }
        pendingSignIn.append(call)
        // Game Center calls this handler once now and again whenever the player's state changes.
        // It can only be set once per launch; later sign-in requests wait on the same handler.
        if handlerSet { return }
        handlerSet = true
        DispatchQueue.main.async {
            self.local.authenticateHandler = { [weak self] viewController, _ in
                guard let self = self else { return }
                if let vc = viewController {
                    self.bridge?.viewController?.present(vc, animated: true)
                    return
                }
                let result = self.signedInResult()
                self.pendingSignIn.forEach { $0.resolve(result) }
                self.pendingSignIn.removeAll()
                self.notifyListeners("signInChange", data: result)
            }
        }
    }

    @objc func unlockAchievement(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("id is required"); return }
        let a = GKAchievement(identifier: id)
        a.percentComplete = 100
        a.showsCompletionBanner = true
        GKAchievement.report([a]) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard let id = call.getString("leaderboardId"), let score = call.getInt("score") else {
            call.reject("leaderboardId and score are required"); return
        }
        GKLeaderboard.submitScore(score, context: 0, player: local, leaderboardIDs: [id]) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    @objc func showAchievements(_ call: CAPPluginCall) { present(.achievements, call) }
    @objc func showLeaderboards(_ call: CAPPluginCall) { present(.leaderboards, call) }

    private func present(_ state: GKGameCenterViewControllerState, _ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let vc = GKGameCenterViewController(state: state)
            vc.gameCenterDelegate = self
            self.bridge?.viewController?.present(vc, animated: true)
            call.resolve()
        }
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }

    @objc func saveGame(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), let data = call.getString("data")?.data(using: .utf8) else {
            call.reject("name and data are required"); return
        }
        let finish: (Error?) -> Void = { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
        let same = conflicts.filter { $0.name == name }
        if same.count > 1 {
            // The data passed in is already the merge of every conflicting save (see loadGame).
            local.resolveConflictingSavedGames(same, with: data) { _, error in
                if error == nil { self.conflicts.removeAll { $0.name == name } }
                finish(error)
            }
        } else {
            local.saveGameData(data, withName: name) { _, error in finish(error) }
        }
    }

    /// Returns { data, all }: `all` holds every copy when devices disagree, for the app to merge.
    @objc func loadGame(_ call: CAPPluginCall) {
        guard let name = call.getString("name") else { call.reject("name is required"); return }
        local.fetchSavedGames { games, error in
            if let error = error { call.reject(error.localizedDescription); return }
            let matches = (games ?? []).filter { $0.name == name }
                .sorted { ($0.modificationDate ?? .distantPast) > ($1.modificationDate ?? .distantPast) }
            if matches.isEmpty { call.resolve(["data": NSNull(), "all": []]); return }
            if matches.count > 1 { self.conflicts = matches }
            var texts = [String](repeating: "", count: matches.count)
            let group = DispatchGroup()
            for (i, game) in matches.enumerated() {
                group.enter()
                game.loadData { data, _ in
                    let text = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                    DispatchQueue.main.async { texts[i] = text; group.leave() }   // one thread writes `texts`
                }
            }
            group.notify(queue: .main) {
                let all = texts.filter { !$0.isEmpty }
                call.resolve(["data": all.first ?? NSNull(), "all": all])
            }
        }
    }
}
