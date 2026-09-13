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
    @Published var beat: BeatPath = BeatPath()
    @Published var windowOpen: Bool = false
    @Published var sideOverride: Bool = false
    @Published var queued: Bool = false
    @Published var queuedSide: DeskSide = .up
    @Published var queuedCount: Int = 1

    static let quoteIntervalMs = 750.0
    static let dashIntervalMs = 5_000.0
    static let boardIntervalMs = 10_000.0
    static let inflightWatchMs = 3_000.0

    private var lastDashAt: Double = 0
    private var lastBoardAt: Double = 0
    private var didStart = false
    private var quoteInFlight = false
    private var dashInFlight = false
    private var boardInFlight = false
    private var quoteStartedAt: Double = 0
    private var points: [Point] = []
    private var prior: [Point] = []
    private var past: [Settled] = []
    private var status: (exchangeActive: Bool, tradingActive: Bool)?
    private let thesisKey = "hub.thesis"
    private var lastHeroTicker: String = ""

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
        DeskBots.ensureDefaultOn()
        botsArmed = DeskBots.armed
        if botsArmed {
            botNote = "Bots armed — they execute ALL buys when 6–4m opens. Paper local · LIVE needs Keys."
        }
        Task { await refreshAll() }
        Task { await searchMarkets(query: "") }
        if mode == .live, hasCreds { Task { await refreshCash() } }
    }

    func pulse(now: Double) {
        if quoteInFlight, quoteStartedAt > 0, now - quoteStartedAt > Self.inflightWatchMs {
            quoteInFlight = false
        }
        applyLiveChrome(now: now)
        tickBots(now: now)
        tickQueue(now: now)
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

    func nudge() {
        quoteInFlight = false
        dashInFlight = false
        boardInFlight = false
        lastQuoteAt = 0
        Task { await refreshQuote() }
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
        sideOverride = false
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
            ? "Bots armed — execute ALL buys in the 6–4m window. Paper local · LIVE Kalshi (keys required)."
            : "Bots off. ARM or QUEUE a fill — waiting is not a lockout."
    }

    func queueForWindow() {
        if tradeSide == .sit { tradeSide = call.side == .down ? .down : .up }
        queuedSide = tradeSide
        queuedCount = min(SizeCash.maxContracts, max(1, tradeCount))
        queued = true
        tradeNote = "Queued \(queuedCount) \(queuedSide == .down ? "DOWN" : "UP") — fires in the 6–4m window. Paper local · LIVE needs Keys."
    }

    func clearQueue() {
        queued = false
        tradeNote = "Queue cleared. Arm bots or queue again."
    }

    func tickQueue(now: Double) {
        guard queued, !tradeBusy else { return }
        let phase = BuyWindow.phase(closeAt: quote?.closeAt ?? 0, now: now)
        if phase == .late || phase == .settled {
            queued = false
            tradeNote = "Queue expired — window closed. Arm bots for the next 15m."
            return
        }
        guard phase == .open else { return }
        if mode == .live {
            guard hasCreds else {
                banner = DeskBanner(title: "Keys needed", detail: "Queued LIVE fill needs Keys. Switch to Paper or paste keys.", holdingLast: false)
                return
            }
            if status?.tradingActive == false { return }
        }
        tradeSide = queuedSide
        tradeCount = queuedCount
        queued = false
        confirmFromBot = false
        tradeNote = "Queued fill — executing \(tradeCount) \(tradeSide == .down ? "DOWN" : "UP")."
        Task { await confirmPlace(fromBot: false) }
    }

    func tickBots(now: Double) {
        guard botsArmed, !tradeBusy else { return }
        let ask = (call.side == .down ? quote?.noAsk : quote?.yesAsk) ?? 0
        let n = SizeCash.contractsFromCash(cash: workingCash, askCents: ask, pWin: call.pWin)
        guard n >= 1 else { return }
        tradeCount = n
        if call.side == .up || call.side == .down { tradeSide = call.side }
        let phase = BuyWindow.phase(closeAt: quote?.closeAt ?? 0, now: now)
        guard DeskBots.shouldExecute(phase: phase, call: call, count: n) else { return }
        guard let ticker = quote?.ticker, !ticker.isEmpty, botFiredTicker != ticker else { return }
        tradeSide = call.side
        if mode == .live {
            guard hasCreds else {
                banner = DeskBanner(title: "Keys needed", detail: "LIVE bots need Kalshi API Key ID + PEM in Keys. Paper still auto-fills.", holdingLast: false)
                return
            }
            if status?.tradingActive == false { return }
        }
        botFiredTicker = ticker
        confirmFromBot = true
        botNote = "BOT \(mode == .paper ? "paper" : "LIVE") \(tradeCount) \(call.side == .down ? "DOWN" : "UP") · \(ticker)"
        Task { await confirmPlace(fromBot: true) }
    }

    @discardableResult
    func assertOpenWindow(now: Double = Date.nowMs) -> Bool {
        let close = quote?.closeAt ?? 0
        let phase = BuyWindow.phase(closeAt: close, now: now)
        windowOpen = phase == .open
        guard phase == .open else {
            showConfirm = false
            banner = DeskBanner(
                title: "Buy window closed",
                detail: BuyWindow.detail(phase: phase, closeAt: close, now: now) + " Human and bot fills only in the last 6–4 minutes.",
                holdingLast: false
            )
            return false
        }
        return true
    }

    func requestPlace(fromBot: Bool = false) {
        guard quote?.ticker.isEmpty == false else {
            banner = DeskBanner(title: "No market", detail: "Wait for a quote or pick a market, then retry.", holdingLast: false)
            return
        }
        guard assertOpenWindow() else { return }
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
        guard assertOpenWindow() else { return }
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
        applyLiveChrome(now: Date.nowMs, quote: attached)
        if tradeSide == .sit, call.side != .sit { tradeSide = call.side }
    }

    private func applyLiveChrome(now: Double, quote q: Quote? = nil) {
        let used = q ?? quote
        beat = BeatTrend.evaluate(
            quote: used,
            points: points.isEmpty ? (used?.points ?? []) : points,
            prior: prior,
            dash: dash,
            now: now,
            closeAt: used?.closeAt ?? 0
        )
        let raw = KalshiSignal.kalshiCall(used)
        call = KalshiSignal.holdThesis(quote: used, next: raw, peek: peekThesis, write: writeThesis)
        windowOpen = BuyWindow.phase(closeAt: used?.closeAt ?? 0, now: now) == .open
        if let ticker = used?.ticker, !ticker.isEmpty, ticker != lastHeroTicker {
            lastHeroTicker = ticker
            sideOverride = false
        }
        if !sideOverride, call.side == .up || call.side == .down {
            tradeSide = call.side
        }
    }

    func pickSide(_ side: DeskSide) {
        tradeSide = side
        sideOverride = true
    }

    private func recomputeBeat(_ q: Quote?) {
        let now = Date.nowMs
        beat = BeatTrend.evaluate(
            quote: q ?? quote,
            points: points.isEmpty ? (q?.points ?? []) : points,
            prior: prior,
            dash: dash,
            now: now,
            closeAt: q?.closeAt ?? quote?.closeAt ?? 0
        )
    }

    func refreshQuote() async {
        guard !quoteInFlight else { return }
        quoteInFlight = true
        quoteStartedAt = Date.nowMs
        defer { quoteInFlight = false }
        let now = Date.nowMs
        do {
            async let statusP = KalshiClient.fetchStatus()
            async let coinP = KalshiClient.fetchCoinbase(timeout: 1.5)
            async let marketP = fetchOpenMarket(now: now)
            let st = try? await statusP
            if let st {
                status = st
                if st.tradingActive == false {
                    if banner?.title != "Kalshi halt" {
                        banner = DeskBanner(
                            title: "Kalshi halt",
                            detail: "Spot and asks still refresh. No new LIVE orders until Kalshi trading resumes.",
                            holdingLast: false
                        )
                    }
                } else if banner?.title == "Kalshi halt" || banner?.title == "Kalshi halted" {
                    banner = nil
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
            lastQuoteAt = now
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
            // Await must sit in the async function body — not inside `if let … ?? await`
            // (Swift treats that `??` as a non-async autoclosure; Catalyst then fails to compile).
            var exact: [String: Any]?
            if let pinned = pinnedTicker, !pinned.isEmpty {
                exact = open.first(where: { String(describing: $0["ticker"] ?? "") == pinned })
                if exact == nil {
                    exact = try? await KalshiClient.fetchMarket(ticker: pinned, timeout: 1.2)
                }
            }
            if let exact {
                publishFromMarket(exact, now: now)
            } else if let market = KalshiClient.pickOpen(open, now: now) {
                publishFromMarket(market, now: now)
            }
        } catch {
            banner = DeskBanner(title: "Board failed", detail: error.localizedDescription, holdingLast: quote != nil)
        }
    }

    private func publishFromMarket(_ market: [String: Any], now: Double) {
        if let current = quote, current.fetchedAt > now - 2_000 {
            publish(current)
            return
        }
        let live = quote?.live ?? KalshiClient.num(market["last_price"]) ?? points.last?.px ?? 0
        var q = KalshiClient.marketToQuote(market, live: live, source: quote?.liveSource ?? "kalshi", now: now)
        q.points = points
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
        var lastWeekOHLC: [Candle] = []
        if isBTC {
            thisWeek15 = (try? await KalshiClient.fetchCandles(
                startMs: rangeStart - 30.0 * HubMs.minute,
                endMs: rangeStart + HubMs.day,
                gran: 900,
                timeout: 1.6
            )) ?? []
            lastWeekOHLC = ((try? await KalshiClient.fetchOHLC(
                startMs: rangeStart - HubMs.week - 30.0 * HubMs.minute,
                endMs: rangeStart - HubMs.week + HubMs.day,
                gran: 900,
                timeout: 1.6
            )) ?? []).map { Candle(t: $0.t + HubMs.week, open: $0.open, high: $0.high, low: $0.low, close: $0.close) }
        }
        let thisWeek = thisWeek15 + points
        let lastWeek = lastWeekOHLC.map(\.point)
        let live = quote?.live ?? thisWeek.last?.px ?? lastWeek.last?.px ?? 0
        let slope = Forecast.slopeFromPoints(thisWeek.isEmpty ? quote?.points : thisWeek, now: lookNow)
        let nowSlot = ChicagoTime.align15(lookNow)
        let slots = ChicagoTime.slotsForDay(dayStart)
        let lwNow = Forecast.nearest(lastWeek, nowSlot) ?? live
        let lwOpen = slots.first.flatMap { Forecast.nearest(lastWeek, $0) } ?? lastWeek.first?.px
        var upcoming: [DashRow] = []
        var elapsed: [DashRow] = []
        for t in slots {
            let actual = t <= lookNow ? Forecast.nearest(thisWeek, t + 14.0 * HubMs.minute) ?? Forecast.nearest(thisWeek, t) : nil
            let bar = Forecast.nearestCandle(lastWeekOHLC, t)
            let lw = bar?.close ?? Forecast.nearest(lastWeek, t)
            let theory = Forecast.slotTheory(
                t: t,
                nowSlot: nowSlot,
                lookNow: lookNow,
                live: live,
                slope: slope,
                lastWeek: lw,
                lastWeekNow: lwNow,
                actual: actual
            )
            let preview = Forecast.slotPreview(
                t: t,
                nowSlot: nowSlot,
                lookNow: lookNow,
                live: live,
                slope: slope,
                actual: actual
            )
            let row = DashRow(
                t: t,
                clock: ChicagoTime.formatClock(t),
                theory: theory,
                actual: actual,
                preview: preview,
                lastWeek: lw,
                variance: actual != nil && theory != nil ? actual! - theory! : nil,
                vsOpen: Forecast.vsOpen(lastWeek: lw, dayOpen: lwOpen),
                high: bar?.high,
                low: bar?.low,
                isNow: isToday && t == nowSlot
            )
            if isToday && t >= nowSlot { upcoming.append(row) } else { elapsed.append(row) }
        }
        dash = Dash(day: ChicagoTime.dayKey(dayStart), weekday: ChicagoTime.weekdayName(dayStart), upcoming: upcoming, elapsed: elapsed)
        recomputeBeat(quote)
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
