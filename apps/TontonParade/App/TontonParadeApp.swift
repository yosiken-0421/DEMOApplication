import SwiftUI
import AVFoundation

@main
struct TontonParadeApp: App {
    init() {
        // マナーモード(消音スイッチ)でも音が鳴るようにする
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    var body: some Scene {
        WindowGroup {
            GameView()
                .ignoresSafeArea()
                .background(Color(red: 43 / 255, green: 23 / 255, blue: 71 / 255))
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
                .onAppear {
                    // プレイ中に画面が暗くならないように
                    UIApplication.shared.isIdleTimerDisabled = true
                }
        }
    }
}
