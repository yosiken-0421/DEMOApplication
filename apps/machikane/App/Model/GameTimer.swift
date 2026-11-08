import Foundation
import SwiftData
import MachikaneCore

/// マンガアプリ・ゲームのコイン用タイマー（1 アプリ = 1 件）。
@Model
final class GameTimer {
    var id: UUID = UUID()
    var name: String = ""
    var createdAt: Date = Date()
    var sortOrder: Int = 0
    var memo: String = ""

    // 待てば無料
    var waitFreeEnabled: Bool = true
    var waitFreeHours: Double = 23
    var waitFreeStartedAt: Date?

    // デイリーリセット
    var dailyResetEnabled: Bool = true
    var resetHour: Int = 0
    var resetMinute: Int = 0

    // やり忘れ通知（「今日やった」で当日分を止める）
    var remindUndoneEnabled: Bool = false
    var remindHour: Int = 21
    var remindMinute: Int = 0
    var doneAt: Date?

    // イベント期間
    var eventName: String = ""
    var eventStart: Date?
    var eventEnd: Date?
    var eventNotifyHoursData: Data?

    init(name: String) {
        self.id = UUID()
        self.name = name
        self.createdAt = Date()
    }

    var eventNotifyHours: [Int] {
        get { eventNotifyHoursData.flatMap { try? JSONDecoder().decode([Int].self, from: $0) } ?? [24, 3] }
        set { eventNotifyHoursData = try? JSONEncoder().encode(Array(Set(newValue)).sorted(by: >)) }
    }

    var waitFreeReadyAt: Date? {
        guard waitFreeEnabled, let s = waitFreeStartedAt else { return nil }
        return GameDay.waitFreeReady(startedAt: s, hours: waitFreeHours)
    }

    func isDoneToday(now: Date = Date()) -> Bool {
        GameDay.isDone(doneAt: doneAt, now: now, hour: resetHour, minute: resetMinute)
    }

    var hasEvent: Bool { eventEnd != nil }
}
