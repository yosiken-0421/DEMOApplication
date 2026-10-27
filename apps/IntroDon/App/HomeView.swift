import SwiftUI

struct HomeView: View {
    @State private var settings = QuizSettings()
    @State private var playing = false
    @State private var logoBounce = false

    var body: some View {
        ZStack {
            Theme.background
            ScrollView {
                VStack(spacing: 22) {
                    header
                    card {
                        SectionTitle(text: "どこの曲で遊ぶ？")
                        VStack(spacing: 8) {
                            ForEach(MusicSource.allCases) { s in sourceRow(s) }
                        }
                    }
                    card {
                        SectionTitle(text: "ジャンル")
                        FlowLayout {
                            ForEach(Genre.allCases) { g in
                                Chip(text: "\(g.emoji) \(g.label)", selected: settings.genre == g) { settings.genre = g }
                            }
                        }
                        SectionTitle(text: "年代").padding(.top, 6)
                        FlowLayout {
                            ForEach(Era.allCases) { e in
                                Chip(text: e.label, selected: settings.era == e) { settings.era = e }
                            }
                        }
                        SectionTitle(text: "有名な曲 / マイナーな曲").padding(.top, 6)
                        FlowLayout {
                            ForEach(Fame.allCases) { f in
                                Chip(text: f.label, selected: settings.fame == f) { settings.fame = f }
                            }
                        }
                        Text(settings.fame.detail)
                            .font(.caption).foregroundStyle(.white.opacity(0.6))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    card {
                        SectionTitle(text: "イントロの長さ")
                        FlowLayout {
                            ForEach([1.0, 3.0, 5.0, 10.0], id: \.self) { sec in
                                Chip(text: "\(Int(sec))秒", selected: settings.introSeconds == sec) { settings.introSeconds = sec }
                            }
                        }
                        SectionTitle(text: "問題数").padding(.top, 6)
                        FlowLayout {
                            ForEach([5, 10, 20], id: \.self) { n in
                                Chip(text: "\(n)問", selected: settings.questionCount == n) { settings.questionCount = n }
                            }
                        }
                    }
                    startButton
                    notes
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 20)
            }
        }
        .fullScreenCover(isPresented: $playing) {
            QuizView(settings: settings)
        }
    }

    private var header: some View {
        VStack(spacing: 6) {
            Text("🎶")
                .font(.system(size: 54))
                .scaleEffect(logoBounce ? 1.12 : 0.95)
                .animation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true), value: logoBounce)
                .onAppear { logoBounce = true }
            Text("イントロどんぴしゃ")
                .font(.system(size: 32, weight: .black, design: .rounded))
                .foregroundStyle(LinearGradient(colors: [Theme.gold, Theme.pink], startPoint: .leading, endPoint: .trailing))
            Text("イントロを聴いて曲名を当てよう！")
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundStyle(.white.opacity(0.75))
        }
    }

    private func sourceRow(_ s: MusicSource) -> some View {
        Button { settings.source = s } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: s.icon)
                    .font(.title3)
                    .frame(width: 30)
                    .foregroundStyle(settings.source == s ? Color.black : Theme.gold)
                VStack(alignment: .leading, spacing: 3) {
                    Text(s.label).font(.system(size: 16, weight: .bold, design: .rounded))
                    Text(s.detail).font(.caption).opacity(0.75).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Image(systemName: settings.source == s ? "checkmark.circle.fill" : "circle")
            }
            .padding(12)
            .foregroundStyle(settings.source == s ? Color.black : Color.white)
            .background(settings.source == s ? Theme.gold : Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }

    private var startButton: some View {
        Button { playing = true } label: {
            Text("スタート！")
                .font(.system(size: 24, weight: .black, design: .rounded))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
                .background(LinearGradient(colors: [Theme.pink, Color.orange], startPoint: .leading, endPoint: .trailing),
                            in: RoundedRectangle(cornerRadius: 20))
                .foregroundStyle(.white)
                .shadow(color: Theme.pink.opacity(0.6), radius: 14, y: 6)
        }
        .buttonStyle(.plain)
    }

    private var notes: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("・ジャンルと年代は、Appleに登録されている曲の情報（ジャンル名・発売日）で絞り込みます。ベスト盤や再発盤は、発売日が元の年代とずれることがあります。")
            Text("・有名/マイナーは「シングル作品の曲か、アルバム収録曲か」で分けています。")
            Text("・試聴音源は iTunes 提供です。曲の頭からではない場合があります。")
        }
        .font(.caption2)
        .foregroundStyle(.white.opacity(0.5))
    }

    @ViewBuilder
    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 10, content: content)
            .padding(14)
            .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.white.opacity(0.10)))
    }
}
