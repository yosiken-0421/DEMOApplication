import Foundation
import AVFoundation
import UIKit

/// 答えの読み上げ（iPhone 内蔵の日本語音声）
@MainActor
final class Speaker {
    private let synth = AVSpeechSynthesizer()

    func say(_ text: String) {
        synth.stopSpeaking(at: .immediate)
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: "ja-JP")
        u.rate = 0.52
        u.pitchMultiplier = 1.1
        synth.speak(u)
    }

    func stop() { synth.stopSpeaking(at: .immediate) }
}

/// 番組風のステージ
struct Stage: Equatable {
    let title: String
    let subtitle: String
    let points: Int
    let introSeconds: Double
    let count: Int
}

/// 選択肢（曲名と歌手）
struct Choice: Identifiable, Hashable {
    let id: String
    let title: String
    let artist: String
}

struct Question: Identifiable {
    let id = UUID()
    let candidate: Candidate
    let song: Song
    let choices: [Choice]

    var answerTitle: String { candidate.title }
    var answerArtist: String { candidate.artist.isEmpty ? song.artist : candidate.artist }
    var spokenAnswer: String { "\(answerArtist)の、\(candidate.title)" }
}

enum Judgement: Equatable {
    case correct(points: Int)
    case wrong(picked: Choice, penalty: Int)
    case revealed   // 「答えを見る」ボタン
}

struct HistoryItem: Identifiable {
    let id = UUID()
    let stageTitle: String
    let title: String
    let artist: String
    let judgement: Judgement
    let tieUps: [TieUp]
}

@MainActor
final class QuizModel: ObservableObject {
    enum Phase: Equatable { case loading, stageIntro, preparing, ready, playing, waiting, judged, finished, failed(String) }

    @Published var phase: Phase = .loading
    @Published var stages: [Stage] = []
    @Published var stageIndex = 0
    @Published var numberInStage = 0          // 1 から
    @Published var current: Question?
    @Published var judgement: Judgement?
    @Published var score = 0
    @Published var misses = 0                 // 今のステージの✕の数
    @Published var disqualified = false       // 今のステージで失格
    @Published var playCount = 0
    @Published var playError: String?
    @Published var startLabel: String?
    @Published var tieUps: [TieUp] = []
    @Published var history: [HistoryItem] = []
    @Published var totalAsked = 0
    /// 年代を広げたときのお知らせ
    @Published var planNote: String?

    let settings: QuizSettings
    private let player = IntroPlayer()
    private let speaker = Speaker()
    private var extraSeconds: Double = 0

    private var plan = QuizPlan(famous: [], minor: [])
    private var queue: [Candidate] = []
    private var usedAnswerIDs = Set<String>()
    private var usedAnswerTitles = Set<String>()
    private var recentChoiceIDs: [String] = []
    private var nextQuestion: Question?
    private var prefetchTask: Task<Question?, Never>?

    init(settings: QuizSettings) {
        self.settings = settings
        player.currentModeIsPreview = settings.source == .preview
    }

    var stage: Stage? { stages.indices.contains(stageIndex) ? stages[stageIndex] : nil }
    var introLength: Double { (stage?.introSeconds ?? settings.introSeconds) + extraSeconds }
    var isShowRule: Bool { settings.rule == .show }

    // MARK: 準備

