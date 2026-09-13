import Foundation
import Combine

@MainActor
final class DeskStore: ObservableObject {
    @Published var quote: Quote?
    @Published var call: DeskCall = DeskCall()
    @Published var dash: Dash?
    @Published var day: String = ChicagoTime.upcomingDays().first?.key ?? ""
    @Published var days: [(t: Double, key: String, label: String)] = ChicagoTime.upcomingDays()
    @Published var banner: DeskBanner?
    @Published var holdingLast: Bool = false
    @Published var seriesTicker: String = KalshiClient.defaultSeries
    @Published var pinnedTicker: String?
    @Published var marketHits: [MarketPick] = []
    @Published var marketQuery: String = ""
    @Published var marketsBusy: Bool = false
    @Published var hasCreds: Bool = KalshiCreds.isPresent
    @Published var cash: Double?
    @Published var tradeSide: DeskSide = .up
    @Published var tradeCount: Int = 1
    @Published var tradeBusy: Bool = false
    @Published var tradeNote: String?
    @Published var showConfirm: Bool = false
    @Published var mode: DeskMode = PaperBook.mode
    @Published var paperFills: [PaperFill] = PaperBook.fills
    @Published var botsArmed: Bool = DeskBots.armed
    @Published var botNote: String?
    @Published var botFiredTicker: String?
    @Published var confirmFromBot: Bool = false
    @Published var lastQuoteAt: Double = 0

    static let quoteIntervalMs = 1_000.0
    static let dashIntervalMs = 5_000.0
    static let boardIntervalMs = 10_000.0

    private var lastDashAt: Double = 0
    private var lastBoardAt: Double = 0
    private var didStart = false
    private var quoteInFlight = false
    private var dashInFlight = false
    private var boardInFlight = false
    private var points: [Point] = []
    private var prior: [Point] = []
    private var past: [Settled] = []
    private var status: (exchangeActive: Bool, tradingActive: Bool)?
    private let thesisKey = "hub.thesis"

    var workingCash: Double {
        mode == .paper ? PaperBook.cash : (cash ?? 0)
    }

    var isBTC: Bool {
        seriesTicker.uppercased().contains("BTC") || (pinnedTicker ?? quote?.ticker ?? "").uppercased().contains("BTC")
    }

    var suggestedCount: Int {
        let ask = tradeSide == .down ? (quote?.noAsk ?? 0) : (quote?.yesAsk ?? 0)
        let n = SizeCash.contractsFromCash(cash: workingCash, askCents: ask, pWin: call.pWin)
        return min(SizeCash.maxContracts, max(1, n == 0 ? 1 : n))
    }

    var expectedProfit: Double {
        let ask = tradeSide == .down ? (quote?.noAsk ?? 0) : (quote?.yesAsk ?? 0)
        return SizeCash.expectedProfit(count: tradeCount, askCents: ask, pWin: call.pWin)
    }

    var paperPnL: Double {
        PaperBook.cash - PaperBook.startCash
    }

    /// Combine `.common` pulse from DeskView drives this. Foundation `scheduledTimer`
    /// sits on `.default` and often never fires again on Mac Catalyst after first paint.
    func start() {
        guard !didStart else { return }
        didStart = true
        hasCreds = KalshiCreds.isPresent
        mode = PaperBook.mode
        paperFills = PaperBook.fills
        botsArmed = DeskBots.armed
        Task { await refreshAll() }
        Task { await searchMarkets(query: "") }
        if mode == .live, hasCreds { Task { await refreshCash() } }
    }

    func pulse(now: Double) {
        tickBots(now: now)
        if now - lastQuoteAt >= Self.quoteIntervalMs {
            Task { await refreshQuote() }
        }
        if now - lastDashAt >= Self.dashIntervalMs {
            Task { await refreshDash() }
        }
        if now - lastBoardAt >= Self.boardIntervalMs {
            Task { await refreshBoard() }
        }
    }

    func retry() {
        holdingLast = false
        banner = nil
        quoteInFlight = false
        dashInFlight = false
        boardInFlight = false
        lastQuoteAt = 0
        lastDashAt = 0
        lastBoardAt = 0
        Task { await refreshAll() }
    }

