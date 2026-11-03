import MapKit
import SwiftUI

// MARK: - 目的地の検索

struct SearchSheet: View {
    let near: CLLocationCoordinate2D?
    let onPick: (SavedPlace) -> Void

    @StateObject private var model = SearchModel()
    @StateObject private var voice = VoiceInput()
    @ObservedObject private var store = Store.shared
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            List {
                if voice.listening {
                    Section {
                        HStack {
                            Image(systemName: "waveform").symbolEffect(.variableColor.iterative)
                            Text(voice.text.isEmpty ? "どうぞ、行き先を話してください" : voice.text)
                        }
                        .font(.title3)
                    }
                }
                if let e = voice.errorText { Section { Text(e).foregroundStyle(.red) } }

                if model.query.isEmpty && model.results.isEmpty {
                    quickPlaces
                } else if !model.results.isEmpty {
                    Section("検索結果") {
                        ForEach(model.results, id: \.self) { item in
                            Button { onPick(SavedPlace.from(item)) } label: { ResultRow(item: item, near: near) }
                        }
                    }
                } else {
                    Section("候補") {
                        ForEach(model.suggestions, id: \.self) { s in
                            Button {
                                Task { if let item = await model.resolve(s) { onPick(SavedPlace.from(item)) } }
                            } label: {
                                VStack(alignment: .leading) {
                                    Text(s.title).font(.headline)
                                    if !s.subtitle.isEmpty { Text(s.subtitle).font(.caption).foregroundStyle(.secondary) }
                                }
                            }
                        }
                    }
                }
                if model.searching { HStack { ProgressView(); Text("検索中…") } }
            }
            .navigationTitle("目的地を検索")
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .top) { searchBar }
            .onAppear {
                model.setRegion(around: near)
                focused = true
            }
            .onDisappear { voice.stop(deliver: false) }
        }
    }

    private var searchBar: some View {
        HStack {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField("施設名・住所", text: $model.query)
                .focused($focused)
                .submitLabel(.search)
                .onSubmit { Task { await model.search(model.query, near: near) } }
            if !model.query.isEmpty {
                Button { model.clear() } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
            }
            Button {
                if voice.listening { voice.stop(deliver: true); return }
                focused = false
                voice.start { text in
                    model.query = text
                    Task { await model.search(text, near: near) }
                }
            } label: {
                Image(systemName: voice.listening ? "stop.circle.fill" : "mic.circle.fill")
                    .font(.system(size: 34))
                    .foregroundStyle(voice.listening ? .red : .blue)
            }
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal)
        .padding(.bottom, 6)
    }

    @ViewBuilder private var quickPlaces: some View {
        Section("登録した場所") {
            if let h = store.home { PlaceRow(place: h, icon: "house.fill") { onPick(h) } }
            if let w = store.work { PlaceRow(place: w, icon: "building.2.fill") { onPick(w) } }
            ForEach(store.favorites) { f in PlaceRow(place: f, icon: "star.fill") { onPick(f) } }
            if store.home == nil && store.work == nil && store.favorites.isEmpty {
                Text("検索した場所の画面で「自宅に設定」「お気に入り」を押すと、ここに出ます。").font(.footnote).foregroundStyle(.secondary)
            }
        }
        if !store.history.isEmpty {
            Section("最近の目的地") {
                ForEach(store.history.prefix(8)) { h in PlaceRow(place: h, icon: "clock") { onPick(h) } }
            }
        }
    }
}

struct ResultRow: View {
    let item: MKMapItem
    let near: CLLocationCoordinate2D?

    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(item.name ?? "").font(.headline)
                Text(SavedPlace.from(item).subtitle).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if let n = near {
                let c = item.placemark.coordinate
                Text(Guidance.distanceLabel(Geo.distance(Coord(n.latitude, n.longitude), Coord(c.latitude, c.longitude))))
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

struct PlaceRow: View {
    let place: SavedPlace
    let icon: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: icon).frame(width: 28).foregroundStyle(.blue)
                VStack(alignment: .leading) {
                    Text(place.name).font(.headline)
                    if !place.subtitle.isEmpty { Text(place.subtitle).font(.caption).foregroundStyle(.secondary) }
                }
            }
        }
        .foregroundStyle(.primary)
    }
}

