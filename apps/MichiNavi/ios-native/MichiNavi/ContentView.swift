import MapKit
import SwiftUI

enum Sheet: Identifiable {
    case search(waypoint: Bool), places, highway, settings, parking
    var id: String {
        switch self {
        case .search(let w): return "search\(w)"
        case .places: return "places"
        case .highway: return "highway"
        case .settings: return "settings"
        case .parking: return "parking"
        }
    }
}

struct ContentView: View {
    @ObservedObject var engine = NavEngine.shared
    @ObservedObject var loc = LocationManager.shared
    @ObservedObject var store = Store.shared
    @ObservedObject var router = AppRouter.shared

    @State private var position: MapCameraPosition = .userLocation(fallback: .automatic)
    @State private var sheet: Sheet?
    @State private var preview: SavedPlace?
    @State private var recenterTask: Task<Void, Never>?
    @State private var bannerTask: Task<Void, Never>?

    var body: some View {
        ZStack {
            map
            overlay
        }
        .preferredColorScheme(store.colorScheme)
        .sheet(item: $sheet) { s in sheetView(s) }
        .onAppear { loc.start() }
        .onChange(of: engine.phase) { _, p in
            if p == .navigating { follow() }
            if p == .idle { preview = nil }
        }
        .onChange(of: engine.plans.count) { _, _ in showPlanOnMap() }
        .onChange(of: engine.selectedPlan) { _, _ in showPlanOnMap() }
        .onChange(of: engine.banner) { _, b in
            guard b != nil else { return }
            bannerTask?.cancel()
            bannerTask = Task { try? await Task.sleep(nanoseconds: 6_000_000_000); if !Task.isCancelled { engine.banner = nil } }
        }
        .onChange(of: router.pending) { _, a in
            guard let a else { return }
            router.pending = nil
            handle(a)
        }
        .onAppear { if let a = router.pending { router.pending = nil; handle(a) } }
    }

    // MARK: 地図

    private var map: some View {
        Map(position: $position) {
            UserAnnotation()

            if engine.phase == .planning {
                ForEach(planOrder, id: \.self) { i in
                    ForEach(engine.plans[i].polylines, id: \.self) { pl in
                        MapPolyline(pl)
                            .stroke(i == engine.selectedPlan ? Color.blue : Color.gray.opacity(0.7),
                                    lineWidth: i == engine.selectedPlan ? 8 : 6)
                    }
                }
            }
            if engine.phase == .navigating {
                MapPolyline(coordinates: engine.activeLine)
                    .stroke(Color.blue, lineWidth: 9)
            }
            if let d = engine.destination {
                Marker(d.name, systemImage: "flag.checkered", coordinate: d.clCoordinate).tint(.red)
            }
            ForEach(engine.waypoints) { w in
                Marker(w.name, systemImage: "mappin", coordinate: w.clCoordinate).tint(.orange)
            }
            if let p = preview, engine.phase == .idle {
                Marker(p.name, coordinate: p.clCoordinate).tint(.red)
            }
            if let p = store.parking {
                Marker("駐車位置", systemImage: "parkingsign", coordinate: p.clCoordinate).tint(.indigo)
            }
            if store.showHazardsOnMap {
                ForEach(engine.hazards) { h in
                    Annotation(h.kind.title, coordinate: h.coord.cl) { HazardIcon(kind: h.kind) }
                }
            }
        }
        .mapStyle(.standard(elevation: .realistic, pointsOfInterest: .all, showsTraffic: store.showTraffic))
        .mapControls {
            MapCompass()
            MapScaleView()
        }
        .onMapCameraChange(frequency: .onEnd) { _ in
            // ナビ中に地図を指で動かしたら、8秒後に自車位置へ戻す
            guard engine.phase == .navigating, position.positionedByUser else { return }
            recenterTask?.cancel()
            recenterTask = Task {
                try? await Task.sleep(nanoseconds: 8_000_000_000)
                if !Task.isCancelled { follow() }
            }
        }
    }

