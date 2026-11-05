import SwiftUI

struct HomeView: View {
    @State private var settings = QuizSettings()
    @State private var playing = false
    @State private var launch = QuizSettings()
    @State private var birth: BirthRange? = nil
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
                    birthCard
                    card {
                        SectionTitle(text: "遊び方")
                        FlowLayout {
                            ForEach(RuleMode.allCases) { m in
                                Chip(text: m.label, selected: settings.rule == m) { settings.rule = m }
                            }
                        }
                        Text(settings.rule.detail)
                            .font(.caption).foregroundStyle(.white.opacity(0.6))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    card {
                        SectionTitle(text: "ジャンル")
                        FlowLayout {
                            ForEach(Genre.allCases) { g in
                                Chip(text: "\(g.emoji) \(g.label)", selected: settings.genre == g) { settings.genre = g }
                            }
                        }
                        SectionTitle(text: "年代").padding(.top, 6)
                        Chip(text: "全年代", selected: settings.era == .all) { settings.era = .all }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        VStack(spacing: 6) {
                            ForEach(Array(stride(from: 1970, through: 2020, by: 10)), id: \.self) { decade in
                                HStack(spacing: 8) {
                                    Text(decade < 2000 ? "\(decade % 100)年代" : "\(decade)年代")
                                        .font(.system(size: 13, weight: .bold, design: .rounded))
                                        .frame(width: 70, alignment: .leading)
                                        .opacity(0.8)
                                    Chip(text: "全部", selected: settings.era == .decade(decade)) { settings.era = .decade(decade) }
                                    ForEach([decade, decade + 5], id: \.self) { y in
                                        let e = Era(start: y)
                                        Chip(text: y % 10 == 0 ? "前半" : "後半", selected: settings.era == e) { settings.era = e }
                                    }
                                    Spacer(minLength: 0)
                                }
                            }
                        }
                        if let r = settings.era.years {
                            Text("\(r.lowerBound)年〜\(r.upperBound)年")
                                .font(.caption).foregroundStyle(.white.opacity(0.6))
                                .frame(maxWidth: .infinity, alignment: .leading)
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
                        SectionTitle(text: "曲の止め方")
                        FlowLayout {
                            ForEach(StopMode.allCases) { m in
                                Chip(text: m.label, selected: settings.stopMode == m) { settings.stopMode = m }
                            }
                        }
                        Text(settings.stopMode.detail)
                            .font(.caption).foregroundStyle(.white.opacity(0.6))
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if settings.stopMode == .auto {
                            SectionTitle(text: settings.rule == .show ? "最初のステージのイントロの長さ" : "イントロの長さ").padding(.top, 6)
                            FlowLayout {
                                ForEach([1.0, 3.0, 5.0, 10.0], id: \.self) { sec in
                                    Chip(text: "\(Int(sec))秒", selected: settings.introSeconds == sec) { settings.introSeconds = sec }
                                }
                            }
                        }
                        if settings.source != .preview {
                            SectionTitle(text: "再生する場所").padding(.top, 6)
                            FlowLayout {
                                Chip(text: "🎤 歌い出しから", selected: settings.startFromVocal) { settings.startFromVocal = true }
                                Chip(text: "⏮ 曲の頭から", selected: !settings.startFromVocal) { settings.startFromVocal = false }
                            }
                            Text(settings.startFromVocal
                                 ? "最初の歌詞が始まる約1.5秒前から流します（歌詞の時刻はLRCLIBのデータを使用。データが無い曲は曲の頭から）"
                                 : "前奏から流します")
                                .font(.caption).foregroundStyle(.white.opacity(0.6))
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        SectionTitle(text: "問題数").padding(.top, 6)
                        FlowLayout {
                            ForEach([5, 10, 20], id: \.self) { n in
                                Chip(text: "\(n)問", selected: settings.questionCount == n) { settings.questionCount = n }
                            }
                        }
                    }
                    if !Speaker.hasHighQualityJapaneseVoice {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("🔊 読み上げの声をもっと自然にするには")
                                .font(.system(size: 14, weight: .bold, design: .rounded))
                            Text("設定アプリ →「アクセシビリティ」→「読み上げコンテンツ」→「声」→「日本語」で、「拡張」や「プレミアム」と付いた声をダウンロードすると、このアプリが自動でその声を使います。")
                                .font(.caption).opacity(0.75)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(Theme.cyan.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
                    }
                    startButton
                    notes
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 20)
            }
        }
        .fullScreenCover(isPresented: $playing) {
            QuizView(settings: launch)
        }
    }

