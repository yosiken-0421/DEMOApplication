import Foundation

// ナビの計算まわり（画面や MapKit に依存しない部分。tests/ でテストする）

/// 緯度経度
struct Coord: Codable, Hashable, Sendable {
    var lat: Double
    var lon: Double
    init(_ lat: Double, _ lon: Double) { self.lat = lat; self.lon = lon }
}

enum Geo {
    static let earthR = 6_371_000.0

    /// 2点間の距離（メートル）
    static func distance(_ a: Coord, _ b: Coord) -> Double {
        let p1 = a.lat * .pi / 180, p2 = b.lat * .pi / 180
        let dp = p2 - p1, dl = (b.lon - a.lon) * .pi / 180
        let h = sin(dp / 2) * sin(dp / 2) + cos(p1) * cos(p2) * sin(dl / 2) * sin(dl / 2)
        return 2 * earthR * atan2(sqrt(h), sqrt(max(0, 1 - h)))
    }

    /// 点を基準にした平面座標（メートル）。短い距離の計算用
    static func local(_ p: Coord, origin o: Coord) -> (x: Double, y: Double) {
        let x = (p.lon - o.lon) * .pi / 180 * earthR * cos(o.lat * .pi / 180)
        let y = (p.lat - o.lat) * .pi / 180 * earthR
        return (x, y)
    }

    /// 点 p から線分 a-b への最短距離と、線分上の位置（0〜1）
    static func project(_ p: Coord, _ a: Coord, _ b: Coord) -> (dist: Double, t: Double) {
        let A = local(a, origin: p), B = local(b, origin: p)
        let dx = B.x - A.x, dy = B.y - A.y
        let len2 = dx * dx + dy * dy
        var t = 0.0
        if len2 > 0 { t = max(0, min(1, -(A.x * dx + A.y * dy) / len2)) }
        let cx = A.x + t * dx, cy = A.y + t * dy
        return (sqrt(cx * cx + cy * cy), t)
    }
}

/// ルートの線（座標の列）と、出発点からの累積距離
struct RouteLine: Sendable {
    let points: [Coord]
    let cumulative: [Double]
    var length: Double { cumulative.last ?? 0 }

    init(_ points: [Coord]) {
        self.points = points
        var c: [Double] = []
        c.reserveCapacity(points.count)
        var total = 0.0
        for i in points.indices {
            if i > 0 { total += Geo.distance(points[i - 1], points[i]) }
            c.append(total)
        }
        cumulative = c
    }

    struct Match: Sendable {
        let offRoute: Double      // ルートからのずれ（m）
        let along: Double         // 出発点からの進んだ距離（m）
        let segment: Int
    }

    /// 現在地をルートに当てはめる。hint（前回の区間）の近くから探して、逆走側の区間に飛ばないようにする
    func match(_ p: Coord, hint: Int? = nil) -> Match? {
        guard points.count >= 2 else { return nil }
        var range = 0..<(points.count - 1)
        if let h = hint {
            let lo = max(0, h - 30), hi = min(points.count - 1, h + 400)
            if lo < hi { range = lo..<hi }
        }
        var best: Match?
        for i in range {
            let r = Geo.project(p, points[i], points[i + 1])
            let along = cumulative[i] + r.t * (cumulative[i + 1] - cumulative[i])
            if best == nil || r.dist < best!.offRoute - 0.01 {
                best = Match(offRoute: r.dist, along: along, segment: i)
            }
        }
        // 近くで見つからなければ全体から探し直す
        if let b = best, b.offRoute > 80, hint != nil { return match(p, hint: nil) }
        return best
    }

    /// 出発点から distance(m) の地点
    func point(at distance: Double) -> Coord? {
        guard let first = points.first else { return nil }
        if distance <= 0 { return first }
        for i in 1..<points.count where cumulative[i] >= distance {
            let seg = cumulative[i] - cumulative[i - 1]
            let t = seg > 0 ? (distance - cumulative[i - 1]) / seg : 0
            let a = points[i - 1], b = points[i]
            return Coord(a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t)
        }
        return points.last
    }

    /// 等間隔に間引いた点
    func samples(every step: Double) -> [Coord] {
        guard length > 0, step > 0 else { return points }
        var out: [Coord] = []
        var d = 0.0
        while d <= length { if let p = point(at: d) { out.append(p) }; d += step }
        if let last = points.last { out.append(last) }
        return out
    }

