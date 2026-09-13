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
    /// Small enough to sit on a 13" laptop without eating the display.
    static let macMinWidth: CGFloat = 720
    static let macMinHeight: CGFloat = 520
    static let macDefaultWidth: CGFloat = 1440
    static let macDefaultHeight: CGFloat = 900
    /// Catalyst treats a missing maximum as min==max (window frozen).
    static let macMaxWidth: CGFloat = 20_000
    static let macMaxHeight: CGFloat = 20_000
    private static var didFillDesktop = false

    /// Clear, non-hit-testable strip so the system titlebar stays a real drag region.
    static let macTitlebarInset: CGFloat = 28
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

    /// Visible system titlebar (drag + traffic lights) and a resizable window.
    /// `sizeRestrictions` is often nil on Catalyst (= fixed 924×648). Prefer
    /// `GeometryPreferences.Mac` so launch fills the usable desktop without
    /// locking full-screen — still drag and resize.
    static func pinMacTitlebar() {
        #if targetEnvironment(macCatalyst)
        for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
            if let titlebar = scene.titlebar {
                titlebar.titleVisibility = .visible
                titlebar.toolbar = nil
            }
            scene.sizeRestrictions?.minimumSize = CGSize(width: macMinWidth, height: macMinHeight)
            scene.sizeRestrictions?.maximumSize = CGSize(width: macMaxWidth, height: macMaxHeight)
            let bounds = scene.screen.bounds
            let margin: CGFloat = 8
            let menu: CGFloat = 25
            let dock: CGFloat = 72
            let frame = CGRect(
                x: margin,
                y: menu + margin,
                width: max(macMinWidth, bounds.width - margin * 2),
                height: max(macMinHeight, bounds.height - menu - dock - margin)
            )
            let fill = !didFillDesktop && !scene.windows.isEmpty
            if fill { didFillDesktop = true }
            if #available(macCatalyst 16.0, *), fill {
                let prefs = UIWindowScene.GeometryPreferences.Mac()
                prefs.systemFrame = frame
                scene.requestGeometryUpdate(prefs) { _ in }
            }
            for window in scene.windows {
                window.backgroundColor = .black
                window.rootViewController?.additionalSafeAreaInsets = .zero
                if fill {
                    window.frame = frame
                }
            }
        }
        #endif
    }
}
