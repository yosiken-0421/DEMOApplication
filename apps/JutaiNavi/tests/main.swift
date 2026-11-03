import Foundation

// swiftc ../ios-native/JutaiNavi/TrafficCore.swift main.swift で実行するロジックテスト
var failures = 0
func check(_ ok: Bool, _ msg: String, file: String = #file, line: Int = #line) {
    if ok { print("✅ \(msg)") } else { failures += 1; print("❌ \(msg)（\(line)行目）") }
}
let dir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "fixtures")
let events = TrafficParser.parseEvents(try Data(contentsOf: dir.appendingPathComponent("s-301-C01.json")))
let sapa = TrafficParser.parseSAPA(try Data(contentsOf: dir.appendingPathComponent("s-1101-A03.json")))
let all = TrafficParser.dedupe(events + sapa)

let gaikan = all.filter { Road.gaikan.matches(roadName: $0.roadName, routeNo: $0.routeNo) }
let jams = gaikan.filter { $0.kind == .jam }
check(jams.count == 2, "外環の渋滞は重複を除いて2件（実際 \(jams.count)）")
check(jams.first?.lengthKm == 3, "長い渋滞が先頭（3km）")
check(jams.first?.passMinutes == 9, "3kmの渋滞は約9分（実際 \(jams.first?.passMinutes ?? -1)）")
check(gaikan.contains { $0.kind == .incident && $0.cause == "事故" && $0.regulation == "第１走行規制" }, "事故＋第1走行規制を読める")
check(gaikan.contains { $0.kind == .incident && $0.cause == "故障車" }, "故障車を読める")
check(gaikan.first?.kind == .incident, "事故が渋滞より先に並ぶ")
check(!gaikan.contains { $0.roadName.contains("東名阪") }, "外環に他の路線が混ざらない")

let shutoko = all.filter { Road.shutoko.matches(roadName: $0.roadName, routeNo: $0.routeNo) }
check(shutoko.count == 1 && shutoko[0].kind == .closure, "首都高の通行止め1件（縮尺違いの重複を除く）")
check(!all.contains { Road.tomei.matches(roadName: $0.roadName, routeNo: $0.routeNo) }, "東名阪は東名に含めない")
check(Road.higashiMeihan.matches(roadName: "東名阪道", routeNo: "10450302"), "東名阪道の判定")
check(sapa.count == 1 && sapa[0].place == "羽生ＰＡ", "SA/PAは混雑だけ")

check(TrafficText.laneDescription("第１走行規制").contains("一番左"), "第1走行規制 → 一番左の車線")
check(TrafficText.laneDescription("第２走行規制").contains("左から2番目"), "第2走行規制 → 左から2番目")
check(TrafficText.laneDescription("追越車線規制").contains("一番右"), "追越車線規制 → 一番右の車線")
check(TrafficText.laneDescription("１車線規制").contains("どの車線かは発表されていません"), "1車線規制は位置不明と言う")
check(TrafficText.laneDescription("路肩規制").contains("路肩"), "路肩規制")

let speech = TrafficText.speech(road: .gaikan, items: gaikan, updated: TrafficParser.parseTarget("202611021257"))
print("読み上げ例: \(speech)")
check(speech.contains("外環の交通情報です"), "読み上げの始まり")
check(speech.contains("渋滞が2か所"), "渋滞の件数")
check(speech.contains("3キロの渋滞、抜けるまで約9分"), "距離と通過時間")
check(speech.contains("外回り"), "方向を「外回り」と読む")
check(speech.contains("12時57分時点"), "更新時刻")
check(speech.contains("IC"), "全角のＩＣを半角にする")
let empty = TrafficText.speech(road: .chuo, items: [], updated: nil)
check(speech.contains("市川中央ICから松戸ICで事故"), "区間の矢印を「から」と読む")
check(TrafficText.normalize("市川中央ＩＣ→松戸ＩＣ") == "市川中央IC→松戸IC", "画面では矢印のまま")
check(empty.contains("渋滞や事故の情報はありません"), "情報なしのとき")

