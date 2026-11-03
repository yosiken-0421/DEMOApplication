import AppIntents
import Foundation

/// Siri から頼まれた操作を画面に渡す
@MainActor
final class AppRouter: ObservableObject {
    static let shared = AppRouter()
    enum Action: Equatable {
        case home, work, parking, highway
        case search(String)
    }
    @Published var pending: Action?
}

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

struct GoHomeIntent: AppIntent {
    static var title: LocalizedStringResource = "自宅へナビ"
    static var description = IntentDescription("登録した自宅までのルート案内を始めます。")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        AppRouter.shared.pending = .home
        return .result()
    }
}

struct GoWorkIntent: AppIntent {
    static var title: LocalizedStringResource = "職場へナビ"
    static var description = IntentDescription("登録した職場までのルート案内を始めます。")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        AppRouter.shared.pending = .work
        return .result()
    }
}

struct ParkingIntent: AppIntent {
    static var title: LocalizedStringResource = "駐車位置"
    static var description = IntentDescription("記録した駐車位置を表示します。")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        AppRouter.shared.pending = .parking
        return .result()
    }
}

struct SearchPlaceIntent: AppIntent {
    static var title: LocalizedStringResource = "目的地を探す"
    static var description = IntentDescription("言った場所を検索してルートを表示します。")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "目的地", requestValueDialog: IntentDialog("どこへ行きますか？"))
    var place: String

    @MainActor
    func perform() async throws -> some IntentResult {
        AppRouter.shared.pending = .search(place)
        return .result()
    }
}

/// 「Hey Siri、ミチナビで外環の渋滞」→ アプリを開かずに読み上げ
struct HighwayTrafficIntent: AppIntent {
    static var title: LocalizedStringResource = "高速道路の渋滞情報"
    static var description = IntentDescription("指定した高速道路の渋滞・事故・規制を読み上げます。")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "高速道路", requestValueDialog: IntentDialog("どの高速道路ですか？"))
    var road: Road

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

struct MichiShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: GoHomeIntent(),
            phrases: ["\(.applicationName)で家に帰る", "\(.applicationName)で自宅へ", "\(.applicationName)、家に帰る"],
            shortTitle: "自宅へ",
            systemImageName: "house.fill"
        )
        AppShortcut(
            intent: GoWorkIntent(),
            phrases: ["\(.applicationName)で職場へ", "\(.applicationName)で会社へ"],
            shortTitle: "職場へ",
            systemImageName: "building.2.fill"
        )
        AppShortcut(
            intent: HighwayTrafficIntent(),
            phrases: [
                "\(.applicationName)で\(\.$road)の渋滞",
                "\(.applicationName)で\(\.$road)の渋滞情報",
                "\(.applicationName)、\(\.$road)の渋滞",
            ],
            shortTitle: "高速の渋滞",
            systemImageName: "car.2.fill"
        )
        AppShortcut(
            intent: ParkingIntent(),
            phrases: ["\(.applicationName)で駐車位置", "\(.applicationName)で車はどこ"],
            shortTitle: "駐車位置",
            systemImageName: "parkingsign.circle.fill"
        )
        AppShortcut(
            intent: SearchPlaceIntent(),
            phrases: ["\(.applicationName)で目的地を探す", "\(.applicationName)でナビ"],
            shortTitle: "目的地を探す",
            systemImageName: "magnifyingglass"
        )
    }
}
