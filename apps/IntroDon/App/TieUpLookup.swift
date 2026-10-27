import Foundation

/// 曲のタイアップ（アニメ・ドラマ・映画・CM など）
struct TieUp: Hashable {
    enum Kind: String {
        case anime = "アニメ"
        case drama = "ドラマ"
        case movie = "映画"
        case cm = "CM"
        case other = "番組"

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

    var display: String { "\(kind.emoji) \(kind.rawValue)『\(name)』" }
}

/// 日本語版ウィキペディアの曲の記事から、タイアップの記述を探す。
/// 記事の本文に「主題歌」「オープニングテーマ」などと『作品名』が同じ文にある場合だけ採用する。
/// 見つからなければ空（何も表示しない）。
actor TieUpLookup {
    static let shared = TieUpLookup()

    private var cache: [String: [TieUp]] = [:]

    func tieUps(for song: Song) async -> [TieUp] {
        if let c = cache[song.id] { return c }
        let r = await lookup(title: song.title, artist: song.artist)
        cache[song.id] = r
        return r
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
              (resp as? HTTPURLResponse)?.statusCode == 200 else { return nil }
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
