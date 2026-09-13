import Foundation

enum BuyPhase: String {
    case waiting
    case open
    case late
    case settled
}

/// Buy only in the last 6–4 minutes before settle. Not a view-only signal.
enum BuyWindow {
    static let openUntilMin = 6.0
    static let openFromMin = 4.0

    static func remainingMs(closeAt: Double, now: Double) -> Double {
        guard closeAt.isFinite, closeAt > 0 else { return 0 }
        return max(0, closeAt - now)
    }

    static func phase(closeAt: Double, now: Double) -> BuyPhase {
        guard closeAt.isFinite, closeAt > 0 else { return .waiting }
        let left = closeAt - now
        if left <= 0 { return .settled }
        let mins = left / HubMs.minute
        if mins > openUntilMin { return .waiting }
        if mins >= openFromMin { return .open }
        return .late
    }

    /// Huge top word: the 6–4m call, including while waiting. Never just “WAIT”.
    static func headline(phase: BuyPhase, call: DeskCall) -> String {
        switch phase {
        case .settled:
            return "SETTLED"
        case .late:
            return callWord(call)
        case .waiting, .open:
            return callWord(call)
        }
    }

    static func callWord(_ call: DeskCall) -> String {
        if call.side == .up { return "BUY UP" }
        if call.side == .down { return "BUY DOWN" }
        return "SIT"
    }

    /// One line under the word — when to buy, never a scavenger hunt.
    static func heroLine(phase: BuyPhase, call: DeskCall, closeAt: Double, now: Double) -> String {
        let word = callWord(call)
        switch phase {
        case .waiting:
            let opens = clock(opensInMs(closeAt: closeAt, now: now))
            if call.side == .sit {
                return "SIT · no edge yet · window opens in \(opens)"
            }
            return "\(word) when window opens · in \(opens)"
        case .open:
            let left = clock(max(0, remainingMs(closeAt: closeAt, now: now) - openFromMin * HubMs.minute))
            if call.side == .sit { return "SIT · window open · closes in \(left)" }
            return "\(word) NOW · 6–4m window · closes in \(left)"
        case .late:
            return "Window closed · \(word) was the call · next 15m"
        case .settled:
            return "Market settled · next 15m"
        }
    }

    static func reasonLine(quote: Quote?, beat: BeatPath, call: DeskCall) -> String {
        let live = Money.dollarsExact(quote?.live)
        let strike = Money.dollarsExact(quote?.strike)
        let vs = (quote?.live ?? 0) - (quote?.strike ?? 0)
        let vsWord = vs > 1 ? "above" : vs < -1 ? "below" : "at"
        let edge = call.willBuy ? "edge on" : "warming"
        return "Live \(live) \(vsWord) posted \(strike) · \(beat.chrome) · \(edge)"
    }

    /// One glance clock: time to the 6–4m window, not settle, until the window is gone.
    static func heroClock(phase: BuyPhase, closeAt: Double, now: Double) -> (label: String, value: String) {
        guard closeAt.isFinite, closeAt > 0 else { return ("—", "--:--") }
        switch phase {
        case .waiting:
            return ("OPENS IN", clock(opensInMs(closeAt: closeAt, now: now)))
        case .open:
            let left = max(0, remainingMs(closeAt: closeAt, now: now) - openFromMin * HubMs.minute)
            return ("CLOSES IN", clock(left))
        case .late:
            return ("SETTLE", clock(remainingMs(closeAt: closeAt, now: now)))
        case .settled:
            return ("SETTLED", "--:--")
        }
    }

    static func clock(_ ms: Double) -> String {
        let left = max(0, ms)
        let mm = Int(left / HubMs.minute)
        let ss = Int(left.truncatingRemainder(dividingBy: HubMs.minute) / HubMs.second)
        return String(format: "%02d:%02d", mm, ss)
    }

    static func detail(phase: BuyPhase, closeAt: Double, now: Double) -> String {
        let left = remainingMs(closeAt: closeAt, now: now)
        let settle = clock(left)
        switch phase {
        case .waiting:
            let untilOpen = max(0, left - openUntilMin * HubMs.minute)
            return "BUY WINDOW 6:00–4:00 · OPENS IN \(clock(untilOpen)) · SETTLE \(settle)"
        case .open:
            let untilClose = max(0, left - openFromMin * HubMs.minute)
            return "BUY WINDOW OPEN · CLOSES IN \(clock(untilClose)) · SETTLE \(settle)"
        case .late:
            return "6–4m WINDOW CLOSED · SETTLE \(settle)"
        case .settled:
            return "MARKET SETTLED"
        }
    }

    /// What Cory can do right now — waiting must not be a brick wall.
    static func nextAction(phase: BuyPhase, botsArmed: Bool, queued: Bool) -> String {
        switch phase {
        case .waiting:
            if botsArmed { return "NEXT: bots execute when 6–4m opens. Size/side stay live." }
            if queued { return "NEXT: queued fill fires when 6–4m opens. Cancel anytime." }
            return "NEXT: ARM BOTS or QUEUE a fill — both fire in the 6–4m window."
        case .open:
            return "NEXT: window open — place now or let armed bots execute."
        case .late:
            return "NEXT: this window is closed. Arm bots for the next 15m."
        case .settled:
            return "NEXT: pick the next market or wait for the next 15m."
        }
    }

    static func opensInMs(closeAt: Double, now: Double) -> Double {
        max(0, remainingMs(closeAt: closeAt, now: now) - openUntilMin * HubMs.minute)
    }
}
