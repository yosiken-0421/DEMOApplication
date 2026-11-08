import SwiftUI
import MachikaneCore
#if canImport(ActivityKit)
import ActivityKit
#endif

/// アプリとウィジェットで共有する設定。App Group ID は Info.plist（MKAppGroup）から読む。
enum AppGroup {
    static var id: String? {
        let v = Bundle.main.object(forInfoDictionaryKey: "MKAppGroup") as? String
        return (v?.isEmpty == false) ? v : nil
    }
}

extension ItemCategory {
    var color: Color {
        switch self {
        case .manga: return .orange
        case .anime: return .purple
        case .coin: return .green
        }
    }

    var gradient: LinearGradient {
        LinearGradient(colors: [color.opacity(0.95), color.opacity(0.6)], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

/// 円形プログレスリング
struct ProgressRing: View {
    var progress: Double
    var color: Color
    var lineWidth: CGFloat = 5

    var body: some View {
        ZStack {
            Circle().stroke(color.opacity(0.2), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(0.001, min(1, progress)))
                .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .accessibilityElement()
        .accessibilityLabel("経過 \(Int(progress * 100))パーセント")
    }
}

#if canImport(ActivityKit)
/// Live Activity（当日の残り時間）
struct CountdownActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var target: Date
        var subtitle: String
    }
    var title: String
    var categoryRaw: String

    var category: ItemCategory { ItemCategory(rawValue: categoryRaw) ?? .manga }
}
#endif