check(Road.find(in: "外環の渋滞情報を教えて") == .gaikan, "文章から外環を探す")
check(Road.find(in: "東名阪の渋滞") == .higashiMeihan, "東名阪を東名と間違えない")
check(Road.find(in: "首都高速は？") == .shutoko, "首都高速")
check(TrafficParser.parseKm("１２km") == 12, "全角の距離")

// ---- 区間（ルート）の絞り込み ----
func line(_ lat: Double, _ lon1: Double, _ lon2: Double, n: Int = 6) -> [[Double]] {
    (0..<n).map { k in [lon1 + (lon2 - lon1) * Double(k) / Double(n - 1), lat] }
}
func mk(_ kind: TrafficKind, _ road: String, _ dir: String, _ place: String, km: Double? = nil, cause: String = "", rd: String = "", _ coords: [[Double]]) -> TrafficItem {
    TrafficItem(kind: kind, roadName: road, routeNo: "1", direction: dir, place: place, cause: cause, regulation: rd, lengthKm: km, coords: coords)
}
let path = stride(from: 139.70, through: 139.80, by: 0.005).map { GeoPoint(lat: 35.80, lon: $0) }   // 東へ進む約9km
let fwd = mk(.jam, "東京外環道", "外回", "川口東ＩＣ付近", km: 2, line(35.80005, 139.72, 139.73))
let rev = mk(.jam, "東京外環道", "内回", "草加ＩＣ付近", km: 3, line(35.8003, 139.73, 139.72))
let far = mk(.jam, "東京外環道", "外回", "遠くＩＣ付近", km: 1, line(35.85, 139.72, 139.73))
let revPoint = mk(.incident, "東京外環道", "内回", "草加ＩＣ", cause: "故障車", rd: "規制なし", [[139.76, 35.8003]])
let fwdPoint = mk(.incident, "東京外環道", "外回", "外環浦和ＩＣ付近", cause: "事故", rd: "第１走行規制", [[139.705, 35.80002]])
let cross = mk(.regulation, "５号池袋線", "上り", "交差する道路", cause: "工事", rd: "１車線規制",
               (0..<7).map { [139.75, 35.79 + 0.02 * Double($0) / 6] })
let after = mk(.jam, "東京外環道", "外回", "区間の先", km: 4, line(35.80, 139.83, 139.85))
let matched = RouteMatcher(path: path).match([fwd, rev, far, revPoint, fwdPoint, cross, after]).map(\.item)
check(matched.contains(fwd), "区間の上で同じ向きの渋滞は入る")
check(!matched.contains(rev), "反対車線の渋滞は入らない")
check(!matched.contains(far), "区間から離れた情報は入らない")
check(!matched.contains(revPoint), "反対車線の点の情報（向きは方向名で判断）は入らない")
check(matched.contains(fwdPoint), "同じ方向名の点の情報は入る")
check(!matched.contains(cross), "交差するだけの道路は入らない")
check(!matched.contains(after), "区間の先の情報は入らない")
check(matched.first == fwdPoint, "走る順に並ぶ（手前の事故が先）")
let route = SavedRoute(name: "通勤", fromName: "佐倉ＩＣ", toName: "和光北ＩＣ", waypoints: [path.first!, path.last!], path: path, lengthKm: 9)
let rs = TrafficText.routeSpeech(route: route, items: matched, updated: nil, etaMinutes: 75)
print("区間の読み上げ例: \(rs)")
check(rs.hasPrefix("佐倉ICから和光北ICの交通情報です。"), "区間の読み上げの始まり")
check(rs.contains("渋滞が1か所、合計2キロ、抜けるまで合計約6分"), "区間の渋滞の合計")
check(rs.contains("東京外環道、外回り"), "区間では道路名も読む")
check(rs.contains("約1時間15分"), "到着予想")
let none = TrafficText.routeSpeech(route: route, items: [], updated: nil, etaMinutes: nil)
check(none.contains("この区間に、渋滞や事故の情報はありません"), "区間に情報がないとき")

if failures > 0 { print("失敗 \(failures) 件"); exit(1) }
print("すべて成功")
