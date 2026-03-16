import SwiftUI
import Testing
@testable import Nexus

@Suite struct AppCoverageTests {
    @Test @MainActor func nodeAppModelUpdatesBackgroundedState() {
        let appModel = NodeAppModel()

        appModel.setScenePhase(.background)
        #expect(appModel.isBackgrounded == true)

        appModel.setScenePhase(.inactive)
        #expect(appModel.isBackgrounded == false)

        appModel.setScenePhase(.active)
        #expect(appModel.isBackgrounded == false)
    }
}
