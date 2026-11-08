import Foundation

/// 予約したい通知 1 件分（UserNotifications に依存しない表現）。
public struct PlannedNotification: Hashable, Sendable {
    public enum Trigger: Hashable, Sendable {
        case once(Date)
        case daily(hour: Int, minute: Int)
        case weekly(weekday: Int, hour: Int, minute: Int)

        public var isRepeating: Bool {
            if case .once = self { return false }
            return true
        }
    }

    public var id: String
    public var title: String
    public var body: String
    public var trigger: Trigger
    public var threadID: String

    public init(id: String, title: String, body: String, trigger: Trigger, threadID: String = "") {
        self.id = id
        self.title = title
        self.body = body
        self.trigger = trigger
        self.threadID = threadID
    }
}

public struct NotificationPlan: Sendable {
    public var selected: [PlannedNotification]
    /// 上限のため今回は予約できなかったもの（次回の再スケジュールで予約される）
    public var dropped: [PlannedNotification]
}

/// iOS のローカル通知は 1 アプリあたり 64 件までしか予約できない。
/// 繰り返し（毎日・毎週）は 1 件で済むので先に確保し、残りを「近い順」に詰める。
public enum NotificationPlanner {
    public static let systemLimit = 64

    public static func plan(_ all: [PlannedNotification], now: Date, limit: Int = systemLimit) -> NotificationPlan {
        // 同じ ID は最初の 1 件だけ
        var seen = Set<String>()
        let unique = all.filter { seen.insert($0.id).inserted }

        let repeating = unique.filter { $0.trigger.isRepeating }.sorted { $0.id < $1.id }
        let once: [(Date, PlannedNotification)] = unique.compactMap {
            if case let .once(d) = $0.trigger, d > now { return (d, $0) }
            return nil
        }.sorted { $0.0 == $1.0 ? $0.1.id < $1.1.id : $0.0 < $1.0 }

        let ordered = repeating + once.map(\.1)
        let cap = max(0, limit)
        return NotificationPlan(selected: Array(ordered.prefix(cap)), dropped: Array(ordered.dropFirst(cap)))
    }
}
