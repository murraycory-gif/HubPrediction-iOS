import SwiftUI

enum HubTheme {
    static let surface = Color.black
    static let ink = Color(red: 0.843, green: 1.0, blue: 0.941)
    static let mute = Color(red: 0.435, green: 0.541, blue: 0.490)
    /// Brighter mute on Mac so labels do not vanish into the panel.
    static var quiet: Color {
        HubDesk.isMac ? Color(red: 0.64, green: 0.78, blue: 0.72) : mute
    }
    static var copy: Color {
        HubDesk.isMac ? Color(red: 0.90, green: 1.0, blue: 0.95) : ink
    }
    static let line = Color(red: 0.086, green: 0.196, blue: 0.149)
    static let up = Color(red: 0.0, green: 0.898, blue: 0.478)
    static let down = Color(red: 1.0, green: 0.353, blue: 0.353)
    static let chip = Color(red: 0.047, green: 0.067, blue: 0.063)
    static let panel = Color(red: 0.043, green: 0.063, blue: 0.055)
    static let mono: Font = .system(.body, design: .monospaced)
}
