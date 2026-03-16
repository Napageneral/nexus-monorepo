import Foundation

public enum NexusChatTransportEvent: Sendable {
    case health(ok: Bool)
    case tick
    case chat(NexusChatEventPayload)
    case agent(NexusAgentEventPayload)
    case seqGap
}

public protocol NexusChatTransport: Sendable {
    func requestHistory(sessionKey: String) async throws -> NexusChatHistoryPayload
    func sendMessage(
        sessionKey: String,
        message: String,
        thinking: String,
        idempotencyKey: String,
        attachments: [NexusChatAttachmentPayload]) async throws -> NexusChatSendResponse

    func abortRun(sessionKey: String, runId: String) async throws
    func listSessions(limit: Int?) async throws -> NexusChatSessionsListResponse

    func requestHealth(timeoutMs: Int) async throws -> Bool
    func events() -> AsyncStream<NexusChatTransportEvent>

    func setActiveSessionKey(_ sessionKey: String) async throws
}

extension NexusChatTransport {
    public func setActiveSessionKey(_: String) async throws {}

    public func abortRun(sessionKey _: String, runId _: String) async throws {
        throw NSError(
            domain: "NexusChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "chat.abort not supported by this transport"])
    }

    public func listSessions(limit _: Int?) async throws -> NexusChatSessionsListResponse {
        throw NSError(
            domain: "NexusChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "sessions.list not supported by this transport"])
    }
}
