import Foundation
import MediaPlayer
import StoreKit

enum SongProviderError: LocalizedError {
    case libraryDenied
    case notEnoughSongs(found: Int)
    case network(String)
    case appleMusicUnavailable

    var errorDescription: String? {
        switch self {
        case .libraryDenied:
            return "ミュージックへのアクセスが許可されていません。設定アプリ →「イントロどんぴしゃ」→「メディアとApple Music」をオンにしてください。"
        case .notEnoughSongs(let n):
            return "条件に合う曲が\(n)曲しか見つかりませんでした（4曲以上必要）。年代・ジャンル・有名/マイナーの条件をゆるめてください。"
        case .network(let msg):
            return "曲の情報を取得できませんでした（\(msg)）。通信状態を確認してください。"
        case .appleMusicUnavailable:
            return "Apple Musicの曲を再生できる状態ではありません（未加入、または許可されていません）。「iPhoneのミュージック」か「試聴音源」を選んでください。"
        }
    }
}

/// 出題候補。ヒット曲リストの曲は、出題する直前に Apple の曲データと照合して再生できる形（Song）にする。
struct Candidate: Hashable, Identifiable {
    let id: String
    let title: String
    let artist: String
    let year: Int?
    let hit: HitSong?
    var song: Song?

    var isHit: Bool { hit != nil }
}

/// 1回のクイズで使う曲の山
struct QuizPlan {
    var famous: [Candidate]
    var minor: [Candidate]
    /// 実際に使った年の範囲（曲が少なくて広げたときは広げた範囲）
    var years: ClosedRange<Int>? = nil
    /// 年代を広げたときのお知らせ
    var note: String? = nil

    var total: Int { famous.count + minor.count }
}

enum SongProvider {

    // MARK: 許可

    static func requestLibraryAccess() async -> Bool {
        let current = MPMediaLibrary.authorizationStatus()
        if current == .authorized { return true }
        if current == .denied || current == .restricted { return false }
        return await withCheckedContinuation { cont in
            MPMediaLibrary.requestAuthorization { status in
                cont.resume(returning: status == .authorized)
            }
        }
    }

    /// Apple Music のカタログ曲を再生できるか（加入者か）を確認する
    static func canPlayAppleMusicCatalog() async -> Bool {
        guard await requestLibraryAccess() else { return false }
        let cloudStatus: SKCloudServiceAuthorizationStatus = await withCheckedContinuation { cont in
            SKCloudServiceController.requestAuthorization { cont.resume(returning: $0) }
        }
        guard cloudStatus == .authorized else { return false }
        let controller = SKCloudServiceController()
        return await withCheckedContinuation { cont in
            controller.requestCapabilities { caps, error in
                cont.resume(returning: error == nil && caps.contains(.musicCatalogPlayback))
            }
        }
    }

    // MARK: 曲の山を作る

    static func makePlan(settings: QuizSettings) async throws -> QuizPlan {
        let plan: QuizPlan
        switch settings.source {
        case .library:
            guard await requestLibraryAccess() else { throw SongProviderError.libraryDenied }
            plan = libraryPlan(settings: settings)
        case .appleMusic:
            guard await canPlayAppleMusicCatalog() else { throw SongProviderError.appleMusicUnavailable }
            plan = try await catalogPlan(settings: settings)
        case .preview:
            plan = try await catalogPlan(settings: settings)
        }
        let usable = usableCount(plan, fame: settings.fame)
        if usable < 4 { throw SongProviderError.notEnoughSongs(found: usable) }
        return plan
    }

    private static func usableCount(_ p: QuizPlan, fame: Fame) -> Int {
        switch fame {
        case .famous: return p.famous.count
        case .minor: return p.minor.count
        case .mix: return p.total
        }
    }

    /// 出題に必要な曲数（答えにならなかった曲の分の余裕を含む）
    static func needed(_ settings: QuizSettings) -> Int { settings.questionCount + 4 }

    /// 選んだ年代で曲が足りないときは、前後に5年ずつ広げる
    static func widen<T>(_ base: ClosedRange<Int>?, need: Int, count: (ClosedRange<Int>?) -> (Int, T)) -> (T, ClosedRange<Int>?, String?) {
        var r = base
        var (n, value) = count(r)
        guard var cur = base else { return (value, nil, nil) }
        while n < need && (cur.lowerBound > 1965 || cur.upperBound < 2030) {
            cur = (cur.lowerBound - 5)...(cur.upperBound + 5)
            r = cur
            (n, value) = count(r)
        }
        if let r, r != base {
            let lo = max(r.lowerBound, 1970), hi = min(r.upperBound, Calendar.current.component(.year, from: Date()))
            return (value, r, "この年代・ジャンルの曲が少ないため、\(lo)年〜\(hi)年の曲も出題します")
        }
        return (value, r, nil)
    }

