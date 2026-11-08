import Foundation
import EventKit
import MachikaneCore

/// iPhone 標準カレンダーへの登録。
///
/// Apple のドキュメント（Accessing the event store）によると、書き込み専用アクセスでは
/// 「自分のアプリが作ったイベントも含めて読めない」ため、登録済みイベントの更新・削除はできない。
/// そのため：
///  - 既定は書き込み専用（登録だけ）
///  - 設定で「フルアクセス」を許可した場合のみ、日付変更時の更新・削除を自動で行う
///  - 書き込み専用のまま日付が変わったら、項目に「カレンダーの予定が古いまま」と表示して知らせる
@MainActor
final class CalendarService {
    enum CalendarError: LocalizedError {
        case noAccess, noCalendar, noDate
        var errorDescription: String? {
            switch self {
            case .noAccess: return "カレンダーへのアクセスが許可されていません"
            case .noCalendar: return "登録先のカレンダーが見つかりません"
            case .noDate: return "日付が確定していないため登録できません"
            }
        }
    }

    private(set) var store = EKEventStore()

    var status: EKAuthorizationStatus { EKEventStore.authorizationStatus(for: .event) }
    var canWrite: Bool { status == .writeOnly || status == .fullAccess }
    var hasFullAccess: Bool { status == .fullAccess }
    var isDenied: Bool { status == .denied || status == .restricted }

    var statusText: String {
        switch status {
        case .fullAccess: return "フルアクセス（登録・更新・削除）"
        case .writeOnly: return "書き込みのみ（登録だけ）"
        case .denied: return "許可されていません"
        case .restricted: return "制限されています"
        case .notDetermined: return "未設定"
        default: return "不明"
        }
    }

    func requestWriteOnly() async -> Bool {
        let ok = (try? await store.requestWriteOnlyAccessToEvents()) ?? false
        store = EKEventStore()
        return ok
    }

    func requestFullAccess() async -> Bool {
        let ok = (try? await store.requestFullAccessToEvents()) ?? false
        store = EKEventStore()
        return ok
    }

    /// 登録（フルアクセスで既存があれば更新）
    func register(_ item: TrackedItem) throws {
        guard canWrite else { throw CalendarError.noAccess }
        guard let target = item.targetDate() else { throw CalendarError.noDate }

        var event: EKEvent?
        if hasFullAccess, !item.calendarEventID.isEmpty {
            event = store.event(withIdentifier: item.calendarEventID)
        }
        let ev = event ?? EKEvent(eventStore: store)
        if event == nil {
            guard let cal = store.defaultCalendarForNewEvents else { throw CalendarError.noCalendar }
            ev.calendar = cal
        }
        fill(ev, item: item, target: target)
        try store.save(ev, span: .thisEvent, commit: true)
        item.calendarEventID = ev.eventIdentifier ?? ""
        item.calendarRegisteredDate = target
        item.calendarNeedsManualFix = false
    }

    /// 削除（フルアクセスのときのみ可能）。戻り値: 削除できたか
    @discardableResult
    func remove(_ item: TrackedItem) -> Bool {
        guard !item.calendarEventID.isEmpty else { return true }
        guard hasFullAccess, let ev = store.event(withIdentifier: item.calendarEventID) else { return false }
        do {
            try store.remove(ev, span: .thisEvent, commit: true)
            item.calendarEventID = ""
            item.calendarRegisteredDate = nil
            return true
        } catch {
            return false
        }
    }

    /// 日付が変わったときの同期
    func syncAfterDateChange(_ item: TrackedItem) {
        guard !item.calendarEventID.isEmpty || item.calendarRegisteredDate != nil else { return }
        guard let target = item.targetDate(), target != item.calendarRegisteredDate else { return }
        if hasFullAccess {
            do { try register(item) } catch { item.calendarNeedsManualFix = true }
        } else {
            item.calendarNeedsManualFix = true
        }
    }

    private func fill(_ ev: EKEvent, item: TrackedItem, target: Date) {
        ev.title = "\(item.title)（\(item.targetKindLabel)）"
        let src = item.targetSource
        var notes = "まちかね で登録\n出典：\(src.source.displayName)"
        if let f = src.fetchedAt { notes += "（\(f.mkDateTimeText) 取得）" }
        if item.isPossiblyUncertain { notes += "\n※日付未確定の可能性あり" }
        ev.notes = notes
        if let url = item.streamingURL { ev.url = url }
        if item.targetHasTime {
            ev.isAllDay = false
            ev.startDate = target
            ev.endDate = target.addingTimeInterval(30 * 60)
        } else {
            ev.isAllDay = true
            ev.startDate = target
            ev.endDate = target
        }
        ev.alarms?.forEach { ev.removeAlarm($0) }
        if item.calendarAlarm {
            // 時刻ありは開始時刻、終日は当日 9:00
            ev.addAlarm(EKAlarm(relativeOffset: item.targetHasTime ? 0 : 9 * 3600))
        }
    }
}
