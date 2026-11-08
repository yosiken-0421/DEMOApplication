import Foundation

/// 1 項目に複数設定できるリマインダー。
public struct ReminderRule: Codable, Hashable, Identifiable, Sendable {
    public enum Kind: Codable, Hashable, Sendable {
        /// ◯日前の hh:mm（0 = 当日）
        case daysBefore(days: Int, hour: Int, minute: Int)
        /// 発売／更新時刻の◯分前（0 = ちょうど）
        case minutesBefore(minutes: Int)
    }

    public var id: UUID
    public var kind: Kind

    public init(id: UUID = UUID(), kind: Kind) {
        self.id = id
        self.kind = kind
    }

    public var label: String {
        switch kind {
        case let .daysBefore(days, h, m):
            let t = String(format: "%d:%02d", h, m)
            switch days {
            case 0: return "当日 \(t)"
            case 1: return "前日 \(t)"
            default: return "\(days)日前 \(t)"
            }
        case let .minutesBefore(mins):
            if mins == 0 { return "時刻ちょうど" }
            if mins % 60 == 0 { return "\(mins / 60)時間前" }
            return "\(mins)分前"
        }
    }

    /// 対象日時に対する通知日時。
    public func fireDate(for target: Date, calendar: Calendar = .current) -> Date? {
        switch kind {
        case let .daysBefore(days, h, m):
            let day = calendar.startOfDay(for: target)
            guard let base = calendar.date(byAdding: .day, value: -days, to: day) else { return nil }
            return calendar.date(bySettingHour: h, minute: m, second: 0, of: base)
        case let .minutesBefore(mins):
            return target.addingTimeInterval(TimeInterval(-mins * 60))
        }
    }

    /// 毎週の番組（weekday 1=日曜, hour, minute）に対して、繰り返し通知の曜日・時刻を求める。
    public func weeklyTrigger(weekday: Int, hour: Int, minute: Int) -> (weekday: Int, hour: Int, minute: Int) {
        let week = 7 * 24 * 60
        let base = (weekday - 1) * 24 * 60 + hour * 60 + minute
        var t: Int
        switch kind {
        case let .daysBefore(days, h, m):
            t = ((weekday - 1 - days) * 24 * 60) + h * 60 + m
        case let .minutesBefore(mins):
            t = base - mins
        }
        t = ((t % week) + week) % week
        return (t / (24 * 60) + 1, (t % (24 * 60)) / 60, t % 60)
    }

    // プリセット
    public static func sevenDaysBefore() -> Self { .init(kind: .daysBefore(days: 7, hour: 9, minute: 0)) }
    public static func threeDaysBefore() -> Self { .init(kind: .daysBefore(days: 3, hour: 9, minute: 0)) }
    public static func dayBefore() -> Self { .init(kind: .daysBefore(days: 1, hour: 20, minute: 0)) }
    public static func morningOf() -> Self { .init(kind: .daysBefore(days: 0, hour: 7, minute: 0)) }
    public static func atTime() -> Self { .init(kind: .minutesBefore(minutes: 0)) }

    /// 発売日（時刻なし）向けの既定
    public static var defaultForDate: [Self] { [threeDaysBefore(), dayBefore(), morningOf()] }
    /// 放送・配信（時刻あり）向けの既定
    public static var defaultForTimed: [Self] { [dayBefore(), .init(kind: .minutesBefore(minutes: 30)), atTime()] }
}
