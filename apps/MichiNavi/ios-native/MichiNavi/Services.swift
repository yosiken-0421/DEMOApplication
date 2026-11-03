import AVFoundation
import Foundation
import MapKit
import Speech

// MARK: - OpenStreetMap（Overpass API）から一時停止・踏切・オービスを取得

enum HazardService {
    /// ルートに沿った注意地点。失敗しても空で返す（ナビは続ける）
    static func fetch(along points: [Coord]) async -> [Hazard] {
        let simple = RouteLine.simplify(points, tolerance: 12)
        var result: [Int64: Hazard] = [:]
        for chunk in Overpass.chunks(simple) {
            guard let url = URL(string: Overpass.endpoint) else { break }
            var req = URLRequest(url: url, timeoutInterval: 30)
            req.httpMethod = "POST"
            req.setValue("MichiNavi/1.0 (personal iOS navigation app)", forHTTPHeaderField: "User-Agent")
            req.setValue("application/x-www-form-urlencoded; charset=utf-8", forHTTPHeaderField: "Content-Type")
            let body = "data=" + (Overpass.query(along: chunk).addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "")
            req.httpBody = body.data(using: .utf8)
            guard let (data, resp) = try? await URLSession.shared.data(for: req),
                  (resp as? HTTPURLResponse)?.statusCode == 200 else { continue }
            for h in Overpass.parse(data) { result[h.id] = h }
        }
        return Array(result.values)
    }
}

// MARK: - 目的地の検索（入力しながら候補を出す）

@MainActor
final class SearchModel: NSObject, ObservableObject, MKLocalSearchCompleterDelegate {
    @Published var query = "" { didSet { completer.queryFragment = query } }
    @Published private(set) var suggestions: [MKLocalSearchCompletion] = []
    @Published private(set) var results: [MKMapItem] = []
    @Published private(set) var searching = false

    private let completer = MKLocalSearchCompleter()

    override init() {
        super.init()
        completer.delegate = self
        completer.resultTypes = [.address, .pointOfInterest]
    }

    func setRegion(around c: CLLocationCoordinate2D?) {
        guard let c else { return }
        completer.region = MKCoordinateRegion(center: c, latitudinalMeters: 50_000, longitudinalMeters: 50_000)
    }

    nonisolated func completerDidUpdateResults(_ c: MKLocalSearchCompleter) {
        let r = Array(c.results.prefix(12))
        Task { @MainActor in self.suggestions = r }
    }

    nonisolated func completer(_ c: MKLocalSearchCompleter, didFailWithError error: Error) {}

    /// 候補を選んだとき
    func resolve(_ s: MKLocalSearchCompletion) async -> MKMapItem? {
        let r = try? await MKLocalSearch(request: MKLocalSearch.Request(completion: s)).start()
        return r?.mapItems.first
    }

    /// 文字で検索（音声入力の結果もここ）
    func search(_ text: String, near c: CLLocationCoordinate2D?) async {
        let t = text.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return }
        searching = true
        defer { searching = false }
        let req = MKLocalSearch.Request()
        req.naturalLanguageQuery = t
        if let c { req.region = MKCoordinateRegion(center: c, latitudinalMeters: 50_000, longitudinalMeters: 50_000) }
        results = (try? await MKLocalSearch(request: req).start())?.mapItems ?? []
    }

    func clear() { query = ""; results = []; suggestions = [] }
}

// MARK: - 音声で目的地を入力

@MainActor
final class VoiceInput: ObservableObject {
    @Published private(set) var listening = false
    @Published private(set) var text = ""
    @Published var errorText: String?

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ja-JP"))
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var timer: Task<Void, Never>?
    private var onFinish: ((String) -> Void)?

    func start(onFinish: @escaping (String) -> Void) {
        self.onFinish = onFinish
        errorText = nil
        Task {
            let speechOK = await Self.speechAuthorized()
            guard speechOK else { errorText = "設定アプリで「音声認識」を許可してください"; return }
            let micOK = await Self.micAuthorized()
            if micOK { begin() } else { errorText = "設定アプリで「マイク」を許可してください" }
        }
    }

    // 別スレッドで呼ばれるコールバックは、画面側（MainActor）と切り離して書く
    nonisolated private static func speechAuthorized() async -> Bool {
        await withCheckedContinuation { c in
            SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0 == .authorized) }
        }
    }

    nonisolated private static func micAuthorized() async -> Bool {
        await withCheckedContinuation { c in
            AVAudioApplication.requestRecordPermission { c.resume(returning: $0) }
        }
    }

    nonisolated private static func installTap(_ input: AVAudioInputNode, _ req: SFSpeechAudioBufferRecognitionRequest) {
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buf, _ in req.append(buf) }
    }

    nonisolated private static func recognize(_ r: SFSpeechRecognizer, _ req: SFSpeechAudioBufferRecognitionRequest,
                                              _ handler: @escaping @Sendable (String?, Bool) -> Void) -> SFSpeechRecognitionTask {
        r.recognitionTask(with: req) { result, error in
            handler(result?.bestTranscription.formattedString, (result?.isFinal ?? false) || error != nil)
        }
    }

    private func begin() {
        guard let recognizer, recognizer.isAvailable else { errorText = "今は音声認識が使えません"; return }
        stop(deliver: false)
        text = ""
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch { errorText = "マイクを使えませんでした"; return }

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        request = req
        Self.installTap(engine.inputNode, req)
        engine.prepare()
        do { try engine.start() } catch { errorText = "マイクを使えませんでした"; return }
        listening = true

        task = Self.recognize(recognizer, req) { [weak self] t, done in
            Task { @MainActor in
                guard let self else { return }
                if let t { self.text = t; self.restartSilenceTimer() }
                if done { self.stop(deliver: true) }
            }
        }
        restartSilenceTimer()
    }

    /// 話し終わって 1.5 秒（最初は 6 秒）何もなければ確定
    private func restartSilenceTimer() {
        timer?.cancel()
        let wait: UInt64 = text.isEmpty ? 6_000_000_000 : 1_500_000_000
        timer = Task { @MainActor in
            try? await Task.sleep(nanoseconds: wait)
            if !Task.isCancelled { self.stop(deliver: true) }
        }
    }

    func stop(deliver: Bool) {
        timer?.cancel(); timer = nil
        if engine.isRunning { engine.stop(); engine.inputNode.removeTap(onBus: 0) }
        request?.endAudio(); request = nil
        task?.cancel(); task = nil
        let wasListening = listening
        listening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        if deliver, wasListening, !text.isEmpty { onFinish?(text) }
    }
}
