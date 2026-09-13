import Foundation

struct BotLean: Identifiable, Equatable {
    var name: String
    var side: DeskSide
    var id: String { name }
}

/// Strike / Tape / Path analysts + executor. Bots place paper fills; live still Confirm.
enum DeskBots {
    private static let armedKey = "hub.bots.armed"

    static var armed: Bool {
        get { UserDefaults.standard.bool(forKey: armedKey) }
        set { UserDefaults.standard.set(newValue, forKey: armedKey) }
    }

    static func analysts(quote: Quote?, call: DeskCall) -> [BotLean] {
        let live = quote?.live ?? 0
        let strike = quote?.strike ?? live
        let gap = live - strike
        let yes = quote?.yesAsk ?? 50
        return [
            BotLean(name: "STRIKE", side: gap > 2 ? .up : gap < -2 ? .down : .sit),
            BotLean(name: "TAPE", side: yes < 48 ? .up : yes > 52 ? .down : .sit),
            BotLean(name: "PATH", side: call.side),
        ]
    }

    static func shouldExecute(phase: BuyPhase, call: DeskCall, count: Int) -> Bool {
        phase == .open
            && call.willBuy
            && (call.side == .up || call.side == .down)
            && count >= 1
    }
}
