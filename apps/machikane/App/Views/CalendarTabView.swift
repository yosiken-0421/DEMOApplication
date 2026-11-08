import SwiftUI
import SwiftData
import MachikaneCore

/// 月カレンダー。日付の下にカテゴリ色のドット。
struct CalendarTabView: View {
    @Query(sort: \TrackedItem.createdAt) private var items: [TrackedItem]
    @Query(sort: \GameTimer.sortOrder) private var timers: [GameTimer]
    @State private var month = Calendar.current.date(from: Calendar.current.dateComponents([.year, .month], from: Date()))!
    @State private var selected = Calendar.current.startOfDay(for: Date())

    private let cal = Calendar.current
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)

    var body: some View {
        NavigationStack {
            let entries = EntryBuilder.entries(items: items, timers: timers)
            let byDay = Dictionary(grouping: entries.filter { $0.date != nil }) { cal.startOfDay(for: $0.date!) }
            ScrollView {
                VStack(spacing: 12) {
                    header
                    LazyVGrid(columns: columns, spacing: 4) {
                        ForEach(0..<7, id: \.self) { i in
                            Text(WeekdayText.names[i])
                                .font(.caption.bold())
                                .foregroundStyle(i == 0 ? Color.red : (i == 6 ? Color.blue : Color.secondary))
                        }
                        ForEach(Array(days().enumerated()), id: \.offset) { _, day in
                            if let day {
                                dayCell(day, entries: byDay[day] ?? [])
                            } else {
                                Color.clear.frame(height: 48)
                            }
                        }
                    }
                    Divider()
                    let list = EntryBuilder.sorted(byDay[selected] ?? [])
                    Text(selected.mkDateText).font(.headline).frame(maxWidth: .infinity, alignment: .leading)
                    if list.isEmpty {
                        Text("この日の予定はありません").font(.subheadline).foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ForEach(list) { e in
                        if let item = e.item {
                            NavigationLink(value: item.id) { EntryCard(entry: e) }.buttonStyle(.plain)
                        } else {
                            EntryCard(entry: e)
                        }
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("カレンダー")
            .navigationDestination(for: UUID.self) { id in
                if let item = items.first(where: { $0.id == id }) { ItemDetailView(item: item) }
            }
        }
    }

    private var header: some View {
        HStack {
            Button { shift(-1) } label: { Image(systemName: "chevron.left") }
                .accessibilityLabel("前の月")
            Spacer()
            Text(month.formatted(.dateTime.year().month(.wide).locale(Locale(identifier: "ja_JP"))))
                .font(.title3.bold())
            Spacer()
            Button { shift(1) } label: { Image(systemName: "chevron.right") }
                .accessibilityLabel("次の月")
        }
        .padding(.horizontal, 4)
    }

    private func dayCell(_ day: Date, entries: [CountdownEntry]) -> some View {
        let isSel = cal.isDate(day, inSameDayAs: selected)
        let isToday = cal.isDateInToday(day)
        let cats = Array(Set(entries.map(\.category))).sorted { $0.rawValue < $1.rawValue }
        return Button {
            selected = day
            Haptics.tap()
        } label: {
            VStack(spacing: 3) {
                Text("\(cal.component(.day, from: day))")
                    .font(.callout.weight(isToday ? .bold : .regular))
                    .foregroundStyle(isSel ? Color.white : (isToday ? Color.accentColor : Color.primary))
                    .frame(width: 30, height: 30)
                    .background(isSel ? Color.accentColor : .clear, in: Circle())
                HStack(spacing: 3) {
                    ForEach(cats) { c in Circle().fill(c.color).frame(width: 6, height: 6) }
                }
                .frame(height: 6)
            }
            .frame(maxWidth: .infinity, minHeight: 48)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(day.mkDateText) 予定\(entries.count)件")
    }

    private func days() -> [Date?] {
        guard let range = cal.range(of: .day, in: .month, for: month) else { return [] }
        let firstWeekday = cal.component(.weekday, from: month) // 1 = 日曜
        var out: [Date?] = Array(repeating: nil, count: firstWeekday - 1)
        for d in range {
            out.append(cal.date(byAdding: .day, value: d - 1, to: month))
        }
        return out
    }

    private func shift(_ n: Int) {
        if let m = cal.date(byAdding: .month, value: n, to: month) { month = m }
    }
}
