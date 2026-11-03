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

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let text: String
        do {
            let snap = try await TrafficService.shared.road(road)
            text = TrafficText.speech(road: road, items: snap.items, updated: snap.updated)
        } catch {
            text = "交通情報を取得できませんでした。少し時間をおいてもう一度聞いてください。"
        }
        return .result(dialog: IntentDialog(stringLiteral: text))
    }
}

/// 「Hey Siri、渋滞ナビの渋滞情報」→ いつもの道路（アプリで設定）を読み上げ
struct FavoriteTrafficIntent: AppIntent {
    static var title: LocalizedStringResource = "いつもの道路の渋滞情報"
    static var description = IntentDescription("アプリで登録した「いつもの道路」の渋滞情報を読み上げます。")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let text: String
        do {
            if let first = RouteStore.load().first {
                text = try await RouteTrafficIntent.speech(for: first)
                return .result(dialog: IntentDialog(stringLiteral: text))
            }
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
        return .result(dialog: IntentDialog(stringLiteral: text))
    }
}

// MARK: - 登録した区間

struct RouteEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "区間"
    static var defaultQuery = RouteQuery()
    let id: UUID
    let name: String
    let summary: String
    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)", subtitle: "\(summary)")
    }
    init(_ r: SavedRoute) { id = r.id; name = r.name; summary = r.summary }
}

struct RouteQuery: EntityStringQuery {
    func entities(for identifiers: [UUID]) async throws -> [RouteEntity] {
        RouteStore.load().filter { identifiers.contains($0.id) }.map(RouteEntity.init)
    }
    func suggestedEntities() async throws -> [RouteEntity] { RouteStore.load().map(RouteEntity.init) }
    func entities(matching string: String) async throws -> [RouteEntity] {
        let q = TrafficText.normalize(string)
        return RouteStore.load().filter {
            let n = TrafficText.normalize($0.name)
            return n.contains(q) || q.contains(n)
        }.map(RouteEntity.init)
    }
}

/// 「Hey Siri、渋滞ナビで通勤の渋滞」→ 登録した区間の上の情報だけを走る順に
struct RouteTrafficIntent: AppIntent {
    static var title: LocalizedStringResource = "登録した区間の渋滞情報"
    static var description = IntentDescription("登録した区間（例：佐倉IC→和光北IC）の上の渋滞・事故・規制を走る順に読み上げます。")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "区間", requestValueDialog: IntentDialog("どの区間ですか？"))
    var route: RouteEntity

    init() {}

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let text: String
        if let r = RouteStore.find(route.id) {
            do { text = try await Self.speech(for: r) }
            catch { text = "交通情報を取得できませんでした。少し時間をおいてもう一度聞いてください。" }
        } else {
            text = "その区間が見つかりませんでした。アプリで区間を登録してください。"
        }
        return .result(dialog: IntentDialog(stringLiteral: text))
    }

    static func speech(for r: SavedRoute) async throws -> String {
        async let snap = TrafficService.shared.route(r)
        async let eta = RouteMapKit.eta(r.waypoints)
        let s = try await snap
        return TrafficText.routeSpeech(route: r, items: s.items, updated: s.updated, etaMinutes: await eta)
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

// MARK: - 道路と区間をまとめた「聞く対象」（呼び方を1つにして、選択画面が出ないようにする）

struct TargetEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "道路・区間"
    static var defaultQuery = TargetQuery()
    let id: String          // "route:UUID" または "road:gaikan"
    let name: String
    let subtitle: String
    let synonyms: [String]
    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)", subtitle: "\(subtitle)", synonyms: synonyms.map { "\($0)" })
    }
    init(route r: SavedRoute) {
        id = "route:" + r.id.uuidString; name = r.name; subtitle = r.summary
        let short = TrafficText.normalize(r.name).replacingOccurrences(of: " ", with: "")
        synonyms = short == r.name ? [] : [short]
    }
    init(road: Road) {
        id = "road:" + road.rawValue; name = road.title; subtitle = "路線全体"; synonyms = road.synonyms
    }
    static func all() -> [TargetEntity] {
        RouteStore.load().map { TargetEntity(route: $0) } + Road.allCases.map { TargetEntity(road: $0) }
    }
}

struct TargetQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [TargetEntity] {
        TargetEntity.all().filter { identifiers.contains($0.id) }
    }
    func suggestedEntities() async throws -> [TargetEntity] { TargetEntity.all() }
    func entities(matching string: String) async throws -> [TargetEntity] {
        let q = TrafficText.normalize(string)
        // 区間の名前を先に探す（「通勤」など）
        let routes = RouteStore.load().filter {
            let n = TrafficText.normalize($0.name)
            return !n.isEmpty && (q.contains(n) || n.contains(q))
        }.map { TargetEntity(route: $0) }
        if !routes.isEmpty { return routes }
        if let road = Road.find(in: q) { return [TargetEntity(road: road)] }
        return []
    }
}

/// 「Hey Siri、渋滞ナビで通勤の渋滞情報を教えて」「〜で首都高の渋滞」
/// 名前が区間なら区間、道路なら路線全体。聞き取れなかったら「いつもの」を読み上げる（選択画面は出さない）
struct TrafficTargetIntent: AppIntent {
    static var title: LocalizedStringResource = "渋滞情報を聞く"
    static var description = IntentDescription("登録した区間、または高速道路の渋滞・事故・規制を読み上げます。")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "道路・区間")
    var target: TargetEntity?

    init() {}

    func perform() async throws -> some IntentResult & ProvidesDialog {
        var text: String
        do {
            if let t = target, t.id.hasPrefix("route:"), let id = UUID(uuidString: String(t.id.dropFirst(6))), let r = RouteStore.find(id) {
                text = try await RouteTrafficIntent.speech(for: r)
            } else if let t = target, t.id.hasPrefix("road:"), let road = Road(rawValue: String(t.id.dropFirst(5))) {
                let snap = try await TrafficService.shared.road(road)
                text = TrafficText.speech(road: road, items: snap.items, updated: snap.updated)
            } else if let first = RouteStore.load().first {
                text = try await RouteTrafficIntent.speech(for: first)
            } else {
                let road = Favorites.load().first ?? .gaikan
                let snap = try await TrafficService.shared.road(road)
                text = TrafficText.speech(road: road, items: snap.items, updated: snap.updated)
            }
        } catch {
            text = "交通情報を取得できませんでした。少し時間をおいてもう一度聞いてください。"
        }
        return .result(dialog: IntentDialog(stringLiteral: text))
    }
}

struct JutaiShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: TrafficTargetIntent(),
            phrases: [
                "\(.applicationName)で\(\.$target)の渋滞情報を教えて",
                "\(.applicationName)で\(\.$target)の渋滞情報",
                "\(.applicationName)で\(\.$target)の渋滞",
                "\(.applicationName)で\(\.$target)の交通情報",
                "\(.applicationName)、\(\.$target)の渋滞情報を教えて",
                "\(.applicationName)、\(\.$target)の渋滞",
                "\(.applicationName)で\(\.$target)",
                "\(.applicationName)、\(\.$target)",
                "\(.applicationName) \(\.$target)",
                "\(.applicationName)で\(\.$target)は？",
                "\(.applicationName)で\(\.$target)の状況",
                "\(\.$target)の渋滞を\(.applicationName)で",
                "\(\.$target)の渋滞情報を\(.applicationName)で教えて",
            ],
            shortTitle: "渋滞情報",
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
            shortTitle: "いつもの",
            systemImageName: "star.fill"
        )
    }
}
