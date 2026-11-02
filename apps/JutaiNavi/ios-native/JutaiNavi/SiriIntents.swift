import AppIntents
import AVFoundation
import Foundation
import SwiftUI

extension Road: AppEnum {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "高速道路"
    static var caseDisplayRepresentations: [Road: DisplayRepresentation] = [
        .gaikan: DisplayRepresentation(title: "外環", synonyms: ["東京外環", "外環道", "東京外環道", "外環自動車道"]),
        .shutoko: DisplayRepresentation(title: "首都高", synonyms: ["首都高速", "首都高速道路"]),
        .tomei: DisplayRepresentation(title: "東名", synonyms: ["東名高速", "東名高速道路"]),
        .shinTomei: DisplayRepresentation(title: "新東名", synonyms: ["新東名高速"]),
        .chuo: DisplayRepresentation(title: "中央道", synonyms: ["中央自動車道", "中央高速"]),
        .kanetsu: DisplayRepresentation(title: "関越道", synonyms: ["関越", "関越自動車道"]),
        .tohoku: DisplayRepresentation(title: "東北道", synonyms: ["東北自動車道"]),
        .joban: DisplayRepresentation(title: "常磐道", synonyms: ["常磐自動車道", "常磐"]),
        .higashiKanto: DisplayRepresentation(title: "東関東道", synonyms: ["東関道", "東関東自動車道"]),
        .keiyo: DisplayRepresentation(title: "京葉道路", synonyms: ["京葉", "京葉道"]),
        .tateyama: DisplayRepresentation(title: "館山道", synonyms: ["館山自動車道"]),
        .kenodo: DisplayRepresentation(title: "圏央道", synonyms: ["圏央"]),
        .aqua: DisplayRepresentation(title: "アクアライン", synonyms: ["東京湾アクアライン"]),
        .daisanKeihin: DisplayRepresentation(title: "第三京浜", synonyms: ["第三京浜道路"]),
        .kitaKanto: DisplayRepresentation(title: "北関東道", synonyms: ["北関東自動車道"]),
        .joshinetsu: DisplayRepresentation(title: "上信越道", synonyms: ["上信越自動車道"]),
        .tokanko: DisplayRepresentation(title: "湾岸線", synonyms: ["湾岸道路", "東京湾岸道路"]),
        .meishin: DisplayRepresentation(title: "名神", synonyms: ["名神高速"]),
        .shinMeishin: DisplayRepresentation(title: "新名神", synonyms: ["新名神高速"]),
        .higashiMeihan: DisplayRepresentation(title: "東名阪道", synonyms: ["東名阪"]),
        .isewangan: DisplayRepresentation(title: "伊勢湾岸道", synonyms: ["伊勢湾岸"]),
        .sanyo: DisplayRepresentation(title: "山陽道", synonyms: ["山陽自動車道"]),
        .chugoku: DisplayRepresentation(title: "中国道", synonyms: ["中国自動車道"]),
        .kyushu: DisplayRepresentation(title: "九州道", synonyms: ["九州自動車道"]),
        .hanshin: DisplayRepresentation(title: "阪神高速", synonyms: ["阪神高速道路"]),
        .nagoyaKosoku: DisplayRepresentation(title: "名古屋高速", synonyms: ["名古屋都市高速"]),
    ]
}

enum Favorites {
    static let key = "favoriteRoads"
    static func load() -> [Road] {
        let raw = UserDefaults.standard.string(forKey: key) ?? Road.gaikan.rawValue
        let roads = raw.split(separator: ",").compactMap { Road(rawValue: String($0)) }
        return roads.isEmpty ? [.gaikan] : roads
    }
    static func save(_ roads: [Road]) {
        UserDefaults.standard.set(roads.map(\.rawValue).joined(separator: ","), forKey: key)
    }
}

