import Foundation

// MARK: - 路線（Siri で呼べる名前）

/// Siri やアプリで選べる高速道路。JARTIC のデータの路線名（r）や路線番号（rn）と照合する。
enum Road: String, CaseIterable, Codable, Sendable {
    case gaikan, shutoko, tomei, shinTomei, chuo, kanetsu, tohoku, joban, higashiKanto, keiyo,
         tateyama, kenodo, aqua, daisanKeihin, kitaKanto, joshinetsu, tokanko,
         meishin, shinMeishin, higashiMeihan, isewangan, sanyo, chugoku, kyushu,
         hanshin, nagoyaKosoku

    /// 画面と読み上げに使う名前
    var title: String {
        switch self {
        case .gaikan: return "外環"
        case .shutoko: return "首都高"
        case .tomei: return "東名"
        case .shinTomei: return "新東名"
        case .chuo: return "中央道"
        case .kanetsu: return "関越道"
        case .tohoku: return "東北道"
        case .joban: return "常磐道"
        case .higashiKanto: return "東関東道"
        case .keiyo: return "京葉道路"
        case .tateyama: return "館山道"
        case .kenodo: return "圏央道"
        case .aqua: return "アクアライン"
        case .daisanKeihin: return "第三京浜"
        case .kitaKanto: return "北関東道"
        case .joshinetsu: return "上信越道"
        case .tokanko: return "東京湾岸道路"
        case .meishin: return "名神"
        case .shinMeishin: return "新名神"
        case .higashiMeihan: return "東名阪道"
        case .isewangan: return "伊勢湾岸道"
        case .sanyo: return "山陽道"
        case .chugoku: return "中国道"
        case .kyushu: return "九州道"
        case .hanshin: return "阪神高速"
        case .nagoyaKosoku: return "名古屋高速"
        }
    }

    /// Siri が聞き取れる別の言い方
    var synonyms: [String] {
        switch self {
        case .gaikan: return ["東京外環", "外環道", "東京外環道", "外環自動車道", "がいかん"]
        case .shutoko: return ["首都高速", "首都高速道路", "しゅとこう"]
        case .tomei: return ["東名高速", "東名高速道路"]
        case .shinTomei: return ["新東名高速"]
        case .chuo: return ["中央自動車道", "中央高速"]
        case .kanetsu: return ["関越", "関越自動車道"]
        case .tohoku: return ["東北自動車道"]
        case .joban: return ["常磐自動車道", "常磐"]
        case .higashiKanto: return ["東関道", "東関東自動車道"]
        case .keiyo: return ["京葉", "京葉道"]
        case .tateyama: return ["館山自動車道"]
        case .kenodo: return ["圏央", "首都圏中央連絡自動車道"]
        case .aqua: return ["東京湾アクアライン"]
        case .daisanKeihin: return ["第三京浜道路"]
        case .kitaKanto: return ["北関東自動車道"]
        case .joshinetsu: return ["上信越自動車道"]
        case .tokanko: return ["湾岸線", "湾岸道路"]
        case .meishin: return ["名神高速"]
        case .shinMeishin: return ["新名神高速"]
        case .higashiMeihan: return ["東名阪"]
        case .isewangan: return ["伊勢湾岸"]
        case .sanyo: return ["山陽自動車道"]
        case .chugoku: return ["中国自動車道"]
        case .kyushu: return ["九州自動車道"]
        case .hanshin: return ["阪神高速道路"]
        case .nagoyaKosoku: return ["名古屋都市高速"]
        }
    }

    /// データの路線名がこの路線に当たるか
    func matches(roadName: String, routeNo: String) -> Bool {
        let name = roadName.components(separatedBy: "　").first ?? roadName
        switch self {
        case .gaikan: return name.hasPrefix("東京外環道")
        case .shutoko: return routeNo.hasPrefix("20")   // 首都高の路線番号は 20 から始まる
        case .hanshin: return routeNo.hasPrefix("21")
        case .nagoyaKosoku: return routeNo.hasPrefix("22")
        case .tomei: return name.hasPrefix("東名") && !name.hasPrefix("東名阪")
        case .shinTomei: return name.hasPrefix("新東名")
        case .chuo: return name.hasPrefix("中央道")
        case .kanetsu: return name.hasPrefix("関越道")
        case .tohoku: return name.hasPrefix("東北道")
        case .joban: return name.hasPrefix("常磐道")
        case .higashiKanto: return name.hasPrefix("東関東道")
        case .keiyo: return name.hasPrefix("京葉道路")
        case .tateyama: return name.hasPrefix("館山道")
        case .kenodo: return name.hasPrefix("圏央道")
        case .aqua: return name.contains("アクアライン")
        case .daisanKeihin: return name.hasPrefix("第三京浜")
        case .kitaKanto: return name.hasPrefix("北関東道")
        case .joshinetsu: return name.hasPrefix("上信越道")
        case .tokanko: return name.hasPrefix("高速湾岸線") || name.hasPrefix("湾岸分岐線")
        case .meishin: return name.hasPrefix("名神")
        case .shinMeishin: return name.hasPrefix("新名神")
        case .higashiMeihan: return name.hasPrefix("東名阪")
        case .isewangan: return name.hasPrefix("伊勢湾岸")
        case .sanyo: return name.hasPrefix("山陽道")
        case .chugoku: return name.hasPrefix("中国道")
        case .kyushu: return name.hasPrefix("九州道")
        }
    }

