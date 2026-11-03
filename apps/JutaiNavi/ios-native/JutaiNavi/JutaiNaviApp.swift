import SwiftUI
import AppIntents
import AVFoundation

@main
struct JutaiNaviApp: App {
    init() {
        JutaiShortcuts.updateAppShortcutParameters()
    }
    var body: some Scene {
        WindowGroup { ContentView() }
    }
}

// MARK: - 色

extension Color {
    static let signGreen = Color(red: 0.0, green: 0.42, blue: 0.27)
    static let jamOrange = Color(red: 0.93, green: 0.45, blue: 0.0)
    static let alertRed = Color(red: 0.84, green: 0.13, blue: 0.13)
}

// MARK: - 読み上げ

@MainActor
final class Speaker: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    @Published var speaking = false
    private let synth = AVSpeechSynthesizer()
    override init() { super.init(); synth.delegate = self }

    func toggle(_ text: String) {
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate); return }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: "ja-JP")
        u.rate = 0.52
        synth.speak(u)
        speaking = true
    }
    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) { Task { @MainActor in self.done() } }
    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel u: AVSpeechUtterance) { Task { @MainActor in self.done() } }
    private func done() {
        speaking = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

// MARK: - 画面の状態

@MainActor
final class TrafficModel: ObservableObject {
    @Published var road: Road
    @Published var items: [TrafficItem] = []
    @Published var updated: Date?
    @Published var loading = false
    @Published var error: String?
    @Published var favorites: [Road] { didSet { Favorites.save(favorites) } }
    /// 区間を選んでいるとき（nil なら路線全体）
    @Published var route: SavedRoute?
    @Published var routes: [SavedRoute] = RouteStore.load()
    @Published var eta: Int?

    init() {
        let f = Favorites.load()
        favorites = f
        road = f.first ?? .gaikan
    }

    func load(force: Bool = false) async {
        loading = true
        defer { loading = false }
        do {
            if let r = route {
                let s = try await TrafficService.shared.route(r, force: force)
                items = s.items
                updated = s.updated
                eta = await RouteMapKit.eta(r.waypoints)
            } else {
                let s = try await TrafficService.shared.road(road, force: force)
                items = s.items
                updated = s.updated
                eta = nil
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    var speech: String {
        if let r = route { return TrafficText.routeSpeech(route: r, items: items, updated: updated, etaMinutes: eta) }
        return TrafficText.speech(road: road, items: items, updated: updated)
    }

    func selectRoad(_ r: Road) { route = nil; road = r; Task { await load() } }
    func selectRoute(_ r: SavedRoute) { route = r; Task { await load() } }

    func saveRoute(_ r: SavedRoute) {
        if let i = routes.firstIndex(where: { $0.id == r.id }) { routes[i] = r } else { routes.append(r) }
        persistRoutes()
    }
    func deleteRoutes(at offsets: IndexSet) {
        let removed = offsets.map { routes[$0].id }
        routes.remove(atOffsets: offsets)
        if let cur = route, removed.contains(cur.id) { route = nil; Task { await load() } }
        persistRoutes()
    }
    func moveRoutes(from: IndexSet, to: Int) { routes.move(fromOffsets: from, toOffset: to); persistRoutes() }
    private func persistRoutes() {
        RouteStore.save(routes)
        JutaiShortcuts.updateAppShortcutParameters()
    }

    func items(_ kinds: [TrafficKind]) -> [TrafficItem] { items.filter { kinds.contains($0.kind) } }
}

// MARK: - メイン画面

struct ContentView: View {
    @StateObject private var model = TrafficModel()
    @StateObject private var speaker = Speaker()
    @State private var showSettings = false
    @State private var showAllRoads = false
    @State private var showNewRoute = false
    private let timer = Timer.publish(every: 300, on: .main, in: .common).autoconnect()

    var body: some View {
        NavigationStack {
            List {
                Section { roadChips.listRowInsets(EdgeInsets()).listRowBackground(Color.clear) }

                Section {
                    summaryCard
                }

                if let e = model.error {
                    Section { Label(e, systemImage: "wifi.exclamationmark").foregroundStyle(.secondary) }
                }

                if model.route != nil {
                    routeList
                } else {
                group("事故・通行止め", icon: "exclamationmark.triangle.fill", color: .alertRed, kinds: [.closure, .incident])
                group("渋滞", icon: "car.2.fill", color: .jamOrange, kinds: [.jam])
                group("出入口の閉鎖", icon: "xmark.octagon.fill", color: .alertRed, kinds: [.icClosed])
                group("工事などの規制", icon: "cone.fill", color: .yellow, kinds: [.regulation])
                group("SA・PAの混雑", icon: "fork.knife", color: .blue, kinds: [.sapa])
                }

                Section {
                    Text("情報：日本道路交通情報センター（JARTIC）「道路交通情報Now!!」より。5分ごと更新。通過時間は渋滞を平均時速20kmで走った場合の目安です。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("渋滞ナビ")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { showSettings = true } label: { Image(systemName: "gearshape") }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if model.loading { ProgressView() } else {
                        Button { Task { await model.load(force: true) } } label: { Image(systemName: "arrow.clockwise") }
                    }
                }
            }
            .refreshable { await model.load(force: true) }
            .task { await model.load() }
            .onReceive(timer) { _ in Task { await model.load(force: true) } }
            .sheet(isPresented: $showSettings) { SettingsView(model: model) }
            .sheet(isPresented: $showNewRoute) {
                RouteEditorView(original: nil) { r in model.saveRoute(r); model.selectRoute(r) }
            }
            .sheet(isPresented: $showAllRoads) {
                RoadPicker(selected: model.road) { model.selectRoad($0) }.presentationDetents([.medium, .large])
            }
        }
        .tint(.signGreen)
    }

    private var roadChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(model.routes) { r in
                    let on = model.route?.id == r.id
                    Button { model.selectRoute(r) } label: {
                        Label(r.name, systemImage: "point.topleft.down.to.point.bottomright.curvepath").font(.subheadline.bold())
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(on ? Color.jamOrange : Color(.secondarySystemBackground), in: Capsule())
                            .foregroundStyle(on ? .white : .primary)
                    }.buttonStyle(.plain)
                }
                ForEach(chipRoads, id: \.self) { r in
                    let on = model.route == nil && model.road == r
                    Button { model.selectRoad(r) } label: {
                        Text(r.title).font(.subheadline.bold())
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(on ? Color.signGreen : Color(.secondarySystemBackground), in: Capsule())
                            .foregroundStyle(on ? .white : .primary)
                    }.buttonStyle(.plain)
                }
                Button { showNewRoute = true } label: {
                    Label("区間を登録", systemImage: "plus").font(.subheadline)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(Color(.secondarySystemBackground), in: Capsule())
                }.buttonStyle(.plain)
                Button { showAllRoads = true } label: {
                    Label("ほかの道路", systemImage: "list.bullet").font(.subheadline)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(Color(.secondarySystemBackground), in: Capsule())
                }.buttonStyle(.plain)
            }.padding(.horizontal, 16).padding(.vertical, 4)
        }
    }

    private var chipRoads: [Road] {
        var list = model.favorites
        if !list.contains(model.road) { list.insert(model.road, at: 0) }
        return list
    }

    private var summaryCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.route?.name ?? model.road.title).font(.title2.bold())
                    if let r = model.route { Text(r.summary).font(.caption).foregroundStyle(.secondary) }
                }
                Spacer()
                if let u = model.updated {
                    Text("\(TrafficText.timeText(u)) 時点").font(.caption).foregroundStyle(.secondary)
                }
            }
            let jams = model.items([.jam]), alerts = model.items([.closure, .incident, .icClosed]), regs = model.items([.regulation])
            HStack(spacing: 10) {
                stat("渋滞", "\(jams.count)", .jamOrange)
                stat("事故・通行止め", "\(alerts.count)", .alertRed)
                stat("規制", "\(regs.count)", .yellow)
            }
            if let r = model.route {
                Text("区間 約\(Int(r.lengthKm.rounded()))km\(model.eta.map { "・到着予想 約\(TrafficText.durationText($0))" } ?? "")")
                    .font(.footnote.bold())
            }
            if let longest = jams.max(by: { ($0.lengthKm ?? 0) < ($1.lengthKm ?? 0) }), let km = longest.lengthKm {
                Text("最長 \(TrafficText.normalize(longest.place)) \(String(format: km == km.rounded() ? "%.0f" : "%.1f", km))km（抜けるまで約\(longest.passMinutes ?? 0)分）")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Button { speaker.toggle(model.speech) } label: {
                Label(speaker.speaking ? "読み上げを止める" : "読み上げる", systemImage: speaker.speaking ? "stop.fill" : "speaker.wave.2.fill")
                    .frame(maxWidth: .infinity).padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
        }.padding(.vertical, 4)
    }

    private func stat(_ title: String, _ value: String, _ color: Color) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.title.bold()).foregroundStyle(value == "0" ? .secondary : color)
            Text(title).font(.caption2).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 8)
        .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10))
    }

    /// 区間：走る順にすべて並べる
    @ViewBuilder
    private var routeList: some View {
        let list = model.items
        if list.isEmpty {
            Section { Label("この区間に、渋滞や事故の情報はありません", systemImage: "checkmark.circle").foregroundStyle(.secondary) }
        } else {
            Section {
                ForEach(list) { it in
                    let style = Self.style(it.kind)
                    ItemRow(item: it, color: style.1, icon: style.0, showRoad: true)
                }
            } header: { Text("走る順（\(list.count)件）") }
        }
    }

    static func style(_ k: TrafficKind) -> (String, Color) {
        switch k {
        case .closure, .incident: return ("exclamationmark.triangle.fill", .alertRed)
        case .jam: return ("car.2.fill", .jamOrange)
        case .icClosed: return ("xmark.octagon.fill", .alertRed)
        case .regulation: return ("cone.fill", .yellow)
        case .sapa: return ("fork.knife", .blue)
        }
    }

    @ViewBuilder
    private func group(_ title: String, icon: String, color: Color, kinds: [TrafficKind]) -> some View {
        let list = model.items(kinds)
        if !list.isEmpty {
            Section {
                ForEach(list) { ItemRow(item: $0, color: color, icon: icon) }
            } header: { Text("\(title)（\(list.count)）") }
        }
    }
}

