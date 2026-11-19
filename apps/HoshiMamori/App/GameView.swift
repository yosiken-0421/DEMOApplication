import SwiftUI
import UIKit
import WebKit

/// ゲーム本体(Resources/index.html)を全画面で表示する。
/// 画像(img_*.png)を同じフォルダから読めるように loadFileURL で開く。
/// ゲーム側は window.ReactNativeWebView.postMessage(JSON文字列) で
/// セーブ・振動をアプリに頼むので、同じ名前の窓口をここで用意する。
struct GameView: UIViewRepresentable {
    static let saveKey = "hoshimamori_v1"

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()

        var savedJS = "window.__HM_SAVE__ = null;"
        if let saved = UserDefaults.standard.string(forKey: Self.saveKey),
           let data = try? JSONSerialization.data(withJSONObject: [saved]),
           let array = String(data: data, encoding: .utf8) {
            savedJS = "window.__HM_SAVE__ = \(array)[0];"
        }
        let bridge = savedJS
            + " window.ReactNativeWebView = { postMessage: function (s) { window.webkit.messageHandlers.hm.postMessage(String(s)); } };"
        controller.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.add(context.coordinator, name: "hm")

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 18 / 255, green: 13 / 255, blue: 46 / 255, alpha: 1)
        web.scrollView.backgroundColor = web.backgroundColor
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsLinkPreview = false

        if let url = Bundle.main.url(forResource: "index", withExtension: "html") {
            web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
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
            default:
                break
            }
        }
    }
}
