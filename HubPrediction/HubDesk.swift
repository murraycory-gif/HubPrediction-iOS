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
    /// Trend + variance sit in the pinned signal stack. Tables never share it.
    static let macChartHeight: CGFloat = 200
    static let macVarianceHeight: CGFloat = 120
    /// Now + next slots on first paint — not the full 96-row wall.
    static let macNowNextRows = 8
    static let macMinWidth: CGFloat = 1100
    static let macMinHeight: CGFloat = 860
    static let macDefaultWidth: CGFloat = 1380
    static let macDefaultHeight: CGFloat = 1020

    /// Catalyst titlebar / traffic lights overlay the content view (safe-area top is 0).
    static let macTitlebarInset: CGFloat = 38
    static var windowTopInset: CGFloat { isMac ? macTitlebarInset : 0 }

    static var sectionPad: CGFloat { isMac ? 22 : 16 }
    static var sectionGap: CGFloat { isMac ? 14 : 8 }
    static var cardPad: CGFloat { isMac ? 18 : 12 }

    /// Phone sizes stay put. Mac adds air so 10pt microtext is not the desk.
    static func type(_ phone: CGFloat) -> CGFloat {
        guard isMac else { return phone }
        if phone <= 11 { return phone + 4 }
        if phone <= 16 { return phone + 3 }
        return phone + 6
    }

    static func font(_ phone: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: type(phone), weight: weight, design: .monospaced)
    }

    /// Keep the traffic-light titlebar from eating the call bar. Safe-area top is 0 on Catalyst.
    static func pinMacTitlebar() {
        #if targetEnvironment(macCatalyst)
        for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
            scene.titlebar?.titleVisibility = .visible
            scene.sizeRestrictions?.minimumSize = CGSize(width: macMinWidth, height: macMinHeight)
            for window in scene.windows {
                window.backgroundColor = UIColor(red: 0.027, green: 0.031, blue: 0.039, alpha: 1)
                if let root = window.rootViewController {
                    if root.additionalSafeAreaInsets.top < 8 {
                        root.additionalSafeAreaInsets.top = 8
                    }
                }
            }
        }
        #endif
    }
}
