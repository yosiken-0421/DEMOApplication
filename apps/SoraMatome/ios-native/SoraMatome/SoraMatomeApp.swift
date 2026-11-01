import SwiftUI
import WebKit
import UIKit

@main
struct SoraMatomeApp: App {
    var body: some Scene {
        WindowGroup {
            WeatherScreen().ignoresSafeArea(.container, edges: .bottom)
        }
    }
}

struct WeatherScreen: UIViewRepresentable {
    func makeCoordinator() -> WeatherBridge { WeatherBridge() }
    func makeUIView(context: Context) -> WKWebView {
        let c = WKWebViewConfiguration()
        c.defaultWebpagePreferences.allowsContentJavaScript = true
        c.websiteDataStore = .default()
        c.userContentController.add(context.coordinator, name: "weatherBridge")
        let view = WKWebView(frame: .zero, configuration: c)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        context.coordinator.webView = view
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 0.04, green: 0.09, blue: 0.18, alpha: 1)
        view.scrollView.bounces = false
        if let file = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") {
            view.loadFileURL(file, allowingReadAccessTo: file.deletingLastPathComponent())
        } else {
            assertionFailure("www/index.html missing from bundle")
        }
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) {}
}

final class WeatherBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, URLSessionTaskDelegate {
    weak var webView: WKWebView?
    private let allowedHosts: Set<String> = ["api.open-meteo.com", "geocoding-api.open-meteo.com", "www.jma.go.jp"]
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 15
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.isFileURL || url.scheme == "about" { decisionHandler(.allow); return }
        if url.scheme == "https" { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, url.scheme == "https" { UIApplication.shared.open(url) }
        return nil
    }
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        guard let url = request.url, url.scheme == "https",
              let host = url.host?.lowercased(), allowedHosts.contains(host) else {
            completionHandler(nil)
            return
        }
        completionHandler(request)
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let payload = message.body as? [String: Any],
              let id = payload["id"] as? String,
              let raw = payload["url"] as? String,
              let url = URL(string: raw), url.scheme == "https",
              url.port == nil, url.user == nil, url.password == nil,
              let host = url.host?.lowercased(), allowedHosts.contains(host),
              !url.path.contains("..") else { return }
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        session.dataTask(with: request) { [weak self] bytes, response, error in
            var result: [String: Any] = ["id": id, "ok": false]
            if let response = response as? HTTPURLResponse, response.statusCode == 200,
               let host = response.url?.host?.lowercased(), self?.allowedHosts.contains(host) == true,
               let bytes = bytes, bytes.count < 1_000_000,
               let decoded = try? JSONSerialization.jsonObject(with: bytes) {
                result["ok"] = true
                result["data"] = decoded
            } else {
                result["error"] = error?.localizedDescription ?? "天気データ取得に失敗しました"
            }
            DispatchQueue.main.async { self?.respond(result) }
        }.resume()
    }
    private func respond(_ payload: [String: Any]) {
        guard let bytes = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: bytes, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.soraNativeCallback(\(json))", completionHandler: nil)
    }
}
