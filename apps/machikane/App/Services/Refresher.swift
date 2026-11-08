import Foundation
import SwiftData
import MachikaneCore

/// 1 日 1 回程度の自動取得（BGAppRefreshTask と手動更新）。
@MainActor
final class Refresher {
    static let taskID = "com.yosiken0421.machikane.refresh"
    static let minInterval: TimeInterval = 20 * 3600

    struct Report {
        var updated = 0
        var errors: [String] = []
        var skipped = false
    }

    var lastRefreshAt: Date? {
        get { UserDefaults.standard.object(forKey: "refresh.last") as? Date }
        set { UserDefaults.standard.set(newValue, forKey: "refresh.last") }
    }

    func refreshAll(context: ModelContext, notifications: NotificationService, calendar: CalendarService, force: Bool) async -> Report {
        var report = Report()
        let now = Date()
        if !force, let last = lastRefreshAt, now.timeIntervalSince(last) < Self.minInterval {
            report.skipped = true
            return report
        }
        let items = (try? context.fetch(FetchDescriptor<TrackedItem>())) ?? []

        // 漫画（国立国会図書館サーチ）
        for item in items where item.category == .manga && !item.isArchived {
            do {
                if try await refreshManga(item, notifications: notifications, calendar: calendar, now: now) { report.updated += 1 }
            } catch {
                report.errors.append("\(item.title)：\(error.localizedDescription)")
            }
        }

        // アニメ（Annict：トークンがあるときだけ）
        let animes = items.filter { $0.category == .anime && !$0.isArchived && $0.annictWorkID > 0 && !$0.isManualOverride }
        if !animes.isEmpty, KeychainStore.annictToken?.isEmpty == false {
            do {
                let programs = try await AnnictClient.shared.programs(workIDs: Array(Set(animes.map(\.annictWorkID))), after: now.addingTimeInterval(-3600))
                for item in animes {
                    let next = programs.filter { $0.workID == item.annictWorkID && ($0.startedAt ?? .distantPast) > now }
                    let pick = next.first(where: { !$0.isRebroadcast }) ?? next.first
                    guard let p = pick, let start = p.startedAt else { continue }
                    if item.mainDate != start {
                        item.mainDate = start
                        item.hasTime = true
                        report.updated += 1
                    }
                    item.mainSource = .annict
                    item.mainFetchedAt = now
                    item.nextEpisodeText = p.episodeNumberText ?? ""
                    if let ch = p.channelName, item.station.isEmpty { item.station = ch }
                    calendar.syncAfterDateChange(item)
                }
            } catch {
                report.errors.append("Annict：\(error.localizedDescription)")
            }
        }

        try? context.save()
        lastRefreshAt = now
        UserDefaults.standard.set(report.errors.joined(separator: "\n"), forKey: "refresh.errors")
        return report
    }

    /// 戻り値: 日付などに変化があったか
    func refreshManga(_ item: TrackedItem, notifications: NotificationService, calendar: CalendarService, now: Date) async throws -> Bool {
        var changed = false

        // 次巻待ち → シリーズ名で検索して「所持巻 + 1」の巻を探す
        if item.isAwaitingNextVolume, !item.seriesKeyword.isEmpty {
            let recs = try await NDLClient.shared.search(item.seriesKeyword, kind: .paper, count: 50)
            let want = item.ownedVolume + 1
            let key = normalize(item.seriesKeyword)
            let candidates = recs.filter { $0.volumeNumber == want && normalize($0.title).contains(key) }
            if let rec = candidates.first(where: \.isJPRO) ?? candidates.first {
                item.targetVolume = want
                item.isbn = rec.isbn
                item.subtitle = rec.displayTitle
                item.mainDate = nil
                item.mainDateText = ""
                item.isManualOverride = false
                item.chosenSource = nil
                item.observations = []
                item.calendarEventID = ""
                item.calendarRegisteredDate = nil
                applyMain(item, observation: SourceObservation(source: .ndl, rawText: rec.dateText, fetchedAt: now),
                          notifications: notifications, calendar: calendar, announce: false)
                let when = item.mainDate.map { "発売日：\($0.mkDateText)" } ?? "発売日：\(item.mainDateText.isEmpty ? "未確定" : item.mainDateText)"
                notifications.notifyNow(title: "\(item.title) \(want)巻の情報が見つかりました", body: "\(when)（出典：国立国会図書館サーチ）")
                return true
            }
            return false
        }

        if !item.isbn.isEmpty, let rec = try await NDLClient.shared.record(isbn: item.isbn, kind: .paper) {
            changed = applyMain(item, observation: SourceObservation(source: .ndl, rawText: rec.dateText, fetchedAt: now),
                                notifications: notifications, calendar: calendar, announce: true) || changed
        }
        if !item.digitalISBN.isEmpty, let rec = try await NDLClient.shared.record(isbn: item.digitalISBN, kind: .digital) {
            changed = applyDigital(item, rawText: rec.dateText, fetchedAt: now, notifications: notifications, calendar: calendar) || changed
        }
        return changed
    }

