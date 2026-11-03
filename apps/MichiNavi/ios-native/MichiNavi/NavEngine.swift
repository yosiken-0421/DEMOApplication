import CoreLocation
import Foundation
import MapKit
import UIKit

extension MKPolyline {
    var coords: [Coord] {
        var a = [CLLocationCoordinate2D](repeating: kCLLocationCoordinate2DInvalid, count: pointCount)
        getCoordinates(&a, range: NSRange(location: 0, length: pointCount))
        return a.map { Coord($0.latitude, $0.longitude) }
    }
}

extension CLLocation {
    var coord: Coord { Coord(coordinate.latitude, coordinate.longitude) }
    var speedKmh: Double { speed > 0 ? speed * 3.6 : 0 }
}

extension Coord {
    var cl: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }
}

/// ルート候補（経由地があるときは区間ごとの MKRoute をつないだもの）
struct RoutePlan: Identifiable {
    let id = UUID()
    let legs: [MKRoute]
    let stopNames: [String]          // 各区間の到着地の名前（最後が目的地）

    var time: TimeInterval { legs.reduce(0) { $0 + $1.expectedTravelTime } }
    var distance: CLLocationDistance { legs.reduce(0) { $0 + $1.distance } }
    var name: String { legs.count == 1 ? (legs[0].name.isEmpty ? "ルート" : legs[0].name) : "経由地 \(legs.count - 1)か所" }
    var hasTolls: Bool { legs.contains { $0.hasTolls } }
    var hasHighways: Bool { legs.contains { $0.hasHighways } }
    var polylines: [MKPolyline] { legs.map(\.polyline) }
    var advisories: [String] { legs.flatMap(\.advisoryNotices) }
}

/// 案内する曲がり角など
struct Maneuver {
    let at: Double          // ルート上の位置（出発点からの m）
    let text: String
}

/// ルート検索と案内の中心
@MainActor
final class NavEngine: ObservableObject {
    static let shared = NavEngine()

    enum Phase { case idle, planning, navigating }

    // 計画
    @Published private(set) var phase: Phase = .idle
    @Published var destination: SavedPlace?
    @Published var waypoints: [SavedPlace] = []
    @Published private(set) var plans: [RoutePlan] = []
    @Published var selectedPlan = 0
    @Published private(set) var calculating = false
    @Published var errorText: String?

    // 案内中
    @Published private(set) var active: RoutePlan?
    @Published private(set) var nextText = ""
    @Published private(set) var nextDistance: Double = 0
    @Published private(set) var thenText: String?
    @Published private(set) var remainingDistance: Double = 0
    @Published private(set) var remainingTime: TimeInterval = 0
    @Published private(set) var speedKmh: Double = 0
    @Published private(set) var hazards: [Hazard] = []
    @Published private(set) var highwayNote: String?
    @Published private(set) var rerouting = false
    @Published var fasterOffer: (plan: RoutePlan, saved: TimeInterval)?
    @Published var banner: String?

    var eta: Date { Date().addingTimeInterval(remainingTime) }

    private let store = Store.shared
    private let loc = LocationManager.shared
    private let speaker = Speaker.shared

    private var line = RouteLine([])
    private var maneuvers: [Maneuver] = []
    private var legEnds: [Double] = []
    private var planTime: TimeInterval = 0
    private var progress: Double = 0
    private var lastSegment: Int?
    private var spoken: [Int: Set<Int>] = [:]
    private var legsArrived = 0
    private var offRoute = OffRouteDetector()
    private var lastReroute = Date.distantPast
    private var hazardAlong: [(hazard: Hazard, along: Double)] = []
    private var warnedHazards: Set<Int64> = []
    private var fasterTask: Task<Void, Never>?
    private var remainingStops: [SavedPlace] = []

    private init() {
        loc.onUpdate = { [weak self] l in self?.handle(l) }
    }

    // MARK: 計画

    func plan(to place: SavedPlace) {
        destination = place
        waypoints = []
        phase = .planning
        Task { await calculate() }
    }

    func addWaypoint(_ p: SavedPlace) {
        waypoints.append(p)
        Task { await calculate() }
    }

    func removeWaypoint(at offsets: IndexSet) {
        waypoints.remove(atOffsets: offsets)
        Task { await calculate() }
    }

