import Foundation
import UserNotifications
import MachikaneCore

/// ローカル通知の組み立てと予約。
/// iOS の予約上限（64 件）を超える分は NotificationPlanner が近い順に絞り、
/// 漏れた件数を設定画面に表示する。起動時・フォアグラウンド復帰時・BGAppRefresh で再予約する。
@MainActor
final class NotificationService {
    static let planPrefix = "mk.plan."
    private let center = UNUserNotificationCenter.current()

    func authorizationStatus() async -> UNAuthorizationStatus {
        await center.notificationSettings().authorizationStatus
    }

    @discardableResult
    func requestAuthorization() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    /// すぐに知らせる（発売日確定・変更など）。予約枠を長く占有しない。
    func notifyNow(title: String, body: String) {
        let c = UNMutableNotificationContent()
        c.title = title
        c.body = body
        c.sound = .default
        let req = UNNotificationRequest(identifier: "mk.now.\(UUID().uuidString)", content: c,
                                        trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false))
        center.add(req)
    }

    /// 全項目から通知を組み立てて予約し直す。戻り値は（予約数, 上限で漏れた数）。
    func reschedule(items: [TrackedItem], timers: [GameTimer], now: Date = Date()) async -> (scheduled: Int, dropped: Int) {
        let planned = NotificationBuilder.build(items: items, timers: timers, now: now)
        // 「今すぐ」通知の枠を少し残す
        let plan = NotificationPlanner.plan(planned, now: now, limit: NotificationPlanner.systemLimit - 2)

        let pending = await center.pendingNotificationRequests()
        let ours = pending.map(\.identifier).filter { $0.hasPrefix(Self.planPrefix) }
        center.removePendingNotificationRequests(withIdentifiers: ours)

        for p in plan.selected {
            let c = UNMutableNotificationContent()
            c.title = p.title
            c.body = p.body
            c.sound = .default
            c.threadIdentifier = p.threadID
            let trigger: UNNotificationTrigger
            switch p.trigger {
            case let .once(date):
                let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
                trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
            case let .daily(h, m):
                trigger = UNCalendarNotificationTrigger(dateMatching: DateComponents(hour: h, minute: m), repeats: true)
            case let .weekly(w, h, m):
                trigger = UNCalendarNotificationTrigger(dateMatching: DateComponents(hour: h, minute: m, weekday: w), repeats: true)
            }
            try? await center.add(UNNotificationRequest(identifier: Self.planPrefix + p.id, content: c, trigger: trigger))
        }

        let d = UserDefaults.standard
        d.set(plan.selected.count, forKey: "notif.scheduled")
        d.set(plan.dropped.count, forKey: "notif.dropped")
        d.set(now, forKey: "notif.lastScheduledAt")
        return (plan.selected.count, plan.dropped.count)
    }
}

