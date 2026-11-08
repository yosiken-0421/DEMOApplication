import Foundation

/// あるデータ源から取得した日付 1 件。
public struct SourceObservation: Codable, Hashable, Sendable {
    public var source: DateSource
    public var rawText: String
    public var parsed: ParsedDate
    public var fetchedAt: Date

    public init(source: DateSource, rawText: String, fetchedAt: Date, calendar: Calendar = MKCalendar.japan) {
        self.source = source
        self.rawText = rawText
        self.parsed = JapaneseDateParser.parse(rawText, calendar: calendar)
        self.fetchedAt = fetchedAt
    }
}

public enum DoubleCheckStatus: Equatable, Sendable {
    /// 2 つ以上のデータで日付が一致
    case confirmed
    /// データ同士で日付が一致しない
    case mismatch
    /// 1 つのデータのみ
    case single
    /// 確定日付を持つデータなし
    case none
}

public struct EffectiveDate: Equatable, Sendable {
    public var parsed: ParsedDate
    public var source: DateSource?
    public var fetchedAt: Date?
    /// 不一致のまま（ユーザー未選択）なので「日付未確定の可能性あり」と添える
    public var possiblyUncertain: Bool
}

public enum DoubleCheck {
    /// 手入力を除いた、データ源ごとの最新の観測。
    public static func latestBySource(_ obs: [SourceObservation]) -> [DateSource: SourceObservation] {
        var out: [DateSource: SourceObservation] = [:]
        for o in obs where o.source != .manual {
            if let cur = out[o.source], cur.fetchedAt >= o.fetchedAt { continue }
            out[o.source] = o
        }
        return out
    }

    public static func status(_ obs: [SourceObservation]) -> DoubleCheckStatus {
        let exact = latestBySource(obs).values.filter { $0.parsed.isExact }
        switch exact.count {
        case 0: return .none
        case 1: return .single
        default:
            let first = exact.first!.parsed
            return exact.allSatisfy { $0.parsed == first } ? .confirmed : .mismatch
        }
    }

    /// 通知・表示に使う日付。
    /// - 不一致でユーザーが選んでいれば、その出典の日付
    /// - 不一致で未選択なら、早い方の日付（possiblyUncertain = true）
    /// - それ以外は確定日付、無ければ未確定の文字列
    public static func effective(_ obs: [SourceObservation], chosen: DateSource?, calendar: Calendar = MKCalendar.japan) -> EffectiveDate {
        let latest = latestBySource(obs)
        let exact = latest.values.filter { $0.parsed.isExact }
        if status(obs) == .mismatch {
            if let chosen, let o = latest[chosen], o.parsed.isExact {
                return EffectiveDate(parsed: o.parsed, source: o.source, fetchedAt: o.fetchedAt, possiblyUncertain: false)
            }
            let earliest = exact.min { ($0.parsed.date(calendar: calendar) ?? .distantFuture) < ($1.parsed.date(calendar: calendar) ?? .distantFuture) }!
            return EffectiveDate(parsed: earliest.parsed, source: earliest.source, fetchedAt: earliest.fetchedAt, possiblyUncertain: true)
        }
        if let o = exact.sorted(by: { $0.source.rawValue < $1.source.rawValue }).first {
            return EffectiveDate(parsed: o.parsed, source: o.source, fetchedAt: o.fetchedAt, possiblyUncertain: false)
        }
        if let o = latest.values.sorted(by: { $0.fetchedAt > $1.fetchedAt }).first(where: { $0.parsed != .none }) {
            return EffectiveDate(parsed: o.parsed, source: o.source, fetchedAt: o.fetchedAt, possiblyUncertain: false)
        }
        return EffectiveDate(parsed: .none, source: nil, fetchedAt: nil, possiblyUncertain: false)
    }
}

/// 日付が変わったときに知らせる内容。
public enum DateChange: Equatable, Sendable {
    case none
    /// 未確定 → 確定
    case confirmed(new: ParsedDate)
    /// 確定 → 別の確定日（延期・前倒し）
    case changed(old: ParsedDate, new: ParsedDate)
    /// 確定 → 未確定に戻った
    case becameUndetermined(old: ParsedDate, new: ParsedDate)

    public static func detect(old: ParsedDate, new: ParsedDate) -> DateChange {
        switch (old.isExact, new.isExact) {
        case (false, true): return .confirmed(new: new)
        case (true, true): return old == new ? .none : .changed(old: old, new: new)
        case (true, false): return new == .none ? .none : .becameUndetermined(old: old, new: new)
        case (false, false): return .none
        }
    }
}
