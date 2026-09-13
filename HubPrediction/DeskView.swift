import SwiftUI

struct DeskView: View {
    @EnvironmentObject private var store: DeskStore
    @Environment(\.horizontalSizeClass) private var hSize
    @State private var now = Date.nowMs
    @State private var showMarkets = false
    @State private var showKeys = false
    @Environment(\.scenePhase) private var scenePhase

    /// Mac Catalyst or iPad regular width — not a stretched phone stack.
    private var wide: Bool {
        HubDesk.isMac || hSize == .regular
    }

    var body: some View {
        ZStack {
            HubTheme.surface.ignoresSafeArea()
            if wide {
                wideDesk
            } else {
                phoneDesk
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if HubDesk.isMac {
                HubTheme.surface
                    .frame(height: HubDesk.macTitlebarInset)
                    .accessibilityHidden(true)
            }
        }
        .onReceive(Timer.publish(every: 0.25, on: .main, in: .common).autoconnect()) { _ in
            now = Date.nowMs
            store.pulse(now: now)
        }
        .task { store.start() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { store.nudge() }
        }
        .sheet(isPresented: $showMarkets) { MarketsSheet().environmentObject(store) }
        .sheet(isPresented: $showKeys) { CredsSheet().environmentObject(store) }
    }

    private var phoneDesk: some View {
        VStack(spacing: 0) {
            heroCall
                .padding(.horizontal, 16)
                .padding(.top, 8)
            AlertBanner()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    CashStrip()
                    BotLane(now: now)
                    TradePanel(compact: true, now: now)
                    tape
                    liveLine
                    ChartCanvas(
                        live: store.quote?.live ?? 0,
                        closeAt: store.quote?.closeAt ?? 0,
                        points: store.quote?.points ?? [],
                        prior: store.quote?.prior ?? [],
                        lean: store.call.side,
                        dash: store.dash,
                        quote: store.quote,
                        beat: store.beat,
                        clockNow: now,
                        chartHeight: HubDesk.phoneChartHeight
                    )
                    VarianceChart(
                        rows: store.dash?.elapsed ?? [],
                        chartHeight: HubDesk.phoneVarianceHeight
                    )
                    roulette
                    dayFilter
                    restOfDay
                }
                .padding(.bottom, 28)
            }
        }
    }

    /// Signal chrome is pinned. Rest-of-day / elapsed tables (~96 slots) live
    /// only in the ScrollView so they cannot crush first paint.
    private var wideDesk: some View {
        VStack(spacing: 0) {
            signalDesk
                .layoutPriority(1)
            AlertBanner()
            ScrollView {
                dayFilter
                restOfDay
                    .padding(.bottom, 28)
            }
        }
    }

    private var signalDesk: some View {
        Group {
            if HubDesk.isMac {
                macOperator
            } else {
                stackedSignal
            }
        }
    }

    /// Mac first paint: countdown + arm + theory now/next + charts. Full day stays in the scroll.
    private var macOperator: some View {
        VStack(spacing: 8) {
            heroCall
                .padding(.horizontal, HubDesk.sectionPad)
                .padding(.top, 6)
            TradePanel(compact: true, now: now)
            HStack(alignment: .top, spacing: 12) {
                CashStrip()
                tape
            }
            nowNextTheory
            HStack(alignment: .top, spacing: 12) {
                VStack(spacing: 0) {
                    ChartCanvas(
                        live: store.quote?.live ?? 0,
                        closeAt: store.quote?.closeAt ?? 0,
                        points: store.quote?.points ?? [],
                        prior: store.quote?.prior ?? [],
                        lean: store.call.side,
                        dash: store.dash,
                        quote: store.quote,
                        beat: store.beat,
                        clockNow: now,
                        chartHeight: HubDesk.macChartHeight
                    )
                    VarianceChart(
                        rows: store.dash?.elapsed ?? [],
                        chartHeight: HubDesk.macVarianceHeight
                    )
                }
                .frame(maxWidth: .infinity, alignment: .top)
                VStack(spacing: 0) {
                    BotLane(now: now)
                    roulette
                }
                .frame(minWidth: 260, idealWidth: 300, maxWidth: 360, alignment: .top)
            }
        }
    }

    private var nowNextTheory: some View {
        let rows = Array((store.dash?.upcoming ?? []).prefix(HubDesk.macNowNextRows))
        return VStack(alignment: .leading, spacing: 6) {
            Text("NOW + NEXT · THEORY")
                .font(HubDesk.font(10, weight: .medium))
                .foregroundStyle(HubTheme.quiet)
                .tracking(1.4)
            Text("Grok Build path · Clock / Theory / Actual / Preview / Variance / Last week / Vs open / High / Low")
                .font(HubDesk.font(11))
                .foregroundStyle(HubTheme.quiet)
            slotTable(rows, empty: "Waiting on rest-of-day slots")
        }
        .padding(.horizontal, HubDesk.sectionPad)
        .padding(.top, 4)
    }

    private var stackedSignal: some View {
        VStack(spacing: 0) {
            heroCall
                .padding(.horizontal, HubDesk.sectionPad)
                .padding(.top, 12)
            liveLine
            CashStrip()
            BotLane(now: now)
            TradePanel(compact: true, now: now)
            tape
            HStack(alignment: .top, spacing: 8) {
                VStack(spacing: 0) {
                    ChartCanvas(
                        live: store.quote?.live ?? 0,
                        closeAt: store.quote?.closeAt ?? 0,
                        points: store.quote?.points ?? [],
                        prior: store.quote?.prior ?? [],
                        lean: store.call.side,
                        dash: store.dash,
                        quote: store.quote,
                        beat: store.beat,
                        clockNow: now,
                        chartHeight: HubDesk.macChartHeight
                    )
                    VarianceChart(
                        rows: store.dash?.elapsed ?? [],
                        chartHeight: HubDesk.macVarianceHeight
                    )
                }
                .frame(maxWidth: .infinity, alignment: .top)
                roulette
                    .frame(minWidth: 240, idealWidth: 280, maxWidth: 320, alignment: .top)
            }
        }
    }

    private var buyPhase: BuyPhase {
        BuyWindow.phase(closeAt: store.quote?.closeAt ?? 0, now: now)
    }

    private var windowLabel: String {
        BuyWindow.headline(phase: buyPhase, call: store.call)
    }

    private var tone: Color {
        switch windowLabel {
        case "BUY UP": return HubTheme.up
        case "BUY DOWN": return HubTheme.down
        default: return HubTheme.ink
        }
    }

    /// Always-on 6–4m call. BUY UP / BUY DOWN / SIT — pending countdown when waiting.
    private var heroCall: some View {
        let up = windowLabel == "BUY UP"
        let down = windowLabel == "BUY DOWN"
        let ink = down ? Color(red: 0.10, green: 0.02, blue: 0.02) : up ? Color(red: 0.016, green: 0.078, blue: 0.047) : HubTheme.copy
        return VStack(alignment: .leading, spacing: HubDesk.isMac ? 8 : 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("BUY WINDOW 6–4m · CALL · \(store.mode == .paper ? "PAPER" : "LIVE")")
                    .font(HubDesk.font(11, weight: .medium))
                    .tracking(1.6)
                Spacer()
                Button("Markets") { showMarkets = true }
                    .buttonStyle(.plain)
                    .font(HubDesk.font(13, weight: .bold))
                Button("Keys") { showKeys = true }
                    .buttonStyle(.plain)
                    .font(HubDesk.font(13, weight: .bold))
            }
            HStack(alignment: .bottom) {
                Text(windowLabel)
                    .font(HubDesk.font(52, weight: .bold))
                    .tracking(1.0)
                    .minimumScaleFactor(0.55)
                    .lineLimit(1)
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(heroClock.label)
                        .font(HubDesk.font(11, weight: .medium))
                        .tracking(1.4)
                        .opacity(0.85)
                    Text(heroClock.value)
                        .font(HubDesk.font(36, weight: .bold))
                        .monospacedDigit()
                }
            }
            Text(BuyWindow.heroLine(phase: buyPhase, call: store.call, closeAt: store.quote?.closeAt ?? 0, now: now))
                .font(HubDesk.font(16, weight: .semibold))
            Text(BuyWindow.reasonLine(quote: store.quote, beat: store.beat, call: store.call))
                .font(HubDesk.font(12))
                .opacity(0.9)
        }
        .foregroundStyle(ink)
        .padding(HubDesk.isMac ? 16 : 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: up
                    ? [Color(red: 0.0, green: 1.0, blue: 0.53), Color(red: 0.0, green: 0.79, blue: 0.40)]
                    : down
                        ? [Color(red: 1.0, green: 0.43, blue: 0.43), Color(red: 0.89, green: 0.24, blue: 0.24)]
                        : [Color(red: 0.063, green: 0.086, blue: 0.078), Color(red: 0.043, green: 0.059, blue: 0.051)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(tone.opacity(0.4)))
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .shadow(color: (up ? HubTheme.up : down ? HubTheme.down : HubTheme.up).opacity(up || down ? 0.28 : 0.08), radius: 14)
    }

    private var tickAge: String {
        guard store.lastQuoteAt > 0 else { return "—" }
        let sec = max(0, (now - store.lastQuoteAt) / HubMs.second)
        return String(format: "%.1fs", sec)
    }

    private var heroClock: (label: String, value: String) {
        BuyWindow.heroClock(phase: buyPhase, closeAt: store.quote?.closeAt ?? 0, now: now)
    }

    private var tape: some View {
        HStack(spacing: 8) {
            tapeCard(label: "UP ASK", value: Money.cents(store.quote?.yesAsk), up: true)
            tapeCard(label: "DOWN ASK", value: Money.cents(store.quote?.noAsk), up: false)
        }
        .padding(.horizontal, HubDesk.sectionPad)
        .padding(.top, HubDesk.sectionGap)
    }

    private func tapeCard(label: String, value: String, up: Bool) -> some View {
        VStack(alignment: .leading, spacing: HubDesk.isMac ? 8 : 6) {
            Text(label)
                .font(HubDesk.font(10, weight: .medium))
                .foregroundStyle(HubTheme.quiet)
                .tracking(1.6)
            Text(value)
                .font(HubDesk.font(30, weight: .semibold))
                .foregroundStyle(up ? HubTheme.up : HubTheme.down)
        }
        .padding(HubDesk.cardPad)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(HubTheme.panel)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke((up ? HubTheme.up : HubTheme.down).opacity(0.4))
        )
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var liveLine: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(HubTheme.up)
                .frame(width: 7, height: 7)
                .shadow(color: HubTheme.up, radius: 4)
            Text("Live \(store.quote?.liveSource == "coinbase" ? "Coinbase" : "Kalshi") \(Money.dollarsExact(store.quote?.live)) vs posted \(Money.dollarsExact(store.quote?.strike)) · tick \(tickAge)")
                .font(HubDesk.font(11))
                .foregroundStyle(HubTheme.quiet)
            if store.holdingLast {
                Text("· last ¢ held — see banner + Retry")
                    .font(HubDesk.font(11))
                    .foregroundStyle(HubTheme.quiet)
            }
        }
        .padding(.horizontal, HubDesk.sectionPad)
        .padding(.top, HubDesk.sectionGap)
    }

    private var roulette: some View {
        let list = Array((store.quote?.past ?? []).prefix(24))
        let up = list.filter { $0.result == .up }.count
        let down = list.count - up
        let upPct = list.isEmpty ? 0 : Int((Double(up) / Double(list.count) * 100.0).rounded())
        let cols = 8
        return VStack(alignment: .leading, spacing: HubDesk.isMac ? 10 : 8) {
            HStack {
                Text("ROULETTE · LAST \(list.isEmpty ? "—" : "\(list.count)") SETTLED")
                    .font(HubDesk.font(10, weight: .medium))
                    .foregroundStyle(HubTheme.quiet)
                    .tracking(1.4)
                Spacer()
                Text(list.isEmpty ? "warming" : "\(upPct)% UP · \(100 - upPct)% DOWN")
                    .font(HubDesk.font(11))
                    .foregroundStyle(HubTheme.quiet)
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: cols), spacing: 6) {
                ForEach(list.isEmpty ? placeholders : list) { item in
                    RoundedRectangle(cornerRadius: 6)
                        .fill(item.ticker == "—" ? HubTheme.chip : item.result == .up ? HubTheme.up : HubTheme.down)
                        .frame(height: wide ? 22 : 32)
                        .shadow(color: item.ticker == "—" ? .clear : (item.result == .up ? HubTheme.up : HubTheme.down).opacity(0.4), radius: 6)
                }
            }
            Text("\(up) UP / \(down) DOWN · newest first")
                .font(HubDesk.font(10))
                .foregroundStyle(HubTheme.quiet)
        }
        .padding(.horizontal, HubDesk.sectionPad)
        .padding(.top, HubDesk.isMac ? 18 : 16)
    }

    private var placeholders: [Settled] {
        (0..<8).map { Settled(ticker: "—", closeAt: Double($0), result: .sit) }
    }

    private var dayFilter: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("DAY")
                .font(HubDesk.font(10, weight: .medium))
                .foregroundStyle(HubTheme.quiet)
                .tracking(1.8)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(store.days, id: \.key) { d in
                        Button {
                            store.setDay(d.key)
                        } label: {
                            Text(d.label)
                                .font(HubDesk.font(12))
                                .padding(.horizontal, 12)
                                .frame(height: HubDesk.isMac ? 44 : 40)
                                .background(d.key == store.day ? HubTheme.up : HubTheme.chip)
                                .foregroundStyle(d.key == store.day ? Color(red: 0.016, green: 0.078, blue: 0.047) : HubTheme.ink)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(.horizontal, HubDesk.sectionPad)
        .padding(.top, 20)
    }

    private var restOfDay: some View {
        let upcoming = store.dash?.upcoming ?? []
        let elapsed = Array((store.dash?.elapsed ?? []).reversed())
        return VStack(alignment: .leading, spacing: 12) {
            Text("NOW + REST OF DAY · 15 MIN")
                .font(HubDesk.font(10, weight: .medium))
                .foregroundStyle(HubTheme.quiet)
                .tracking(1.4)
            Text("Current clock and upcoming theory. Swipe sideways for last week.")
                .font(HubDesk.font(12))
                .foregroundStyle(HubTheme.quiet)
            slotTable(upcoming, empty: "Waiting on rest-of-day slots")
            if !elapsed.isEmpty {
                Text("ELAPSED · ACTUAL VS THEORY")
                    .font(HubDesk.font(10, weight: .medium))
                    .foregroundStyle(HubTheme.quiet)
                    .tracking(1.4)
                    .padding(.top, 8)
                slotTable(elapsed, empty: "")
            }
        }
        .padding(.horizontal, HubDesk.sectionPad)
        .padding(.top, 20)
    }

    private func slotTable(_ rows: [DashRow], empty: String) -> some View {
        Group {
            if rows.isEmpty {
                Text(empty)
                    .font(.system(size: 14))
                    .foregroundStyle(HubTheme.mute)
            } else if wide {
                ScrollView(.horizontal, showsIndicators: true) {
                    VStack(alignment: .leading, spacing: 0) {
                        wideHeader
                        ForEach(rows) { row in
                            wideRow(row)
                        }
                    }
                    .frame(minWidth: 980)
                    .padding(10)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(HubTheme.panel)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(HubTheme.up.opacity(0.16)))
            } else {
                VStack(spacing: 8) {
                    ForEach(rows) { row in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(row.clock)
                                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                                if row.isNow {
                                    Text("NOW")
                                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                                        .foregroundStyle(HubTheme.up)
                                }
                            }
                            HStack {
                                phoneStat("THEORY", Money.dollarsExact(row.theory))
                                phoneStat("ACTUAL", Money.dollarsExact(row.actual))
                            }
                            HStack {
                                phoneStat("PREVIEW", Money.dollarsExact(row.preview))
                                phoneStat("VAR", Money.signed(row.variance))
                            }
                            HStack {
                                phoneStat("LAST WK", Money.dollarsExact(row.lastWeek))
                                phoneStat("VS OPEN", Money.signed(row.vsOpen))
                            }
                            HStack {
                                phoneStat("HIGH", Money.dollarsExact(row.high))
                                phoneStat("LOW", Money.dollarsExact(row.low))
                            }
                        }
                        .foregroundStyle(row.isNow ? HubTheme.up : HubTheme.ink)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(row.isNow ? HubTheme.up.opacity(0.08) : HubTheme.panel)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(HubTheme.up.opacity(0.14)))
                    }
                }
            }
        }
    }

    private func phoneStat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 9, design: .monospaced))
                .foregroundStyle(HubTheme.mute)
            Text(value)
                .font(.system(size: 13, design: .monospaced))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var wideHeader: some View {
        HStack(spacing: 0) {
            flexHead("CLOCK")
            flexHead("THEORY")
            flexHead("ACTUAL")
            flexHead("PREVIEW")
            flexHead("VARIANCE")
            flexHead("LAST WEEK")
            flexHead("VS OPEN")
            flexHead("HIGH")
            flexHead("LOW")
        }
    }

    private func wideRow(_ row: DashRow) -> some View {
        HStack(spacing: 0) {
            flexCell(row.clock + (row.isNow ? " · now" : ""), now: row.isNow)
            flexCell(Money.dollarsExact(row.theory), now: row.isNow)
            flexCell(Money.dollarsExact(row.actual), now: row.isNow)
            flexCell(Money.dollarsExact(row.preview), now: row.isNow)
            flexCell(Money.signed(row.variance), now: row.isNow)
            flexCell(Money.dollarsExact(row.lastWeek), now: row.isNow)
            flexCell(Money.signed(row.vsOpen), now: row.isNow)
            flexCell(Money.dollarsExact(row.high), now: row.isNow)
            flexCell(Money.dollarsExact(row.low), now: row.isNow)
        }
        .background(row.isNow ? HubTheme.up.opacity(0.08) : Color.clear)
    }

    private func flexHead(_ t: String) -> some View {
        Text(t)
            .font(HubDesk.font(10, weight: .medium))
            .foregroundStyle(HubTheme.quiet)
            .tracking(1.0)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, HubDesk.isMac ? 10 : 8)
    }

    private func flexCell(_ t: String, now: Bool) -> some View {
        Text(t)
            .font(HubDesk.font(13))
            .foregroundStyle(now ? HubTheme.up : HubTheme.copy)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, HubDesk.isMac ? 10 : 8)
    }
}
