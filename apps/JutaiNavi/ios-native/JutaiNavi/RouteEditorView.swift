import SwiftUI
import MapKit

/// 区間の登録（出発IC・到着IC・経由地・Siriで呼ぶ名前）
struct RouteEditorView: View {
    let original: SavedRoute?
    let onSave: (SavedRoute) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var from: RouteMapKit.Place?
    @State private var to: RouteMapKit.Place?
    @State private var vias: [RouteMapKit.Place] = []
    @State private var built: RouteMapKit.Built?
    @State private var building = false
    @State private var error: String?
    @State private var picking: Slot?

    enum Slot: Identifiable, Hashable {
        case from, to, via(Int), newVia
        var id: String { "\(self)" }
        var title: String {
            switch self { case .from: return "出発（乗る IC）"; case .to: return "到着（降りる IC）"; case .via, .newVia: return "経由する IC・JCT" }
        }
    }

    init(original: SavedRoute?, onSave: @escaping (SavedRoute) -> Void) {
        self.original = original
        self.onSave = onSave
        if let o = original, o.waypoints.count >= 2 {
            let pts = o.waypoints
            let names = [o.fromName] + o.viaNames + [o.toName]
            let places = zip(names, pts).map { RouteMapKit.Place(name: $0.0, address: "", point: $0.1) }
            _name = State(initialValue: o.name)
            _from = State(initialValue: places.first)
            _to = State(initialValue: places.last)
            _vias = State(initialValue: Array(places.dropFirst().dropLast()))
            _built = State(initialValue: RouteMapKit.Built(path: o.path, lengthKm: o.lengthKm, minutes: o.baseMinutes ?? 0, roads: []))
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    placeRow(.from, from)
                    ForEach(Array(vias.enumerated()), id: \.offset) { i, v in
                        placeRow(.via(i), v)
                    }
                    .onDelete { vias.remove(atOffsets: $0); built = nil }
                    if vias.count < 3 {
                        Button { picking = .newVia } label: { Label("経由地を追加（任意）", systemImage: "plus.circle") }
                    }
                    placeRow(.to, to)
                } header: { Text("区間") } footer: {
                    Text("例：出発「佐倉IC」、到着「和光北IC」。通りたい道（外環など）と違うルートになったら、経由地に「高谷JCT」などを入れてください。")
                }

                Section {
                    TextField("例：通勤", text: $name)
                } header: { Text("Siriで呼ぶ名前") } footer: {
                    Text("「Hey Siri、渋滞ナビで\(name.isEmpty ? defaultName : name)の渋滞」で読み上げます。短い名前が聞き取られやすいです。")
                }

                Section {
                    Button {
                        Task { await build() }
                    } label: {
                        HStack { Label("ルートを調べる", systemImage: "map"); if building { Spacer(); ProgressView() } }
                    }
                    .disabled(from == nil || to == nil || building)
                    if let e = error { Text(e).foregroundStyle(Color.alertRed).font(.footnote) }
                    if let b = built {
                        RouteMapPreview(path: b.path, from: from?.point, to: to?.point)
                            .frame(height: 240).listRowInsets(EdgeInsets())
                        Text("約\(Int(b.lengthKm.rounded()))km\(b.minutes > 0 ? "・ふだん約\(TrafficText.durationText(b.minutes))" : "")").font(.subheadline.bold())
                        if !b.roads.isEmpty {
                            Text(b.roads.prefix(6).joined(separator: "\n")).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                } header: { Text("ルートの確認") }
            }
            .navigationTitle(original == nil ? "区間を登録" : "区間を編集").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if original == nil { ToolbarItem(placement: .topBarLeading) { Button("キャンセル") { dismiss() } } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("保存") { Task { await save() } }.bold().disabled(from == nil || to == nil || building)
                }
            }
            .sheet(item: $picking) { slot in
                PlaceSearchView(title: slot.title) { place in
                    switch slot {
                    case .from: from = place
                    case .to: to = place
                    case .via(let i): if vias.indices.contains(i) { vias[i] = place }
                    case .newVia: vias.append(place)
                    }
                    built = nil
                }
            }
        }
    }

    private var defaultName: String {
        guard let f = from, let t = to else { return "通勤" }
        return "\(short(f.name))から\(short(t.name))"
    }

    private func short(_ s: String) -> String {
        TrafficText.normalize(s).replacingOccurrences(of: "インターチェンジ", with: "").replacingOccurrences(of: "IC", with: "")
            .replacingOccurrences(of: "JCT", with: "").trimmingCharacters(in: .whitespaces)
    }

    private func placeRow(_ slot: Slot, _ place: RouteMapKit.Place?) -> some View {
        Button { picking = slot } label: {
            HStack {
                Text(slot == .from ? "出発" : slot == .to ? "到着" : "経由").foregroundStyle(.secondary).frame(width: 40, alignment: .leading)
                Text(place.map { TrafficText.normalize($0.name) } ?? "タップして探す").foregroundStyle(place == nil ? .secondary : .primary)
                Spacer()
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            }
        }
    }

    private var points: [GeoPoint] { ([from] + vias.map { Optional($0) } + [to]).compactMap { $0?.point } }

    private func build() async {
        building = true; error = nil
        defer { building = false }
        do { built = try await RouteMapKit.build(points) } catch { self.error = error.localizedDescription; built = nil }
    }

    private func save() async {
        if built == nil { await build() }
        guard let b = built, let f = from, let t = to else { return }
        var r = original ?? SavedRoute(name: "", fromName: "", toName: "", waypoints: [], path: [], lengthKm: 0)
        r.name = name.trimmingCharacters(in: .whitespaces).isEmpty ? defaultName : name.trimmingCharacters(in: .whitespaces)
        r.fromName = f.name; r.toName = t.name; r.viaNames = vias.map(\.name)
        r.waypoints = points; r.path = b.path; r.lengthKm = b.lengthKm
        r.baseMinutes = b.minutes > 0 ? b.minutes : r.baseMinutes
        onSave(r)
        dismiss()
    }
}

