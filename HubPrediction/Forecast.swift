import Foundation

enum Forecast {
    static let maxSlope = 2.2
    static let emaKeep = 0.82
    static let emaNew = 0.18
    /// Always reserve this much future so the next-15m dash sits in-frame.
    static let futurePadMs = 16.0 * HubMs.minute

    static func clamp(_ n: Double, _ lo: Double, _ hi: Double) -> Double {
        min(hi, max(lo, n))
    }

    static func slopeFromPoints(_ points: [Point]?, now: Double) -> Double {
        let list = points ?? []
        let from = now - 6.0 * HubMs.minute
        let slice = list.filter { $0.t.isFinite && $0.px.isFinite && $0.t >= from && $0.t <= now + 1.5 * HubMs.second }
        guard slice.count >= 2, let a = slice.first, let b = slice.last else { return 0 }
        let mins = (b.t - a.t) / HubMs.minute
        if mins < 0.45 { return 0 }
        return clamp((b.px - a.px) / mins, -maxSlope, maxSlope)
    }

    static func emaSlope(prev: Double?, raw: Double) -> Double {
        guard let prev, prev.isFinite else { return raw }
        return prev * emaKeep + raw * emaNew
    }

    static func forwardRay(now: Double, closeAt: Double, live: Double, slopePerMin: Double, lean: DeskSide) -> [Point] {
        guard live.isFinite, now.isFinite else { return [] }
        var slope = clamp(slopePerMin, -maxSlope, maxSlope)
        if abs(slope) < 0.18 && lean != .sit {
            slope += lean == .up ? 0.12 : -0.12
        }
        let close = (closeAt.isFinite && closeAt > now) ? closeAt : now + 15.0 * HubMs.minute
        let lastT = max(now + futurePadMs, close + 15.0 * HubMs.minute)
        var times: [Double] = []
        var t = now
        while t < lastT - 1 {
            times.append(t)
            t += HubMs.minute
        }
        times.append(lastT)
        return times.map { Point(t: $0, px: live + slope * (($0 - now) / HubMs.minute)) }
    }

    /// History on the left, at least 16m of future on the right so the dash is on-canvas.
    static func chartWindow(now: Double, zoomMinutes: Double, pan: Double, lastForecastT: Double?) -> (start: Double, end: Double) {
        let cursor = now + pan
        let start = cursor - zoomMinutes * HubMs.minute
        let pad = max(futurePadMs, (lastForecastT ?? now) - now)
        return (start, cursor + pad)
    }

    static func rebasePrior(_ prior: [Point]?, live: Double) -> [Point] {
        let list = (prior ?? []).filter { $0.px.isFinite && $0.t.isFinite }
        guard let last = list.last?.px, last.isFinite, live.isFinite else { return [] }
        let shift = live - last
        return list.map { Point(t: $0.t, px: $0.px + shift) }
    }

    static func yDomain(live: Double, values: [Double]) -> (Double, Double) {
        let base = live.isFinite ? live : 0
        let clamped = values.filter { $0.isFinite && abs($0 - base) < 250 }
        let lo = min(base - 20.0, clamped.min() ?? base - 20.0)
        let hi = max(base + 20.0, clamped.max() ?? base + 20.0)
        if !lo.isFinite || !hi.isFinite { return (base - 20.0, base + 20.0) }
        return (lo, hi)
    }
}
