import SwiftUI
import UIKit

@main
struct HubPredictionApp: App {
    @StateObject private var store = DeskStore()

    init() {
        let bg = UIColor(red: 0.02, green: 0.024, blue: 0.027, alpha: 1)
        UIWindow.appearance().backgroundColor = bg
        UITableView.appearance().backgroundColor = bg
        UIScrollView.appearance().backgroundColor = bg
    }

    var body: some Scene {
        WindowGroup {
            DeskView()
                .environmentObject(store)
                .preferredColorScheme(.dark)
                .onAppear { store.start() }
        }
    }
}
