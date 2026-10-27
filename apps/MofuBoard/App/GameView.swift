import SwiftUI
import UIKit
import WebKit

/// ゲーム本体（Resources の index.html / js / 画像）を全画面で表示する。
/// ゲーム側は window.webkit.messageHandlers.app.postMessage(JSON文字列) で
/// セーブ・振動・共有・Game Center の操作をアプリに頼む。
struct GameView: UIViewRepresentable {
    static let saveKey = "mofuboard_v1"

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()

        var savedJS = "window.__SAVE__ = null;"
        if let saved = UserDefaults.standard.string(forKey: Self.saveKey),
           let data = try? JSONSerialization.data(withJSONObject: [saved]),
           let array = String(data: data, encoding: .utf8) {
            savedJS = "window.__SAVE__ = \(array)[0];"
        }
        controller.addUserScript(WKUserScript(source: savedJS, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.add(context.coordinator, name: "app")

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let bg = UIColor(red: 1.0, green: 244 / 255, blue: 232 / 255, alpha: 1)
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = bg
        web.scrollView.backgroundColor = bg
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsLinkPreview = false

        context.coordinator.webView = web
        context.coordinator.gameCenter.webView = web

        if let url = Bundle.main.url(forResource: "index", withExtension: "html") {
            web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, WKScriptMessageHandler {
        let gameCenter = GameCenterManager()
        weak var webView: WKWebView?

        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard let body = message.body as? String,
                  let data = body.data(using: .utf8),
                  let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  let type = obj["type"] as? String else { return }

            switch type {
            case "save":
                if let save = obj["data"] as? String {
                    UserDefaults.standard.set(save, forKey: GameView.saveKey)
                }
            case "haptic":
                let kind = obj["kind"] as? String ?? "light"
                if kind == "success" {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                } else {
                    UIImpactFeedbackGenerator(style: kind == "soft" ? .soft : .light).impactOccurred()
                }
            case "share":
                if let text = obj["text"] as? String { share(text) }
            case "copy":
                if let text = obj["text"] as? String { UIPasteboard.general.string = text }
            case "ready", "gc_auth":
                gameCenter.authenticate()
            case "gc_host":
                gameCenter.host(minPlayers: obj["min"] as? Int ?? 2, maxPlayers: obj["max"] as? Int ?? 5)
            case "gc_code":
                let code = obj["code"] as? Int ?? 0
                let players = obj["players"] as? Int ?? 2
                gameCenter.findByCode(code: code, players: players)
            case "gc_cancel":
                gameCenter.cancelSearch()
            case "gc_send":
                if let text = obj["data"] as? String { gameCenter.send(text) }
            case "gc_leave":
                gameCenter.leave()
            default:
                break
            }
        }

        /// 招待コードを LINE などで送る
        private func share(_ text: String) {
            let vc = UIActivityViewController(activityItems: [text], applicationActivities: nil)
            let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
            let window = scene?.windows.first(where: { $0.isKeyWindow }) ?? scene?.windows.first
            guard var top = window?.rootViewController else { return }
            while let presented = top.presentedViewController { top = presented }
            if let pop = vc.popoverPresentationController, let view = webView {
                pop.sourceView = view
                pop.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
            }
            top.present(vc, animated: true)
        }
    }
}