    /// 文章から路線を探す（「外環の渋滞」→ .gaikan）
    static func find(in text: String) -> Road? {
        let t = TrafficText.normalize(text)
        var best: (Road, Int)?
        for road in Road.allCases {
            for word in [road.title] + road.synonyms where t.contains(TrafficText.normalize(word)) {
                if best == nil || word.count > best!.1 { best = (road, word.count) }
            }
        }
        return best?.0
    }
}

// MARK: - 交通情報の1件

enum TrafficKind: String, Codable, Sendable {
    case closure      // 通行止め
    case incident     // 事故・故障車・落下物など
    case jam          // 渋滞
    case regulation   // 工事などの規制
    case icClosed     // 出入口閉鎖
    case sapa         // SA/PA の混雑
}

struct TrafficItem: Identifiable, Hashable, Codable, Sendable {
    var id: String { key }
    let kind: TrafficKind
    let roadName: String      // 例: 東京外環道
    let routeNo: String
    let direction: String     // 例: 内回
    let place: String         // 例: 草加ＩＣ付近 / 白糠ＩＣ→浦幌ＩＣ
    let cause: String         // 例: 事故 / 故障車 / 工事
    let regulation: String    // 例: 第１走行規制
    let lengthKm: Double?     // 渋滞の長さ
    /// 位置（[経度, 緯度] の並び。デジタル地図のデータでは進む向きの順）
    var coords: [[Double]] = []

    var key: String { [kind.rawValue, routeNo, roadName, direction, place, cause, regulation, lengthKm.map { String($0) } ?? ""].joined(separator: "|") }

    /// 渋滞を抜けるまでの目安（分）。高速道路の「渋滞」は時速40km以下なので、平均時速20kmとして計算。
    var passMinutes: Int? {
        guard let km = lengthKm, km > 0 else { return nil }
        return max(1, Int((km / 20.0 * 60.0).rounded()))
    }
}

// MARK: - JARTIC データの読み取り

enum TrafficParser {
    /// 規制イベント（301）ファイル1つを読む
    static func parseEvents(_ data: Data) -> [TrafficItem] {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let features = root["features"] as? [[String: Any]] else { return [] }
        var out: [TrafficItem] = []
        for f in features {
            guard let p = f["properties"] as? [String: Any] else { continue }
            let road = str(p["r"]), rn = str(p["rn"]), d = str(p["d"]), i = str(p["i"])
            guard !road.isEmpty else { continue }
            let roadName = road.components(separatedBy: "　").first ?? road
            if let j = p["j"] as? String, let km = parseKm(j) {
                out.append(TrafficItem(kind: .jam, roadName: roadName, routeNo: rn, direction: d, place: i,
                                       cause: "", regulation: "", lengthKm: km, coords: coords(f)))
                continue
            }
            let c = str(p["c"]), rd = str(p["rd"])
            if c.isEmpty && rd.isEmpty { continue }
            let kind: TrafficKind
            if rd == "通行止" || rd == "全車線規制" { kind = .closure }
            else if TrafficText.isIncident(c) { kind = .incident }
            else { kind = .regulation }
            out.append(TrafficItem(kind: kind, roadName: roadName, routeNo: rn, direction: d, place: i,
                                   cause: c, regulation: rd, lengthKm: nil, coords: coords(f)))
        }
        return out
    }

    /// 出入口閉鎖（801）
    static func parseICClosures(_ data: Data) -> [TrafficItem] {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let features = root["features"] as? [[String: Any]] else { return [] }
        return features.compactMap { f in
            guard let p = f["properties"] as? [String: Any] else { return nil }
            let ic = str(p["ic"]), io = str(p["io"])
            guard !ic.isEmpty else { return nil }
            let road = str(p["r"])
            return TrafficItem(kind: .icClosed, roadName: road.components(separatedBy: "　").first ?? road,
                               routeNo: str(p["rn"]), direction: str(p["d"]), place: ic + io,
                               cause: "", regulation: "閉鎖", lengthKm: nil, coords: coords(f))
        }
    }