    func refreshAll() async {
        await refreshQuote()
        await refreshBoard()
        await refreshDash()
    }

    func setDay(_ key: String) {
        day = key
        Task { await refreshDash() }
    }

    func selectMarket(_ pick: MarketPick) {
        seriesTicker = pick.series.isEmpty ? KalshiClient.defaultSeries : pick.series
        pinnedTicker = pick.ticker
        points = []
        prior = []
        past = []
        quote = nil
        Task { await refreshAll() }
    }

    func resetToBTC15m() {
        seriesTicker = KalshiClient.defaultSeries
        pinnedTicker = nil
        marketQuery = ""
        Task {
            await searchMarkets(query: "")
            await refreshAll()
        }
    }

    func searchMarkets(query: String) async {
        marketQuery = query
        marketsBusy = true
        defer { marketsBusy = false }
        do {
            marketHits = try await KalshiClient.searchMarkets(query: query)
            if marketHits.isEmpty {
                banner = DeskBanner(
                    title: "No markets for “\(query.isEmpty ? seriesTicker : query)”",
                    detail: "Retry or search another ticker / series. BTC15m is still the default.",
                    holdingLast: false
                )
            }
        } catch {
            banner = DeskBanner(title: "Markets failed", detail: error.localizedDescription, holdingLast: quote != nil)
        }
    }

    func setMode(_ next: DeskMode) {
        mode = next
        PaperBook.mode = next
        tradeNote = next == .paper ? "Paper — fills stay on this device. No live orders." : "LIVE — Confirm sends a real Kalshi order."
        if next == .live, hasCreds { Task { await refreshCash() } }
    }

    func resetPaper() {
        PaperBook.reset()
        paperFills = []
        tradeNote = "Paper cash reset to \(Money.dollarsExact(PaperBook.startCash))."
    }

    func credsDidChange() {
        hasCreds = KalshiCreds.isPresent
        if mode == .live, hasCreds { Task { await refreshCash() } }
        if mode == .live, !hasCreds { cash = nil }
    }

    func refreshCash() async {
        guard mode == .live else { return }
        do {
            cash = try await KalshiTrade.fetchCash()
            tradeCount = suggestedCount
            if banner?.title == "Keys" { banner = nil }
        } catch {
            banner = DeskBanner(title: "Keys / cash", detail: error.localizedDescription, holdingLast: false)
        }
    }

    func applySuggestedSize() {
        tradeCount = suggestedCount
        if call.side == .up || call.side == .down { tradeSide = call.side }
    }

    func setBotsArmed(_ on: Bool) {
        botsArmed = on
        DeskBots.armed = on
        botNote = on
            ? "Bots armed — paper auto in the 6–4m window; LIVE still Confirm."
            : "Bots off."
    }

    func tickBots(now: Double) {
        guard botsArmed, !tradeBusy, !showConfirm else { return }
        let ask = (call.side == .down ? quote?.noAsk : quote?.yesAsk) ?? 0
        let n = SizeCash.contractsFromCash(cash: workingCash, askCents: ask, pWin: call.pWin)
        guard n >= 1 else { return }
        tradeCount = n
        if call.side == .up || call.side == .down { tradeSide = call.side }
        let phase = BuyWindow.phase(closeAt: quote?.closeAt ?? 0, now: now)
        guard DeskBots.shouldExecute(phase: phase, call: call, count: n) else { return }
        guard let ticker = quote?.ticker, !ticker.isEmpty, botFiredTicker != ticker else { return }
        tradeSide = call.side
        confirmFromBot = true
        if mode == .paper {
            botNote = "BOT paper \(tradeCount) \(call.side == .down ? "DOWN" : "UP") · \(ticker)"
            Task { await confirmPlace(fromBot: true) }
        } else {
            botFiredTicker = ticker
            botNote = "BOT live \(tradeCount) \(call.side == .down ? "DOWN" : "UP") — Confirm LIVE"
            requestPlace(fromBot: true)
        }
    }

