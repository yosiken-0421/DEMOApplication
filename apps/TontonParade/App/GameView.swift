import SwiftUI
import UIKit
import WebKit

/// ゲーム本体(Resources/index.html)を全画面で表示する。
/// ゲーム側は window.ReactNativeWebView.postMessage(JSON文字列) で
/// セーブ・振動・共有をアプリに頼むので、同じ名前の窓口をここで用意する。
struct GameView: UIViewRepresentable {
    static let saveKey = "tontonparade_v1"

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()

        var savedJS = "window.__TT_SAVE__ = null;"
        if let saved = UserDefaults.standard.string(forKey: Self.saveKey),
           let data = try? JSONSerialization.data(withJSONObject: [saved]),
           let array = String(data: data, encoding: .utf8) {
            savedJS = "window.__TT_SAVE__ = \(array)[0];"
        }
        let bridge = savedJS
            + " window.ReactNativeWebView = { postMessage: function (s) { window.webkit.messageHandlers.tt.postMessage(String(s)); } };"
        controller.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.add(context.coordinator, name: "tt")

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 43 / 255, green: 23 / 255, blue: 71 / 255, alpha: 1)
        web.scrollView.backgroundColor = web.backgroundColor
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsLinkPreview = false

        if let url = Bundle.main.url(forResource: "index", withExtension: "html"),
           let html = try? String(contentsOf: url, encoding: .utf8) {
            web.loadHTMLString(html, baseURL: URL(string: "https://tontonparade.local/"))
        }
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, WKScriptMessageHandler {
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
            default:
                break
            }
        }

        /// LINE などに送るための共有シートを出す
        private func share(_ text: String) {
            let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
            let window = scene?.windows.first(where: { $0.isKeyWindow }) ?? scene?.windows.first
            guard var top = window?.rootViewController else { return }
            while let presented = top.presentedViewController { top = presented }
            let sheet = UIActivityViewController(activityItems: [text], applicationActivities: nil)
            top.present(sheet, animated: true)
        }
    }
}
