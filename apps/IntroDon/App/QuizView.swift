import SwiftUI

struct QuizView: View {
    @StateObject private var model: QuizModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    init(settings: QuizSettings) {
        _model = StateObject(wrappedValue: QuizModel(settings: settings))
    }

    var body: some View {
        ZStack {
            Theme.background
            switch model.phase {
            case .loading:
                loadingView("曲を集めています…")
            case .failed(let message):
                failedView(message)
            case .finished:
                ResultView(model: model, onRetry: { Task { await model.load() } }, onClose: close)
            case .stageIntro:
                StageIntroView(model: model, onClose: close)
            default:
                questionView
            }
            if model.phase == .judged, let j = model.judgement {
                JudgeOverlay(judgement: j, disqualified: model.disqualified)
                    .id(model.current?.id)
                    .allowsHitTesting(false)
            }
        }
        .foregroundStyle(.white)
        .task { await model.load() }
    }

    private func close() {
        model.quit()
        dismiss()
    }

    private func loadingView(_ text: String) -> some View {
        VStack(spacing: 14) {
            ProgressView().scaleEffect(1.6).tint(Theme.gold)
            Text(text).font(.headline)
        }
    }

    // MARK: 出題画面

    private var questionView: some View {
        VStack(spacing: 14) {
            topBar
            if model.isShowRule { livesRow }
            Spacer(minLength: 0)
            if model.phase == .preparing {
                loadingView("次の曲を用意しています…").frame(height: 230)
            } else {
                donButton
            }
            controlRow
            if let err = model.playError {
                Text(err).font(.footnote).foregroundStyle(Theme.gold).multilineTextAlignment(.center)
            }
            Spacer(minLength: 0)
            if model.phase == .judged, let q = model.current {
                answerCard(q)
            } else if let q = model.current {
                choices(q)
            }
        }
        .padding(16)
    }

