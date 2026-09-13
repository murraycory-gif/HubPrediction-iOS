import Foundation

enum DeskMode: String, CaseIterable {
    case paper
    case live
}

struct PaperFill: Identifiable, Codable, Equatable {
    var id: String
    var ticker: String
    var side: String
    var count: Int
    var askCents: Double
    var at: Double
}

/// Local paper book. Never calls Kalshi order or portfolio endpoints.
enum PaperBook {
    static let startCash = 10_000.0
    private static let cashKey = "hub.paper.cash"
    private static let fillsKey = "hub.paper.fills"
    private static let modeKey = "hub.desk.mode"

    static var mode: DeskMode {
        get { DeskMode(rawValue: UserDefaults.standard.string(forKey: modeKey) ?? "") ?? .paper }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: modeKey) }
    }

    static var cash: Double {
        get {
            if UserDefaults.standard.object(forKey: cashKey) == nil { return startCash }
            return UserDefaults.standard.double(forKey: cashKey)
        }
        set { UserDefaults.standard.set(newValue, forKey: cashKey) }
    }

    static var fills: [PaperFill] {
        get {
            guard let data = UserDefaults.standard.data(forKey: fillsKey),
                  let list = try? JSONDecoder().decode([PaperFill].self, from: data)
            else { return [] }
            return list
        }
        set {
            if let data = try? JSONEncoder().encode(newValue) {
                UserDefaults.standard.set(data, forKey: fillsKey)
            }
        }
    }

    static func reset() {
        cash = startCash
        fills = []
    }

    static func place(ticker: String, side: DeskSide, count: Int, yesAsk: Double, noAsk: Double) throws -> PaperFill {
        guard side == .up || side == .down else {
            throw KalshiAuthError.http(400, "Pick UP or DOWN.")
        }
        let n = min(SizeCash.maxContracts, max(1, count))
        let ask = side == .up ? yesAsk : noAsk
        let cost = Double(n) * (min(99, max(1, ask.rounded())) / 100.0)
        guard cash >= cost else {
            throw KalshiAuthError.http(400, "Paper cash \(Money.dollarsExact(cash)) cannot cover \(Money.dollarsExact(cost)). Reset paper or size down.")
        }
        cash -= cost
        let fill = PaperFill(
            id: "paper-\(UUID().uuidString)",
            ticker: ticker,
            side: side.rawValue,
            count: n,
            askCents: ask,
            at: Date.nowMs
        )
        fills = [fill] + fills
        return fill
    }
}
