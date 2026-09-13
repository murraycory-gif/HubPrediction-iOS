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
            HubTheme.surface.ignoresSafeArea(edges: HubDesk.isMac ? [.horizontal, .bottom] : .all)
            grokDesk
        }
        /// Clear, non-hit-testable strip — a filled bar here ate the titlebar drag on Catalyst.
        .safeAreaInset(edge: .top, spacing: 0) {
            if HubDesk.isMac {
                Color.clear
                    .frame(height: HubDesk.macTitlebarInset)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
        .onReceive(Timer.publish(every: 0.25, on: .main, in: .common).autoconnect()) { _ in
            now = Date.nowMs
            store.pulse(now: now)
        }
        .task { store.start() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                store.nudge()
                HubDesk.pinMacTitlebar()
            }
        }
        .sheet(isPresented: $showMarkets) { MarketsSheet().environmentObject(store) }
        .sheet(isPresented: $showKeys) { CredsSheet().environmentObject(store) }
    }

    /// Grok Build first paint: sticky call-bar, then tape / live / chart / roulette / theory.
    /// Bots and QUEUE stay below — they never replace the call-bar.
    private var grokDesk: some View {
        VStack(spacing: 0) {
            callBar
                .padding(.horizontal, HubDesk.sectionPad)
                .padding(.top, HubDesk.isMac ? 4 : 8)
            AlertBanner()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
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
                        chartHeight: HubDesk.isMac ? HubDesk.macChartHeight : HubDesk.phoneChartHeight
                    )
                    roulette
                    CashStrip()
                    TradePanel(compact: true, now: now)
                    BotLane(now: now)
                    dayFilter
                    restOfDay
                }
                .padding(.bottom, 28)
            }
        }
    }

    private var callLabel: String { store.call.label }

    /// Port of hub-prediction `dashboard.tsx` call-bar + `styles.css` .call-up / .call-down / .call-sit.
    private var callBar: some View {
        let up = callLabel == "BUY UP"
        let down = callLabel == "BUY DOWN"
        let ink = down
            ? Color(red: 0.102, green: 0.020, blue: 0.020)
            : up
                ? Color(red: 0.016, green: 0.078, blue: 0.047)
                : Color(red: 0.843, green: 1.0, blue: 0.941)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Desk // signal")
                            .font(HubDesk.font(10, weight: .medium))
                            .tracking(2.2)
                            .textCase(.uppercase)
                            .opacity(0.72)
                        Spacer()
                        Button("Markets") { showMarkets = true }
                            .buttonStyle(.plain)
                            .font(HubDesk.font(11, weight: .semibold))
                            .opacity(0.72)
                        Button("Keys") { showKeys = true }
                            .buttonStyle(.plain)
                            .font(HubDesk.font(11, weight: .semibold))
                            .opacity(0.72)
                    }
                    Text(callLabel)
                        .font(HubDesk.font(30, weight: .bold))
                        .tracking(0.8)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                Spacer(minLength: 8)
                Text(closeClock)
                    .font(HubDesk.font(30, weight: .bold))
                    .tracking(1.2)
                    .monospacedDigit()
            }
            Text("\(Money.dollarsExact(store.quote?.live)) vs \(Money.dollarsExact(store.quote?.strike)) posted\(store.call.locked ? " · LOCK" : "")")
                .font(HubDesk.font(12))
                .opacity(0.80)
        }
        .foregroundStyle(ink)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: up
                    ? [Color(red: 0.0, green: 1.0, blue: 0.533), Color(red: 0.0, green: 0.788, blue: 0.400)]
                    : down
                        ? [Color(red: 1.0, green: 0.427, blue: 0.427), Color(red: 0.886, green: 0.239, blue: 0.239)]
                        : [Color(red: 0.063, green: 0.086, blue: 0.078), Color(red: 0.043, green: 0.059, blue: 0.051)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(up ? Color(red: 0.490, green: 1.0, blue: 0.749) : down ? Color(red: 1.0, green: 0.604, blue: 0.604) : HubTheme.up.opacity(0.28))
        )
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .shadow(color: (up ? HubTheme.up : down ? HubTheme.down : HubTheme.up).opacity(up || down ? 0.32 : 0.12), radius: up || down ? 16 : 10)
    }

    /// CloseClock — mm:ss to settle, same as hub-prediction `close-clock.tsx`.
    private var closeClock: String {
        guard let close = store.quote?.closeAt, close.isFinite else { return "--:--" }
        return BuyWindow.clock(max(0, close - now))
    }

    private var tape: some View {
        HStack(spacing: 8) {
            tapeCard(label: "UP ask", value: Money.cents(store.quote?.yesAsk), up: true)
            tapeCard(label: "DOWN ask", value: Money.cents(store.quote?.noAsk), up: false)
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
            Text("Live \(store.quote?.liveSource == "brti" ? "BRTI" : "Coinbase") \(Money.dollarsExact(store.quote?.live)) vs posted \(Money.dollarsExact(store.quote?.strike))")
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