    private var topBar: some View {
        HStack {
            Button(action: close) {
                Image(systemName: "xmark").font(.headline)
                    .padding(10).background(Color.white.opacity(0.1), in: Circle())
            }
            Spacer()
            VStack(spacing: 2) {
                Text(model.stage?.title ?? "")
                    .font(.system(size: 13, weight: .heavy, design: .rounded))
                    .foregroundStyle(Theme.gold)
                Text("第\(model.numberInStage)問 / \(model.stage?.count ?? 0)")
                    .font(.system(size: 18, weight: .heavy, design: .rounded))
                Text("\(model.settings.genre.label)・\(model.settings.era.label)・\(model.settings.fame.label)")
                    .font(.caption2).opacity(0.6)
            }
            Spacer()
            Text("\(model.score)点")
                .font(.system(size: 18, weight: .heavy, design: .rounded))
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Color.white.opacity(0.1), in: Capsule())
                .contentTransition(.numericText())
                .animation(.spring, value: model.score)
        }
    }

    private var livesRow: some View {
        HStack(spacing: 8) {
            Text("お手つき").font(.caption).opacity(0.7)
            ForEach(0..<2, id: \.self) { i in
                Text("✕")
                    .font(.system(size: 22, weight: .black))
                    .foregroundStyle(i < model.misses ? Theme.wrong : Color.white.opacity(0.15))
                    .scaleEffect(i < model.misses ? 1.2 : 1)
                    .animation(.spring(response: 0.3, dampingFraction: 0.4), value: model.misses)
            }
            Spacer()
            Text("1問 \(model.stage?.points ?? 0)点").font(.caption.bold()).foregroundStyle(Theme.gold)
        }
        .padding(.horizontal, 6)
    }

    private var donButton: some View {
        let isPlaying = model.phase == .playing
        return Button { model.play() } label: {
            ZStack {
                if isPlaying { PulseRings() }
                Circle()
                    .fill(LinearGradient(colors: [Theme.pink, Color.orange], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 170, height: 170)
                    .shadow(color: Theme.pink.opacity(0.7), radius: 20)
                VStack(spacing: 4) {
                    Text(isPlaying ? "♪♪♪" : "ドン！")
                        .font(.system(size: 40, weight: .black, design: .rounded))
                    Text(isPlaying ? "わかったら選んで！" : (model.playCount == 0 ? "タップでイントロ" : "もう一度"))
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                }
            }
            .frame(width: 230, height: 230)
            .scaleEffect(isPlaying ? 1.05 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.5), value: isPlaying)
        }
        .buttonStyle(.plain)
        .disabled(isPlaying || model.phase == .judged)
    }

    private var controlRow: some View {
        HStack(spacing: 10) {
            if model.phase != .judged && model.phase != .preparing {
                if !model.isShowRule {
                    smallButton("+1秒で聴く", icon: "plus.circle") { model.playLonger() }
                        .disabled(model.phase == .playing)
                }
                smallButton("答えを見る", icon: "eye") { model.reveal() }
            }
        }
        .overlay(alignment: .bottom) {
            Text(String(format: "イントロ %.1f秒", model.introLength) + (model.startLabel.map { "・\($0)" } ?? ""))
                .font(.caption).opacity(0.6).offset(y: 22).fixedSize()
        }
    }

    private func smallButton(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(Color.white.opacity(0.12), in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private func choices(_ q: Question) -> some View {
        VStack(spacing: 10) {
            ForEach(q.choices) { c in
                Button { model.answer(c) } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.title).font(.system(size: 17, weight: .bold, design: .rounded)).lineLimit(2)
                        Text(c.artist).font(.caption).opacity(0.7).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16).padding(.vertical, 12)
                    .background(Color.white.opacity(0.09), in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.15)))
                }
                .buttonStyle(.plain)
                .disabled(!model.canAnswer)
                .opacity(model.canAnswer ? 1 : 0.45)
            }
        }
        .id(q.id)
        .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))
    }

    private func answerCard(_ q: Question) -> some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                AsyncImage(url: q.song.artworkURL) { img in
                    img.resizable().scaledToFill()
                } placeholder: {
                    ZStack { Color.white.opacity(0.1); Text("🎵").font(.title) }
                }
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 3) {
                    Text("正解").font(.caption).foregroundStyle(Theme.gold)
                    Text(q.answerTitle).font(.system(size: 19, weight: .heavy, design: .rounded)).lineLimit(2)
                    Text(q.answerArtist.isEmpty ? q.song.artist : q.answerArtist)
                        .font(.subheadline).opacity(0.8).lineLimit(1)
                    Text((q.candidate.year ?? q.song.year).map { "\($0)年" } ?? "")
                        .font(.subheadline).opacity(0.8).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            if !model.tieUps.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(model.tieUps, id: \.self) { t in
                        Text(t.display).font(.system(size: 15, weight: .bold, design: .rounded))
                    }
                    Text(q.candidate.hit?.animeName != nil ? "作品名：アニソンランキングの出典より" : "タイアップ情報：Wikipedia の記述より")
                        .font(.caption2).opacity(0.5)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
                .background(Theme.cyan.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
            }
            if let hit = q.candidate.hit {
                VStack(alignment: .leading, spacing: 2) {
                    Text("🏆 \(hit.s)" + (hit.r > 0 ? " \(hit.r)位" : ""))
                    if let s2 = hit.s2 { Text("🏆 \(s2)") }
                }
                .font(.caption).opacity(0.7)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 10) {
                smallButton("続きを聴く", icon: "play.fill") { model.listenMore() }
                if let url = q.song.storeURL {
                    smallButton("Apple Music", icon: "arrow.up.right.square") { openURL(url) }
                }
            }
            if model.settings.source == .preview {
                Text("試聴音源提供：iTunes").font(.caption2).opacity(0.5)
            }
            Button { model.next() } label: {
                Text(nextLabel)
                    .font(.system(size: 20, weight: .black, design: .rounded))
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(Theme.gold, in: RoundedRectangle(cornerRadius: 16))
                    .foregroundStyle(.black)
            }
            .buttonStyle(.plain)
        }
        .padding(14)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 20))
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private var nextLabel: String {
        let lastInStage = model.numberInStage >= (model.stage?.count ?? 0) || model.disqualified
        if lastInStage {
            return model.stageIndex + 1 < model.stages.count ? "次のステージへ ▶︎" : "結果発表 ▶︎"
        }
        return "次の問題へ ▶︎"
    }

    private func failedView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Text("😢").font(.system(size: 60))
            Text(message).multilineTextAlignment(.center).padding(.horizontal, 24)
            Button("条件を変える", action: close)
                .font(.headline).padding(.horizontal, 24).padding(.vertical, 12)
                .background(Theme.gold, in: Capsule()).foregroundStyle(.black)
        }
    }
}

// MARK: - ステージ紹介（番組風の幕あい）

struct StageIntroView: View {
    @ObservedObject var model: QuizModel
    let onClose: () -> Void
    @State private var show = false

