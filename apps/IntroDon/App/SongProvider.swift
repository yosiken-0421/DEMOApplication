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

    // MARK: 曲集め

    static func loadSongs(settings: QuizSettings) async throws -> [Song] {
        let songs: [Song]
        switch settings.source {
        case .library:
            guard await requestLibraryAccess() else { throw SongProviderError.libraryDenied }
            songs = librarySongs(settings: settings)
        case .appleMusic:
            guard await canPlayAppleMusicCatalog() else { throw SongProviderError.appleMusicUnavailable }
            songs = try await catalogSongs(settings: settings, needPreview: false)
        case .preview:
            songs = try await catalogSongs(settings: settings, needPreview: true)
        }
        if songs.count < 4 { throw SongProviderError.notEnoughSongs(found: songs.count) }
        return songs
    }

    // MARK: iPhone のミュージック

    /// ライブラリ曲の再生用キャッシュ（ID → MPMediaItem）
    nonisolated(unsafe) static var libraryItems: [UInt64: MPMediaItem] = [:]

    static func librarySongs(settings: QuizSettings) -> [Song] {
        let query = MPMediaQuery.songs()
        let items = query.items ?? []
        var result: [Song] = []
        var seen = Set<String>()
        var cache: [UInt64: MPMediaItem] = [:]
        let calendar = Calendar(identifier: .gregorian)
        for item in items {
            guard item.mediaType.contains(.music) else { continue }
            guard let title = item.title, !title.isEmpty else { continue }
            let artist = item.artist ?? "不明なアーティスト"
            let year = item.releaseDate.map { calendar.component(.year, from: $0) }
            let trackCount = item.albumTrackCount > 0 ? item.albumTrackCount : nil
            guard settings.genre.matches(item.genre),
                  settings.era.matches(year),
                  settings.fame.matches(trackCount: trackCount) else { continue }
            let key = (title + "|" + artist).lowercased()
            guard !seen.contains(key) else { continue }
            seen.insert(key)
            let pid = item.persistentID
            cache[pid] = item
            result.append(Song(
                id: "lib-\(pid)", title: title, artist: artist, year: year,
                genreName: item.genre, trackCount: trackCount,
                storeID: nil, previewURL: nil, storeURL: nil, artworkURL: nil,
                libraryID: pid,
                durationSeconds: item.playbackDuration > 0 ? item.playbackDuration : nil))
        }
        libraryItems = cache
        return result
    }

    // MARK: Apple のカタログ（iTunes Search API）

    private struct SearchResponse: Decodable { let results: [Track] }
    private struct Track: Decodable {
        let wrapperType: String?
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
        let isStreamable: Bool?
    }

    static func catalogSongs(settings: QuizSettings, needPreview: Bool) async throws -> [Song] {
        var terms: [String] = []
        for seed in settings.genre.searchSeeds {
            if settings.era != .all { terms.append("\(seed) \(settings.era.label)") }
            terms.append(seed)
        }
        // 検索回数は Apple の目安（1分あたり約20回）より十分少なくする
        var uniq: [String] = []
        for t in terms where !uniq.contains(t) { uniq.append(t) }
        terms = Array(uniq.prefix(6))

        var result: [Song] = []
        var seen = Set<String>()
        var lastError: String?
        var anySuccess = false

        for term in terms {
            do {
                let tracks = try await search(term: term)
                anySuccess = true
                for t in tracks {
                    guard t.kind == nil || t.kind == "song",
                          let id = t.trackId, let title = t.trackName, let artist = t.artistName else { continue }
                    let year = t.releaseDate.flatMap { Int($0.prefix(4)) }
                    guard settings.genre.matches(t.primaryGenreName),
                          settings.era.matches(year),
                          settings.fame.matches(trackCount: t.trackCount) else { continue }
                    let preview = t.previewUrl.flatMap(URL.init(string:))
                    if needPreview && preview == nil { continue }
                    let key = (title + "|" + artist).lowercased()
                    guard !seen.contains(key) else { continue }
                    seen.insert(key)
                    result.append(Song(
                        id: "am-\(id)", title: title, artist: artist, year: year,
                        genreName: t.primaryGenreName, trackCount: t.trackCount,
                        storeID: String(id), previewURL: preview,
                        storeURL: t.trackViewUrl.flatMap(URL.init(string:)),
                        artworkURL: t.artworkUrl100.flatMap { URL(string: $0.replacingOccurrences(of: "100x100", with: "300x300")) },
                        libraryID: nil,
                        durationSeconds: t.trackTimeMillis.map { $0 / 1000 }))
                }
            } catch {
                lastError = error.localizedDescription
            }
            if result.count >= 80 { break }
        }
        if !anySuccess { throw SongProviderError.network(lastError ?? "不明なエラー") }
        return result
    }

    private static func search(term: String) async throws -> [Track] {
        var comps = URLComponents(string: "https://itunes.apple.com/search")!
        comps.queryItems = [
            URLQueryItem(name: "term", value: term),
            URLQueryItem(name: "country", value: "JP"),
            URLQueryItem(name: "media", value: "music"),
            URLQueryItem(name: "entity", value: "song"),
            URLQueryItem(name: "limit", value: "200"),
            URLQueryItem(name: "lang", value: "ja_jp"),
        ]
        var req = URLRequest(url: comps.url!)
        req.timeoutInterval = 20
        let (data, response) = try await URLSession.shared.data(for: req)
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
            throw SongProviderError.network("HTTP \(http.statusCode)")
        }
        return try JSONDecoder().decode(SearchResponse.self, from: data).results
    }
}
