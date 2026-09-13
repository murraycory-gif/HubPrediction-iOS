import Foundation

enum KalshiClient {
    static let kalshi = "https://external-api.kalshi.com/trade-api/v2"
    static let series = "KXBTC15M"

    static func fetchJSON(_ url: URL, timeout: TimeInterval) async throws -> Any {
        var req = URLRequest(url: url)
        req.setValue("HUB-Prediction/1.0", forHTTPHeaderField: "User-Agent")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.timeoutInterval = timeout
        let (data, resp) = try await URLSession.shared.data(for: req)
        if let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw URLError(.badServerResponse)
        }
        return try JSONSerialization.jsonObject(with: data)
    }

    static func num(_ v: Any?) -> Double? {
        if let n = v as? Double { return n.isFinite ? n : nil }
        if let n = v as? Int { return Double(n) }
        if let n = v as? NSNumber { return n.doubleValue }
        if let s = v as? String, let n = Double(s), n.isFinite { return n }
        return nil
    }

    static func askCents(_ m: [String: Any], yes: Bool) -> Double {
        let dollars = num(m[yes ? "yes_ask_dollars" : "no_ask_dollars"])
        if let dollars { return (dollars * 100.0).rounded() }
        return num(m[yes ? "yes_ask" : "no_ask"]) ?? 0
    }

    static func pickOpen(_ markets: [[String: Any]], now: Double) -> [String: Any]? {
        let live = markets.filter { m in
            let open = Date.parse(m["open_time"])
            let close = Date.parse(m["close_time"])
            return open.isFinite && close.isFinite && open <= now && now < close
        }
        let pool = live.isEmpty ? markets : live
        return pool.min { Date.parse($0["close_time"]) < Date.parse($1["close_time"]) }
    }

    static func marketToQuote(_ m: [String: Any], live: Double, source: String, now: Double) -> Quote {
        let openAt = Date.parse(m["open_time"])
        let closeAt = Date.parse(m["close_time"])
        return Quote(
            ticker: String(describing: m["ticker"] ?? ""),
            yesAsk: askCents(m, yes: true),
            noAsk: askCents(m, yes: false),
            strike: num(m["floor_strike"]) ?? num(m["strike_price"]) ?? live,
            live: live,
            liveSource: source,
            openAt: openAt.isFinite ? openAt : ChicagoTime.align15(now),
            closeAt: closeAt.isFinite ? closeAt : (openAt.isFinite ? openAt : ChicagoTime.align15(now)) + 15.0 * HubMs.minute,
            fetchedAt: now
        )
    }

    static func fetchCoinbase(timeout: TimeInterval) async throws -> Double {
        let url = URL(string: "https://api.coinbase.com/v2/prices/BTC-USD/spot")!
        let json = try await fetchJSON(url, timeout: timeout)
        let obj = json as? [String: Any]
        let data = obj?["data"] as? [String: Any]
        guard let px = num(data?["amount"]) else { throw URLError(.cannotParseResponse) }
        return px
    }

    static func fetchStatus(timeout: TimeInterval = 0.8) async -> (exchangeActive: Bool, tradingActive: Bool)? {
        guard let url = URL(string: "\(kalshi)/exchange/status") else { return nil }
        guard let json = try? await fetchJSON(url, timeout: timeout) as? [String: Any] else { return nil }
        let indexes = json["exchange_index_statuses"] as? [[String: Any]] ?? []
        let crypto = indexes.first { ($0["exchange_index"] as? Int) == 2 }
        let exchange = (crypto?["exchange_active"] as? Bool) ?? (json["exchange_active"] as? Bool) ?? false
        let trading = (crypto?["trading_active"] as? Bool) ?? (json["trading_active"] as? Bool) ?? false
        return (exchange, trading)
    }

    static func fetchMarkets(status: String, limit: Int, timeout: TimeInterval) async -> [[String: Any]] {
        let urlS = "\(kalshi)/markets?series_ticker=\(series)&status=\(status)&limit=\(limit)"
        guard let url = URL(string: urlS) else { return [] }
        guard let json = try? await fetchJSON(url, timeout: timeout) as? [String: Any] else { return [] }
        return json["markets"] as? [[String: Any]] ?? []
    }

    static func settledFromMarkets(_ markets: [[String: Any]]) -> [Settled] {
        markets.compactMap { m in
            let result = String(describing: m["result"] ?? "").lowercased()
            guard result == "yes" || result == "no" else { return nil }
            return Settled(
                ticker: String(describing: m["ticker"] ?? ""),
                closeAt: Date.parse(m["close_time"]),
                result: result == "yes" ? .up : .down
            )
        }
        .sorted { $0.closeAt > $1.closeAt }
        .prefix(24)
        .map { $0 }
    }

    static func fetchCandles(startMs: Double, endMs: Double, gran: Int, timeout: TimeInterval) async -> [Point] {
        let df = ISO8601DateFormatter()
        df.formatOptions = [.withInternetDateTime]
        let start = df.string(from: Date(timeIntervalSince1970: startMs / 1000.0))
        let end = df.string(from: Date(timeIntervalSince1970: endMs / 1000.0))
        let encStart = start.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? start
        let encEnd = end.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? end
        let urlS = "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=\(gran)&start=\(encStart)&end=\(encEnd)"
        guard let url = URL(string: urlS) else { return [] }
        guard let raw = try? await fetchJSON(url, timeout: timeout) as? [Any] else { return [] }
        var pts: [Point] = []
        for row in raw {
            guard let arr = row as? [Any], arr.count >= 5 else { continue }
            let t = (num(arr[0]) ?? 0) * 1000.0
            let px = num(arr[4]) ?? 0
            if t.isFinite, px.isFinite, px > 1000 {
                pts.append(Point(t: t, px: px))
            }
        }
        return pts.sorted { $0.t < $1.t }
    }
}

extension Date {
    static func parse(_ v: Any?) -> Double {
        guard let s = v as? String else { return .nan }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d.timeIntervalSince1970 * 1000.0 }
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: s) { return d.timeIntervalSince1970 * 1000.0 }
        return .nan
    }
}
