import Foundation

enum KalshiSignal {
    /// Call from beat-trend conviction — not naive last-6m slope (that lags).
    static func kalshiCall(_ quote: Quote?, beat: BeatPath) -> DeskCall {
        guard let quote, quote.live.isFinite, quote.strike.isFinite else {
            return DeskCall()
        }
        let side = beat.beatSide
        let pWin = beat.conviction
        let yes = quote.yesAsk / 100.0
        let ask = side == .up ? yes : side == .down ? quote.noAsk / 100.0 : 1.0
        let edge = pWin - ask
        let willBuy = side != .sit && pWin >= 0.58 && edge >= 0.04
        let label = willBuy ? (side == .up ? "BUY UP" : "BUY DOWN") : "SIT"
        return DeskCall(side: side, willBuy: willBuy, label: label, pWin: pWin, locked: false)
    }

    static func holdThesis(quote: Quote?, next raw: DeskCall, peek: (String) -> HeldThesis?, write: (HeldThesis) -> Void) -> DeskCall {
        guard let quote, !quote.ticker.isEmpty else { return raw }

        guard let prev = peek(quote.ticker) else {
            write(HeldThesis(ticker: quote.ticker, side: raw.side.rawValue, willBuy: raw.willBuy, pWin: raw.pWin, locked: raw.willBuy))
            return DeskCall(side: raw.side, willBuy: raw.willBuy, label: raw.label, pWin: raw.pWin, locked: raw.willBuy)
        }

        if prev.locked && (prev.side == "up" || prev.side == "down") {
            let held: DeskSide = prev.side == "up" ? .up : .down
            let flip = raw.side != .sit && raw.side != held && raw.pWin >= 0.60
            if flip {
                write(HeldThesis(ticker: quote.ticker, side: raw.side.rawValue, willBuy: raw.willBuy, pWin: raw.pWin, locked: raw.willBuy))
                return DeskCall(side: raw.side, willBuy: raw.willBuy, label: raw.label, pWin: raw.pWin, locked: raw.willBuy)
            }
            return DeskCall(
                side: held,
                willBuy: raw.willBuy && raw.side == held,
                label: raw.willBuy && raw.side == held ? (held == .up ? "BUY UP" : "BUY DOWN") : "SIT",
                pWin: max(prev.pWin, raw.pWin),
                locked: true
            )
        }

        if !raw.willBuy {
            write(HeldThesis(ticker: quote.ticker, side: "sit", willBuy: false, pWin: raw.pWin, locked: false))
            return DeskCall(side: .sit, willBuy: false, label: "SIT", pWin: raw.pWin, locked: false)
        }

        write(HeldThesis(ticker: quote.ticker, side: raw.side.rawValue, willBuy: true, pWin: raw.pWin, locked: true))
        return DeskCall(side: raw.side, willBuy: true, label: raw.label, pWin: raw.pWin, locked: true)
    }
}
