import WidgetKit
import SwiftUI
import ActivityKit
import MachikaneCore

@main
struct MachikaneWidgetBundle: WidgetBundle {
    var body: some Widget {
        CountdownWidget()
        CountdownLiveActivity()
    }
}

struct CountdownEntryTL: TimelineEntry {
    let date: Date
    let items: [WidgetSnapshot.Entry]
}

struct CountdownProvider: TimelineProvider {
    func placeholder(in context: Context) -> CountdownEntryTL {
        CountdownEntryTL(date: Date(), items: [
            .init(id: "p", title: "作品タイトル", subtitle: "紙の発売日", category: .manga,
                  date: Date().addingTimeInterval(3 * 86400), hasTime: false, createdAt: Date().addingTimeInterval(-3 * 86400))
        ])
    }

    func getSnapshot(in context: Context, completion: @escaping (CountdownEntryTL) -> Void) {
        let now = Date()
        let items = WidgetSnapshot.load(suite: AppGroup.id)?.upcoming(now: now) ?? []
        completion(items.isEmpty && context.isPreview ? placeholder(in: context) : CountdownEntryTL(date: now, items: items))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CountdownEntryTL>) -> Void) {
        let now = Date()
        let snap = WidgetSnapshot.load(suite: AppGroup.id)
        let cal = Calendar.current
        var dates: [Date] = [now]
        // 日付が変わるたび（7日分）と、近い予定の時刻の前後で更新
        var day = cal.startOfDay(for: now)
        for _ in 0..<7 {
            day = cal.date(byAdding: .day, value: 1, to: day)!
            dates.append(day)
        }
        for e in snap?.entries ?? [] where e.hasTime && e.date > now && e.date < now.addingTimeInterval(86400) {
            dates.append(e.date)
            dates.append(e.date.addingTimeInterval(-3600))
        }
        let entries = Array(Set(dates)).filter { $0 >= now.addingTimeInterval(-1) }.sorted().map { d in
            CountdownEntryTL(date: d, items: snap?.upcoming(now: d) ?? [])
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct CountdownWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MachikaneCountdown", provider: CountdownProvider()) { entry in
            CountdownWidgetView(entry: entry)
                .containerBackground(for: .widget) { Color(.systemBackground) }
        }
        .configurationDisplayName("カウントダウン")
        .description("次の発売日・放送日までの日数を表示します。")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline, .accessoryCircular])
    }
}

struct CountdownWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CountdownEntryTL

    var body: some View {
        switch family {
        case .systemSmall: small
        case .systemMedium: medium
        case .accessoryRectangular: rectangular
        case .accessoryInline: inline
        case .accessoryCircular: circular
        default: small
        }
    }

    private var first: WidgetSnapshot.Entry? { entry.items.first }

    private func label(_ e: WidgetSnapshot.Entry) -> String {
        Countdown.label(for: e.date, hasTime: e.hasTime, now: entry.date)
    }

    @ViewBuilder
    private var small: some View {
        if let e = first {
            let big = Countdown.bigNumber(for: e.date, hasTime: e.hasTime, now: entry.date)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    Image(systemName: e.category.symbolName)
                    Text(e.subtitle).lineLimit(1)
                }
                .font(.caption2.bold())
                .foregroundStyle(e.category.color)
                Text(e.title).font(.headline).lineLimit(2)
                Spacer(minLength: 0)
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    if !big.unit.isEmpty { Text("あと").font(.caption) }
                    Text(big.number)
                        .font(.system(size: 40, weight: .bold, design: .rounded))
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                    Text(big.unit).font(.caption.bold())
                }
                .foregroundStyle(e.category.color)
                Text(e.hasTime ? e.date.formatted(date: .abbreviated, time: .shortened) : e.date.formatted(date: .abbreviated, time: .omitted))
                    .font(.caption2).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            emptyView
        }
    }

    @ViewBuilder
    private var medium: some View {
        if entry.items.isEmpty {
            emptyView
        } else {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(entry.items.prefix(4)) { e in
                    HStack(spacing: 8) {
                        RoundedRectangle(cornerRadius: 2).fill(e.category.color).frame(width: 4, height: 26)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(e.title).font(.subheadline.bold()).lineLimit(1)
                            Text(e.subtitle).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                        }
                        Spacer()
                        Text(label(e))
                            .font(.subheadline.bold().monospacedDigit())
                            .foregroundStyle(e.category.color)
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }

    @ViewBuilder
    private var rectangular: some View {
        if let e = first {
            VStack(alignment: .leading, spacing: 1) {
                Text(e.title).font(.headline).lineLimit(1)
                Text(label(e)).font(.title3.bold())
                Text(e.subtitle).font(.caption2).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Text("予定なし")
        }
    }

    @ViewBuilder
    private var inline: some View {
        if let e = first {
            Text("\(e.title) \(label(e))")
        } else {
            Text("予定なし")
        }
    }

    @ViewBuilder
    private var circular: some View {
        if let e = first {
            let big = Countdown.bigNumber(for: e.date, hasTime: e.hasTime, now: entry.date)
            Gauge(value: Countdown.progress(start: e.createdAt, target: e.date, now: entry.date)) {
                Image(systemName: e.category.symbolName)
            } currentValueLabel: {
                Text(big.number)
                    .minimumScaleFactor(0.4)
            }
            .gaugeStyle(.accessoryCircularCapacity)
        } else {
            Image(systemName: "hourglass")
        }
    }

    private var emptyView: some View {
        VStack(spacing: 6) {
            Image(systemName: "hourglass").font(.title2).foregroundStyle(.secondary)
            Text("アプリで作品を追加してください").font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Live Activity：当日の残り時間
struct CountdownLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CountdownActivityAttributes.self) { context in
            HStack(spacing: 12) {
                Image(systemName: context.attributes.category.symbolName)
                    .font(.title2)
                    .foregroundStyle(context.attributes.category.color)
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.title).font(.headline).lineLimit(1)
                    Text(context.state.subtitle).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Text(timerInterval: Date()...max(Date(), context.state.target), countsDown: true)
                    .font(.title2.bold().monospacedDigit())
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 110)
                    .foregroundStyle(context.attributes.category.color)
            }
            .padding()
            .activityBackgroundTint(Color(.systemBackground).opacity(0.8))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: context.attributes.category.symbolName)
                        .foregroundStyle(context.attributes.category.color)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.title).font(.headline).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: Date()...max(Date(), context.state.target), countsDown: true)
                        .monospacedDigit()
                        .frame(maxWidth: 70)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.target.formatted(date: .omitted, time: .shortened) + " " + context.state.subtitle)
                        .font(.caption).foregroundStyle(.secondary)
                }
            } compactLeading: {
                Image(systemName: context.attributes.category.symbolName)
                    .foregroundStyle(context.attributes.category.color)
            } compactTrailing: {
                Text(timerInterval: Date()...max(Date(), context.state.target), countsDown: true)
                    .monospacedDigit()
                    .frame(maxWidth: 52)
            } minimal: {
                Image(systemName: "hourglass")
                    .foregroundStyle(context.attributes.category.color)
            }
        }
    }
}
