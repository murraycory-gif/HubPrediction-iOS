import Foundation

enum SizeCash {
    static let maxContracts = 25

    /// Lock up to 40% of cash, risk ~8%, quarter-Kelly. Safe default size.
    static func contractsFromCash(cash: Double, askCents: Double, pWin: Double) -> Int {
        let ask = askCents / 100.0
        guard cash.isFinite, ask.isFinite, pWin.isFinite else { return 0 }
        guard cash > 0, ask > 0.01, ask < 0.99 else { return 0 }
        let b = (1 - ask) / ask
        let kelly = (pWin * b - (1 - pWin)) / b
        let quarter = max(0.0, kelly * 0.25)
        let lockCap = cash * 0.4
        let riskCap = cash * 0.08
        let stake = min(lockCap, cash * quarter, riskCap / ask)
        if stake < ask {
            if pWin >= 0.68 && cash >= ask * 2 { return 2 }
            if pWin >= 0.62 && cash >= ask { return 1 }
            return 0
        }
        var n = Int(floor(stake / ask))
        if pWin >= 0.7 && n < 2 && cash >= ask * 2 { n = 2 }
        return min(maxContracts, max(0, n))
    }

    /// Expected dollars if we buy `count` at ask with win probability pWin.
    static func expectedProfit(count: Int, askCents: Double, pWin: Double) -> Double {
        let ask = askCents / 100.0
        guard count > 0, ask.isFinite, pWin.isFinite, ask > 0.01, ask < 0.99 else { return 0 }
        let ev = pWin * (1 - ask) - (1 - pWin) * ask
        return Double(count) * ev
    }

    static func cashFromBalance(_ raw: Any?) -> Double {
        guard let o = raw as? [String: Any] else { return 0 }
        if let n = KalshiClient.num(o["balance_dollars"] ?? o["cash_dollars"] ?? o["available_balance_dollars"]) {
            return n
        }
        if let n = KalshiClient.num(o["balance"] ?? o["cash"] ?? o["available_balance"]) {
            return n > 5000 ? n / 100.0 : n
        }
        return 0
    }
}
