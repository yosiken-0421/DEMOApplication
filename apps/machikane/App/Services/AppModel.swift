import Foundation
import SwiftUI
import SwiftData
import UserNotifications
import WidgetKit
import BackgroundTasks
import UIKit
import MachikaneCore

/// アプリ全体の状態とサービス。
@Observable
@MainActor
final class AppModel {
    static let shared = AppModel()

    let notifications = NotificationService()
    let calendar = CalendarService()
    let refresher = Refresher()
    let liveActivities = LiveActivityService()

    let container: ModelContainer

    var notificationStatus: UNAuthorizationStatus = .notDetermined
    var scheduledCount = UserDefaults.standard.integer(forKey: "notif.scheduled")
    var droppedCount = UserDefaults.standard.integer(forKey: "notif.dropped")
    var isRefreshing = false
    var lastRefreshMessage = ""
    var calendarStatusTick = 0   // カレンダー権限が変わったときに画面を更新するため

    private init() {
        let schema = Schema([TrackedItem.self, GameTimer.self])
        do {
            container = try ModelContainer(for: schema, configurations: ModelConfiguration(schema: schema))
        } catch {
            // 保存領域が壊れているなどで開けない場合も、アプリは起動できるようメモリ上で動かす
            container = try! ModelContainer(for: schema, configurations: ModelConfiguration(schema: schema, isStoredInMemoryOnly: true))
        }
    }

    var context: ModelContext { container.mainContext }

    // MARK: - 変更後の共通処理

    /// 項目を追加・編集したあとに呼ぶ：保存 → 通知の再予約 → ウィジェット更新
    func didChange() {
        try? context.save()
        Task { await rescheduleAll() }
    }

    func rescheduleAll() async {
        let items = (try? context.fetch(FetchDescriptor<TrackedItem>())) ?? []
        let timers = (try? context.fetch(FetchDescriptor<GameTimer>())) ?? []
        notificationStatus = await notifications.authorizationStatus()
        if notificationStatus == .authorized || notificationStatus == .provisional || notificationStatus == .ephemeral {
            let r = await notifications.reschedule(items: items, timers: timers)
            scheduledCount = r.scheduled
            droppedCount = r.dropped
        }
        WidgetBridge.publish(items: items, timers: timers)
        liveActivities.endFinished()
    }

    func refreshNotificationStatus() async {
        notificationStatus = await notifications.authorizationStatus()
    }

    func requestNotificationPermissionIfNeeded() async {
        if await notifications.authorizationStatus() == .notDetermined {
            await notifications.requestAuthorization()
        }
        await rescheduleAll()
    }

    // MARK: - 取得

    func refresh(force: Bool) async {
        guard !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        let r = await refresher.refreshAll(context: context, notifications: notifications, calendar: calendar, force: force)
        if r.skipped {
            lastRefreshMessage = "前回の取得から時間がたっていないため省略しました"
        } else if r.errors.isEmpty {
            lastRefreshMessage = "更新しました（変化 \(r.updated) 件）"
        } else {
            lastRefreshMessage = "一部取得できませんでした：\n" + r.errors.prefix(3).joined(separator: "\n")
        }
        await rescheduleAll()
    }

    // MARK: - バックグラウンド更新

    func scheduleBackgroundRefresh() {
        let req = BGAppRefreshTaskRequest(identifier: Refresher.taskID)
        req.earliestBeginDate = Date().addingTimeInterval(6 * 3600)
        try? BGTaskScheduler.shared.submit(req)
    }

    func backgroundRefresh() async {
        scheduleBackgroundRefresh()
        _ = await refresher.refreshAll(context: context, notifications: notifications, calendar: calendar, force: false)
        await rescheduleAll()
    }

    func openSystemSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }
}

enum Haptics {
    @MainActor static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
    @MainActor static func tap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
}

/// ウィジェット用のデータを App Group に書き出す。
enum WidgetBridge {
    @MainActor
    static func publish(items: [TrackedItem], timers: [GameTimer]) {
        let now = Date()
        let entries = EntryBuilder.sorted(EntryBuilder.entries(items: items, timers: timers, now: now))
            .compactMap { e -> WidgetSnapshot.Entry? in
                guard let d = e.date, Countdown.daysUntil(d, from: now) >= 0 else { return nil }
                return WidgetSnapshot.Entry(id: e.id, title: e.title, subtitle: e.kindLabel, category: e.category,
                                            date: d, hasTime: e.hasTime, createdAt: e.startDate)
            }
        WidgetSnapshot(entries: Array(entries.prefix(20)), generatedAt: now).save(suite: AppGroup.id)
        WidgetCenter.shared.reloadAllTimelines()
    }
}
