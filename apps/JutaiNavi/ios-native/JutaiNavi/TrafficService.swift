import Foundation

/// JARTIC「道路交通情報Now!!」の高速道路データ（5分ごと更新）を読み込む
actor TrafficService {
    static let shared = TrafficService()

    private let base = "https://www.jartic.or.jp/d/traffic_info"
    /// 高速道路の地域図（A01〜A10）と都市高速図（C01〜C05）
    private let areas = (1...10).map { String(format: "A%02d", $0) } + (1...5).map { String(format: "C%02d", $0) }
    private var cache: (time: Date, target: String, items: [TrafficItem])?
    private var digitalCache: (time: Date, target: String, items: [TrafficItem])?

    struct Snapshot: Sendable {
        let items: [TrafficItem]
        let updated: Date?
    }

    enum Failure: LocalizedError {
        case network
        var errorDescription: String? { "交通情報を取得できませんでした。電波の良いところでもう一度お試しください。" }
    }

    private lazy var session: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 15
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.httpAdditionalHeaders = [
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
            "Referer": "https://www.jartic.or.jp/map/",
        ]
        return URLSession(configuration: c)
    }()

    /// 全国の高速道路の情報（60秒以内なら前回の結果を使う）
    func all(force: Bool = false) async throws -> Snapshot {
        if !force, let c = cache, Date().timeIntervalSince(c.time) < 60 {
            return Snapshot(items: c.items, updated: TrafficParser.parseTarget(c.target))
        }
        let target = try await fetchTarget()
        let s = session
        let b = base
        let areaList = areas
        let items: [TrafficItem] = await withTaskGroup(of: [TrafficItem].self) { group in
            for a in areaList {
                group.addTask { await Self.load(s, "\(b)/r1/\(target)/s/301/\(a).json", TrafficParser.parseEvents) }
                group.addTask { await Self.load(s, "\(b)/r1/\(target)/s/1101/\(a).json", TrafficParser.parseSAPA) }
                if a.hasPrefix("C") {
                    group.addTask { await Self.load(s, "\(b)/r1/\(target)/s/801/\(a).json", TrafficParser.parseICClosures) }
                }
            }
            var all: [TrafficItem] = []
            for await part in group { all += part }
            return all
        }
        let unique = TrafficParser.dedupe(items)
        cache = (Date(), target, unique)
        return Snapshot(items: unique, updated: TrafficParser.parseTarget(target))
    }

    /// 1路線分
    func road(_ road: Road, force: Bool = false) async throws -> Snapshot {
        let s = try await all(force: force)
        return Snapshot(items: s.items.filter { road.matches(roadName: $0.roadName, routeNo: $0.routeNo) }, updated: s.updated)
    }

    /// 位置つき（デジタル地図）の高速道路の情報。区間の絞り込みに使う
    func digital(force: Bool = false) async throws -> Snapshot {
        if !force, let c = digitalCache, Date().timeIntervalSince(c.time) < 60 {
            return Snapshot(items: c.items, updated: TrafficParser.parseTarget(c.target))
        }
        let target = try await fetchTarget()
        let s = session
        let b = base
        let areaList = areas
        let items: [TrafficItem] = await withTaskGroup(of: [TrafficItem].self) { group in
            for a in areaList {
                group.addTask { await Self.load(s, "\(b)/r1/\(target)/d/301/\(a).json", TrafficParser.parseEvents) }
                if a.hasPrefix("A") {
                    group.addTask { await Self.load(s, "\(b)/r1/\(target)/d/1101/\(a).json", TrafficParser.parseSAPA) }
                } else {
                    group.addTask { await Self.load(s, "\(b)/r1/\(target)/d/801/\(a).json", TrafficParser.parseICClosures) }
                }
            }
            var all: [TrafficItem] = []
            for await part in group { all += part }
            return all
        }
        let unique = TrafficParser.dedupe(items)
        digitalCache = (Date(), target, unique)
        return Snapshot(items: unique, updated: TrafficParser.parseTarget(target))
    }

    /// 登録した区間の上の情報だけを、走る順に
    func route(_ route: SavedRoute, force: Bool = false) async throws -> Snapshot {
        let snap = try await digital(force: force)
        let matched = RouteMatcher(path: route.path).match(snap.items).map(\.item)
        return Snapshot(items: matched, updated: snap.updated)
    }

    private func fetchTarget() async throws -> String {
        guard let url = URL(string: "\(base)/r1/target.json") else { throw Failure.network }
        do {
            let (data, _) = try await session.data(from: url)
            if let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any], let t = obj["target"] as? String {
                return t
            }
        } catch {}
        throw Failure.network
    }

    private static func load(_ s: URLSession, _ urlString: String, _ parse: (Data) -> [TrafficItem]) async -> [TrafficItem] {
        guard let url = URL(string: urlString),
              let result = try? await s.data(from: url),
              (result.1 as? HTTPURLResponse)?.statusCode == 200 else { return [] }
        return parse(result.0)
    }
}
