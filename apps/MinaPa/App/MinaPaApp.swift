import SwiftUI
import AVFoundation

@main
struct MinaPaApp: App {
    init() {
        // マナーモード(消音スイッチ)でもBGM・効果音が鳴るようにする（他のアプリの音楽は止めない）
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    var body: some Scene {
        WindowGroup {
            GameView()
                .ignoresSafeArea()
                .background(Color(red: 42 / 255, green: 31 / 255, blue: 74 / 255))
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
                .onAppear {
                    // プレイ中に画面が暗くならないように
                    UIApplication.shared.isIdleTimerDisabled = true
                }
        }
    }
}