    func load() async {
        phase = .loading
        do {
            plan = try await SongProvider.makePlan(settings: settings)
            planNote = plan.note
            queue = Self.makeQueue(plan: plan, fame: settings.fame)
            stages = Self.makeStages(settings: settings)
            stageIndex = 0; score = 0; history = []; totalAsked = 0
            usedAnswerIDs = []; usedAnswerTitles = []; recentChoiceIDs = []
            nextQuestion = nil; prefetchTask = nil
            beginStage()
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    private static func makeQueue(plan: QuizPlan, fame: Fame) -> [Candidate] {
        switch fame {
        case .famous: return plan.famous
        case .minor: return plan.minor
        case .mix:
            var out: [Candidate] = []
            let f = plan.famous, m = plan.minor
            for i in 0..<max(f.count, m.count) {
                if i < f.count { out.append(f[i]) }
                if i < m.count { out.append(m[i]) }
            }
            return out
        }
    }

    private static func makeStages(settings: QuizSettings) -> [Stage] {
        let n = settings.questionCount
        let base = settings.introSeconds
        switch settings.rule {
        case .free:
            return [Stage(title: "フリープレイ", subtitle: "1問1点", points: 1, introSeconds: base, count: n)]
        case .show:
            let a = Int((Double(n) / 3).rounded(.up))
            let b = Int((Double(n - a) / 2).rounded(.up))
            let c = max(1, n - a - b)
            return [
                Stage(title: "イントロクイズ", subtitle: "正解で5点", points: 5, introSeconds: base, count: a),
                Stage(title: "ウルトラ イントロクイズ", subtitle: "もっと短く！ 正解で10点", points: 10,
                      introSeconds: max(0.8, base * 0.5), count: b),
                Stage(title: "超ウルトラ イントロクイズ", subtitle: "ほぼ一音！ 正解で20点", points: 20,
                      introSeconds: 0.5, count: c),
            ]
        }
    }

    private func beginStage() {
        guard let st = stage else { finish(); return }
        numberInStage = 0
        misses = 0
        disqualified = false
        phase = .stageIntro
        let num = ["第1", "第2", "最終"]
        let label = stages.count == 1 ? "" : ((stageIndex == stages.count - 1 ? num[2] : num[min(stageIndex, 1)]) + "ステージ！ ")
        speaker.say("\(label)\(st.title)！ \(st.subtitle)！" + (isShowRule ? " 間違えるとマイナス5点。バツ2つで失格です。" : ""))
        prefetchNext()
    }

    /// ステージ紹介の画面から1問目へ
    func startStage() {
        speaker.stop()
        advanceToNextQuestion()
    }

    // MARK: 出題

    private func prefetchNext() {
        guard prefetchTask == nil, nextQuestion == nil else { return }
        prefetchTask = Task { [weak self] in
            guard let self else { return nil }
            let q = await self.buildQuestion()
            self.nextQuestion = q
            self.prefetchTask = nil
            return q
        }
    }

    private func advanceToNextQuestion() {
        guard let st = stage else { finish(); return }
        if numberInStage >= st.count || disqualified {
            stageIndex += 1
            beginStage()
            return
        }
        resetQuestionState()
        phase = .preparing
        Task {
            var q = nextQuestion
            nextQuestion = nil
            if q == nil {
                if let t = prefetchTask { q = await t.value; nextQuestion = nil }
                else { q = await buildQuestion() }
            }
            prefetchTask = nil
            guard let q else {
                // もう出せる曲がない
                finish()
                return
            }
            current = q
            numberInStage += 1
            totalAsked += 1
            phase = .ready
            let qid = q.id
            if let an = q.candidate.hit?.animeName {
                tieUps = [TieUp(kind: .anime, name: an)]
            } else { Task {
                let t = await TieUpLookup.shared.tieUps(for: q.song)
                if current?.id == qid { tieUps = t }
            } }
            if usesVocalStart { Task { _ = await LyricsTiming.shared.vocalStart(for: q.song) } }
            prefetchNext()
        }
    }

    /// 次の問題を作る（ヒット曲は Apple の曲データと照合して、再生できたものだけ出題）
    private func buildQuestion() async -> Question? {
        var tries = 0
        // 照合済みの曲はまとめて Apple から情報を取っておく（通信1回で最大50曲）
        await TrackLookup.shared.prefetch(queue.prefix(40).compactMap { $0.hit?.id })
        while !queue.isEmpty && tries < 40 {
            let c = queue.removeFirst()
            let titleKey = TextMatch.core(c.title)
            guard !usedAnswerIDs.contains(c.id), !usedAnswerTitles.contains(titleKey) else { continue }
            tries += 1
            guard let song = await SongProvider.resolve(c, settings: settings) else { continue }
            usedAnswerIDs.insert(c.id)
            usedAnswerTitles.insert(titleKey)
            return Question(candidate: c, song: song, choices: makeChoices(for: c, song: song))
        }
        return nil
    }

    /// 選択肢：同じ種類（有名/マイナー）の曲から。これまでの答えと、直前に出た選択肢は使わない
    private func makeChoices(for answer: Candidate, song: Song) -> [Choice] {
        let samePool = answer.isHit ? plan.famous : plan.minor
        let otherPool = answer.isHit ? plan.minor : plan.famous
        let answerCore = TextMatch.core(answer.title)
        var picked: [Candidate] = []

        func fill(from pool: [Candidate], allowRecent: Bool) {
            for c in pool.shuffled() where picked.count < 3 {
                let core = TextMatch.core(c.title)
                guard c.id != answer.id, core != answerCore, !c.artist.isEmpty,
                      !usedAnswerIDs.contains(c.id), !usedAnswerTitles.contains(core),
                      allowRecent || !recentChoiceIDs.contains(c.id),
                      !picked.contains(where: { TextMatch.core($0.title) == core }) else { continue }
                picked.append(c)
            }
        }
        fill(from: samePool, allowRecent: false)
        fill(from: otherPool, allowRecent: false)
        fill(from: samePool, allowRecent: true)
        fill(from: otherPool, allowRecent: true)

        recentChoiceIDs.append(contentsOf: picked.map(\.id))
        if recentChoiceIDs.count > 30 { recentChoiceIDs.removeFirst(recentChoiceIDs.count - 30) }

        let all = picked.map { Choice(id: $0.id, title: $0.title, artist: $0.artist) }
            + [Choice(id: answer.id, title: answer.title, artist: answer.artist.isEmpty ? song.artist : answer.artist)]
        return all.shuffled()
    }

    private func resetQuestionState() {
        judgement = nil
        playCount = 0
        extraSeconds = 0
        playError = nil
        startLabel = nil
        tieUps = []
        current = nil
    }

    // MARK: 再生

    private var usesVocalStart: Bool { settings.startFromVocal && settings.source != .preview }

    /// 再生開始位置：歌い出しの約1.5秒前（歌詞データが無ければ曲の頭）
    private func startTime(for song: Song) async -> Double {
        guard usesVocalStart else { return 0 }
        if let v = await LyricsTiming.shared.vocalStart(for: song), v > 2 {
            startLabel = "歌い出しから"
            return max(0, v - 1.5)
        }
        startLabel = "歌詞データが無いため曲の頭から"
        return 0
    }

    /// 「ドン！」：イントロを流す
    func play() {
        guard let q = current, phase == .ready || phase == .waiting else { return }
        speaker.stop()
        playError = nil
        phase = .playing
        let length = introLength
        Task {
            do {
                let start = await startTime(for: q.song)
                guard phase == .playing else { return }
                try await player.playIntro(q.song, from: start, seconds: length)
                playCount += 1
                try? await Task.sleep(nanoseconds: UInt64(length * 1_000_000_000))
                if phase == .playing { phase = .waiting }
            } catch is CancellationError {
            } catch {
                playError = error.localizedDescription
                if phase == .playing { phase = .waiting }
            }
        }
    }

    /// 「+1秒で聴く」（フリープレイのみ）
    func playLonger() {
        extraSeconds += 1
        play()
    }

    // MARK: 回答

    var canAnswer: Bool {
        (phase == .playing || phase == .waiting || (phase == .ready && playError != nil))
    }

    func answer(_ pick: Choice) {
        guard let q = current, canAnswer else { return }
        player.stop()
        let pts = stage?.points ?? 1
        let ok = pick.id == q.candidate.id
        var line: String
        if ok {
            score += pts
            judgement = .correct(points: pts)
            line = "ピンポーン！ 正解！ 答えは、\(q.spokenAnswer)、でした！"
        } else {
            let penalty = isShowRule ? 5 : 0
            score -= penalty
            misses += 1
            judgement = .wrong(picked: pick, penalty: penalty)
            line = "ブブー！ 残念！ 正解は、\(q.spokenAnswer)、でした。"
            if isShowRule && misses >= 2 {
                disqualified = true
                score = 0
                line += " バツが2つで失格！ 得点は没収です。"
            }
        }
        if let t = tieUps.first { line += " \(t.kind.rawValue)、\(t.name)、で使われた曲です。" }
        finishQuestion(judgement!, speech: line)
        UINotificationFeedbackGenerator().notificationOccurred(ok ? .success : .error)
    }

    /// 「答えを見る」ボタン（点数は動かない）
    func reveal() {
        guard let q = current, phase != .judged, phase != .preparing else { return }
        player.stop()
        judgement = .revealed
        var line = "答えは、\(q.spokenAnswer)、でした！"
        if let t = tieUps.first { line += " \(t.kind.rawValue)、\(t.name)、で使われた曲です。" }
        finishQuestion(.revealed, speech: line)
    }

    private func finishQuestion(_ j: Judgement, speech: String) {
        guard let q = current else { return }
        history.append(HistoryItem(stageTitle: stage?.title ?? "", title: q.answerTitle, artist: q.answerArtist,
                                   judgement: j, tieUps: tieUps))
        phase = .judged
        speaker.say(speech)
    }

    /// 答え合わせの後に続きを聴く
    func listenMore() {
        speaker.stop()
        player.resume(for: 15)
    }

    func next() {
        player.stop()
        speaker.stop()
        advanceToNextQuestion()
    }

    private func finish() {
        player.stop()
        phase = .finished
        speaker.say("結果発表！ \(totalAsked)問で、\(score)点でした！")
    }

    func quit() {
        prefetchTask?.cancel()
        player.stop()
        speaker.stop()
    }
}
