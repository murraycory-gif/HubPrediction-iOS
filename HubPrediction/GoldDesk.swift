import SwiftUI

/// Pixel-faithful clone of the Grok Build gold desk (Cory CoS 2026-09-13).
/// Call still comes from `kalshiCall` + `holdThesis`. Fill chrome is not on this surface.
struct GoldDesk: View {
    @EnvironmentObject private var store: DeskStore
    var now: Double

    private var quote: Quote? { store.quote }
    private var call: DeskCall { store.call }
    private var live: Double { quote?.live ?? 0 }
    private var strike: Double { quote?.strike ?? 0 }
    private var gap: Double { live - strike }
    private var theory: Double {
        Forecast.theoryAtClose(
            live: live,
            closeAt: quote?.closeAt ?? 0,
            now: now,
            points: quote?.points ?? [],
            dash: store.dash
        ) ?? live
    }
    private var theoryDown: Bool { theory < strike - 0.5 }
    private var theoryUp: Bool { theory > strike + 0.5 }
    private var below: Bool { gap < -0.5 }
    private var above: Bool { gap > 0.5 }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            hero
            postedRow
            kalshiCards
            askPills
            trendCard
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .frame(maxWidth: HubDesk.isMac ? 430 : .infinity)
        .confirmationDialog(
            store.mode == .paper
                ? "Paper fill \(store.tradeCount) \(store.tradeSide == .down ? "DOWN" : "UP") at \(Money.cents(store.tradeSide == .down ? quote?.noAsk : quote?.yesAsk))?"
                : "LIVE buy \(store.tradeCount) \(store.tradeSide == .down ? "DOWN" : "UP") at \(Money.cents(store.tradeSide == .down ? quote?.noAsk : quote?.yesAsk))?",
            isPresented: $store.showConfirm,
            titleVisibility: .visible
        ) {
            Button(store.mode == .paper ? "Confirm paper" : "Confirm LIVE") { Task { await store.confirmPlace() } }
            Button("Cancel", role: .cancel) { store.showConfirm = false }
        }
    }

    private var hero: some View {
        let down = call.label == "BUY DOWN"
        let up = call.label == "BUY UP"
        let fill = down ? GoldTone.downPill : up ? GoldTone.upPill : GoldTone.sitPill
        let ink = (down || up) ? Color.black : Color.white
        return HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(call.label)
                    .font(GoldTone.display(34, weight: .bold))
                    .tracking(-0.4)
                Text(heroSub)
                    .font(GoldTone.display(15, weight: .medium))
                    .opacity(0.78)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(closeClock)
                    .font(GoldTone.display(40, weight: .semibold))
                    .monospacedDigit()
                Text("to close")
                    .font(GoldTone.display(14, weight: .medium))
                    .opacity(0.72)
            }
        }
        .foregroundStyle(ink)
        .padding(.horizontal, 22)
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(fill)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
    }

    private var heroSub: String {
        if call.willBuy || call.locked { return "Desk will buy" }
        if call.label == "SIT" { return "Desk sits" }
        return "Desk will buy"
    }

    private var closeClock: String {
        guard let close = quote?.closeAt, close.isFinite else { return "--:--" }
        return BuyWindow.clock(max(0, close - now))
    }

    private var postedRow: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text("POSTED")
                    .font(GoldTone.label)
                    .foregroundStyle(GoldTone.mute)
                Text(Money.dollarsExact(strike))
                    .font(GoldTone.display(22, weight: .semibold))
                    .foregroundStyle(.white)
                Text(liveVsTarget)
                    .font(GoldTone.display(12))
                    .foregroundStyle(below ? GoldTone.downText : above ? GoldTone.upText : GoldTone.mute)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .leading, spacing: 4) {
                Text("THEORY CLOSE")
                    .font(GoldTone.label)
                    .foregroundStyle(GoldTone.mute)
                Text(Money.dollarsExact(theory))
                    .font(GoldTone.display(22, weight: .semibold))
                    .foregroundStyle(theoryDown ? GoldTone.downText : theoryUp ? GoldTone.upText : .white)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .trailing, spacing: 4) {
                Text("LIVE VS POSTED")
                    .font(GoldTone.label)
                    .foregroundStyle(GoldTone.mute)
                Text(Money.signed(gap))
                    .font(GoldTone.display(22, weight: .semibold))
                    .foregroundStyle(below ? GoldTone.downText : above ? GoldTone.upText : .white)
                HStack(spacing: 6) {
                    Circle().fill(GoldTone.upPill).frame(width: 7, height: 7)
                    Text("LIVE")
                        .font(GoldTone.label)
                        .foregroundStyle(GoldTone.mute)
                }
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(.top, 4)
    }

    private var liveVsTarget: String {
        let word = below ? "below" : above ? "above" : "at"
        return "Live \(Money.dollarsExact(live)) \(word) target"
    }

    private var kalshiCards: some View {
        HStack(spacing: 10) {
            card {
                Text("KALSHI POSTED")
                    .font(GoldTone.label)
                    .foregroundStyle(GoldTone.mute)
                Text(Money.dollarsExact(strike))
                    .font(GoldTone.display(28, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.top, 4)
                Text("Live \(below ? "below" : above ? "above" : "at") \(Money.dollarsExact(abs(gap)))")
                    .font(GoldTone.display(13))
                    .foregroundStyle(below ? GoldTone.downText : above ? GoldTone.upText : GoldTone.mute)
            }
            card {
                Text("THEORY AT CLOSE")
                    .font(GoldTone.label)
                    .foregroundStyle(GoldTone.mute)
                Text(Money.dollarsExact(theory))
                    .font(GoldTone.display(28, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.top, 4)
                Text("Theory finishes \(theoryDown ? "DOWN" : theoryUp ? "UP" : "FLAT")")
                    .font(GoldTone.display(13))
                    .foregroundStyle(theoryDown ? GoldTone.downText : theoryUp ? GoldTone.upText : GoldTone.mute)
            }
        }
    }

    private var askPills: some View {
        HStack(spacing: 10) {
            askPill("UP", cents: Money.cents(quote?.yesAsk), fill: GoldTone.upPill, side: .up)
            askPill("DOWN", cents: Money.cents(quote?.noAsk), fill: GoldTone.downPill, side: .down)
        }
    }

    private func askPill(_ title: String, cents: String, fill: Color, side: DeskSide) -> some View {
        Button {
            store.pickSide(side)
            store.requestPlace()
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(GoldTone.display(13, weight: .semibold))
                    .opacity(0.7)
                Text(cents)
                    .font(GoldTone.display(36, weight: .bold))
            }
            .foregroundStyle(Color.black)
            .padding(.horizontal, 22)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fill)
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var trendCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            ChartCanvas(
                live: live,
                closeAt: quote?.closeAt ?? 0,
                points: quote?.points ?? [],
                prior: quote?.prior ?? [],
                lean: call.side,
                dash: store.dash,
                quote: quote,
                beat: store.beat,
                clockNow: now,
                chartHeight: 220,
                gold: true,
                nextLine: "Next 15m \(theoryDown ? "DOWN" : theoryUp ? "UP" : "FLAT") vs this trend"
            )
        }
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(GoldTone.card)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

enum GoldTone {
    static let bg = Color.black
    static let card = Color(red: 0.102, green: 0.102, blue: 0.106)
    static let mute = Color(red: 0.55, green: 0.55, blue: 0.58)
    static let upPill = Color(red: 0.42, green: 0.95, blue: 0.62)
    static let downPill = Color(red: 1.0, green: 0.55, blue: 0.53)
    static let sitPill = Color(red: 0.16, green: 0.16, blue: 0.17)
    static let upText = Color(red: 0.42, green: 0.95, blue: 0.62)
    static let downText = Color(red: 1.0, green: 0.55, blue: 0.53)
    static let label = Font.system(size: 11, weight: .semibold, design: .rounded)

    static func display(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
}
