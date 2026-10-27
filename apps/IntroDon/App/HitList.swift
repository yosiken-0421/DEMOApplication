import Foundation

/// アプリに同梱しているヒット曲リスト（Resources/hits.json）
/// - 1970〜2007年: オリコン年間シングルランキング上位（2002年は年間売上ランキング）
/// - 2008〜2025年: Billboard JAPAN 年間 HOT 100 上位
/// - 洋楽: 米 Billboard Hot 100 で1位になった曲
struct HitSong: Decodable, Hashable {
    let t: String   // 曲名
    let a: String   // 歌手
    let y: Int      // ランキングの年
    let r: Int      // 順位
    let w: Int      // 1 = 洋楽
    let s: String   // 出典
    let g: String?  // "anime" = アニソンのランキング・投票に入った曲
    let an: String? // アニメ・作品名（出典に書かれているもの）
    let eh: String? // 年が不明な曲の時代（showa / heisei / reiwa）
    let s2: String? // 2つ目の出典（アニソンのランキング）

    var western: Bool { w == 1 }
    var isAnime: Bool { g == "anime" }
    var year: Int? { y > 0 ? y : nil }
    var animeName: String? { (an?.isEmpty == false) ? an : nil }

    /// 年が不明な曲が、指定の年代に入りうるか（昭和・平成・令和の情報で判定）
    func mayBeIn(_ era: Era) -> Bool {
        guard let r = era.years else { return true }
        if let y = year { return r.contains(y) }
        let span: ClosedRange<Int>
        switch eh {
        case "showa": span = 1926...1989
        case "heisei": span = 1989...2019
        case "reiwa": span = 2019...2100
        default: return true
        }
        return span.overlaps(r)
    }
    var key: String { TextMatch.norm(t) + "|" + TextMatch.norm(a) }
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

    static func filtered(genre: Genre, era: Era) -> [HitSong] {
        all.filter { h in
            if genre == .anime && !h.isAnime { return false }
            return genre.allowsHit(western: h.western) && h.mayBeIn(era)
        }
    }

    /// 曲名と歌手からヒット曲リストの1曲を探す
    static func find(title: String, artist: String) -> HitSong? {
        let c = TextMatch.core(title)
        guard !c.isEmpty, let list = byTitle[c] else { return nil }
        return list.first { $0.a.isEmpty ? $0.isAnime : TextMatch.artistMatches(artist, $0.a) }
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

    /// 歌手名の主要部分（feat. / with / & / × などより前）
    static func primaryArtist(_ a: String) -> String {
        var s = a.precomposedStringWithCompatibilityMapping
        for sep in [" feat", " Feat", " featuring", " with ", " With ", "&", "×", "、", ",", " and ", "/"] {
            if let r = s.range(of: sep), r.lowerBound > s.startIndex {
                s = String(s[..<r.lowerBound])
            }
        }
        return norm(s)
    }

    static func artistMatches(_ a: String, _ b: String) -> Bool {
        let na = norm(a), nb = norm(b)
        if na.isEmpty || nb.isEmpty { return false }
        if na == nb || na.contains(nb) || nb.contains(na) { return true }
        let pa = primaryArtist(a), pb = primaryArtist(b)
        guard pa.count >= 2, pb.count >= 2 else { return false }
        return na.contains(pb) || nb.contains(pa)
    }

    static func titleMatches(_ a: String, _ b: String) -> Bool {
        let ca = core(a), cb = core(b)
        guard !ca.isEmpty, !cb.isEmpty else { return false }
        return ca == cb
    }
}
