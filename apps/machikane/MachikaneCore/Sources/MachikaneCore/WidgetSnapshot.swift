import Foundation

/// アプリ → ウィジェットへ渡す「近い順の一覧」。App Group の UserDefaults に JSON で保存する。
public struct WidgetSnapshot: Codable, Sendable, Equatable {
    public struct Entry: Codable, Sendable, Equatable, Identifiable {
        public var id: String
        public var title: String
        public var subtitle: String
        public var category: ItemCategory
        public var date: Date
        public var hasTime: Bool
        public var createdAt: Date

        public init(id: String, title: String, subtitle: String, category: ItemCategory, date: Date, hasTime: Bool, createdAt: Date) {
            self.id = id
            self.title = title
            self.subtitle = subtitle
            self.category = category
            self.date = date
            self.hasTime = hasTime
            self.createdAt = createdAt
        }
    }

    public var entries: [Entry]
    public var generatedAt: Date

    public init(entries: [Entry], generatedAt: Date) {
        self.entries = entries
        self.generatedAt = generatedAt
    }

    public static let defaultsKey = "widgetSnapshot.v1"

    /// now の時点で「今日以降」のものを近い順に。
    public func upcoming(now: Date, calendar: Calendar = .current) -> [Entry] {
        entries
            .filter { Countdown.daysUntil($0.date, from: now, calendar: calendar) >= 0 }
            .sorted { $0.date < $1.date }
    }

    public static func load(suite: String?) -> WidgetSnapshot? {
        guard let suite, let d = UserDefaults(suiteName: suite)?.data(forKey: defaultsKey) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: d)
    }

    public func save(suite: String?) {
        guard let suite, let d = try? JSONEncoder().encode(self) else { return }
        UserDefaults(suiteName: suite)?.set(d, forKey: Self.defaultsKey)
    }
}
