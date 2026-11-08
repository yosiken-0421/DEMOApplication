import SwiftUI
import MachikaneCore

/// 追加フロー：4 つの大きなボタンから選ぶ
struct AddMenuView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    NavigationLink { MangaSearchView(onDone: { dismiss() }) } label: {
                        BigChoice(symbol: "book.closed.fill", color: .orange, title: "漫画を検索",
                                  detail: "タイトルや ISBN で新刊の発売日を探します")
                    }
                    NavigationLink { AnimeSearchView(onDone: { dismiss() }) } label: {
                        BigChoice(symbol: "tv.fill", color: .purple, title: "アニメを検索",
                                  detail: "Annict の作品情報から登録します")
                    }
                    NavigationLink { ItemEditView(item: nil, onDone: { dismiss() }) } label: {
                        BigChoice(symbol: "square.and.pencil", color: .blue, title: "手入力",
                                  detail: "日付や毎週の放送時間を自分で入力します")
                    }
                    NavigationLink { TimerEditView(timer: nil, onDone: { dismiss() }) } label: {
                        BigChoice(symbol: "gamecontroller.fill", color: .green, title: "コイン・ゲームタイマー",
                                  detail: "待てば無料・デイリーリセット・イベント期間")
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("追加する")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("閉じる") { dismiss() } }
            }
        }
    }
}

struct BigChoice: View {
    let symbol: String
    let color: Color
    let title: String
    let detail: String

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: symbol)
                .font(.title)
                .foregroundStyle(.white)
                .frame(width: 60, height: 60)
                .background(color.gradient, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.title3.bold()).foregroundStyle(.primary)
                Text(detail).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.leading)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(.tertiary)
        }
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
