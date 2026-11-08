import SwiftUI
import SwiftData
import MachikaneCore

struct ItemDetailView: View {
    @Bindable var item: TrackedItem
    @Environment(AppModel.self) private var model
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    @State private var showEdit = false
    @State private var showDigitalSearch = false
    @State private var confirmDelete = false
    @State private var alertMessage: String?
    @State private var isRefreshing = false

    var body: some View {
        let now = Date()
        let entry = EntryBuilder.entries(items: [item], timers: [], now: now).first
        List {
            if let entry {
                Section { EntryCard(entry: entry, now: now).listRowInsets(EdgeInsets()) }
                    .listRowBackground(Color.clear)
            }
            dateSection
            if item.category == .manga { mangaSection }
            if item.category == .anime { animeSection }
            ReminderEditor(item: item)
            dailySection
            calendarSection
            if model.liveActivities.isAvailable && item.targetHasTime { liveSection }
            Section {
                Button(item.isArchived ? "一覧に戻す" : "アーカイブ（一覧から隠す）") {
                    item.isArchived.toggle()
                    model.didChange()
                }
                Button("削除", role: .destructive) { confirmDelete = true }
            }
        }
        .navigationTitle(item.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { Button("編集") { showEdit = true } }
        }
        .sheet(isPresented: $showEdit) {
            NavigationStack { ItemEditView(item: item, onDone: {}) }
        }
        .sheet(isPresented: $showDigitalSearch) {
            NavigationStack { MangaSearchView(onDone: { showDigitalSearch = false }, digitalFor: item) }
        }
        .confirmationDialog("「\(item.title)」を削除しますか？", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("削除", role: .destructive) { delete() }
        }
        .alert(alertMessage ?? "", isPresented: Binding(get: { alertMessage != nil }, set: { if !$0 { alertMessage = nil } })) {
            Button("OK") { alertMessage = nil }
        }
        .onDisappear { model.didChange() }
    }

    // MARK: - 日付・出典

    @ViewBuilder
    private var dateSection: some View {
        Section {
            if item.category == .manga {
                dateRow(label: "紙の発売日", date: item.mainDate, text: item.mainDateText,
                        source: item.mainSource, fetchedAt: item.mainFetchedAt)
                if item.digitalDate != nil || !item.digitalDateText.isEmpty || !item.digitalISBN.isEmpty {
                    dateRow(label: "電子の配信日", date: item.digitalDate, text: item.digitalDateText,
                            source: DateSource(rawValue: item.digitalSourceRaw) ?? .manual, fetchedAt: item.digitalFetchedAt)
                }
                if !item.observations.isEmpty, !item.isManualOverride {
                    DoubleCheckBadge(status: item.checkStatus)
                    if item.checkStatus == .mismatch { mismatchChooser }
                }
                if item.isManualOverride {
                    Label("手入力の日付を使っています", systemImage: "pencil")
                        .font(.footnote)
                    Button("自動取得の日付に戻す") {
                        item.isManualOverride = false
                        let eff = DoubleCheck.effective(item.observations, chosen: item.chosenSource)
                        item.mainDate = eff.parsed.date()
                        item.mainDateText = eff.parsed.isExact ? "" : (eff.parsed == .none ? "" : eff.parsed.displayText)
                        item.mainSource = eff.source ?? .manual
                        item.mainFetchedAt = eff.fetchedAt
                        model.calendar.syncAfterDateChange(item)
                        model.didChange()
                    }
                    .disabled(item.observations.isEmpty)
                }
            } else if item.category == .anime && item.isWeekly {
                LabeledContent("毎週", value: "\(WeekdayText.name(item.weekday))曜 \(String(format: "%d:%02d", item.hour, item.minute))")
                if let d = item.targetDate() {
                    LabeledContent("次回", value: d.mkDateTimeText + (item.nextEpisodeText.isEmpty ? "" : "（\(item.nextEpisodeText)）"))
                }
                sourceFooter(item.mainSource, item.mainFetchedAt)
            } else {
                dateRow(label: item.targetKindLabel, date: item.mainDate, text: item.mainDateText,
                        source: item.mainSource, fetchedAt: item.mainFetchedAt, withTime: item.hasTime)
            }
            Button("日付を手で修正") { showEdit = true }
            if item.category == .manga, !item.isbn.isEmpty || item.isAwaitingNextVolume || !item.digitalISBN.isEmpty {
                Button {
                    Task {
                        isRefreshing = true
                        do {
                            _ = try await model.refresher.refreshManga(item, notifications: model.notifications, calendar: model.calendar, now: Date())
                            model.didChange()
                        } catch {
                            alertMessage = "取得できませんでした：\(error.localizedDescription)"
                        }
                        isRefreshing = false
                    }
                } label: {
                    HStack { Text("最新の情報を取得"); if isRefreshing { Spacer(); ProgressView() } }
                }
                .disabled(isRefreshing)
            }
        } header: { Text("日付と出典") }
    }

