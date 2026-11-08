import SwiftUI
import SwiftData
import MachikaneCore

/// 今日発売・今日更新・今日リセットがあるものをまとめて表示
struct TodayView: View {
    @Environment(AppModel.self) private var model
    @Query(sort: \TrackedItem.createdAt) private var items: [TrackedItem]
    @Query(sort: \GameTimer.sortOrder) private var timers: [GameTimer]
    @State private var showAdd = false

    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 60)) { ctx in
                content(now: ctx.date)
            }
            .navigationTitle(Date().formatted(.dateTime.month().day().weekday(.wide).locale(Locale(identifier: "ja_JP"))))
            .sheet(isPresented: $showAdd) { AddMenuView() }
            .navigationDestination(for: UUID.self) { id in
                if let item = items.first(where: { $0.id == id }) { ItemDetailView(item: item) }
            }
        }
    }

    @ViewBuilder
    private func content(now: Date) -> some View {
        let todays = EntryBuilder.sorted(EntryBuilder.entries(items: items, timers: timers, now: now))
            .filter { $0.section(now: now) == .today }
        let dailyTimers = timers.filter { $0.dailyResetEnabled || $0.remindUndoneEnabled }
        let tomorrow = EntryBuilder.sorted(EntryBuilder.entries(items: items, timers: timers, now: now))
            .filter { $0.section(now: now) == .tomorrow }

        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if model.notificationStatus == .denied {
                    PermissionBanner(title: "通知がオフになっています",
                                     reason: "当日のお知らせを受け取るには、設定アプリで通知を許可してください。") {
                        model.openSystemSettings()
                    }
                }

                if todays.isEmpty && dailyTimers.isEmpty {
                    EmptyStateView(symbol: "sun.max", message: "今日発売・今日更新のものはありません") { showAdd = true }
                }

                if !todays.isEmpty {
                    Text("今日の発売・放送・更新").font(.title3.bold())
                    ForEach(todays) { e in
                        if let item = e.item {
                            NavigationLink(value: item.id) { EntryCard(entry: e, now: now) }.buttonStyle(.plain)
                        } else {
                            EntryCard(entry: e, now: now)
                        }
                    }
                }

                if !dailyTimers.isEmpty {
                    Text("今日のデイリー").font(.title3.bold()).padding(.top, 4)
                    ForEach(dailyTimers) { t in
                        DailyRow(timer: t, now: now)
                    }
                }

                if !tomorrow.isEmpty {
                    Text("明日").font(.headline).foregroundStyle(.secondary).padding(.top, 8)
                    ForEach(tomorrow) { e in
                        HStack {
                            Circle().fill(e.category.color).frame(width: 8, height: 8)
                            Text(e.title).lineLimit(1)
                            Spacer()
                            if let d = e.date, e.hasTime { Text(d.mkTimeText).monospacedDigit().foregroundStyle(.secondary) }
                        }
                        .font(.subheadline)
                    }
                }
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
    }
}

/// 「今日やった」チェック付きの行
struct DailyRow: View {
    @Environment(AppModel.self) private var model
    @Bindable var timer: GameTimer
    let now: Date

    var body: some View {
        let done = timer.isDoneToday(now: now)
        HStack(spacing: 12) {
            Image(systemName: ItemCategory.coin.symbolName)
                .foregroundStyle(.green)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(timer.name).font(.headline)
                let next = GameDay.nextReset(after: now, hour: timer.resetHour, minute: timer.resetMinute)
                Text("次のリセット：\(next.mkDateTimeText)")
                    .font(.caption).foregroundStyle(.secondary)
                if let r = timer.waitFreeReadyAt {
                    Text(r > now ? "待てば無料：\(r.mkDateTimeText) に回復" : "待てば無料：回復済み")
                        .font(.caption).foregroundStyle(r > now ? Color.secondary : Color.green)
                }
            }
            Spacer()
            Button {
                timer.doneAt = done ? nil : Date()
                Haptics.success()
                model.didChange()
            } label: {
                Label(done ? "やった" : "今日やった", systemImage: done ? "checkmark.circle.fill" : "circle")
                    .font(.subheadline.bold())
            }
            .buttonStyle(.bordered)
            .tint(done ? .green : .gray)
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
    }
}
