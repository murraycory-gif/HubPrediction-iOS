import SwiftUI

struct CashStrip: View {
    @EnvironmentObject private var store: DeskStore

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: HubDesk.isMac ? 20 : 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("CASH")
                    .font(HubDesk.font(10, weight: .medium))
                    .foregroundStyle(HubTheme.quiet)
                    .tracking(1.4)
                Text(store.mode == .paper
                     ? Money.dollarsExact(PaperBook.cash)
                     : (store.hasCreds ? Money.dollarsExact(store.cash) : "—"))
                    .font(HubDesk.font(22, weight: .semibold))
                    .foregroundStyle(HubTheme.copy)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(store.mode == .paper ? "PAPER P/L" : "LIVE EDGE")
                    .font(HubDesk.font(10, weight: .medium))
                    .foregroundStyle(HubTheme.quiet)
                    .tracking(1.4)
                Text(store.mode == .paper ? Money.signed(store.paperPnL) : Money.signed(store.expectedProfit))
                    .font(HubDesk.font(22, weight: .semibold))
                    .foregroundStyle((store.mode == .paper ? store.paperPnL : store.expectedProfit) >= 0 ? HubTheme.up : HubTheme.down)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("SIZE → PROFIT")
                    .font(HubDesk.font(10, weight: .medium))
                    .foregroundStyle(HubTheme.quiet)
                    .tracking(1.4)
                Text("\(store.tradeCount) · EV \(Money.signed(store.expectedProfit))")
                    .font(HubDesk.font(16, weight: .semibold))
                    .foregroundStyle(HubTheme.copy)
            }
            Spacer()
            if store.mode == .paper {
                Button("Reset paper") { store.resetPaper() }
                    .buttonStyle(.plain)
                    .font(HubDesk.font(11))
                    .foregroundStyle(HubTheme.quiet)
            }
        }
        .padding(HubDesk.cardPad)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(HubTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(HubTheme.up.opacity(0.22)))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal, HubDesk.sectionPad)
        .padding(.top, HubDesk.sectionGap)
    }
}

struct BotLane: View {
    @EnvironmentObject private var store: DeskStore
    var now: Double

    var body: some View {
        let phase = BuyWindow.phase(closeAt: store.quote?.closeAt ?? 0, now: now)
        let bots = DeskBots.analysts(quote: store.quote, beat: store.beat)
        VStack(alignment: .leading, spacing: HubDesk.isMac ? 12 : 8) {
            HStack {
                Text("BOTS // SCOUT · SIGNAL · RISK")
                    .font(HubDesk.font(10, weight: .medium))
                    .foregroundStyle(HubTheme.quiet)
                    .tracking(1.4)
                Spacer()
                Button(store.botsArmed ? "BOTS ON" : "ARM BOTS") {
                    store.setBotsArmed(!store.botsArmed)
                }
                .buttonStyle(.plain)
                .font(HubDesk.font(11, weight: .bold))
                .padding(.horizontal, HubDesk.isMac ? 14 : 10)
                .frame(height: HubDesk.isMac ? 34 : 28)
                .background(store.botsArmed ? HubTheme.up : HubTheme.chip)
                .foregroundStyle(store.botsArmed ? Color(red: 0.02, green: 0.04, blue: 0.03) : HubTheme.copy)
                .clipShape(RoundedRectangle(cornerRadius: 7))
            }
            HStack(spacing: HubDesk.isMac ? 12 : 8) {
                ForEach(bots) { bot in
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(bot.name) · \(bot.aka)")
                            .font(HubDesk.font(9, weight: .medium))
                            .foregroundStyle(HubTheme.quiet)
                        Text(bot.side == .up ? "UP" : bot.side == .down ? "DOWN" : "SIT")
                            .font(HubDesk.font(14, weight: .bold))
                            .foregroundStyle(bot.side == .up ? HubTheme.up : bot.side == .down ? HubTheme.down : HubTheme.copy)
                        Text(bot.note)
                            .font(HubDesk.font(9))
                            .foregroundStyle(HubTheme.quiet)
                    }
                    .padding(HubDesk.isMac ? 12 : 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(HubTheme.chip)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
            Text(botStatus(phase: phase))
                .font(HubDesk.font(11))
                .foregroundStyle(HubTheme.quiet)
            if let note = store.botNote {
                Text(note)
                    .font(HubDesk.font(11))
                    .foregroundStyle(HubTheme.up)
            }
        }
        .padding(HubDesk.cardPad)
        .background(HubTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(HubTheme.up.opacity(0.22)))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal, HubDesk.sectionPad)
        .padding(.top, HubDesk.sectionGap)
    }

    private func botStatus(phase: BuyPhase) -> String {
        if !store.botsArmed {
            return "Disarmed. Arm to let bots execute ALL buys in the 6–4m window. Paper local · LIVE Kalshi."
        }
        switch phase {
        case .waiting:
            return "Armed · waiting for 6–4m window. Then bots execute \(store.mode == .paper ? "paper" : "LIVE") fills."
        case .open:
            if store.call.willBuy {
                return "Armed · window open · EXECUTING \(store.mode == .paper ? "PAPER" : "LIVE") \(store.tradeCount) \(store.call.side == .down ? "DOWN" : "UP")"
            }
            return "Armed · window open · NO BUY (bots sit)."
        case .late:
            return "Armed · window closed. No new bot orders."
        case .settled:
            return "Armed · settled."
        }
    }
}
