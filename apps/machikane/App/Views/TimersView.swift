import SwiftUI
import SwiftData
import MachikaneCore

/// コイン・ゲーム用タイマーを一画面で一元管理
struct TimersView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.modelContext) private var context
    @Query(sort: \GameTimer.sortOrder) private var timers: [GameTimer]
    @State private var editing: GameTimer?
    @State private var showNew = false

    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 30)) { ctx in
                ScrollView {
                    VStack(spacing: 12) {
                        if model.notificationStatus == .denied {
                            PermissionBanner(title: "通知がオフになっています",
                                             reason: "回復やリセットを知らせるには、設定アプリで通知を許可してください。") {
                                model.openSystemSettings()
                            }
                        }
                        if timers.isEmpty {
                            EmptyStateView(symbol: "timer", message: "マンガアプリやゲームの回復・リセットをまとめて管理できます") { showNew = true }
                        }
                        ForEach(timers) { t in
                            TimerCard(timer: t, now: ctx.date) { editing = t }
                        }
                    }
                    .padding()
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("タイマー")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showNew = true } label: { Image(systemName: "plus.circle.fill").font(.title3) }
                        .accessibilityLabel("タイマーを追加")
                }
            }
            .sheet(isPresented: $showNew) {
                NavigationStack { TimerEditView(timer: nil, onDone: { showNew = false }) }
            }
            .sheet(item: $editing) { t in
                NavigationStack { TimerEditView(timer: t, onDone: { editing = nil }) }
            }
        }
    }
}

struct TimerCard: View {
    @Environment(AppModel.self) private var model
    @Bindable var timer: GameTimer
    let now: Date
    let onEdit: () -> Void

    var body: some View {
        let done = timer.isDoneToday(now: now)
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: ItemCategory.coin.symbolName).foregroundStyle(.green)
                Text(timer.name).font(.headline)
                Spacer()
                Button("編集", action: onEdit).font(.subheadline)
            }

            if timer.waitFreeEnabled {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("待てば無料（\(hoursText(timer.waitFreeHours))）").font(.subheadline.bold())
                        if let r = timer.waitFreeReadyAt, r > now {
                            Text("\(r.mkDateTimeText) に回復・\(remaining(r))").font(.caption).foregroundStyle(.secondary)
                        } else {
                            Text(timer.waitFreeStartedAt == nil ? "読んだらタップ" : "回復済み").font(.caption).foregroundStyle(.green)
                        }
                    }
                    Spacer()
                    Button {
                        timer.waitFreeStartedAt = Date()
                        Haptics.success()
                        model.didChange()
                    } label: {
                        Label("読んだ", systemImage: "book.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                }
            }

            if timer.dailyResetEnabled || timer.remindUndoneEnabled {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("デイリーリセット 毎日 \(String(format: "%d:%02d", timer.resetHour, timer.resetMinute))").font(.subheadline.bold())
                        Text("次のリセット：\(remaining(GameDay.nextReset(after: now, hour: timer.resetHour, minute: timer.resetMinute)))")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button {
                        timer.doneAt = done ? nil : Date()
                        Haptics.success()
                        model.didChange()
                    } label: {
                        Label(done ? "やった" : "今日やった", systemImage: done ? "checkmark.circle.fill" : "circle")
                    }
                    .buttonStyle(.bordered)
                    .tint(done ? .green : .gray)
                }
            }

            if let end = timer.eventEnd {
                VStack(alignment: .leading, spacing: 2) {
                    Text(timer.eventName.isEmpty ? "イベント" : timer.eventName).font(.subheadline.bold())
                    if let s = timer.eventStart, s > now {
                        Text("開始まで \(remaining(s))（\(s.mkDateTimeText)）").font(.caption).foregroundStyle(.secondary)
                    } else if end > now {
                        Text("終了まで \(remaining(end))（\(end.mkDateTimeText)）").font(.caption)
                            .foregroundStyle(end.timeIntervalSince(now) < 24 * 3600 ? Color.red : Color.secondary)
                    } else {
                        Text("終了しました（\(end.mkDateTimeText)）").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(alignment: .leading) {
            UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 16).fill(.green).frame(width: 6)
        }
    }

    private func hoursText(_ h: Double) -> String {
        h == h.rounded() ? "\(Int(h))時間" : String(format: "%.1f時間", h)
    }

    private func remaining(_ d: Date) -> String {
        let mins = max(0, Int(ceil(d.timeIntervalSince(now) / 60)))
        if mins >= 24 * 60 { return "あと\(mins / (24 * 60))日\((mins % (24 * 60)) / 60)時間" }
        if mins >= 60 { return "あと\(mins / 60)時間\(mins % 60)分" }
        return "あと\(mins)分"
    }
}

