import SwiftUI
import MachikaneCore

/// カウントダウンのカード
struct EntryCard: View {
    let entry: CountdownEntry
    var now: Date = Date()

    private var isToday: Bool { entry.section(now: now) == .today }

    var body: some View {
        HStack(spacing: 0) {
            Rectangle().fill(entry.category.color).frame(width: 6)
            HStack(alignment: .center, spacing: 12) {
                Thumbnail(url: entry.imageURL, category: entry.category, highlighted: isToday)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        if isToday {
                            Text("今日！")
                                .font(.caption.bold())
                                .padding(.horizontal, 8).padding(.vertical, 2)
                                .background(.white, in: Capsule())
                                .foregroundStyle(entry.category.color)
                        }
                        Text(entry.kindLabel)
                            .font(.caption)
                            .foregroundStyle(isToday ? Color.white.opacity(0.9) : Color.secondary)
                    }
                    Text(entry.title)
                        .font(.headline)
                        .lineLimit(2)
                        .foregroundStyle(isToday ? Color.white : Color.primary)
                    if !entry.subtitle.isEmpty {
                        Text(entry.subtitle)
                            .font(.subheadline)
                            .lineLimit(1)
                            .foregroundStyle(isToday ? Color.white.opacity(0.9) : Color.secondary)
                    }
                    SourceLine(entry: entry, onDark: isToday)
                }
                Spacer(minLength: 4)
                CountdownBadge(entry: entry, now: now, onDark: isToday)
            }
            .padding(12)
        }
        .background {
            if isToday {
                entry.category.gradient
            } else {
                Color(.secondarySystemGroupedBackground)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(isToday ? 0.15 : 0.05), radius: 6, y: 2)
        .accessibilityElement(children: .combine)
    }
}

struct SourceLine: View {
    let entry: CountdownEntry
    var onDark = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let d = entry.date {
                Text(entry.hasTime ? d.mkDateTimeText : d.mkDateText)
                    .font(.caption.monospacedDigit())
            } else {
                Text("予定（日付未確定）：\(entry.undeterminedText)")
                    .font(.caption)
            }
            if entry.category != .coin || entry.source != .manual {
                Text(sourceText)
                    .font(.caption2)
            }
            if entry.possiblyUncertain {
                Label("日付未確定の可能性あり", systemImage: "exclamationmark.triangle.fill")
                    .font(.caption2.bold())
                    .foregroundStyle(onDark ? Color.white : Color.orange)
            }
        }
        .foregroundStyle(onDark ? Color.white.opacity(0.85) : Color.secondary)
    }

    private var sourceText: String {
        var s = "出典：\(entry.source.displayName)"
        if let f = entry.fetchedAt { s += "・\(f.mkDateTimeText) 取得" }
        return s
    }
}

struct CountdownBadge: View {
    let entry: CountdownEntry
    let now: Date
    var onDark = false

    var body: some View {
        if let d = entry.date {
            let big = Countdown.bigNumber(for: d, hasTime: entry.hasTime, now: now)
            ZStack {
                ProgressRing(progress: Countdown.progress(start: entry.startDate, target: d, now: now),
                             color: onDark ? .white : entry.category.color)
                VStack(spacing: 0) {
                    if !big.unit.isEmpty && big.unit != "日前" { Text("あと").font(.caption2) }
                    Text(big.number)
                        .font(.system(.title, design: .rounded).bold())
                        .minimumScaleFactor(0.4)
                        .lineLimit(1)
                    if !big.unit.isEmpty { Text(big.unit).font(.caption2) }
                }
                .padding(8)
            }
            .frame(width: 76, height: 76)
            .foregroundStyle(onDark ? .white : entry.category.color)
            .accessibilityLabel(Countdown.label(for: d, hasTime: entry.hasTime, now: now))
        } else {
            VStack(spacing: 2) {
                Image(systemName: "questionmark.circle")
                    .font(.title2)
                Text("未確定").font(.caption2)
            }
            .frame(width: 76, height: 76)
            .foregroundStyle(.secondary)
        }
    }
}

struct Thumbnail: View {
    let url: URL?
    let category: ItemCategory
    var highlighted = false
    var size: CGFloat = 52

    var body: some View {
        Group {
            if let url {
                AsyncImage(url: url) { phase in
                    if let img = phase.image {
                        img.resizable().scaledToFill()
                    } else {
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size * 1.3)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var placeholder: some View {
        ZStack {
            (highlighted ? Color.white.opacity(0.25) : category.color.opacity(0.15))
            Image(systemName: category.symbolName)
                .font(.title2)
                .foregroundStyle(highlighted ? .white : category.color)
        }
    }
}

/// 空状態：SF Symbols＋1 行の説明＋「追加する」ボタン
struct EmptyStateView: View {
    let symbol: String
    let message: String
    var buttonTitle = "追加する"
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: symbol)
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text(message)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if let action {
                Button(action: action) {
                    Label(buttonTitle, systemImage: "plus")
                        .font(.headline)
                        .padding(.horizontal, 12)
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

/// 通知・カレンダーが拒否されているときのバナー
struct PermissionBanner: View {
    let title: String
    let reason: String
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: "bell.slash.fill")
                .font(.subheadline.bold())
            Text(reason)
                .font(.footnote)
                .foregroundStyle(.secondary)
            Button("設定アプリを開く", action: action)
                .buttonStyle(.bordered)
                .font(.footnote)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
    }
}

/// 2 つのデータでの確認状態
struct DoubleCheckBadge: View {
    let status: DoubleCheckStatus

    var body: some View {
        switch status {
        case .confirmed:
            Label("2つのデータで確認済み", systemImage: "checkmark.seal.fill")
                .font(.caption.bold())
                .foregroundStyle(.green)
        case .mismatch:
            Label("日付が一致しません", systemImage: "exclamationmark.triangle.fill")
                .font(.caption.bold())
                .foregroundStyle(.orange)
        case .single:
            Label("1つのデータのみ", systemImage: "circle.dashed")
                .font(.caption2)
                .foregroundStyle(.secondary)
        case .none:
            EmptyView()
        }
    }
}
