import NexusProtocol
import Foundation
import OSLog

private struct DeviceInvokeRequestPayload: Codable, Sendable {
    var requestId: String
    var endpointId: String?
    var command: String
    var payload: NexusProtocol.AnyCodable?
    var timeoutMs: Int?
    var idempotencyKey: String?

    enum CodingKeys: String, CodingKey {
        case requestId = "request_id"
        case endpointId = "endpoint_id"
        case command
        case payload
        case timeoutMs = "timeout_ms"
        case idempotencyKey = "idempotency_key"
    }
}


public actor RuntimeNodeSession {
    private let logger = Logger(subsystem: "ai.nexus", category: "node.runtime")
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private static let defaultInvokeTimeoutMs = 30_000
    private var channel: RuntimeChannelActor?
    private var activeURL: URL?
    private var activeToken: String?
    private var activePassword: String?
    private var activeConnectOptionsKey: String?
    private var connectOptions: RuntimeConnectOptions?
    private var onConnected: (@Sendable () async -> Void)?
    private var onDisconnected: (@Sendable (String) async -> Void)?
    private var onInvoke: (@Sendable (BridgeInvokeRequest) async -> BridgeInvokeResponse)?
    private var hasNotifiedConnected = false
    private var snapshotReceived = false
    private var snapshotWaiters: [CheckedContinuation<Bool, Never>] = []

    static func invokeWithTimeout(
        request: BridgeInvokeRequest,
        timeoutMs: Int?,
        onInvoke: @escaping @Sendable (BridgeInvokeRequest) async -> BridgeInvokeResponse
    ) async -> BridgeInvokeResponse {
        let timeoutLogger = Logger(subsystem: "ai.nexus", category: "node.runtime")
        let timeout: Int = {
            if let timeoutMs { return max(0, timeoutMs) }
            return Self.defaultInvokeTimeoutMs
        }()
        guard timeout > 0 else {
            return await onInvoke(request)
        }

        // Use an explicit latch so timeouts win even if onInvoke blocks (e.g., permission prompts).
        final class InvokeLatch: @unchecked Sendable {
            private let lock = NSLock()
            private var continuation: CheckedContinuation<BridgeInvokeResponse, Never>?
            private var resumed = false

            func setContinuation(_ continuation: CheckedContinuation<BridgeInvokeResponse, Never>) {
                self.lock.lock()
                defer { self.lock.unlock() }
                self.continuation = continuation
            }

            func resume(_ response: BridgeInvokeResponse) {
                let cont: CheckedContinuation<BridgeInvokeResponse, Never>?
                self.lock.lock()
                if self.resumed {
                    self.lock.unlock()
                    return
                }
                self.resumed = true
                cont = self.continuation
                self.continuation = nil
                self.lock.unlock()
                cont?.resume(returning: response)
            }
        }

        let latch = InvokeLatch()
        var onInvokeTask: Task<Void, Never>?
        var timeoutTask: Task<Void, Never>?
        defer {
            onInvokeTask?.cancel()
            timeoutTask?.cancel()
        }
        let response = await withCheckedContinuation { (cont: CheckedContinuation<BridgeInvokeResponse, Never>) in
            latch.setContinuation(cont)
            onInvokeTask = Task.detached {
                let result = await onInvoke(request)
                latch.resume(result)
            }
            timeoutTask = Task.detached {
                try? await Task.sleep(nanoseconds: UInt64(timeout) * 1_000_000)
                timeoutLogger.info("node invoke timeout fired id=\(request.id, privacy: .public)")
                latch.resume(BridgeInvokeResponse(
                    id: request.id,
                    ok: false,
                    error: NexusNodeError(
                        code: .unavailable,
                        message: "node invoke timed out")
                ))
            }
        }
        timeoutLogger.info("node invoke race resolved id=\(request.id, privacy: .public) ok=\(response.ok, privacy: .public)")
        return response
    }
    private var serverEventSubscribers: [UUID: AsyncStream<EventFrame>.Continuation] = [:]

    public init() {}

    private func connectOptionsKey(_ options: RuntimeConnectOptions) -> String {
        func sorted(_ values: [String]) -> String {
            values.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .sorted()
                .joined(separator: ",")
        }
        let role = options.role.trimmingCharacters(in: .whitespacesAndNewlines)
        let scopes = sorted(options.scopes)
        let caps = sorted(options.caps)
        let commands = sorted(options.commands)
        let clientId = options.clientId.trimmingCharacters(in: .whitespacesAndNewlines)
        let clientMode = options.clientMode.trimmingCharacters(in: .whitespacesAndNewlines)
        let clientDisplayName = (options.clientDisplayName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let includeDeviceIdentity = options.includeDeviceIdentity ? "1" : "0"
        let permissions = options.permissions
            .map { key, value in
                let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
                return "\(trimmed)=\(value ? "1" : "0")"
            }
            .sorted()
            .joined(separator: ",")

        return [
            role,
            scopes,
            caps,
            commands,
            clientId,
            clientMode,
            clientDisplayName,
            includeDeviceIdentity,
            permissions,
        ].joined(separator: "|")
    }

    public func connect(
        url: URL,
        token: String?,
        password: String?,
        connectOptions: RuntimeConnectOptions,
        sessionBox: WebSocketSessionBox?,
        onConnected: @escaping @Sendable () async -> Void,
        onDisconnected: @escaping @Sendable (String) async -> Void,
        onInvoke: @escaping @Sendable (BridgeInvokeRequest) async -> BridgeInvokeResponse
    ) async throws {
        let nextOptionsKey = self.connectOptionsKey(connectOptions)
        let shouldReconnect = self.activeURL != url ||
            self.activeToken != token ||
            self.activePassword != password ||
            self.activeConnectOptionsKey != nextOptionsKey ||
            self.channel == nil

        self.connectOptions = connectOptions
        self.onConnected = onConnected
        self.onDisconnected = onDisconnected
        self.onInvoke = onInvoke

        if shouldReconnect {
            self.resetConnectionState()
            if let existing = self.channel {
                await existing.shutdown()
            }
            let channel = RuntimeChannelActor(
                url: url,
                token: token,
                password: password,
                session: sessionBox,
                pushHandler: { [weak self] push in
                    await self?.handlePush(push)
                },
                connectOptions: connectOptions,
                disconnectHandler: { [weak self] reason in
                    await self?.handleChannelDisconnected(reason)
                })
            self.channel = channel
            self.activeURL = url
            self.activeToken = token
            self.activePassword = password
            self.activeConnectOptionsKey = nextOptionsKey
        }

        guard let channel = self.channel else {
            throw NSError(domain: "Runtime", code: 0, userInfo: [
                NSLocalizedDescriptionKey: "runtime channel unavailable",
            ])
        }

        do {
            try await channel.connect()
            _ = await self.waitForSnapshot(timeoutMs: 500)
            await self.notifyConnectedIfNeeded()
        } catch {
            throw error
        }
    }

    public func disconnect() async {
        await self.channel?.shutdown()
        self.channel = nil
        self.activeURL = nil
        self.activeToken = nil
        self.activePassword = nil
        self.activeConnectOptionsKey = nil
        self.resetConnectionState()
    }

    public func currentRemoteAddress() -> String? {
        guard let url = self.activeURL else { return nil }
        guard let host = url.host else { return url.absoluteString }
        let port = url.port ?? (url.scheme == "wss" ? 443 : 80)
        if host.contains(":") {
            return "[\(host)]:\(port)"
        }
        return "\(host):\(port)"
    }

    public func sendEvent(event: String, payloadJSON: String?) async {
        guard let channel = self.channel else { return }
        do {
            guard let mapped = try self.mapEventForRuntimeIngest(event: event, payloadJSON: payloadJSON) else {
                return
            }
            try await channel.sendEvent(event: mapped.event, payload: mapped.payload)
        } catch {
            self.logger.error("runtime event failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    public func request(method: String, paramsJSON: String?, timeoutSeconds: Int = 15) async throws -> Data {
        guard let channel = self.channel else {
            throw NSError(domain: "Runtime", code: 11, userInfo: [
                NSLocalizedDescriptionKey: "not connected",
            ])
        }

        let params = try self.decodeParamsJSON(paramsJSON)
        return try await channel.request(
            method: method,
            params: params,
            timeoutMs: Double(timeoutSeconds * 1000))
    }

    public func subscribeServerEvents(bufferingNewest: Int = 200) -> AsyncStream<EventFrame> {
        let id = UUID()
        let session = self
        return AsyncStream(bufferingPolicy: .bufferingNewest(bufferingNewest)) { continuation in
            self.serverEventSubscribers[id] = continuation
            continuation.onTermination = { @Sendable _ in
                Task { await session.removeServerEventSubscriber(id) }
            }
        }
    }

    private func handlePush(_ push: RuntimePush) async {
        switch push {
        case let .snapshot(ok):
            self.markSnapshotReceived()
            await self.notifyConnectedIfNeeded()
        case let .event(evt):
            await self.handleEvent(evt)
        default:
            break
        }
    }

    private func resetConnectionState() {
        self.hasNotifiedConnected = false
        self.snapshotReceived = false
        if !self.snapshotWaiters.isEmpty {
            let waiters = self.snapshotWaiters
            self.snapshotWaiters.removeAll()
            for waiter in waiters {
                waiter.resume(returning: false)
            }
        }
    }

    private func handleChannelDisconnected(_ reason: String) async {
        // The underlying channel can auto-reconnect; resetting state here ensures we surface a fresh
        // onConnected callback once a new snapshot arrives after reconnect.
        self.resetConnectionState()
        await self.onDisconnected?(reason)
    }

    private func markSnapshotReceived() {
        self.snapshotReceived = true
        if !self.snapshotWaiters.isEmpty {
            let waiters = self.snapshotWaiters
            self.snapshotWaiters.removeAll()
            for waiter in waiters {
                waiter.resume(returning: true)
            }
        }
    }

    private func waitForSnapshot(timeoutMs: Int) async -> Bool {
        if self.snapshotReceived { return true }
        let clamped = max(0, timeoutMs)
        return await withCheckedContinuation { cont in
            self.snapshotWaiters.append(cont)
            Task { [weak self] in
                guard let self else { return }
                try? await Task.sleep(nanoseconds: UInt64(clamped) * 1_000_000)
                await self.timeoutSnapshotWaiters()
            }
        }
    }

    private func timeoutSnapshotWaiters() {
        guard !self.snapshotReceived else { return }
        if !self.snapshotWaiters.isEmpty {
            let waiters = self.snapshotWaiters
            self.snapshotWaiters.removeAll()
            for waiter in waiters {
                waiter.resume(returning: false)
            }
        }
    }

    private func notifyConnectedIfNeeded() async {
        guard !self.hasNotifiedConnected else { return }
        self.hasNotifiedConnected = true
        await self.onConnected?()
    }

    private func handleEvent(_ evt: EventFrame) async {
        self.broadcastServerEvent(evt)
        guard evt.event == "invoke.request" else { return }
        self.logger.info("device invoke request received")
        guard let payload = evt.payload else { return }
        do {
            let request = try self.decodeInvokeRequest(from: payload)
            let timeoutLabel = request.timeoutMs.map(String.init) ?? "none"
            self.logger.info("device invoke request decoded id=\(request.requestId, privacy: .public) command=\(request.command, privacy: .public) timeoutMs=\(timeoutLabel, privacy: .public)")
            guard let onInvoke else { return }
            let req = BridgeInvokeRequest(
                id: request.requestId,
                command: request.command,
                paramsJSON: self.encodePayloadJSON(request.payload))
            self.logger.info("device invoke executing id=\(request.requestId, privacy: .public)")
            let response = await Self.invokeWithTimeout(
                request: req,
                timeoutMs: request.timeoutMs,
                onInvoke: onInvoke
            )
            self.logger.info("device invoke completed id=\(request.requestId, privacy: .public) ok=\(response.ok, privacy: .public)")
            await self.sendInvokeResult(request: request, response: response)
        } catch {
            self.logger.error("device invoke decode failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func decodeInvokeRequest(from payload: NexusProtocol.AnyCodable) throws -> DeviceInvokeRequestPayload {
        do {
            let data = try self.encoder.encode(payload)
            return try self.decoder.decode(DeviceInvokeRequestPayload.self, from: data)
        } catch {
            if let raw = payload.value as? String, let data = raw.data(using: .utf8) {
                return try self.decoder.decode(DeviceInvokeRequestPayload.self, from: data)
            }
            throw error
        }
    }

    private func sendInvokeResult(request: DeviceInvokeRequestPayload, response: BridgeInvokeResponse) async {
        guard let channel = self.channel else { return }
        self.logger.info("device invoke result sending id=\(request.requestId, privacy: .public) ok=\(response.ok, privacy: .public)")
        var params: [String: AnyCodable] = [
            "request_id": AnyCodable(request.requestId),
            "ok": AnyCodable(response.ok),
        ]
        if let payload = self.decodeJSONValue(payloadJSON: response.payloadJSON) {
            params["payload"] = AnyCodable(payload)
        }
        if let error = response.error {
            params["error"] = AnyCodable([
                "code": error.code.rawValue,
                "message": error.message,
            ])
        }
        do {
            try await channel.sendEvent(event: "invoke.result", payload: params)
        } catch {
            self.logger.error("device invoke result failed id=\(request.requestId, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
        }
    }

    private typealias OutboundRuntimeEvent = (
        event: String,
        payload: [String: AnyCodable]?
    )

    private func mapEventForRuntimeIngest(
        event: String,
        payloadJSON: String?) throws -> OutboundRuntimeEvent?
    {
        let normalized = event.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return nil }

        switch normalized {
        case "event.ingest":
            return (event: "event.ingest", payload: try self.decodeParamsJSON(payloadJSON))
        case "agent.request":
            return self.mapAgentRequestEvent(payloadJSON: payloadJSON)
        case "voice.transcript":
            return self.mapVoiceTranscriptEvent(payloadJSON: payloadJSON)
        case "exec.started", "exec.finished", "exec.denied":
            return self.mapExecSystemEvent(event: normalized, payloadJSON: payloadJSON)
        case "chat.subscribe", "chat.unsubscribe":
            // Subscription routing moved off node-specific event channels.
            return nil
        default:
            return nil
        }
    }

    private func mapAgentRequestEvent(payloadJSON: String?) -> OutboundRuntimeEvent? {
        guard let payload = self.decodeJSONObject(payloadJSON: payloadJSON) else { return nil }
        let message = (payload["message"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !message.isEmpty else { return nil }
        let idempotencyKeyRaw =
            (payload["idempotencyKey"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? (payload["key"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? ""
        let idempotencyKey = idempotencyKeyRaw.isEmpty ? UUID().uuidString : idempotencyKeyRaw

        var mapped: [String: AnyCodable] = [
            "message": AnyCodable(message),
            "idempotencyKey": AnyCodable(idempotencyKey),
        ]
        if let sessionKey = (payload["sessionKey"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !sessionKey.isEmpty {
            mapped["sessionKey"] = AnyCodable(sessionKey)
        }
        if let thinking = (payload["thinking"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !thinking.isEmpty {
            mapped["thinking"] = AnyCodable(thinking)
        }
        if let deliver = payload["deliver"] as? Bool {
            mapped["deliver"] = AnyCodable(deliver)
        }
        if let to = (payload["to"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !to.isEmpty {
            mapped["to"] = AnyCodable(to)
        }
        if let platform = (payload["channel"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !platform.isEmpty {
            mapped["platform"] = AnyCodable(platform)
        }
        if let timeoutSeconds = payload["timeoutSeconds"] as? NSNumber {
            mapped["timeout"] = AnyCodable(timeoutSeconds.intValue)
        }

        return (event: "event.ingest", payload: mapped)
    }

    private func mapVoiceTranscriptEvent(payloadJSON: String?) -> OutboundRuntimeEvent? {
        guard let payload = self.decodeJSONObject(payloadJSON: payloadJSON) else { return nil }
        let text = (payload["text"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !text.isEmpty else { return nil }
        let sessionKey = (payload["sessionKey"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        var mapped: [String: AnyCodable] = [
            "message": AnyCodable(text),
            "idempotencyKey": AnyCodable("voice-\(UUID().uuidString)"),
            "deliver": AnyCodable(false),
            "sync": AnyCodable(true),
        ]
        if let sessionKey, !sessionKey.isEmpty {
            mapped["sessionKey"] = AnyCodable(sessionKey)
        }
        return (event: "event.ingest", payload: mapped)
    }

    private func mapExecSystemEvent(event: String, payloadJSON: String?) -> OutboundRuntimeEvent? {
        guard let payload = self.decodeJSONObject(payloadJSON: payloadJSON) else { return nil }
        guard let text = self.buildExecSystemText(event: event, payload: payload) else { return nil }
        var mapped: [String: AnyCodable] = [
            "text": AnyCodable(text),
        ]
        if let sessionKey = (payload["sessionKey"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !sessionKey.isEmpty {
            mapped["sessionKey"] = AnyCodable(sessionKey)
        }
        return (event: "system.presence", payload: mapped)
    }

    private func buildExecSystemText(event: String, payload: [String: Any]) -> String? {
        let nodeId = ((payload["host"] as? String) ?? "device")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let runId = ((payload["runId"] as? String) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let command = ((payload["command"] as? String) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let output = ((payload["output"] as? String) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let reason = ((payload["reason"] as? String) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let timedOut = payload["timedOut"] as? Bool == true
        let exitCode = (payload["exitCode"] as? NSNumber)?.intValue

        if event == "exec.started" {
            var text = "Exec started (node=\(nodeId)"
            if !runId.isEmpty {
                text += " id=\(runId)"
            }
            text += ")"
            if !command.isEmpty {
                text += ": \(command)"
            }
            return text
        }
        if event == "exec.finished" {
            let exitLabel = timedOut ? "timeout" : "code \(exitCode?.description ?? "?")"
            var text = "Exec finished (node=\(nodeId)"
            if !runId.isEmpty {
                text += " id=\(runId)"
            }
            text += ", \(exitLabel))"
            if !output.isEmpty {
                text += "\n\(output)"
            }
            return text
        }
        if event == "exec.denied" {
            var text = "Exec denied (node=\(nodeId)"
            if !runId.isEmpty {
                text += " id=\(runId)"
            }
            if !reason.isEmpty {
                text += ", \(reason)"
            }
            text += ")"
            if !command.isEmpty {
                text += ": \(command)"
            }
            return text
        }
        return nil
    }

    private func encodePayloadJSON(_ payload: NexusProtocol.AnyCodable?) -> String? {
        guard let payload else { return nil }
        guard let data = try? self.encoder.encode(payload) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func decodeJSONValue(payloadJSON: String?) -> Any? {
        guard let payloadJSON, !payloadJSON.isEmpty else { return nil }
        guard let data = payloadJSON.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: data)
    }

    private func decodeJSONObject(payloadJSON: String?) -> [String: Any]? {
        self.decodeJSONValue(payloadJSON: payloadJSON) as? [String: Any]
    }

    private func decodeParamsJSON(
        _ paramsJSON: String?) throws -> [String: AnyCodable]?
    {
        guard let paramsJSON, !paramsJSON.isEmpty else { return nil }
        guard let data = paramsJSON.data(using: .utf8) else {
            throw NSError(domain: "Runtime", code: 12, userInfo: [
                NSLocalizedDescriptionKey: "paramsJSON not UTF-8",
            ])
        }
        let raw = try JSONSerialization.jsonObject(with: data)
        guard let dict = raw as? [String: Any] else {
            return nil
        }
        return dict.reduce(into: [:]) { acc, entry in
            acc[entry.key] = AnyCodable(entry.value)
        }
    }

    private func broadcastServerEvent(_ evt: EventFrame) {
        for (id, continuation) in self.serverEventSubscribers {
            if case .terminated = continuation.yield(evt) {
                self.serverEventSubscribers.removeValue(forKey: id)
            }
        }
    }

    private func removeServerEventSubscriber(_ id: UUID) {
        self.serverEventSubscribers.removeValue(forKey: id)
    }
}
