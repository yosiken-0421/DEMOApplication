import Foundation
import SwiftUI
import SwiftData
import UniformTypeIdentifiers

/// JSON バックアップ（書き出し／読み込み）。同じ ID の項目は上書き、無いものは追加。
struct BackupFile: Codable {
    var format = "machikane-backup"
    var version = 1
    var exportedAt = Date()
    var items: [ItemDTO]
    var timers: [TimerDTO]

    struct ItemDTO: Codable {
        var id: UUID
        var categoryRaw: String
        var title: String
        var subtitle: String
        var imageURLString: String
        var createdAt: Date
        var memo: String
        var isArchived: Bool
        var mainDate: Date?
        var mainDateText: String
        var hasTime: Bool
        var mainSourceRaw: String
        var mainFetchedAt: Date?
        var isManualOverride: Bool
        var observationsData: Data?
        var chosenSourceRaw: String
        var isbn: String
        var publisher: String
        var seriesKeyword: String
        var ownedVolume: Int
        var targetVolume: Int
        var digitalISBN: String
        var digitalDate: Date?
        var digitalDateText: String
        var digitalSourceRaw: String
        var digitalFetchedAt: Date?
        var useDigitalDate: Bool
        var reserveDate: Date?
        var notifyOnReserve: Bool
        var weekday: Int
        var hour: Int
        var minute: Int
        var station: String
        var streamingService: String
        var streamingURLString: String
        var watchedEpisode: Int
        var totalEpisodes: Int
        var annictWorkID: Int
        var remindersData: Data?
        var dailyCountdownEnabled: Bool
        var dailyCountdownDays: Int
        var dailyCountdownHour: Int
        var dailyCountdownMinute: Int
        var calendarAlarm: Bool
    }

    struct TimerDTO: Codable {
        var id: UUID
        var name: String
        var createdAt: Date
        var sortOrder: Int
        var memo: String
        var waitFreeEnabled: Bool
        var waitFreeHours: Double
        var waitFreeStartedAt: Date?
        var dailyResetEnabled: Bool
        var resetHour: Int
        var resetMinute: Int
        var remindUndoneEnabled: Bool
        var remindHour: Int
        var remindMinute: Int
        var doneAt: Date?
        var eventName: String
        var eventStart: Date?
        var eventEnd: Date?
        var eventNotifyHoursData: Data?
    }
}

enum BackupService {
    static func make(items: [TrackedItem], timers: [GameTimer]) -> BackupFile {
        BackupFile(items: items.map { i -> BackupFile.ItemDTO in
            BackupFile.ItemDTO(id: i.id, categoryRaw: i.categoryRaw, title: i.title, subtitle: i.subtitle, imageURLString: i.imageURLString,
                  createdAt: i.createdAt, memo: i.memo, isArchived: i.isArchived, mainDate: i.mainDate, mainDateText: i.mainDateText,
                  hasTime: i.hasTime, mainSourceRaw: i.mainSourceRaw, mainFetchedAt: i.mainFetchedAt, isManualOverride: i.isManualOverride,
                  observationsData: i.observationsData, chosenSourceRaw: i.chosenSourceRaw, isbn: i.isbn, publisher: i.publisher,
                  seriesKeyword: i.seriesKeyword, ownedVolume: i.ownedVolume, targetVolume: i.targetVolume, digitalISBN: i.digitalISBN,
                  digitalDate: i.digitalDate, digitalDateText: i.digitalDateText, digitalSourceRaw: i.digitalSourceRaw,
                  digitalFetchedAt: i.digitalFetchedAt, useDigitalDate: i.useDigitalDate, reserveDate: i.reserveDate,
                  notifyOnReserve: i.notifyOnReserve, weekday: i.weekday, hour: i.hour, minute: i.minute, station: i.station,
                  streamingService: i.streamingService, streamingURLString: i.streamingURLString, watchedEpisode: i.watchedEpisode,
                  totalEpisodes: i.totalEpisodes, annictWorkID: i.annictWorkID, remindersData: i.remindersData,
                  dailyCountdownEnabled: i.dailyCountdownEnabled, dailyCountdownDays: i.dailyCountdownDays,
                  dailyCountdownHour: i.dailyCountdownHour, dailyCountdownMinute: i.dailyCountdownMinute, calendarAlarm: i.calendarAlarm)
        }, timers: timers.map { t -> BackupFile.TimerDTO in
            BackupFile.TimerDTO(id: t.id, name: t.name, createdAt: t.createdAt, sortOrder: t.sortOrder, memo: t.memo, waitFreeEnabled: t.waitFreeEnabled,
                  waitFreeHours: t.waitFreeHours, waitFreeStartedAt: t.waitFreeStartedAt, dailyResetEnabled: t.dailyResetEnabled,
                  resetHour: t.resetHour, resetMinute: t.resetMinute, remindUndoneEnabled: t.remindUndoneEnabled, remindHour: t.remindHour,
                  remindMinute: t.remindMinute, doneAt: t.doneAt, eventName: t.eventName, eventStart: t.eventStart, eventEnd: t.eventEnd,
                  eventNotifyHoursData: t.eventNotifyHoursData)
        })
    }

