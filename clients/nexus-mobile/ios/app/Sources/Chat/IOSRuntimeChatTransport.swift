import NexusChatUI
import NexusKit
import NexusProtocol
import Foundation

struct IOSRuntimeChatTransport: NexusChatTransport, Sendable {
    private let runtime: RuntimeNodeSession

    init(runtime: RuntimeNodeSession) {
        self.runtime = runtime
    }

    func abortRun(sessionKey: String, runId: String) async throws {
        struct Params: Codable {
            var sessionKey: String
            var runId: String
        }
        let data = try JSONEncoder().encode(Params(sessionKey: sessionKey, runId: runId))
        let json = String(data: data, encoding: .utf8)
        _ = try await self.runtime.request(method: "chat.abort", paramsJSON: json, timeoutSeconds: 10)
    }

    func listSessions(limit: Int?) async throws -> NexusChatSessionsListResponse {
        struct Params: Codable {
            var includeGlobal: Bool
            var includeUnknown: Bool
            var limit: Int?
        }
        let data = try JSONEncoder().encode(Params(includeGlobal: true, includeUnknown: false, limit: limit))
        let json = String(data: data, encoding: .utf8)
        let res = try await self.runtime.request(method: "sessions.list", paramsJSON: json, timeoutSeconds: 15)
        return try JSONDecoder().decode(NexusChatSessionsListResponse.self, from: res)
    }

    func setActiveSessionKey(_ sessionKey: String) async throws {
        _ = sessionKey
    }

    func requestHistory(sessionKey: String) async throws -> NexusChatHistoryPayload {
        struct Params: Codable { var sessionKey: String }
        let data = try JSONEncoder().encode(Params(sessionKey: sessionKey))
        let json = String(data: data, encoding: .utf8)
        let res = try await self.runtime.request(method: "chat.history", paramsJSON: json, timeoutSeconds: 15)
        return try JSONDecoder().decode(NexusChatHistoryPayload.self, from: res)
    }

    func sendMessage(
        sessionKey: String,
        message: String,
        thinking: String,
        idempotencyKey: String,
        attachments: [NexusChatAttachmentPayload]) async throws -> NexusChatSendResponse
    {
        struct Params: Codable {
            var sessionKey: String
            var message: String
            var thinking: String
            var attachments: [NexusChatAttachmentPayload]?
            var timeoutMs: Int
            var idempotencyKey: String
        }

        let params = Params(
            sessionKey: sessionKey,
            message: message,
            thinking: thinking,
            attachments: attachments.isEmpty ? nil : attachments,
            timeoutMs: 30000,
            idempotencyKey: idempotencyKey)
        let data = try JSONEncoder().encode(params)
        let json = String(data: data, encoding: .utf8)
        let res = try await self.runtime.request(method: "chat.send", paramsJSON: json, timeoutSeconds: 35)
        return try JSONDecoder().decode(NexusChatSendResponse.self, from: res)
    }

    func requestHealth(timeoutMs: Int) async throws -> Bool {
        let seconds = max(1, Int(ceil(Double(timeoutMs) / 1000.0)))
        let res = try await self.runtime.request(method: "health", paramsJSON: nil, timeoutSeconds: seconds)
        return (try? JSONDecoder().decode(NexusRuntimeHealthOK.self, from: res))?.ok ?? true
    }

    func events() -> AsyncStream<NexusChatTransportEvent> {
        AsyncStream { continuation in
            let task = Task {
                let stream = await self.runtime.subscribeServerEvents()
                for await evt in stream {
                    if Task.isCancelled { return }
                    switch evt.event {
                    case "tick":
                        continuation.yield(.tick)
                    case "seqGap":
                        continuation.yield(.seqGap)
                    case "health":
                        guard let payload = evt.payload else { break }
                        let ok = (try? RuntimePayloadDecoding.decode(
                            payload,
                            as: NexusRuntimeHealthOK.self))?.ok ?? true
                        continuation.yield(.health(ok: ok))
                    case "chat":
                        guard let payload = evt.payload else { break }
                        if let chatPayload = try? RuntimePayloadDecoding.decode(
                            payload,
                            as: NexusChatEventPayload.self)
                        {
                            continuation.yield(.chat(chatPayload))
                        }
                    case "agent":
                        guard let payload = evt.payload else { break }
                        if let agentPayload = try? RuntimePayloadDecoding.decode(
                            payload,
                            as: NexusAgentEventPayload.self)
                        {
                            continuation.yield(.agent(agentPayload))
                        }
                    default:
                        break
                    }
                }
            }

            continuation.onTermination = { @Sendable _ in
                task.cancel()
            }
        }
    }
}
