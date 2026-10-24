import SwiftUI
import AVFoundation

@main
struct MinaPaApp: App {
    init() {
        // 他のアプリの音楽を止めずに効果音を鳴らす
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
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