struct ItemRow: View {
    let item: TrafficItem
    let color: Color
    let icon: String
    var showRoad = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon).foregroundStyle(color).frame(width: 22).padding(.top, 2)
            VStack(alignment: .leading, spacing: 4) {
                if showRoad { Text(TrafficText.normalize(item.roadName)).font(.caption).foregroundStyle(.secondary) }
                HStack(spacing: 6) {
                    if !item.direction.isEmpty {
                        Text(TrafficText.direction(item.direction)).font(.caption.bold())
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Color.signGreen.opacity(0.15), in: RoundedRectangle(cornerRadius: 4))
                    }
                    Text(TrafficText.normalize(item.place)).font(.body.weight(.semibold))
                }
                detail
            }
        }.padding(.vertical, 2)
    }

    @ViewBuilder private var detail: some View {
        switch item.kind {
        case .jam:
            HStack(spacing: 12) {
                Label("\(item.lengthKm.map { String(format: $0 == $0.rounded() ? "%.0f" : "%.1f", $0) } ?? "?") km", systemImage: "ruler")
                Label("抜けるまで約\(item.passMinutes ?? 0)分", systemImage: "clock")
            }.font(.subheadline).foregroundStyle(Color.jamOrange)
        case .closure:
            Text("通行止め\(item.cause.isEmpty ? "" : "（\(item.cause)）")").font(.subheadline).foregroundStyle(Color.alertRed)
        case .incident, .regulation:
            VStack(alignment: .leading, spacing: 2) {
                if !item.cause.isEmpty { Text(item.cause).font(.subheadline.bold()) }
                Text(TrafficText.laneDescription(item.regulation)).font(.subheadline).foregroundStyle(.secondary)
                if !item.regulation.isEmpty, item.regulation != "規制なし" {
                    LaneView(regulation: item.regulation)
                }
            }
        case .icClosed:
            Text("閉鎖中").font(.subheadline).foregroundStyle(Color.alertRed)
        case .sapa:
            Text(item.regulation).font(.subheadline).foregroundStyle(.blue)
        }
    }
}