    /// 選んでいない候補を先に描いて、選んだルートを上に
    private var planOrder: [Int] {
        let idx = Array(engine.plans.indices)
        return idx.filter { $0 != engine.selectedPlan } + idx.filter { $0 == engine.selectedPlan }
    }

    // MARK: 重ねる画面

    @ViewBuilder private var overlay: some View {
        switch engine.phase {
        case .idle:
            IdleOverlay(preview: $preview, sheet: $sheet, onRecenter: recenter, onShow: show)
        case .planning:
            PlanningOverlay(sheet: $sheet)
        case .navigating:
            NavigatingOverlay(sheet: $sheet, onRecenter: follow)
        }
    }

    @ViewBuilder private func sheetView(_ s: Sheet) -> some View {
        switch s {
        case .search(let waypoint):
            SearchSheet(near: loc.location?.coordinate) { place in
                sheet = nil
                if waypoint { engine.addWaypoint(place) } else { show(place) }
            }
        case .places:
            PlacesSheet { place in sheet = nil; engine.plan(to: place) }
        case .highway:
            HighwaySheet()
        case .settings:
            SettingsSheet()
        case .parking:
            ParkingSheet { p in sheet = nil; show(p) }
        }
    }

    // MARK: 操作

    private func follow() {
        recenterTask?.cancel()
        withAnimation { position = .userLocation(followsHeading: true, fallback: .automatic) }
    }

    private func recenter() {
        withAnimation { position = .userLocation(fallback: .automatic) }
    }

    private func show(_ p: SavedPlace) {
        preview = p
        withAnimation { position = .region(MKCoordinateRegion(center: p.clCoordinate, latitudinalMeters: 1500, longitudinalMeters: 1500)) }
    }

    private func showPlanOnMap() {
        guard engine.phase == .planning, engine.plans.indices.contains(engine.selectedPlan) else { return }
        var rect = MKMapRect.null
        for pl in engine.plans[engine.selectedPlan].polylines { rect = rect.union(pl.boundingMapRect) }
        guard !rect.isNull else { return }
        let pad = max(rect.size.width, rect.size.height) * 0.25
        withAnimation { position = .rect(rect.insetBy(dx: -pad, dy: -pad * 1.6)) }
    }

    private func handle(_ a: AppRouter.Action) {
        switch a {
        case .home:
            if let h = store.home { engine.plan(to: h) } else { sheet = .places }
        case .work:
            if let w = store.work { engine.plan(to: w) } else { sheet = .places }
        case .parking:
            sheet = .parking
        case .highway:
            sheet = .highway
        case .search(let text):
            Task {
                let m = SearchModel()
                await m.search(text, near: loc.location?.coordinate)
                if let first = m.results.first { show(SavedPlace.from(first)) } else { sheet = .search(waypoint: false) }
            }
        }
    }
}

struct HazardIcon: View {
    let kind: HazardKind
    private var icon: String {
        switch kind {
        case .stop: return "hand.raised.fill"
        case .crossing: return "tram.fill"
        case .speedCamera: return "camera.fill"
        }
    }

    private var color: Color {
        switch kind {
        case .stop: return .red
        case .crossing: return .yellow
        case .speedCamera: return .orange
        }
    }

    var body: some View {
        Image(systemName: icon)
            .font(.caption.bold())
            .foregroundStyle(.white)
            .padding(5)
            .background(Circle().fill(color))
            .overlay(Circle().stroke(.white, lineWidth: 1.5))
    }
}

// MARK: - 待機中（地図を見ている）

struct IdleOverlay: View {
    @ObservedObject var engine = NavEngine.shared
    @ObservedObject var store = Store.shared
    @ObservedObject var loc = LocationManager.shared
    @Binding var preview: SavedPlace?
    @Binding var sheet: Sheet?
    let onRecenter: () -> Void
    let onShow: (SavedPlace) -> Void

