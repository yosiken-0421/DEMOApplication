import XCTest
@testable import MachikaneCore

final class DateParsingTests: XCTestCase {
    func testExactFormats() {
        XCTAssertEqual(JapaneseDateParser.parse("2026-12-01"), .exact(year: 2026, month: 12, day: 1))
        XCTAssertEqual(JapaneseDateParser.parse("2026年12月01日"), .exact(year: 2026, month: 12, day: 1))
        XCTAssertEqual(JapaneseDateParser.parse("2026/1/9"), .exact(year: 2026, month: 1, day: 9))
        XCTAssertEqual(JapaneseDateParser.parse("２０２６年１２月５日"), .exact(year: 2026, month: 12, day: 5))
    }

    func testUndeterminedFormatsAreNotGuessed() {
        for s in ["2026年12月", "2026-12", "2026.9", "2026", "2026年12月上旬", "2026年12月中旬", "2026年12月下旬", "2026年12月10日頃", "2026年12月頃"] {
            XCTAssertFalse(JapaneseDateParser.parse(s).isExact, s)
            if case let .undetermined(text) = JapaneseDateParser.parse(s) { XCTAssertEqual(text, s) } else { XCTFail(s) }
        }
    }

    func testInvalidDateIsUndetermined() {
        XCTAssertFalse(JapaneseDateParser.parse("2026-02-30").isExact)
        XCTAssertEqual(JapaneseDateParser.parse(""), .none)
        XCTAssertEqual(JapaneseDateParser.parse("未定"), .undetermined(text: "未定"))
    }

    func testVolumeNumber() {
        XCTAssertEqual(TextNormalizer.volumeNumber("４"), 4)
        XCTAssertEqual(TextNormalizer.volumeNumber("第12巻"), 12)
        XCTAssertNil(TextNormalizer.volumeNumber("上"))
        XCTAssertEqual(TextNormalizer.isbn("978-4-08-790257-0"), "9784087902570")
    }
}

final class CountdownTests: XCTestCase {
    var cal: Calendar { MKCalendar.japan }
    func d(_ s: String) -> Date {
        let f = DateFormatter(); f.calendar = cal; f.timeZone = cal.timeZone; f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd HH:mm"; return f.date(from: s)!
    }

    func testDaysAndLabels() {
        let now = d("2026-11-09 22:00")
        XCTAssertEqual(Countdown.daysUntil(d("2026-11-10 00:00"), from: now, calendar: cal), 1)
        XCTAssertEqual(Countdown.label(for: d("2026-11-12 00:00"), hasTime: false, now: now, calendar: cal), "あと3日")
        XCTAssertEqual(Countdown.label(for: d("2026-11-09 23:30"), hasTime: true, now: now, calendar: cal), "あと1時間30分")
        XCTAssertEqual(Countdown.label(for: d("2026-11-09 00:00"), hasTime: false, now: now, calendar: cal), "今日！")
        XCTAssertEqual(Countdown.section(for: d("2026-11-14 00:00"), now: now, calendar: cal), .thisWeek)
        XCTAssertEqual(Countdown.section(for: nil, now: now, calendar: cal), .undetermined)
        XCTAssertEqual(Countdown.section(for: d("2026-11-08 00:00"), now: now, calendar: cal), .past)
    }

    func testNextWeekly() {
        let now = d("2026-11-09 22:00") // 月曜
        let next = Countdown.nextWeekly(weekday: 2, hour: 23, minute: 30, after: now, calendar: cal)
        XCTAssertEqual(next, d("2026-11-09 23:30"))
        let next2 = Countdown.nextWeekly(weekday: 2, hour: 21, minute: 0, after: now, calendar: cal)
        XCTAssertEqual(next2, d("2026-11-16 21:00"))
    }

    func testProgress() {
        XCTAssertEqual(Countdown.progress(start: d("2026-11-01 00:00"), target: d("2026-11-11 00:00"), now: d("2026-11-06 00:00")), 0.5, accuracy: 0.0001)
    }
}

final class ReminderTests: XCTestCase {
    var cal: Calendar { MKCalendar.japan }

