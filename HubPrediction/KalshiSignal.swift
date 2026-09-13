import Foundation

enum KalshiSignal {
    /// Call from the latest beat + live asks. Never freeze a LOCK against the feed.
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
        if let quote, !quote.ticker.isEmpty {
            write(HeldThesis(ticker: quote.ticker, side: raw.side.rawValue, willBuy: raw.willBuy, pWin: raw.pWin, locked: false))
        }
        _ = peek
        return raw
    }
}
