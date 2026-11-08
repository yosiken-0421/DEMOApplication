import Foundation
import SwiftData
import MachikaneCore

/// 漫画・アニメ・手入力の項目（カウントダウン対象）。
@Model
final class TrackedItem {
    var id: UUID = UUID()
    var categoryRaw: String = ItemCategory.manga.rawValue
    var title: String = ""
    var subtitle: String = ""
    var imageURLString: String = ""
    var createdAt: Date = Date()
    var memo: String = ""
    var isArchived: Bool = false

    // 主な日付（漫画なら紙の発売日、アニメなら放送・配信日時、手入力ならその日時）
    var mainDate: Date?
    var mainDateText: String = ""      // 未確定のときの元の文字列（例「2026年12月上旬」）
    var hasTime: Bool = false
    var mainSourceRaw: String = DateSource.manual.rawValue
    var mainFetchedAt: Date?
    var isManualOverride: Bool = false
    var observationsData: Data?        // [SourceObservation]（ダブルチェック用）
    var chosenSourceRaw: String = ""   // 不一致のときユーザーが選んだ出典

    // 漫画
    var isbn: String = ""
    var publisher: String = ""
    var seriesKeyword: String = ""
    var ownedVolume: Int = 0
    var targetVolume: Int = 0
    var digitalISBN: String = ""
    var digitalDate: Date?
    var digitalDateText: String = ""
    var digitalSourceRaw: String = ""
    var digitalFetchedAt: Date?
    var useDigitalDate: Bool = false   // カウントダウンを電子の配信日で行う
    var reserveDate: Date?             // 予約開始日（手入力）
    var notifyOnReserve: Bool = false  // true: 予約開始日で知らせる

    // アニメ（毎週◯曜◯時）
    var weekday: Int = 0               // 0 = 毎週ではない、1=日曜 … 7=土曜
    var hour: Int = 0
    var minute: Int = 0
    var station: String = ""
    var streamingService: String = ""
    var streamingURLString: String = ""
    var watchedEpisode: Int = 0
    var totalEpisodes: Int = 0
    var annictWorkID: Int = 0
    var nextEpisodeText: String = ""

    // 通知
    var remindersData: Data?
    var dailyCountdownEnabled: Bool = false
    var dailyCountdownDays: Int = 7
    var dailyCountdownHour: Int = 8
    var dailyCountdownMinute: Int = 0

    // カレンダー
    var calendarEventID: String = ""
    var calendarAlarm: Bool = false
    var calendarRegisteredDate: Date?
    var calendarNeedsManualFix: Bool = false

    init(category: ItemCategory, title: String) {
        self.id = UUID()
        self.categoryRaw = category.rawValue
        self.title = title
        self.createdAt = Date()
    }

    // MARK: - 計算プロパティ

    var category: ItemCategory {
        get { ItemCategory(rawValue: categoryRaw) ?? .manga }
        set { categoryRaw = newValue.rawValue }
    }

    var mainSource: DateSource {
        get { DateSource(rawValue: mainSourceRaw) ?? .manual }
        set { mainSourceRaw = newValue.rawValue }
    }

    var chosenSource: DateSource? {
        get { DateSource(rawValue: chosenSourceRaw) }
        set { chosenSourceRaw = newValue?.rawValue ?? "" }
    }

    var observations: [SourceObservation] {
        get { observationsData.flatMap { try? JSONDecoder().decode([SourceObservation].self, from: $0) } ?? [] }
        set { observationsData = try? JSONEncoder().encode(newValue) }
    }

    var reminders: [ReminderRule] {
        get { remindersData.flatMap { try? JSONDecoder().decode([ReminderRule].self, from: $0) } ?? [] }
        set { remindersData = try? JSONEncoder().encode(newValue) }
    }

    var isWeekly: Bool { (1...7).contains(weekday) }

    var streamingURL: URL? {
        let s = streamingURLString.trimmingCharacters(in: .whitespaces)
        guard let u = URL(string: s), let scheme = u.scheme?.lowercased(), scheme == "https" || scheme == "http" else { return nil }
        return u
    }

    var imageURL: URL? { imageURLString.isEmpty ? nil : URL(string: imageURLString) }

    /// 二重チェックの状態（漫画で取得データがあるときのみ意味がある）
    var checkStatus: DoubleCheckStatus { DoubleCheck.status(observations) }

    /// 不一致のまま選ばれていない
    var isPossiblyUncertain: Bool {
        !isManualOverride && checkStatus == .mismatch && chosenSource == nil
    }

    /// カウントダウン・通知に使う日時（未確定なら nil）。
    func targetDate(now: Date = Date()) -> Date? {
        if category == .manga {
            if notifyOnReserve, let r = reserveDate { return r }
            return useDigitalDate ? digitalDate : mainDate
        }
        if category == .anime, isWeekly {
            // 取得済みの次回放送が未来ならそれを、無ければ毎週の設定から
            if let d = mainDate, d > now.addingTimeInterval(-3600) { return d }
            return Countdown.nextWeekly(weekday: weekday, hour: hour, minute: minute, after: now.addingTimeInterval(-60))
        }
        return mainDate
    }

    /// 目標日時に時刻が含まれるか
    var targetHasTime: Bool {
        if category == .anime, isWeekly { return true }
        if category == .manga { return false }
        return hasTime
    }

    /// どの日付で数えているかの説明
    var targetKindLabel: String {
        switch category {
        case .manga:
            if notifyOnReserve, reserveDate != nil { return "予約開始日" }
            return useDigitalDate ? "電子の配信日" : "紙の発売日"
        case .anime: return isWeekly ? "次の放送・配信" : "放送・配信日"
        case .coin: return "日時"
        }
    }

    /// 未確定のときに表示する文字列
    var undeterminedText: String {
        if category == .manga, useDigitalDate { return digitalDateText.isEmpty ? "日付未確定" : digitalDateText }
        return mainDateText.isEmpty ? "日付未確定" : mainDateText
    }

    /// 表示中の日付の出典と取得日時
    var targetSource: (source: DateSource, fetchedAt: Date?) {
        if category == .manga, notifyOnReserve, reserveDate != nil { return (.manual, nil) }
        if category == .manga, useDigitalDate {
            return (DateSource(rawValue: digitalSourceRaw) ?? .manual, digitalFetchedAt)
        }
        return (mainSource, mainFetchedAt)
    }

    /// 次巻待ち（所持巻が対象巻に追いついた）
    var isAwaitingNextVolume: Bool {
        category == .manga && targetVolume > 0 && ownedVolume >= targetVolume
    }
}
