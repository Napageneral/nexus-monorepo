import Testing
@testable import Nexus

@Suite(.serialized) struct RuntimeDiscoveryModelTests {
    @Test @MainActor func debugLoggingCapturesLifecycleAndResets() {
        let model = RuntimeDiscoveryModel()

        #expect(model.debugLog.isEmpty)
        #expect(model.statusText == "Idle")

        model.setDebugLoggingEnabled(true)
        #expect(model.debugLog.count >= 2)

        model.stop()
        #expect(model.statusText == "Stopped")
        #expect(model.runtimes.isEmpty)
        #expect(model.debugLog.count >= 3)

        model.setDebugLoggingEnabled(false)
        #expect(model.debugLog.isEmpty)
    }
}
