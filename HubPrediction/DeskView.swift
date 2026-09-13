import SwiftUI

struct DeskView: View {
    @EnvironmentObject private var store: DeskStore
    @Environment(\.horizontalSizeClass) private var hSize
    @State private var now = Date.nowMs
    @State private var showMarkets = false
    @State private var showKeys = false

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
        .onReceive(Timer.publish(every: 0.25, on: .main, in: .common).autoconnect()) { _ in
            now = Date.nowMs
            store.pulse(now: now)
        }
        .task { store.start() }
        .sheet(isPresented: $showMarkets) { MarketsSheet().environmentObject(store) }
        .sheet(isPresented: $showKeys) { CredsSheet().environmentObject(store) }
    }

    private var phoneDesk: some View {
        VStack(spacing: 0) {
            callBar
                .padding(.horizontal, 16)
                .padding(.top, 8)
            AlertBanner()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    CashStrip()
                    BotLane(now: now)
                    TradePanel(compact: true)
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
        VStack(spacing: 0) {
            callBar
                .padding(.horizontal, 20)
                .padding(.top, 12)
            liveLine
            CashStrip()
            BotLane(now: now)
            TradePanel(compact: true)
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

    private var callBar: some View {
        let up = windowLabel == "BUY UP"
        let down = windowLabel == "BUY DOWN"
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("BUY WINDOW 6–4m · \(store.mode == .paper ? "PAPER" : "LIVE") · \(store.seriesTicker)")
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .tracking(2.2)
                        .opacity(0.72)
                    Text(windowLabel)
                        .font(.system(size: 32, weight: .bold, design: .monospaced))
                        .tracking(1.2)
                }
                Spacer()
                Text(clockText)
                    .font(.system(size: 30, weight: .bold, design: .monospaced))
                    .monospacedDigit()
            }
            Text(store.beat.chrome)
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .opacity(0.92)
            Text(BuyWindow.detail(phase: buyPhase, closeAt: store.quote?.closeAt ?? 0, now: now))
                .font(.system(size: 11, design: .monospaced))
                .opacity(0.85)
            HStack {
                Text("\(Money.dollarsExact(store.quote?.live)) vs \(Money.dollarsExact(store.quote?.strike)) posted\(store.call.locked ? " · LOCK" : "")")
                    .font(.system(size: 12, design: .monospaced))
                    .opacity(0.8)
                Spacer()
                Button("Markets") { showMarkets = true }
                    .buttonStyle(.plain)
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                Button("Keys") { showKeys = true }
                    .buttonStyle(.plain)
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
            }
        }
        .foregroundStyle(down ? Color(red: 0.10, green: 0.02, blue: 0.02) : up ? Color(red: 0.016, green: 0.078, blue: 0.047) : HubTheme.ink)
        .padding(14)
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
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(tone.opacity(0.35)))
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .shadow(color: (up ? HubTheme.up : down ? HubTheme.down : HubTheme.up).opacity(up || down ? 0.32 : 0.08), radius: 16)
    }

    private var tickAge: String {
        guard store.lastQuoteAt > 0 else { return "—" }
        let sec = max(0, (now - store.lastQuoteAt) / HubMs.second)
        return String(format: "%.1fs", sec)
    }

    private var clockText: String {
        guard let close = store.quote?.closeAt, close.isFinite else { return "--:--" }
        let left = max(0.0, close - now)
        let mm = Int(left / HubMs.minute)
        let ss = Int(left.truncatingRemainder(dividingBy: HubMs.minute) / HubMs.second)
        return String(format: "%02d:%02d", mm, ss)
    }

    private var tape: some View {
        HStack(spacing: 8) {
            tapeCard(label: "UP ASK", value: Money.cents(store.quote?.yesAsk), up: true)
            tapeCard(label: "DOWN ASK", value: Money.cents(store.quote?.noAsk), up: false)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    private func tapeCard(label: String, value: String, up: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(HubTheme.mute)
                .tracking(1.6)
            Text(value)
                .font(.system(size: 30, weight: .semibold, design: .monospaced))
                .foregroundStyle(up ? HubTheme.up : HubTheme.down)
        }
        .padding(12)
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
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(HubTheme.mute)
            if store.holdingLast {
                Text("· last ¢ held — see banner + Retry")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(HubTheme.mute)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var roulette: some View {
        let list = Array((store.quote?.past ?? []).prefix(24))
        let up = list.filter { $0.result == .up }.count
        let down = list.count - up
        let upPct = list.isEmpty ? 0 : Int((Double(up) / Double(list.count) * 100.0).rounded())
        let cols = 8
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("ROULETTE · LAST \(list.isEmpty ? "—" : "\(list.count)") SETTLED")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(HubTheme.mute)
                    .tracking(1.4)
                Spacer()
                Text(list.isEmpty ? "warming" : "\(upPct)% UP · \(100 - upPct)% DOWN")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(HubTheme.mute)
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
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(HubTheme.mute)
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
    }

    private var placeholders: [Settled] {
        (0..<8).map { Settled(ticker: "—", closeAt: Double($0), result: .sit) }
    }

    private var dayFilter: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("DAY")
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(HubTheme.mute)
                .tracking(1.8)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(store.days, id: \.key) { d in
                        Button {
                            store.setDay(d.key)
                        } label: {
                            Text(d.label)
                                .font(.system(size: 12, design: .monospaced))
                                .padding(.horizontal, 12)
                                .frame(height: 40)
                                .background(d.key == store.day ? HubTheme.up : HubTheme.chip)
                                .foregroundStyle(d.key == store.day ? Color(red: 0.016, green: 0.078, blue: 0.047) : HubTheme.ink)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 20)
    }

    private var restOfDay: some View {
        let upcoming = store.dash?.upcoming ?? []
        let elapsed = Array((store.dash?.elapsed ?? []).reversed())
        return VStack(alignment: .leading, spacing: 12) {
            Text("NOW + REST OF DAY · 15 MIN")
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(HubTheme.mute)
                .tracking(1.4)
            slotTable(upcoming, empty: "Waiting on rest-of-day slots")
            if !elapsed.isEmpty {
                Text("ELAPSED · ACTUAL VS THEORY")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(HubTheme.mute)
                    .tracking(1.4)
                    .padding(.top, 8)
                slotTable(elapsed, empty: "")
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 20)
    }

    private func slotTable(_ rows: [DashRow], empty: String) -> some View {
        Group {
            if rows.isEmpty {
                Text(empty)
                    .font(.system(size: 14))
                    .foregroundStyle(HubTheme.mute)
            } else if wide {
                VStack(alignment: .leading, spacing: 0) {
                    wideHeader
                    ForEach(rows) { row in
                        wideRow(row)
                    }
                }
                .padding(10)
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
                                phoneStat("VAR", Money.signed(row.variance))
                                phoneStat("LAST WK", Money.dollarsExact(row.lastWeek))
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
            flexHead("VARIANCE")
            flexHead("LAST WEEK")
        }
    }

    private func wideRow(_ row: DashRow) -> some View {
        HStack(spacing: 0) {
            flexCell(row.clock, now: row.isNow)
            flexCell(Money.dollarsExact(row.theory), now: row.isNow)
            flexCell(Money.dollarsExact(row.actual), now: row.isNow)
            flexCell(Money.signed(row.variance), now: row.isNow)
            flexCell(Money.dollarsExact(row.lastWeek), now: row.isNow)
        }
        .background(row.isNow ? HubTheme.up.opacity(0.08) : Color.clear)
    }

    private func flexHead(_ t: String) -> some View {
        Text(t)
            .font(.system(size: 10, design: .monospaced))
            .foregroundStyle(HubTheme.mute)
            .tracking(1.0)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
    }

    private func flexCell(_ t: String, now: Bool) -> some View {
        Text(t)
            .font(.system(size: 13, design: .monospaced))
            .foregroundStyle(now ? HubTheme.up : HubTheme.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
    }
}
