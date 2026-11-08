import Foundation

/// Annict REST API v1（https://docs.annict.com/docs/ja/api/v1 ）
///   ベース URI: https://api.annict.com
///   認証: Authorization: Bearer <アクセストークン>（個人用アクセストークン）
///   GET /v1/works        filter_title, per_page(最大50), sort_watchers_count
///   GET /v1/episodes     filter_work_id, sort_sort_number, per_page
///   GET /v1/me/programs  filter_work_ids, filter_started_at_gt（UTC "YYYY/MM/DD HH:MM"）, sort_started_at
///   日付は ISO 8601（UTC）
public enum AnnictAPI {
    public static let base = "https://api.annict.com"

    public static func worksURL(title: String, page: Int = 1) -> URL? {
        var c = URLComponents(string: base + "/v1/works")!
        c.queryItems = [
            .init(name: "filter_title", value: title),
            .init(name: "sort_watchers_count", value: "desc"),
            .init(name: "per_page", value: "30"),
            .init(name: "page", value: String(page))
        ]
        return c.url
    }

    public static func episodesURL(workID: Int) -> URL? {
        var c = URLComponents(string: base + "/v1/episodes")!
        c.queryItems = [
            .init(name: "filter_work_id", value: String(workID)),
            .init(name: "sort_sort_number", value: "asc"),
            .init(name: "per_page", value: "50")
        ]
        return c.url
    }

    public static func programsURL(workIDs: [Int], after: Date) -> URL? {
        guard !workIDs.isEmpty else { return nil }
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy/MM/dd HH:mm"
        var c = URLComponents(string: base + "/v1/me/programs")!
        c.queryItems = [
            .init(name: "filter_work_ids", value: workIDs.map(String.init).joined(separator: ",")),
            .init(name: "filter_started_at_gt", value: f.string(from: after)),
            .init(name: "sort_started_at", value: "asc"),
            .init(name: "per_page", value: "50")
        ]
        return c.url
    }

    public static func request(_ url: URL, token: String) -> URLRequest {
        var r = URLRequest(url: url)
        r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        r.timeoutInterval = 20
        return r
    }

    public static func parseDate(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }
}

public struct AnnictWork: Decodable, Hashable, Sendable, Identifiable {
    public var id: Int
    public var title: String
    public var mediaText: String?
    public var seasonNameText: String?
    public var releasedOn: String?
    public var officialSiteURL: String?
    public var episodesCount: Int?
    public var imageURL: String?

    enum CodingKeys: String, CodingKey {
        case id, title, images
        case mediaText = "media_text"
        case seasonNameText = "season_name_text"
        case releasedOn = "released_on"
        case officialSiteURL = "official_site_url"
        case episodesCount = "episodes_count"
    }
    struct Images: Decodable { var recommended_url: String? }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        mediaText = (try? c.decodeIfPresent(String.self, forKey: .mediaText)) ?? nil
        seasonNameText = (try? c.decodeIfPresent(String.self, forKey: .seasonNameText)) ?? nil
        releasedOn = (try? c.decodeIfPresent(String.self, forKey: .releasedOn)) ?? nil
        officialSiteURL = (try? c.decodeIfPresent(String.self, forKey: .officialSiteURL)) ?? nil
        episodesCount = (try? c.decodeIfPresent(Int.self, forKey: .episodesCount)) ?? nil
        let img: Images? = (try? c.decodeIfPresent(Images.self, forKey: .images)) ?? nil
        let u = img?.recommended_url ?? ""
        imageURL = u.isEmpty ? nil : u
    }
}

public struct AnnictEpisode: Decodable, Hashable, Sendable, Identifiable {
    public var id: Int
    public var numberText: String?
    public var sortNumber: Int?
    public var title: String?

    enum CodingKeys: String, CodingKey {
        case id, title
        case numberText = "number_text"
        case sortNumber = "sort_number"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        numberText = (try? c.decodeIfPresent(String.self, forKey: .numberText)) ?? nil
        sortNumber = (try? c.decodeIfPresent(Int.self, forKey: .sortNumber)) ?? nil
        title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? nil
    }
}

public struct AnnictProgram: Decodable, Hashable, Sendable, Identifiable {
    public var id: Int
    public var startedAt: Date?
    public var isRebroadcast: Bool
    public var channelName: String?
    public var workID: Int?
    public var episodeNumberText: String?

    enum CodingKeys: String, CodingKey {
        case id, channel, work, episode
        case startedAt = "started_at"
        case isRebroadcast = "is_rebroadcast"
    }
    struct Channel: Decodable { var name: String? }
    struct WorkRef: Decodable { var id: Int? }
    struct EpisodeRef: Decodable { var number_text: String? }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        let started: String? = (try? c.decodeIfPresent(String.self, forKey: .startedAt)) ?? nil
        startedAt = started.flatMap(AnnictAPI.parseDate)
        isRebroadcast = (try? c.decodeIfPresent(Bool.self, forKey: .isRebroadcast)) ?? false
        let ch: Channel? = (try? c.decodeIfPresent(Channel.self, forKey: .channel)) ?? nil
        channelName = ch?.name
        let w: WorkRef? = (try? c.decodeIfPresent(WorkRef.self, forKey: .work)) ?? nil
        workID = w?.id
        let e: EpisodeRef? = (try? c.decodeIfPresent(EpisodeRef.self, forKey: .episode)) ?? nil
        episodeNumberText = e?.number_text
    }
}

public struct AnnictWorksResponse: Decodable, Sendable { public var works: [AnnictWork] }
public struct AnnictEpisodesResponse: Decodable, Sendable { public var episodes: [AnnictEpisode] }
public struct AnnictProgramsResponse: Decodable, Sendable { public var programs: [AnnictProgram] }
