import SwiftUI
import SwiftData
import MachikaneCore

@main
struct MachikaneApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var model = AppModel.shared

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(model)
                .task {
                    await model.requestNotificationPermissionIfNeeded()
                    await model.refresh(force: false)
                }
        }
        .modelContainer(model.container)
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                Task { await model.rescheduleAll() }
            case .background:
                model.scheduleBackgroundRefresh()
            default: break
            }
        }
        .backgroundTask(.appRefresh(Refresher.taskID)) {
            await AppModel.shared.backgroundRefresh()
        }
    }
}

struct RootTabView: View {
    @State private var tab = 0

    var body: some View {
        TabView(selection: $tab) {
            TodayView()
                .tabItem { Label("今日", systemImage: "sun.max.fill") }
                .tag(0)
            CountdownListView()
                .tabItem { Label("カウントダウン", systemImage: "hourglass") }
                .tag(1)
            CalendarTabView()
                .tabItem { Label("カレンダー", systemImage: "calendar") }
                .tag(2)
            TimersView()
                .tabItem { Label("タイマー", systemImage: "timer") }
                .tag(3)
            SettingsView()
                .tabItem { Label("設定", systemImage: "gearshape.fill") }
                .tag(4)
        }
    }
}
