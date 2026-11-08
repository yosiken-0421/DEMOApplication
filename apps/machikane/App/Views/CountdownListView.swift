import SwiftUI
import SwiftData
import MachikaneCore

struct CountdownListView: View {
    @Environment(AppModel.self) private var model
    @Query(sort: \TrackedItem.createdAt) private var items: [TrackedItem]
    @Query(sort: \GameTimer.sortOrder) private var timers: [GameTimer]
    @State private var showAdd = false
    @State private var filter: ItemCategory?

    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 60)) { ctx in
                content(now: ctx.date)
            }
            .navigationTitle("カウントダウン")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAdd = true } label: { Image(systemName: "plus.circle.fill").font(.title3) }
                        .accessibilityLabel("追加")
                }
            }
            .sheet(isPresented: $showAdd) { AddMenuView() }
            .refreshable { await model.refresh(force: true) }
            .navigationDestination(for: UUID.self) { id in
                if let item = items.first(where: { $0.id == id }) { ItemDetailView(item: item) }
            }
        }
    }

    @ViewBuilder
    private func content(now: Date) -> some View {
        let all = EntryBuilder.sorted(EntryBuilder.entries(items: items, timers: timers, now: now))
            .filter { filter == nil || $0.category == filter }
        let grouped = Dictionary(grouping: all) { $0.section(now: now) }
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if model.notificationStatus == .denied {
                    PermissionBanner(title: "通知がオフになっています",
                                     reason: "発売日や放送時間を知らせるには、設定アプリで「まちかね」の通知を許可してください。") {
                        model.openSystemSettings()
                    }
                }
                Picker("絞り込み", selection: $filter) {
                    Text("すべて").tag(ItemCategory?.none)
                    ForEach(ItemCategory.allCases) { c in Text(c.displayName).tag(Optional(c)) }
                }
                .pickerStyle(.segmented)

                if all.isEmpty {
                    EmptyStateView(symbol: "hourglass", message: "待っている作品を追加すると、ここに近い順で並びます") { showAdd = true }
                } else {
                    ForEach(CountdownSection.allCases, id: \.self) { sec in
                        if let list = grouped[sec], !list.isEmpty, sec != .past {
                            Text(sec.title)
                                .font(.title3.bold())
                                .padding(.top, 4)
                            ForEach(list) { e in
                                link(for: e, now: now)
                            }
                        }
                    }
                }
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
    }

    @ViewBuilder
    private func link(for e: CountdownEntry, now: Date) -> some View {
        if let item = e.item {
            NavigationLink(value: item.id) { EntryCard(entry: e, now: now) }
                .buttonStyle(.plain)
        } else {
            EntryCard(entry: e, now: now)
        }
    }
}
