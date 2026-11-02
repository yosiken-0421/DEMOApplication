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

if failures > 0 { print("失敗 \(failures) 件"); exit(1) }
print("すべて成功")