// MARK: - 自宅・職場・お気に入り・履歴

struct PlacesSheet: View {
    @ObservedObject private var store = Store.shared
    let onPick: (SavedPlace) -> Void

    var body: some View {
        NavigationStack {
            List {
                Section("自宅・職場") {
                    if let h = store.home {
                        PlaceRow(place: h, icon: "house.fill") { onPick(h) }
                            .swipeActions { Button("削除", role: .destructive) { store.home = nil } }
                    } else {
                        Text("自宅：未登録（目的地を検索して「自宅に設定」）").foregroundStyle(.secondary)
                    }
                    if let w = store.work {
                        PlaceRow(place: w, icon: "building.2.fill") { onPick(w) }
                            .swipeActions { Button("削除", role: .destructive) { store.work = nil } }
                    } else {
                        Text("職場：未登録（目的地を検索して「職場に設定」）").foregroundStyle(.secondary)
                    }
                }
                Section("お気に入り") {
                    if store.favorites.isEmpty { Text("まだありません").foregroundStyle(.secondary) }
                    ForEach(store.favorites) { f in PlaceRow(place: f, icon: "star.fill") { onPick(f) } }
                        .onDelete { store.favorites.remove(atOffsets: $0) }
                }
                Section {
                    ForEach(store.history) { h in PlaceRow(place: h, icon: "clock") { onPick(h) } }
                        .onDelete { store.history.remove(atOffsets: $0) }
                } header: {
                    HStack {
                        Text("履歴")
                        Spacer()
                        if !store.history.isEmpty { Button("すべて消す") { store.history = [] }.font(.caption) }
                    }
                }
            }
            .navigationTitle("場所")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - 高速道路の渋滞（渋滞ナビと同じデータ）

struct HighwaySheet: View {
    @State private var items: [TrafficItem] = []
    @State private var updated: Date?
    @State private var loading = true
    @State private var failed = false

    struct RoadInfo: Identifiable {
        let road: Road
        let list: [TrafficItem]
        var id: String { road.rawValue }
    }

    private var roadsWithInfo: [RoadInfo] {
        Road.allCases.compactMap { r in
            let list = items.filter { [.closure, .incident, .jam].contains($0.kind) && r.matches(roadName: $0.roadName, routeNo: $0.routeNo) }
            return list.isEmpty ? nil : RoadInfo(road: r, list: list.sorted { TrafficParser.rank($0.kind) < TrafficParser.rank($1.kind) })
        }
    }

    var body: some View {
        NavigationStack {
            List {
                if loading { HStack { ProgressView(); Text("読み込み中…") } }
                if failed { Text("交通情報を取得できませんでした。").foregroundStyle(.red) }
                if !loading && !failed && roadsWithInfo.isEmpty {
                    Text("主な高速道路に、渋滞・事故・通行止めの情報はありません。")
                }
                ForEach(roadsWithInfo) { info in
                    Section {
                        ForEach(info.list) { it in
                            Text(TrafficText.sentence(it)).font(.callout)
                        }
                    } header: {
                        HStack {
                            Text(info.road.title).font(.headline)
                            Spacer()
                            Button {
                                speak(info.road)
                            } label: { Label("読み上げ", systemImage: "speaker.wave.2") }
                            .font(.caption)
                        }
                    }
                }
                if let u = updated {
                    Text("\(TrafficText.timeText(u))時点・日本道路交通情報センター（JARTIC）の情報").font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("高速道路の渋滞")
            .navigationBarTitleDisplayMode(.inline)
            .refreshable { await load(force: true) }
            .task { await load(force: false) }
        }
    }

    private func speak(_ road: Road) {
        let list = items.filter { road.matches(roadName: $0.roadName, routeNo: $0.routeNo) }
        Speaker.shared.say(TrafficText.speech(road: road, items: list, updated: updated), urgent: true)
    }

    private func load(force: Bool) async {
        loading = true
        defer { loading = false }
        do {
            let s = try await TrafficService.shared.all(force: force)
            items = s.items
            updated = s.updated
            failed = false
        } catch {
            failed = true
        }
    }
}

// MARK: - 駐車位置

struct ParkingSheet: View {
    @ObservedObject private var store = Store.shared
    @ObservedObject private var loc = LocationManager.shared
    let onShow: (SavedPlace) -> Void

    var body: some View {
        NavigationStack {
            List {
                if let p = store.parking {
                    Section {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(p.subtitle.isEmpty ? "駐車位置" : p.subtitle).font(.headline)
                            Text(p.date.formatted(date: .abbreviated, time: .shortened)).foregroundStyle(.secondary)
                            if let l = loc.location {
                                Text("ここから \(Guidance.distanceLabel(Geo.distance(l.coord, p.coord)))").foregroundStyle(.secondary)
                            }
                        }
                        Button { onShow(p) } label: { Label("地図で見る", systemImage: "map") }
                        Button {
                            p.mapItem.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeWalking])
                        } label: { Label("歩いて戻る（マップAppで案内）", systemImage: "figure.walk") }
                        Button("記録を消す", role: .destructive) { store.parking = nil }
                    }
                } else {
                    Text("まだ記録がありません。ナビで目的地に着くと自動で記録します。")
                }
                Section {
                    Button {
                        if let l = loc.location { store.parking = SavedPlace(name: "駐車位置", subtitle: "", coord: l.coord) }
                    } label: { Label("今いる場所を駐車位置にする", systemImage: "parkingsign.circle") }
                    .disabled(loc.location == nil)
                }
            }
            .navigationTitle("駐車位置")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - 設定

struct SettingsSheet: View {
    @ObservedObject private var store = Store.shared

    var body: some View {
        NavigationStack {
            Form {
                Section("ルート") {
                    Toggle("有料道路を使わない", isOn: $store.avoidTolls)
                    Toggle("高速道路を使わない（一般道優先）", isOn: $store.avoidHighways)
                    Toggle("早いルートが見つかったら自動で切り替える", isOn: $store.autoSwitchFaster)
                    Toggle("案内開始時にルート上の高速の渋滞を読み上げ", isOn: $store.highwayBriefing)
                }
                Section {
                    Toggle("音声案内", isOn: $store.voiceOn)
                    Toggle("一時停止を知らせる", isOn: $store.warnStop)
                    Toggle("踏切を知らせる", isOn: $store.warnCrossing)
                    Toggle("オービスを知らせる（地図データ）", isOn: $store.warnSpeedCamera)
                    Toggle("注意地点を地図に表示", isOn: $store.showHazardsOnMap)
                } header: {
                    Text("案内と注意")
                } footer: {
                    Text("一時停止・踏切・オービスの位置は OpenStreetMap のデータです。登録されていない場所も多いので、標識や周りをよく見て運転してください。")
                }
                Section("地図") {
                    Toggle("渋滞状況を地図に表示", isOn: $store.showTraffic)
                    Picker("昼／夜", selection: Binding(get: { store.nightMode }, set: { store.nightMode = $0 })) {
                        ForEach(NightMode.allCases) { Text($0.title).tag($0) }
                    }
                }
                Section {
                    Button { OrbisApp.open() } label: { Label("オービス警報を開く", systemImage: "camera.metering.spot") }
                } header: {
                    Text("オービス警報（WAC.com）と一緒に使う")
                } footer: {
                    Text("オービス警報の設定で「バックグラウンド」をONにしておくと、このアプリで案内中も裏で警報が鳴ります。案内の音声は警報と重ねて鳴らします。")
                }
                Section("データの出典") {
                    Text("地図・ルート・渋滞表示：Apple マップ")
                    Text("高速道路の渋滞・規制：日本道路交通情報センター（JARTIC）「道路交通情報Now!!」")
                    Text("一時停止・踏切・オービスの位置：© OpenStreetMap contributors（ODbL）")
                }
                .font(.footnote)
                Section {
                    Text("運転中は画面を注視せず、操作は安全な場所に停車してから行ってください。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("設定")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
