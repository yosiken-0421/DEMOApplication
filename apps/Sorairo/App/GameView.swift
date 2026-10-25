import SwiftUI
import UIKit
import WebKit
import UserNotifications

/// ゲーム本体(Resources/index.html)を全画面で表示する。
/// ゲーム側は window.ReactNativeWebView.postMessage(JSON文字列) で
/// セーブ・振動・通知をアプリに頼むので、同じ名前の窓口をここで用意する。
struct GameView: UIViewRepresentable {
    static let saveKey = "sorairo_v1"
    static let background = UIColor(red: 1.0, green: 232 / 255, blue: 241 / 255, alpha: 1)

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()

        var savedJS = "window.__SR_SAVE__ = null;"
        if let saved = UserDefaults.standard.string(forKey: Self.saveKey),
           let data = try? JSONSerialization.data(withJSONObject: [saved]),
           let array = String(data: data, encoding: .utf8) {
            savedJS = "window.__SR_SAVE__ = \(array)[0];"
        }
        let bridge = savedJS
            + " window.ReactNativeWebView = { postMessage: function (s) { window.webkit.messageHandlers.sr.postMessage(String(s)); } };"
        controller.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.add(context.coordinator, name: "sr")

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = Self.background
        web.scrollView.backgroundColor = Self.background
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsLinkPreview = false

        if let url = Bundle.main.url(forResource: "index", withExtension: "html"),
           let html = try? String(contentsOf: url, encoding: .utf8) {
            web.loadHTMLString(html, baseURL: URL(string: "https://sorairo.local/"))
        }
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, WKScriptMessageHandler {
        private let soft = UIImpactFeedbackGenerator(style: .soft)
        private let light = UIImpactFeedbackGenerator(style: .light)
        private let notice = UINotificationFeedbackGenerator()

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
                switch obj["kind"] as? String ?? "light" {
                case "success": notice.notificationOccurred(.success)
                case "soft": soft.impactOccurred()
                default: light.impactOccurred(intensity: 0.6)
                }
            case "askNotify":
                UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
            case "schedule":
                if let items = obj["items"] as? [[String: Any]] { schedule(items) }
            case "clearNotify":
                let center = UNUserNotificationCenter.current()
                center.removeAllPendingNotificationRequests()
                center.removeAllDeliveredNotifications()
                center.setBadgeCount(0)
            default:
                break
            }
        }

        /// 放置の宝箱がいっぱいになったとき・翌日のミッションのお知らせ
        private func schedule(_ items: [[String: Any]]) {
            let center = UNUserNotificationCenter.current()
            center.getNotificationSettings { settings in
                guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
                center.removeAllPendingNotificationRequests()
                for item in items {
                    guard let id = item["id"] as? String,
                          let after = (item["after"] as? NSNumber)?.doubleValue, after >= 60 else { continue }
                    let content = UNMutableNotificationContent()
                    content.title = item["title"] as? String ?? "そらいろ冒険隊"
                    content.body = item["body"] as? String ?? ""
                    content.sound = .default
                    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: after, repeats: false)
                    center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
                }
            }
        }
    }
}
