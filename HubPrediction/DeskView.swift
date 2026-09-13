import SwiftUI

struct DeskView: View {
    @EnvironmentObject private var store: DeskStore
    @Environment(\.horizontalSizeClass) private var hSize
    @State private var now = Date.nowMs

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
        }
    }

    private var phoneDesk: some View {
        VStack(spacing: 0) {
            callBar
                .padding(.horizontal, 16)
                .padding(.top, 8)
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
                        chartHeight: HubDesk.phoneChartHeight
                    )
                    roulette
                    dayFilter
                    restOfDay
                }
                .padding(.bottom, 28)
            }
        }
    }

    private var wideDesk: some View {
        VStack(spacing: 0) {
            callBar
                .padding(.horizontal, 20)
                .padding(.top, 12)
            liveLine
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 0) {
                    tape
                    roulette
                    dayFilter
                }
                .frame(minWidth: 360, idealWidth: 420, maxWidth: 460, alignment: .top)
                ChartCanvas(
                    live: store.quote?.live ?? 0,
                    closeAt: store.quote?.closeAt ?? 0,
                    points: store.quote?.points ?? [],
                    prior: store.quote?.prior ?? [],
                    lean: store.call.side,
                    chartHeight: HubDesk.macChartHeight
                )
                .frame(maxWidth: .infinity, alignment: .top)
            }
            restOfDay
            Spacer(minLength: 8)
        }
    }

    private var tone: Color {
        switch store.call.label {
        case "BUY UP": return HubTheme.up
        case "BUY DOWN": return HubTheme.down
        default: return HubTheme.ink
        }
    }

    private var callBar: some View {
        let up = store.call.label == "BUY UP"
        let down = store.call.label == "BUY DOWN"
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("DESK // SIGNAL · VIEW · KXBTC15M")
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .tracking(2.2)
                        .opacity(0.72)
                    Text(store.call.label)
                        .font(.system(size: 32, weight: .bold, design: .monospaced))
                        .tracking(1.2)
                }
                Spacer()
                Text(clockText)
                    .font(.system(size: 30, weight: .bold, design: .monospaced))
                    .monospacedDigit()
            }
            Text("\(Money.dollarsExact(store.quote?.live)) vs \(Money.dollarsExact(store.quote?.strike)) posted\(store.call.locked ? " · LOCK" : "")")
                .font(.system(size: 12, design: .monospaced))
                .opacity(0.8)
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
            Text("Live Coinbase \(Money.dollarsExact(store.quote?.live)) vs posted \(Money.dollarsExact(store.quote?.strike))")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(HubTheme.mute)
            if store.quote?.tradingActive == false {
                Text("· Kalshi halted — holding last ¢")
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
        let cols = wide ? 12 : 8
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
                        .frame(height: 32)
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
        (0..<(wide ? 12 : 8)).map { Settled(ticker: "—", closeAt: Double($0), result: .sit) }
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
                ScrollView(.horizontal, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        headerRow
                        ForEach(rows) { row in
                            HStack(spacing: 0) {
                                cell(row.clock, width: 118, now: row.isNow)
                                cell(Money.dollarsExact(row.theory), width: 88, now: row.isNow)
                                cell(Money.dollarsExact(row.actual), width: 88, now: row.isNow)
                                cell(Money.signed(row.variance), width: 88, now: row.isNow)
                                cell(Money.dollarsExact(row.lastWeek), width: 88, now: row.isNow)
                            }
                            .background(row.isNow ? HubTheme.up.opacity(0.08) : Color.clear)
                        }
                    }
                    .padding(8)
                    .background(HubTheme.panel)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(HubTheme.up.opacity(0.16)))
                }
            }
        }
    }

    private var headerRow: some View {
        HStack(spacing: 0) {
            head("CLOCK", width: 118)
            head("THEORY", width: 88)
            head("ACTUAL", width: 88)
            head("VARIANCE", width: 88)
            head("LAST WEEK", width: 88)
        }
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

    private func head(_ t: String, width: CGFloat) -> some View {
        Text(t)
            .font(.system(size: 10, design: .monospaced))
            .foregroundStyle(HubTheme.mute)
            .tracking(1.0)
            .frame(width: width, alignment: .leading)
            .padding(.vertical, 8)
    }

    private func cell(_ t: String, width: CGFloat, now: Bool) -> some View {
        Text(t)
            .font(.system(size: 13, design: .monospaced))
            .foregroundStyle(now ? HubTheme.up : HubTheme.ink)
            .frame(width: width, alignment: .leading)
            .padding(.vertical, 8)
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
