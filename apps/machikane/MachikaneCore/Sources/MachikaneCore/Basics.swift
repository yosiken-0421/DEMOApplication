import Foundation

/// 3 つのカテゴリ。色はアプリ側（SwiftUI）で割り当てる。
public enum ItemCategory: String, Codable, CaseIterable, Identifiable, Sendable {
    case manga   // 漫画・ラノベ新刊
    case anime   // アニメ
    case coin    // マンガアプリ・ゲームのコイン

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .manga: return "漫画・ラノベ"
        case .anime: return "アニメ"
        case .coin: return "コイン・ゲーム"
        }
    }

    public var symbolName: String {
        switch self {
        case .manga: return "book.closed.fill"
        case .anime: return "tv.fill"
        case .coin: return "gamecontroller.fill"
        }
    }
}

/// 日付の出典。表示する日付には必ず出典と最終取得日時を添える。
public enum DateSource: String, Codable, CaseIterable, Sendable {
    case rakuten   // 楽天ブックス（現在は未実装。README 参照）
    case ndl       // 国立国会図書館サーチ（JPRO 近刊情報）
    case annict    // Annict
    case manual    // 手入力

    public var displayName: String {
        switch self {
        case .rakuten: return "楽天ブックス"
        case .ndl: return "国立国会図書館サーチ"
        case .annict: return "Annict"
        case .manual: return "手入力"
        }
    }
}

/// 日付計算に使うカレンダー。発売日は日本の日付なので Asia/Tokyo 固定。
public enum MKCalendar {
    public static var japan: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Tokyo") ?? .current
        c.locale = Locale(identifier: "ja_JP")
        return c
    }
}

public enum TextNormalizer {
    /// 全角数字・全角記号の一部を半角にする。
    public static func halfWidthDigits(_ s: String) -> String {
        var out = ""
        for ch in s.unicodeScalars {
            switch ch.value {
            case 0xFF10...0xFF19: // ０-９
                out.unicodeScalars.append(UnicodeScalar(ch.value - 0xFF10 + 0x30)!)
            case 0xFF0D: out.append("-")   // －
            case 0xFF0F: out.append("/")   // ／
            case 0xFF0E: out.append(".")   // ．
            case 0x3000: out.append(" ")   // 全角スペース
            default: out.unicodeScalars.append(ch)
            }
        }
        return out
    }

    /// ISBN からハイフン等を除き、数字と X だけにする。
    public static func isbn(_ s: String) -> String {
        halfWidthDigits(s).uppercased().filter { $0.isNumber || $0 == "X" }
    }

    /// 巻数表記（「４」「第4巻」「4」）から数値を取り出す。取り出せなければ nil。
    public static func volumeNumber(_ s: String) -> Int? {
        let t = halfWidthDigits(s)
        var digits = ""
        for ch in t {
            if ch.isASCII, ch.isNumber { digits.append(ch) } else if !digits.isEmpty { break }
        }
        return digits.isEmpty ? nil : Int(digits)
    }
}