    func requestPlace(fromBot: Bool = false) {
        guard quote?.ticker.isEmpty == false else {
            banner = DeskBanner(title: "No market", detail: "Wait for a quote or pick a market, then retry.", holdingLast: false)
            return
        }
        if mode == .live, !hasCreds {
            banner = DeskBanner(title: "Keys needed", detail: "Live needs Kalshi API Key ID + PEM in Keys. Switch to Paper to fill locally. Nothing is stored in git.", holdingLast: false)
            return
        }
        if tradeSide == .sit { tradeSide = call.side == .down ? .down : .up }
        tradeCount = min(SizeCash.maxContracts, max(1, tradeCount))
        confirmFromBot = fromBot
        showConfirm = true
    }

    func confirmPlace(fromBot: Bool = false) async {
        showConfirm = false
        guard let ticker = quote?.ticker, !ticker.isEmpty else { return }
        tradeBusy = true
        tradeNote = nil
        defer { tradeBusy = false }
        do {
            if mode == .paper {
                let fill = try PaperBook.place(
                    ticker: ticker,
                    side: tradeSide,
                    count: tradeCount,
                    yesAsk: quote?.yesAsk ?? 0,
                    noAsk: quote?.noAsk ?? 0
                )
                paperFills = PaperBook.fills
                if fromBot || confirmFromBot { botFiredTicker = ticker }
                tradeNote = "\(fromBot || confirmFromBot ? "BOT " : "")PAPER \(fill.count) \(fill.side.uppercased()) · \(fill.ticker) · cash \(Money.dollarsExact(PaperBook.cash)) · EV \(Money.signed(expectedProfit))"
                confirmFromBot = false
                return
            }
            let id = try await KalshiTrade.placeLive(
                ticker: ticker,
                side: tradeSide,
                count: tradeCount,
                yesAsk: quote?.yesAsk ?? 0,
                noAsk: quote?.noAsk ?? 0
            )
            if fromBot || confirmFromBot { botFiredTicker = ticker }
            tradeNote = "\(fromBot || confirmFromBot ? "BOT " : "")LIVE \(tradeCount) \(tradeSide == .up ? "UP" : "DOWN") · \(id)"
            confirmFromBot = false
            await refreshCash()
        } catch {
            if fromBot || confirmFromBot { botFiredTicker = nil }
            confirmFromBot = false
            banner = DeskBanner(title: mode == .paper ? "Paper order failed" : "Live order failed", detail: error.localizedDescription, holdingLast: false)
        }
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
        if tradeSide == .sit, call.side != .sit { tradeSide = call.side }
    }

    func refreshQuote() async {
        guard !quoteInFlight else { return }
        quoteInFlight = true
        defer { quoteInFlight = false }
        let now = Date.nowMs
        lastQuoteAt = now
        do {
            async let statusP = KalshiClient.fetchStatus()
            async let coinP = KalshiClient.fetchCoinbase(timeout: 1.5)
            async let marketP = fetchOpenMarket(now: now)
            let st = try? await statusP
            if let st {
                status = st
                if st.tradingActive == false {
                    holdingLast = true
                    if let last = quote { publish(last) }
                    banner = DeskBanner(
                        title: "Kalshi halted",
                        detail: "Last ¢ is held on purpose. Retry to refresh status, or wait for the exchange.",
                        holdingLast: true
                    )
                    return
                }
            }
            let market = try await marketP
            let live: Double
            let source: String
            if isBTC, let px = try? await coinP {
                live = px
                source = "coinbase"
            } else {
                live = KalshiClient.num(market["last_price"]) ?? KalshiClient.num(market["yes_bid"]) ?? quote?.live ?? 0
                source = "kalshi"
            }
            var q = KalshiClient.marketToQuote(market, live: live, source: source, now: now)
            if points.last.map({ now - $0.t > 0.8 * HubMs.second }) ?? true {
                points.append(Point(t: now, px: live))
                if points.count > 400 { points.removeFirst(points.count - 400) }
            }
            q.points = points
            holdingLast = false
            if banner?.holdingLast == true || banner?.title == "Quote failed" { banner = nil }
            publish(q)
        } catch {
            holdingLast = quote != nil
            banner = DeskBanner(
                title: "Quote failed",
                detail: error.localizedDescription,
                holdingLast: quote != nil
            )
            if let last = quote { publish(last) }
        }
    }

