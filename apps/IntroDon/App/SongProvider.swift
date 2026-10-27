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
        let usable: Int
        switch settings.fame {
        case .famous: usable = plan.famous.count
        case .minor: usable = plan.minor.count
        case .mix: usable = plan.total
        }
        if usable < 4 { throw SongProviderError.notEnoughSongs(found: usable) }
        return plan
    }

    // MARK: iPhone のミュージック

    /// ライブラリ曲の再生用（ID → MPMediaItem）
    nonisolated(unsafe) static var libraryItems: [UInt64: MPMediaItem] = [:]

    static func libraryPlan(settings: QuizSettings) -> QuizPlan {
        let items = MPMediaQuery.songs().items ?? []
        let calendar = Calendar(identifier: .gregorian)
        let westernArtists = Set(HitList.all.filter(\.western).map { TextMatch.primaryArtist($0.a) })
        var famous: [Candidate] = []
        var minor: [Candidate] = []
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

            if let hit = HitList.find(title: title, artist: artist),
               !(settings.genre == .anime && !hit.isAnime) {
                let animeOK = settings.genre == .anime && hit.isAnime
                guard settings.genre.allowsHit(western: hit.western),
                      animeOK || settings.genre.matches(item.genre),
                      settings.era.matches(hit.year ?? year) else { continue }
                cache[pid] = item
                famous.append(Candidate(id: song.id, title: title, artist: artist, year: hit.year ?? year, hit: hit, song: song))
            } else {
                let genreOK: Bool
                if settings.genre == .westernPop {
                    genreOK = westernArtists.contains(TextMatch.primaryArtist(artist))
                } else {
                    genreOK = settings.genre.matches(item.genre)
                }
                guard genreOK, settings.era.matches(year) else { continue }
                cache[pid] = item
                minor.append(Candidate(id: song.id, title: title, artist: artist, year: year, hit: nil, song: song))
            }
        }
        libraryItems = cache
        return QuizPlan(famous: famous.shuffled(), minor: minor.shuffled())
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
    private struct SearchResponse: Decodable { let results: [Track] }

    static func catalogPlan(settings: QuizSettings) async throws -> QuizPlan {
        let hits = HitList.filtered(genre: settings.genre, era: settings.era).shuffled()
        let famous = hits.map { h in
            Candidate(id: "hit-" + h.key, title: h.t, artist: h.a, year: h.year, hit: h, song: nil)
        }
        var minor: [Candidate] = []
        if settings.fame != .famous {
            minor = try await minorCandidates(settings: settings, hits: hits)
        }
        return QuizPlan(famous: settings.fame == .minor ? [] : famous, minor: minor.shuffled())
    }

    /// マイナー曲：その年代・ジャンルのヒット歌手の、ランキングに入っていない曲
    private static func minorCandidates(settings: QuizSettings, hits: [HitSong]) async throws -> [Candidate] {
        var artists: [String] = []
        let maxArtists = settings.genre == .anime ? 8 : 5
        for h in hits where !h.a.isEmpty {
            let a = h.a
            if !artists.contains(where: { TextMatch.artistMatches($0, a) }) { artists.append(a) }
            if artists.count >= maxArtists { break }
        }
        let needPreview = settings.source == .preview
        var result: [Candidate] = []
        var seen = Set<String>()
        var anySuccess = false
        var lastError: String?

        func add(_ t: Track, requireArtist: String?) {
            guard let song = makeSong(t, needPreview: needPreview) else { return }
            if let a = requireArtist, !TextMatch.artistMatches(song.artist, a) { return }
            guard HitList.find(title: song.title, artist: song.artist) == nil else { return }
            guard settings.genre.matches(song.genreName) else { return }
            if let r = settings.era.years {
                guard let y = song.year, (r.lowerBound - 2)...(r.upperBound + 2) ~= y else { return }
            }
            let key = TextMatch.core(song.title) + "|" + TextMatch.primaryArtist(song.artist)
            guard !seen.contains(key) else { return }
            seen.insert(key)
            result.append(Candidate(id: song.id, title: song.title, artist: song.artist, year: song.year, hit: nil, song: song))
        }

        for a in artists {
            do {
                let tracks = try await search(term: TextMatch.primaryArtistDisplay(a), attribute: "artistTerm", limit: 100)
                anySuccess = true
                for t in tracks { add(t, requireArtist: a) }
            } catch { lastError = error.localizedDescription }
        }
        if result.count < 12 {
            for seed in settings.genre.searchSeeds {
                do {
                    let tracks = try await search(term: seed, attribute: nil, limit: 200)
                    anySuccess = true
                    for t in tracks { add(t, requireArtist: nil) }
                } catch { lastError = error.localizedDescription }
            }
        }
        if !anySuccess { throw SongProviderError.network(lastError ?? "不明なエラー") }
        return result
    }

    /// ヒット曲リストの1曲を Apple の曲データと照合する（見つからなければ nil）
    static func resolve(_ c: Candidate, settings: QuizSettings) async -> Song? {
        if let s = c.song { return s }
        let needPreview = settings.source == .preview
        let noArtist = c.artist.isEmpty
        let term = noArtist ? TextMatch.searchTitle(c.title)
                            : TextMatch.searchTitle(c.title) + " " + TextMatch.primaryArtistDisplay(c.artist)
        guard let tracks = try? await search(term: term, attribute: nil, limit: noArtist ? 50 : 25) else { return nil }
        for t in tracks {
            guard let s = makeSong(t, needPreview: needPreview, overrideYear: c.year),
                  TextMatch.titleMatches(s.title, c.title) else { continue }
            if noArtist {
                // 歌手が書かれていないアニソンは、Apple のジャンルが「アニメ」の曲だけ採用
                guard Genre.anime.matches(s.genreName) else { continue }
            } else {
                guard TextMatch.artistMatches(s.artist, c.artist) else { continue }
            }
            if let h = c.hit, !h.western, !(settings.genre == .anime && h.isAnime),
               !settings.genre.matches(s.genreName) { return nil }
            // 年が不明な曲は Apple の発売年で年代を確認
            if c.year == nil, let r = settings.era.years {
                guard let y = s.year, r.contains(y), c.hit?.mayBeIn(Era(start: y - y % 5)) ?? true else { return nil }
            }
            return s
        }
        return nil
    }

    private static func makeSong(_ t: Track, needPreview: Bool, overrideYear: Int? = nil) -> Song? {
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

    static func search(term: String, attribute: String?, limit: Int) async throws -> [Track] {
        var comps = URLComponents(string: "https://itunes.apple.com/search")!
        var items = [
            URLQueryItem(name: "term", value: term),
            URLQueryItem(name: "country", value: "JP"),
            URLQueryItem(name: "media", value: "music"),
            URLQueryItem(name: "entity", value: "song"),
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "lang", value: "ja_jp"),
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
