import Foundation

enum KalshiTrade {
    static let ordersPath = "/trade-api/v2/portfolio/orders"
    static let eventsOrdersPath = "/trade-api/v2/portfolio/events/orders"
    static let balancePath = "/trade-api/v2/portfolio/balance"

    static func fetchCash() async throws -> Double {
        let json = try await KalshiAuth.signedJSON(method: "GET", path: balancePath)
        return SizeCash.cashFromBalance(json)
    }

    /// Live Kalshi only. Paper must call `PaperBook.place` and never this method.
    static func placeLive(ticker: String, side: DeskSide, count: Int, yesAsk: Double, noAsk: Double) async throws -> String {
        guard PaperBook.mode == .live else {
            throw KalshiAuthError.http(403, "Paper mode must not POST live Kalshi orders.")
        }
        guard side == .up || side == .down else { throw KalshiAuthError.http(400, "Pick UP or DOWN.") }
        let n = min(SizeCash.maxContracts, max(1, count))
        let cents = side == .up ? yesAsk : noAsk
        let priceCents = Int(min(99, max(1, cents.rounded())))
        let price = String(format: "%.4f", Double(priceCents) / 100.0)
        let id = UUID().uuidString
        var primary: [String: Any] = [
            "ticker": ticker,
            "side": side == .up ? "yes" : "no",
            "action": "buy",
            "count": n,
            "type": "limit",
            "client_order_id": id,
        ]
        primary[side == .up ? "yes_price" : "no_price"] = priceCents
        do {
            let json = try await KalshiAuth.signedJSON(method: "POST", path: ordersPath, body: primary)
            return orderId(json) ?? "placed \(n) \(side == .up ? "UP" : "DOWN")"
        } catch {
            let fallback: [String: Any] = [
                "ticker": ticker,
                "side": "bid",
                "count": String(n),
                "price": price,
                "time_in_force": "immediate_or_cancel",
                "client_order_id": UUID().uuidString,
            ]
            let json = try await KalshiAuth.signedJSON(method: "POST", path: eventsOrdersPath, body: fallback)
            return orderId(json) ?? "placed \(n) \(side == .up ? "UP" : "DOWN")"
        }
    }

    private static func orderId(_ json: Any) -> String? {
        let obj = json as? [String: Any]
        let order = obj?["order"] as? [String: Any]
        if let id = order?["order_id"] as? String { return id }
        if let id = obj?["order_id"] as? String { return id }
        return nil
    }
}