    private func fetchOpenMarket(now: Double) async throws -> [String: Any] {
        if let pinned = pinnedTicker, !pinned.isEmpty {
            return try await KalshiClient.fetchMarket(ticker: pinned, timeout: 1.4)
        }
        let markets = try await KalshiClient.fetchMarkets(series: seriesTicker, status: "open", limit: 8, timeout: 1.4)
        guard let picked = KalshiClient.pickOpen(markets, now: now) else {
            throw KalshiAuthError.http(404, "No open \(seriesTicker) market. Browse or retry.")
        }
        return picked
    }

    private func refreshBoard() async {
        guard !boardInFlight else { return }
        boardInFlight = true
        defer { boardInFlight = false }
        let now = Date.nowMs
        lastBoardAt = now
        do {
            async let openP = KalshiClient.fetchMarkets(series: seriesTicker, status: "open", limit: 8, timeout: 1.6)
            async let settledP = KalshiClient.fetchMarkets(series: seriesTicker, status: "settled", limit: 24, timeout: 1.4)
            let open = try await openP
            let settled = try await settledP
            if isBTC {
                let closes = (try? await KalshiClient.fetchCandles(startMs: now - 90.0 * HubMs.minute, endMs: now + 5.0 * HubMs.second, gran: 60, timeout: 1.4)) ?? []
                let lastWeek = (try? await KalshiClient.fetchCandles(
                    startMs: now - HubMs.week - 90.0 * HubMs.minute,
                    endMs: now - HubMs.week + 5.0 * HubMs.second,
                    gran: 60,
                    timeout: 1.4
                )) ?? []
                if !closes.isEmpty { points = merge(points, closes) }
                if !lastWeek.isEmpty { prior = lastWeek.map { Point(t: $0.t + HubMs.week, px: $0.px) } }
            }
            past = KalshiClient.settledFromMarkets(settled)
            if let pinned = pinnedTicker, let exact = open.first(where: { String(describing: $0["ticker"] ?? "") == pinned })
                ?? (try? await KalshiClient.fetchMarket(ticker: pinned, timeout: 1.2)) {
                publishFromMarket(exact, now: now)
            } else if let market = KalshiClient.pickOpen(open, now: now) {
                publishFromMarket(market, now: now)
            }
        } catch {
            banner = DeskBanner(title: "Board failed", detail: error.localizedDescription, holdingLast: quote != nil)
        }
    }

    private func publishFromMarket(_ market: [String: Any], now: Double) {
        let live = quote?.live ?? points.last?.px ?? 0
        var q = KalshiClient.marketToQuote(market, live: live, source: quote?.liveSource ?? "kalshi", now: now)
        if let current = quote {
            q.yesAsk = current.yesAsk != 0 ? current.yesAsk : q.yesAsk
            q.noAsk = current.noAsk != 0 ? current.noAsk : q.noAsk
            q.live = current.live != 0 ? current.live : q.live
        }
        publish(q)
    }

    private func refreshDash() async {
        guard !dashInFlight else { return }
        dashInFlight = true
        defer { dashInFlight = false }
        let now = Date.nowMs
        lastDashAt = now
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
        var thisWeek15: [Point] = []
        var lastWeekRaw: [Point] = []
        if isBTC {
            thisWeek15 = (try? await KalshiClient.fetchCandles(
                startMs: rangeStart - 30.0 * HubMs.minute,
                endMs: rangeStart + HubMs.day,
                gran: 900,
                timeout: 1.6
            )) ?? []
            lastWeekRaw = (try? await KalshiClient.fetchCandles(
                startMs: rangeStart - HubMs.week - 30.0 * HubMs.minute,
                endMs: rangeStart - HubMs.week + HubMs.day,
                gran: 900,
                timeout: 1.6
            )) ?? []
        }
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
