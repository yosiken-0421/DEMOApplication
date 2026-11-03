import SwiftUI

@main
struct MichiNaviApp: App {
    init() {
        // 起動時に案内エンジンを用意（位置の更新を受け取れるように）
        _ = NavEngine.shared
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
