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

    /// Big call: WAIT / BUY UP / BUY DOWN / NO BUY / WINDOW CLOSED / SETTLED
    static func headline(phase: BuyPhase, call: DeskCall) -> String {
        switch phase {
        case .waiting:
            return "WAIT"
        case .open:
            if call.willBuy, call.side == .up { return "BUY UP" }
            if call.willBuy, call.side == .down { return "BUY DOWN" }
            return "NO BUY"
        case .late:
            return "WINDOW CLOSED"
        case .settled:
            return "SETTLED"
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
}