    var body: some View {
        VStack(spacing: 10) {
            Button { sheet = .search(waypoint: false) } label: {
                HStack {
                    Image(systemName: "magnifyingglass")
                    Text("目的地を検索（声でも入力できます）").foregroundStyle(.secondary)
                    Spacer()
                    Image(systemName: "mic.fill").foregroundStyle(.blue)
                }
                .font(.title3)
                .padding(16)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
            }
            .buttonStyle(.plain)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Chip(title: "自宅", icon: "house.fill") {
                        if let h = store.home { engine.plan(to: h) } else { sheet = .places }
                    }
                    Chip(title: "職場", icon: "building.2.fill") {
                        if let w = store.work { engine.plan(to: w) } else { sheet = .places }
                    }
                    Chip(title: "お気に入り・履歴", icon: "star.fill") { sheet = .places }
                    Chip(title: "高速の渋滞", icon: "car.2.fill") { sheet = .highway }
                    Chip(title: "駐車位置", icon: "parkingsign") { sheet = .parking }
                }
            }

            if loc.authorization == .denied || loc.authorization == .restricted {
                Text("位置情報がオフです。設定アプリ →「ミチナビ」→「位置情報」を「このAppの使用中」にしてください。")
                    .font(.callout)
                    .padding(12)
                    .background(.yellow.opacity(0.9), in: RoundedRectangle(cornerRadius: 12))
            }

            Spacer()

            HStack(alignment: .bottom) {
                VStack(spacing: 10) {
                    RoundIcon(icon: "gearshape.fill") { sheet = .settings }
                    RoundIcon(icon: "camera.metering.spot", tint: .orange) { OrbisApp.open() }
                }
                Spacer()
                RoundIcon(icon: "location.fill", tint: .blue, action: onRecenter)
            }

            if let p = preview {
                PlaceCard(place: p, onClose: { preview = nil }) { engine.plan(to: p) }
            }
        }
        .padding()
    }
}

struct Chip: View {
    let title: String
    let icon: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.headline)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(.regularMaterial, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct RoundIcon: View {
    let icon: String
    var tint: Color = .primary
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(tint)
                .frame(width: 56, height: 56)
                .background(.regularMaterial, in: Circle())
        }
        .buttonStyle(.plain)
    }
}

/// 検索で選んだ場所
struct PlaceCard: View {
    @ObservedObject var store = Store.shared
    let place: SavedPlace
    let onClose: () -> Void
    let onRoute: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading) {
                    Text(place.name).font(.title2.bold())
                    if !place.subtitle.isEmpty { Text(place.subtitle).foregroundStyle(.secondary) }
                }
                Spacer()
                Button(action: onClose) { Image(systemName: "xmark.circle.fill").font(.title) }
                    .foregroundStyle(.secondary)
            }
            Button(action: onRoute) {
                Label("ルートを見る", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                    .font(.title3.bold())
                    .frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.borderedProminent)
            HStack {
                Button { store.home = place } label: { Label("自宅に設定", systemImage: "house") }
                Button { store.work = place } label: { Label("職場に設定", systemImage: "building.2") }
                Button { store.toggleFavorite(place) } label: {
                    Label("お気に入り", systemImage: store.isFavorite(place) ? "star.fill" : "star")
                }
            }
            .font(.subheadline)
            .buttonStyle(.bordered)
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
    }
}

// MARK: - ルートの選択

struct PlanningOverlay: View {
    @ObservedObject var engine = NavEngine.shared
    @ObservedObject var store = Store.shared
    @Binding var sheet: Sheet?