    /// SA/PA の混雑（1101）。「混雑」「満車」だけを拾う
    static func parseSAPA(_ data: Data) -> [TrafficItem] {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let features = root["features"] as? [[String: Any]] else { return [] }
        return features.compactMap { f in
            guard let p = f["properties"] as? [String: Any] else { return nil }
            let j = str(p["j"]), name = str(p["sapa"])
            guard !name.isEmpty, j.contains("混") || j.contains("満") else { return nil }
            let road = str(p["r"])
            return TrafficItem(kind: .sapa, roadName: road, routeNo: str(p["rn"]), direction: str(p["d"]),
                               place: name, cause: "", regulation: j, lengthKm: nil, coords: coords(f))
        }
    }

    /// geometry の座標をすべて取り出す（[経度, 緯度]）
    static func coords(_ f: [String: Any]) -> [[Double]] {
        guard let g = f["geometry"] as? [String: Any], let c = g["coordinates"] else { return [] }
        var out: [[Double]] = []
        func walk(_ v: Any) {
            guard let a = v as? [Any], !a.isEmpty else { return }
            if a.count >= 2, !(a[0] is [Any]), let x = (a[0] as? NSNumber)?.doubleValue, let y = (a[1] as? NSNumber)?.doubleValue {
                out.append([x, y])
            } else {
                a.forEach(walk)
            }
        }
        walk(c)
        return out
    }

    static func parseKm(_ s: String) -> Double? {
        let t = TrafficText.normalize(s).replacingOccurrences(of: "km", with: "").replacingOccurrences(of: "ｋｍ", with: "")
        return Double(t.trimmingCharacters(in: .whitespaces))
    }

    /// 重複（地図の縮尺ごとに同じ情報がある）を除いて並べる
    static func dedupe(_ items: [TrafficItem]) -> [TrafficItem] {
        var seen = Set<String>()
        var out: [TrafficItem] = []
        for it in items where seen.insert(it.key).inserted { out.append(it) }
        return out.sorted { a, b in
            let ra = rank(a.kind), rb = rank(b.kind)
            if ra != rb { return ra < rb }
            if a.kind == .jam, b.kind == .jam { return (a.lengthKm ?? 0) > (b.lengthKm ?? 0) }
            return a.place < b.place
        }
    }

    static func rank(_ k: TrafficKind) -> Int {
        switch k { case .closure: return 0; case .incident: return 1; case .jam: return 2; case .icClosed: return 3; case .regulation: return 4; case .sapa: return 5 }
    }

    /// target.json の「202611021257」→ 日付
    static func parseTarget(_ s: String) -> Date? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Asia/Tokyo")
        f.dateFormat = "yyyyMMddHHmm"
        return f.date(from: s)
    }

    private static func str(_ v: Any?) -> String {
        if let s = v as? String { return s }
        if let n = v as? NSNumber { return n.stringValue }
        if let a = v as? [String] { return a.first ?? "" }
        return ""
    }
}

// MARK: - 文章づくり（画面と Siri の読み上げ）

enum TrafficText {
    static func normalize(_ s: String) -> String {
        var t = s
        #if canImport(Darwin)
        t = t.applyingTransform(.fullwidthToHalfwidth, reverse: false) ?? t
        #endif
        let map: [Character: Character] = ["０": "0", "１": "1", "２": "2", "３": "3", "４": "4", "５": "5", "６": "6", "７": "7", "８": "8", "９": "9", "．": "."]
        t = String(t.map { map[$0] ?? $0 })
        return t.replacingOccurrences(of: "Ｊ", with: "J").replacingOccurrences(of: "Ｃ", with: "C")
            .replacingOccurrences(of: "Ｉ", with: "I").replacingOccurrences(of: "Ｔ", with: "T")
            .replacingOccurrences(of: "Ｎ", with: "N").replacingOccurrences(of: "Ｓ", with: "S")
            .replacingOccurrences(of: "Ｐ", with: "P").replacingOccurrences(of: "Ａ", with: "A")
            .replacingOccurrences(of: "ｋｍ", with: "km")
            .replacingOccurrences(of: "￫", with: "→")
    }

    /// 読み上げ用の場所（「Ａ→Ｂ」→「AからB」）
    static func spokenPlace(_ s: String) -> String {
        normalize(s).replacingOccurrences(of: "→", with: "から").replacingOccurrences(of: "～", with: "から")
    }

    static func isIncident(_ cause: String) -> Bool {
        ["事故", "故障", "落下物", "火災", "停止車", "逆走", "障害物", "動物", "緊急"].contains { cause.contains($0) }
    }

