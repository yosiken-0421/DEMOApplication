import SwiftUI
import AVFoundation

@main
struct HoshiMamoriApp: App {
    init() {
        // マナーモード(消音スイッチ)でも効果音が鳴るようにする
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    var body: some Scene {
        WindowGroup {
            GameView()
                .ignoresSafeArea()
                .background(Color(red: 18 / 255, green: 13 / 255, blue: 46 / 255))
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
                .onAppear {
                    // プレイ中に画面が暗くならないように
                    UIApplication.shared.isIdleTimerDisabled = true
                }
        }
    }
}
