import NexusKit
import Testing
@testable import Nexus

@Suite struct IOSRuntimeChatTransportTests {
    @Test func requestsFailFastWhenRuntimeNotConnected() async {
        let runtime = RuntimeNodeSession()
        let transport = IOSRuntimeChatTransport(runtime: runtime)

        do {
            _ = try await transport.requestHistory(sessionKey: "node-test")
            Issue.record("Expected requestHistory to throw when runtime not connected")
        } catch {}

        do {
            _ = try await transport.sendMessage(
                sessionKey: "node-test",
                message: "hello",
                thinking: "low",
                idempotencyKey: "idempotency",
                attachments: [])
            Issue.record("Expected sendMessage to throw when runtime not connected")
        } catch {}

        do {
            _ = try await transport.requestHealth(timeoutMs: 250)
            Issue.record("Expected requestHealth to throw when runtime not connected")
        } catch {}
    }
}
