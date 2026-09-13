import Foundation
import Combine

@MainActor
final class DeskStore: ObservableObject {
    @Published var quote: Quote?
    @Published var call: DeskCall = DeskCall()
    @Published var dash: Dash?
    @Published var day: String = ChicagoTime.upcomingDays().first?.key ?? ""
    @Published var days: [(t: Double, key: String, label: String)] = ChicagoTime.upcomingDays()

    private var quoteTimer: Timer?
    private var boardTimer: Timer?
    private var dashTimer: Timer?
    private var lastQuoteAt: Double = 0
    private var points: [Point] = []
    private var prior: [Point] = []
    private var past: [Settled] = []
    private var status: (exchangeActive: Bool, tradingActive: Bool)?
    private var ema: Double?
    private let thesisKey = "hub.thesis"

    func start() {
        guard quoteTimer == nil else { return }
        Task { await refreshQuote() }
        Task { await refreshBoard() }
        Task { await refreshDash() }
        quoteTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.refreshQuote() }
        }
        boardTimer = Timer.scheduledTimer(withTimeInterval: 12, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.refreshBoard() }
        }
        dashTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.refreshDash() }
        }
    }

    func setDay(_ key: String) {
        day = key
        Task { await refreshDash() }
    }

    private func attach(_ q: Quote) -> Quote {
        var next = q
        next.points = points
        next.prior = prior
        next.past = past
        next.exchangeActive = status?.exchangeActive ?? q.exchangeActive
        next.tradingActive = status?.tradingActive ?? q.tradingActive
        return next
    }

    private func publish(_ q: Quote) {
        let attached = attach(q)
        quote = attached
        let raw = KalshiSignal.kalshiCall(attached)
        call = KalshiSignal.holdThesis(quote: attached, next: raw, peek: peekThesis, write: writeThesis)
    }

    private func refreshQuote() async {
        let now = Date.nowMs
        async let statusP = KalshiClient.fetchStatus()
        async let liveP = KalshiClient.fetchCoinbase(timeout: 0.9)
        async let marketsP = KalshiClient.fetchMarkets(status: "open", limit: 4, timeout: 0.9)
        let st = await statusP
        let live = try? await liveP
        let markets = await marketsP
        if let st { status = st }
        if st?.tradingActive == false, let last = quote {
            publish(last)
            return
        }
        guard let live, let market = KalshiClient.pickOpen(markets, now: now) else {
            if let last = quote { publish(last) }
            return
        }
        var q = KalshiClient.marketToQuote(market, live: live, source: "coinbase", now: now)
        lastQuoteAt = now
        if points.last.map({ now - $0.t > 0.8 * HubMs.second }) ?? true {
            points.append(Point(t: now, px: live))
            if points.count > 400 { points.removeFirst(points.count - 400) }
        }
        q.points = points
        publish(q)
    }

    private func refreshBoard() async {
        let now = Date.nowMs
        async let openP = KalshiClient.fetchMarkets(status: "open", limit: 4, timeout: 1.600)
        async let settledP = KalshiClient.fetchMarkets(status: "settled", limit: 24, timeout: 1.400)
        async let closesP = KalshiClient.fetchCandles(startMs: now - 90.0 * HubMs.minute, endMs: now + 5.0 * HubMs.second, gran: 60, timeout: 1.4)
        async let priorP = KalshiClient.fetchCandles(
            startMs: now - HubMs.week - 90.0 * HubMs.minute,
            endMs: now - HubMs.week + 5.0 * HubMs.second,
            gran: 60,
            timeout: 1.4
        )
        let (open, settled, closes, lastWeek) = await (openP, settledP, closesP, priorP)
        if !closes.isEmpty { points = merge(points, closes) }
        if !lastWeek.isEmpty { prior = lastWeek.map { Point(t: $0.t + HubMs.week, px: $0.px) } }
        past = KalshiClient.settledFromMarkets(settled)
        if let market = KalshiClient.pickOpen(open, now: now) {
            let live = quote?.live ?? points.last?.px ?? 0
            var q = KalshiClient.marketToQuote(market, live: live, source: quote?.liveSource ?? "coinbase", now: now)
            if let current = quote {
                q.yesAsk = current.yesAsk != 0 ? current.yesAsk : q.yesAsk
                q.noAsk = current.noAsk != 0 ? current.noAsk : q.noAsk
                q.live = current.live != 0 ? current.live : q.live
            }
            publish(q)
        } else if let last = quote {
            publish(last)
        }
    }

    private func refreshDash() async {
        let now = Date.nowMs
        let todayStart = ChicagoTime.startOfChicagoDay(now)
        var dayStart = todayStart
        let parts = day.split(separator: "-").compactMap { Int($0) }
        if parts.count == 3 {
            let guess = Date.utcMs(y: parts[0], m: parts[1], d: parts[2], h: 12, min: 0, s: 0)
            dayStart = ChicagoTime.startOfChicagoDay(guess)
        }
        let isToday = ChicagoTime.dayKey(dayStart) == ChicagoTime.dayKey(now)
        let lookNow = isToday ? now : dayStart + 12.0 * HubMs.hour
        let rangeStart = dayStart
        async let thisWeek15P = KalshiClient.fetchCandles(
            startMs: rangeStart - 30.0 * HubMs.minute,
            endMs: rangeStart + HubMs.day,
            gran: 900,
            timeout: 1.6
        )
        async let lastWeekP = KalshiClient.fetchCandles(
            startMs: rangeStart - HubMs.week - 30.0 * HubMs.minute,
            endMs: rangeStart - HubMs.week + HubMs.day,
            gran: 900,
            timeout: 1.6
        )
        let thisWeek15 = await thisWeek15P
        let lastWeekRaw = await lastWeekP
        let thisWeek = thisWeek15 + points
        let lastWeek = lastWeekRaw.map { Point(t: $0.t + HubMs.week, px: $0.px) }
        let live = quote?.live ?? thisWeek.last?.px ?? lastWeek.last?.px ?? 0
        let slope = Forecast.slopeFromPoints(thisWeek.isEmpty ? quote?.points : thisWeek, now: lookNow)
        let nowSlot = ChicagoTime.align15(lookNow)
        let lwNow = nearest(lastWeek, nowSlot) ?? live
        var upcoming: [DashRow] = []
        var elapsed: [DashRow] = []
        for t in ChicagoTime.slotsForDay(dayStart) {
            let actual = t <= lookNow ? nearest(thisWeek, t + 14.0 * HubMs.minute) ?? nearest(thisWeek, t) : nil
            let lw = nearest(lastWeek, t)
            let mins = (t - lookNow) / HubMs.minute
            let fade = max(0.0, 1.0 - max(0.0, mins) / 90.0)
            let shape = lw != nil ? lw! - lwNow : 0
            let theory: Double?
            if t >= nowSlot {
                theory = live + slope * max(0.0, mins) * fade + shape
            } else if let actual {
                let raw = lw != nil ? live + (lw! - lwNow) : actual
                theory = min(actual + 10.0, max(actual - 10.0, raw))
            } else {
                theory = lw != nil ? live + (lw! - lwNow) : nil
            }
            let row = DashRow(
                t: t,
                clock: ChicagoTime.formatClock(t),
                theory: theory,
                actual: actual,
                lastWeek: lw,
                variance: actual != nil && theory != nil ? actual! - theory! : nil,
                isNow: isToday && t == nowSlot
            )
            if isToday && t >= nowSlot { upcoming.append(row) } else { elapsed.append(row) }
        }
        dash = Dash(day: ChicagoTime.dayKey(dayStart), weekday: ChicagoTime.weekdayName(dayStart), upcoming: upcoming, elapsed: elapsed)
    }

    private func nearest(_ points: [Point], _ t: Double) -> Double? {
        guard let best = points.min(by: { abs($0.t - t) < abs($1.t - t) }) else { return nil }
        return abs(best.t - t) < 12 * HubMs.minute ? best.px : nil
    }

    private func merge(_ a: [Point], _ b: [Point]) -> [Point] {
        var map: [Int: Double] = [:]
        for p in a + b where p.t.isFinite && p.px.isFinite {
            map[Int((p.t / 1000.0).rounded()) * 1000] = p.px
        }
        return map.keys.sorted().map { Point(t: Double($0), px: map[$0] ?? 0) }
    }

    private func peekThesis(_ ticker: String) -> HeldThesis? {
        guard let data = UserDefaults.standard.data(forKey: thesisKey),
              let held = try? JSONDecoder().decode(HeldThesis.self, from: data),
              held.ticker == ticker
        else { return nil }
        return held
    }

    private func writeThesis(_ held: HeldThesis) {
        if let data = try? JSONEncoder().encode(held) {
            UserDefaults.standard.set(data, forKey: thesisKey)
        }
    }
}
