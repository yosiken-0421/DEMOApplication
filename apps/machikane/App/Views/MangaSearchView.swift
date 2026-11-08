import SwiftUI
import SwiftData
import MachikaneCore

/// 漫画・ラノベを国立国会図書館サーチ（JPRO 近刊情報）で検索
struct MangaSearchView: View {
    var onDone: () -> Void
    /// 既存項目の電子版を探すときに指定
    var digitalFor: TrackedItem?

    @Environment(AppModel.self) private var model
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query private var items: [TrackedItem]

    @State private var query = ""
    @State private var kind: NDLOpenSearch.Kind = .paper
    @State private var results: [NDLRecord] = []
    @State private var isLoading = false
    @State private var message = ""
    @State private var picked: NDLRecord?

    var body: some View {
        List {
            Section {
                HStack {
                    TextField("タイトル または ISBN", text: $query)
                        .textInputAutocapitalization(.never)
                        .submitLabel(.search)
                        .onSubmit { Task { await search() } }
                    Button { Task { await search() } } label: { Image(systemName: "magnifyingglass") }
                        .disabled(query.trimmingCharacters(in: .whitespaces).isEmpty || isLoading)
                }
                if digitalFor == nil {
                    Picker("種類", selection: $kind) {
                        ForEach(NDLOpenSearch.Kind.allCases, id: \.self) { Text($0.displayName).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
            } footer: {
                Text("国立国会図書館サーチの API を用いて、出版情報登録センター（JPRO）の近刊情報を検索します。近刊情報は実際に刊行される内容と異なる場合があります。")
            }

            if isLoading {
                HStack { Spacer(); ProgressView("検索中…"); Spacer() }
            } else if !message.isEmpty {
                Text(message).foregroundStyle(.secondary)
            }

            ForEach(results) { r in
                Button { picked = r } label: { row(r) }
                    .buttonStyle(.plain)
            }
        }
        .navigationTitle(digitalFor == nil ? "漫画を検索" : "電子版を検索")
        .onAppear {
            if let d = digitalFor {
                kind = .digital
                if query.isEmpty { query = d.seriesKeyword.isEmpty ? d.title : d.seriesKeyword }
            }
        }
        .sheet(item: $picked) { r in
            MangaConfirmSheet(record: r, kind: kind, digitalFor: digitalFor) { created in
                picked = nil
                if created { onDone() }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private func row(_ r: NDLRecord) -> some View {
        let owned = ownedState(r)
        return VStack(alignment: .leading, spacing: 4) {
            Text(r.displayTitle).font(.headline)
            if !r.creators.isEmpty || !r.publisher.isEmpty {
                Text([r.creators.prefix(2).joined(separator: "・"), r.publisher].filter { !$0.isEmpty }.joined(separator: " / "))
                    .font(.caption).foregroundStyle(.secondary)
            }
            HStack {
                let p = r.parsedDate
                Text(p.isExact ? "発売日：\(p.displayText)" : "予定（日付未確定）：\(r.dateText.isEmpty ? "不明" : r.dateText)")
                    .font(.subheadline)
                    .foregroundStyle(p.isExact ? Color.orange : Color.secondary)
                Spacer()
                if let owned {
                    Text(owned).font(.caption.bold())
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.gray.opacity(0.2), in: Capsule())
                }
            }
            if !r.isbn.isEmpty { Text("ISBN \(r.isbn)").font(.caption2).foregroundStyle(.secondary) }
        }
        .padding(.vertical, 4)
    }

    /// 二重買い防止：同じシリーズで所持巻以下なら「所持済み」
    private func ownedState(_ r: NDLRecord) -> String? {
        guard let v = r.volumeNumber else { return items.contains { !$0.isbn.isEmpty && $0.isbn == r.isbn } ? "登録済み" : nil }
        for i in items where i.category == .manga && !i.seriesKeyword.isEmpty {
            let key = i.seriesKeyword.filter { !$0.isWhitespace }
            if r.title.filter({ !$0.isWhitespace }).contains(key) {
                if v <= i.ownedVolume { return "所持済み" }
                if v == i.targetVolume { return "登録済み" }
            }
        }
        return nil
    }

    private func search() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        isLoading = true
        message = ""
        defer { isLoading = false }
        do {
            let recs = try await NDLClient.shared.search(q, kind: kind, count: 50)
            // 発売日が新しい順（未確定は最後）
            results = recs.sorted { a, b in
                let da = a.parsedDate.date(), db = b.parsedDate.date()
                switch (da, db) {
                case let (x?, y?): return x > y
                case (.some, nil): return true
                case (nil, .some): return false
                default: return a.dateText > b.dateText
                }
            }
            if results.isEmpty { message = "見つかりませんでした。別の言葉で試すか、手入力で追加してください。" }
        } catch {
            results = []
            message = "検索できませんでした：\(error.localizedDescription)"
        }
    }
}

/// 検索結果を登録する前の確認
struct MangaConfirmSheet: View {
    let record: NDLRecord
    let kind: NDLOpenSearch.Kind
    var digitalFor: TrackedItem?
    let finish: (Bool) -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.modelContext) private var context
    @State private var series = ""
    @State private var owned = 0

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(record.displayTitle).font(.headline)
                    let p = record.parsedDate
                    LabeledContent(kind == .paper ? "紙の発売日" : "電子の配信日",
                                   value: p.isExact ? p.displayText : "予定（日付未確定）\(record.dateText.isEmpty ? "" : "：" + record.dateText)")
                    LabeledContent("出典", value: "国立国会図書館サーチ（JPRO）")
                    if !p.isExact {
                        Text("日付が確定していないため、日単位のカウントダウンと通知は確定後に始まります。確定したらお知らせします。")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
                if digitalFor == nil {
                    Section {
                        TextField("シリーズ名（次巻の追跡に使います）", text: $series)
                        Stepper("持っている巻：\(owned == 0 ? "なし" : "\(owned)巻まで")", value: $owned, in: 0...999)
                        if let v = record.volumeNumber, owned > 0, owned < v - 1 {
                            Label("\(owned + 1)〜\(v - 1)巻が抜けています", systemImage: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange).font(.footnote)
                        }
                    } header: { Text("所持巻") }
                }
            }
            .navigationTitle(digitalFor == nil ? "登録" : "電子版として設定")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("戻る") { finish(false) } }
                ToolbarItem(placement: .confirmationAction) { Button(digitalFor == nil ? "登録" : "設定") { save() } }
            }
            .onAppear {
                series = record.title
                if let v = record.volumeNumber { owned = max(0, v - 1) }
            }
        }
    }

    private func save() {
        let now = Date()
        if let item = digitalFor {
            item.digitalISBN = record.isbn
            model.refresher.applyDigital(item, rawText: record.dateText, fetchedAt: now,
                                         notifications: model.notifications, calendar: model.calendar)
            Haptics.success()
            model.didChange()
            finish(true)
            return
        }
        let item = TrackedItem(category: .manga, title: record.title)
        item.subtitle = record.displayTitle == record.title ? record.publisher : record.displayTitle
        item.publisher = record.publisher
        item.seriesKeyword = series.trimmingCharacters(in: .whitespaces)
        item.targetVolume = record.volumeNumber ?? 0
        item.ownedVolume = owned
        item.reminders = ReminderRule.defaultForDate
        context.insert(item)
        if kind == .paper {
            item.isbn = record.isbn
            model.refresher.applyMain(item, observation: SourceObservation(source: .ndl, rawText: record.dateText, fetchedAt: now),
                                      notifications: model.notifications, calendar: model.calendar, announce: false)
        } else {
            item.digitalISBN = record.isbn
            item.useDigitalDate = true
            model.refresher.applyDigital(item, rawText: record.dateText, fetchedAt: now,
                                         notifications: model.notifications, calendar: model.calendar)
        }
        Haptics.success()
        model.didChange()
        finish(true)
    }
}