/// 「Hey Siri、渋滞ナビで外環の渋滞情報」
struct RoadTrafficIntent: AppIntent {
    static var title: LocalizedStringResource = "高速道路の渋滞情報"
    static var description = IntentDescription("指定した高速道路の渋滞・事故・車線規制を読み上げます。")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "高速道路", requestValueDialog: IntentDialog("どの高速道路ですか？"))
    var road: Road

    init() {}
    init(road: Road) { self.road = road }

    func perform() async throws -> some IntentResult & ShowsSnippetView {
        let text: String
        do {
            let snap = try await TrafficService.shared.road(road)
            text = TrafficText.speech(road: road, items: snap.items, updated: snap.updated)
        } catch {
            text = "交通情報を取得できませんでした。少し時間をおいてもう一度聞いてください。"
        }
        await IntentSpeaker.shared.speak(text)
        return .result(view: SpeechSnippet(text: text))
    }
}

/// 「Hey Siri、渋滞ナビの渋滞情報」→ いつもの道路（アプリで設定）を読み上げ
struct FavoriteTrafficIntent: AppIntent {
    static var title: LocalizedStringResource = "いつもの道路の渋滞情報"
    static var description = IntentDescription("アプリで登録した「いつもの道路」の渋滞情報を読み上げます。")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ShowsSnippetView {
        let text: String
        do {
            let roads = Favorites.load()
            let snap = try await TrafficService.shared.all()
            var parts: [String] = []
            for road in roads.prefix(3) {
                let items = snap.items.filter { road.matches(roadName: $0.roadName, routeNo: $0.routeNo) }
                parts.append(TrafficText.speech(road: road, items: items, updated: nil))
            }
            if let u = snap.updated { parts.append("\(TrafficText.timeText(u))時点の情報です。") }
            text = parts.joined()
        } catch {
            text = "交通情報を取得できませんでした。少し時間をおいてもう一度聞いてください。"
        }
        await IntentSpeaker.shared.speak(text)
        return .result(view: SpeechSnippet(text: text))
    }
}

/// Siri の設定（声で応答しない設定など）に関係なく、アプリ自身が声で読み上げる。
/// 読み上げは裏で続くので、Siri の画面が閉じても最後まで読む（バックグラウンド音声）。
@MainActor
final class IntentSpeaker: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = IntentSpeaker()
    private let synth = AVSpeechSynthesizer()
    override init() { super.init(); synth.delegate = self }

    func speak(_ text: String) {
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers])
        try? session.setActive(true)
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: "ja-JP")
        u.rate = 0.52
        // Siri の画面に文字が出てから読み始める
        u.preUtteranceDelay = 1.2
        synth.speak(u)
    }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) {
        Task { @MainActor in try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
    }
}

/// Siri の画面に出す文字（声はアプリが読む）
struct SpeechSnippet: View {
    let text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("渋滞ナビ", systemImage: "speaker.wave.2.fill").font(.caption.bold()).foregroundStyle(.green)
            Text(text).font(.subheadline)
        }.padding()
    }
}

struct JutaiShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: RoadTrafficIntent(),
            phrases: [
                "\(.applicationName)で\(\.$road)の渋滞情報を教えて",
                "\(.applicationName)で\(\.$road)の渋滞情報",
                "\(.applicationName)で\(\.$road)の渋滞",
                "\(.applicationName)で\(\.$road)の交通情報",
                "\(.applicationName)、\(\.$road)の渋滞情報を教えて",
                "\(.applicationName)、\(\.$road)の渋滞",
                "\(.applicationName)で\(\.$road)",
                "\(.applicationName)、\(\.$road)",
                "\(.applicationName) \(\.$road)",
                "\(.applicationName)で\(\.$road)は？",
                "\(.applicationName)で\(\.$road)の状況",
                "\(\.$road)の渋滞を\(.applicationName)で",
                "\(\.$road)の渋滞情報を\(.applicationName)で教えて",
            ],
            shortTitle: "高速道路の渋滞",
            systemImageName: "car.2.fill"
        )
        AppShortcut(
            intent: FavoriteTrafficIntent(),
            phrases: [
                "\(.applicationName)の渋滞情報",
                "\(.applicationName)で渋滞情報を教えて",
                "\(.applicationName)で渋滞",
                "\(.applicationName)",
            ],
            shortTitle: "いつもの道路",
            systemImageName: "star.fill"
        )
    }
}