    /// ほかのルートとどれだけ重なっているか（0〜1）。新しく探したルートが「今のルート」かどうかの判定に使う
    func overlap(with other: RouteLine, tolerance: Double = 40, step: Double = 200) -> Double {
        let s = samples(every: step)
        guard !s.isEmpty else { return 0 }
        var hit = 0
        var hint: Int?
        for p in s {
            if let m = other.match(p, hint: hint) {
                hint = m.segment
                if m.offRoute <= tolerance { hit += 1 }
            }
        }
        return Double(hit) / Double(s.count)
    }

    /// 線を単純化（ダグラス・ポーカー法）。地図データを問い合わせるときに点の数を減らす
    static func simplify(_ pts: [Coord], tolerance: Double) -> [Coord] {
        guard pts.count > 2 else { return pts }
        var keep = [Bool](repeating: false, count: pts.count)
        keep[0] = true; keep[pts.count - 1] = true
        var stack = [(0, pts.count - 1)]
        while let (s, e) = stack.popLast() {
            guard e > s + 1 else { continue }
            var maxD = 0.0, idx = s
            for i in (s + 1)..<e {
                let d = Geo.project(pts[i], pts[s], pts[e]).dist
                if d > maxD { maxD = d; idx = i }
            }
            if maxD > tolerance {
                keep[idx] = true
                stack.append((s, idx)); stack.append((idx, e))
            }
        }
        return pts.indices.filter { keep[$0] }.map { pts[$0] }
    }
}

// MARK: - 音声案内のタイミングと文章

enum Guidance {
    /// 次の曲がり角までの距離に応じて、どの案内を出すか（m）。速度が速いほど早めに
    static func thresholds(speedKmh: Double) -> [Double] {
        if speedKmh >= 70 { return [2000, 1000, 400] }
        if speedKmh >= 40 { return [700, 300, 80] }
        return [300, 120, 40]
    }

    /// 今の距離で言うべき案内の段階（まだ言っていないもの）。言うものがなければ nil
    static func stage(distance: Double, speedKmh: Double, alreadySpoken: Set<Int>) -> Int? {
        let th = thresholds(speedKmh: speedKmh)
        // 一番近い段階から見て、その距離以内に入っていて未発話なら返す
        for (i, t) in th.enumerated().reversed() where distance <= t {
            if alreadySpoken.contains(i) { return nil }
            // 近い段階に入ったら、それより遠い段階はもう言わない
            return i
        }
        return nil
    }

    /// 「300メートル先」「1.5キロ先」「まもなく」
    static func distancePhrase(_ m: Double) -> String {
        if m < 60 { return "まもなく" }
        if m < 1000 {
            let r = m < 200 ? (m / 10).rounded() * 10 : (m / 50).rounded() * 50
            return "\(Int(r))メートル先"
        }
        let km = (m / 100).rounded() / 10
        return km == km.rounded() ? "\(Int(km))キロ先" : "\(km)キロ先"
    }

    /// 画面表示用「350 m」「1.2 km」
    static func distanceLabel(_ m: Double) -> String {
        if m < 1000 { return "\(Int((m / 10).rounded() * 10)) m" }
        let km = m / 1000
        return km < 10 ? String(format: "%.1f km", km) : "\(Int(km.rounded())) km"
    }

    /// 「約1時間5分」「約12分」
    static func durationText(_ seconds: Double) -> String {
        let mins = max(1, Int((seconds / 60).rounded()))
        if mins < 60 { return "約\(mins)分" }
        let h = mins / 60, m = mins % 60
        return m == 0 ? "約\(h)時間" : "約\(h)時間\(m)分"
    }

    /// Apple の案内文を読みやすく（末尾の句点をそろえる・空なら補う）
    static func cleanInstruction(_ s: String) -> String {
        var t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        while t.hasSuffix("。") || t.hasSuffix(".") { t.removeLast() }
        return t.isEmpty ? "道なりに進みます" : t
    }

    static func sentence(distance: Double, instruction: String) -> String {
        "\(distancePhrase(distance))、\(cleanInstruction(instruction))。"
    }
}

// MARK: - ルート外れ・早いルートの判定

struct OffRouteDetector: Sendable {
    var strikes = 0
    /// ずれが大きい状態が続いたら true（GPS の一瞬のぶれでは再検索しない）
    mutating func update(offRoute: Double, accuracy: Double) -> Bool {
        let limit = max(50, min(120, accuracy * 1.5))
        if offRoute > limit { strikes += 1 } else { strikes = 0 }
        return strikes >= 3
    }
}

enum FasterRoute {
    /// 新しいルートに切り替える価値があるか（3分以上かつ8%以上早い）
    static func worthSwitching(currentRemaining: Double, candidate: Double) -> Bool {
        let saved = currentRemaining - candidate
        return saved >= 180 && saved >= currentRemaining * 0.08
    }