    var body: some View {
        VStack {
            Spacer()
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(engine.destination?.name ?? "目的地").font(.title3.bold()).lineLimit(1)
                    Spacer()
                    Button("やめる") { engine.cancelPlanning() }
                }

                if engine.calculating {
                    HStack { ProgressView(); Text("ルートを検索中…") }
                } else if let e = engine.errorText {
                    Text(e).foregroundStyle(.red)
                    Button("もう一度") { Task { await engine.calculate() } }
                }

                ForEach(Array(engine.plans.enumerated()), id: \.element.id) { i, plan in
                    PlanRow(plan: plan, fastest: i == 0, selected: i == engine.selectedPlan)
                        .onTapGesture { engine.selectedPlan = i }
                }

                WaypointList(sheet: $sheet)

                HStack {
                    Toggle("有料道路を使わない", isOn: $store.avoidTolls)
                    Toggle("高速を使わない", isOn: $store.avoidHighways)
                }
                .font(.footnote)
                .toggleStyle(.button)
                .onChange(of: store.avoidTolls) { _, _ in Task { await engine.calculate() } }
                .onChange(of: store.avoidHighways) { _, _ in Task { await engine.calculate() } }

                Button { engine.start() } label: {
                    Label("案内開始", systemImage: "location.north.line.fill")
                        .font(.title2.bold())
                        .frame(maxWidth: .infinity, minHeight: 56)
                }
                .buttonStyle(.borderedProminent)
                .disabled(engine.plans.isEmpty || engine.calculating)
            }
            .padding()
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
        }
        .padding()
    }
}

struct PlanRow: View {
    let plan: RoutePlan
    let fastest: Bool
    let selected: Bool

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(Guidance.durationText(plan.time).replacingOccurrences(of: "約", with: ""))
                        .font(.title3.bold())
                        .foregroundStyle(fastest ? .green : .primary)
                    Text(Guidance.distanceLabel(plan.distance)).foregroundStyle(.secondary)
                }
                Text(plan.name).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            if plan.hasTolls { Tag(text: "有料", color: .orange) }
            if fastest { Tag(text: "最速", color: .green) }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 12).stroke(selected ? Color.blue : Color.gray.opacity(0.3), lineWidth: selected ? 3 : 1))
        .contentShape(Rectangle())
    }
}

struct Tag: View {
    let text: String
    let color: Color
    var body: some View {
        Text(text).font(.caption.bold()).foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color, in: Capsule())
    }
}

struct WaypointList: View {
    @ObservedObject var engine = NavEngine.shared
    @Binding var sheet: Sheet?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(engine.waypoints.enumerated()), id: \.element.id) { i, w in
                HStack {
                    Image(systemName: "\(i + 1).circle.fill").foregroundStyle(.orange)
                    Text(w.name).lineLimit(1)
                    Spacer()
                    if i > 0 {
                        Button { engine.moveWaypoint(from: IndexSet(integer: i), to: i - 1) } label: { Image(systemName: "arrow.up") }
                    }
                    if i < engine.waypoints.count - 1 {
                        Button { engine.moveWaypoint(from: IndexSet(integer: i), to: i + 2) } label: { Image(systemName: "arrow.down") }
                    }
                    Button(role: .destructive) { engine.removeWaypoint(at: IndexSet(integer: i)) } label: { Image(systemName: "minus.circle") }
                }
                .buttonStyle(.borderless)
            }
            Button { sheet = .search(waypoint: true) } label: { Label("経由地を追加", systemImage: "plus.circle") }
                .font(.subheadline)
        }
    }
}

// MARK: - 案内中

struct NavigatingOverlay: View {
    @ObservedObject var engine = NavEngine.shared
    @ObservedObject var store = Store.shared
    @Binding var sheet: Sheet?
    let onRecenter: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            ManeuverPanel()

            if engine.rerouting {
                Notice(text: "ルートを再検索中…", color: .orange)
            }
            if let b = engine.banner {
                Notice(text: b, color: .green)
            }
            if let offer = engine.fasterOffer {
                FasterOfferCard(saved: offer.saved)
            }
            if let note = engine.highwayNote {
                Text(note)
                    .font(.footnote)
                    .lineLimit(3)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
            }

            Spacer()

            HStack(alignment: .bottom) {
                VStack(spacing: 10) {
                    RoundIcon(icon: store.voiceOn ? "speaker.wave.2.fill" : "speaker.slash.fill") { store.voiceOn.toggle() }
                    RoundIcon(icon: "camera.metering.spot", tint: .orange) { OrbisApp.open() }
                    RoundIcon(icon: "car.2.fill") { sheet = .highway }
                }
                Spacer()
                RoundIcon(icon: "location.north.line.fill", tint: .blue, action: onRecenter)
            }

