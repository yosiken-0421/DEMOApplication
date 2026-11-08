import Foundation
import MachikaneCore

enum ClientError: LocalizedError {
    case badURL, http(Int), noToken, unauthorized
    var errorDescription: String? {
        switch self {
        case .badURL: return "検索条件が正しくありません"
        case let .http(code): return "サーバーからエラーが返りました（HTTP \(code)）"
        case .noToken: return "Annict のアクセストークンが設定されていません"
        case .unauthorized: return "Annict のアクセストークンが正しくないか、期限切れです"
        }
    }
}

/// 国立国会図書館サーチ（OpenSearch）。同時リクエスト数に制限があるため、常に 1 件ずつ順番に送る。
actor NDLClient {
    static let shared = NDLClient()
    private var lastRequest = Date.distantPast

    func search(_ query: String, kind: NDLOpenSearch.Kind, count: Int = 30) async throws -> [NDLRecord] {
        guard let url = NDLOpenSearch.url(query: query, kind: kind, count: count) else { throw ClientError.badURL }
        // 連続アクセスを避けるため最低 1 秒あける
        let wait = 1.0 - Date().timeIntervalSince(lastRequest)
        if wait > 0 { try await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
        lastRequest = Date()
        var req = URLRequest(url: url)
        req.timeoutInterval = 20
        let (data, resp) = try await URLSession.shared.data(for: req)
        if let h = resp as? HTTPURLResponse, h.statusCode != 200 { throw ClientError.http(h.statusCode) }
        return NDLOpenSearch.parse(data)
    }

    /// ISBN で 1 件。JPRO のレコードを優先。
    func record(isbn: String, kind: NDLOpenSearch.Kind) async throws -> NDLRecord? {
        let target = TextNormalizer.isbn(isbn)
        let recs = try await search(target, kind: kind, count: 10)
        let matched = recs.filter { $0.isbn == target || target.isEmpty }
        return matched.first(where: \.isJPRO) ?? matched.first ?? recs.first(where: \.isJPRO)
    }
}

/// Annict REST API v1。トークンは Keychain から読む。
actor AnnictClient {
    static let shared = AnnictClient()

    private func get<T: Decodable>(_ url: URL?, as type: T.Type) async throws -> T {
        guard let token = KeychainStore.annictToken, !token.isEmpty else { throw ClientError.noToken }
        guard let url else { throw ClientError.badURL }
        let (data, resp) = try await URLSession.shared.data(for: AnnictAPI.request(url, token: token))
        if let h = resp as? HTTPURLResponse {
            if h.statusCode == 401 { throw ClientError.unauthorized }
            if h.statusCode != 200 { throw ClientError.http(h.statusCode) }
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    func searchWorks(_ title: String) async throws -> [AnnictWork] {
        try await get(AnnictAPI.worksURL(title: title), as: AnnictWorksResponse.self).works
    }

    func episodes(workID: Int) async throws -> [AnnictEpisode] {
        try await get(AnnictAPI.episodesURL(workID: workID), as: AnnictEpisodesResponse.self).episodes
    }

    /// 自分が Annict で「見てる」作品の放送予定（/v1/me/programs）
    func programs(workIDs: [Int], after: Date) async throws -> [AnnictProgram] {
        try await get(AnnictAPI.programsURL(workIDs: workIDs, after: after), as: AnnictProgramsResponse.self).programs
    }
}
