import Foundation

enum KalshiClient {
    static let kalshi = "https://external-api.kalshi.com/trade-api/v2"
    static let defaultSeries = "KXBTC15M"

    /// Short, no wait-for-connectivity — Mac Catalyst `URLSession.shared` can stall a live desk.
    static let session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 2.2
        c.timeoutIntervalForResource = 3.0
        c.waitsForConnectivity = false
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: c)
    }()

    static func fetchJSON(_ url: URL, timeout: TimeInterval) async throws -> Any {
        var req = URLRequest(url: url)
        req.setValue("HUB-Prediction/1.0", forHTTPHeaderField: "User-Agent")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.timeoutInterval = timeout
        req.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, resp) = try await session.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if !(200..<300).contains(code) {
            let msg = String(data: data, encoding: .utf8) ?? "http \(code)"
            throw KalshiAuthError.http(code, msg)
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

    static func pickToMarket(_ m: [String: Any]) -> MarketPick {
        MarketPick(
            ticker: String(describing: m["ticker"] ?? ""),
            title: String(describing: m["title"] ?? m["subtitle"] ?? m["ticker"] ?? ""),
            series: String(describing: m["series_ticker"] ?? defaultSeries),
            yesAsk: askCents(m, yes: true),
            noAsk: askCents(m, yes: false),
            closeAt: Date.parse(m["close_time"])
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

    static func fetchStatus(timeout: TimeInterval = 0.8) async throws -> (exchangeActive: Bool, tradingActive: Bool) {
        guard let url = URL(string: "\(kalshi)/exchange/status") else { throw URLError(.badURL) }
        let json = try await fetchJSON(url, timeout: timeout) as? [String: Any]
        let indexes = json?["exchange_index_statuses"] as? [[String: Any]] ?? []
        let crypto = indexes.first { ($0["exchange_index"] as? Int) == 2 }
        let exchange = (crypto?["exchange_active"] as? Bool) ?? (json?["exchange_active"] as? Bool) ?? false
        let trading = (crypto?["trading_active"] as? Bool) ?? (json?["trading_active"] as? Bool) ?? false
        return (exchange, trading)
    }

    static func fetchMarkets(series: String?, status: String, limit: Int, timeout: TimeInterval) async throws -> [[String: Any]] {
        var urlS = "\(kalshi)/markets?status=\(status)&limit=\(limit)"
        if let series, !series.isEmpty {
            urlS += "&series_ticker=\(series)"
        }
        guard let url = URL(string: urlS) else { throw URLError(.badURL) }
        let json = try await fetchJSON(url, timeout: timeout) as? [String: Any]
        return json?["markets"] as? [[String: Any]] ?? []
    }

    static func fetchMarket(ticker: String, timeout: TimeInterval) async throws -> [String: Any] {
        let enc = ticker.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? ticker
        guard let url = URL(string: "\(kalshi)/markets/\(enc)") else { throw URLError(.badURL) }
        let json = try await fetchJSON(url, timeout: timeout) as? [String: Any]
        if let m = json?["market"] as? [String: Any] { return m }
        if json?["ticker"] != nil { return json! }
        throw KalshiAuthError.http(404, "No market \(ticker)")
    }

    static func searchMarkets(query: String, timeout: TimeInterval = 2.2) async throws -> [MarketPick] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if q.isEmpty {
            return try await fetchMarkets(series: defaultSeries, status: "open", limit: 20, timeout: timeout)
                .map(pickToMarket)
                .filter { !$0.ticker.isEmpty }
        }
        let upper = q.uppercased()
        let asSeries = (try? await fetchMarkets(series: upper, status: "open", limit: 20, timeout: timeout)) ?? []
        if !asSeries.isEmpty {
            return asSeries.map(pickToMarket).filter { !$0.ticker.isEmpty }
        }
        if upper.contains("-") || upper.count >= 8 {
            if let one = try? await fetchMarket(ticker: upper, timeout: timeout) {
                return [pickToMarket(one)]
            }
        }
        let open = try await fetchMarkets(series: nil, status: "open", limit: 50, timeout: timeout)
        let needle = q.lowercased()
        return open.map(pickToMarket).filter {
            $0.ticker.lowercased().contains(needle) || $0.title.lowercased().contains(needle) || $0.series.lowercased().contains(needle)
        }
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

    static func fetchCandles(startMs: Double, endMs: Double, gran: Int, timeout: TimeInterval) async throws -> [Point] {
        try await fetchOHLC(startMs: startMs, endMs: endMs, gran: gran, timeout: timeout).map(\.point)
    }

    /// Coinbase bucket: [time, low, high, open, close, volume].
    static func fetchOHLC(startMs: Double, endMs: Double, gran: Int, timeout: TimeInterval) async throws -> [Candle] {
        let df = ISO8601DateFormatter()
        df.formatOptions = [.withInternetDateTime]
        let start = df.string(from: Date(timeIntervalSince1970: startMs / 1000.0))
        let end = df.string(from: Date(timeIntervalSince1970: endMs / 1000.0))
        let encStart = start.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? start
        let encEnd = end.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? end
        let urlS = "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=\(gran)&start=\(encStart)&end=\(encEnd)"
        guard let url = URL(string: urlS) else { throw URLError(.badURL) }
        guard let raw = try await fetchJSON(url, timeout: timeout) as? [Any] else { return [] }
        var out: [Candle] = []
        for row in raw {
            guard let arr = row as? [Any], arr.count >= 5 else { continue }
            let t = (num(arr[0]) ?? 0) * 1000.0
            let low = num(arr[1]) ?? 0
            let high = num(arr[2]) ?? 0
            let open = num(arr[3]) ?? 0
            let close = num(arr[4]) ?? 0
            if t.isFinite, close.isFinite, close > 1000 {
                out.append(Candle(t: t, open: open, high: high, low: low, close: close))
            }
        }
        return out.sorted { $0.t < $1.t }
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