    var body: some View {
        VStack(spacing: 18) {
            HStack {
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.headline)
                        .padding(10).background(Color.white.opacity(0.1), in: Circle())
                }
                Spacer()
                Text("\(model.score)点").font(.system(size: 18, weight: .heavy, design: .rounded))
            }
            Spacer()
            if let st = model.stage {
                Text(stageNumber)
                    .font(.system(size: 20, weight: .heavy, design: .rounded))
                    .foregroundStyle(Theme.cyan)
                    .opacity(show ? 1 : 0)
                Text(st.title)
                    .font(.system(size: 38, weight: .black, design: .rounded))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(LinearGradient(colors: [Theme.gold, Theme.pink], startPoint: .leading, endPoint: .trailing))
                    .scaleEffect(show ? 1 : 0.2)
                    .rotationEffect(.degrees(show ? 0 : -12))
                Text(st.subtitle)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .opacity(show ? 1 : 0)
                VStack(spacing: 6) {
                    Text(String(format: "イントロ %.1f秒 × %ld問", st.introSeconds, st.count))
                    if model.isShowRule {
                        Text("お手つき・不正解は −5点、✕2つで失格（得点没収）")
                    }
                    Text("曲が流れている間でも、わかったらすぐ選べます（早押し）")
                }
                .font(.footnote).opacity(0.75).multilineTextAlignment(.center)
                .padding(.top, 6)
            }
            Spacer()
            Button { model.startStage() } label: {
                Text("スタート！")
                    .font(.system(size: 24, weight: .black, design: .rounded))
                    .frame(maxWidth: .infinity).padding(.vertical, 18)
                    .background(LinearGradient(colors: [Theme.pink, Color.orange], startPoint: .leading, endPoint: .trailing),
                                in: RoundedRectangle(cornerRadius: 20))
                    .shadow(color: Theme.pink.opacity(0.6), radius: 14, y: 6)
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .onAppear {
            show = false
            withAnimation(.spring(response: 0.6, dampingFraction: 0.55)) { show = true }
        }
        .id(model.stageIndex)
    }

    private var stageNumber: String {
        if model.stages.count == 1 { return "" }
        if model.stageIndex == model.stages.count - 1 { return "最終ステージ" }
        return "第\(model.stageIndex + 1)ステージ"
    }
}

// MARK: - 再生中の波紋

struct PulseRings: View {
    @State private var animate = false
    var body: some View {
        ZStack {
            ForEach(0..<3) { i in
                Circle()
                    .stroke(Theme.gold.opacity(0.7), lineWidth: 3)
                    .frame(width: 170, height: 170)
                    .scaleEffect(animate ? 1.35 : 1)
                    .opacity(animate ? 0 : 0.8)
                    .animation(.easeOut(duration: 1.2).repeatForever(autoreverses: false).delay(Double(i) * 0.4), value: animate)
            }
        }
        .onAppear { animate = true }
    }
}

// MARK: - 当たり / ハズレのモーション

struct JudgeOverlay: View {
    let judgement: Judgement
    let disqualified: Bool
    @State private var appear = false
    @State private var shake: CGFloat = 0
    @State private var fade = false

    private var isCorrect: Bool { if case .correct = judgement { return true }; return false }
    private var isRevealed: Bool { judgement == .revealed }

    private var caption: String {
        switch judgement {
        case .correct(let p): return "せいかい！ +\(p)点"
        case .wrong(_, let penalty): return disqualified ? "失格…" : (penalty > 0 ? "ざんねん… −\(penalty)点" : "ざんねん…")
        case .revealed: return "こたえは…"
        }
    }

    var body: some View {
        ZStack {
            (isCorrect ? Theme.correct : (isRevealed ? Theme.gold : Theme.wrong))
                .opacity(appear ? 0.0 : 0.35)
                .ignoresSafeArea()
                .animation(.easeOut(duration: 0.6), value: appear)

            if isCorrect { Confetti() }

            VStack(spacing: 8) {
                ZStack {
                    if isCorrect {
                        Circle()
                            .trim(from: 0, to: appear ? 1 : 0)
                            .stroke(Theme.correct, style: StrokeStyle(lineWidth: 26, lineCap: .round))
                            .frame(width: 190, height: 190)
                            .rotationEffect(.degrees(-90))
                            .animation(.easeOut(duration: 0.45), value: appear)
                    } else if isRevealed {
                        Text("💡").font(.system(size: 120))
                    } else {
                        CrossMark(progress: appear ? 1 : 0)
                            .stroke(Theme.wrong, style: StrokeStyle(lineWidth: 26, lineCap: .round))
                            .frame(width: 170, height: 170)
                            .animation(.easeOut(duration: 0.35), value: appear)
                    }
                }
                Text(caption)
                    .font(.system(size: 36, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.5), radius: 6)
                Text(isCorrect ? "😆" : (isRevealed ? "🤔" : (disqualified ? "😭" : "😵")))
                    .font(.system(size: 64))
                    .offset(y: isCorrect && appear ? -24 : 0)
                    .animation(isCorrect ? .interpolatingSpring(stiffness: 220, damping: 6).repeatCount(3, autoreverses: true) : .default, value: appear)
            }
            .scaleEffect(appear ? 1 : 0.3)
            .rotationEffect(.degrees(isCorrect && !appear ? -20 : 0))
            .offset(x: shake)
            .animation(.spring(response: 0.4, dampingFraction: 0.55), value: appear)
            .opacity(fade ? 0 : 1)
            .animation(.easeIn(duration: 0.4), value: fade)
        }
        .onAppear {
            appear = true
            if !isCorrect && !isRevealed { runShake() }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) { fade = true }
        }
    }

    private func runShake() {
        let steps: [CGFloat] = [-24, 22, -18, 14, -8, 4, 0]
        for (i, x) in steps.enumerated() {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25 + Double(i) * 0.06) {
                withAnimation(.linear(duration: 0.06)) { shake = x }
            }
        }
    }
}