    func testFireDates() {
        let target = MKCalendar.japan.date(from: DateComponents(year: 2026, month: 12, day: 4, hour: 0))!
        let r = ReminderRule(kind: .daysBefore(days: 3, hour: 9, minute: 0))
        XCTAssertEqual(r.fireDate(for: target, calendar: cal), cal.date(from: DateComponents(year: 2026, month: 12, day: 1, hour: 9)))
        let at = ReminderRule(kind: .minutesBefore(minutes: 30))
        XCTAssertEqual(at.fireDate(for: target, calendar: cal), target.addingTimeInterval(-1800))
    }

    func testWeeklyShiftWrapsAcrossWeek() {
        // 日曜 0:10 放送の 30 分前 → 土曜 23:40
        let r = ReminderRule(kind: .minutesBefore(minutes: 30))
        let t = r.weeklyTrigger(weekday: 1, hour: 0, minute: 10)
        XCTAssertEqual(t.weekday, 7); XCTAssertEqual(t.hour, 23); XCTAssertEqual(t.minute, 40)
        // 月曜放送の前日 20:00 → 日曜 20:00
        let p = ReminderRule(kind: .daysBefore(days: 1, hour: 20, minute: 0)).weeklyTrigger(weekday: 2, hour: 23, minute: 0)
        XCTAssertEqual(p.weekday, 1); XCTAssertEqual(p.hour, 20)
    }
}

final class PlannerTests: XCTestCase {
    func testRepeatingFirstThenNearest() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        var all: [PlannedNotification] = []
        for i in 0..<100 {
            all.append(.init(id: "o\(i)", title: "", body: "", trigger: .once(now.addingTimeInterval(Double(100 - i) * 60))))
        }
        all.append(.init(id: "past", title: "", body: "", trigger: .once(now.addingTimeInterval(-10))))
        all.append(.init(id: "d1", title: "", body: "", trigger: .daily(hour: 4, minute: 0)))
        all.append(.init(id: "w1", title: "", body: "", trigger: .weekly(weekday: 2, hour: 23, minute: 0)))
        let plan = NotificationPlanner.plan(all, now: now)
        XCTAssertEqual(plan.selected.count, 64)
        XCTAssertEqual(plan.dropped.count, 38)
        XCTAssertEqual(Array(plan.selected.prefix(2)).map(\.id), ["d1", "w1"])
        XCTAssertEqual(plan.selected[2].id, "o99") // 一番近いもの
        XCTAssertFalse(plan.selected.contains { $0.id == "past" })
    }
}

final class DoubleCheckTests: XCTestCase {
    let t0 = Date(timeIntervalSince1970: 0)

    func testConfirmedWhenTwoSourcesMatch() {
        let obs = [SourceObservation(source: .ndl, rawText: "2026-12-04", fetchedAt: t0),
                   SourceObservation(source: .rakuten, rawText: "2026年12月04日", fetchedAt: t0)]
        XCTAssertEqual(DoubleCheck.status(obs), .confirmed)
    }

    func testMismatchUsesEarliestUntilChosen() {
        let obs = [SourceObservation(source: .ndl, rawText: "2026-12-04", fetchedAt: t0),
                   SourceObservation(source: .rakuten, rawText: "2026年12月10日", fetchedAt: t0)]
        XCTAssertEqual(DoubleCheck.status(obs), .mismatch)
        let e = DoubleCheck.effective(obs, chosen: nil)
        XCTAssertEqual(e.parsed, .exact(year: 2026, month: 12, day: 4))
        XCTAssertTrue(e.possiblyUncertain)
        let c = DoubleCheck.effective(obs, chosen: .rakuten)
        XCTAssertEqual(c.parsed, .exact(year: 2026, month: 12, day: 10))
        XCTAssertFalse(c.possiblyUncertain)
    }

    func testSingleAndUndetermined() {
        XCTAssertEqual(DoubleCheck.status([SourceObservation(source: .ndl, rawText: "2026-12-04", fetchedAt: t0)]), .single)
        let u = [SourceObservation(source: .ndl, rawText: "2026年12月", fetchedAt: t0)]
        XCTAssertEqual(DoubleCheck.status(u), .none)
        XCTAssertEqual(DoubleCheck.effective(u, chosen: nil).parsed, .undetermined(text: "2026年12月"))
    }