    func moveWaypoint(from: IndexSet, to: Int) {
        waypoints.move(fromOffsets: from, toOffset: to)
        Task { await calculate() }
    }

    func cancelPlanning() {
        phase = .idle
        plans = []
        destination = nil
        waypoints = []
        errorText = nil
    }

    func calculate() async {
        guard let dest = destination else { return }
        calculating = true
        errorText = nil
        defer { calculating = false }
        let stops = waypoints + [dest]
        do {
            plans = try await routes(from: loc.location?.coord, stops: stops, alternatives: true)
            selectedPlan = 0
            if plans.isEmpty { errorText = "ルートが見つかりませんでした" }
        } catch {
            plans = []
            errorText = "ルートを検索できませんでした。電波の良いところで、少し待ってからもう一度お試しください。"
        }
    }

    private func request(from: Coord?, to: SavedPlace, alternatives: Bool) -> MKDirections.Request {
        let r = MKDirections.Request()
        if let from {
            r.source = MKMapItem(placemark: MKPlacemark(coordinate: from.cl))
        } else {
            r.source = MKMapItem.forCurrentLocation()
        }
        r.destination = to.mapItem
        r.transportType = .automobile
        r.requestsAlternateRoutes = alternatives
        r.tollPreference = store.avoidTolls ? .avoid : .any
        r.highwayPreference = store.avoidHighways ? .avoid : .any
        return r
    }

    /// 出発地から stops を順にまわるルート。経由地なしのときは候補を複数返す
    private func routes(from: Coord?, stops: [SavedPlace], alternatives: Bool) async throws -> [RoutePlan] {
        let names = stops.map(\.name)
        if stops.count == 1 {
            let resp = try await MKDirections(request: request(from: from, to: stops[0], alternatives: alternatives)).calculate()
            return resp.routes.sorted { $0.expectedTravelTime < $1.expectedTravelTime }.prefix(3).map { RoutePlan(legs: [$0], stopNames: names) }
        }
        var legs: [MKRoute] = []
        var start = from
        for s in stops {
            let resp = try await MKDirections(request: request(from: start, to: s, alternatives: false)).calculate()
            guard let r = resp.routes.first else { return [] }
            legs.append(r)
            start = s.coord
        }
        return [RoutePlan(legs: legs, stopNames: names)]
    }

    // MARK: 案内の開始・終了

    func start() {
        guard plans.indices.contains(selectedPlan), let dest = destination else { return }
        store.addHistory(dest)
        remainingStops = waypoints + [dest]
        begin(plans[selectedPlan], announce: true)
        phase = .navigating
        loc.setNavigating(true)
        UIApplication.shared.isIdleTimerDisabled = true
        startFasterRouteChecks()
    }

    func stop(saveParking: Bool = false) {
        if saveParking, let l = loc.location {
            store.parking = SavedPlace(name: "駐車位置", subtitle: destination.map { "\($0.name) 付近" } ?? "", coord: l.coord)
        }
        fasterTask?.cancel(); fasterTask = nil
        speaker.stop()
        active = nil
        plans = []
        destination = nil
        waypoints = []
        hazards = []
        highwayNote = nil
        fasterOffer = nil
        phase = .idle
        loc.setNavigating(false)
        UIApplication.shared.isIdleTimerDisabled = false
    }

    /// ルートをセットして案内の状態を作り直す
    private func begin(_ plan: RoutePlan, announce: Bool) {
        active = plan
        planTime = plan.time
        var pts: [Coord] = []
        var mans: [Maneuver] = []
        var ends: [Double] = []
        var along = 0.0
        for (li, leg) in plan.legs.enumerated() {
            for (si, step) in leg.steps.enumerated() {
                let sp = step.polyline.coords
                let len = RouteLine(sp).length
                let first = li == 0 && si == 0
                let isLegEnd = si == leg.steps.count - 1
                var text = Guidance.cleanInstruction(step.instructions)
                if isLegEnd && li < plan.legs.count - 1 { text = "経由地、\(plan.stopNames[li])です" }
                if !first && !step.instructions.isEmpty || (isLegEnd && !first) { mans.append(Maneuver(at: along, text: text)) }
                if pts.last == sp.first, !sp.isEmpty { pts += sp.dropFirst() } else { pts += sp }
                along += len
            }
            ends.append(along)
        }
        line = RouteLine(pts)
        maneuvers = mans
        legEnds = ends
        progress = 0
        lastSegment = nil
        spoken = [:]
        legsArrived = 0
        offRoute = OffRouteDetector()
        warnedHazards = []
        hazardAlong = []
        remainingDistance = line.length
        remainingTime = plan.time
        updateNext()

        if announce {
            var t = "ルート案内を開始します。到着まで\(Guidance.durationText(plan.time))、\(Guidance.distancePhrase(plan.distance).replacingOccurrences(of: "先", with: ""))です。"
            if let m = maneuvers.first { t += Guidance.sentence(distance: m.at, instruction: m.text); spoken[0] = [0, 1] }
            speaker.say(t)
            if store.highwayBriefing { briefHighways(plan) }
        }
        loadHazards()
    }

