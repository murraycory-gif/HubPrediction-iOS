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
    static let macChartHeight: CGFloat = 380
    static let macMinWidth: CGFloat = 980
    static let macMinHeight: CGFloat = 640
    static let macDefaultWidth: CGFloat = 1280
    static let macDefaultHeight: CGFloat = 820
}
