import Foundation

public enum CountdownSection: Int, CaseIterable, Comparable, Sendable {
    case today, tomorrow, thisWeek, later, undetermined, past

    public static func < (a: Self, b: Self) -> Bool { a.rawValue < b.rawValue }

    public var title: String {
        switch self {
        case .today: return "今日"
        case .tomorrow: return "明日"
        case .thisWeek: return "今週（7日以内）"
        case .later: return "それ以降"
        case .undetermined: return "予定（日付未確定）"
        case .past: return "終わったもの"
        }
    }
}

public enum Countdown {
    /// 暦の上で何日後か（時刻は無視）。今日 = 0、明日 = 1、昨日 = -1。
    public static func daysUntil(_ target: Date, from now: Date, calendar: Calendar = .current) -> Int {
        let a = calendar.startOfDay(for: now)
        let b = calendar.startOfDay(for: target)
        return calendar.dateComponents([.day], from: a, to: b).day ?? 0
    }

    public static func section(for target: Date?, now: Date, calendar: Calendar = .current) -> CountdownSection {
        guard let target else { return .undetermined }
        let d = daysUntil(target, from: now, calendar: calendar)
        switch d {
        case ..<0: return .past
        case 0: return .today
        case 1: return .tomorrow
        case 2...6: return .thisWeek
        default: return .later
        }
    }

    /// 「あと◯日」。当日は時刻があれば「あと◯時間◯分」、時刻を過ぎた／時刻なしなら「今日！」。
    public static func label(for target: Date, hasTime: Bool, now: Date, calendar: Calendar = .current) -> String {
        let d = daysUntil(target, from: now, calendar: calendar)
        if d > 0 { return "あと\(d)日" }
        if d < 0 { return "\(-d)日前" }
        if hasTime, target > now {
            let mins = Int(ceil(target.timeIntervalSince(now) / 60))
            let h = mins / 60, m = mins % 60
            return h > 0 ? "あと\(h)時間\(m)分" : "あと\(m)分"
        }
        return "今日！"
    }

    /// 大きく表示する数字部分と単位（カード・ウィジェット用）。
    public static func bigNumber(for target: Date, hasTime: Bool, now: Date, calendar: Calendar = .current) -> (number: String, unit: String) {
        let d = daysUntil(target, from: now, calendar: calendar)
        if d > 0 { return ("\(d)", "日") }
        if d < 0 { return ("\(-d)", "日前") }
        if hasTime, target > now {
            let mins = Int(ceil(target.timeIntervalSince(now) / 60))
            return mins >= 60 ? ("\(mins / 60)", "時間") : ("\(mins)", "分")
        }
        return ("今日", "")
    }

    /// 登録日から当日までの経過割合（0〜1）。
    public static func progress(start: Date, target: Date, now: Date) -> Double {
        let total = target.timeIntervalSince(start)
        guard total > 0 else { return 1 }
        return min(1, max(0, now.timeIntervalSince(start) / total))
    }

    /// 毎週◯曜◯時の次の回（now より後）。weekday は 1=日曜 … 7=土曜。
    public static func nextWeekly(weekday: Int, hour: Int, minute: Int, after now: Date, calendar: Calendar = .current) -> Date? {
        guard (1...7).contains(weekday) else { return nil }
        let comps = DateComponents(hour: hour, minute: minute, weekday: weekday)
        return calendar.nextDate(after: now, matching: comps, matchingPolicy: .nextTime)
    }
}
