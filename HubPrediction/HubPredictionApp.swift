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
                .onAppear {
                    store.start()
                    #if targetEnvironment(macCatalyst)
                    for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
                        scene.title = "HUB Pred"
                        guard let size = scene.sizeRestrictions else { return }
                        size.minimumSize = CGSize(width: 1100, height: 720)
                        size.maximumSize = CGSize(width: HubDesk.macMaxWidth, height: HubDesk.macMaxHeight)
                    }
                    #endif
                    HubDesk.pinMacTitlebar()
                }
        }
        .defaultSize(width: 1280, height: 860)
    }
}
