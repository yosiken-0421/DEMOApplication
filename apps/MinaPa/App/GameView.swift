import SwiftUI
import UIKit
import WebKit
import AVFoundation

/// ゲーム本体(Resources/index.html)を全画面で表示する。
/// ゲーム側は window.webkit.messageHandlers.app.postMessage(JSON文字列) で
/// セーブ・振動・Game Center の操作をアプリに頼む。
struct GameView: UIViewRepresentable {
    static let saveKey = "minapa_v1"

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

        let bg = UIColor(red: 42 / 255, green: 31 / 255, blue: 74 / 255, alpha: 1)
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = bg
        web.scrollView.backgroundColor = bg
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsLinkPreview = false

        context.coordinator.gameCenter.webView = web

        if let url = Bundle.main.url(forResource: "index", withExtension: "html"),
           let html = try? String(contentsOf: url, encoding: .utf8) {
            web.loadHTMLString(html, baseURL: URL(string: "https://minapa.local/"))
        }
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, WKScriptMessageHandler {
        let gameCenter = GameCenterManager()
        private let speech = AVSpeechSynthesizer()

        /// キャラのセリフを iPhone の読み上げ音声でしゃべらせる
        private func speak(_ text: String, pitch: Float, rate: Float, male: Bool) {
            if speech.isSpeaking { speech.stopSpeaking(at: .immediate) }
            let utterance = AVSpeechUtterance(string: text)
            let voice = Coordinator.japaneseVoice(male: male)
            utterance.voice = voice
            var p = pitch
            // 男性の声が入っていない iPhone では、女性の声を低めにして代わりにする
            if male, let voice, voice.gender != .male { p *= 0.72 }
            utterance.pitchMultiplier = max(0.5, min(2.0, p))
            utterance.rate = max(AVSpeechUtteranceMinimumSpeechRate,
                                 min(AVSpeechUtteranceMaximumSpeechRate, AVSpeechUtteranceDefaultSpeechRate * rate))
            utterance.volume = 1.0
            speech.speak(utterance)
        }

        private static func japaneseVoice(male: Bool) -> AVSpeechSynthesisVoice? {
            let ja = AVSpeechSynthesisVoice.speechVoices()
                .filter { $0.language == "ja-JP" }
                .sorted { $0.quality.rawValue > $1.quality.rawValue }
            let want: AVSpeechSynthesisVoiceGender = male ? .male : .female
            return ja.first(where: { $0.gender == want }) ?? ja.first ?? AVSpeechSynthesisVoice(language: "ja-JP")
        }

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
            case "speak":
                if let text = obj["text"] as? String {
                    let pitch = (obj["pitch"] as? NSNumber)?.floatValue ?? 1.0
                    let rate = (obj["rate"] as? NSNumber)?.floatValue ?? 1.0
                    speak(text, pitch: pitch, rate: rate, male: (obj["g"] as? String) == "m")
                }
            case "ready":
                // 起動時に Game Center へサインイン（招待通知から起動した場合もここで受け取れるように）
                gameCenter.authenticate()
            case "gc_auth":
                gameCenter.authenticate()
            case "gc_host":
                let minP = obj["min"] as? Int ?? 2
                let maxP = obj["max"] as? Int ?? 4
                gameCenter.host(minPlayers: minP, maxPlayers: maxP)
            case "gc_send":
                if let text = obj["data"] as? String { gameCenter.send(text) }
            case "gc_leave":
                gameCenter.leave()
            default:
                break
            }
        }
    }
}