struct TimerEditView: View {
    var timer: GameTimer?
    var onDone: () -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.modelContext) private var context
    @Query private var allTimers: [GameTimer]

    @State private var name = ""
    @State private var waitFree = true
    @State private var waitHours = 23.0
    @State private var daily = true
    @State private var resetTime = Calendar.current.date(bySettingHour: 0, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var remind = false
    @State private var remindTime = Calendar.current.date(bySettingHour: 21, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var hasEvent = false
    @State private var eventName = ""
    @State private var eventStart = Date()
    @State private var eventEnd = Date().addingTimeInterval(7 * 86400)
    @State private var notifyHours: Set<Int> = [24, 3]
    @State private var memo = ""
    @State private var loaded = false
    @State private var confirmDelete = false

    var body: some View {
        Form {
            Section("アプリ・ゲーム") {
                TextField("名前（例：マンガアプリ名）", text: $name)
                TextField("メモ", text: $memo)
            }
            Section {
                Toggle("待てば無料", isOn: $waitFree)
                if waitFree {
                    Stepper("回復まで \(waitHours == waitHours.rounded() ? "\(Int(waitHours))" : String(format: "%.1f", waitHours))時間", value: $waitHours, in: 0.5...168, step: 0.5)
                }
            } footer: { Text("読んだら「読んだ」をタップ → 設定時間後に通知します。") }
            Section {
                Toggle("デイリーリセットを通知", isOn: $daily)
                DatePicker("リセット時刻", selection: $resetTime, displayedComponents: .hourAndMinute)
                Toggle("やり忘れ通知", isOn: $remind)
                if remind {
                    DatePicker("やり忘れ通知の時刻", selection: $remindTime, displayedComponents: .hourAndMinute)
                }
            } footer: { Text("「今日やった」をタップすると、その日のやり忘れ通知は止まります。") }
            Section {
                Toggle("イベント期間", isOn: $hasEvent)
                if hasEvent {
                    TextField("イベント名", text: $eventName)
                    DatePicker("開始", selection: $eventStart)
                    DatePicker("終了", selection: $eventEnd, in: eventStart...)
                    ForEach([72, 24, 12, 3, 1], id: \.self) { h in
                        Toggle("終了の\(h)時間前に通知", isOn: Binding(
                            get: { notifyHours.contains(h) },
                            set: { if $0 { notifyHours.insert(h) } else { notifyHours.remove(h) } }))
                    }
                }
            }
            if timer != nil {
                Section { Button("このタイマーを削除", role: .destructive) { confirmDelete = true } }
            }
        }
        .navigationTitle(timer == nil ? "コイン・ゲームタイマー" : "タイマーを編集")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("閉じる") { onDone() } }
            ToolbarItem(placement: .confirmationAction) {
                Button(timer == nil ? "登録" : "保存") { save() }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .confirmationDialog("削除しますか？", isPresented: $confirmDelete) {
            Button("削除", role: .destructive) {
                if let timer { context.delete(timer) }
                model.didChange()
                onDone()
            }
        }
        .onAppear(perform: load)
    }

    private func load() {
        guard !loaded, let t = timer else { loaded = true; return }
        loaded = true
        let cal = Calendar.current
        name = t.name
        memo = t.memo
        waitFree = t.waitFreeEnabled
        waitHours = t.waitFreeHours
        daily = t.dailyResetEnabled
        resetTime = cal.date(bySettingHour: t.resetHour, minute: t.resetMinute, second: 0, of: Date()) ?? resetTime
        remind = t.remindUndoneEnabled
        remindTime = cal.date(bySettingHour: t.remindHour, minute: t.remindMinute, second: 0, of: Date()) ?? remindTime
        hasEvent = t.eventEnd != nil
        eventName = t.eventName
        eventStart = t.eventStart ?? Date()
        eventEnd = t.eventEnd ?? eventEnd
        notifyHours = Set(t.eventNotifyHours)
    }

    private func save() {
        let cal = Calendar.current
        let t = timer ?? {
            let n = GameTimer(name: name)
            n.sortOrder = (allTimers.map(\.sortOrder).max() ?? 0) + 1
            context.insert(n)
            return n
        }()
        t.name = name.trimmingCharacters(in: .whitespaces)
        t.memo = memo
        t.waitFreeEnabled = waitFree
        t.waitFreeHours = waitHours
        t.dailyResetEnabled = daily
        t.resetHour = cal.component(.hour, from: resetTime)
        t.resetMinute = cal.component(.minute, from: resetTime)
        t.remindUndoneEnabled = remind
        t.remindHour = cal.component(.hour, from: remindTime)
        t.remindMinute = cal.component(.minute, from: remindTime)
        if hasEvent {
            t.eventName = eventName
            t.eventStart = eventStart
            t.eventEnd = max(eventEnd, eventStart)
            t.eventNotifyHours = Array(notifyHours)
        } else {
            t.eventName = ""
            t.eventStart = nil
            t.eventEnd = nil
        }
        Haptics.success()
        model.didChange()
        onDone()
    }
}
