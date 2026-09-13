import SwiftUI

/// View-only BTC15m desk geometry. Same SwiftUI target on iPhone and Mac Catalyst.
enum HubDesk {
    static var isMac: Bool {
        #if targetEnvironment(macCatalyst)
        true
        #else
        false
        #endif
    }

    static let phoneChartHeight: CGFloat = 220
    /// Short enough that call bar + tape + chart + roulette stay above the fold
    /// in the 640pt minimum Mac window. Tables never share this stack.
    static let macChartHeight: CGFloat = 248
    static let macMinWidth: CGFloat = 980
    static let macMinHeight: CGFloat = 640
    static let macDefaultWidth: CGFloat = 1280
    static let macDefaultHeight: CGFloat = 820
}
