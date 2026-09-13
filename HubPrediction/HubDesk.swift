import SwiftUI
import UIKit

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
    static let macChartHeight: CGFloat = 260
    static let macVarianceHeight: CGFloat = 120
    static let macNowNextRows = 8
    /// Fulfillment Heartbeat Mac Soft KEEP: default 1280×860, min ~1100×720.
    static let macMinWidth: CGFloat = 1100
    static let macMinHeight: CGFloat = 720
    static let macDefaultWidth: CGFloat = 1280
    static let macDefaultHeight: CGFloat = 860
    static let macMaxWidth: CGFloat = 20_000
    static let macMaxHeight: CGFloat = 20_000

    /// Real titlebar is the drag strip. Do not overlay a 28pt black bar.
    static let macTitlebarInset: CGFloat = 8
    static var windowTopInset: CGFloat { isMac ? macTitlebarInset : 0 }

    static var sectionPad: CGFloat { isMac ? 22 : 16 }
    static var sectionGap: CGFloat { isMac ? 14 : 8 }
    static var cardPad: CGFloat { isMac ? 18 : 12 }

    static func type(_ phone: CGFloat) -> CGFloat {
        guard isMac else { return phone }
        if phone <= 11 { return phone + 4 }
        if phone <= 16 { return phone + 3 }
        return phone + 6
    }

    static func font(_ phone: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: type(phone), weight: weight, design: .monospaced)
    }

    /// Heartbeat Mac pattern: title + sizeRestrictions.minimumSize only via guard.
    /// maximumSize stays large so zoom/expand can fill the screen. Never assign
    /// a UIWindow CGRect — that launched the black slab.
    static func pinMacTitlebar() {
        #if targetEnvironment(macCatalyst)
        for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
            scene.title = "HUB Pred"
            if let titlebar = scene.titlebar {
                titlebar.titleVisibility = .visible
                titlebar.toolbar = nil
            }
            guard let size = scene.sizeRestrictions else { continue }
            size.minimumSize = CGSize(width: macMinWidth, height: macMinHeight)
            size.maximumSize = CGSize(width: macMaxWidth, height: macMaxHeight)
            for window in scene.windows {
                window.backgroundColor = .black
                window.rootViewController?.additionalSafeAreaInsets = .zero
            }
        }
        #endif
    }
}
