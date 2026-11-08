import Foundation
#if canImport(FoundationXML)
import FoundationXML
#endif

/// 国立国会図書館サーチ OpenSearch。
/// 仕様: 「国立国会図書館サーチ 外部提供インタフェース仕様書（第1.5版, 2026.9.25）」4. OpenSearch
///   リクエスト: https://ndlsearch.ndl.go.jp/api/opensearch?dpid=[dpid]&title=[title]&...
///   使用する引数: dpid / title / isbn / cnt（既定 200、最大 500）
///   返戻: RSS 2.0 を拡張した XML
/// データプロバイダ ID（附録1）:
///   jpro-book   = 出版情報登録センター（JPRO）（紙書籍）  … 近刊情報を含む
///   jpro-online = 出版情報登録センター（JPRO）（電子書籍）
///   レコード ID の接頭辞 R100000137 = JPRO
public enum NDLOpenSearch {
    public static let endpoint = "https://ndlsearch.ndl.go.jp/api/opensearch"
    public static let jproRecordPrefix = "R100000137"

    public enum Kind: String, CaseIterable, Sendable {
        case paper = "jpro-book"
        case digital = "jpro-online"

        public var displayName: String { self == .paper ? "紙の本" : "電子書籍" }
    }

    /// query が ISBN（10 桁または 13 桁）なら isbn 検索、それ以外は title 検索。
    public static func url(query: String, kind: Kind, count: Int = 30) -> URL? {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return nil }
        var comps = URLComponents(string: endpoint)!
        var items = [URLQueryItem(name: "dpid", value: kind.rawValue)]
        let isbn = TextNormalizer.isbn(q)
        if (isbn.count == 10 || isbn.count == 13), isbn.count >= q.filter({ !$0.isWhitespace && $0 != "-" }).count {
            items.append(URLQueryItem(name: "isbn", value: isbn))
        } else {
            items.append(URLQueryItem(name: "title", value: q))
        }
        items.append(URLQueryItem(name: "cnt", value: String(min(max(count, 1), 500))))
        comps.queryItems = items
        return comps.url
    }

    public static func parse(_ data: Data) -> [NDLRecord] {
        let delegate = RSSDelegate()
        let parser = XMLParser(data: data)
        parser.shouldProcessNamespaces = false
        parser.delegate = delegate
        parser.parse()
        return delegate.records
    }
}

public struct NDLRecord: Hashable, Sendable, Identifiable {
    public var id: String { link.isEmpty ? title + isbn : link }
    public var title: String
    public var volume: String
    public var volumeTitle: String
    public var creators: [String]
    public var publisher: String
    public var isbn: String
    /// dc:date（W3CDTF）を優先し、無ければ dcterms:issued の文字列
    public var dateText: String
    public var link: String

    public var isJPRO: Bool { link.contains(NDLOpenSearch.jproRecordPrefix) }
    public var volumeNumber: Int? { TextNormalizer.volumeNumber(volume) }
    public var parsedDate: ParsedDate { JapaneseDateParser.parse(dateText) }

    public var displayTitle: String {
        var t = title
        if !volume.isEmpty { t += " \(TextNormalizer.halfWidthDigits(volume))" }
        if !volumeTitle.isEmpty { t += " \(volumeTitle)" }
        return t
    }
}

private final class RSSDelegate: NSObject, XMLParserDelegate {
    var records: [NDLRecord] = []
    private var inItem = false
    private var text = ""
    private var attrs: [String: String] = [:]
    private var cur = Fields()

    struct Fields {
        var title = "", dcTitle = "", volume = "", volumeTitle = "", publisher = "", isbn = ""
        var dcDate = "", issued = "", link = ""
        var creators: [String] = []
    }

    func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?, qualifiedName: String?, attributes: [String: String] = [:]) {
        if name == "item" { inItem = true; cur = Fields() }
        text = ""
        attrs = attributes
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) { text += string }

    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) {
        // description の CDATA は使わない
    }

    func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
        guard inItem else { return }
        let v = text.trimmingCharacters(in: .whitespacesAndNewlines)
        switch name {
        case "title": cur.title = v
        case "dc:title": cur.dcTitle = v
        case "link": cur.link = v
        case "dcndl:volume": if cur.volume.isEmpty { cur.volume = v }
        case "dcndl:volumeTitle": if cur.volumeTitle.isEmpty { cur.volumeTitle = v }
        case "dc:creator": if !v.isEmpty { cur.creators.append(v) }
        case "dc:publisher": if cur.publisher.isEmpty { cur.publisher = v }
        case "dc:date": if cur.dcDate.isEmpty { cur.dcDate = v }
        case "dcterms:issued": if cur.issued.isEmpty { cur.issued = v }
        case "dc:identifier":
            let type = attrs["xsi:type"] ?? ""
            if (type == "dcndl:ISBN" || type == "dcndl:ISBN13"), cur.isbn.isEmpty || type == "dcndl:ISBN13" {
                cur.isbn = TextNormalizer.isbn(v)
            }
        case "item":
            inItem = false
            let date = !cur.dcDate.isEmpty ? cur.dcDate : cur.issued
            records.append(NDLRecord(
                title: cur.dcTitle.isEmpty ? cur.title : cur.dcTitle,
                volume: cur.volume,
                volumeTitle: cur.volumeTitle,
                creators: cur.creators,
                publisher: cur.publisher,
                isbn: cur.isbn,
                dateText: date,
                link: cur.link))
        default: break
        }
        text = ""
    }
}
