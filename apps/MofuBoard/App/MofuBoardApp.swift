import SwiftUI
import AVFoundation

@main
struct MofuBoardApp: App {
    init() {
        // マナーモードでも効果音が鳴るように（他のアプリの音楽は止めない）
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    var body: some Scene {
        WindowGroup {
            GameView()
                .ignoresSafeArea()
                .background(Color(red: 1.0, green: 244 / 255, blue: 232 / 255))
                .persistentSystemOverlays(.hidden)
                .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        }
    }
}
