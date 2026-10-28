import Foundation

/// アプリに同梱しているヒット曲リスト（Resources/hits.json）
/// - 1970〜2007年: オリコン年間シングルランキング上位（2002年は年間売上ランキング）
/// - 2008〜2025年: Billboard JAPAN 年間 HOT 100 上位
/// - 洋楽: 米 Billboard Hot 100 で1位になった曲
/// - アニメ: Billboard JAPAN 年間 Hot Animation、NHK・テレビ朝日のアニソンランキング
/// id / ag / aa / ry / ms は GitHub Actions「イントロどんぴしゃ 曲データの照合」で Apple の曲データから書き込む
struct HitSong: Decodable, Hashable {
    let t: String   // 曲名
    let a: String   // 歌手
    let y: Int      // ランキングの年（0 = 不明）
    let r: Int      // 順位（0 = 投票企画など順位なし）
    let w: Int      // 1 = 洋楽（米 Billboard の1位曲）
    let s: String   // 出典
    let g: String?  // "anime" = アニソンのランキング・投票に入った曲
    let an: String? // アニメ・作品名（出典に書かれているもの）
    let eh: String? // 年が不明な曲の時代（showa / heisei / reiwa）
    let s2: String? // 2つ目の出典（アニソンのランキング）
    let id: Int?    // Apple の原曲の trackId
    let ag: String? // Apple のジャンル名
    let aa: String? // Apple の歌手名
    let ry: Int?    // Apple の発売年
    let ms: Int?    // 曲の長さ（ミリ秒）

    var western: Bool { w == 1 }
    var isAnime: Bool { g == "anime" }
    var animeName: String? { (an?.isEmpty == false) ? an : nil }
    var artist: String { a.isEmpty ? (aa ?? "") : a }

    /// 年代分けに使う年：ランキングの年。不明なら Apple の発売年
    var year: Int? {
        if y > 0 { return y }
        if let ry, ry > 0 { return ry }
        return nil
    }

    /// 指定の年の範囲に入るか（年が不明な曲は昭和・平成・令和の情報で判定）
    func isIn(_ range: ClosedRange<Int>?) -> Bool {
        guard let range else { return true }
        if let year { return range.contains(year) }
        switch eh {
        case "showa": return (1926...1989).overlaps(range)
        case "heisei": return (1989...2019).overlaps(range)
        case "reiwa": return (2019...2100).overlaps(range)
        default: return false
        }
    }

    /// この曲が入るジャンル（Apple のジャンル名と、出典の種類で決める）
    var genres: Set<Genre> {
        var set: Set<Genre> = [.all]
        let gname = Genre.normalize(ag)
        if western { set.insert(.westernPop) }
        if isAnime || Genre.anime.aliases.contains(gname) { set.insert(.anime) }
        for x in [Genre.rock, .hiphop, .dance] where x.aliases.contains(gname) { set.insert(x) }
        if !western {
            if Genre.enka.aliases.contains(gname) { set.insert(.enka) }
            if Genre.jpop.aliases.contains(gname) || Genre.anime.aliases.contains(gname) { set.insert(.jpop) }
        }
        return set
    }

    /// 有名度の重み（年間ランキング上位ほど出やすい）
    func fameWeight(for genre: Genre) -> Double {
        if r == 0 { return 5 }                       // アニソンの投票・ランキング企画
        if western { return genre == .all ? 1 : 3 }  // 米 Billboard 1位（全ジャンルでは日本の曲を優先）
        switch r {
        case 1...10: return 6
        case 11...20: return 3
        default: return 1.5
        }
    }

    var key: String { TextMatch.norm(t) + "|" + TextMatch.norm(a) + "|\(y)" }
}

