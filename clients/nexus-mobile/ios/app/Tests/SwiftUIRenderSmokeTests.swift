import NexusKit
import SwiftUI
import Testing
import UIKit
@testable import Nexus

@Suite struct SwiftUIRenderSmokeTests {
    @MainActor private static func host(_ view: some View) -> UIWindow {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = UIHostingController(rootView: view)
        window.makeKeyAndVisible()
        window.rootViewController?.view.setNeedsLayout()
        window.rootViewController?.view.layoutIfNeeded()
        return window
    }

    @Test @MainActor func statusPillConnectingBuildsAViewHierarchy() {
        let root = StatusPill(runtime: .connecting, brighten: true) {}
        _ = Self.host(root)
    }

    @Test @MainActor func statusPillDisconnectedBuildsAViewHierarchy() {
        let root = StatusPill(runtime: .disconnected) {}
        _ = Self.host(root)
    }

    @Test @MainActor func settingsTabBuildsAViewHierarchy() {
        let appModel = NodeAppModel()
        let runtimeController = RuntimeConnectionController(appModel: appModel, startDiscovery: false)

        let root = SettingsTab()
            .environment(appModel)
            .environment(runtimeController)

        _ = Self.host(root)
    }

    @Test @MainActor func rootTabsBuildAViewHierarchy() {
        let appModel = NodeAppModel()
        let runtimeController = RuntimeConnectionController(appModel: appModel, startDiscovery: false)

        let root = RootTabs()
            .environment(appModel)
            .environment(runtimeController)

        _ = Self.host(root)
    }

    @Test @MainActor func chatSheetBuildsAViewHierarchy() {
        let appModel = NodeAppModel()
        let runtime = RuntimeNodeSession()
        let root = ChatSheet(runtime: runtime, sessionKey: "test")
            .environment(appModel)
        _ = Self.host(root)
    }
}