    // MARK: iPhone のミュージック

    /// ライブラリ曲の再生用（ID → MPMediaItem）
    nonisolated(unsafe) static var libraryItems: [UInt64: MPMediaItem] = [:]

    static func libraryPlan(settings: QuizSettings) -> QuizPlan {
        let items = MPMediaQuery.songs().items ?? []
        let calendar = Calendar(identifier: .gregorian)
        let westernArtists = Set(HitList.all.filter(\.western).map { TextMatch.primaryArtist($0.artist) })
        var famousAll: [(Candidate, Double)] = []
        var minorAll: [Candidate] = []
        var seen = Set<String>()
        var cache: [UInt64: MPMediaItem] = [:]

        for item in items {
            guard item.mediaType.contains(.music), let title = item.title, !title.isEmpty else { continue }
            let artist = item.artist ?? "不明なアーティスト"
            let key = TextMatch.core(title) + "|" + TextMatch.primaryArtist(artist)
            guard !seen.contains(key) else { continue }
            seen.insert(key)

            let year = item.releaseDate.map { calendar.component(.year, from: $0) }
            let pid = item.persistentID
            let song = Song(id: "lib-\(pid)", title: title, artist: artist, year: year,
                            genreName: item.genre, trackCount: item.albumTrackCount > 0 ? item.albumTrackCount : nil,
                            storeID: nil, previewURL: nil, storeURL: nil, artworkURL: nil,
                            libraryID: pid, durationSeconds: item.playbackDuration > 0 ? item.playbackDuration : nil)

            if let hit = HitList.find(title: title, artist: artist) {
                let genreOK = hit.genres.contains(settings.genre)
                    || (settings.genre != .westernPop && settings.genre != .anime && settings.genre.matches(item.genre))
                guard genreOK else { continue }
                cache[pid] = item
                let u = Double.random(in: 0.000001..<1)
                famousAll.append((Candidate(id: song.id, title: hit.t, artist: hit.a.isEmpty ? artist : hit.a,
                                            year: hit.year ?? year, hit: hit, song: song),
                                  pow(u, 1 / hit.fameWeight(for: settings.genre))))
            } else {
                let genreOK: Bool
                if settings.genre == .westernPop {
                    genreOK = westernArtists.contains(TextMatch.primaryArtist(artist))
                } else {
                    genreOK = settings.genre.matches(item.genre)
                }
                guard genreOK else { continue }
                cache[pid] = item
                minorAll.append(Candidate(id: song.id, title: title, artist: artist, year: year, hit: nil, song: song))
            }
        }
        libraryItems = cache
        let famousSorted = famousAll.sorted { $0.1 > $1.1 }.map(\.0)
        let minorShuffled = minorAll.shuffled()

        func inRange(_ c: Candidate, _ r: ClosedRange<Int>?) -> Bool {
            guard let r else { return true }
            if let h = c.hit { return h.isIn(r) || (c.year.map { r.contains($0) } ?? false) }
            return c.year.map { r.contains($0) } ?? false
        }
        let (lists, years, note) = widen(settings.era.years, need: needed(settings)) { r -> (Int, ([Candidate], [Candidate])) in
            let f = famousSorted.filter { inRange($0, r) }
            let m = minorShuffled.filter { inRange($0, r) }
            let n: Int
            switch settings.fame {
            case .famous: n = f.count
            case .minor: n = m.count
            case .mix: n = f.count + m.count
            }
            return (n, (f, m))
        }
        return QuizPlan(famous: lists.0, minor: lists.1, years: years, note: note)
    }

    // MARK: Apple のカタログ（iTunes Search API）

    struct Track: Decodable {
        let kind: String?
        let trackId: Int?
        let trackName: String?
        let artistName: String?
        let collectionName: String?
        let trackCount: Int?
        let trackTimeMillis: Double?
        let releaseDate: String?
        let primaryGenreName: String?
        let previewUrl: String?
        let trackViewUrl: String?
        let artworkUrl100: String?
    }
    struct SearchResponse: Decodable { let results: [Track] }

