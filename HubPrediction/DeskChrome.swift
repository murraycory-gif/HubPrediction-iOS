import SwiftUI

struct CashStrip: View {
    @EnvironmentObject private var store: DeskStore

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("CASH")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(HubTheme.mute)
                    .tracking(1.4)
                Text(store.mode == .paper
                     ? Money.dollarsExact(PaperBook.cash)
                     : (store.hasCreds ? Money.dollarsExact(store.cash) : "—"))
                    .font(.system(size: 22, weight: .semibold, design: .monospaced))
                    .foregroundStyle(HubTheme.ink)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(store.mode == .paper ? "PAPER P/L" : "LIVE EDGE")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(HubTheme.mute)
                    .tracking(1.4)
                Text(store.mode == .paper ? Money.signed(store.paperPnL) : Money.signed(store.expectedProfit))
                    .font(.system(size: 22, weight: .semibold, design: .monospaced))
                    .foregroundStyle((store.mode == .paper ? store.paperPnL : store.expectedProfit) >= 0 ? HubTheme.up : HubTheme.down)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("SIZE → PROFIT")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(HubTheme.mute)
                    .tracking(1.4)
                Text("\(store.tradeCount) · EV \(Money.signed(store.expectedProfit))")
                    .font(.system(size: 16, weight: .semibold, design: .monospaced))
                    .foregroundStyle(HubTheme.ink)
            }
            Spacer()
            if store.mode == .paper {
                Button("Reset paper") { store.resetPaper() }
                    .buttonStyle(.plain)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(HubTheme.mute)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(HubTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(HubTheme.up.opacity(0.18)))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }
}

struct BotLane: View {
    @EnvironmentObject private var store: DeskStore
    var now: Double

    var body: some View {
        let phase = BuyWindow.phase(closeAt: store.quote?.closeAt ?? 0, now: now)
        let bots = DeskBots.analysts(quote: store.quote, call: store.call)
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("BOTS // EXECUTE")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(HubTheme.mute)
                    .tracking(1.4)
                Spacer()
                Button(store.botsArmed ? "BOTS ON" : "BOTS OFF") {
                    store.setBotsArmed(!store.botsArmed)
                }
                .buttonStyle(.plain)
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .padding(.horizontal, 10)
                .frame(height: 28)
                .background(store.botsArmed ? HubTheme.up : HubTheme.chip)
                .foregroundStyle(store.botsArmed ? Color(red: 0.02, green: 0.04, blue: 0.03) : HubTheme.ink)
                .clipShape(RoundedRectangle(cornerRadius: 7))
            }
            HStack(spacing: 8) {
                ForEach(bots) { bot in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(bot.name)
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(HubTheme.mute)
                        Text(bot.side == .up ? "UP" : bot.side == .down ? "DOWN" : "SIT")
                            .font(.system(size: 14, weight: .bold, design: .monospaced))
                            .foregroundStyle(bot.side == .up ? HubTheme.up : bot.side == .down ? HubTheme.down : HubTheme.ink)
                    }
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(HubTheme.chip)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
            Text(botStatus(phase: phase))
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(HubTheme.mute)
            if let note = store.botNote {
                Text(note)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(HubTheme.up)
            }
        }
        .padding(12)
        .background(HubTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(HubTheme.up.opacity(0.18)))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private func botStatus(phase: BuyPhase) -> String {
        if !store.botsArmed {
            return "Disarmed. Arm to let bots buy in the 6–4m window. Paper auto · LIVE Confirm."
        }
        switch phase {
        case .waiting:
            return "Armed · waiting for 6–4m window. \(store.mode == .paper ? "Paper auto" : "LIVE Confirm")."
        case .open:
            if store.call.willBuy {
                return "Armed · window open · \(store.mode == .paper ? "PAPER AUTO" : "LIVE CONFIRM") \(store.tradeCount) \(store.call.side == .down ? "DOWN" : "UP")"
            }
            return "Armed · window open · NO BUY (bots sit)."
        case .late:
            return "Armed · window closed. No new bot orders."
        case .settled:
            return "Armed · settled."
        }
    }
}
