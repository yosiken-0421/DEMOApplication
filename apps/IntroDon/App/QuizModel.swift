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
        u.rate = 0.5
        u.pitchMultiplier = 1.1
        synth.speak(u)
    }

    func stop() { synth.stopSpeaking(at: .immediate) }
}

struct Question: Identifiable {
    let id = UUID()
    let song: Song
    let choices: [Song]
}

enum Judgement: Equatable {
    case correct
    case wrong(picked: Song)
    case revealed   // 「答えを見る」ボタン
}

@MainActor
final class QuizModel: ObservableObject {
    enum Phase: Equatable { case loading, ready, playing, waiting, judged, finished, failed(String) }

    @Published var phase: Phase = .loading
    @Published var questions: [Question] = []
    @Published var index = 0
    @Published var judgement: Judgement?
    @Published var score = 0
    @Published var playCount = 0
    @Published var playError: String?
    @Published var history: [(Song, Judgement)] = []
    /// 今の問題の再生開始位置の説明（「歌い出しから」など）
    @Published var startLabel: String?

    let settings: QuizSettings
    private let player = IntroPlayer()
    private let speaker = Speaker()
    private var extraSeconds: Double = 0

    init(settings: QuizSettings) {
        self.settings = settings
        player.currentModeIsPreview = settings.source == .preview
    }

    var current: Question? { questions.indices.contains(index) ? questions[index] : nil }
    var introLength: Double { settings.introSeconds + extraSeconds }

    func load() async {
        phase = .loading
        do {
            let pool = try await SongProvider.loadSongs(settings: settings).shuffled()
            let count = min(settings.questionCount, pool.count)
            questions = (0..<count).map { i in
                let answer = pool[i]
                var others = pool.filter { $0.title != answer.title }.shuffled()
                others = Array(others.prefix(3))
                return Question(song: answer, choices: (others + [answer]).shuffled())
            }
            index = 0; score = 0; history = []
            resetQuestionState()
            phase = .ready
            prefetchVocalStart()
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    private func resetQuestionState() {
        judgement = nil
        playCount = 0
        extraSeconds = 0
        playError = nil
        startLabel = nil
    }

    private var usesVocalStart: Bool { settings.startFromVocal && settings.source != .preview }

    /// 次の2問分の歌い出し時刻を先に調べておく（待ち時間を減らす）
    private func prefetchVocalStart() {
        guard usesVocalStart else { return }
        let songs = questions.dropFirst(index).prefix(2).map(\.song)
        Task { for s in songs { _ = await LyricsTiming.shared.vocalStart(for: s) } }
    }

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
        guard let q = current, phase != .judged else { return }
        speaker.stop()
        playError = nil
        phase = .playing
        Task {
            do {
                let start = await startTime(for: q.song)
                guard phase == .playing else { return }
                try await player.playIntro(q.song, from: start, seconds: introLength)
                playCount += 1
                try? await Task.sleep(nanoseconds: UInt64(introLength * 1_000_000_000))
                if phase == .playing { phase = .waiting }
            } catch is CancellationError {
            } catch {
                playError = error.localizedDescription
                phase = .waiting
            }
        }
    }

    /// 「もう少し聴く」：イントロを1秒ずつ延ばしてもう一度
    func playLonger() {
        extraSeconds += 1
        play()
    }

    func answer(_ pick: Song) {
        guard let q = current, phase != .judged else { return }
        player.stop()
        let ok = pick.id == q.song.id
        judgement = ok ? .correct : .wrong(picked: pick)
        if ok { score += 1 }
        history.append((q.song, judgement!))
        phase = .judged
        UINotificationFeedbackGenerator().notificationOccurred(ok ? .success : .error)
        speaker.say(ok ? "ピンポーン！正解！ 答えは、\(q.song.spokenAnswer)、でした！"
                       : "ブブー！残念！ 正解は、\(q.song.spokenAnswer)、でした。")
    }

    /// 「答えを見る」ボタン（点数は入らない）
    func reveal() {
        guard let q = current, phase != .judged else { return }
        player.stop()
        judgement = .revealed
        history.append((q.song, .revealed))
        phase = .judged
        speaker.say("答えは、\(q.song.spokenAnswer)、でした！")
    }

    /// 答え合わせの後に続きを聴く
    func listenMore() {
        speaker.stop()
        player.resume(for: 15)
    }

    func next() {
        player.stop()
        speaker.stop()
        if index + 1 < questions.count {
            index += 1
            resetQuestionState()
            phase = .ready
            prefetchVocalStart()
        } else {
            phase = .finished
            let total = questions.count
            speaker.say("結果発表！ \(total)問中、\(score)問正解でした！")
        }
    }

    func quit() {
        player.stop()
        speaker.stop()
    }
}