    // MARK: 位置の更新ごと

    private func handle(_ l: CLLocation) {
        speedKmh = l.speedKmh
        guard phase == .navigating, line.points.count >= 2, !rerouting else { return }
        let p = l.coord
        guard let m = line.match(p, hint: lastSegment) else { return }
        lastSegment = m.segment

        if offRoute.update(offRoute: m.offRoute, accuracy: l.horizontalAccuracy) {
            reroute(from: l)
            return
        }
        // 進んだ距離（GPS のぶれで戻らないように）
        if m.along > progress || progress - m.along > 150 { progress = m.along }

        // 経由地・目的地への到着
        while legsArrived < legEnds.count - 1, progress >= legEnds[legsArrived] - 40 {
            legsArrived += 1
            if !remainingStops.isEmpty { remainingStops.removeFirst() }
        }
        if let dest = destination, progress >= line.length - 35 || Geo.distance(p, dest.coord) < 30 {
            speaker.say("目的地に到着しました。駐車した場所を記録しました。案内を終了します。", urgent: true)
            stop(saveParking: true)
            return
        }

        remainingDistance = max(0, line.length - progress)
        if line.length > 0 { remainingTime = planTime * remainingDistance / line.length }
        updateNext()
        announceIfNeeded()
        warnHazards()
    }

    private func updateNext() {
        if let i = maneuvers.firstIndex(where: { $0.at > progress + 5 }) {
            nextText = maneuvers[i].text
            nextDistance = maneuvers[i].at - progress
            thenText = maneuvers.indices.contains(i + 1) && maneuvers[i + 1].at - maneuvers[i].at < 300 ? maneuvers[i + 1].text : nil
        } else {
            nextText = "目的地"
            nextDistance = max(0, line.length - progress)
            thenText = nil
        }
    }

    private func announceIfNeeded() {
        guard let i = maneuvers.firstIndex(where: { $0.at > progress + 5 }) else { return }
        let dist = maneuvers[i].at - progress
        let done = spoken[i] ?? []
        guard let stage = Guidance.stage(distance: dist, speedKmh: speedKmh, alreadySpoken: done) else { return }
        spoken[i] = done.union(0...stage)
        var t = Guidance.sentence(distance: dist, instruction: maneuvers[i].text)
        if stage == 2, let then = thenText { t += "その先、\(Guidance.cleanInstruction(then))。" }
        speaker.say(t, urgent: stage == 2)
    }

    // MARK: ルートを外れたとき

    private func reroute(from l: CLLocation) {
        guard Date().timeIntervalSince(lastReroute) > 15, !remainingStops.isEmpty else { return }
        lastReroute = Date()
        rerouting = true
        speaker.say("ルートを再検索します。")
        let stops = remainingStops
        Task {
            defer { rerouting = false }
            if let plan = try? await routes(from: l.coord, stops: stops, alternatives: false).first {
                begin(plan, announce: false)
                if let m = maneuvers.first { speaker.say(Guidance.sentence(distance: m.at, instruction: m.text)); spoken[0] = [0] }
            } else {
                offRoute = OffRouteDetector()
                banner = "再検索できませんでした。しばらくして自動でやり直します。"
            }
        }
    }

    // MARK: 渋滞を避ける早いルート

