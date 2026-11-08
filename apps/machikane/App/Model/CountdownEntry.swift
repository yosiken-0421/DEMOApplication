import Foundation
import MachikaneCore

/// 一覧・今日タブ・カレンダー・ウィジェットで共通に使う「1 行」。
struct CountdownEntry: Identifiable {
    enum Ref {
        case item(TrackedItem)
        case timer(GameTimer)
    }

    let id: String
    let ref: Ref
    let category: ItemCategory
    let title: String
    let subtitle: String
    let date: Date?
    let hasTime: Bool
    let undeterminedText: String
    let startDate: Date
    let kindLabel: String
    let source: DateSource
    let fetchedAt: Date?
    let possiblyUncertain: Bool
    let imageURL: URL?

    var item: TrackedItem? { if case let .item(i) = ref { return i } else { return nil } }
    var timer: GameTimer? { if case let .timer(t) = ref { return t } else { return nil } }

    func section(now: Date) -> CountdownSection { Countdown.section(for: date, now: now) }
}

enum EntryBuilder {
    static func entries(items: [TrackedItem], timers: [GameTimer], now: Date = Date()) -> [CountdownEntry] {
        var out: [CountdownEntry] = []
        for item in items where !item.isArchived {
            let src = item.targetSource
            var subtitle = item.subtitle
            if item.category == .manga, item.isAwaitingNextVolume {
                subtitle = "\(item.ownedVolume)巻まで所持・次巻の情報待ち"
            }
            out.append(CountdownEntry(
                id: "item-\(item.id.uuidString)",
                ref: .item(item),
                category: item.category,
                title: item.title,
                subtitle: subtitle,
                date: item.isAwaitingNextVolume ? nil : item.targetDate(now: now),
                hasTime: item.targetHasTime,
                undeterminedText: item.isAwaitingNextVolume ? "次巻の発売日は未発表" : item.undeterminedText,
                startDate: item.createdAt,
                kindLabel: item.targetKindLabel,
                source: src.source,
                fetchedAt: src.fetchedAt,
                possiblyUncertain: item.isPossiblyUncertain,
                imageURL: item.imageURL))
        }
        for t in timers {
            if let start = t.eventStart, start > now {
                out.append(timerEntry(t, id: "start", title: "\(t.name)：\(t.eventName.isEmpty ? "イベント" : t.eventName) 開始", date: start, kind: "イベント開始"))
            }
            if let end = t.eventEnd, end > now.addingTimeInterval(-86400) {
                out.append(timerEntry(t, id: "end", title: "\(t.name)：\(t.eventName.isEmpty ? "イベント" : t.eventName) 終了", date: end, kind: "イベント終了"))
            }
            if let ready = t.waitFreeReadyAt, ready > now {
                out.append(timerEntry(t, id: "wait", title: "\(t.name)：待てば無料", date: ready, kind: "回復"))
            }
        }
        return out
    }

    private static func timerEntry(_ t: GameTimer, id: String, title: String, date: Date, kind: String) -> CountdownEntry {
        CountdownEntry(id: "timer-\(t.id.uuidString)-\(id)", ref: .timer(t), category: .coin, title: title,
                       subtitle: t.memo, date: date, hasTime: true, undeterminedText: "", startDate: t.createdAt,
                       kindLabel: kind, source: .manual, fetchedAt: nil, possiblyUncertain: false, imageURL: nil)
    }

    /// 近い順（未確定は最後）
    static func sorted(_ e: [CountdownEntry]) -> [CountdownEntry] {
        e.sorted { a, b in
            switch (a.date, b.date) {
            case let (x?, y?): return x < y
            case (.some, nil): return true
            case (nil, .some): return false
            case (nil, nil): return a.title < b.title
            }
        }
    }
}

extension Date {
    var mkDateTimeText: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = "yyyy/M/d(E) H:mm"
        return f.string(from: self)
    }

    var mkDateText: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = "yyyy/M/d(E)"
        return f.string(from: self)
    }

    var mkTimeText: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = "H:mm"
        return f.string(from: self)
    }

    /// 日本時間の年月日で ParsedDate にする
    var mkParsed: ParsedDate {
        let c = MKCalendar.japan.dateComponents([.year, .month, .day], from: self)
        return .exact(year: c.year ?? 0, month: c.month ?? 0, day: c.day ?? 0)
    }
}

enum WeekdayText {
    static let names = ["日", "月", "火", "水", "木", "金", "土"]
    static func name(_ weekday: Int) -> String { (1...7).contains(weekday) ? names[weekday - 1] : "-" }
}
