import Foundation

/// 取得した日付文字列の解釈結果。
/// 日まで確定しているものだけを `.exact` にし、それ以外（「2026年12月」「上旬」「頃」など）は
/// 推測せず `.undetermined` として元の文字列のまま持つ。
public enum ParsedDate: Codable, Hashable, Sendable {
    case exact(year: Int, month: Int, day: Int)
    case undetermined(text: String)
    case none

    public var isExact: Bool {
        if case .exact = self { return true }
        return false
    }

    /// 日本時間のその日の 0:00。
    public func date(calendar: Calendar = MKCalendar.japan) -> Date? {
        guard case let .exact(y, m, d) = self else { return nil }
        return calendar.date(from: DateComponents(year: y, month: m, day: d))
    }

    /// 表示用の文字列。
    public var displayText: String {
        switch self {
        case let .exact(y, m, d): return "\(y)年\(m)月\(d)日"
        case let .undetermined(text): return text
        case .none: return "日付なし"
        }
    }
}

public enum JapaneseDateParser {
    /// 「頃」「上旬」などの曖昧さを表す語。これを含むものは日付が書かれていても確定扱いにしない。
    static let vagueWords = ["頃", "ごろ", "上旬", "中旬", "下旬", "予定", "以降", "未定", "初旬", "末", "春", "夏", "秋", "冬"]

    /// 例: "2026-12-01" / "2026年12月01日" / "2026/12/1" → exact
    ///     "2026年12月" / "2026-12" / "2026.9" / "2026年12月上旬" / "2026年12月10日頃" → undetermined
    public static func parse(_ raw: String, calendar: Calendar = MKCalendar.japan) -> ParsedDate {
        let text = TextNormalizer.halfWidthDigits(raw).trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return .none }
        if vagueWords.contains(where: { text.contains($0) }) {
            return .undetermined(text: raw.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        // 年・月・日の 3 つの数字を取り出す（区切りは - / . 年 月 日 のいずれか）
        let pattern = #"^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?$"#
        if let re = try? NSRegularExpression(pattern: pattern),
           let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
           m.numberOfRanges == 4,
           let y = Int(text[Range(m.range(at: 1), in: text)!]),
           let mo = Int(text[Range(m.range(at: 2), in: text)!]),
           let d = Int(text[Range(m.range(at: 3), in: text)!]) {
            // 実在する日付か確認（2/30 などを弾く）
            var comps = DateComponents(year: y, month: mo, day: d)
            comps.calendar = calendar
            if let date = calendar.date(from: comps) {
                let back = calendar.dateComponents([.year, .month, .day], from: date)
                if back.year == y, back.month == mo, back.day == d {
                    return .exact(year: y, month: mo, day: d)
                }
            }
            return .undetermined(text: raw.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        // 年が書かれているが日まで無いもの
        if text.range(of: #"\d{4}"#, options: .regularExpression) != nil {
            return .undetermined(text: raw.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return .none
    }
}
