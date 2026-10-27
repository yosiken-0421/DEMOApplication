import SwiftUI
import AVFoundation

@main
struct IntroDonApp: App {
    init() {
        // マナーモード（消音スイッチ）でも試聴音源と読み上げが鳴るようにする
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    var body: some Scene {
        WindowGroup {
            HomeView()
                .preferredColorScheme(.dark)
                .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        }
    }
}

// MARK: - 色とスタイル

enum Theme {
    static let bgTop = Color(red: 0.13, green: 0.06, blue: 0.30)
    static let bgBottom = Color(red: 0.03, green: 0.02, blue: 0.10)
    static let gold = Color(red: 1.0, green: 0.80, blue: 0.20)
    static let pink = Color(red: 1.0, green: 0.30, blue: 0.55)
    static let cyan = Color(red: 0.25, green: 0.85, blue: 1.0)
    static let correct = Color(red: 1.0, green: 0.25, blue: 0.30)
    static let wrong = Color(red: 0.30, green: 0.55, blue: 1.0)

    static var background: some View {
        ZStack {
            LinearGradient(colors: [bgTop, bgBottom], startPoint: .top, endPoint: .bottom)
            RadialGradient(colors: [pink.opacity(0.35), .clear], center: .top, startRadius: 10, endRadius: 420)
        }
        .ignoresSafeArea()
    }
}

struct Chip: View {
    let text: String
    let selected: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(text)
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .padding(.horizontal, 14).padding(.vertical, 9)
                .frame(minWidth: 64)
                .background(selected ? Theme.gold : Color.white.opacity(0.10), in: Capsule())
                .foregroundStyle(selected ? Color.black : Color.white)
                .overlay(Capsule().stroke(selected ? Theme.gold : Color.white.opacity(0.18), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .animation(.spring(response: 0.25), value: selected)
    }
}

struct SectionTitle: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 13, weight: .heavy, design: .rounded))
            .foregroundStyle(Theme.cyan)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// 折り返して並べるレイアウト（ジャンル・年代のチップ用）
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 320
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > width, x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            x += s.width + spacing
            rowH = max(rowH, s.height)
        }
        return CGSize(width: width, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            rowH = max(rowH, s.height)
        }
    }
}
