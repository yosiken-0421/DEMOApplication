import SwiftUI
import AVFoundation
import UserNotifications

@main
struct SorairoApp: App {
    init() {
        // 消音スイッチに従い、ほかのアプリの音楽とも一緒に鳴らせるようにする
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        // アプリを開いている間に届いた通知は表示しない
        UNUserNotificationCenter.current().delegate = NotificationDelegate.shared
    }

    var body: some Scene {
        WindowGroup {
            GameView()
                .ignoresSafeArea()
                .background(Color(red: 1.0, green: 232 / 255, blue: 241 / 255))
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
        }
    }
}

final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationDelegate()

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([])
    }
}