/// 項目・タイマーから PlannedNotification を作る（予約はしない）。
enum NotificationBuilder {
    static func build(items: [TrackedItem], timers: [GameTimer], now: Date) -> [PlannedNotification] {
        var out: [PlannedNotification] = []
        let cal = Calendar.current

        for item in items where !item.isArchived && !item.isAwaitingNextVolume {
            let key = item.id.uuidString
            let thread = "item.\(key)"
            let suffix = item.isPossiblyUncertain ? "（日付未確定の可能性あり）" : ""
            let verb = verbFor(item)

            // 毎週の放送・配信 → 繰り返し通知 1 件ずつ
            if item.category == .anime, item.isWeekly {
                let when = "毎週\(WeekdayText.name(item.weekday))曜 \(String(format: "%d:%02d", item.hour, item.minute))"
                for r in item.reminders {
                    let t = r.weeklyTrigger(weekday: item.weekday, hour: item.hour, minute: item.minute)
                    out.append(.init(id: "\(key).w.\(r.id.uuidString)", title: item.title,
                                     body: "\(verb)（\(when)）\(r.label == "時刻ちょうど" ? "の時間です" : "まで \(r.label)")",
                                     trigger: .weekly(weekday: t.weekday, hour: t.hour, minute: t.minute), threadID: thread))
                }
                continue
            }

            // 日付が確定していないものは通知しない
            guard let target = item.targetDate(now: now) else { continue }
            let dateText = item.targetHasTime ? target.mkDateTimeText : target.mkDateText

            for r in item.reminders {
                guard let fire = r.fireDate(for: target, calendar: cal), fire > now else { continue }
                let body: String
                let days = Countdown.daysUntil(target, from: fire, calendar: cal)
                if fire >= target.addingTimeInterval(-1) && item.targetHasTime {
                    body = "\(verb)の時間です（\(dateText)）\(suffix)"
                } else if days > 0 {
                    body = "\(verb)まであと\(days)日（\(dateText)）\(suffix)"
                } else {
                    body = "今日は\(verb)日です（\(dateText)）\(suffix)"
                }
                out.append(.init(id: "\(key).r.\(r.id.uuidString)", title: item.title, body: body, trigger: .once(fire), threadID: thread))
            }

            // 毎日カウントダウン（文言が日ごとに変わるので 1 日 1 件）
            if item.dailyCountdownEnabled, item.dailyCountdownDays > 0 {
                let targetDay = cal.startOfDay(for: target)
                for d in 1...min(item.dailyCountdownDays, 60) {
                    guard let day = cal.date(byAdding: .day, value: -d, to: targetDay),
                          let fire = cal.date(bySettingHour: item.dailyCountdownHour, minute: item.dailyCountdownMinute, second: 0, of: day),
                          fire > now else { continue }
                    out.append(.init(id: "\(key).daily.\(d)", title: item.title,
                                     body: "\(verb)まであと\(d)日（\(dateText)）\(suffix)", trigger: .once(fire), threadID: thread))
                }
            }
        }

        for t in timers {
            let key = t.id.uuidString
            let thread = "timer.\(key)"
            if t.dailyResetEnabled {
                out.append(.init(id: "\(key).reset", title: t.name, body: "デイリーがリセットされました",
                                 trigger: .daily(hour: t.resetHour, minute: t.resetMinute), threadID: thread))
            }
            if t.remindUndoneEnabled {
                let body = "今日の分がまだです（やったらアプリで「今日やった」をタップ）"
                if t.isDoneToday(now: now) {
                    // 今日の分は止め、次のリセット以降 7 日分を 1 回ずつ予約（次回起動時に繰り返しへ戻る）
                    let start = GameDay.nextReset(after: now, hour: t.resetHour, minute: t.resetMinute, calendar: cal)
                    var cursor = start.addingTimeInterval(-1)
                    for i in 0..<7 {
                        guard let fire = cal.nextDate(after: cursor, matching: DateComponents(hour: t.remindHour, minute: t.remindMinute), matchingPolicy: .nextTime) else { break }
                        out.append(.init(id: "\(key).undone.\(i)", title: t.name, body: body, trigger: .once(fire), threadID: thread))
                        cursor = fire
                    }
                } else {
                    out.append(.init(id: "\(key).undone", title: t.name, body: body,
                                     trigger: .daily(hour: t.remindHour, minute: t.remindMinute), threadID: thread))
                }
            }
            if let ready = t.waitFreeReadyAt, ready > now {
                out.append(.init(id: "\(key).wait", title: t.name, body: "待てば無料が回復しました", trigger: .once(ready), threadID: thread))
            }
            let ev = t.eventName.isEmpty ? "イベント" : t.eventName
            if let s = t.eventStart, s > now {
                out.append(.init(id: "\(key).evstart", title: t.name, body: "\(ev)が始まりました", trigger: .once(s), threadID: thread))
            }
            if let e = t.eventEnd {
                for h in t.eventNotifyHours where h > 0 {
                    let fire = e.addingTimeInterval(TimeInterval(-h * 3600))
                    if fire > now {
                        out.append(.init(id: "\(key).evend.\(h)", title: t.name, body: "\(ev)終了まであと\(h)時間（\(e.mkDateTimeText)）",
                                         trigger: .once(fire), threadID: thread))
                    }
                }
            }
        }
        return out
    }

    static func verbFor(_ item: TrackedItem) -> String {
        switch item.category {
        case .manga:
            if item.notifyOnReserve, item.reserveDate != nil { return "予約開始" }
            return item.useDigitalDate ? "配信" : "発売"
        case .anime: return "放送・配信"
        case .coin: return "当日"
        }
    }
}
