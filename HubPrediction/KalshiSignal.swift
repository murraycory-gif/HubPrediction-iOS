import Foundation

/// Exact port of `hub-prediction/src/lib/kalshi-signal.ts`.
/// Gap vs strike + last-6min slope + tape. Do not route the call through BeatTrend.
enum KalshiSignal {
    private static func clamp(_ n: Double, _ lo: Double, _ hi: Double) -> Double {
        min(hi, max(lo, n))
    }

    /// `last6Slope` from kalshi-signal.ts
    static func last6Slope(_ points: [Point]?, now: Double) -> Double {
        let list = points ?? []
        let from = now - 6 * 60_000
        let slice = list.filter { $0.t >= from && $0.t <= now + 1000 }
        guard slice.count >= 2, let a = slice.first, let b = slice.last else { return 0 }
        let mins = (b.t - a.t) / 60_000
        if mins < 0.45 { return 0 }
        return clamp((b.px - a.px) / mins, -2.2, 2.2)
    }

    static func kalshiCall(_ quote: Quote?) -> DeskCall {
        guard let quote, quote.live.isFinite, quote.strike.isFinite else {
            return DeskCall(side: .sit, willBuy: false, label: "SIT", pWin: 0.5, locked: false)
        }
        let live = quote.live
        let strike = quote.strike
        let yes = quote.yesAsk / 100.0
        let gap = live - strike
        let slope = last6Slope(quote.points, now: quote.fetchedAt > 0 ? quote.fetchedAt : Date.nowMs)
        let gapScore = clamp(0.5 + gap / 80, 0.08, 0.92)
        let slopeScore = clamp(0.5 + slope / 4.4, 0.15, 0.85)
        let tapeScore = yes.isFinite ? clamp(1 - yes, 0.05, 0.95) : 0.5
        let pUp = clamp(gapScore * 0.5 + slopeScore * 0.28 + (1 - tapeScore) * 0.22, 0.05, 0.95)
        let side: DeskSide
        if gap > 4 {
            side = .up
        } else if gap < -4 {
            side = .down
        } else if abs(slope) > 0.35 {
            side = slope > 0 ? .up : .down
        } else {
            side = .sit
        }
        let pWin = side == .up ? pUp : side == .down ? 1 - pUp : 0.5
        let ask = side == .up ? yes : side == .down ? quote.noAsk / 100.0 : 1
        let edge = pWin - ask
        let willBuy = side != .sit && pWin >= 0.58 && edge >= 0.04
        return DeskCall(
            side: side,
            willBuy: willBuy,
            label: willBuy ? (side == .up ? "BUY UP" : "BUY DOWN") : "SIT",
            pWin: pWin,
            locked: false
        )
    }

    /// Hold the desk call for the current ticker. Hard reverse only.
    static func holdThesis(
        quote: Quote?,
        next raw: DeskCall? = nil,
        peek: (String) -> HeldThesis?,
        write: (HeldThesis) -> Void
    ) -> DeskCall {
        let next = raw ?? kalshiCall(quote)
        guard let quote, !quote.ticker.isEmpty else { return next }
        let live = quote.live
        let strike = quote.strike

        guard let prev = peek(quote.ticker) else {
            let locked = next.willBuy
            write(HeldThesis(ticker: quote.ticker, side: next.side.rawValue, willBuy: next.willBuy, pWin: next.pWin, locked: locked))
            var out = next
            out.locked = locked
            return out
        }

        if prev.locked && (prev.side == "up" || prev.side == "down") {
            let through = prev.side == "up" ? live < strike - 28 : live > strike + 28
            let hard = through
                && next.willBuy
                && next.side.rawValue != prev.side
                && next.side != .sit
                && next.pWin >= 0.72
            if hard {
                write(HeldThesis(ticker: quote.ticker, side: next.side.rawValue, willBuy: true, pWin: next.pWin, locked: true))
                return DeskCall(
                    side: next.side,
                    willBuy: true,
                    label: next.side == .up ? "BUY UP" : "BUY DOWN",
                    pWin: next.pWin,
                    locked: true
                )
            }
            let held: DeskSide = prev.side == "down" ? .down : .up
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
        var out = next
        out.willBuy = true
        out.locked = true
        return out
    }
}
