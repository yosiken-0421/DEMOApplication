import SwiftUI
import SwiftData
import MachikaneCore

/// Annict で作品を検索（個人用アクセストークンが必要）
struct AnimeSearchView: View {
    var onDone: () -> Void

    @State private var query = ""
    @State private var results: [AnnictWork] = []
    @State private var isLoading = false
    @State private var message = ""
    @State private var picked: AnnictWork?
    @State private var hasToken = KeychainStore.annictToken?.isEmpty == false

    var body: some View {
        List {
            if !hasToken {
                Section {
                    Label("Annict のアクセストークンが未設定です", systemImage: "key.fill").font(.headline)
                    Text("作品検索には Annict の個人用アクセストークンが必要です。設定タブ →「Annict」で入力してください。トークンが無くても「手入力」でアニメを登録できます。")
                        .font(.footnote).foregroundStyle(.secondary)
                    NavigationLink("手入力で追加する") { ItemEditView(item: nil, presetCategory: .anime, onDone: onDone) }
                }
            } else {
                Section {
                    HStack {
                        TextField("作品タイトル", text: $query)
                            .submitLabel(.search)
                            .onSubmit { Task { await search() } }
                        Button { Task { await search() } } label: { Image(systemName: "magnifyingglass") }
                            .disabled(query.trimmingCharacters(in: .whitespaces).isEmpty || isLoading)
                    }
                } footer: { Text("作品情報：Annict") }

                if isLoading {
                    HStack { Spacer(); ProgressView("検索中…"); Spacer() }
                } else if !message.isEmpty {
                    Text(message).foregroundStyle(.secondary)
                }
                ForEach(results) { w in
                    Button { picked = w } label: {
                        HStack(spacing: 12) {
                            Thumbnail(url: w.imageURL.flatMap { URL(string: $0) }, category: .anime, size: 44)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(w.title).font(.headline)
                                Text([w.mediaText, w.seasonNameText, w.episodesCount.map { "全\($0)話" }]
                                    .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ・ "))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .navigationTitle("アニメを検索")
        .onAppear { hasToken = KeychainStore.annictToken?.isEmpty == false }
        .navigationDestination(item: $picked) { w in
            ItemEditView(item: nil, presetCategory: .anime, annictWork: w, onDone: onDone)
        }
    }

    private func search() async {
        isLoading = true
        message = ""
        defer { isLoading = false }
        do {
            results = try await AnnictClient.shared.searchWorks(query.trimmingCharacters(in: .whitespaces))
            if results.isEmpty { message = "見つかりませんでした" }
        } catch {
            results = []
            message = "検索できませんでした：\(error.localizedDescription)"
        }
    }
}