    static func message(savedSeconds: Double) -> String {
        "この先の渋滞を避けられる、\(Guidance.durationText(savedSeconds))早いルートがあります。"
    }
}

// MARK: - 地図データ（OpenStreetMap）の注意地点

enum HazardKind: String, Codable, Sendable, CaseIterable {
    case stop          // 一時停止
    case crossing      // 踏切
    case speedCamera   // オービス（OSM に登録されている固定式）

    var title: String {
        switch self {
        case .stop: return "一時停止"
        case .crossing: return "踏切"
        case .speedCamera: return "オービス"
        }
    }

    /// 何m手前で知らせるか
    func warnDistance(speedKmh: Double) -> Double {
        switch self {
        case .stop: return speedKmh > 45 ? 200 : 120
        case .crossing: return speedKmh > 45 ? 250 : 150
        case .speedCamera: return speedKmh > 70 ? 1000 : 500
        }
    }

    var spoken: String {
        switch self {
        case .stop: return "この先、一時停止です。"
        case .crossing: return "この先、踏切です。"
        case .speedCamera: return "この先、オービスがあります。速度に注意してください。"
        }
    }
}

struct Hazard: Codable, Hashable, Identifiable, Sendable {
    let id: Int64
    let kind: HazardKind
    let coord: Coord
}

enum Overpass {
    static let endpoint = "https://overpass-api.de/api/interpreter"

    /// ルートに沿った一時停止・踏切・オービスを探す問い合わせ文
    static func query(along line: [Coord]) -> String {
        let pts = line.map { String(format: "%.6f,%.6f", $0.lat, $0.lon) }.joined(separator: ",")
        return """
        [out:json][timeout:25];
        (
          node(around:25,\(pts))["highway"="stop"];
          node(around:25,\(pts))["railway"="level_crossing"];
          node(around:40,\(pts))["highway"="speed_camera"];
        );
        out;
        """
    }

    /// 長いルートは問い合わせを分ける（1回あたりの点の数を抑える）
    static func chunks(_ line: [Coord], maxPoints: Int = 300) -> [[Coord]] {
        guard line.count > maxPoints else { return line.isEmpty ? [] : [line] }
        var out: [[Coord]] = []
        var i = 0
        while i < line.count - 1 {
            let end = min(line.count, i + maxPoints)
            out.append(Array(line[i..<end]))
            i = end - 1   // つなぎ目の点を重ねる
        }
        return out
    }

    static func parse(_ data: Data) -> [Hazard] {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let elements = root["elements"] as? [[String: Any]] else { return [] }
        return elements.compactMap { e in
            guard let id = (e["id"] as? NSNumber)?.int64Value,
                  let lat = (e["lat"] as? NSNumber)?.doubleValue,
                  let lon = (e["lon"] as? NSNumber)?.doubleValue,
                  let tags = e["tags"] as? [String: Any] else { return nil }
            let kind: HazardKind
            if tags["highway"] as? String == "speed_camera" { kind = .speedCamera }
            else if tags["railway"] as? String == "level_crossing" { kind = .crossing }
            else if tags["highway"] as? String == "stop" { kind = .stop }
            else { return nil }
            return Hazard(id: id, kind: kind, coord: Coord(lat, lon))
        }
    }
}

// MARK: - ルート上の高速道路

enum RouteRoads {
    /// 案内文の一覧から、通る高速道路（渋滞ナビの路線）を拾う
    static func find(in instructions: [String]) -> [Road] {
        var out: [Road] = []
        for s in instructions {
            if let r = Road.find(in: s), !out.contains(r) { out.append(r) }
        }
        return out
    }

    /// ナビ開始時に読み上げる、ルート上の高速の渋滞・事故の要約
    static func briefing(roads: [Road], items: [TrafficItem], limit: Int = 3) -> String? {
        guard !roads.isEmpty else { return nil }
        let hits = items.filter { it in
            [.closure, .incident, .jam].contains(it.kind) && roads.contains { $0.matches(roadName: it.roadName, routeNo: it.routeNo) }
        }
        let names = roads.map(\.title).joined(separator: "、")
        guard !hits.isEmpty else { return "ルート上の\(names)に、今のところ渋滞や事故の情報はありません。" }
        let sorted = hits.sorted { TrafficParser.rank($0.kind) < TrafficParser.rank($1.kind) }
        var text = "ルート上の高速道路の情報です。"
        text += sorted.prefix(limit).map { TrafficText.sentence($0, includeRoad: true) }.joined()
        if sorted.count > limit { text += "ほかに\(sorted.count - limit)件あります。" }
        return text
    }
}
