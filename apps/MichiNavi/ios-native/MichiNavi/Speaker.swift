import AVFoundation
import Foundation

/// 音声案内。ほかのアプリ（音楽・オービス警報）の音と混ぜて鳴らし、話す間だけ音楽を小さくする
@MainActor
final class Speaker: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = Speaker()

    private let synth = AVSpeechSynthesizer()
    private var voice: AVSpeechSynthesisVoice?

    override init() {
        super.init()
        synth.delegate = self
        voice = AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language == "ja-JP" }
            .max { $0.quality.rawValue < $1.quality.rawValue } ?? AVSpeechSynthesisVoice(language: "ja-JP")
    }

    /// urgent = 今話している内容を止めて話す（曲がり角の直前など）
    func say(_ text: String, urgent: Bool = false) {
        guard Store.shared.voiceOn, !text.isEmpty else { return }
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .voicePrompt, options: [.mixWithOthers, .duckOthers])
        try? session.setActive(true)
        if urgent, synth.isSpeaking { synth.stopSpeaking(at: .word) }
        let u = AVSpeechUtterance(string: text)
        u.voice = voice
        u.rate = 0.52
        u.prefersAssistiveTechnologySettings = false
        synth.speak(u)
    }

    func stop() { synth.stopSpeaking(at: .immediate) }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) {
        Task { @MainActor in self.releaseIfIdle() }
    }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel u: AVSpeechUtterance) {
        Task { @MainActor in self.releaseIfIdle() }
    }

    /// 話し終わったら音楽の音量を戻す
    private func releaseIfIdle() {
        guard !synth.isSpeaking else { return }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
