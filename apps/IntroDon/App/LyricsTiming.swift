import Foundation

/// 歌い出し（最初の歌詞行）の時刻を、無料の同期歌詞データベース LRCLIB（https://lrclib.net）から調べる。
/// Apple Music は歌詞の時刻データをアプリに渡さないため、こちらを使う。
/// 見つからない曲は nil（＝曲の頭から再生）。
actor LyricsTiming {
    static let shared = LyricsTiming()

    private var cache: [String: Double?] = [:]

    private struct Hit: Decodable {
        let trackName: String?
        let artistName: String?
        let duration: Double?
        let instrumental: Bool?
        let syncedLyrics: String?
    }

    func vocalStart(for song: Song) async -> Double? {
        if let cached = cache[song.id] { return cached }
        let result = await lookup(song)
        cache[song.id] = result
        return result
    }

    private func lookup(_ song: Song) async -> Double? {
        var comps = URLComponents(string: "https://lrclib.net/api/search")!
        comps.queryItems = [
            URLQueryItem(name: "track_name", value: song.title),
            URLQueryItem(name: "artist_name", value: song.artist),
        ]
        guard let url = comps.url else { return nil }
        var req = URLRequest(url: url)
        req.timeoutInterval = 6
        req.setValue("IntroDonpisha/1.0 (https://github.com/yosiken-0421/DEMOApplication)", forHTTPHeaderField: "User-Agent")
        guard let (data, response) = try? await URLSession.shared.data(for: req),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let hits = try? JSONDecoder().decode([Hit].self, from: data) else { return nil }

        // 同期歌詞があるものだけ。曲の長さが分かるときは長さが近い（±5秒）ものを優先
        let candidates = hits.filter { $0.instrumental != true && !($0.syncedLyrics ?? "").isEmpty }
        let best: Hit?
        if let len = song.durationSeconds {
            best = candidates
                .filter { abs(($0.duration ?? -100) - len) <= 5 }
                .min { abs(($0.duration ?? 0) - len) < abs(($1.duration ?? 0) - len) }
        } else {
            best = candidates.first
        }
        guard let lrc = best?.syncedLyrics else { return nil }
        return Self.firstLineTime(lrc)
    }

    /// "[mm:ss.xx] 歌詞" 形式から、文字のある最初の行の時刻（秒）を返す
    static func firstLineTime(_ lrc: String) -> Double? {
        for line in lrc.split(whereSeparator: \.isNewline) {
            let s = String(line)
            guard s.hasPrefix("["), let close = s.firstIndex(of: "]") else { continue }
            let stamp = s[s.index(after: s.startIndex)..<close]
            let text = s[s.index(after: close)...].trimmingCharacters(in: .whitespaces)
            guard !text.isEmpty else { continue }
            let parts = stamp.split(separator: ":")
            guard parts.count == 2, let m = Double(parts[0]), let sec = Double(parts[1]) else { continue }
            return m * 60 + sec
        }
        return nil
    }
}
