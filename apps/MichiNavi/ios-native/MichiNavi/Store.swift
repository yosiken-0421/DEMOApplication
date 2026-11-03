import Foundation
import MapKit
import SwiftUI

/// 保存する場所（自宅・職場・お気に入り・履歴・駐車位置）
struct SavedPlace: Codable, Hashable, Identifiable, Sendable {
    var id = UUID()
    var name: String
    var subtitle: String
    var coord: Coord
    var date = Date()

    var clCoordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: coord.lat, longitude: coord.lon) }

    var mapItem: MKMapItem {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: clCoordinate))
        item.name = name
        return item
    }

    static func from(_ item: MKMapItem) -> SavedPlace {
        let c = item.placemark.coordinate
        let sub = [item.placemark.administrativeArea, item.placemark.locality, item.placemark.thoroughfare, item.placemark.subThoroughfare]
            .compactMap { $0 }.joined()
        return SavedPlace(name: item.name ?? "目的地", subtitle: sub, coord: Coord(c.latitude, c.longitude))
    }
}

enum NightMode: String, CaseIterable, Identifiable {
    case system, auto, day, night
    var id: String { rawValue }
    var title: String {
        switch self {
        case .system: return "iPhoneの設定に合わせる"
        case .auto: return "時刻で切替（18時〜6時は夜）"
        case .day: return "いつも昼"
        case .night: return "いつも夜"
        }
    }
}

@MainActor
final class Store: ObservableObject {
    static let shared = Store()

    @Published var home: SavedPlace? { didSet { save(home, "home") } }
    @Published var work: SavedPlace? { didSet { save(work, "work") } }
    @Published var favorites: [SavedPlace] = [] { didSet { save(favorites, "favorites") } }
    @Published var history: [SavedPlace] = [] { didSet { save(history, "history") } }
    @Published var parking: SavedPlace? { didSet { save(parking, "parking") } }

    // 設定
    @AppStorage("avoidTolls") var avoidTolls = false
    @AppStorage("avoidHighways") var avoidHighways = false
    @AppStorage("autoSwitchFaster") var autoSwitchFaster = false
    @AppStorage("warnStop") var warnStop = true
    @AppStorage("warnCrossing") var warnCrossing = true
    @AppStorage("warnSpeedCamera") var warnSpeedCamera = true
    @AppStorage("showHazardsOnMap") var showHazardsOnMap = true
    @AppStorage("highwayBriefing") var highwayBriefing = true
    @AppStorage("voiceOn") var voiceOn = true
    @AppStorage("nightMode") var nightModeRaw = NightMode.system.rawValue
    @AppStorage("showTraffic") var showTraffic = true

    var nightMode: NightMode {
        get { NightMode(rawValue: nightModeRaw) ?? .system }
        set { nightModeRaw = newValue.rawValue; objectWillChange.send() }
    }

    /// 地図の昼/夜（nil = iPhone の設定どおり）
    var colorScheme: ColorScheme? {
        switch nightMode {
        case .system: return nil
        case .day: return .light
        case .night: return .dark
        case .auto:
            let h = Calendar.current.component(.hour, from: Date())
            return (h >= 18 || h < 6) ? .dark : .light
        }
    }

    private init() {
        home = load("home")
        work = load("work")
        favorites = load("favorites") ?? []
        history = load("history") ?? []
        parking = load("parking")
    }

    func addHistory(_ p: SavedPlace) {
        var h = history.filter { Geo.distance($0.coord, p.coord) > 30 }
        var n = p
        n.date = Date()
        h.insert(n, at: 0)
        history = Array(h.prefix(20))
    }

    func toggleFavorite(_ p: SavedPlace) {
        if let i = favorites.firstIndex(where: { Geo.distance($0.coord, p.coord) < 30 }) {
            favorites.remove(at: i)
        } else {
            favorites.append(p)
        }
    }

    func isFavorite(_ p: SavedPlace) -> Bool {
        favorites.contains { Geo.distance($0.coord, p.coord) < 30 }
    }

    private func save<T: Encodable>(_ v: T?, _ key: String) {
        if let v, let data = try? JSONEncoder().encode(v) {
            UserDefaults.standard.set(data, forKey: "place." + key)
        } else {
            UserDefaults.standard.removeObject(forKey: "place." + key)
        }
    }

    private func load<T: Decodable>(_ key: String) -> T? {
        guard let data = UserDefaults.standard.data(forKey: "place." + key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
}
