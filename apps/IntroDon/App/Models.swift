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
            return "iPhoneに入っている曲で出題します。本物のイントロで遊べます。"
        case .appleMusic:
            return "Apple Musicの曲で出題します。Apple Musicの加入が必要です。"
        case .preview:
            return "Appleの30秒試聴音源を使います。加入不要ですが、イントロではなくサビ等から始まる曲があります。"
        }
    }
}

// MARK: - 遊び方（番組ルール / フリープレイ）

enum RuleMode: String, CaseIterable, Identifiable {
    case show, free

    var id: String { rawValue }

    var label: String {
        switch self {
        case .show: return "📺 番組ルール"
        case .free: return "🎵 フリープレイ"
        }
    }

    var detail: String {
        switch self {
        case .show:
            return "イントロ（5点）→ウルトラ（10点）→超ウルトラ（20点）の3ステージ。だんだん短くなります。お手つき・不正解は−5点で✕がつき、1ステージで✕2つになると失格（得点は0点に没収）。"
        case .free:
            return "1問1点。間違えても減点なし。「+1秒で聴く」も使えます。"
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
        case .westernPop: return "洋楽"
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
        case .all, .westernPop: return []
        case .jpop: return ["j-pop", "jポップ", "j-ポップ"]
        case .anime: return ["anime", "アニメ"]
        case .rock: return ["rock", "ロック", "alternative", "オルタナティブ", "hard rock", "ハードロック", "j-rock", "jロック"]
        case .enka: return ["enka", "演歌", "kayokyoku", "歌謡曲"]
        case .hiphop: return ["hip-hop/rap", "ヒップホップ/ラップ", "hip-hop", "ヒップホップ", "rap", "ラップ"]
        case .dance: return ["dance", "ダンス", "electronic", "エレクトロニック"]
        }
    }

    /// マイナー曲を探すときの検索語（ヒット曲リストに歌手がいない場合の予備）
    var searchSeeds: [String] {
        switch self {
        case .all: return ["J-POP", "ロック"]
        case .jpop: return ["J-POP"]
        case .anime: return ["アニメ", "アニソン"]
        case .rock: return ["ロック"]
        case .enka: return ["演歌", "歌謡曲"]
        case .westernPop: return ["Pop", "洋楽"]
        case .hiphop: return ["ヒップホップ"]
        case .dance: return ["ダンス"]
        }
    }

    /// Apple のジャンル名で判定（洋楽はヒット曲リストの洋楽フラグで判定するので常に true）
    func matches(_ genreName: String?) -> Bool {
        if self == .all || self == .westernPop { return true }
        guard let g = genreName?.trimmingCharacters(in: .whitespaces).lowercased(), !g.isEmpty else { return false }
        return aliases.contains(g)
    }

    /// ヒット曲リストの「洋楽かどうか」で絞り込む
    func allowsHit(western: Bool) -> Bool {
        switch self {
        case .all: return true
        case .westernPop: return western
        default: return !western
        }
    }
}

// MARK: - 年代（5年ごと）

struct Era: Hashable, Identifiable {
    /// nil = 全年代
    let start: Int?

    var id: String { start.map(String.init) ?? "all" }

    static let all = Era(start: nil)
    static let buckets: [Era] = stride(from: 1970, through: 2025, by: 5).map { Era(start: $0) }
    static let choices: [Era] = [.all] + buckets

    var years: ClosedRange<Int>? {
        guard let s = start else { return nil }
        return s...(s + 4)
    }

    var label: String {
        guard let s = start else { return "全年代" }
        let decade = s / 10 * 10
        let half = s % 10 == 0 ? "前半" : "後半"
        if decade < 2000 { return "\(decade % 100)年代\(half)" }
        return "\(decade)年代\(half)"
    }

    var rangeLabel: String {
        guard let r = years else { return "" }
        return "\(r.lowerBound)〜\(r.upperBound)"
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
        case .famous:
            return "年間ランキング上位のヒット曲（オリコン年間シングル／Billboard JAPAN年間HOT100／米Billboard Hot 100 1位）から出題。年代はランキングの年で分けます。"
        case .minor:
            return "その年代のヒット歌手のアルバム曲など、ランキングに入っていない曲から出題。"
        case .mix:
            return "有名な曲とマイナーな曲を半分ずつ出題。"
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
    /// 曲の長さ（秒）。歌詞データの照合に使う
    let durationSeconds: Double?

    var answerText: String { "\(artist)の「\(title)」" }
    var spokenAnswer: String { "\(artist)の、\(title)" }
}

struct QuizSettings {
    var source: MusicSource = .library
    var genre: Genre = .all
    var era: Era = .all
    var fame: Fame = .famous
    var rule: RuleMode = .show
    var introSeconds: Double = 3
    var questionCount: Int = 10
    /// true = 歌い出し（最初の歌詞）の少し前から再生 / false = 曲の頭から
    var startFromVocal: Bool = true
}