/// IC の検索
struct PlaceSearchView: View {
    let title: String
    let onPick: (RouteMapKit.Place) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var results: [RouteMapKit.Place] = []
    @State private var searching = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("例：佐倉IC、和光北IC、高谷JCT", text: $text)
                            .submitLabel(.search).onSubmit { Task { await search() } }
                        Button("検索") { Task { await search() } }.disabled(text.isEmpty)
                    }
                } footer: { Text("IC名のあとに「IC」をつけると見つかりやすいです。") }
                if searching { ProgressView() }
                ForEach(results) { p in
                    Button { onPick(p); dismiss() } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(p.name).foregroundStyle(.primary)
                            Text(p.address).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                if !searching && results.isEmpty && !text.isEmpty {
                    Text("見つからないときは「○○インターチェンジ」でも試してください").font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("閉じる") { dismiss() } } }
        }
    }

    private func search() async {
        searching = true
        results = await RouteMapKit.search(text)
        searching = false
    }
}

/// 地図でルートを確認
struct RouteMapPreview: View {
    let path: [GeoPoint]
    let from: GeoPoint?
    let to: GeoPoint?

    var body: some View {
        Map(initialPosition: .rect(rect)) {
            MapPolyline(coordinates: path.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon) })
                .stroke(Color.signGreen, lineWidth: 5)
            if let f = from { Marker("出発", coordinate: CLLocationCoordinate2D(latitude: f.lat, longitude: f.lon)).tint(.green) }
            if let t = to { Marker("到着", coordinate: CLLocationCoordinate2D(latitude: t.lat, longitude: t.lon)).tint(.red) }
        }
        .id(path.count)
    }

    private var rect: MKMapRect {
        let pts = path.map { MKMapPoint(CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon)) }
        guard let first = pts.first else { return .world }
        var r = MKMapRect(origin: first, size: MKMapSize(width: 0, height: 0))
        for p in pts { r = r.union(MKMapRect(origin: p, size: MKMapSize(width: 0, height: 0))) }
        return r.insetBy(dx: -r.size.width * 0.15 - 2000, dy: -r.size.height * 0.15 - 2000)
    }
}
