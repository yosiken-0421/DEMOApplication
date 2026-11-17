import Foundation

/// 曲のタイアップ（アニメ・ドラマ・映画・CM など）
struct TieUp: Hashable {
    enum Kind: String {
        case anime = "アニメ"
        case drama = "ドラマ"
        case movie = "映画"
        case cm = "CM"
        case other = "番組"

        /// hits.json の tu の種類コード
        init(code: String) {
            switch code {
            case "anime": self = .anime
            case "drama": self = .drama
            case "movie": self = .movie
            case "cm": self = .cm
            default: self = .other
            }
        }

        var emoji: String {
            switch self {
            case .anime: return "📺"
            case .drama: return "🎬"
            case .movie: return "🎞️"
            case .cm: return "📣"
            case .other: return "📡"
            }
        }
    }

    let kind: Kind
    let name: String

    init(kind: Kind, name: String) {
        self.kind = kind
        self.name = name
    }

    var display: String { "\(kind.emoji) \(kind.rawValue)『\(name)』" }
}

/// 日本語版ウィキペディアの曲の記事から、タイアップの記述を探す。
/// 記事の本文に「主題歌」「オープニングテーマ」などと『作品名』が同じ文にある場合だけ採用する。
/// 見つからなければ空（何も表示しない）。
actor TieUpLookup {
    static let shared = TieUpLookup()

    private var cache: [String: [TieUp]] = [:]

    /// - animeHint: アニメの曲として出題している（作品の記事からも探す）
    func tieUps(for song: Song, animeHint: Bool = false) async -> [TieUp] {
        if let c = cache[song.id] { return c }
        networkFailed = false
        var result = Self.fromAppleNames(song)
        if !result.contains(where: { $0.kind == .anime || $0.kind == .movie }) {
            let wiki = await lookup(title: song.title, artist: song.artist)
            result = Self.merge(result, wiki)
        }
        if animeHint && !result.contains(where: { $0.kind == .anime || $0.kind == .movie }) {
            let works = await lookupWorks(title: song.title, artist: song.artist)
            result = Self.merge(works, result)
        }
        result = Array(result.prefix(3))
        // 通信に失敗して見つからなかったときは覚えておかない（次に出たときにもう一度調べる）
        if !result.isEmpty || !networkFailed { cache[song.id] = result }
        return result
    }

    private var networkFailed = false

    static func merge(_ a: [TieUp], _ b: [TieUp]) -> [TieUp] {
        var out = a
        for t in b where !out.contains(where: { TextMatch.norm($0.name) == TextMatch.norm(t.name) }) { out.append(t) }
        return out
    }

    /// Apple の曲名・アルバム名に書かれている作品名（「TVアニメ『○○』オープニングテーマ」など）
    static func fromAppleNames(_ song: Song) -> [TieUp] {
        let patterns: [(String, TieUp.Kind)] = [
            ("(?:TV|ＴＶ|テレビ)?アニメ(?:ーション)?(?:映画)?\\s*[「『]([^」』]{1,40})[」』]", .anime),
            ("劇場版\\s*[「『]([^」』]{1,40})[」』]", .movie),
            ("映画\\s*[「『]([^」』]{1,40})[」』]", .movie),
            ("ドラマ\\s*[「『]([^」』]{1,40})[」』]", .drama),
        ]
        var out: [TieUp] = []
        for text in [song.title, song.albumName ?? ""] where !text.isEmpty {
            let ns = text as NSString
            for (p, kind) in patterns {
                guard let re = try? NSRegularExpression(pattern: p) else { continue }
                for m in re.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
                    let name = ns.substring(with: m.range(at: 1)).trimmingCharacters(in: .whitespaces)
                    guard !name.isEmpty, TextMatch.core(name) != TextMatch.core(song.title) else { continue }
                    if !out.contains(where: { TextMatch.norm($0.name) == TextMatch.norm(name) }) {
                        out.append(TieUp(kind: kind, name: name))
                    }
                }
            }
        }
        return out
    }

    private static let keywords = ["主題歌", "オープニングテーマ", "エンディングテーマ", "オープニング曲", "エンディング曲",
                                   "挿入歌", "挿入曲", "劇中歌", "イメージソング", "テーマソング", "CMソング", "タイアップ", "テーマ曲",
                                   "OPテーマ", "EDテーマ", "主題曲"]
    private static let songLead = ["楽曲", "シングル", "曲", "EP", "アルバム", "主題歌", "テーマ"]

    /// 曲の記事：「曲名 (歌手名の曲)」「曲名 (曲)」「曲名」を直接開き、だめなら検索
    private func lookup(title: String, artist: String) async -> [TieUp] {
        let base = TextMatch.searchTitle(title)
        let display = TextMatch.primaryArtistDisplay(artist)
        let primary = TextMatch.primaryArtist(artist)
        guard !base.isEmpty, primary.count >= 2 else { return [] }
        let core = TextMatch.core(title)
        let direct = ["\(base) (\(display)の曲)", "\(base) (曲)", base]
        var seen: Set<String> = []
        for round in 0..<2 {
            var pages = direct
            if round == 1 {
                guard let found = await searchPages(query: "\(base) \(display)") else { break }
                pages = found.filter { TextMatch.core(Self.pageBase($0)) == core && !direct.contains($0) }.prefix(3).map { $0 }
            }
            for page in pages {
                guard let r = await extractPage(page: page) else { continue }
                let (text, resolved) = r
                guard !seen.contains(resolved) else { continue }
                seen.insert(resolved)
                let fs = Self.firstSentence(text)
                let rb = Self.pageBase(resolved)
                if TextMatch.core(rb) != core && TextMatch.core(rb.components(separatedBy: "/").first ?? rb) != core {
                    // シングルの記事（曲名とは別の記事名）に飛んだときだけ使う。アルバムは使わない
                    guard fs.contains("シングル"), !fs.contains("アルバム"),
                          text.precomposedStringWithCompatibilityMapping.contains("「" + base.precomposedStringWithCompatibilityMapping) else { continue }
                }
                guard TextMatch.norm(text).contains(primary), Self.songLead.contains(where: { fs.contains($0) }) else { continue }
                let found = Self.parse(text, title: title, artist: artist)
                if !found.isEmpty { return found }
            }
        }
        return []
    }

    private static func firstSentence(_ text: String) -> String {
        String((text.components(separatedBy: "。").first ?? "").prefix(300))
    }

    private static let workWords = ["アニメ", "漫画", "ライトノベル", "小説", "映画", "ドラマ", "ゲーム", "特撮", "作品"]
    private static let notWork = ["アルバム", "シングル", "楽曲", "歌手", "バンド", "ユニット", "グループ", "ディスコグラフィ", "声優", "作曲家", "作詞家",
                                  "音楽", "ビデオ", "チャート", "監督", "演出家", "アニメーター", "脚本家", "漫画家", "作家", "俳優", "タレント",
                                  "番組", "ラジオ", "生まれ", "会社", "言葉", "総称"]
    private static let nearWords = ["オープニング", "エンディング", "主題歌", "挿入歌", "テーマ", "OP", "ED"]

    /// 作品（アニメ・漫画・映画など）の記事から探す：本文の「曲名」の前後に歌手名と「オープニング」などがあるもの
    private func lookupWorks(title: String, artist: String) async -> [TieUp] {
        let base = TextMatch.searchTitle(title)
        let primary = TextMatch.primaryArtist(artist)
        guard !base.isEmpty, primary.count >= 2 else { return [] }
        guard let pages = await searchPages(query: "\"\(base)\" \(TextMatch.primaryArtistDisplay(artist)) 主題歌") else { return [] }
        let nbase = base.precomposedStringWithCompatibilityMapping
        var out: [TieUp] = []
        var checked = 0
        for p in pages where checked < 5 {
            let np = TextMatch.norm(p)
            if p.contains("一覧") || np.contains(primary) { continue }
            checked += 1
            guard let r = await extractPage(page: p) else { continue }
            let text = r.0
            let lead = Self.firstSentence(text)
            guard Self.workWords.contains(where: { lead.contains($0) }), !Self.notWork.contains(where: { lead.contains($0) }) else { continue }
            let nt = text.precomposedStringWithCompatibilityMapping
            var ok = false
            var search = nt.startIndex..<nt.endIndex
            while let r = nt.range(of: "「" + nbase, range: search) {
                search = r.upperBound..<nt.endIndex
                guard r.upperBound < nt.endIndex, "」〜~ (（".contains(nt[r.upperBound]) else { continue }
                let lo = nt.index(r.lowerBound, offsetBy: -250, limitedBy: nt.startIndex) ?? nt.startIndex
                let hi = nt.index(r.upperBound, offsetBy: 250, limitedBy: nt.endIndex) ?? nt.endIndex
                let win = String(nt[lo..<hi])
                if TextMatch.norm(win).contains(primary) && Self.nearWords.contains(where: { win.contains($0) }) { ok = true; break }
            }
            guard ok else { continue }
            let kind: TieUp.Kind = lead.contains("アニメ") ? .anime : lead.contains("映画") ? .movie
                : lead.contains("ドラマ") ? .drama : .anime
            let t = TieUp(kind: kind, name: Self.pageBase(p))
            if !out.contains(t) { out.append(t) }
            if out.count >= 2 { break }
        }
        return out
    }

    private static func pageBase(_ p: String) -> String {
        guard p.hasSuffix(")"), let r = p.range(of: " (", options: .backwards) else { return p }
        return String(p[..<r.lowerBound])
    }

    /// 『作品名』のすぐ後ろ（「」や（）を除いて20文字以内）か、すぐ前（20文字以内）に「主題歌」「オープニングテーマ」などがあるものだけ
    static func parse(_ text: String, title: String = "", artist: String = "") -> [TieUp] {
        var out: [TieUp] = []
        let ct = TextMatch.core(title), pa = TextMatch.primaryArtist(artist)
        let strip = try? NSRegularExpression(pattern: "「[^「」]*」|（[^（）]*）|\\([^()]*\\)")
        let sentences = text.components(separatedBy: CharacterSet(charactersIn: "。\n"))
        outer: for s in sentences where keywords.contains(where: { s.contains($0) }) {
            var rest = Substring(s)
            while let open = rest.firstIndex(of: "『"), let close = rest[open...].firstIndex(of: "』") {
                var name = String(rest[rest.index(after: open)..<close]).trimmingCharacters(in: .whitespaces)
                let before = String(rest[..<open].suffix(30))
                let afterRaw = String(rest[rest.index(after: close)...].prefix(60))
                rest = rest[rest.index(after: close)...]
                if let r = name.range(of: "（以下") ?? name.range(of: "(以下") { name = String(name[..<r.lowerBound]).trimmingCharacters(in: .whitespaces) }
                guard !name.isEmpty, name.count <= 40 else { continue }
                if !ct.isEmpty && TextMatch.core(name) == ct { continue }
                if pa.count >= 2 && TextMatch.norm(name).contains(pa) { continue }
                var after = afterRaw
                if let strip { after = strip.stringByReplacingMatches(in: afterRaw, range: NSRange(afterRaw.startIndex..., in: afterRaw), withTemplate: "") }
                after = String(after.prefix(20))
                let nearBefore = String(before.suffix(20))
                guard keywords.contains(where: { after.contains($0) })
                        || (keywords.contains(where: { nearBefore.contains($0) }) && !nearBefore.contains("『")) else { continue }
                let kind: TieUp.Kind
                if before.contains("アニメ") { kind = .anime }
                else if before.contains("ドラマ") { kind = .drama }
                else if before.contains("映画") { kind = .movie }
                else if before.contains("CM") || s.contains("CMソング") { kind = .cm }
                else if s.contains("アニメ") { kind = .anime }
                else if s.contains("ドラマ") { kind = .drama }
                else if s.contains("映画") { kind = .movie }
                else { kind = .other }
                if !out.contains(where: { TextMatch.norm($0.name) == TextMatch.norm(name) }) { out.append(TieUp(kind: kind, name: name)) }
                if out.count >= 3 { break outer }
            }
        }
        // アニメ・映画・ドラマを先に
        let order: [TieUp.Kind] = [.anime, .movie, .drama, .cm, .other]
        return out.sorted { order.firstIndex(of: $0.kind)! < order.firstIndex(of: $1.kind)! }
    }

    // MARK: Wikipedia API

    private struct SearchResp: Decodable {
        struct Q: Decodable { let search: [Item] }
        struct Item: Decodable { let title: String }
        let query: Q?
    }
    private struct ExtractResp: Decodable {
        struct Q: Decodable { let pages: [Page] }
        struct Page: Decodable { let title: String?; let extract: String?; let missing: Bool? }
        let query: Q?
    }

    private func request(_ items: [URLQueryItem]) async -> Data? {
        var comps = URLComponents(string: "https://ja.wikipedia.org/w/api.php")!
        comps.queryItems = items + [URLQueryItem(name: "format", value: "json"),
                                    URLQueryItem(name: "formatversion", value: "2")]
        guard let url = comps.url else { return nil }
        var req = URLRequest(url: url)
        req.timeoutInterval = 8
        req.setValue("IntroDonpisha/1.0 (https://github.com/yosiken-0421/DEMOApplication)", forHTTPHeaderField: "User-Agent")
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200 else { networkFailed = true; return nil }
        return data
    }

    private func searchPages(query: String) async -> [String]? {
        guard let data = await request([
            URLQueryItem(name: "action", value: "query"),
            URLQueryItem(name: "list", value: "search"),
            URLQueryItem(name: "srsearch", value: query),
            URLQueryItem(name: "srlimit", value: "8"),
        ]) else { return nil }
        return (try? JSONDecoder().decode(SearchResp.self, from: data))?.query?.search.map(\.title)
    }

    private var extractCache: [String: (String, String)] = [:]

    /// (本文, リダイレクト後の記事名)
    private func extractPage(page: String) async -> (String, String)? {
        if let c = extractCache[page] { return c }
        guard let data = await request([
            URLQueryItem(name: "action", value: "query"),
            URLQueryItem(name: "prop", value: "extracts"),
            URLQueryItem(name: "explaintext", value: "1"),
            URLQueryItem(name: "redirects", value: "1"),
            URLQueryItem(name: "titles", value: page),
        ]) else { return nil }
        guard let p = (try? JSONDecoder().decode(ExtractResp.self, from: data))?.query?.pages.first,
              p.missing != true, let text = p.extract, !text.isEmpty else { return nil }
        let r = (text, p.title ?? page)
        extractCache[page] = r
        if extractCache.count > 200 { extractCache.removeAll() }
        return r
    }
}
