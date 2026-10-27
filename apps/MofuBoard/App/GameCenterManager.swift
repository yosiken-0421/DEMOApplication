import GameKit
import UIKit
import WebKit

/// Game Center（GameKit）のリアルタイム対戦をまとめて扱う。
/// ゲーム画面(JavaScript)とは JSON でやり取りする。
///   JS → Swift : gc_auth / gc_host / gc_code（招待コード） / gc_cancel / gc_send / gc_leave
///   Swift → JS : window.__gcEvent({ev: "auth" | "started" | "joined" | "data" | "left" | "cancelled" | "error" | "disconnected", ...})
final class GameCenterManager: NSObject {
    weak var webView: WKWebView?

    private var match: GKMatch?
    private var started = false
    private var listenerRegistered = false
    private var presentingAuth = false
    private var searching = false
    private var searchID = 0

    // MARK: - JS へ送る

    private func emit(_ obj: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: obj),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.__gcEvent && window.__gcEvent(\(json));", completionHandler: nil)
        }
    }

    private func info(_ p: GKPlayer) -> [String: Any] {
        ["id": p.gamePlayerID, "name": p.displayName]
    }

    // MARK: - サインイン

    func authenticate() {
        let local = GKLocalPlayer.local
        if local.isAuthenticated {
            onAuthenticated()
            return
        }
        if presentingAuth { return }
        local.authenticateHandler = { [weak self] viewController, error in
            DispatchQueue.main.async {
                guard let self else { return }
                if let viewController {
                    self.presentingAuth = true
                    self.present(viewController)
                    return
                }
                self.presentingAuth = false
                if GKLocalPlayer.local.isAuthenticated {
                    self.onAuthenticated()
                } else {
                    self.emit(["ev": "auth", "ok": false,
                               "error": error?.localizedDescription ?? "Game Center にサインインしていません"])
                }
            }
        }
    }

    private func onAuthenticated() {
        let local = GKLocalPlayer.local
        if !listenerRegistered {
            local.register(self)
            listenerRegistered = true
        }
        emit(["ev": "auth", "ok": true, "name": local.displayName, "id": local.gamePlayerID])
    }

    // MARK: - 招待してはじめる

    func host(minPlayers: Int, maxPlayers: Int) {
        guard GKLocalPlayer.local.isAuthenticated else {
            emit(["ev": "error", "message": "Game Center にサインインしてください"])
            return
        }
        leave()
        cancelSearch(notify: false)
        let request = GKMatchRequest()
        let cap = GKMatchRequest.maxPlayersAllowedForMatch(of: .peerToPeer)
        request.minPlayers = 2
        request.maxPlayers = max(2, min(maxPlayers, cap))
        guard let vc = GKMatchmakerViewController(matchRequest: request) else {
            emit(["ev": "error", "message": "招待画面をひらけませんでした"])
            return
        }
        vc.matchmakingMode = .inviteOnly          // 招待した友だちだけ（知らない人とはマッチしない）
        vc.canStartWithMinimumPlayers = true      // 全員そろわなくても2人いれば始められる
        vc.matchmakerDelegate = self
        present(vc)
    }


    // MARK: - 招待コードでさがす

    /// 同じ「招待コード（playerGroup）」を入れた人どうしだけをつなぐ。
    /// コードの1けた目が人数なので、全員そろった時点でマッチが成立する。
    func findByCode(code: Int, players: Int) {
        guard GKLocalPlayer.local.isAuthenticated else {
            emit(["ev": "error", "message": "Game Center にサインインしてください"])
            return
        }
        leave()
        cancelSearch(notify: false)
        searchID += 1
        let myID = searchID
        let request = GKMatchRequest()
        let cap = GKMatchRequest.maxPlayersAllowedForMatch(of: .peerToPeer)
        let n = max(2, min(players, cap))
        request.minPlayers = n
        request.maxPlayers = n
        request.playerGroup = code
        searching = true
        GKMatchmaker.shared().findMatch(for: request) { [weak self] match, error in
            DispatchQueue.main.async {
                // 古い検索（キャンセル済み）の結果は無視する
                guard let self, myID == self.searchID else { return }
                self.searching = false
                if let error {
                    let ns = error as NSError
                    if ns.domain == GKErrorDomain && ns.code == GKError.Code.cancelled.rawValue {
                        self.emit(["ev": "cancelled"])
                    } else {
                        self.emit(["ev": "error", "message": "つながりませんでした（\(error.localizedDescription)）"])
                    }
                    return
                }
                guard let match else { return }
                self.start(with: match)
            }
        }
    }

    func cancelSearch(notify: Bool = true) {
        if searching {
            searchID += 1
            GKMatchmaker.shared().cancel()
            searching = false
            if notify { emit(["ev": "cancelled"]) }
        }
    }

    // MARK: - 送信・退出

    func send(_ text: String) {
        guard let match, let data = text.data(using: .utf8) else { return }
        do {
            try match.sendData(toAllPlayers: data, with: .reliable)
        } catch {
            emit(["ev": "error", "message": "送信できませんでした"])
        }
    }

    func leave() {
        match?.delegate = nil
        match?.disconnect()
        match = nil
        started = false
    }

    // MARK: - マッチ開始

    private func start(with newMatch: GKMatch) {
        match?.delegate = nil
        match?.disconnect()
        match = newMatch
        started = false
        newMatch.delegate = self
        if newMatch.expectedPlayerCount == 0 || !newMatch.players.isEmpty {
            emitStarted()
        }
    }

    private func emitStarted() {
        guard let match, !started else { return }
        started = true
        emit(["ev": "started",
              "me": info(GKLocalPlayer.local),
              "players": match.players.map { info($0) }])
    }

    // MARK: - 画面表示

    private func present(_ vc: UIViewController) {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window = scene?.windows.first(where: { $0.isKeyWindow }) ?? scene?.windows.first
        guard var top = window?.rootViewController else { return }
        while let presented = top.presentedViewController { top = presented }
        top.present(vc, animated: true)
    }
}