    private func dateRow(label: String, date: Date?, text: String, source: DateSource, fetchedAt: Date?, withTime: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            LabeledContent(label) {
                if let date {
                    Text(withTime ? date.mkDateTimeText : date.mkDateText).monospacedDigit()
                } else {
                    Text("予定（日付未確定）\(text.isEmpty || text == "日付未確定" ? "" : "：" + text)")
                }
            }
            sourceFooter(source, fetchedAt)
        }
    }

    private func sourceFooter(_ source: DateSource, _ fetchedAt: Date?) -> some View {
        Text("出典：\(source.displayName)" + (fetchedAt.map { "・最終取得 \($0.mkDateTimeText)" } ?? ""))
            .font(.caption).foregroundStyle(.secondary)
    }

    /// 不一致のとき、両方の日付と出典を並べて選ぶ
    @ViewBuilder
    private var mismatchChooser: some View {
        let latest = DoubleCheck.latestBySource(item.observations).values.sorted { $0.source.rawValue < $1.source.rawValue }
        Text(item.chosenSource == nil
             ? "どちらの日付を使うか選んでください。選ぶまでは早い方の日付で通知し、通知文に「日付未確定の可能性あり」と付けます。"
             : "選んだ日付で通知しています。")
            .font(.footnote).foregroundStyle(.secondary)
        ForEach(latest, id: \.source) { o in
            Button {
                item.chosenSource = o.source
                let eff = DoubleCheck.effective(item.observations, chosen: o.source)
                item.mainDate = eff.parsed.date()
                item.mainSource = o.source
                item.mainFetchedAt = o.fetchedAt
                model.calendar.syncAfterDateChange(item)
                Haptics.success()
                model.didChange()
            } label: {
                HStack {
                    VStack(alignment: .leading) {
                        Text(o.parsed.displayText).font(.headline)
                        Text("\(o.source.displayName)・\(o.fetchedAt.mkDateTimeText) 取得").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if item.chosenSource == o.source { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) }
                }
            }
        }
    }

    // MARK: - 漫画

    @ViewBuilder
    private var mangaSection: some View {
        Section {
            Stepper("持っている巻：\(item.ownedVolume == 0 ? "なし" : "\(item.ownedVolume)巻まで")", value: $item.ownedVolume, in: 0...999)
            if item.targetVolume > 0 {
                LabeledContent("追跡中の巻", value: "\(item.targetVolume)巻")
                if item.ownedVolume < item.targetVolume - 1 {
                    Label("\(item.ownedVolume + 1)〜\(item.targetVolume - 1)巻を持っていません（買い飛ばし注意）", systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote).foregroundStyle(.orange)
                }
                if !item.isAwaitingNextVolume {
                    Button("\(item.targetVolume)巻を買った → 次巻を追跡") {
                        item.ownedVolume = item.targetVolume
                        Haptics.success()
                        model.didChange()
                    }
                } else {
                    Text(item.seriesKeyword.isEmpty
                         ? "シリーズ名を設定すると、次巻の情報を自動で探します（編集から設定）。"
                         : "「\(item.seriesKeyword)」の\(item.ownedVolume + 1)巻を毎日 1 回探します。見つかったらお知らせします。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            Picker("カウントダウンに使う日付", selection: $item.useDigitalDate) {
                Text("紙の発売日").tag(false)
                Text("電子の配信日").tag(true)
            }
            .onChange(of: item.useDigitalDate) { _, _ in model.calendar.syncAfterDateChange(item); model.didChange() }
            Button(item.digitalISBN.isEmpty ? "電子版の配信日を探す" : "電子版を選び直す") { showDigitalSearch = true }
            if item.reserveDate != nil {
                Picker("知らせるタイミング", selection: $item.notifyOnReserve) {
                    Text("発売日").tag(false)
                    Text("予約開始日").tag(true)
                }
                .onChange(of: item.notifyOnReserve) { _, _ in model.didChange() }
            }
        } header: { Text("所持巻・電子版") }
    }

    // MARK: - アニメ

    @ViewBuilder
    private var animeSection: some View {
        Section("視聴") {
            Stepper("見た話数：\(item.watchedEpisode)話\(item.totalEpisodes > 0 ? " / 全\(item.totalEpisodes)話" : "")",
                    value: $item.watchedEpisode, in: 0...max(2000, item.totalEpisodes))
            if !item.station.isEmpty { LabeledContent("放送局", value: item.station) }
            if !item.streamingService.isEmpty { LabeledContent("配信サービス", value: item.streamingService) }
            if let url = item.streamingURL {
                Button {
                    openURL(url)
                } label: {
                    Label("視聴ページを開く", systemImage: "play.circle.fill").font(.headline)
                }
            } else {
                Text("編集から視聴ページの URL を登録すると、ここから 1 タップで開けます。").font(.footnote).foregroundStyle(.secondary)
            }
            if item.annictWorkID > 0 {
                Text("作品情報：Annict（作品ID \(item.annictWorkID)）").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - 毎日カウントダウン

    @ViewBuilder
    private var dailySection: some View {
        Section {
            Toggle("毎朝カウントダウンを通知", isOn: $item.dailyCountdownEnabled)
                .onChange(of: item.dailyCountdownEnabled) { _, _ in model.didChange() }
            if item.dailyCountdownEnabled {
                Stepper("当日の\(item.dailyCountdownDays)日前から", value: $item.dailyCountdownDays, in: 1...60)
                DatePicker("時刻", selection: Binding(
                    get: { Calendar.current.date(bySettingHour: item.dailyCountdownHour, minute: item.dailyCountdownMinute, second: 0, of: Date()) ?? Date() },
                    set: {
                        item.dailyCountdownHour = Calendar.current.component(.hour, from: $0)
                        item.dailyCountdownMinute = Calendar.current.component(.minute, from: $0)
                    }), displayedComponents: .hourAndMinute)
            }
        } header: { Text("毎日カウントダウン") } footer: {
            Text(item.isWeekly ? "毎週の放送では使えません（リマインダーをお使いください）。" : "指定した期間、毎朝「あと◯日」をお知らせします。")
        }
        .disabled(item.isWeekly)
    }

    // MARK: - カレンダー

    @ViewBuilder
    private var calendarSection: some View {
        Section {
            if model.calendar.isDenied {
                PermissionBanner(title: "カレンダーへのアクセスが許可されていません",
                                 reason: "iPhone のカレンダーに登録するには、設定アプリで「まちかね」のカレンダーを許可してください。") {
                    model.openSystemSettings()
                }
            }
            Toggle("カレンダー側にもアラームを付ける", isOn: $item.calendarAlarm)
            Text("アプリの通知と二重にならないよう、通常はオフをおすすめします。").font(.caption).foregroundStyle(.secondary)
            Button(item.calendarEventID.isEmpty && item.calendarRegisteredDate == nil ? "iPhone のカレンダーに登録" : "カレンダーの予定を更新") {
                Task { await registerCalendar() }
            }
            .disabled(item.targetDate() == nil || model.calendar.isDenied)
            if item.calendarNeedsManualFix {
                Label("カレンダーの予定が古い日付のままです。書き込みのみの許可では更新・削除ができないため、カレンダーアプリで古い予定を削除してから「登録」を押してください（設定でフルアクセスを許可すると自動で更新します）。",
                      systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote).foregroundStyle(.orange)
            }
            if let d = item.calendarRegisteredDate {
                Text("登録済み：\(item.targetHasTime ? d.mkDateTimeText : d.mkDateText)").font(.caption).foregroundStyle(.secondary)
            }
        } header: { Text("iPhone カレンダー") }
    }

    private func registerCalendar() async {
        if !model.calendar.canWrite {
            _ = await model.calendar.requestWriteOnly()
        }
        do {
            if !model.calendar.hasFullAccess && item.calendarRegisteredDate != nil && !item.calendarNeedsManualFix {
                alertMessage = "すでに登録済みです。書き込みのみの許可では既存の予定を更新できないため、二重登録を避けて何もしませんでした。"
                return
            }
            try model.calendar.register(item)
            Haptics.success()
            model.didChange()
            alertMessage = "カレンダーに登録しました"
        } catch {
            alertMessage = error.localizedDescription
        }
    }

    // MARK: - Live Activity

    @ViewBuilder
    private var liveSection: some View {
        Section {
            if model.liveActivities.isRunning(item) {
                Button("ロック画面の表示を終了") { model.liveActivities.stop(item) }
            } else {
                Button("ロック画面に残り時間を表示") {
                    do { try model.liveActivities.start(item); Haptics.success() } catch { alertMessage = "表示できませんでした：\(error.localizedDescription)" }
                }
                .disabled(!model.liveActivities.canStart(item))
            }
        } header: { Text("Live Activity") } footer: {
            Text("24時間以内に放送・配信があるときに使えます。")
        }
    }

    private func delete() {
        // フルアクセスならカレンダーの予定も削除（書き込みのみでは iOS の仕様で削除できない）
        model.calendar.remove(item)
        model.liveActivities.stop(item)
        context.delete(item)
        model.didChange()
        dismiss()
    }
}

/// リマインダー（複数）：プリセット＋自由追加
struct ReminderEditor: View {
    @Bindable var item: TrackedItem
    @Environment(AppModel.self) private var model
    @State private var customDays = 2
    @State private var customTime = Calendar.current.date(bySettingHour: 9, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var customMinutes = 15
    @State private var showCustom = false

    var body: some View {
        Section {
            ForEach(item.reminders) { r in
                HStack {
                    Image(systemName: "bell.fill").foregroundStyle(item.category.color)
                    Text(r.label)
                    Spacer()
                    if let t = item.targetDate(), let f = r.fireDate(for: t), !item.isWeekly {
                        Text(f.mkDateTimeText).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .onDelete { idx in
                var list = item.reminders
                list.remove(atOffsets: idx)
                item.reminders = list
                model.didChange()
            }
            Menu {
                Button("7日前 9:00") { add(.sevenDaysBefore()) }
                Button("3日前 9:00") { add(.threeDaysBefore()) }
                Button("前日 20:00") { add(.dayBefore()) }
                Button("当日の朝 7:00") { add(.morningOf()) }
                if item.targetHasTime {
                    Button("30分前") { add(.init(kind: .minutesBefore(minutes: 30))) }
                    Button("時刻ちょうど") { add(.atTime()) }
                }
                Button("自由に設定…") { showCustom = true }
            } label: {
                Label("リマインダーを追加", systemImage: "plus.circle")
            }
            if showCustom {
                Stepper("\(customDays == 0 ? "当日" : "\(customDays)日前")", value: $customDays, in: 0...365)
                DatePicker("時刻", selection: $customTime, displayedComponents: .hourAndMinute)
                Button("この日時を追加") {
                    let c = Calendar.current.dateComponents([.hour, .minute], from: customTime)
                    add(.init(kind: .daysBefore(days: customDays, hour: c.hour ?? 9, minute: c.minute ?? 0)))
                    showCustom = false
                }
                if item.targetHasTime {
                    Stepper("時刻の\(customMinutes)分前", value: $customMinutes, in: 1...1440, step: 5)
                    Button("◯分前として追加") {
                        add(.init(kind: .minutesBefore(minutes: customMinutes)))
                        showCustom = false
                    }
                }
            }
        } header: { Text("リマインダー") } footer: {
            Text(item.targetDate() == nil && !item.isWeekly
                 ? "日付が確定すると通知を予約します。"
                 : "左にスワイプで削除できます。")
        }
    }

    private func add(_ r: ReminderRule) {
        var list = item.reminders
        guard !list.contains(where: { $0.kind == r.kind }) else { return }
        list.append(r)
        item.reminders = list
        Haptics.success()
        model.didChange()
    }
}