    /// 紙の発売日の観測を反映し、確定・変更を知らせる。
    @discardableResult
    func applyMain(_ item: TrackedItem, observation: SourceObservation, notifications: NotificationService, calendar: CalendarService, announce: Bool) -> Bool {
        var obs = item.observations.filter { $0.source != observation.source }
        obs.append(observation)
        item.observations = obs
        guard !item.isManualOverride else { return false }

        let old: ParsedDate = item.mainDate?.mkParsed ?? (item.mainDateText.isEmpty ? .none : .undetermined(text: item.mainDateText))
        let eff = DoubleCheck.effective(obs, chosen: item.chosenSource)
        item.mainDate = eff.parsed.date()
        item.mainDateText = eff.parsed.isExact ? "" : (eff.parsed == .none ? "" : eff.parsed.displayText)
        item.mainSource = eff.source ?? observation.source
        item.mainFetchedAt = eff.fetchedAt ?? observation.fetchedAt
        item.hasTime = false

        let change = DateChange.detect(old: old, new: eff.parsed)
        if announce {
            switch change {
            case let .confirmed(new):
                notifications.notifyNow(title: "\(item.title)：発売日が確定しました", body: "\(new.displayText)（出典：\(item.mainSource.displayName)）")
            case let .changed(o, n):
                notifications.notifyNow(title: "\(item.title)：発売日が変更されました", body: "\(o.displayText) → \(n.displayText)（出典：\(item.mainSource.displayName)）")
            case let .becameUndetermined(o, n):
                notifications.notifyNow(title: "\(item.title)：発売日が未確定に戻りました", body: "\(o.displayText) → \(n.displayText)")
            case .none: break
            }
        }
        if change != .none { calendar.syncAfterDateChange(item) }
        return change != .none
    }

    @discardableResult
    func applyDigital(_ item: TrackedItem, rawText: String, fetchedAt: Date, notifications: NotificationService, calendar: CalendarService) -> Bool {
        let parsed = JapaneseDateParser.parse(rawText)
        let old: ParsedDate = item.digitalDate?.mkParsed ?? (item.digitalDateText.isEmpty ? .none : .undetermined(text: item.digitalDateText))
        item.digitalDate = parsed.date()
        item.digitalDateText = parsed.isExact ? "" : (parsed == .none ? "" : parsed.displayText)
        item.digitalSourceRaw = DateSource.ndl.rawValue
        item.digitalFetchedAt = fetchedAt
        let change = DateChange.detect(old: old, new: parsed)
        switch change {
        case let .confirmed(new):
            notifications.notifyNow(title: "\(item.title)：電子版の配信日が確定しました", body: "\(new.displayText)（出典：国立国会図書館サーチ）")
        case let .changed(o, n):
            notifications.notifyNow(title: "\(item.title)：電子版の配信日が変更されました", body: "\(o.displayText) → \(n.displayText)")
        default: break
        }
        if change != .none, item.useDigitalDate { calendar.syncAfterDateChange(item) }
        return change != .none
    }

    private func normalize(_ s: String) -> String {
        TextNormalizer.halfWidthDigits(s).lowercased().filter { !$0.isWhitespace }
    }
}