    // MARK: 生まれ年でイントロドン

    private var birthCard: some View {
        card {
            SectionTitle(text: "🎂 生まれ年でイントロドン")
            Text("生まれ年を選ぶと、10歳〜18歳のころのヒット曲だけで出題します。ジャンルを押すとすぐ始まります。")
                .font(.caption).foregroundStyle(.white.opacity(0.7))
                .frame(maxWidth: .infinity, alignment: .leading)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                ForEach(BirthRange.all) { b in
                    Button { withAnimation(.spring(response: 0.3)) { birth = (birth == b) ? nil : b } } label: {
                        VStack(spacing: 0) {
                            Text("\(b.from)").font(.system(size: 15, weight: .heavy, design: .rounded))
                            Text("・\(b.to)年").font(.system(size: 11, weight: .bold, design: .rounded)).opacity(0.8)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 8)
                        .background(birth == b ? Theme.gold : Color.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(birth == b ? Color.black : Color.white)
                    }
                    .buttonStyle(.plain)
                }
            }
            if let b = birth {
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(b.label)：\(b.rangeLabel)")
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .foregroundStyle(Theme.gold)
                    let need = settings.questionCount + 4
                    let genres = Genre.allCases.map { ($0, HitList.strict(genre: $0, years: b.years).count) }
                        .filter { $0.1 >= need }
                    FlowLayout {
                        ForEach(genres, id: \.0) { item in
                            let g = item.0, n = item.1
                            Button {
                                var s = settings
                                s.birth = b
                                s.genre = g
                                s.fame = .famous
                                s.era = .all
                                launch = s
                                playing = true
                            } label: {
                                Text("\(g.emoji) \(g.label)（\(n)曲）")
                                    .font(.system(size: 15, weight: .bold, design: .rounded))
                                    .padding(.horizontal, 14).padding(.vertical, 10)
                                    .background(LinearGradient(colors: [Theme.pink, Color.orange], startPoint: .leading, endPoint: .trailing),
                                                in: Capsule())
                                    .foregroundStyle(.white)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    Text("その年の曲が少ないジャンルは出していません。")
                        .font(.caption2).foregroundStyle(.white.opacity(0.5))
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
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
        Button { launch = settings; launch.birth = nil; playing = true } label: {
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
            Text("・有名な曲は、オリコン年間シングル（1970〜2007年）、Billboard JAPAN 年間HOT100（2008〜2025年）の上位曲と、米Billboard Hot 100の1位曲から出題します（約1,950曲）。年代はランキングの年です。")
            Text("・ヒップホップは米Billboardラップチャート1位曲とRAG MUSICの邦楽ヒップホップ人気ランキング、ダンスは米Billboard Hot Dance/Electronic Songs 1位曲も使います。")
            Text("・アニメの有名な曲は、Billboard JAPAN 年間Hot Animation、NHK『ベスト・アニソン100』、テレビ朝日のアニソン総選挙などのランキングに入った約230曲から出題します。")
            Text("・マイナーな曲は、その年代のヒット歌手のランキング外の曲です（年代はAppleの発売日で判定。再発盤はずれることがあります）。")
            Text("・ジャンルは、ヒット曲ごとに照合したAppleの原曲のジャンル名で分けます（ロック・ヒップホップ・ダンスは邦楽と洋楽の両方から出題）。")
            Text("・選んだ年代とジャンルで曲が足りないときは、前後の年代に広げて出題し、そのことを画面に表示します。")
            Text("・アニメ・ドラマなどのタイアップは、Wikipediaの記事に書かれているものだけ表示します。")
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
