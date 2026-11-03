import Foundation
import MapKit

/// Apple のマップで IC を探して、区間の道すじと所要時間を求める
enum RouteMapKit {
    struct Place: Identifiable, Hashable {
        let id = UUID()
        let name: String
        let address: String
        let point: GeoPoint
    }

    /// 「佐倉IC」などで地点を探す（日本国内）
    static func search(_ text: String) async -> [Place] {
        let q = text.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return [] }
        let req = MKLocalSearch.Request()
        req.naturalLanguageQuery = q
        req.region = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 36.2, longitude: 138.0),
                                        span: MKCoordinateSpan(latitudeDelta: 22, longitudeDelta: 24))
        guard let res = try? await MKLocalSearch(request: req).start() else { return [] }
        return res.mapItems.prefix(8).map { m in
            let c = m.placemark.coordinate
            return Place(name: m.name ?? q, address: m.placemark.title ?? "", point: GeoPoint(lat: c.latitude, lon: c.longitude))
        }
    }

    struct Built {
        let path: [GeoPoint]
        let lengthKm: Double
        let minutes: Int
        let roads: [String]
    }

    enum Failure: LocalizedError {
        case noRoute
        var errorDescription: String? { "ルートが見つかりませんでした。地点を選び直してください。" }
    }

    /// 出発→経由→到着の道すじ
    static func build(_ points: [GeoPoint]) async throws -> Built {
        guard points.count >= 2 else { throw Failure.noRoute }
        var path: [GeoPoint] = []
        var meters = 0.0, seconds = 0.0
        var roads: [String] = []
        for i in 1..<points.count {
            let req = MKDirections.Request()
            req.source = item(points[i - 1])
            req.destination = item(points[i])
            req.transportType = .automobile
            req.requestsAlternateRoutes = false
            req.highwayPreference = .any
            req.tollPreference = .any
            guard let route = try? await MKDirections(request: req).calculate().routes.first else { throw Failure.noRoute }
            meters += route.distance
            seconds += route.expectedTravelTime
            let pl = route.polyline
            var coords = [CLLocationCoordinate2D](repeating: kCLLocationCoordinate2DInvalid, count: pl.pointCount)
            pl.getCoordinates(&coords, range: NSRange(location: 0, length: pl.pointCount))
            for c in coords {
                let g = GeoPoint(lat: c.latitude, lon: c.longitude)
                if let last = path.last, RouteMatcher.dist(last, g) < 25 { continue }
                path.append(g)
            }
            for step in route.steps {
                for r in roadNames(in: step.instructions) where !roads.contains(r) { roads.append(r) }
            }
        }
        return Built(path: path, lengthKm: meters / 1000, minutes: Int((seconds / 60).rounded()), roads: roads)
    }

    /// 今の所要時間（分）。時間がかかりすぎたら諦める
    static func eta(_ points: [GeoPoint]) async -> Int? {
        guard points.count >= 2 else { return nil }
        return await withTaskGroup(of: Int?.self) { g in
            g.addTask {
                var total = 0.0
                for i in 1..<points.count {
                    let req = MKDirections.Request()
                    req.source = item(points[i - 1]); req.destination = item(points[i])
                    req.transportType = .automobile
                    guard let r = try? await MKDirections(request: req).calculateETA() else { return nil }
                    total += r.expectedTravelTime
                }
                return Int((total / 60).rounded())
            }
            g.addTask { try? await Task.sleep(nanoseconds: 4_000_000_000); return nil }
            let first = await g.next() ?? nil
            g.cancelAll()
            return first
        }
    }

    private static func item(_ p: GeoPoint) -> MKMapItem {
        MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: p.lat, longitude: p.lon)))
    }

    /// 案内文から道路名らしいものを拾う（確認用の表示だけに使う）
    private static func roadNames(in s: String) -> [String] {
        let keys = ["自動車道", "高速", "外環", "首都高", "道路", "環状線", "湾岸線", "号線", "バイパス"]
        return s.components(separatedBy: CharacterSet(charactersIn: "「」、。 "))
            .filter { w in w.count >= 3 && keys.contains { w.contains($0) } }
    }
}
