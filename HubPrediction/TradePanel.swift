import SwiftUI

struct TradePanel: View {
    @EnvironmentObject private var store: DeskStore
    var compact: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("TRADE · \(store.quote?.ticker.isEmpty == false ? store.quote!.ticker : store.seriesTicker)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(HubTheme.mute)
                    .tracking(1.4)
                Spacer()
                modeBtn("PAPER", .paper)
                modeBtn("LIVE", .live)
            }
            HStack {
                Text(store.mode == .paper
                     ? "Paper cash \(Money.dollarsExact(PaperBook.cash)) · local fills only"
                     : (store.hasCreds ? (store.cash == nil ? "LIVE keys on" : "LIVE cash \(Money.dollarsExact(store.cash))") : "LIVE needs Keys"))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(HubTheme.mute)
                Spacer()
                if store.mode == .paper {
                    Button("Reset paper") { store.resetPaper() }
                        .buttonStyle(.plain)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(HubTheme.mute)
                }
            }
            HStack(spacing: 8) {
                sideBtn("UP", side: .up)
                sideBtn("DOWN", side: .down)
                Button("−") { store.tradeCount = max(1, store.tradeCount - 1) }
                    .buttonStyle(.plain)
                    .frame(width: 36, height: 40)
                    .background(HubTheme.chip)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .foregroundStyle(HubTheme.ink)
                Text("\(store.tradeCount)")
                    .font(.system(size: 20, weight: .semibold, design: .monospaced))
                    .foregroundStyle(HubTheme.ink)
                    .frame(minWidth: 28)
                Button("+") { store.tradeCount = min(SizeCash.maxContracts, store.tradeCount + 1) }
                    .buttonStyle(.plain)
                    .frame(width: 36, height: 40)
                    .background(HubTheme.chip)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .foregroundStyle(HubTheme.ink)
            }
            HStack(spacing: 10) {
                Button("Suggest") { store.applySuggestedSize() }
                    .buttonStyle(.plain)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(HubTheme.up)
                Text(store.mode == .paper ? "paper fill · max \(SizeCash.maxContracts) · confirm" : "LIVE Kalshi · max \(SizeCash.maxContracts) · confirm")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(HubTheme.mute)
                Spacer()
            }
            Button {
                store.requestPlace()
            } label: {
                Text(store.tradeBusy ? "PLACING…" : "\(store.mode == .paper ? "PAPER" : "LIVE") \(store.tradeCount) \(store.tradeSide == .down ? "DOWN" : "UP")")
                    .font(.system(size: 14, weight: .bold, design: .monospaced))
                    .frame(maxWidth: .infinity)
                    .frame(height: compact ? 42 : 48)
                    .background(store.tradeSide == .down ? HubTheme.down : HubTheme.up)
                    .foregroundStyle(Color(red: 0.02, green: 0.04, blue: 0.03))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(store.tradeBusy)
            if let note = store.tradeNote {
                Text(note)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(HubTheme.up)
            }
        }
        .padding(12)
        .background(HubTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(HubTheme.up.opacity(0.2)))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .confirmationDialog(
            store.mode == .paper
                ? "Paper fill \(store.tradeCount) \(store.tradeSide == .down ? "DOWN" : "UP") on \(store.quote?.ticker ?? "—") at \(Money.cents(store.tradeSide == .down ? store.quote?.noAsk : store.quote?.yesAsk))? Stays on this device."
                : "LIVE Kalshi: buy \(store.tradeCount) \(store.tradeSide == .down ? "DOWN" : "UP") on \(store.quote?.ticker ?? "—") at \(Money.cents(store.tradeSide == .down ? store.quote?.noAsk : store.quote?.yesAsk))? Real money.",
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
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .padding(.horizontal, 8)
                .frame(height: 28)
                .background(store.mode == mode ? (mode == .live ? HubTheme.down : HubTheme.up) : HubTheme.chip)
                .foregroundStyle(store.mode == mode ? Color(red: 0.02, green: 0.04, blue: 0.03) : HubTheme.ink)
                .clipShape(RoundedRectangle(cornerRadius: 7))
        }
        .buttonStyle(.plain)
    }

    private func sideBtn(_ title: String, side: DeskSide) -> some View {
        Button {
            store.tradeSide = side
        } label: {
            Text(title)
                .font(.system(size: 14, weight: .semibold, design: .monospaced))
                .frame(maxWidth: .infinity)
                .frame(height: 40)
                .background(store.tradeSide == side ? (side == .up ? HubTheme.up : HubTheme.down) : HubTheme.chip)
                .foregroundStyle(store.tradeSide == side ? Color(red: 0.02, green: 0.04, blue: 0.03) : HubTheme.ink)
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
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .tracking(1.6)
                Text(b.detail)
                    .font(.system(size: 12, design: .monospaced))
                if b.holdingLast {
                    Text("Last ¢ is on screen. This is not a silent hold — Retry when you want a fresh quote.")
                        .font(.system(size: 11, design: .monospaced))
                        .opacity(0.8)
                }
                Button("Retry") { store.retry() }
                    .buttonStyle(.plain)
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .padding(.horizontal, 12)
                    .frame(height: 36)
                    .background(HubTheme.chip)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .foregroundStyle(HubTheme.ink)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(HubTheme.down.opacity(0.18))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(HubTheme.down.opacity(0.45)))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }
}