/// どの車線が規制されているかの図（左が路肩側）
struct LaneView: View {
    let regulation: String

    var body: some View {
        if let lanes = closedLanes {
            HStack(spacing: 3) {
                ForEach(0..<lanes.count, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 3)
                        .fill(lanes.closed.contains(i) ? Color.alertRed.opacity(0.85) : Color.gray.opacity(0.25))
                        .overlay(Image(systemName: lanes.closed.contains(i) ? "xmark" : "arrow.up").font(.caption2.bold())
                            .foregroundStyle(lanes.closed.contains(i) ? .white : .secondary))
                        .frame(width: 34, height: 26)
                }
                Text(lanes.note).font(.caption2).foregroundStyle(.secondary).padding(.leading, 4)
            }.padding(.top, 2)
        }
    }

    /// 2〜3車線を想定した簡易図。左＝第1走行車線、右＝追越車線
    private var closedLanes: (count: Int, closed: Set<Int>, note: String)? {
        let r = TrafficText.normalize(regulation)
        if r.contains("追越車線") { return (3, [2], "右側が規制") }
        if r.contains("走行") {
            let n = r.compactMap { $0.wholeNumberValue }.first ?? 1
            return (max(3, n + 1), [n - 1], "左から\(n)番目が規制")
        }
        if r == "通行止" || r == "全車線規制" { return (3, [0, 1, 2], "全車線") }
        return nil
    }
}

