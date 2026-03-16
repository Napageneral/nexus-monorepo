import SwiftUI

@main
struct NexusApp: App {
    @State private var appModel: NodeAppModel
    @State private var runtimeController: RuntimeConnectionController
    @Environment(\.scenePhase) private var scenePhase

    init() {
        RuntimeSettingsStore.bootstrapPersistence()
        let appModel = NodeAppModel()
        _appModel = State(initialValue: appModel)
        _runtimeController = State(initialValue: RuntimeConnectionController(appModel: appModel))
    }

    var body: some Scene {
        WindowGroup {
            RootCanvas()
                .environment(self.appModel)
                .environment(self.runtimeController)
                .onOpenURL { url in
                    Task { await self.appModel.handleDeepLink(url: url) }
                }
                .onChange(of: self.scenePhase) { _, newValue in
                    self.appModel.setScenePhase(newValue)
                    self.runtimeController.setScenePhase(newValue)
                }
        }
    }
}
