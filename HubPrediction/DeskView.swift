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
        ZStack(alignment: .top) {
            GoldTone.bg.ignoresSafeArea(edges: HubDesk.isMac ? [.horizontal, .bottom] : .all)
            GeometryReader { geo in
                let chartH = max(
                    HubDesk.isMac ? HubDesk.macChartHeight : HubDesk.phoneChartHeight,
                    geo.size.height - 400
                )
                VStack(spacing: 0) {
                    GoldDesk(now: now, chartHeight: chartH)
                    AlertBanner()
                    quietTools
                    ScrollView {
                        dayFilter
                        restOfDay
                            .padding(.bottom, 28)
                    }
                }
                .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
            }
        }
        .onReceive(Timer.publish(every: 0.20, on: .main, in: .common).autoconnect()) { _ in
            now = Date.nowMs
            store.pulse(now: now)
        }
        .task { store.start() }
        .onAppear { HubDesk.pinMacTitlebar() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { store.nudge() }
        }
        .sheet(isPresented: $showMarkets) { MarketsSheet().environmentObject(store) }
        .sheet(isPresented: $showKeys) { CredsSheet().environmentObject(store) }
    }

    private var quietTools: some View {
        HStack(spacing: 16) {
            Button(store.mode == .paper ? "Paper" : "Live") {
                store.setMode(store.mode == .paper ? .live : .paper)
            }
            Button("Markets") { showMarkets = true }
            Button("Keys") { showKeys = true }
        }
        .buttonStyle(.plain)
        .font(GoldTone.display(13, weight: .medium))
        .foregroundStyle(GoldTone.mute)
        .padding(.top, 18)
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
