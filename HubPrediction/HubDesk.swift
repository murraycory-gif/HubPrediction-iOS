import SwiftUI

/// Desk geometry. Same SwiftUI target on iPhone and Mac Catalyst.
enum HubDesk {
    static var isMac: Bool {
        #if targetEnvironment(macCatalyst)
        true
        #else
        false
        #endif
    }

    static let phoneChartHeight: CGFloat = 200
    static let phoneVarianceHeight: CGFloat = 160
    /// Trend + variance sit in the pinned signal stack. Tables never share it.
    static let macChartHeight: CGFloat = 188
    static let macVarianceHeight: CGFloat = 124
    static let macMinWidth: CGFloat = 980
    static let macMinHeight: CGFloat = 760
    static let macDefaultWidth: CGFloat = 1280
    static let macDefaultHeight: CGFloat = 900
}
