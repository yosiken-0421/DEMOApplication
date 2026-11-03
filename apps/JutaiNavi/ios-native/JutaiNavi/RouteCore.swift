import Foundation

// MARK: - 登録した区間（例：佐倉IC → 和光北IC）

struct GeoPoint: Codable, Hashable, Sendable {
    var lat: Double
    var lon: Double
}

struct SavedRoute: Codable, Identifiable, Hashable, Sendable {
    var id: UUID = UUID()
    /// Siri で呼ぶ名前（例：通勤）
    var name: String
    var fromName: String
    var toName: String
    var viaNames: [String] = []
    /// 出発・経由・到着の地点（所要時間の計算に使う）
    var waypoints: [GeoPoint]
    /// 走る道すじ（約30mおき）
    var path: [GeoPoint]
    var lengthKm: Double
    /// 登録したときの所要時間（分）
    var baseMinutes: Int?

    var summary: String {
        ([fromName] + viaNames + [toName]).map { TrafficText.normalize($0) }.joined(separator: " → ")
    }
}

enum RouteStore {
    static let key = "savedRoutes"
    static func load() -> [SavedRoute] {
        guard let d = UserDefaults.standard.data(forKey: key),
              let list = try? JSONDecoder().decode([SavedRoute].self, from: d) else { return [] }
        return list
    }
    static func save(_ list: [SavedRoute]) {
        if let d = try? JSONEncoder().encode(list) { UserDefaults.standard.set(d, forKey: key) }
    }
    static func find(_ id: UUID) -> SavedRoute? { load().first { $0.id == id } }
}

// MARK: - 区間の上にある交通情報を選ぶ

/// 道すじ（path）と JARTIC の情報の位置を比べて、
/// 「区間の上にあって、進む向きが同じ」ものだけを、走る順に並べる。
struct RouteMatcher {
    /// 道路からの距離がこれ以内なら「区間の上」とみなす（m）
    static let nearMeters = 80.0

    private let pts: [GeoPoint]
    private let along: [Double]   // 出発地点からの距離（m）
    private let minLat, maxLat, minLon, maxLon: Double

    init(path: [GeoPoint]) {
        var dense: [GeoPoint] = []
        for (i, p) in path.enumerated() {
            if i > 0 {
                let a = path[i - 1]
                let d = Self.dist(a, p)
                let n = Int(d / 30)
                if n > 1 { for k in 1..<n { let t = Double(k) / Double(n); dense.append(GeoPoint(lat: a.lat + (p.lat - a.lat) * t, lon: a.lon + (p.lon - a.lon) * t)) } }
            }
            dense.append(p)
        }
        pts = dense
        var s = [0.0]
        for i in 1..<max(dense.count, 1) { s.append(s[i - 1] + Self.dist(dense[i - 1], dense[i])) }
        along = s
        let m = 0.002 // 余白（約200m）
        minLat = (dense.map(\.lat).min() ?? 0) - m; maxLat = (dense.map(\.lat).max() ?? 0) + m
        minLon = (dense.map(\.lon).min() ?? 0) - m; maxLon = (dense.map(\.lon).max() ?? 0) + m
    }

    var totalMeters: Double { along.last ?? 0 }

    /// 一番近い道すじ上の点（距離m, 出発からの距離m）
    func locate(_ p: GeoPoint) -> (dist: Double, s: Double) {
        var best = (Double.greatestFiniteMagnitude, 0.0)
        for (i, q) in pts.enumerated() {
            let d = Self.dist(p, q)
            if d < best.0 { best = (d, along[i]) }
        }
        return best
    }

    struct Match { let item: TrafficItem; let s: Double }

