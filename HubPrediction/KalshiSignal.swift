import Foundation

enum KalshiSignal {
    private static func clamp(_ n: Double, _ lo: Double, _ hi: Double) -> Double {
        min(hi, max(lo, n))
    }

    static func kalshiCall(_ quote: Quote?) -> DeskCall {
        guard let quote, quote.live.isFinite, quote.strike.isFinite else {
            return DeskCall()
        }
        let live = quote.live
        let strike = quote.strike
        let yes = quote.yesAsk / 100.0
        let gap = live - strike
        let slope = Forecast.slopeFromPoints(quote.points, now: quote.fetchedAt > 0 ? quote.fetchedAt : Date.nowMs)
        let gapScore = clamp(0.5 + gap / 80.0, 0.08, 0.92)
        let slopeScore = clamp(0.5 + slope / 4.4, 0.15, 0.85)
        let tapeScore = yes.isFinite ? clamp(1.0 - yes, 0.05, 0.95) : 0.5
        let pUp = clamp(gapScore * 0.5 + slopeScore * 0.28 + (1.0 - tapeScore) * 0.22, 0.05, 0.95)
        let side: DeskSide = gap > 4.0 ? .up : gap < -4.0 ? .down : abs(slope) > 0.35 ? (slope > 0 ? .up : .down) : .sit
        let pWin = side == .up ? pUp : side == .down ? 1.0 - pUp : 0.5
        let ask = side == .up ? yes : side == .down ? quote.noAsk / 100.0 : 1.0
        let edge = pWin - ask
        let willBuy = side != .sit && pWin >= 0.58 && edge >= 0.04
        let label = willBuy ? (side == .up ? "BUY UP" : "BUY DOWN") : "SIT"
        return DeskCall(side: side, willBuy: willBuy, label: label, pWin: pWin, locked: false)
    }

    static func holdThesis(quote: Quote?, next raw: DeskCall? = nil, peek: (String) -> HeldThesis?, write: (HeldThesis) -> Void) -> DeskCall {
        let next = raw ?? kalshiCall(quote)
        guard let quote, !quote.ticker.isEmpty else { return next }

        guard let prev = peek(quote.ticker) else {
            write(HeldThesis(ticker: quote.ticker, side: next.side.rawValue, willBuy: next.willBuy, pWin: next.pWin, locked: next.willBuy))
            return DeskCall(side: next.side, willBuy: next.willBuy, label: next.label, pWin: next.pWin, locked: next.willBuy)
        }

        let live = quote.live
        let strike = quote.strike
        if prev.locked && (prev.side == "up" || prev.side == "down") {
            let through = prev.side == "up" ? live < strike - 28.0 : live > strike + 28.0
            let hard = through && next.willBuy && next.side.rawValue != prev.side && next.side != .sit && next.pWin >= 0.72
            if hard {
                write(HeldThesis(ticker: quote.ticker, side: next.side.rawValue, willBuy: true, pWin: next.pWin, locked: true))
                return DeskCall(side: next.side, willBuy: true, label: next.side == .up ? "BUY UP" : "BUY DOWN", pWin: next.pWin, locked: true)
            }
            let held: DeskSide = prev.side == "up" ? .up : .down
            return DeskCall(
                side: held,
                willBuy: true,
                label: held == .up ? "BUY UP" : "BUY DOWN",
                pWin: max(prev.pWin, next.pWin),
                locked: true
            )
        }

        if !next.willBuy {
            write(HeldThesis(ticker: quote.ticker, side: "sit", willBuy: false, pWin: next.pWin, locked: false))
            return DeskCall(side: .sit, willBuy: false, label: "SIT", pWin: next.pWin, locked: false)
        }

        write(HeldThesis(ticker: quote.ticker, side: next.side.rawValue, willBuy: true, pWin: next.pWin, locked: true))
        return DeskCall(side: next.side, willBuy: true, label: next.label, pWin: next.pWin, locked: true)
    }
}
