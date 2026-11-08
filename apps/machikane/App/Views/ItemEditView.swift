import SwiftUI
import SwiftData
import MachikaneCore

/// 手入力での追加・編集（Annict の作品を選んだ場合もここで放送情報を入れる）
struct ItemEditView: View {
    var item: TrackedItem?
    var presetCategory: ItemCategory?
    var annictWork: AnnictWork?
    var onDone: () -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    enum DateMode: String, CaseIterable, Identifiable {
        case date = "日付", dateTime = "日時", weekly = "毎週", undetermined = "未確定"
        var id: String { rawValue }
    }

    @State private var category: ItemCategory = .manga
    @State private var title = ""
    @State private var subtitle = ""
    @State private var dateMode: DateMode = .date
    @State private var date = Calendar.current.startOfDay(for: Date().addingTimeInterval(86400 * 7))
    @State private var undeterminedText = ""
    @State private var weekday = Calendar.current.component(.weekday, from: Date())
    @State private var time = Calendar.current.date(bySettingHour: 23, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var station = ""
    @State private var service = ""
    @State private var urlText = ""
    @State private var totalEpisodes = 0
    @State private var isbn = ""
    @State private var series = ""
    @State private var owned = 0
    @State private var targetVolume = 0
    @State private var useReserve = false
    @State private var reserveDate = Date()
    @State private var memo = ""
    @State private var dateEdited = false
    @State private var loaded = false
    @State private var annictNote = ""

    var body: some View {
        Form {
            if presetCategory == nil && item == nil {
                Section {
                    Picker("カテゴリ", selection: $category) {
                        ForEach(ItemCategory.allCases) { Label($0.displayName, systemImage: $0.symbolName).tag($0) }
                    }
                }
            }
            Section("作品") {
                TextField("タイトル（必須）", text: $title)
                TextField(category == .anime ? "サブタイトル・シーズンなど" : "巻・サブタイトルなど", text: $subtitle)
            }

            Section {
                Picker("日付の種類", selection: $dateMode) {
                    ForEach(availableModes) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .onChange(of: dateMode) { _, _ in if loaded { dateEdited = true } }
                switch dateMode {
                case .date:
                    DatePicker("日付", selection: $date, displayedComponents: .date)
                        .onChange(of: date) { _, _ in if loaded { dateEdited = true } }
                case .dateTime:
                    DatePicker("日時", selection: $date, displayedComponents: [.date, .hourAndMinute])
                        .onChange(of: date) { _, _ in if loaded { dateEdited = true } }
                case .weekly:
                    Picker("曜日", selection: $weekday) {
                        ForEach(1...7, id: \.self) { Text("\(WeekdayText.name($0))曜日").tag($0) }
                    }
                    .onChange(of: weekday) { _, _ in if loaded { dateEdited = true } }
                    DatePicker("時刻", selection: $time, displayedComponents: .hourAndMinute)
                        .onChange(of: time) { _, _ in if loaded { dateEdited = true } }
                case .undetermined:
                    TextField("例：2026年12月上旬", text: $undeterminedText)
                        .onChange(of: undeterminedText) { _, _ in if loaded { dateEdited = true } }
                }
            } header: {
                Text(category == .manga ? "発売日" : (category == .anime ? "放送・配信" : "日時"))
            } footer: {
                if dateMode == .undetermined {
                    Text("日付が未確定のものは「予定（日付未確定）」として表示し、日単位のカウントダウンや通知の対象にしません。")
                } else if let item, item.mainSource != .manual, dateEdited {
                    Text("自動取得した日付（\(item.mainSource.displayName)）を手入力で上書きします。")
                }
            }
            if !annictNote.isEmpty {
                Section { Text(annictNote).font(.footnote).foregroundStyle(.secondary) }
            }

            if category == .anime {
                Section("視聴") {
                    TextField("放送局", text: $station)
                    TextField("配信サービス（例：◯◯）", text: $service)
                    TextField("視聴ページの URL（https://…）", text: $urlText)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                    Stepper("全話数：\(totalEpisodes == 0 ? "不明" : "\(totalEpisodes)話")", value: $totalEpisodes, in: 0...2000)
                }
            }
            if category == .manga {
                Section("漫画") {
                    TextField("ISBN（自動更新に使います・任意）", text: $isbn)
                        .keyboardType(.numbersAndPunctuation)
                    TextField("シリーズ名（次巻の追跡に使います）", text: $series)
                    Stepper("対象の巻：\(targetVolume == 0 ? "指定なし" : "\(targetVolume)巻")", value: $targetVolume, in: 0...999)
                    Stepper("持っている巻：\(owned == 0 ? "なし" : "\(owned)巻まで")", value: $owned, in: 0...999)
                    Toggle("予約開始日を入力する", isOn: $useReserve)
                    if useReserve {
                        DatePicker("予約開始日", selection: $reserveDate, displayedComponents: .date)
                    }
                }
            }
            Section("メモ") { TextField("メモ", text: $memo, axis: .vertical) }
        }
        .navigationTitle(item == nil ? (annictWork == nil ? "手入力で追加" : "アニメを登録") : "編集")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(item == nil ? "登録" : "保存") { save() }
                    .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .onAppear(perform: load)
        .onChange(of: category) { _, c in
            if !availableModes.contains(dateMode) { dateMode = c == .anime ? .weekly : .date }
        }
    }

    private var availableModes: [DateMode] {
        switch category {
        case .anime: return [.weekly, .dateTime, .date, .undetermined]
        case .manga: return [.date, .undetermined]
        case .coin: return [.dateTime, .date, .undetermined]
        }
    }

    private func load() {
        guard !loaded else { return }
        defer { DispatchQueue.main.async { loaded = true } }
        if let item {
            category = item.category
            title = item.title
            subtitle = item.subtitle
            station = item.station
            service = item.streamingService
            urlText = item.streamingURLString
            totalEpisodes = item.totalEpisodes
            isbn = item.isbn
            series = item.seriesKeyword
            owned = item.ownedVolume
            targetVolume = item.targetVolume
            memo = item.memo
            if let r = item.reserveDate { useReserve = true; reserveDate = r }
            if item.category == .anime, item.isWeekly {
                dateMode = .weekly
                weekday = item.weekday
                time = Calendar.current.date(bySettingHour: item.hour, minute: item.minute, second: 0, of: Date()) ?? time
            } else if let d = item.mainDate {
                dateMode = item.hasTime && item.category != .manga ? .dateTime : .date
                date = d
            } else {
                dateMode = .undetermined
                undeterminedText = item.mainDateText
            }
            return
        }
        category = presetCategory ?? .manga
        dateMode = category == .anime ? .weekly : .date
        if let w = annictWork {
            title = w.title
            subtitle = [w.mediaText, w.seasonNameText].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
            totalEpisodes = w.episodesCount ?? 0
            Task { await loadAnnictProgram(w) }
        }
    }

    /// 自分が Annict で「見てる」作品なら、放送予定から曜日・時刻を入れる
    private func loadAnnictProgram(_ w: AnnictWork) async {
        do {
            let programs = try await AnnictClient.shared.programs(workIDs: [w.id], after: Date())
            if let p = programs.first(where: { !$0.isRebroadcast }) ?? programs.first, let s = p.startedAt {
                let c = Calendar.current.dateComponents([.weekday, .hour, .minute], from: s)
                weekday = c.weekday ?? weekday
                time = Calendar.current.date(bySettingHour: c.hour ?? 0, minute: c.minute ?? 0, second: 0, of: Date()) ?? time
                station = p.channelName ?? station
                annictNote = "Annict の放送予定から入力しました：\(s.mkDateTimeText)\(p.channelName.map { "（\($0)）" } ?? "")"
            } else {
                annictNote = "Annict に放送予定がありませんでした（Annict でこの作品を「見てる」にすると取得できます）。曜日と時刻を入力してください。"
            }
        } catch {
            annictNote = "放送予定を取得できませんでした：\(error.localizedDescription)"
        }
    }

    private func save() {
        let isNew = item == nil
        let target = item ?? TrackedItem(category: category, title: title)
        if isNew {
            context.insert(target)
            target.category = category
        }
        target.title = title.trimmingCharacters(in: .whitespaces)
        target.subtitle = subtitle
        target.memo = memo
        target.station = station
        target.streamingService = service
        target.streamingURLString = urlText.trimmingCharacters(in: .whitespaces)
        target.totalEpisodes = totalEpisodes
        if category == .manga {
            target.isbn = TextNormalizer.isbn(isbn)
            target.seriesKeyword = series.trimmingCharacters(in: .whitespaces)
            target.ownedVolume = owned
            target.targetVolume = targetVolume
            target.reserveDate = useReserve ? Calendar.current.startOfDay(for: reserveDate) : nil
            if !useReserve { target.notifyOnReserve = false }
        }
        if let w = annictWork, isNew {
            target.annictWorkID = w.id
            target.imageURLString = w.imageURL ?? ""
        }

        if isNew || dateEdited {
            let oldTarget = target.targetDate()
            applyDate(to: target)
            if !isNew {
                target.isManualOverride = true
                if oldTarget != target.targetDate() { model.calendar.syncAfterDateChange(target) }
            }
        }
        if isNew {
            target.reminders = target.targetHasTime ? ReminderRule.defaultForTimed : ReminderRule.defaultForDate
        }
        Haptics.success()
        model.didChange()
        if isNew { onDone() } else { dismiss() }
    }

    private func applyDate(to t: TrackedItem) {
        let cal = Calendar.current
        t.mainSource = .manual
        t.mainFetchedAt = Date()
        switch dateMode {
        case .date:
            t.weekday = 0
            t.mainDate = category == .manga ? MKCalendar.japan.startOfDay(for: date) : cal.startOfDay(for: date)
            t.mainDateText = ""
            t.hasTime = false
        case .dateTime:
            t.weekday = 0
            t.mainDate = date
            t.mainDateText = ""
            t.hasTime = true
        case .weekly:
            t.weekday = weekday
            t.hour = cal.component(.hour, from: time)
            t.minute = cal.component(.minute, from: time)
            t.mainDate = nil
            t.mainDateText = ""
            t.hasTime = true
        case .undetermined:
            t.weekday = 0
            t.mainDate = nil
            t.mainDateText = undeterminedText.trimmingCharacters(in: .whitespaces).isEmpty ? "日付未確定" : undeterminedText
            t.hasTime = false
        }
        if category == .manga, t.useDigitalDate, dateMode != .undetermined {
            // 手入力は紙の発売日として扱う
            t.useDigitalDate = false
        }
    }
}