    /// 方向を読み上げやすく
    static func direction(_ d: String) -> String {
        switch d {
        case "内回": return "内回り"
        case "外回": return "外回り"
        case "上下", "内外", "南北", "東西": return "両方向"
        case "上り", "下り": return d
        case "北行", "南行", "東行", "西行": return d + "き"
        case "": return ""
        default: return d
        }
    }

    /// 規制内容 → どの車線か
    static func laneDescription(_ rd: String) -> String {
        let r = normalize(rd)
        if r.isEmpty { return "" }
        if r == "規制なし" { return "車線規制はありません" }
        if r == "通行止" || r == "全車線規制" { return "通行止めです" }
        if r.contains("追越車線") { return "追越車線（一番右の車線）が規制されています" }
        if r.contains("登坂車線") { return "登坂車線が規制されています" }
        if r.contains("路肩") { return "路肩が規制されています（走行車線は通れます）" }
        if r.contains("走行規制") || r.contains("走行車線") {
            let n = r.compactMap { $0.wholeNumberValue }.first
            if n == 1 { return "第1走行車線（一番左の車線）が規制されています" }
            if let n { return "第\(n)走行車線（左から\(n)番目の車線）が規制されています" }
            return "走行車線が規制されています"
        }
        if let n = r.compactMap({ $0.wholeNumberValue }).first, r.contains("車線規制") {
            return "\(n)車線が規制されています（どの車線かは発表されていません）"
        }
        if r == "車線規制" { return "車線規制があります（どの車線かは発表されていません）" }
        if r == "対面通行" { return "対面通行です" }
        if r == "片側交互通行" { return "片側交互通行です" }
        if r.contains("キロ規制") { return "速度規制（\(r.replacingOccurrences(of: "キロ規制", with: ""))キロ）があります" }
        if r == "その他規制" { return "規制があります" }
        return r
    }

    /// 1件を文章に
    static func sentence(_ it: TrafficItem, includeRoad: Bool = false) -> String {
        let road = includeRoad ? normalize(it.roadName) + "、" : ""
        let dir = direction(it.direction)
        let head = road + (dir.isEmpty ? "" : dir + "、") + spokenPlace(it.place)
        switch it.kind {
        case .jam:
            let km = it.lengthKm.map { $0 == $0.rounded() ? String(Int($0)) : String($0) } ?? "?"
            let pass = it.passMinutes.map { "、抜けるまで約\($0)分" } ?? ""
            return "\(head)で\(km)キロの渋滞\(pass)。"
        case .closure:
            return "\(head)、\(it.cause.isEmpty ? "" : normalize(it.cause) + "のため")通行止め。"
        case .incident:
            return "\(head)で\(normalize(it.cause))。\(laneDescription(it.regulation))。"
        case .regulation:
            let lane = laneDescription(it.regulation)
            return "\(head)、\(it.cause.isEmpty ? "" : normalize(it.cause) + "で")\(lane.isEmpty ? "規制あり" : lane)。"
        case .icClosed:
            return "\(head)が閉鎖中。"
        case .sapa:
            return "\(head)は\(it.regulation)。"
        }
    }

    /// Siri が話す文章（長くなりすぎないよう件数を絞る）
    static func speech(road: Road, items: [TrafficItem], updated: Date?, maxRegulations: Int = 3) -> String {
        let main = items.filter { [.closure, .incident, .jam, .icClosed].contains($0.kind) }
        let regs = items.filter { $0.kind == .regulation }
        let sapa = items.filter { $0.kind == .sapa }
        var parts: [String] = []
        if main.isEmpty && regs.isEmpty {
            parts.append("\(road.title)は、今のところ渋滞や事故の情報はありません。")
        } else {
            let jams = main.filter { $0.kind == .jam }
            var summary = "\(road.title)の交通情報です。"
            if !jams.isEmpty { summary += "渋滞が\(jams.count)か所あります。" }
            parts.append(summary)
            parts += main.map { sentence($0) }
            if !regs.isEmpty {
                parts += regs.prefix(maxRegulations).map { sentence($0) }
                if regs.count > maxRegulations { parts.append("ほかに工事などの規制が\(regs.count - maxRegulations)件あります。") }
            }
        }
        if !sapa.isEmpty {
            parts.append(sapa.prefix(2).map { sentence($0) }.joined())
        }
        if let updated { parts.append("\(timeText(updated))時点の情報です。") }
        return parts.joined(separator: "")
    }

    static func timeText(_ d: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.timeZone = TimeZone(identifier: "Asia/Tokyo")
        f.dateFormat = "H時m分"
        return f.string(from: d)
    }
}