    static func catalogPlan(settings: QuizSettings) async throws -> QuizPlan {
        let need = needed(settings)
        // 有名な曲：Apple の原曲が確認できているヒット曲
        let (hits, years, note) = widen(settings.era.years, need: need) { r -> (Int, [HitSong]) in
            let h = HitList.filtered(genre: settings.genre, years: r, playableOnly: true)
            return (h.count, h)
        }
        let ordered = HitList.weightedShuffle(hits, genre: settings.genre)
        let famous = ordered.map { h in
            Candidate(id: "hit-" + h.key, title: h.t, artist: h.artist, year: h.year, hit: h, song: nil)
        }
        var minor: [Candidate] = []
        var minorYears = years
        var minorNote: String?
        if settings.fame != .famous {
            (minor, minorYears, minorNote) = try await minorCandidates(settings: settings, hits: ordered, years: years)
        }
        let finalYears = settings.fame == .minor ? minorYears : years
        let finalNote = settings.fame == .minor ? (minorNote ?? note) : (note ?? minorNote)
        return QuizPlan(famous: settings.fame == .minor ? [] : famous, minor: minor.shuffled(),
                        years: finalYears, note: finalNote)
    }

    /// マイナー曲：その年代・ジャンルのヒット歌手の、ランキングに入っていない曲
    private static func minorCandidates(settings: QuizSettings, hits: [HitSong], years: ClosedRange<Int>?)
        async throws -> ([Candidate], ClosedRange<Int>?, String?) {
        var artists: [(name: String, western: Bool)] = []
        for h in hits where !h.artist.isEmpty {
            let a = h.artist
            if !artists.contains(where: { TextMatch.artistMatches($0.name, a) }) { artists.append((a, h.western)) }
            if artists.count >= 8 { break }
        }
        let needPreview = settings.source == .preview
        var pool: [Song] = []
        var anySuccess = false
        var lastError: String?

        for a in artists {
            do {
                let tracks = try await search(term: TextMatch.primaryArtistDisplay(a.name), attribute: "artistTerm",
                                              limit: 100, lang: a.western ? "en_us" : "ja_jp")
                anySuccess = true
                for t in tracks {
                    if let song = makeSong(t, needPreview: needPreview), TextMatch.artistMatches(song.artist, a.name) {
                        pool.append(song)
                    }
                }
            } catch { lastError = error.localizedDescription }
        }
        for seed in settings.genre.searchSeeds {
            do {
                let tracks = try await search(term: seed, attribute: nil, limit: 200,
                                              lang: settings.genre == .westernPop ? "en_us" : "ja_jp")
                anySuccess = true
                pool.append(contentsOf: tracks.compactMap { makeSong($0, needPreview: needPreview) })
            } catch { lastError = error.localizedDescription }
        }
        if !anySuccess { throw SongProviderError.network(lastError ?? "不明なエラー") }

        // ヒット曲・ジャンル違い・カバー等を除く
        let base = pool.filter { song in
            HitList.find(title: song.title, artist: song.artist) == nil
                && settings.genre.matches(song.genreName)
                && !isAltVersion(song.title)
        }
        let (list, r, note) = widen(years, need: needed(settings)) { r -> (Int, [Candidate]) in
            var seen = Set<String>()
            var out: [Candidate] = []
            for song in base {
                if let r {
                    guard let y = song.year, (r.lowerBound - 2)...(r.upperBound + 2) ~= y else { continue }
                }
                let key = TextMatch.core(song.title) + "|" + TextMatch.primaryArtist(song.artist)
                guard !seen.contains(key) else { continue }
                seen.insert(key)
                out.append(Candidate(id: song.id, title: song.title, artist: song.artist, year: song.year, hit: nil, song: song))
            }
            return (out.count, out)
        }
        return (list, r, note)
    }

    /// ライブ・カラオケ・インスト等の別バージョン
    static func isAltVersion(_ title: String) -> Bool {
        let t = title.lowercased()
        let words = ["live", "instrumental", "inst.", "karaoke", "off vocal", "remix", "cover", "tv size", "tv ver",
                     "ライブ", "インスト", "カラオケ", "オフボーカル", "オルゴール", "リミックス", "カバー", "tvサイズ"]
        return words.contains { t.contains($0) }
    }

    /// 出題する曲を再生できる形にする。ヒット曲は、照合済みの原曲 ID で Apple から最新の情報を取る
    static func resolve(_ c: Candidate, settings: QuizSettings) async -> Song? {
        if let s = c.song { return s }
        guard let id = c.hit?.id, let t = await TrackLookup.shared.track(id) else { return nil }
        return makeSong(t, needPreview: settings.source == .preview, overrideYear: c.year)
    }

