import Foundation

/// コイン・ゲーム用の「1 日」の計算。リセット時刻（例 4:00）で日付が切り替わる。
public enum GameDay {
    /// now 以前で最も新しいリセット時刻。
    public static func lastReset(before now: Date, hour: Int, minute: Int, calendar: Calendar = .current) -> Date {
        let today = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: now) ?? now
        if today <= now { return today }
        return calendar.date(byAdding: .day, value: -1, to: today) ?? today
    }

    /// now より後で最初のリセット時刻。
    public static func nextReset(after now: Date, hour: Int, minute: Int, calendar: Calendar = .current) -> Date {
        let last = lastReset(before: now, hour: hour, minute: minute, calendar: calendar)
        return calendar.date(byAdding: .day, value: 1, to: last) ?? last
    }

    /// 「今日やった」状態か（最後のリセット以降にチェックしたか）。
    public static func isDone(doneAt: Date?, now: Date, hour: Int, minute: Int, calendar: Calendar = .current) -> Bool {
        guard let doneAt else { return false }
        return doneAt >= lastReset(before: now, hour: hour, minute: minute, calendar: calendar) && doneAt <= now
    }

    /// 「待てば無料」の回復時刻。
    public static func waitFreeReady(startedAt: Date, hours: Double) -> Date {
        startedAt.addingTimeInterval(hours * 3600)
    }
}