            BottomBar()
        }
        .padding()
    }
}

struct ManeuverPanel: View {
    @ObservedObject var engine = NavEngine.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 14) {
                Image(systemName: ManeuverIcon.name(for: engine.nextText))
                    .font(.system(size: 44, weight: .bold))
                    .frame(width: 60)
                VStack(alignment: .leading, spacing: 2) {
                    Text(Guidance.distanceLabel(engine.nextDistance))
                        .font(.system(size: 38, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                    Text(engine.nextText)
                        .font(.title3.weight(.semibold))
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                }
                Spacer(minLength: 0)
            }
            if let then = engine.thenText {
                HStack {
                    Text("その先").font(.caption.bold())
                    Image(systemName: ManeuverIcon.name(for: then))
                    Text(then).font(.callout).lineLimit(1)
                }
                .foregroundStyle(.white.opacity(0.85))
            }
        }
        .foregroundStyle(.white)
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(red: 0.05, green: 0.42, blue: 0.27), in: RoundedRectangle(cornerRadius: 20))
    }
}

enum ManeuverIcon {
    static func name(for text: String) -> String {
        if text.contains("目的地") || text.contains("到着") { return "flag.checkered" }
        if text.contains("経由地") { return "mappin.circle.fill" }
        if text.contains("Uターン") { return "arrow.uturn.down" }
        if text.contains("ロータリー") || text.contains("環状交差点") { return "arrow.triangle.2.circlepath" }
        let right = text.contains("右"), left = text.contains("左")
        if text.contains("斜め") || text.contains("寄り") || text.contains("分岐") {
            if right { return "arrow.up.right" }
            if left { return "arrow.up.left" }
        }
        if right { return "arrow.turn.up.right" }
        if left { return "arrow.turn.up.left" }
        return "arrow.up"
    }
}

struct Notice: View {
    let text: String
    let color: Color
    var body: some View {
        Text(text).font(.headline).foregroundStyle(.white)
            .padding(12).frame(maxWidth: .infinity)
            .background(color, in: RoundedRectangle(cornerRadius: 12))
    }
}

struct FasterOfferCard: View {
    @ObservedObject var engine = NavEngine.shared
    let saved: TimeInterval

    var body: some View {
        VStack(spacing: 10) {
            Label("\(Guidance.durationText(saved))早いルートがあります", systemImage: "bolt.car.fill")
                .font(.title3.bold())
            HStack {
                Button { engine.acceptFaster() } label: {
                    Text("切り替える").font(.title3.bold()).frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(.borderedProminent)
                Button { engine.fasterOffer = nil } label: {
                    Text("このまま").font(.title3).frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(.bordered)
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}

struct BottomBar: View {
    @ObservedObject var engine = NavEngine.shared
    @State private var confirmEnd = false

    private var etaText: String {
        let f = DateFormatter()
        f.dateFormat = "H:mm"
        return f.string(from: engine.eta)
    }

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(etaText) 到着").font(.title2.bold()).monospacedDigit()
                Text("\(Guidance.durationText(engine.remainingTime))・\(Guidance.distanceLabel(engine.remainingDistance))")
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack {
                Text("\(Int(engine.speedKmh))").font(.title.bold()).monospacedDigit()
                Text("km/h").font(.caption2).foregroundStyle(.secondary)
            }
            .frame(width: 64)
            Button { confirmEnd = true } label: {
                Text("終了").font(.title3.bold()).frame(width: 76, height: 52)
            }
            .buttonStyle(.borderedProminent)
            .tint(.red)
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
        .confirmationDialog("案内を終了しますか？", isPresented: $confirmEnd, titleVisibility: .visible) {
            Button("終了して駐車位置を記録") { engine.stop(saveParking: true) }
            Button("終了する", role: .destructive) { engine.stop() }
            Button("続ける", role: .cancel) {}
        }
    }
}