enum HitList {
    static let all: [HitSong] = {
        guard let url = Bundle.main.url(forResource: "hits", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let list = try? JSONDecoder().decode([HitSong].self, from: data) else { return [] }
        return list
    }()

    /// 曲名（サブタイトル抜き）→ ヒット曲
    static let byTitle: [String: [HitSong]] = {
        var d: [String: [HitSong]] = [:]
        for h in all { d[TextMatch.core(h.t), default: []].append(h) }
        return d
    }()

    static func filtered(genre: Genre, years: ClosedRange<Int>?, playableOnly: Bool) -> [HitSong] {
        all.filter { h in
            (!playableOnly || h.id != nil) && h.genres.contains(genre) && h.isIn(years)
        }
    }

    /// 有名な曲ほど前に来るように並べる（重み付きシャッフル）
    static func weightedShuffle(_ hits: [HitSong], genre: Genre) -> [HitSong] {
        hits.map { h -> (HitSong, Double) in
            let u = Double.random(in: 0.000001..<1)
            return (h, pow(u, 1 / h.fameWeight(for: genre)))
        }
        .sorted { $0.1 > $1.1 }
        .map(\.0)
    }

    /// 曲名と歌手からヒット曲リストの1曲を探す
    static func find(title: String, artist: String) -> HitSong? {
        let c = TextMatch.core(title)
        guard !c.isEmpty, let list = byTitle[c] else { return nil }
        return list.first { h in
            if h.a.isEmpty {
                guard let aa = h.aa, !aa.isEmpty else { return false }
                return TextMatch.artistMatches(artist, aa)
            }
            return TextMatch.artistMatches(artist, h.a) || (h.aa.map { TextMatch.artistMatches(artist, $0) } ?? false)
        }
    }
}

/// 表記ゆれを吸収して曲名・歌手を照合する
enum TextMatch {
    private static let removeSet: CharacterSet = {
        var s = CharacterSet.whitespacesAndNewlines
        s.formUnion(.punctuationCharacters)
        s.formUnion(.symbols)
        s.insert(charactersIn: "・〜~ー-‐―☆★♥♡")
        return s
    }()

    static func norm(_ s: String) -> String {
        let n = s.precomposedStringWithCompatibilityMapping.lowercased()
        return String(String.UnicodeScalarView(n.unicodeScalars.filter { !removeSet.contains($0) }))
    }

    /// 曲名の「本体」：（）内や「〜」「 -」以降のサブタイトル、「/」以降の両A面を除く
    static func core(_ title: String) -> String {
        var t = title.precomposedStringWithCompatibilityMapping
        for sep in [" / ", "/", "〜", "~", " -", "(", "（", "【", " feat", " Feat"] {
            if let r = t.range(of: sep), r.lowerBound > t.startIndex {
                t = String(t[..<r.lowerBound])
            }
        }
        let n = norm(t)
        return n.isEmpty ? norm(title) : n
    }

    private static let artistSeps = [" feat", " Feat", " featuring", " with ", " With ", "&", "×", "、", ",", " and ", "/", " x ", " X "]

    /// 歌手名の主要部分（feat. / with / & / × などより前）
    static func primaryArtist(_ a: String) -> String {
        var s = a.precomposedStringWithCompatibilityMapping
        for sep in artistSeps {
            if let r = s.range(of: sep), r.lowerBound > s.startIndex {
                s = String(s[..<r.lowerBound])
            }
        }
        return norm(s)
    }

    /// 歌手の一致判定。短い名前（「嵐」「AI」など）は完全一致だけ。
    /// 3文字以上の主要部分なら、片方に含まれていれば一致（「ぴんからトリオ」と「宮史郎とぴんからトリオ」など）
    static func artistMatches(_ a: String, _ b: String) -> Bool {
        let na = norm(a), nb = norm(b)
        if na.isEmpty || nb.isEmpty { return false }
        if na == nb { return true }
        let pa = primaryArtist(a), pb = primaryArtist(b)
        if !pa.isEmpty && (pa == pb || pa == nb) { return true }
        if !pb.isEmpty && pb == na { return true }
        if pa.count >= 3 && nb.contains(pa) { return true }
        if pb.count >= 3 && na.contains(pb) { return true }
        return false
    }

    static func titleMatches(_ a: String, _ b: String) -> Bool {
        let ca = core(a), cb = core(b)
        guard !ca.isEmpty, !cb.isEmpty else { return false }
        return ca == cb
    }
}