// MARK: - 道路の一覧

struct RoadPicker: View {
    let selected: Road
    let onPick: (Road) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(Road.allCases, id: \.self) { r in
                Button {
                    onPick(r); dismiss()
                } label: {
                    HStack { Text(r.title).foregroundStyle(.primary); Spacer(); if r == selected { Image(systemName: "checkmark") } }
                }
            }
            .navigationTitle("高速道路を選ぶ").navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - 設定

struct SettingsView: View {
    @ObservedObject var model: TrafficModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("アプリを開かずに、声だけで聞けます").font(.headline)
                        siriLine("Hey Siri、渋滞ナビで外環の渋滞情報を教えて")
                        siriLine("Hey Siri、渋滞ナビで首都高の渋滞")
                        siriLine("Hey Siri、渋滞ナビで通勤の渋滞（登録した区間の名前）")
                        siriLine("Hey Siri、渋滞ナビの渋滞情報")
                        Text("最後の言い方は、区間を登録していれば一番上の区間を、なければ「いつもの道路」を読み上げます。ロック画面やCarPlayからでも使えます。\n\n画面を見ているときも読み上げてほしい場合は、iPhoneの「設定」→「Apple Intelligence と Siri」（または「Siri」）→「Siriの応答」で「音声での応答を優先」を選んでください。")
                            .font(.footnote).foregroundStyle(.secondary)
                    }.padding(.vertical, 4)
                    ShortcutsLink()
                } header: { Text("Siriで聞く") }

                Section {
                    ForEach(model.routes) { r in
                        NavigationLink {
                            RouteEditorView(original: r) { model.saveRoute($0) }
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(r.name).font(.body.bold())
                                Text(r.summary).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .onDelete { model.deleteRoutes(at: $0) }
                    .onMove { model.moveRoutes(from: $0, to: $1) }
                    NavigationLink {
                        RouteEditorView(original: nil) { model.saveRoute($0) }
                    } label: { Label("区間を登録", systemImage: "plus") }
                } header: { Text("登録した区間（例：佐倉IC → 和光北IC）") } footer: {
                    Text("区間の上で、進む向きが同じ情報だけを走る順に読み上げます。左にスワイプで削除できます。")
                }

                Section {
                    ForEach(Road.allCases, id: \.self) { r in
                        Button {
                            if let i = model.favorites.firstIndex(of: r) { if model.favorites.count > 1 { model.favorites.remove(at: i) } }
                            else { model.favorites.append(r) }
                        } label: {
                            HStack {
                                Text(r.title).foregroundStyle(.primary)
                                Spacer()
                                if let i = model.favorites.firstIndex(of: r) {
                                    Text("\(i + 1)").font(.caption.bold()).foregroundStyle(.white)
                                        .frame(width: 22, height: 22).background(Color.signGreen, in: Circle())
                                }
                            }
                        }
                    }
                } header: { Text("いつもの道路（上の画面に並び、Siriで最初の3つを読み上げ）") }

                Section {
                    Text("交通情報は日本道路交通情報センター（JARTIC）「道路交通情報Now!!」の公開データを利用しています。サイト側の仕様変更で表示できなくなることがあります。運転中は画面を操作せず、Siriでご利用ください。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("設定").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("閉じる") { dismiss() } } }
        }
    }

    private func siriLine(_ s: String) -> some View {
        Label(s, systemImage: "mic.fill").font(.subheadline)
    }
}