    func match(_ items: [TrafficItem]) -> [Match] {
        enum Dir { case forward, reverse, unknown }
        var decided: [(TrafficItem, Double, Dir, Double)] = []   // item, s, 向き, 最短距離
        for it in items {
            let ps = it.coords.map { GeoPoint(lat: $0[1], lon: $0[0]) }
            guard !ps.isEmpty, ps.contains(where: { inBox($0) }) else { continue }
            let located = ps.map { locate($0) }
            let near = located.filter { $0.dist <= Self.nearMeters }
            guard !near.isEmpty else { continue }
            // 長い線のうち半分以上が道すじから外れていれば、交差しているだけの別の道路
            if ps.count >= 3 && Double(near.count) < Double(ps.count) * 0.5 { continue }
            let ds = (near.last?.s ?? 0) - (near.first?.s ?? 0)
            let dir: Dir = near.count >= 2 && abs(ds) > 15 ? (ds > 0 ? .forward : .reverse) : .unknown
            decided.append((it, near.first?.s ?? 0, dir, near.map(\.dist).min() ?? 0))
        }
        // 向きがわかった情報から「この道路のこの方向は区間に入っている／反対車線」を覚える
        var forward = Set<String>(), reverse = Set<String>(), roads = Set<String>()
        for (it, _, dir, _) in decided {
            let k = it.roadName + "|" + it.direction
            if dir == .forward { forward.insert(k); roads.insert(it.roadName) }
            if dir == .reverse { reverse.insert(k); roads.insert(it.roadName) }
        }
        var out: [Match] = []
        for (it, s, dir, d) in decided {
            switch dir {
            case .forward: out.append(Match(item: it, s: s))
            case .reverse: continue
            case .unknown:
                let k = it.roadName + "|" + it.direction
                let both = ["上下", "内外", "南北", "東西", ""].contains(it.direction)
                if forward.contains(k) || both { out.append(Match(item: it, s: s)); continue }
                if reverse.contains(k) { continue }
                // 向きがわからない短い情報は、道すじのすぐ近く（30m）のときだけ
                if !roads.contains(it.roadName) && d <= 30 { out.append(Match(item: it, s: s)) }
            }
        }
        var seen = Set<String>()
        return out.filter { seen.insert($0.item.key).inserted }.sorted { $0.s < $1.s }
    }

    private func inBox(_ p: GeoPoint) -> Bool { p.lat >= minLat && p.lat <= maxLat && p.lon >= minLon && p.lon <= maxLon }

    static func dist(_ a: GeoPoint, _ b: GeoPoint) -> Double {
        let r = 6_371_000.0
        let x = (b.lon - a.lon) * .pi / 180 * cos((a.lat + b.lat) / 2 * .pi / 180)
        let y = (b.lat - a.lat) * .pi / 180
        return sqrt(x * x + y * y) * r
    }
}

// MARK: - 区間の読み上げ文

extension TrafficText {
    static func routeSpeech(route: SavedRoute, items: [TrafficItem], updated: Date?, etaMinutes: Int?, maxRegulations: Int = 3) -> String {
        let title = "\(normalize(route.fromName))から\(normalize(route.toName))"
        let main = items.filter { [.closure, .incident, .jam, .icClosed].contains($0.kind) }
        let regs = items.filter { $0.kind == .regulation }
        let jams = items.filter { $0.kind == .jam }
        var parts: [String] = ["\(title)の交通情報です。"]
        if main.isEmpty && regs.isEmpty {
            parts.append("この区間に、渋滞や事故の情報はありません。")
        } else {
            if !jams.isEmpty {
                let km = jams.compactMap(\.lengthKm).reduce(0, +)
                let min = jams.compactMap(\.passMinutes).reduce(0, +)
                let kmText = km == km.rounded() ? String(Int(km)) : String(format: "%.1f", km)
                parts.append("渋滞が\(jams.count)か所、合計\(kmText)キロ、抜けるまで合計約\(min)分です。")
            } else {
                parts.append("渋滞はありません。")
            }
            parts += main.map { sentence($0, includeRoad: true) }
            parts += regs.prefix(maxRegulations).map { sentence($0, includeRoad: true) }
            if regs.count > maxRegulations { parts.append("ほかに工事などの規制が\(regs.count - maxRegulations)件あります。") }
        }
        if let etaMinutes { parts.append("到着までの予想は約\(durationText(etaMinutes))です。") }
        if let updated { parts.append("\(timeText(updated))時点の情報です。") }
        return parts.joined()
    }

    static func durationText(_ m: Int) -> String {
        m >= 60 ? "\(m / 60)時間\(m % 60 == 0 ? "" : "\(m % 60)分")" : "\(m)分"
    }
}
