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
                                   "挿入歌", "イメージソング", "テーマソング", "CMソング", "タイアップ", "テーマ曲"]

    private func lookup(title: String, artist: String) async -> [TieUp] {
        let base = TextMatch.searchTitle(title)
        guard let pages = await searchPages(query: "\(base) \(TextMatch.primaryArtistDisplay(artist))") else { return [] }
        let core = TextMatch.core(title)
        // 記事名が曲名と一致するもの（「曲名 (歌手名の曲)」のような曖昧さ回避つきも可）
        let candidates = pages.filter { p in
            let name = p.components(separatedBy: " (").first ?? p
            return TextMatch.core(name) == core
        }
        for page in candidates.prefix(3) {
            guard let text = await extract(page: page) else { continue }
            // 記事がその歌手の曲であることを確認
            let primary = TextMatch.primaryArtist(artist)
            guard primary.count >= 2, TextMatch.norm(text).contains(primary) else { continue }
            let found = Self.parse(text)
            if !found.isEmpty { return found }
        }
        return []
    }

    private static let workWords = ["アニメ", "漫画", "ライトノベル", "小説", "映画", "ドラマ", "ゲーム", "特撮", "作品"]
    private static let notWork = ["アルバム", "シングル", "楽曲", "歌手", "バンド", "ユニット", "グループ", "ディスコグラフィ", "声優", "作曲家", "作詞家"]
    private static let nearWords = ["オープニング", "エンディング", "主題歌", "挿入歌", "テーマ", "OP", "ED"]

    /// 作品（アニメ・漫画・映画など）の記事から探す：本文の「曲名」の前後に歌手名と「オープニング」などがあるもの
    private func lookupWorks(title: String, artist: String) async -> [TieUp] {
        let base = TextMatch.searchTitle(title)
        let primary = TextMatch.primaryArtist(artist)
        guard !base.isEmpty, primary.count >= 2 else { return [] }
        guard let pages = await searchPages(query: "\"\(base)\" \(TextMatch.primaryArtistDisplay(artist)) 主題歌") else { return [] }
        let core = TextMatch.core(title)
        let nbase = base.precomposedStringWithCompatibilityMapping
        var out: [TieUp] = []
        var checked = 0
        for p in pages where checked < 5 {
            let np = TextMatch.norm(p)
            if p.contains("一覧") || np.contains(primary) || TextMatch.core(Self.pageBase(p)) == core { continue }
            checked += 1
            guard let text = await extract(page: p) else { continue }
            let lead = String((text.components(separatedBy: "。").first ?? "").prefix(300))
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

    static func parse(_ text: String) -> [TieUp] {
        var out: [TieUp] = []
        let sentences = text.components(separatedBy: CharacterSet(charactersIn: "。\n"))
        for s in sentences where keywords.contains(where: { s.contains($0) }) {
            var rest = Substring(s)
            while let open = rest.firstIndex(of: "『"), let close = rest[open...].firstIndex(of: "』") {
                let name = String(rest[rest.index(after: open)..<close]).trimmingCharacters(in: .whitespaces)
                let before = String(rest[..<open].suffix(30))
                rest = rest[rest.index(after: close)...]
                guard !name.isEmpty, name.count <= 40 else { continue }
                let kind: TieUp.Kind
                if before.contains("アニメ") { kind = .anime }
                else if before.contains("ドラマ") { kind = .drama }
                else if before.contains("映画") { kind = .movie }
                else if before.contains("CM") || s.contains("CMソング") { kind = .cm }
                else if s.contains("アニメ") { kind = .anime }
                else if s.contains("ドラマ") { kind = .drama }
                else if s.contains("映画") { kind = .movie }
                else { kind = .other }
                let t = TieUp(kind: kind, name: name)
                if !out.contains(t) { out.append(t) }
                if out.count >= 3 { return out }
            }
        }
        // アニメ・ドラマ・映画を先に
        let order: [TieUp.Kind] = [.anime, .drama, .movie, .cm, .other]
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
        struct Page: Decodable { let extract: String? }
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

    private func extract(page: String) async -> String? {
        guard let data = await request([
            URLQueryItem(name: "action", value: "query"),
            URLQueryItem(name: "prop", value: "extracts"),
            URLQueryItem(name: "explaintext", value: "1"),
            URLQueryItem(name: "titles", value: page),
        ]) else { return nil }
        return (try? JSONDecoder().decode(ExtractResp.self, from: data))?.query?.pages.first?.extract
    }
}