struct CrossMark: Shape {
    var progress: CGFloat
    var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let first = min(progress * 2, 1)
        let second = max(progress * 2 - 1, 0)
        p.move(to: CGPoint(x: rect.minX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.minX + rect.width * first, y: rect.minY + rect.height * first))
        if second > 0 {
            p.move(to: CGPoint(x: rect.maxX, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.maxX - rect.width * second, y: rect.minY + rect.height * second))
        }
        return p
    }
}

struct Confetti: View {
    private struct Piece: Identifiable {
        let id = UUID()
        let symbol: String
        let x: CGFloat
        let delay: Double
        let spin: Double
        let size: CGFloat
    }

    @State private var fall = false
    private let pieces: [Piece] = (0..<36).map { _ in
        Piece(symbol: ["🎉", "✨", "🎵", "⭐️", "🎶", "💖"].randomElement()!,
              x: CGFloat.random(in: 0...1), delay: Double.random(in: 0...0.4),
              spin: Double.random(in: -360...360), size: CGFloat.random(in: 18...34))
    }

    var body: some View {
        GeometryReader { geo in
            ForEach(pieces) { p in
                Text(p.symbol)
                    .font(.system(size: p.size))
                    .rotationEffect(.degrees(fall ? p.spin : 0))
                    .position(x: p.x * geo.size.width, y: fall ? geo.size.height + 40 : -40)
                    .animation(.easeIn(duration: 1.6).delay(p.delay), value: fall)
            }
        }
        .ignoresSafeArea()
        .onAppear { fall = true }
    }
}

// MARK: - 結果

struct ResultView: View {
    @ObservedObject var model: QuizModel
    let onRetry: () -> Void
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Text("結果発表").font(.system(size: 22, weight: .heavy, design: .rounded)).foregroundStyle(Theme.cyan)
            Text("\(model.score)点")
                .font(.system(size: 64, weight: .black, design: .rounded))
                .foregroundStyle(Theme.gold)
            Text("\(model.totalAsked)問中 \(correctCount)問正解").font(.headline)
            Text(rank).font(.title3.bold())
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(model.history) { item in
                        HStack(alignment: .top) {
                            Text(mark(item.judgement)).font(.title3)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title).font(.subheadline.bold()).lineLimit(1)
                                Text(item.artist).font(.caption).opacity(0.7).lineLimit(1)
                                if let t = item.tieUps.first {
                                    Text(t.display).font(.caption2).opacity(0.7).lineLimit(1)
                                }
                            }
                            Spacer()
                        }
                        .padding(10)
                        .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                    }
                }
            }
            HStack(spacing: 12) {
                Button("もう一回", action: onRetry)
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(Theme.pink, in: RoundedRectangle(cornerRadius: 16))
                Button("条件を変える", action: onClose)
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(Color.white.opacity(0.15), in: RoundedRectangle(cornerRadius: 16))
            }
            .font(.headline)
        }
        .padding(16)
    }

    private var correctCount: Int {
        model.history.filter { if case .correct = $0.judgement { return true }; return false }.count
    }

    private var rank: String {
        let total = max(model.totalAsked, 1)
        let r = Double(correctCount) / Double(total)
        switch r {
        case 1: return "👑 パーフェクト！イントロ王！"
        case 0.7...: return "🎉 すごい！音楽通！"
        case 0.4...: return "🙂 なかなか！"
        default: return "💪 次はがんばろう！"
        }
    }

    private func mark(_ j: Judgement) -> String {
        switch j {
        case .correct: return "⭕️"
        case .wrong: return "❌"
        case .revealed: return "💡"
        }
    }
}
