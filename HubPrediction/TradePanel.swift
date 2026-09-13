import SwiftUI

struct TradePanel: View {
    @EnvironmentObject private var store: DeskStore
    var compact: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: HubDesk.isMac ? 14 : 10) {
            HStack {
                Text("TRADE · \(store.quote?.ticker.isEmpty == false ? store.quote!.ticker : store.seriesTicker)")
                    .font(HubDesk.font(10, weight: .medium))
                    .foregroundStyle(HubTheme.quiet)
                    .tracking(1.4)
                Spacer()
                modeBtn("PAPER", .paper)
                modeBtn("LIVE", .live)
            }
            HStack {
                Text(store.mode == .paper
                     ? "Paper cash \(Money.dollarsExact(PaperBook.cash)) · local fills only"
                     : (store.hasCreds ? (store.cash == nil ? "LIVE keys on" : "LIVE cash \(Money.dollarsExact(store.cash))") : "LIVE needs Keys"))
                    .font(HubDesk.font(11))
                    .foregroundStyle(HubTheme.quiet)
                Spacer()
                if store.mode == .paper {
                    Button("Reset paper") { store.resetPaper() }
                        .buttonStyle(.plain)
                        .font(HubDesk.font(11))
                        .foregroundStyle(HubTheme.quiet)
                }
            }
            HStack(spacing: HubDesk.isMac ? 12 : 8) {
                sideBtn("UP", side: .up)
                sideBtn("DOWN", side: .down)
                Button("−") { store.tradeCount = max(1, store.tradeCount - 1) }
                    .buttonStyle(.plain)
                    .frame(width: HubDesk.isMac ? 44 : 36, height: HubDesk.isMac ? 48 : 40)
                    .background(HubTheme.chip)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .foregroundStyle(HubTheme.copy)
                Text("\(store.tradeCount)")
                    .font(HubDesk.font(20, weight: .semibold))
                    .foregroundStyle(HubTheme.copy)
                    .frame(minWidth: 28)
                Button("+") { store.tradeCount = min(SizeCash.maxContracts, store.tradeCount + 1) }
                    .buttonStyle(.plain)
                    .frame(width: HubDesk.isMac ? 44 : 36, height: HubDesk.isMac ? 48 : 40)
                    .background(HubTheme.chip)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .foregroundStyle(HubTheme.copy)
            }
            HStack(spacing: 10) {
                Button("Suggest") { store.applySuggestedSize() }
                    .buttonStyle(.plain)
                    .font(HubDesk.font(12))
                    .foregroundStyle(HubTheme.up)
                Text("EV \(Money.signed(store.expectedProfit)) · \(store.mode == .paper ? "paper" : "LIVE") · max \(SizeCash.maxContracts)")
                    .font(HubDesk.font(10))
                    .foregroundStyle(HubTheme.quiet)
                Spacer()
            }
            Button {
                store.requestPlace()
            } label: {
                Text(store.tradeBusy ? "PLACING…" : (store.windowOpen
                     ? "\(store.mode == .paper ? "PAPER" : "LIVE") \(store.tradeCount) \(store.tradeSide == .down ? "DOWN" : "UP")"
                     : "WAIT · 6–4m WINDOW"))
                    .font(HubDesk.font(14, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .frame(height: compact ? 42 : 52)
                    .background(store.windowOpen ? (store.tradeSide == .down ? HubTheme.down : HubTheme.up) : HubTheme.chip)
                    .foregroundStyle(store.windowOpen ? Color(red: 0.02, green: 0.04, blue: 0.03) : HubTheme.quiet)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(store.tradeBusy || !store.windowOpen)
            if let note = store.tradeNote {
                Text(note)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(HubTheme.up)
            }
        }
        .padding(HubDesk.cardPad)
        .background(HubTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(HubTheme.up.opacity(0.24)))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, HubDesk.sectionPad)
        .padding(.top, HubDesk.isMac ? 14 : 12)
        .confirmationDialog(
            store.mode == .paper
                ? "\(store.confirmFromBot ? "BOT " : "")Paper fill \(store.tradeCount) \(store.tradeSide == .down ? "DOWN" : "UP") on \(store.quote?.ticker ?? "—") at \(Money.cents(store.tradeSide == .down ? store.quote?.noAsk : store.quote?.yesAsk))? EV \(Money.signed(store.expectedProfit)). Stays on this device."
                : "\(store.confirmFromBot ? "BOT " : "")LIVE Kalshi: buy \(store.tradeCount) \(store.tradeSide == .down ? "DOWN" : "UP") on \(store.quote?.ticker ?? "—") at \(Money.cents(store.tradeSide == .down ? store.quote?.noAsk : store.quote?.yesAsk))? EV \(Money.signed(store.expectedProfit)). Real money.",
            isPresented: $store.showConfirm,
            titleVisibility: .visible
        ) {
            Button(store.mode == .paper ? "Confirm paper" : "Confirm LIVE") { Task { await store.confirmPlace() } }
            Button("Cancel", role: .cancel) { store.showConfirm = false }
        }
    }

    private func modeBtn(_ title: String, _ mode: DeskMode) -> some View {
        Button {
            store.setMode(mode)
        } label: {
            Text(title)
                .font(HubDesk.font(11, weight: .bold))
                .padding(.horizontal, HubDesk.isMac ? 12 : 8)
                .frame(height: HubDesk.isMac ? 34 : 28)
                .background(store.mode == mode ? (mode == .live ? HubTheme.down : HubTheme.up) : HubTheme.chip)
                .foregroundStyle(store.mode == mode ? Color(red: 0.02, green: 0.04, blue: 0.03) : HubTheme.copy)
                .clipShape(RoundedRectangle(cornerRadius: 7))
        }
        .buttonStyle(.plain)
    }

    private func sideBtn(_ title: String, side: DeskSide) -> some View {
        Button {
            store.tradeSide = side
        } label: {
            Text(title)
                .font(HubDesk.font(14, weight: .semibold))
                .frame(maxWidth: .infinity)
                .frame(height: HubDesk.isMac ? 48 : 40)
                .background(store.tradeSide == side ? (side == .up ? HubTheme.up : HubTheme.down) : HubTheme.chip)
                .foregroundStyle(store.tradeSide == side ? Color(red: 0.02, green: 0.04, blue: 0.03) : HubTheme.copy)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }
}

struct AlertBanner: View {
    @EnvironmentObject private var store: DeskStore

    var body: some View {
        if let b = store.banner {
            VStack(alignment: .leading, spacing: 8) {
                Text(b.title.uppercased())
                    .font(HubDesk.font(10, weight: .medium))
                    .tracking(1.6)
                Text(b.detail)
                    .font(HubDesk.font(12))
                if b.holdingLast {
                    Text("Last ¢ is on screen. This is not a silent hold — Retry when you want a fresh quote.")
                        .font(HubDesk.font(11))
                        .opacity(0.8)
                }
                Button("Retry") { store.retry() }
                    .buttonStyle(.plain)
                    .font(HubDesk.font(13, weight: .semibold))
                    .padding(.horizontal, 12)
                    .frame(height: 36)
                    .background(HubTheme.chip)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .foregroundStyle(HubTheme.ink)
            .padding(HubDesk.cardPad)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(HubTheme.down.opacity(0.18))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(HubTheme.down.opacity(0.45)))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, HubDesk.sectionPad)
            .padding(.top, HubDesk.sectionGap)
        }
    }
}