// MARK: - 招待画面

extension GameCenterManager: GKMatchmakerViewControllerDelegate {
    func matchmakerViewControllerWasCancelled(_ viewController: GKMatchmakerViewController) {
        viewController.dismiss(animated: true)
        emit(["ev": "cancelled"])
    }

    func matchmakerViewController(_ viewController: GKMatchmakerViewController, didFailWithError error: Error) {
        viewController.dismiss(animated: true)
        emit(["ev": "error", "message": error.localizedDescription])
    }

    func matchmakerViewController(_ viewController: GKMatchmakerViewController, didFind match: GKMatch) {
        viewController.dismiss(animated: true)
        DispatchQueue.main.async { self.start(with: match) }
    }
}

// MARK: - 対戦中の通信

extension GameCenterManager: GKMatchDelegate {
    func match(_ match: GKMatch, didReceive data: Data, fromRemotePlayer player: GKPlayer) {
        guard let text = String(data: data, encoding: .utf8) else { return }
        emit(["ev": "data", "from": player.gamePlayerID, "msg": text])
    }

    func match(_ match: GKMatch, player: GKPlayer, didChange state: GKPlayerConnectionState) {
        DispatchQueue.main.async {
            guard match === self.match else { return }
            switch state {
            case .connected:
                if self.started {
                    self.emit(["ev": "joined", "player": self.info(player)])
                } else if match.expectedPlayerCount == 0 {
                    self.emitStarted()
                }
            case .disconnected:
                self.emit(["ev": "left", "id": player.gamePlayerID])
            default:
                break
            }
        }
    }

    func match(_ match: GKMatch, didFailWithError error: Error?) {
        DispatchQueue.main.async {
            guard match === self.match else { return }
            self.leave()
            self.emit(["ev": "disconnected"])
        }
    }
}

// MARK: - 友だちからの招待を受けたとき

extension GameCenterManager: GKLocalPlayerListener {
    func player(_ player: GKPlayer, didAccept invite: GKInvite) {
        DispatchQueue.main.async {
            guard let vc = GKMatchmakerViewController(invite: invite) else { return }
            self.leave()
            vc.matchmakerDelegate = self
            self.present(vc)
        }
    }
}