    private func startFasterRouteChecks() {
        fasterTask?.cancel()
        fasterTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 240 * 1_000_000_000)
                guard !Task.isCancelled else { return }
                await self?.checkFasterRoute()
            }
        }
    }

    func checkFasterRoute() async {
        guard phase == .navigating, !rerouting, let l = loc.location, remainingStops.count == 1,
              let dest = destination, remainingDistance > 3000 else { return }
        guard let resp = try? await MKDirections(request: request(from: l.coord, to: dest, alternatives: true)).calculate() else { return }
        // 今のルートの残り部分
        let seg = lastSegment ?? 0
        let rest = RouteLine([l.coord] + line.points[min(seg + 1, line.points.count - 1)...])
        var current = remainingTime
        var best: MKRoute?
        for r in resp.routes {
            let ov = RouteLine(r.polyline.coords).overlap(with: rest)
            if ov >= 0.85 {
                current = r.expectedTravelTime     // 同じ道の最新の所要時間
            } else if best == nil || r.expectedTravelTime < best!.expectedTravelTime {
                best = r
            }
        }
        remainingTime = current
        planTime = line.length > 0 ? current * line.length / max(1, remainingDistance) : current
        guard let b = best, FasterRoute.worthSwitching(currentRemaining: current, candidate: b.expectedTravelTime) else { return }
        let saved = current - b.expectedTravelTime
        let plan = RoutePlan(legs: [b], stopNames: [dest.name])
        if store.autoSwitchFaster {
            switchTo(plan, saved: saved)
        } else {
            fasterOffer = (plan, saved)
            speaker.say(FasterRoute.message(savedSeconds: saved) + "切り替える場合は、画面のボタンを押してください。")
        }
    }

    func acceptFaster() {
        guard let o = fasterOffer else { return }
        switchTo(o.plan, saved: o.saved)
    }

    private func switchTo(_ plan: RoutePlan, saved: TimeInterval) {
        fasterOffer = nil
        begin(plan, announce: false)
        speaker.say("\(Guidance.durationText(saved))早いルートに変更しました。")
        banner = "\(Guidance.durationText(saved))早いルートに変更しました"
    }

    // MARK: ルート上の高速道路の渋滞

    private func briefHighways(_ plan: RoutePlan) {
        let roads = RouteRoads.find(in: plan.legs.flatMap { $0.steps.map(\.instructions) } + plan.legs.map(\.name))
        guard !roads.isEmpty else { highwayNote = nil; return }
        Task {
            guard let snap = try? await TrafficService.shared.all(),
                  let text = RouteRoads.briefing(roads: roads, items: snap.items) else { return }
            highwayNote = text
            speaker.say(text)
        }
    }

    // MARK: 一時停止・踏切・オービス（OpenStreetMap）

    private func loadHazards() {
        let pts = line.points
        let l = line
        let token = active?.id
        Task {
            let found = await HazardService.fetch(along: pts)
            guard token == active?.id else { return }   // その間にルートが変わったら使わない
            var along: [(hazard: Hazard, along: Double)] = []
            for h in found {
                if let m = l.match(h.coord, hint: nil), m.offRoute <= 40 { along.append((hazard: h, along: m.along)) }
            }
            along.sort { $0.along < $1.along }
            hazardAlong = along
            hazards = along.map { $0.hazard }
        }
    }

    private func enabled(_ k: HazardKind) -> Bool {
        switch k {
        case .stop: return store.warnStop
        case .crossing: return store.warnCrossing
        case .speedCamera: return store.warnSpeedCamera
        }
    }

    private func warnHazards() {
        for item in hazardAlong where !warnedHazards.contains(item.hazard.id) {
            let ahead = item.along - progress
            if ahead < -20 { warnedHazards.insert(item.hazard.id); continue }
            if ahead > 0, ahead <= item.hazard.kind.warnDistance(speedKmh: speedKmh) {
                warnedHazards.insert(item.hazard.id)
                if enabled(item.hazard.kind) { speaker.say(item.hazard.kind.spoken) }
            }
        }
    }

    /// 地図に表示するルートの線（案内中は残りの部分）
    var activeLine: [CLLocationCoordinate2D] {
        guard !line.points.isEmpty else { return [] }
        let seg = lastSegment ?? 0
        return line.points[min(seg, line.points.count - 1)...].map(\.cl)
    }
}

// MARK: - オービス警報アプリとの連携

enum OrbisApp {
    static let scheme = URL(string: "orbis://")!
    static let store = URL(string: "https://apps.apple.com/jp/app/id862469459")!

    @MainActor static var installed: Bool { UIApplication.shared.canOpenURL(scheme) }

    @MainActor static func open() {
        UIApplication.shared.open(installed ? scheme : store)
    }
}