    static func makeSong(_ t: Track, needPreview: Bool, overrideYear: Int? = nil) -> Song? {
        guard t.kind == nil || t.kind == "song",
              let id = t.trackId, let title = t.trackName, let artist = t.artistName else { return nil }
        let preview = t.previewUrl.flatMap(URL.init(string:))
        if needPreview && preview == nil { return nil }
        return Song(
            id: "am-\(id)", title: title, artist: artist,
            year: overrideYear ?? t.releaseDate.flatMap { Int($0.prefix(4)) },
            genreName: t.primaryGenreName, trackCount: t.trackCount,
            storeID: String(id), previewURL: preview,
            storeURL: t.trackViewUrl.flatMap(URL.init(string:)),
            artworkURL: t.artworkUrl100.flatMap { URL(string: $0.replacingOccurrences(of: "100x100", with: "300x300")) },
            libraryID: nil,
            durationSeconds: t.trackTimeMillis.map { $0 / 1000 })
    }

    static func search(term: String, attribute: String?, limit: Int, lang: String = "ja_jp") async throws -> [Track] {
        var comps = URLComponents(string: "https://itunes.apple.com/search")!
        var items = [
            URLQueryItem(name: "term", value: term),
            URLQueryItem(name: "country", value: "JP"),
            URLQueryItem(name: "media", value: "music"),
            URLQueryItem(name: "entity", value: "song"),
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "lang", value: lang),
        ]
        if let attribute { items.append(URLQueryItem(name: "attribute", value: attribute)) }
        comps.queryItems = items
        var req = URLRequest(url: comps.url!)
        req.timeoutInterval = 20
        let (data, response) = try await URLSession.shared.data(for: req)
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
            throw SongProviderError.network("HTTP \(http.statusCode)")
        }
        return try JSONDecoder().decode(SearchResponse.self, from: data).results
    }
}

extension TextMatch {
    /// 検索に使う曲名（サブタイトル等を除いた表示用の文字列）
    static func searchTitle(_ title: String) -> String {
        var t = title
        for sep in [" / ", "/", "〜", "~", " -", "(", "（", "【"] {
            if let r = t.range(of: sep), r.lowerBound > t.startIndex { t = String(t[..<r.lowerBound]) }
        }
        return t.trimmingCharacters(in: .whitespaces)
    }

    /// 検索に使う歌手名（feat. 等より前）
    static func primaryArtistDisplay(_ a: String) -> String {
        var s = a
        for sep in [" feat", " Feat", " featuring", " with ", " With ", "&", "×", "、", ",", " and ", "/"] {
            if let r = s.range(of: sep), r.lowerBound > s.startIndex { s = String(s[..<r.lowerBound]) }
        }
        return s.trimmingCharacters(in: .whitespaces)
    }
}

/// 照合済みの trackId から、Apple の曲情報（試聴URL・ジャケットなど）をまとめて取る
actor TrackLookup {
    static let shared = TrackLookup()

    private var cache: [Int: SongProvider.Track] = [:]
    private var missing = Set<Int>()

    /// まとめて先に取っておく（1回の通信で最大50曲）
    func prefetch(_ ids: [Int]) async {
        let need = Array(Set(ids.filter { cache[$0] == nil && !missing.contains($0) }))
        guard !need.isEmpty else { return }
        for chunk in stride(from: 0, to: need.count, by: 50).map({ Array(need[$0..<min($0 + 50, need.count)]) }) {
            var comps = URLComponents(string: "https://itunes.apple.com/lookup")!
            comps.queryItems = [
                URLQueryItem(name: "id", value: chunk.map(String.init).joined(separator: ",")),
                URLQueryItem(name: "country", value: "JP"),
                URLQueryItem(name: "entity", value: "song"),
                URLQueryItem(name: "lang", value: "ja_jp"),
            ]
            guard let url = comps.url else { continue }
            var req = URLRequest(url: url)
            req.timeoutInterval = 20
            guard let (data, resp) = try? await URLSession.shared.data(for: req),
                  (resp as? HTTPURLResponse)?.statusCode == 200,
                  let res = try? JSONDecoder().decode(SongProvider.SearchResponse.self, from: data) else { continue }
            var got = Set<Int>()
            for t in res.results {
                if let id = t.trackId, t.kind == nil || t.kind == "song" { cache[id] = t; got.insert(id) }
            }
            for id in chunk where !got.contains(id) { missing.insert(id) }
        }
    }

    func track(_ id: Int) async -> SongProvider.Track? {
        if let t = cache[id] { return t }
        if missing.contains(id) { return nil }
        await prefetch([id])
        return cache[id]
    }
}
