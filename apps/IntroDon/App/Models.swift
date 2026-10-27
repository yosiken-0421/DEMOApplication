import Foundation

// MARK: - 曲の出どころ

enum MusicSource: String, CaseIterable, Identifiable {
    case library      // iPhone のミュージック（ライブラリ）
    case appleMusic   // Apple Music カタログ（加入者向け・曲の頭から再生）
    case preview      // Apple の 30 秒試聴音源（無料・曲の途中から始まることがある）

    var id: String { rawValue }

    var label: String {
        switch self {
        case .library: return "iPhoneのミュージック"
        case .appleMusic: return "Apple Music"
        case .preview: return "試聴音源（無料）"
        }
    }

    var icon: String {
        switch self {
        case .library: return "iphone"
        case .appleMusic: return "music.note"
        case .preview: return "headphones"
        }
    }

    var detail: String {
        switch self {
        case .library:
            return "iPhoneに入っている曲を曲の頭から流します。本物のイントロで遊べます。"
        case .appleMusic:
            return "Apple Musicの曲を曲の頭から流します。Apple Musicの加入が必要です。"
        case .preview:
            return "Appleの30秒試聴音源を使います。加入不要ですが、イントロではなくサビ等から始まる曲があります。"
        }
    }
}

// MARK: - ジャンル

enum Genre: String, CaseIterable, Identifiable {
    case all, jpop, anime, rock, enka, westernPop, hiphop, dance

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "全ジャンル"
        case .jpop: return "J-POP"
        case .anime: return "アニメ"
        case .rock: return "ロック"
        case .enka: return "演歌・歌謡曲"
        case .westernPop: return "洋楽ポップ"
        case .hiphop: return "ヒップホップ"
        case .dance: return "ダンス"
        }
    }

    var emoji: String {
        switch self {
        case .all: return "🎵"
        case .jpop: return "🎤"
        case .anime: return "📺"
        case .rock: return "🎸"
        case .enka: return "🎙️"
        case .westernPop: return "🌎"
        case .hiphop: return "🧢"
        case .dance: return "🪩"
        }
    }

    /// Apple のジャンル名（英語・日本語表記の両方）と完全一致で判定する
    var aliases: [String] {
        switch self {
        case .all: return []
        case .jpop: return ["j-pop", "jポップ", "j-ポップ"]
        case .anime: return ["anime", "アニメ"]
        case .rock: return ["rock", "ロック", "alternative", "オルタナティブ", "hard rock", "ハードロック", "j-rock", "jロック"]
        case .enka: return ["enka", "演歌", "kayokyoku", "歌謡曲"]
        case .westernPop: return ["pop", "ポップ"]
        case .hiphop: return ["hip-hop/rap", "ヒップホップ/ラップ", "hip-hop", "ヒップホップ", "rap", "ラップ"]
        case .dance: return ["dance", "ダンス", "electronic", "エレクトロニック"]
        }
    }

    /// Apple の検索に投げる言葉（検索結果はジャンル・年でさらに絞り込む）
    var searchSeeds: [String] {
        switch self {
        case .all: return ["ヒット", "ベスト", "J-POP", "ロック"]
        case .jpop: return ["J-POP", "J-POP ヒット"]
        case .anime: return ["アニメ", "アニソン"]
        case .rock: return ["ロック", "Rock"]
        case .enka: return ["演歌", "歌謡曲"]
        case .westernPop: return ["洋楽", "Pop"]
        case .hiphop: return ["ヒップホップ", "Hip-Hop"]
        case .dance: return ["ダンス", "Dance"]
        }
    }

    func matches(_ genreName: String?) -> Bool {
        if self == .all { return true }
        guard let g = genreName?.trimmingCharacters(in: .whitespaces).lowercased(), !g.isEmpty else { return false }
        return aliases.contains(g)
    }
}

// MARK: - 年代

enum Era: String, CaseIterable, Identifiable {
    case all, e70, e80, e90, e00, e10, e20

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "全年代"
        case .e70: return "70年代"
        case .e80: return "80年代"
        case .e90: return "90年代"
        case .e00: return "2000年代"
        case .e10: return "2010年代"
        case .e20: return "2020年代"
        }
    }

    var years: ClosedRange<Int>? {
        switch self {
        case .all: return nil
        case .e70: return 1970...1979
        case .e80: return 1980...1989
        case .e90: return 1990...1999
        case .e00: return 2000...2009
        case .e10: return 2010...2019
        case .e20: return 2020...2029
        }
    }

    func matches(_ year: Int?) -> Bool {
        guard let range = years else { return true }
        guard let year else { return false }
        return range.contains(year)
    }
}

// MARK: - 有名 / マイナー

enum Fame: String, CaseIterable, Identifiable {
    case famous, minor, mix

    var id: String { rawValue }

    var label: String {
        switch self {
        case .famous: return "有名な曲"
        case .minor: return "マイナーな曲"
        case .mix: return "ミックス"
        }
    }

    var detail: String {
        switch self {
        case .famous: return "シングルとして出た曲（収録4曲以下の作品）から出題"
        case .minor: return "アルバム収録曲（収録5曲以上の作品）から出題"
        case .mix: return "どちらも出題"
        }
    }

    /// trackCount = その曲が入っている作品の曲数（不明なら 0 / nil）
    func matches(trackCount: Int?) -> Bool {
        switch self {
        case .mix: return true
        case .famous:
            guard let n = trackCount, n > 0 else { return false }
            return n <= 4
        case .minor:
            guard let n = trackCount, n > 0 else { return false }
            return n >= 5
        }
    }
}

// MARK: - 曲

struct Song: Identifiable, Hashable {
    let id: String
    let title: String
    let artist: String
    let year: Int?
    let genreName: String?
    let trackCount: Int?
    /// Apple Music / iTunes の曲 ID（Apple Music 再生用）
    let storeID: String?
    /// 30 秒試聴の URL
    let previewURL: URL?
    /// Apple Music で開くリンク
    let storeURL: URL?
    let artworkURL: URL?
    /// iPhone ライブラリの曲 ID
    let libraryID: UInt64?

    var answerText: String { "\(artist)の「\(title)」" }
    var spokenAnswer: String { "\(artist)の、\(title)" }
}

struct QuizSettings {
    var source: MusicSource = .library
    var genre: Genre = .all
    var era: Era = .all
    var fame: Fame = .mix
    var introSeconds: Double = 3
    var questionCount: Int = 10
}
