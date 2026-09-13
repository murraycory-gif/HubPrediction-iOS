import Foundation

enum TrendStance: String {
    case beat
    case with
    case fade
    case sit
}

struct BeatPath: Equatable {
    var naiveSlope: Double = 0
    var beatSlope: Double = 0
    var naive: [Point] = []
    var beat: [Point] = []
    var stance: TrendStance = .sit
    var conviction: Double = 0.5
    var naiveSide: DeskSide = .sit
    var beatSide: DeskSide = .sit
    var convScore: Double = 0
    var chrome: String = "BEAT TREND · warming"
}

/// Next-15m path that aims to beat naive last-6m slope — not a last-week replot.
enum BeatTrend {
    static func evaluate(
        quote: Quote?,
        points: [Point],
        prior: [Point],
        dash: Dash?,
        now: Double,
        closeAt: Double
    ) -> BeatPath {
        let live = quote?.live ?? points.last?.px ?? 0
        let strike = quote?.strike ?? live
        let yes = quote?.yesAsk ?? 50
        let naiveSlope = Forecast.slopeFromPoints(points, now: now)
        let naiveSide: DeskSide = naiveSlope > 0.18 ? .up : naiveSlope < -0.18 ? .down : .sit

        let gap = live - strike
        let gapLean = Forecast.clamp(gap / 20.0, -1, 1)
        let tapeLean = Forecast.clamp((50.0 - yes) / 15.0, -1, 1)
        let shapePerMin = lastWeekShapePerMin(prior: prior, dash: dash, live: live, now: now)
        let scout: DeskSide = gap > 2 ? .up : gap < -2 ? .down : .sit
        let risk: DeskSide = yes < 48 ? .up : yes > 52 ? .down : .sit
        let shapeVote: Double = shapePerMin > 0.15 ? 1 : shapePerMin < -0.15 ? -1 : 0
        let scoutVote: Double = scout == .up ? 1 : scout == .down ? -1 : 0
        let riskVote: Double = risk == .up ? 1 : risk == .down ? -1 : 0
        let botVote = (scoutVote + riskVote + shapeVote) / 3.0
        let convScore = Forecast.clamp(
            gapLean * 0.40 + tapeLean * 0.28 + botVote * 0.20 + Forecast.clamp(shapePerMin / 1.6, -1, 1) * 0.12,
            -1,
            1
        )

        let beatSide: DeskSide = convScore > 0.12 ? .up : convScore < -0.12 ? .down : .sit
        var beatSlope = naiveSlope
        if beatSide == .up {
            beatSlope = naiveSlope + (0.55 + 0.85 * abs(convScore))
            if naiveSlope >= 0 { beatSlope = max(beatSlope, naiveSlope + 0.38) }
        } else if beatSide == .down {
            beatSlope = naiveSlope - (0.55 + 0.85 * abs(convScore))
            if naiveSlope <= 0 { beatSlope = min(beatSlope, naiveSlope - 0.38) }
        } else {
            beatSlope = naiveSlope * 0.25 + shapePerMin * 0.35
        }
        beatSlope = Forecast.clamp(beatSlope, -Forecast.maxSlope, Forecast.maxSlope)

        let sep = (beatSlope - naiveSlope) * 15.0
        if beatSide != .sit, abs(sep) < 5.0 {
            beatSlope += (beatSide == .up ? 1 : -1) * (5.0 / 15.0)
            beatSlope = Forecast.clamp(beatSlope, -Forecast.maxSlope, Forecast.maxSlope)
        }

        let stance: TrendStance
        if beatSide == .sit && naiveSide == .sit {
            stance = .sit
        } else if beatSide != .sit && naiveSide != .sit && beatSide != naiveSide {
            stance = .fade
        } else if beatSide != .sit && (naiveSide == .sit || abs(beatSlope) > abs(naiveSlope) + 0.15) {
            stance = .beat
        } else if beatSide == naiveSide {
            stance = .with
        } else {
            stance = .beat
        }

        let pUp = Forecast.clamp(0.5 + convScore * 0.42, 0.08, 0.92)
        let conviction = beatSide == .up ? pUp : beatSide == .down ? 1 - pUp : 0.5
        let naiveWord = naiveSide == .up ? "UP" : naiveSide == .down ? "DOWN" : "FLAT"
        let beatWord = beatSide == .up ? "UP" : beatSide == .down ? "DOWN" : "SIT"
        let stanceWord = stance == .fade ? "FADE TREND" : stance == .with ? "WITH TREND" : stance == .beat ? "BEAT TREND" : "NO EDGE"
        let chrome = "\(stanceWord) · \(beatWord) vs naive \(naiveWord) · conv \(Int((conviction * 100).rounded()))%"

        let close = closeAt
        return BeatPath(
            naiveSlope: naiveSlope,
            beatSlope: beatSlope,
            naive: Forecast.forwardRay(now: now, closeAt: close, live: live, slopePerMin: naiveSlope, lean: .sit),
            beat: Forecast.forwardRay(now: now, closeAt: close, live: live, slopePerMin: beatSlope, lean: beatSide),
            stance: stance,
            conviction: conviction,
            naiveSide: naiveSide,
            beatSide: beatSide,
            convScore: convScore,
            chrome: chrome
        )
    }

    /// Last-week *shape* over the next 15m — a delta, not a replot of the gray series.
    static func lastWeekShapePerMin(prior: [Point], dash: Dash?, live: Double, now: Double) -> Double {
        let rebased = Forecast.rebasePrior(prior, live: live)
        let later = now + 15.0 * HubMs.minute
        if let a = nearest(rebased, now), let b = nearest(rebased, later) {
            return Forecast.clamp((b - a) / 15.0, -Forecast.maxSlope, Forecast.maxSlope)
        }
        let lw = dash?.lastWeekPath() ?? []
        if let a = nearest(lw, now), let b = nearest(lw, later) {
            return Forecast.clamp((b - a) / 15.0, -Forecast.maxSlope, Forecast.maxSlope)
        }
        return 0
    }

    private static func nearest(_ pts: [Point], _ t: Double) -> Double? {
        guard let best = pts.min(by: { abs($0.t - t) < abs($1.t - t) }) else { return nil }
        return abs(best.t - t) < 18 * HubMs.minute ? best.px : nil
    }
}