    static func encode(_ b: BackupFile) throws -> Data {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        e.dateEncodingStrategy = .iso8601
        return try e.encode(b)
    }

    static func decode(_ data: Data) throws -> BackupFile {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        let b = try d.decode(BackupFile.self, from: data)
        guard b.format == "machikane-backup" else { throw CocoaError(.fileReadCorruptFile) }
        return b
    }

    /// 戻り値: (項目数, タイマー数)
    @MainActor
    static func restore(_ b: BackupFile, into context: ModelContext) -> (Int, Int) {
        let items = (try? context.fetch(FetchDescriptor<TrackedItem>())) ?? []
        let timers = (try? context.fetch(FetchDescriptor<GameTimer>())) ?? []
        for d in b.items {
            let i = items.first { $0.id == d.id } ?? {
                let n = TrackedItem(category: .manga, title: d.title)
                context.insert(n)
                return n
            }()
            i.id = d.id; i.categoryRaw = d.categoryRaw; i.title = d.title; i.subtitle = d.subtitle; i.imageURLString = d.imageURLString
            i.createdAt = d.createdAt; i.memo = d.memo; i.isArchived = d.isArchived; i.mainDate = d.mainDate; i.mainDateText = d.mainDateText
            i.hasTime = d.hasTime; i.mainSourceRaw = d.mainSourceRaw; i.mainFetchedAt = d.mainFetchedAt; i.isManualOverride = d.isManualOverride
            i.observationsData = d.observationsData; i.chosenSourceRaw = d.chosenSourceRaw; i.isbn = d.isbn; i.publisher = d.publisher
            i.seriesKeyword = d.seriesKeyword; i.ownedVolume = d.ownedVolume; i.targetVolume = d.targetVolume; i.digitalISBN = d.digitalISBN
            i.digitalDate = d.digitalDate; i.digitalDateText = d.digitalDateText; i.digitalSourceRaw = d.digitalSourceRaw
            i.digitalFetchedAt = d.digitalFetchedAt; i.useDigitalDate = d.useDigitalDate; i.reserveDate = d.reserveDate
            i.notifyOnReserve = d.notifyOnReserve; i.weekday = d.weekday; i.hour = d.hour; i.minute = d.minute; i.station = d.station
            i.streamingService = d.streamingService; i.streamingURLString = d.streamingURLString; i.watchedEpisode = d.watchedEpisode
            i.totalEpisodes = d.totalEpisodes; i.annictWorkID = d.annictWorkID; i.remindersData = d.remindersData
            i.dailyCountdownEnabled = d.dailyCountdownEnabled; i.dailyCountdownDays = d.dailyCountdownDays
            i.dailyCountdownHour = d.dailyCountdownHour; i.dailyCountdownMinute = d.dailyCountdownMinute; i.calendarAlarm = d.calendarAlarm
        }
        for d in b.timers {
            let t = timers.first { $0.id == d.id } ?? {
                let n = GameTimer(name: d.name)
                context.insert(n)
                return n
            }()
            t.id = d.id; t.name = d.name; t.createdAt = d.createdAt; t.sortOrder = d.sortOrder; t.memo = d.memo
            t.waitFreeEnabled = d.waitFreeEnabled; t.waitFreeHours = d.waitFreeHours; t.waitFreeStartedAt = d.waitFreeStartedAt
            t.dailyResetEnabled = d.dailyResetEnabled; t.resetHour = d.resetHour; t.resetMinute = d.resetMinute
            t.remindUndoneEnabled = d.remindUndoneEnabled; t.remindHour = d.remindHour; t.remindMinute = d.remindMinute; t.doneAt = d.doneAt
            t.eventName = d.eventName; t.eventStart = d.eventStart; t.eventEnd = d.eventEnd; t.eventNotifyHoursData = d.eventNotifyHoursData
        }
        try? context.save()
        return (b.items.count, b.timers.count)
    }
}

/// fileExporter 用
struct BackupDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data

    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws {
        guard let d = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }
        data = d
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}
