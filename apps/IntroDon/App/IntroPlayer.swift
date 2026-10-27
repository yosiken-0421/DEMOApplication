import Foundation
import AVFoundation
import MediaPlayer

enum IntroPlayerError: LocalizedError {
    case notPlayable
    case startTimeout
    case prepare(String)

    var errorDescription: String? {
        switch self {
        case .notPlayable: return "この曲は再生できませんでした。次の問題へ進んでください。"
        case .startTimeout: return "再生が始まりませんでした（通信が遅いか、再生できない曲です）。"
        case .prepare(let m): return "再生の準備に失敗しました：\(m)"
        }
    }
}

/// イントロを「指定した秒数だけ」流すプレーヤー。
/// 秒数は実際に音が出始めた時点から数える（読み込み待ちの時間は含めない）。
@MainActor
final class IntroPlayer {
    private let music = MPMusicPlayerController.applicationQueuePlayer
    private var av: AVPlayer?
    private var loadedSongID: String?
    private var stopTask: Task<Void, Never>?
    private var playToken = 0

    /// 曲の頭（試聴音源は試聴の頭）から `seconds` 秒再生する
    func playIntro(_ song: Song, seconds: Double) async throws {
        stop()
        playToken += 1
        let token = playToken
        if currentModeIsPreview {
            guard let url = song.previewURL else { throw IntroPlayerError.notPlayable }
            try await playPreview(url: url, songID: song.id, seconds: seconds, token: token)
        } else {
            try await playMusic(song, seconds: seconds, token: token)
        }
    }

    /// 試聴モードかどうか（QuizModel から設定）
    var currentModeIsPreview = false

    func stop() {
        stopTask?.cancel()
        stopTask = nil
        av?.pause()
        if music.playbackState == .playing { music.pause() }
    }

    // MARK: 試聴音源（AVPlayer でストリーミング再生。保存はしない）

    private func playPreview(url: URL, songID: String, seconds: Double, token: Int) async throws {
        if loadedSongID != songID || av == nil {
            av = AVPlayer(url: url)
            loadedSongID = songID
        }
        guard let av else { throw IntroPlayerError.notPlayable }
        _ = await av.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero)
        av.play()
        try await waitUntilStarted(token: token) { av.currentTime().seconds > 0.02 && av.timeControlStatus == .playing }
        scheduleStop(after: seconds, token: token)
    }

    // MARK: iPhone のミュージック / Apple Music（曲の頭から）

    private func playMusic(_ song: Song, seconds: Double, token: Int) async throws {
        if loadedSongID != song.id {
            if let pid = song.libraryID {
                guard let item = SongProvider.libraryItems[pid] else { throw IntroPlayerError.notPlayable }
                music.setQueue(with: MPMediaItemCollection(items: [item]))
            } else if let sid = song.storeID {
                music.setQueue(with: MPMusicPlayerStoreQueueDescriptor(storeIDs: [sid]))
            } else {
                throw IntroPlayerError.notPlayable
            }
            music.repeatMode = .none
            music.shuffleMode = .off
            try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
                music.prepareToPlay { error in
                    if let error { cont.resume(throwing: IntroPlayerError.prepare(error.localizedDescription)) }
                    else { cont.resume() }
                }
            }
            loadedSongID = song.id
        }
        music.currentPlaybackTime = 0
        music.play()
        try await waitUntilStarted(token: token) { [music] in
            music.playbackState == .playing && music.currentPlaybackTime > 0.02
        }
        scheduleStop(after: seconds, token: token)
    }

    /// 答えの後に「続きを聴く」用：止まっている位置から再生を続ける
    func resume(for seconds: Double) {
        playToken += 1
        let token = playToken
        if currentModeIsPreview { av?.play() } else { music.play() }
        scheduleStop(after: seconds, token: token)
    }

    // MARK: 共通

    private func waitUntilStarted(token: Int, _ started: @escaping () -> Bool) async throws {
        let deadline = Date().addingTimeInterval(12)
        while !started() {
            if token != playToken { throw CancellationError() }
            if Date() > deadline {
                stop()
                throw IntroPlayerError.startTimeout
            }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    private func scheduleStop(after seconds: Double, token: Int) {
        stopTask?.cancel()
        stopTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            guard !Task.isCancelled, let self, self.playToken == token else { return }
            self.stop()
        }
    }
}
