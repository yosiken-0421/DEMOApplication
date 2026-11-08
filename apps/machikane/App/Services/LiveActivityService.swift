import Foundation
import ActivityKit
import MachikaneCore

/// 当日の「残り時間」を Live Activity（ロック画面・Dynamic Island）に表示する。
@MainActor
final class LiveActivityService {
    var isAvailable: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    /// 24 時間以内に時刻のある予定がある項目だけ開始できる
    func canStart(_ item: TrackedItem, now: Date = Date()) -> Bool {
        guard isAvailable, item.targetHasTime, let t = item.targetDate(now: now) else { return false }
        return t > now && t.timeIntervalSince(now) <= 24 * 3600
    }

    func isRunning(_ item: TrackedItem) -> Bool {
        Activity<CountdownActivityAttributes>.activities.contains { $0.attributes.title == item.title && $0.activityState == .active }
    }

    func start(_ item: TrackedItem) throws {
        guard let t = item.targetDate() else { return }
        let attrs = CountdownActivityAttributes(title: item.title, categoryRaw: item.categoryRaw)
        let state = CountdownActivityAttributes.ContentState(target: t, subtitle: item.targetKindLabel)
        _ = try Activity.request(attributes: attrs,
                                 content: ActivityContent(state: state, staleDate: t.addingTimeInterval(3600)),
                                 pushType: nil)
    }

    func stop(_ item: TrackedItem) {
        for a in Activity<CountdownActivityAttributes>.activities where a.attributes.title == item.title {
            Task { await a.end(nil, dismissalPolicy: .immediate) }
        }
    }

    /// 時刻を過ぎたものを終了
    func endFinished(now: Date = Date()) {
        for a in Activity<CountdownActivityAttributes>.activities where a.content.state.target < now.addingTimeInterval(-600) {
            Task { await a.end(nil, dismissalPolicy: .default) }
        }
    }
}
