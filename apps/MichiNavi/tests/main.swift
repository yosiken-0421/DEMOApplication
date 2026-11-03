import Foundation

// ナビ計算のテスト（GitHub Actions の macOS で NaviCore.swift / TrafficCore.swift と一緒にビルドして実行）

var failures = 0
func check(_ cond: Bool, _ name: String) {
    if cond { print("OK  \(name)") } else { print("NG  \(name)"); failures += 1 }
}

// 距離：東京駅 → 皇居外苑（約 1km 前後）
let tokyo = Coord(35.681236, 139.767125)
let kokyo = Coord(35.680, 139.757)
let d = Geo.distance(tokyo, kokyo)
check(d > 850 && d < 1050, "2点間の距離 \(Int(d))m")

// まっすぐ東へ 1km のルート
let start = Coord(35.0, 139.0)
let line = RouteLine([start, Coord(35.0, 139.0055), Coord(35.0, 139.011)])
check(abs(line.length - 1003) < 15, "ルートの長さ \(Int(line.length))m")

// ルートの 20m 北を走っている → ずれ約20m、進んだ距離 約500m
if let m = line.match(Coord(35.00018, 139.0055)) {
    check(abs(m.offRoute - 20) < 3, "ずれ \(Int(m.offRoute))m")
    check(abs(m.along - 501) < 15, "進んだ距離 \(Int(m.along))m")
} else { check(false, "ルートへの当てはめ") }

// 途中の地点
if let p = line.point(at: line.length / 2) {
    check(abs(p.lon - 139.0055) < 0.0002, "中間地点")
}

// 重なり：同じルート = 1、200m 北の並行ルート = 0
let parallel = RouteLine([Coord(35.0018, 139.0), Coord(35.0018, 139.011)])
check(line.overlap(with: line) > 0.99, "同じルートの重なり")
check(line.overlap(with: parallel) < 0.01, "別ルートの重なり")

// 単純化：直線上の点は消える、曲がり角は残る
let zig = [Coord(35, 139), Coord(35, 139.001), Coord(35, 139.002), Coord(35.002, 139.002)]
let simp = RouteLine.simplify(zig, tolerance: 5)
check(simp.count == 3, "線の単純化 \(simp.count)点")

// 案内文
check(Guidance.distancePhrase(30) == "まもなく", "まもなく")
check(Guidance.distancePhrase(300) == "300メートル先", "300メートル先")
check(Guidance.distancePhrase(1500) == "1.5キロ先", "1.5キロ先")
check(Guidance.distancePhrase(2000) == "2キロ先", "2キロ先")
check(Guidance.durationText(65 * 60) == "約1時間5分", "所要時間")
check(Guidance.sentence(distance: 300, instruction: "右折します。") == "300メートル先、右折します。", "案内の文")

// 案内の段階：一般道（30km/h）で 250m → 2番目（120m）はまだ、1番目（300m）を言う
check(Guidance.stage(distance: 250, speedKmh: 30, alreadySpoken: []) == 0, "案内段階 遠")
check(Guidance.stage(distance: 100, speedKmh: 30, alreadySpoken: [0]) == 1, "案内段階 中")
check(Guidance.stage(distance: 100, speedKmh: 30, alreadySpoken: [0, 1]) == nil, "案内段階 済み")
check(Guidance.stage(distance: 900, speedKmh: 30, alreadySpoken: []) == nil, "案内段階 まだ遠い")

// ルート外れ：3回続いたら再検索
var det = OffRouteDetector()
check(!det.update(offRoute: 90, accuracy: 10), "外れ1回目")
check(!det.update(offRoute: 90, accuracy: 10), "外れ2回目")
check(det.update(offRoute: 90, accuracy: 10), "外れ3回目で再検索")
check(!det.update(offRoute: 10, accuracy: 10), "戻ったらリセット")

// 早いルート：30分の残りに対して 5分早い → 切り替え候補、1分 → しない
check(FasterRoute.worthSwitching(currentRemaining: 1800, candidate: 1500), "5分早いルート")
check(!FasterRoute.worthSwitching(currentRemaining: 1800, candidate: 1740), "1分だけ早いルート")

// Overpass の結果の読み取り
let json = """
{"elements":[
 {"type":"node","id":1,"lat":35.1,"lon":139.1,"tags":{"highway":"stop"}},
 {"type":"node","id":2,"lat":35.2,"lon":139.2,"tags":{"railway":"level_crossing"}},
 {"type":"node","id":3,"lat":35.3,"lon":139.3,"tags":{"highway":"speed_camera","maxspeed":"60"}},
 {"type":"node","id":4,"lat":35.4,"lon":139.4,"tags":{"amenity":"cafe"}}
]}
""".data(using: .utf8)!
let hz = Overpass.parse(json)
check(hz.count == 3, "地図データの注意地点 \(hz.count)件")
check(hz.first { $0.id == 3 }?.kind == .speedCamera, "オービスの判定")
check(Overpass.chunks(Array(repeating: start, count: 700), maxPoints: 300).count == 3, "問い合わせの分割")
check(Overpass.query(along: [start]).contains("speed_camera"), "問い合わせ文")

// ルート上の高速道路
let roads = RouteRoads.find(in: ["東京外環自動車道に入ります", "首都高速道路に入ります", "一般道"])
check(roads == [.gaikan, .shutoko], "ルート上の高速 \(roads.map(\.title))")
let jam = TrafficItem(kind: .jam, roadName: "東京外環道", routeNo: "1130", direction: "内回", place: "草加ＩＣ付近",
                      cause: "", regulation: "", lengthKm: 3)
let brief = RouteRoads.briefing(roads: [.gaikan], items: [jam]) ?? ""
check(brief.contains("3キロの渋滞"), "高速の要約: \(brief)")
check(RouteRoads.briefing(roads: [.gaikan], items: [])?.contains("ありません") == true, "高速 渋滞なし")

print(failures == 0 ? "すべて成功" : "失敗 \(failures) 件")
exit(failures == 0 ? 0 : 1)
