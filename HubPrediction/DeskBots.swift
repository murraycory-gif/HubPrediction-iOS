import Foundation

struct BotLean: Identifiable, Equatable {
    var name: String
    var aka: String
    var side: DeskSide
    var note: String
    var id: String { name }
}

/// Prior hub-prediction desk.ts analysts (Strike / Tape / Path) as SCOUT / RISK / SIGNAL.
enum DeskBots {
    private static let armedKey = "hub.bots.armed"

    /// Bots do the buying. Missing key means ON — `bool(forKey:)` is false and was Soft FAIL.
    static var armed: Bool {
        get {
            if UserDefaults.standard.object(forKey: armedKey) == nil { return true }
            return UserDefaults.standard.bool(forKey: armedKey)
        }
        set { UserDefaults.standard.set(newValue, forKey: armedKey) }
    }

    static func ensureDefaultOn() {
        if UserDefaults.standard.object(forKey: armedKey) == nil {
            UserDefaults.standard.set(true, forKey: armedKey)
        }
    }

    static func analysts(quote: Quote?, beat: BeatPath) -> [BotLean] {
        let live = quote?.live ?? 0
        let strike = quote?.strike ?? live
        let gap = live - strike
        let yes = quote?.yesAsk ?? 50
        let scout: DeskSide = gap > 2 ? .up : gap < -2 ? .down : .sit
        let risk: DeskSide = yes < 48 ? .up : yes > 52 ? .down : .sit
        return [
            BotLean(name: "SCOUT", aka: "STRIKE", side: scout, note: "gap vs posted"),
            BotLean(name: "SIGNAL", aka: "PATH", side: beat.beatSide, note: "beat-trend"),
            BotLean(name: "RISK", aka: "TAPE", side: risk, note: "ask / edge"),
        ]
    }

    static func shouldExecute(phase: BuyPhase, call: DeskCall, count: Int) -> Bool {
        phase == .open
            && call.willBuy
            && (call.side == .up || call.side == .down)
            && count >= 1
    }
}
