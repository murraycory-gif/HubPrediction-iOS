import Foundation

enum DeskSide: String, Equatable {
    case up, down, sit
}

struct Point: Equatable {
    var t: Double
    var px: Double
}

/// Coinbase OHLC bucket. `t` is bucket start (ms).
struct Candle: Equatable {
    var t: Double
    var open: Double
    var high: Double
    var low: Double
    var close: Double

    var point: Point { Point(t: t, px: close) }
}

struct Settled: Equatable, Identifiable {
    var ticker: String
    var closeAt: Double
    var result: DeskSide

    var id: String { "\(ticker)-\(closeAt)" }
}

struct Quote: Equatable {
    var ticker: String = ""
    var yesAsk: Double = 0
    var noAsk: Double = 0
    var strike: Double = 0
    var live: Double = 0
    var liveSource: String = "coinbase"
    var openAt: Double = 0
    var closeAt: Double = 0
    var fetchedAt: Double = 0
    var exchangeActive: Bool?
    var tradingActive: Bool?
    var points: [Point] = []
    var prior: [Point] = []
    var past: [Settled] = []
}

struct DeskCall: Equatable {
    var side: DeskSide = .sit
    var willBuy: Bool = false
    var label: String = "SIT"
    var pWin: Double = 0.5
    var locked: Bool = false
}

struct DashRow: Equatable, Identifiable {
    var t: Double
    var clock: String
    var theory: Double?
    var actual: Double?
    var preview: Double?
    var lastWeek: Double?
    var variance: Double?
    var vsOpen: Double?
    var high: Double?
    var low: Double?
    var isNow: Bool

    var id: Double { t }
}

struct Dash: Equatable {
    var day: String
    var weekday: String
    var upcoming: [DashRow]
    var elapsed: [DashRow]

    var allRows: [DashRow] { elapsed + upcoming }

    func theoryPath() -> [Point] {
        allRows.compactMap { r in r.theory.map { Point(t: r.t, px: $0) } }
    }

    func actualPath() -> [Point] {
        elapsed.compactMap { r in r.actual.map { Point(t: r.t, px: $0) } }
    }

    func lastWeekPath() -> [Point] {
        allRows.compactMap { r in r.lastWeek.map { Point(t: r.t, px: $0) } }
    }

    func upcomingTheory() -> [Point] {
        upcoming.compactMap { r in r.theory.map { Point(t: r.t, px: $0) } }
    }

    func previewPath() -> [Point] {
        allRows.compactMap { r in r.preview.map { Point(t: r.t, px: $0) } }
    }

    func lastWeekHighPath() -> [Point] {
        allRows.compactMap { r in r.high.map { Point(t: r.t, px: $0) } }
    }

    func lastWeekLowPath() -> [Point] {
        allRows.compactMap { r in r.low.map { Point(t: r.t, px: $0) } }
    }

    func variancePath() -> [Point] {
        elapsed.compactMap { r in r.variance.map { Point(t: r.t, px: $0) } }
    }
}

struct MarketPick: Equatable, Identifiable {
    var ticker: String
    var title: String
    var series: String
    var yesAsk: Double
    var noAsk: Double
    var closeAt: Double

    var id: String { ticker }
}

struct DeskBanner: Equatable {
    var title: String
    var detail: String
    var holdingLast: Bool
}

struct HeldThesis: Equatable, Codable {
    var ticker: String
    var side: String
    var willBuy: Bool
    var pWin: Double
    var locked: Bool
}

enum HubMs {
    static let second: Double = 1_000
    static let minute: Double = 60_000
    static let hour: Double = 3_600_000
    static let day: Double = 86_400_000
    static let week: Double = 604_800_000
}

enum Money {
    static func dollarsExact(_ n: Double?) -> String {
        guard let n, n.isFinite else { return "—" }
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        f.maximumFractionDigits = 0
        f.minimumFractionDigits = 0
        return f.string(from: NSNumber(value: n)) ?? "—"
    }

    static func cents(_ n: Double?) -> String {
        guard let n, n.isFinite else { return "—¢" }
        return "\(Int(n.rounded()))¢"
    }

    static func signed(_ n: Double?) -> String {
        guard let n, n.isFinite else { return "—" }
        let core = dollarsExact(abs(n))
        if n > 0 { return "+\(core)" }
        if n < 0 { return "−\(core)" }
        return core
    }
}