    func testDateChange() {
        let a = ParsedDate.exact(year: 2026, month: 12, day: 4)
        let b = ParsedDate.exact(year: 2027, month: 1, day: 8)
        XCTAssertEqual(DateChange.detect(old: .undetermined(text: "2026年12月"), new: a), .confirmed(new: a))
        XCTAssertEqual(DateChange.detect(old: a, new: b), .changed(old: a, new: b))
        XCTAssertEqual(DateChange.detect(old: a, new: a), .none)
    }
}

final class GameDayTests: XCTestCase {
    var cal: Calendar { MKCalendar.japan }
    func testDoneResetsAtResetTime() {
        let done = cal.date(from: DateComponents(year: 2026, month: 11, day: 9, hour: 22))!
        let beforeReset = cal.date(from: DateComponents(year: 2026, month: 11, day: 10, hour: 3))!
        let afterReset = cal.date(from: DateComponents(year: 2026, month: 11, day: 10, hour: 5))!
        XCTAssertTrue(GameDay.isDone(doneAt: done, now: beforeReset, hour: 4, minute: 0, calendar: cal))
        XCTAssertFalse(GameDay.isDone(doneAt: done, now: afterReset, hour: 4, minute: 0, calendar: cal))
        XCTAssertEqual(GameDay.nextReset(after: beforeReset, hour: 4, minute: 0, calendar: cal),
                       cal.date(from: DateComponents(year: 2026, month: 11, day: 10, hour: 4)))
    }
}

final class APIParsingTests: XCTestCase {
    func fixture(_ name: String) throws -> Data {
        let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: nil, subdirectory: "Fixtures"))
        return try Data(contentsOf: url)
    }

    func testNDLParse() throws {
        let recs = NDLOpenSearch.parse(try fixture("ndl_jpro_book.xml"))
        XCTAssertEqual(recs.count, 3)
        XCTAssertEqual(recs[0].title, "森羅記")
        XCTAssertEqual(recs[0].volumeNumber, 4)
        XCTAssertFalse(recs[0].parsedDate.isExact) // 2026-12（月まで）
        let jpro = try XCTUnwrap(recs.first { $0.isJPRO })
        XCTAssertEqual(jpro.isbn, "9784087902570")
        XCTAssertEqual(jpro.parsedDate, .exact(year: 2026, month: 12, day: 1))
        XCTAssertEqual(jpro.publisher, "集英社")
    }

    func testNDLURL() {
        let u = NDLOpenSearch.url(query: "978-4-08-790257-0", kind: .paper)!.absoluteString
        XCTAssertTrue(u.contains("dpid=jpro-book"))
        XCTAssertTrue(u.contains("isbn=9784087902570"))
        let t = NDLOpenSearch.url(query: "呪術廻戦", kind: .digital)!.absoluteString
        XCTAssertTrue(t.contains("dpid=jpro-online"))
        XCTAssertTrue(t.contains("title="))
    }

    func testAnnictDecode() throws {
        let w = try JSONDecoder().decode(AnnictWorksResponse.self, from: try fixture("annict_works.json"))
        XCTAssertEqual(w.works.count, 2)
        XCTAssertEqual(w.works[0].imageURL, "http://shirobako-anime.com/images/ogp.jpg")
        XCTAssertNil(w.works[1].imageURL)
        let p = try JSONDecoder().decode(AnnictProgramsResponse.self, from: try fixture("annict_programs.json"))
        XCTAssertEqual(p.programs.first?.workID, 4681)
        XCTAssertEqual(p.programs.first?.channelName, "日本テレビ")
        XCTAssertEqual(p.programs.first?.startedAt, AnnictAPI.parseDate("2016-05-07T20:10:00Z"))
        XCTAssertTrue(AnnictAPI.programsURL(workIDs: [1, 2], after: Date(timeIntervalSince1970: 0))!.absoluteString.contains("filter_work_ids=1,2"))
    }
}
