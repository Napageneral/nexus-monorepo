import NexusChatUI
import NexusKit
import NexusProtocol
import Observation
import SwiftUI
import UIKit
import UserNotifications

// Wrap errors without pulling non-Sendable types into async notification paths.
private struct NotificationCallError: Error, Sendable {
    let message: String
}

// Ensures notification requests return promptly even if the system prompt blocks.
private final class NotificationInvokeLatch<T: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Result<T, NotificationCallError>, Never>?
    private var resumed = false

    func setContinuation(_ continuation: CheckedContinuation<Result<T, NotificationCallError>, Never>) {
        self.lock.lock()
        defer { self.lock.unlock() }
        self.continuation = continuation
    }

    func resume(_ response: Result<T, NotificationCallError>) {
        let cont: CheckedContinuation<Result<T, NotificationCallError>, Never>?
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

@MainActor
@Observable
final class NodeAppModel {
    enum CameraHUDKind {
        case photo
        case recording
        case success
        case error
    }

    var isBackgrounded: Bool = false
    let screen: ScreenController
    private let camera: any CameraServicing
    private let screenRecorder: any ScreenRecordingServicing
    var runtimeStatusText: String = "Offline"
    var runtimeServerName: String?
    var runtimeRemoteAddress: String?
    var connectedRuntimeID: String?
    var runtimeAutoReconnectEnabled: Bool = true
    var seamColorHex: String?
    private var mainSessionBaseKey: String = "main"
    var selectedAgentId: String?
    var runtimeDefaultAgentId: String?
    var runtimeAgents: [AgentSummary] = []

    var mainSessionKey: String {
        let base = SessionKey.normalizeMainKey(self.mainSessionBaseKey)
        let agentId = (self.selectedAgentId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let defaultId = (self.runtimeDefaultAgentId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if agentId.isEmpty || (!defaultId.isEmpty && agentId == defaultId) { return base }
        return SessionKey.makeAgentSessionKey(agentId: agentId, baseKey: base)
    }

    var activeAgentName: String {
        let agentId = (self.selectedAgentId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let defaultId = (self.runtimeDefaultAgentId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedId = agentId.isEmpty ? defaultId : agentId
        if resolvedId.isEmpty { return "Main" }
        if let match = self.runtimeAgents.first(where: { $0.id == resolvedId }) {
            let name = (match.name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return name.isEmpty ? match.id : name
        }
        return resolvedId
    }

    // Primary "node" connection: used for device capabilities and node.invoke requests.
    private let nodeRuntime = RuntimeNodeSession()
    // Secondary "operator" connection: used for chat/talk/config/voicewake requests.
    private let operatorRuntime = RuntimeNodeSession()
    private var nodeRuntimeTask: Task<Void, Never>?
    private var operatorRuntimeTask: Task<Void, Never>?
    @ObservationIgnored private var cameraHUDDismissTask: Task<Void, Never>?
    @ObservationIgnored private lazy var capabilityRouter: NodeCapabilityRouter = self.buildCapabilityRouter()
    private let runtimeHealthMonitor = RuntimeHealthMonitor()
    private var runtimeHealthMonitorDisabled = false
    private let notificationCenter: NotificationCentering
    let talkMode: TalkModeManager
    private let locationService: any LocationServicing
    private let deviceStatusService: any DeviceStatusServicing
    private let photosService: any PhotosServicing
    private let contactsService: any ContactsServicing
    private let calendarService: any CalendarServicing
    private let remindersService: any RemindersServicing
    private let motionService: any MotionServicing
    private var backgroundTalkSuspended = false
    private var backgroundedAt: Date?
    private var reconnectAfterBackgroundArmed = false

    private var runtimeConnected = false
    private var operatorConnected = false
    var runtimeSession: RuntimeNodeSession { self.nodeRuntime }
    var operatorSession: RuntimeNodeSession { self.operatorRuntime }
    private(set) var activeRuntimeConnectConfig: RuntimeConnectConfig?

    var cameraHUDText: String?
    var cameraHUDKind: CameraHUDKind?
    var cameraFlashNonce: Int = 0
    var screenRecordActive: Bool = false

    init(
        screen: ScreenController = ScreenController(),
        camera: any CameraServicing = CameraController(),
        screenRecorder: any ScreenRecordingServicing = ScreenRecordService(),
        locationService: any LocationServicing = LocationService(),
        notificationCenter: NotificationCentering = LiveNotificationCenter(),
        deviceStatusService: any DeviceStatusServicing = DeviceStatusService(),
        photosService: any PhotosServicing = PhotoLibraryService(),
        contactsService: any ContactsServicing = ContactsService(),
        calendarService: any CalendarServicing = CalendarService(),
        remindersService: any RemindersServicing = RemindersService(),
        motionService: any MotionServicing = MotionService(),
        talkMode: TalkModeManager = TalkModeManager())
    {
        self.screen = screen
        self.camera = camera
        self.screenRecorder = screenRecorder
        self.locationService = locationService
        self.notificationCenter = notificationCenter
        self.deviceStatusService = deviceStatusService
        self.photosService = photosService
        self.contactsService = contactsService
        self.calendarService = calendarService
        self.remindersService = remindersService
        self.motionService = motionService
        self.talkMode = talkMode
        RuntimeDiagnostics.bootstrap()

        self.talkMode.attachRuntime(self.operatorRuntime)
        let talkEnabled = UserDefaults.standard.bool(forKey: "talk.enabled")
        self.setTalkEnabled(talkEnabled)

        // Wire up deep links from canvas taps
        self.screen.onDeepLink = { [weak self] url in
            guard let self else { return }
            Task { @MainActor in
                await self.handleDeepLink(url: url)
            }
        }

    func setScenePhase(_ phase: ScenePhase) {
        switch phase {
        case .background:
            self.isBackgrounded = true
            self.stopRuntimeHealthMonitor()
            self.backgroundedAt = Date()
            self.reconnectAfterBackgroundArmed = true
            // Be conservative: release the mic when the app backgrounds.
            self.backgroundTalkSuspended = self.talkMode.suspendForBackground()
        case .active, .inactive:
            self.isBackgrounded = false
            if self.operatorConnected {
                self.startRuntimeHealthMonitor()
            }
            if phase == .active {
                Task { [weak self] in
                    guard let self else { return }
                    let suspended = await MainActor.run { self.backgroundTalkSuspended }
                    await MainActor.run { self.backgroundTalkSuspended = false }
                    await self.talkMode.resumeAfterBackground(wasSuspended: suspended)
                }
            }
            if phase == .active, self.reconnectAfterBackgroundArmed {
                self.reconnectAfterBackgroundArmed = false
                let backgroundedFor = self.backgroundedAt.map { Date().timeIntervalSince($0) } ?? 0
                self.backgroundedAt = nil
                // iOS may suspend network sockets in background without a clean close.
                // On foreground, force a fresh handshake to avoid "connected but dead" states.
                if backgroundedFor >= 3.0 {
                    Task { [weak self] in
                        guard let self else { return }
                        let operatorWasConnected = await MainActor.run { self.operatorConnected }
                        if operatorWasConnected {
                            // Prefer keeping the connection if it's healthy; reconnect only when needed.
                            let healthy = (try? await self.operatorRuntime.request(
                                method: "health",
                                paramsJSON: nil,
                                timeoutSeconds: 2)) != nil
                            if healthy {
                                await MainActor.run { self.startRuntimeHealthMonitor() }
                                return
                            }
                        }

                        await self.operatorRuntime.disconnect()
                        await self.nodeRuntime.disconnect()
                        await MainActor.run {
                            self.operatorConnected = false
                            self.runtimeConnected = false
                            self.talkMode.updateRuntimeConnected(false)
                        }
                    }
                }
            }
        @unknown default:
            self.isBackgrounded = false
        }
    }

    func setTalkEnabled(_ enabled: Bool) {
        self.talkMode.setEnabled(enabled)
    }

    func requestLocationPermissions(mode: NexusLocationMode) async -> Bool {
        guard mode != .off else { return true }
        let status = await self.locationService.ensureAuthorization(mode: mode)
        switch status {
        case .authorizedAlways:
            return true
        case .authorizedWhenInUse:
            return mode != .always
        default:
            return false
        }
    }

    private func applyMainSessionKey(_ key: String?) {
        let trimmed = (key ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let current = self.mainSessionBaseKey.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed == current { return }
        self.mainSessionBaseKey = trimmed
        self.talkMode.updateMainSessionKey(self.mainSessionKey)
    }

    var seamColor: Color {
        Self.color(fromHex: self.seamColorHex) ?? Self.defaultSeamColor
    }

    private static let defaultSeamColor = Color(red: 79 / 255.0, green: 122 / 255.0, blue: 154 / 255.0)

    private static func color(fromHex raw: String?) -> Color? {
        let trimmed = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let hex = trimmed.hasPrefix("#") ? String(trimmed.dropFirst()) : trimmed
        guard hex.count == 6, let value = Int(hex, radix: 16) else { return nil }
        let r = Double((value >> 16) & 0xFF) / 255.0
        let g = Double((value >> 8) & 0xFF) / 255.0
        let b = Double(value & 0xFF) / 255.0
        return Color(red: r, green: g, blue: b)
    }

    private func refreshBrandingFromRuntime() async {
        do {
            let res = try await self.operatorRuntime.request(method: "config.get", paramsJSON: "{}", timeoutSeconds: 8)
            guard let json = try JSONSerialization.jsonObject(with: res) as? [String: Any] else { return }
            guard let config = json["config"] as? [String: Any] else { return }
            let ui = config["ui"] as? [String: Any]
            let raw = (ui?["seamColor"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let session = config["session"] as? [String: Any]
            let mainKey = SessionKey.normalizeMainKey(session?["mainKey"] as? String)
            await MainActor.run {
                self.seamColorHex = raw.isEmpty ? nil : raw
                self.mainSessionBaseKey = mainKey
                self.talkMode.updateMainSessionKey(self.mainSessionKey)
            }
        } catch {
            if let runtimeError = error as? RuntimeResponseError {
                let lower = runtimeError.message.lowercased()
                if lower.contains("unauthorized role") {
                    return
                }
            }
            // ignore
        }
    }

    private func refreshAgentsFromRuntime() async {
        do {
            let res = try await self.operatorRuntime.request(method: "agents.list", paramsJSON: "{}", timeoutSeconds: 8)
            let decoded = try JSONDecoder().decode(AgentsListResult.self, from: res)
            await MainActor.run {
                self.runtimeDefaultAgentId = decoded.defaultid
                self.runtimeAgents = decoded.agents
                self.applyMainSessionKey(decoded.mainkey)

                let selected = (self.selectedAgentId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                if !selected.isEmpty && !decoded.agents.contains(where: { $0.id == selected }) {
                    self.selectedAgentId = nil
                }
                self.talkMode.updateMainSessionKey(self.mainSessionKey)
            }
        } catch {
            // Best-effort only.
        }
    }

    func setSelectedAgentId(_ agentId: String?) {
        let trimmed = (agentId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let stableID = (self.connectedRuntimeID ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if stableID.isEmpty {
            self.selectedAgentId = trimmed.isEmpty ? nil : trimmed
        } else {
            self.selectedAgentId = trimmed.isEmpty ? nil : trimmed
            RuntimeSettingsStore.saveRuntimeSelectedAgentId(stableID: stableID, agentId: self.selectedAgentId)
        }
        self.talkMode.updateMainSessionKey(self.mainSessionKey)
    }

    private func startRuntimeHealthMonitor() {
        self.runtimeHealthMonitorDisabled = false
        self.runtimeHealthMonitor.start(
            check: { [weak self] in
                guard let self else { return false }
                if await self.isRuntimeHealthMonitorDisabled() { return true }
                do {
                    let data = try await self.operatorRuntime.request(method: "health", paramsJSON: nil, timeoutSeconds: 6)
                    guard let decoded = try? JSONDecoder().decode(NexusRuntimeHealthOK.self, from: data) else {
                        return false
                    }
                    return decoded.ok ?? false
                } catch {
                    if let runtimeError = error as? RuntimeResponseError {
                        let lower = runtimeError.message.lowercased()
                        if lower.contains("unauthorized role") {
                            await self.setRuntimeHealthMonitorDisabled(true)
                            return true
                        }
                    }
                    return false
                }
            },
            onFailure: { [weak self] _ in
                guard let self else { return }
                await self.operatorRuntime.disconnect()
                await MainActor.run {
                    self.operatorConnected = false
                    self.talkMode.updateRuntimeConnected(false)
                }
            })
    }

    private func stopRuntimeHealthMonitor() {
        self.runtimeHealthMonitor.stop()
    }

    private func isRuntimeHealthMonitorDisabled() -> Bool {
        self.runtimeHealthMonitorDisabled
    }

    private func setRuntimeHealthMonitorDisabled(_ disabled: Bool) {
        self.runtimeHealthMonitorDisabled = disabled
    }

    func sendVoiceTranscript(text: String, sessionKey: String?) async throws {
        if await !self.isRuntimeConnected() {
            throw NSError(domain: "Runtime", code: 10, userInfo: [
                NSLocalizedDescriptionKey: "Runtime not connected",
            ])
        }
        struct Payload: Codable {
            var text: String
            var sessionKey: String?
        }
        let payload = Payload(text: text, sessionKey: sessionKey)
        let data = try JSONEncoder().encode(payload)
        guard let json = String(bytes: data, encoding: .utf8) else {
            throw NSError(domain: "NodeAppModel", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Failed to encode voice transcript payload as UTF-8",
            ])
        }
        await self.nodeRuntime.sendEvent(event: "voice.transcript", payloadJSON: json)
    }

    func handleDeepLink(url: URL) async {
        guard let route = DeepLinkParser.parse(url) else { return }

        switch route {
        case let .agent(link):
            await self.handleAgentDeepLink(link, originalURL: url)
        }
    }

    private func handleAgentDeepLink(_ link: AgentDeepLink, originalURL: URL) async {
        let message = link.message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty else { return }

        if message.count > 20000 {
            self.screen.errorText = "Deep link too large (message exceeds 20,000 characters)."
            return
        }

        guard await self.isRuntimeConnected() else {
            self.screen.errorText = "Runtime not connected (cannot forward deep link)."
            return
        }

        do {
            try await self.sendAgentRequest(link: link)
            self.screen.errorText = nil
        } catch {
            self.screen.errorText = "Agent request failed: \(error.localizedDescription)"
        }
    }

    private func sendAgentRequest(link: AgentDeepLink) async throws {
        if link.message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw NSError(domain: "DeepLink", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "invalid agent message",
            ])
        }

        // iOS runtime forwards to the runtime; no local auth prompts here.
        // (Key-based unattended auth is handled on macOS for nexus:// links.)
        let data = try JSONEncoder().encode(link)
        guard let json = String(bytes: data, encoding: .utf8) else {
            throw NSError(domain: "NodeAppModel", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Failed to encode agent request payload as UTF-8",
            ])
        }
        await self.nodeRuntime.sendEvent(event: "agent.request", payloadJSON: json)
    }

    private func isRuntimeConnected() async -> Bool {
        self.runtimeConnected
    }

    private func handleInvoke(_ req: BridgeInvokeRequest) async -> BridgeInvokeResponse {
        let command = req.command

        if self.isBackgrounded, self.isBackgroundRestricted(command) {
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(
                    code: .backgroundUnavailable,
                    message: "NODE_BACKGROUND_UNAVAILABLE: canvas/camera/screen commands require foreground"))
        }

        if command.hasPrefix("camera."), !self.isCameraEnabled() {
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(
                    code: .unavailable,
                    message: "CAMERA_DISABLED: enable Camera in iOS Settings → Camera → Allow Camera"))
        }

        do {
            return try await self.capabilityRouter.handle(req)
        } catch let error as NodeCapabilityRouter.RouterError {
            switch error {
            case .unknownCommand:
                return BridgeInvokeResponse(
                    id: req.id,
                    ok: false,
                    error: NexusNodeError(code: .invalidRequest, message: "INVALID_REQUEST: unknown command"))
            case .handlerUnavailable:
                return BridgeInvokeResponse(
                    id: req.id,
                    ok: false,
                    error: NexusNodeError(code: .unavailable, message: "node handler unavailable"))
            }
        } catch {
            if command.hasPrefix("camera.") {
                let text = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                self.showCameraHUD(text: text, kind: .error, autoHideSeconds: 2.2)
            }
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(code: .unavailable, message: error.localizedDescription))
        }
    }

    private func isBackgroundRestricted(_ command: String) -> Bool {
        command.hasPrefix("canvas.") || command.hasPrefix("camera.") || command.hasPrefix("screen.") ||
            command.hasPrefix("talk.")
    }

    private func handleLocationInvoke(_ req: BridgeInvokeRequest) async throws -> BridgeInvokeResponse {
        let mode = self.locationMode()
        guard mode != .off else {
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(
                    code: .unavailable,
                    message: "LOCATION_DISABLED: enable Location in Settings"))
        }
        if self.isBackgrounded, mode != .always {
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(
                    code: .backgroundUnavailable,
                    message: "LOCATION_BACKGROUND_UNAVAILABLE: background location requires Always"))
        }
        let params = (try? Self.decodeParams(NexusLocationGetParams.self, from: req.paramsJSON)) ??
            NexusLocationGetParams()
        let desired = params.desiredAccuracy ??
            (self.isLocationPreciseEnabled() ? .precise : .balanced)
        let status = self.locationService.authorizationStatus()
        if status != .authorizedAlways, status != .authorizedWhenInUse {
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(
                    code: .unavailable,
                    message: "LOCATION_PERMISSION_REQUIRED: grant Location permission"))
        }
        if self.isBackgrounded, status != .authorizedAlways {
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(
                    code: .unavailable,
                    message: "LOCATION_PERMISSION_REQUIRED: enable Always for background access"))
        }
        let location = try await self.locationService.currentLocation(
            params: params,
            desiredAccuracy: desired,
            maxAgeMs: params.maxAgeMs,
            timeoutMs: params.timeoutMs)
        let isPrecise = self.locationService.accuracyAuthorization() == .fullAccuracy
        let payload = NexusLocationPayload(
            lat: location.coordinate.latitude,
            lon: location.coordinate.longitude,
            accuracyMeters: location.horizontalAccuracy,
            altitudeMeters: location.verticalAccuracy >= 0 ? location.altitude : nil,
            speedMps: location.speed >= 0 ? location.speed : nil,
            headingDeg: location.course >= 0 ? location.course : nil,
            timestamp: ISO8601DateFormatter().string(from: location.timestamp),
            isPrecise: isPrecise,
            source: nil)
        let json = try Self.encodePayload(payload)
        return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: json)
    }

    private func handleCanvasInvoke(_ req: BridgeInvokeRequest) async throws -> BridgeInvokeResponse {
        switch req.command {
        case NexusCanvasCommand.present.rawValue:
            // iOS ignores placement hints; canvas always fills the screen.
            let params = (try? Self.decodeParams(NexusCanvasPresentParams.self, from: req.paramsJSON)) ??
                NexusCanvasPresentParams()
            let url = params.url?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if url.isEmpty {
                self.screen.showDefaultCanvas()
            } else {
                self.screen.navigate(to: url)
            }
            return BridgeInvokeResponse(id: req.id, ok: true)
        case NexusCanvasCommand.hide.rawValue:
            self.screen.showDefaultCanvas()
            return BridgeInvokeResponse(id: req.id, ok: true)
        case NexusCanvasCommand.navigate.rawValue:
            let params = try Self.decodeParams(NexusCanvasNavigateParams.self, from: req.paramsJSON)
            self.screen.navigate(to: params.url)
            return BridgeInvokeResponse(id: req.id, ok: true)
        case NexusCanvasCommand.evalJS.rawValue:
            let params = try Self.decodeParams(NexusCanvasEvalParams.self, from: req.paramsJSON)
            let result = try await self.screen.eval(javaScript: params.javaScript)
            let payload = try Self.encodePayload(["result": result])
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: payload)
        case NexusCanvasCommand.snapshot.rawValue:
            let params = try? Self.decodeParams(NexusCanvasSnapshotParams.self, from: req.paramsJSON)
            let format = params?.format ?? .jpeg
            let maxWidth: CGFloat? = {
                if let raw = params?.maxWidth, raw > 0 { return CGFloat(raw) }
                // Keep default snapshots comfortably below the runtime client's maxPayload.
                // For full-res, clients should explicitly request a larger maxWidth.
                return switch format {
                case .png: 900
                case .jpeg: 1600
                }
            }()
            let base64 = try await self.screen.snapshotBase64(
                maxWidth: maxWidth,
                format: format,
                quality: params?.quality)
            let payload = try Self.encodePayload([
                "format": format == .jpeg ? "jpeg" : "png",
                "base64": base64,
            ])
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: payload)
        default:
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(code: .invalidRequest, message: "INVALID_REQUEST: unknown command"))
        }
    }

    private func handleCameraInvoke(_ req: BridgeInvokeRequest) async throws -> BridgeInvokeResponse {
        switch req.command {
        case NexusCameraCommand.list.rawValue:
            let devices = await self.camera.listDevices()
            struct Payload: Codable {
                var devices: [CameraController.CameraDeviceInfo]
            }
            let payload = try Self.encodePayload(Payload(devices: devices))
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: payload)
        case NexusCameraCommand.snap.rawValue:
            self.showCameraHUD(text: "Taking photo…", kind: .photo)
            self.triggerCameraFlash()
            let params = (try? Self.decodeParams(NexusCameraSnapParams.self, from: req.paramsJSON)) ??
                NexusCameraSnapParams()
            let res = try await self.camera.snap(params: params)

            struct Payload: Codable {
                var format: String
                var base64: String
                var width: Int
                var height: Int
            }
            let payload = try Self.encodePayload(Payload(
                format: res.format,
                base64: res.base64,
                width: res.width,
                height: res.height))
            self.showCameraHUD(text: "Photo captured", kind: .success, autoHideSeconds: 1.6)
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: payload)
        case NexusCameraCommand.clip.rawValue:
            let params = (try? Self.decodeParams(NexusCameraClipParams.self, from: req.paramsJSON)) ??
                NexusCameraClipParams()

            self.showCameraHUD(text: "Recording…", kind: .recording)
            let res = try await self.camera.clip(params: params)

            struct Payload: Codable {
                var format: String
                var base64: String
                var durationMs: Int
                var hasAudio: Bool
            }
            let payload = try Self.encodePayload(Payload(
                format: res.format,
                base64: res.base64,
                durationMs: res.durationMs,
                hasAudio: res.hasAudio))
            self.showCameraHUD(text: "Clip captured", kind: .success, autoHideSeconds: 1.8)
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: payload)
        default:
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(code: .invalidRequest, message: "INVALID_REQUEST: unknown command"))
        }
    }

    private func handleScreenRecordInvoke(_ req: BridgeInvokeRequest) async throws -> BridgeInvokeResponse {
        let params = (try? Self.decodeParams(NexusScreenRecordParams.self, from: req.paramsJSON)) ??
            NexusScreenRecordParams()
        if let format = params.format, format.lowercased() != "mp4" {
            throw NSError(domain: "Screen", code: 30, userInfo: [
                NSLocalizedDescriptionKey: "INVALID_REQUEST: screen format must be mp4",
            ])
        }
        // Status pill mirrors screen recording state so it stays visible without overlay stacking.
        self.screenRecordActive = true
        defer { self.screenRecordActive = false }
        let path = try await self.screenRecorder.record(
            screenIndex: params.screenIndex,
            durationMs: params.durationMs,
            fps: params.fps,
            includeAudio: params.includeAudio,
            outPath: nil)
        defer { try? FileManager().removeItem(atPath: path) }
        let data = try Data(contentsOf: URL(fileURLWithPath: path))
        struct Payload: Codable {
            var format: String
            var base64: String
            var durationMs: Int?
            var fps: Double?
            var screenIndex: Int?
            var hasAudio: Bool
        }
        let payload = try Self.encodePayload(Payload(
            format: "mp4",
            base64: data.base64EncodedString(),
            durationMs: params.durationMs,
            fps: params.fps,
            screenIndex: params.screenIndex,
            hasAudio: params.includeAudio ?? true))
        return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: payload)
    }

    private func handleSystemNotify(_ req: BridgeInvokeRequest) async throws -> BridgeInvokeResponse {
        let params = try Self.decodeParams(NexusSystemNotifyParams.self, from: req.paramsJSON)
        let title = params.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = params.body.trimmingCharacters(in: .whitespacesAndNewlines)
        if title.isEmpty, body.isEmpty {
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(code: .invalidRequest, message: "INVALID_REQUEST: empty notification"))
        }

        let finalStatus = await self.requestNotificationAuthorizationIfNeeded()
        guard finalStatus == .authorized || finalStatus == .provisional || finalStatus == .ephemeral else {
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(code: .unavailable, message: "NOT_AUTHORIZED: notifications"))
        }

        let addResult = await self.runNotificationCall(timeoutSeconds: 2.0) { [notificationCenter] in
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            if #available(iOS 15.0, *) {
                switch params.priority ?? .active {
                case .passive:
                    content.interruptionLevel = .passive
                case .timeSensitive:
                    content.interruptionLevel = .timeSensitive
                case .active:
                    content.interruptionLevel = .active
                }
            }
            let soundValue = params.sound?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if let soundValue, ["none", "silent", "off", "false", "0"].contains(soundValue) {
                content.sound = nil
            } else {
                content.sound = .default
            }
            let request = UNNotificationRequest(
                identifier: UUID().uuidString,
                content: content,
                trigger: nil)
            try await notificationCenter.add(request)
        }
        if case let .failure(error) = addResult {
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(code: .unavailable, message: "NOTIFICATION_FAILED: \(error.message)"))
        }
        return BridgeInvokeResponse(id: req.id, ok: true)
    }

    private func handleChatPushInvoke(_ req: BridgeInvokeRequest) async throws -> BridgeInvokeResponse {
        let params = try Self.decodeParams(NexusChatPushParams.self, from: req.paramsJSON)
        let text = params.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(code: .invalidRequest, message: "INVALID_REQUEST: empty chat.push text"))
        }

        let finalStatus = await self.requestNotificationAuthorizationIfNeeded()
        let messageId = UUID().uuidString
        if finalStatus == .authorized || finalStatus == .provisional || finalStatus == .ephemeral {
            let addResult = await self.runNotificationCall(timeoutSeconds: 2.0) { [notificationCenter] in
                let content = UNMutableNotificationContent()
                content.title = "Nexus"
                content.body = text
                content.sound = .default
                content.userInfo = ["messageId": messageId]
                let request = UNNotificationRequest(
                    identifier: messageId,
                    content: content,
                    trigger: nil)
                try await notificationCenter.add(request)
            }
            if case let .failure(error) = addResult {
                return BridgeInvokeResponse(
                    id: req.id,
                    ok: false,
                    error: NexusNodeError(code: .unavailable, message: "NOTIFICATION_FAILED: \(error.message)"))
            }
        }

        if params.speak ?? true {
            let toSpeak = text
            Task { @MainActor in
                try? await TalkSystemSpeechSynthesizer.shared.speak(text: toSpeak)
            }
        }

        let payload = NexusChatPushPayload(messageId: messageId)
        let json = try Self.encodePayload(payload)
        return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: json)
    }

    private func requestNotificationAuthorizationIfNeeded() async -> NotificationAuthorizationStatus {
        let status = await self.notificationAuthorizationStatus()
        guard status == .notDetermined else { return status }

        // Avoid hanging invoke requests if the permission prompt is never answered.
        _ = await self.runNotificationCall(timeoutSeconds: 2.0) { [notificationCenter] in
            _ = try await notificationCenter.requestAuthorization(options: [.alert, .sound, .badge])
        }

        return await self.notificationAuthorizationStatus()
    }

    private func notificationAuthorizationStatus() async -> NotificationAuthorizationStatus {
        let result = await self.runNotificationCall(timeoutSeconds: 1.5) { [notificationCenter] in
            await notificationCenter.authorizationStatus()
        }
        switch result {
        case let .success(status):
            return status
        case .failure:
            return .denied
        }
    }

    private func runNotificationCall<T: Sendable>(
        timeoutSeconds: Double,
        operation: @escaping @Sendable () async throws -> T
    ) async -> Result<T, NotificationCallError> {
        let latch = NotificationInvokeLatch<T>()
        var opTask: Task<Void, Never>?
        var timeoutTask: Task<Void, Never>?
        defer {
            opTask?.cancel()
            timeoutTask?.cancel()
        }
        let clamped = max(0.0, timeoutSeconds)
        return await withCheckedContinuation { (cont: CheckedContinuation<Result<T, NotificationCallError>, Never>) in
            latch.setContinuation(cont)
            opTask = Task { @MainActor in
                do {
                    let value = try await operation()
                    latch.resume(.success(value))
                } catch {
                    latch.resume(.failure(NotificationCallError(message: error.localizedDescription)))
                }
            }
            timeoutTask = Task.detached {
                if clamped > 0 {
                    try? await Task.sleep(nanoseconds: UInt64(clamped * 1_000_000_000))
                }
                latch.resume(.failure(NotificationCallError(message: "notification request timed out")))
            }
        }
    }

    private func handleDeviceInvoke(_ req: BridgeInvokeRequest) async throws -> BridgeInvokeResponse {
        switch req.command {
        case NexusDeviceCommand.status.rawValue:
            let payload = try await self.deviceStatusService.status()
            let json = try Self.encodePayload(payload)
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: json)
        case NexusDeviceCommand.info.rawValue:
            let payload = self.deviceStatusService.info()
            let json = try Self.encodePayload(payload)
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: json)
        default:
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(code: .invalidRequest, message: "INVALID_REQUEST: unknown command"))
        }
    }

    private func handlePhotosInvoke(_ req: BridgeInvokeRequest) async throws -> BridgeInvokeResponse {
        let params = (try? Self.decodeParams(NexusPhotosLatestParams.self, from: req.paramsJSON)) ??
            NexusPhotosLatestParams()
        let payload = try await self.photosService.latest(params: params)
        let json = try Self.encodePayload(payload)
        return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: json)
    }

    private func handleContactsInvoke(_ req: BridgeInvokeRequest) async throws -> BridgeInvokeResponse {
        switch req.command {
        case NexusContactsCommand.search.rawValue:
            let params = (try? Self.decodeParams(NexusContactsSearchParams.self, from: req.paramsJSON)) ??
                NexusContactsSearchParams()
            let payload = try await self.contactsService.search(params: params)
            let json = try Self.encodePayload(payload)
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: json)
        case NexusContactsCommand.add.rawValue:
            let params = try Self.decodeParams(NexusContactsAddParams.self, from: req.paramsJSON)
            let payload = try await self.contactsService.add(params: params)
            let json = try Self.encodePayload(payload)
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: json)
        default:
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(code: .invalidRequest, message: "INVALID_REQUEST: unknown command"))
        }
    }

    private func handleCalendarInvoke(_ req: BridgeInvokeRequest) async throws -> BridgeInvokeResponse {
        switch req.command {
        case NexusCalendarCommand.events.rawValue:
            let params = (try? Self.decodeParams(NexusCalendarEventsParams.self, from: req.paramsJSON)) ??
                NexusCalendarEventsParams()
            let payload = try await self.calendarService.events(params: params)
            let json = try Self.encodePayload(payload)
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: json)
        case NexusCalendarCommand.add.rawValue:
            let params = try Self.decodeParams(NexusCalendarAddParams.self, from: req.paramsJSON)
            let payload = try await self.calendarService.add(params: params)
            let json = try Self.encodePayload(payload)
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: json)
        default:
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(code: .invalidRequest, message: "INVALID_REQUEST: unknown command"))
        }
    }

    private func handleRemindersInvoke(_ req: BridgeInvokeRequest) async throws -> BridgeInvokeResponse {
        switch req.command {
        case NexusRemindersCommand.list.rawValue:
            let params = (try? Self.decodeParams(NexusRemindersListParams.self, from: req.paramsJSON)) ??
                NexusRemindersListParams()
            let payload = try await self.remindersService.list(params: params)
            let json = try Self.encodePayload(payload)
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: json)
        case NexusRemindersCommand.add.rawValue:
            let params = try Self.decodeParams(NexusRemindersAddParams.self, from: req.paramsJSON)
            let payload = try await self.remindersService.add(params: params)
            let json = try Self.encodePayload(payload)
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: json)
        default:
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(code: .invalidRequest, message: "INVALID_REQUEST: unknown command"))
        }
    }

    private func handleMotionInvoke(_ req: BridgeInvokeRequest) async throws -> BridgeInvokeResponse {
        switch req.command {
        case NexusMotionCommand.activity.rawValue:
            let params = (try? Self.decodeParams(NexusMotionActivityParams.self, from: req.paramsJSON)) ??
                NexusMotionActivityParams()
            let payload = try await self.motionService.activities(params: params)
            let json = try Self.encodePayload(payload)
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: json)
        case NexusMotionCommand.pedometer.rawValue:
            let params = (try? Self.decodeParams(NexusPedometerParams.self, from: req.paramsJSON)) ??
                NexusPedometerParams()
            let payload = try await self.motionService.pedometer(params: params)
            let json = try Self.encodePayload(payload)
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: json)
        default:
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(code: .invalidRequest, message: "INVALID_REQUEST: unknown command"))
        }
    }

    private func handleTalkInvoke(_ req: BridgeInvokeRequest) async throws -> BridgeInvokeResponse {
        switch req.command {
        case NexusTalkCommand.pttStart.rawValue:
            let payload = try await self.talkMode.beginPushToTalk()
            let json = try Self.encodePayload(payload)
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: json)
        case NexusTalkCommand.pttStop.rawValue:
            let payload = await self.talkMode.endPushToTalk()
            let json = try Self.encodePayload(payload)
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: json)
        case NexusTalkCommand.pttCancel.rawValue:
            let payload = await self.talkMode.cancelPushToTalk()
            let json = try Self.encodePayload(payload)
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: json)
        case NexusTalkCommand.pttOnce.rawValue:
            let payload = try await self.talkMode.runPushToTalkOnce()
            let json = try Self.encodePayload(payload)
            return BridgeInvokeResponse(id: req.id, ok: true, payloadJSON: json)
        default:
            return BridgeInvokeResponse(
                id: req.id,
                ok: false,
                error: NexusNodeError(code: .invalidRequest, message: "INVALID_REQUEST: unknown command"))
        }
    }

}

private extension NodeAppModel {
    // Central registry for node invoke routing to keep commands in one place.
    func buildCapabilityRouter() -> NodeCapabilityRouter {
        var handlers: [String: NodeCapabilityRouter.Handler] = [:]

        func register(_ commands: [String], handler: @escaping NodeCapabilityRouter.Handler) {
            for command in commands {
                handlers[command] = handler
            }
        }

        register([NexusLocationCommand.get.rawValue]) { [weak self] req in
            guard let self else { throw NodeCapabilityRouter.RouterError.handlerUnavailable }
            return try await self.handleLocationInvoke(req)
        }

        register([
            NexusCanvasCommand.present.rawValue,
            NexusCanvasCommand.hide.rawValue,
            NexusCanvasCommand.navigate.rawValue,
            NexusCanvasCommand.evalJS.rawValue,
            NexusCanvasCommand.snapshot.rawValue,
        ]) { [weak self] req in
            guard let self else { throw NodeCapabilityRouter.RouterError.handlerUnavailable }
            return try await self.handleCanvasInvoke(req)
        }

        register([
            NexusCameraCommand.list.rawValue,
            NexusCameraCommand.snap.rawValue,
            NexusCameraCommand.clip.rawValue,
        ]) { [weak self] req in
            guard let self else { throw NodeCapabilityRouter.RouterError.handlerUnavailable }
            return try await self.handleCameraInvoke(req)
        }

        register([NexusScreenCommand.record.rawValue]) { [weak self] req in
            guard let self else { throw NodeCapabilityRouter.RouterError.handlerUnavailable }
            return try await self.handleScreenRecordInvoke(req)
        }

        register([NexusSystemCommand.notify.rawValue]) { [weak self] req in
            guard let self else { throw NodeCapabilityRouter.RouterError.handlerUnavailable }
            return try await self.handleSystemNotify(req)
        }

        register([NexusChatCommand.push.rawValue]) { [weak self] req in
            guard let self else { throw NodeCapabilityRouter.RouterError.handlerUnavailable }
            return try await self.handleChatPushInvoke(req)
        }

        register([
            NexusDeviceCommand.status.rawValue,
            NexusDeviceCommand.info.rawValue,
        ]) { [weak self] req in
            guard let self else { throw NodeCapabilityRouter.RouterError.handlerUnavailable }
            return try await self.handleDeviceInvoke(req)
        }

        register([NexusPhotosCommand.latest.rawValue]) { [weak self] req in
            guard let self else { throw NodeCapabilityRouter.RouterError.handlerUnavailable }
            return try await self.handlePhotosInvoke(req)
        }

        register([
            NexusContactsCommand.search.rawValue,
            NexusContactsCommand.add.rawValue,
        ]) { [weak self] req in
            guard let self else { throw NodeCapabilityRouter.RouterError.handlerUnavailable }
            return try await self.handleContactsInvoke(req)
        }

        register([
            NexusCalendarCommand.events.rawValue,
            NexusCalendarCommand.add.rawValue,
        ]) { [weak self] req in
            guard let self else { throw NodeCapabilityRouter.RouterError.handlerUnavailable }
            return try await self.handleCalendarInvoke(req)
        }

        register([
            NexusRemindersCommand.list.rawValue,
            NexusRemindersCommand.add.rawValue,
        ]) { [weak self] req in
            guard let self else { throw NodeCapabilityRouter.RouterError.handlerUnavailable }
            return try await self.handleRemindersInvoke(req)
        }

        register([
            NexusMotionCommand.activity.rawValue,
            NexusMotionCommand.pedometer.rawValue,
        ]) { [weak self] req in
            guard let self else { throw NodeCapabilityRouter.RouterError.handlerUnavailable }
            return try await self.handleMotionInvoke(req)
        }

        register([
            NexusTalkCommand.pttStart.rawValue,
            NexusTalkCommand.pttStop.rawValue,
            NexusTalkCommand.pttCancel.rawValue,
            NexusTalkCommand.pttOnce.rawValue,
        ]) { [weak self] req in
            guard let self else { throw NodeCapabilityRouter.RouterError.handlerUnavailable }
            return try await self.handleTalkInvoke(req)
        }

        return NodeCapabilityRouter(handlers: handlers)
    }

    func locationMode() -> NexusLocationMode {
        let raw = UserDefaults.standard.string(forKey: "location.enabledMode") ?? "off"
        return NexusLocationMode(rawValue: raw) ?? .off
    }

    func isLocationPreciseEnabled() -> Bool {
        if UserDefaults.standard.object(forKey: "location.preciseEnabled") == nil { return true }
        return UserDefaults.standard.bool(forKey: "location.preciseEnabled")
    }

    static func decodeParams<T: Decodable>(_ type: T.Type, from json: String?) throws -> T {
        guard let json, let data = json.data(using: .utf8) else {
            throw NSError(domain: "Runtime", code: 20, userInfo: [
                NSLocalizedDescriptionKey: "INVALID_REQUEST: paramsJSON required",
            ])
        }
        return try JSONDecoder().decode(type, from: data)
    }

    static func encodePayload(_ obj: some Encodable) throws -> String {
        let data = try JSONEncoder().encode(obj)
        guard let json = String(bytes: data, encoding: .utf8) else {
            throw NSError(domain: "NodeAppModel", code: 21, userInfo: [
                NSLocalizedDescriptionKey: "Failed to encode payload as UTF-8",
            ])
        }
        return json
    }

    func isCameraEnabled() -> Bool {
        // Default-on: if the key doesn't exist yet, treat it as enabled.
        if UserDefaults.standard.object(forKey: "camera.enabled") == nil { return true }
        return UserDefaults.standard.bool(forKey: "camera.enabled")
    }

    func triggerCameraFlash() {
        self.cameraFlashNonce &+= 1
    }

    func showCameraHUD(text: String, kind: CameraHUDKind, autoHideSeconds: Double? = nil) {
        self.cameraHUDDismissTask?.cancel()

        withAnimation(.spring(response: 0.25, dampingFraction: 0.85)) {
            self.cameraHUDText = text
            self.cameraHUDKind = kind
        }

        guard let autoHideSeconds else { return }
        self.cameraHUDDismissTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(autoHideSeconds * 1_000_000_000))
            withAnimation(.easeOut(duration: 0.25)) {
                self.cameraHUDText = nil
                self.cameraHUDKind = nil
            }
        }
    }
}

extension NodeAppModel {
    func connectToRuntime(
        url: URL,
        runtimeStableID: String,
        tls: RuntimeTLSParams?,
        token: String?,
        password: String?,
        connectOptions: RuntimeConnectOptions)
    {
        let stableID = runtimeStableID.trimmingCharacters(in: .whitespacesAndNewlines)
        let effectiveStableID = stableID.isEmpty ? url.absoluteString : stableID
        let sessionBox = tls.map { WebSocketSessionBox(session: RuntimeTLSPinningSession(params: $0)) }

        self.activeRuntimeConnectConfig = RuntimeConnectConfig(
            url: url,
            stableID: stableID,
            tls: tls,
            token: token,
            password: password,
            nodeOptions: connectOptions)
        self.prepareForRuntimeConnect(url: url, stableID: effectiveStableID)
        self.startOperatorRuntimeLoop(
            url: url,
            stableID: effectiveStableID,
            token: token,
            password: password,
            nodeOptions: connectOptions,
            sessionBox: sessionBox)
        self.startNodeRuntimeLoop(
            url: url,
            stableID: effectiveStableID,
            token: token,
            password: password,
            nodeOptions: connectOptions,
            sessionBox: sessionBox)
    }

    /// Preferred entry-point: apply a single config object and start both sessions.
    func applyRuntimeConnectConfig(_ cfg: RuntimeConnectConfig) {
        self.activeRuntimeConnectConfig = cfg
        self.connectToRuntime(
            url: cfg.url,
            // Preserve the caller-provided stableID (may be empty) and let connectToRuntime
            // derive the effective stable id consistently for persistence keys.
            runtimeStableID: cfg.stableID,
            tls: cfg.tls,
            token: cfg.token,
            password: cfg.password,
            connectOptions: cfg.nodeOptions)
    }

    func disconnectRuntime() {
        self.runtimeAutoReconnectEnabled = false
        self.nodeRuntimeTask?.cancel()
        self.nodeRuntimeTask = nil
        self.operatorRuntimeTask?.cancel()
        self.operatorRuntimeTask = nil
        self.runtimeHealthMonitor.stop()
        Task {
            await self.operatorRuntime.disconnect()
            await self.nodeRuntime.disconnect()
        }
        self.runtimeStatusText = "Offline"
        self.runtimeServerName = nil
        self.runtimeRemoteAddress = nil
        self.connectedRuntimeID = nil
        self.activeRuntimeConnectConfig = nil
        self.runtimeConnected = false
        self.operatorConnected = false
        self.talkMode.updateRuntimeConnected(false)
        self.seamColorHex = nil
        self.mainSessionBaseKey = "main"
        self.talkMode.updateMainSessionKey(self.mainSessionKey)
    }
}

private extension NodeAppModel {
    func prepareForRuntimeConnect(url: URL, stableID: String) {
        self.runtimeAutoReconnectEnabled = true
        self.nodeRuntimeTask?.cancel()
        self.operatorRuntimeTask?.cancel()
        self.runtimeHealthMonitor.stop()
        self.runtimeServerName = nil
        self.runtimeRemoteAddress = nil
        self.connectedRuntimeID = stableID
        self.runtimeConnected = false
        self.operatorConnected = false
        self.runtimeDefaultAgentId = nil
        self.runtimeAgents = []
        self.selectedAgentId = RuntimeSettingsStore.loadRuntimeSelectedAgentId(stableID: stableID)
    }

    func startOperatorRuntimeLoop(
        url: URL,
        stableID: String,
        token: String?,
        password: String?,
        nodeOptions: RuntimeConnectOptions,
        sessionBox: WebSocketSessionBox?)
    {
        // Operator session reconnects independently (chat/talk/config), but we tie its
        // lifecycle to the current runtime config so it doesn't keep running across Disconnect.
        self.operatorRuntimeTask = Task { [weak self] in
            guard let self else { return }
            var attempt = 0
            while !Task.isCancelled {
                if await self.isOperatorConnected() {
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    continue
                }

                let effectiveClientId =
                    RuntimeSettingsStore.loadRuntimeClientIdOverride(stableID: stableID) ?? nodeOptions.clientId
                let operatorOptions = self.makeOperatorConnectOptions(
                    clientId: effectiveClientId,
                    displayName: nodeOptions.clientDisplayName)

                do {
                    try await self.operatorRuntime.connect(
                        url: url,
                        token: token,
                        password: password,
                        connectOptions: operatorOptions,
                        sessionBox: sessionBox,
                        onConnected: { [weak self] in
                            guard let self else { return }
                            await MainActor.run {
                                self.operatorConnected = true
                                self.talkMode.updateRuntimeConnected(true)
                            }
                            RuntimeDiagnostics.log(
                                "operator runtime connected host=\(url.host ?? "?") scheme=\(url.scheme ?? "?")")
                            await self.refreshBrandingFromRuntime()
                            await self.refreshAgentsFromRuntime()
                            await MainActor.run { self.startRuntimeHealthMonitor() }
                        },
                        onDisconnected: { [weak self] reason in
                            guard let self else { return }
                            await MainActor.run {
                                self.operatorConnected = false
                                self.talkMode.updateRuntimeConnected(false)
                            }
                            RuntimeDiagnostics.log("operator runtime disconnected reason=\(reason)")
                            await MainActor.run { self.stopRuntimeHealthMonitor() }
                        },
                        onInvoke: { req in
                            // Operator session should not handle node.invoke requests.
                            BridgeInvokeResponse(
                                id: req.id,
                                ok: false,
                                error: NexusNodeError(
                                    code: .invalidRequest,
                                    message: "INVALID_REQUEST: operator session cannot invoke node commands"))
                        })

                    attempt = 0
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                } catch {
                    attempt += 1
                    RuntimeDiagnostics.log("operator runtime connect error: \(error.localizedDescription)")
                    let sleepSeconds = min(8.0, 0.5 * pow(1.7, Double(attempt)))
                    try? await Task.sleep(nanoseconds: UInt64(sleepSeconds * 1_000_000_000))
                }
            }
        }
    }

    func startNodeRuntimeLoop(
        url: URL,
        stableID: String,
        token: String?,
        password: String?,
        nodeOptions: RuntimeConnectOptions,
        sessionBox: WebSocketSessionBox?)
    {
        self.nodeRuntimeTask = Task { [weak self] in
            guard let self else { return }
            var attempt = 0
            var currentOptions = nodeOptions
            var didFallbackClientId = false

            while !Task.isCancelled {
                if await self.isRuntimeConnected() {
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    continue
                }
                await MainActor.run {
                    self.runtimeStatusText = (attempt == 0) ? "Connecting…" : "Reconnecting…"
                    self.runtimeServerName = nil
                    self.runtimeRemoteAddress = nil
                }

                do {
                    let epochMs = Int(Date().timeIntervalSince1970 * 1000)
                    RuntimeDiagnostics.log("connect attempt epochMs=\(epochMs) url=\(url.absoluteString)")
                    try await self.nodeRuntime.connect(
                        url: url,
                        token: token,
                        password: password,
                        connectOptions: currentOptions,
                        sessionBox: sessionBox,
                        onConnected: { [weak self] in
                            guard let self else { return }
                            await MainActor.run {
                                self.runtimeStatusText = "Connected"
                                self.runtimeServerName = url.host ?? "runtime"
                                self.runtimeConnected = true
                                self.screen.errorText = nil
                                UserDefaults.standard.set(true, forKey: "runtime.autoconnect")
                            }
                            RuntimeDiagnostics.log(
                                "runtime connected host=\(url.host ?? "?") scheme=\(url.scheme ?? "?")")
                            if let addr = await self.nodeRuntime.currentRemoteAddress() {
                                await MainActor.run { self.runtimeRemoteAddress = addr }
                            }
                        },
                        onDisconnected: { [weak self] reason in
                            guard let self else { return }
                            await MainActor.run {
                                self.runtimeStatusText = "Disconnected: \(reason)"
                                self.runtimeServerName = nil
                                self.runtimeRemoteAddress = nil
                                self.runtimeConnected = false
                            }
                            RuntimeDiagnostics.log("runtime disconnected reason: \(reason)")
                        },
                        onInvoke: { [weak self] req in
                            guard let self else {
                                return BridgeInvokeResponse(
                                    id: req.id,
                                    ok: false,
                                    error: NexusNodeError(
                                        code: .unavailable,
                                        message: "UNAVAILABLE: node not ready"))
                            }
                            return await self.handleInvoke(req)
                        })

                    attempt = 0
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                } catch {
                    if Task.isCancelled { break }
                    if !didFallbackClientId,
                       let fallbackClientId = self.legacyClientIdFallback(
                        currentClientId: currentOptions.clientId,
                        error: error)
                    {
                        didFallbackClientId = true
                        currentOptions.clientId = fallbackClientId
                        RuntimeSettingsStore.saveRuntimeClientIdOverride(
                            stableID: stableID,
                            clientId: fallbackClientId)
                        await MainActor.run { self.runtimeStatusText = "Runtime rejected client id. Retrying…" }
                        continue
                    }

                    attempt += 1
                    await MainActor.run {
                        self.runtimeStatusText = "Runtime error: \(error.localizedDescription)"
                        self.runtimeServerName = nil
                        self.runtimeRemoteAddress = nil
                        self.runtimeConnected = false
                    }
                    RuntimeDiagnostics.log("runtime connect error: \(error.localizedDescription)")
                    let sleepSeconds = min(8.0, 0.5 * pow(1.7, Double(attempt)))
                    try? await Task.sleep(nanoseconds: UInt64(sleepSeconds * 1_000_000_000))
                }
            }

            await MainActor.run {
                self.runtimeStatusText = "Offline"
                self.runtimeServerName = nil
                self.runtimeRemoteAddress = nil
                self.connectedRuntimeID = nil
                self.runtimeConnected = false
                self.operatorConnected = false
                self.talkMode.updateRuntimeConnected(false)
                self.seamColorHex = nil
                self.mainSessionBaseKey = "main"
                self.talkMode.updateMainSessionKey(self.mainSessionKey)
            }
        }
    }

    func makeOperatorConnectOptions(clientId: String, displayName: String?) -> RuntimeConnectOptions {
        RuntimeConnectOptions(
            role: "operator",
            scopes: ["operator.read", "operator.write", "operator.admin"],
            caps: [],
            commands: [],
            permissions: [:],
            clientId: clientId,
            clientMode: "ui",
            clientDisplayName: displayName,
            includeDeviceIdentity: false)
    }

    func legacyClientIdFallback(currentClientId: String, error: Error) -> String? {
        let normalizedClientId = currentClientId.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard normalizedClientId == "nexus-ios" else { return nil }
        let message = error.localizedDescription.lowercased()
        guard message.contains("invalid connect params"), message.contains("/client/id") else {
            return nil
        }
        return "nexus-ios"
    }

    func isOperatorConnected() async -> Bool {
        self.operatorConnected
    }
}

#if DEBUG
extension NodeAppModel {
    func _test_handleInvoke(_ req: BridgeInvokeRequest) async -> BridgeInvokeResponse {
        await self.handleInvoke(req)
    }

    static func _test_decodeParams<T: Decodable>(_ type: T.Type, from json: String?) throws -> T {
        try self.decodeParams(type, from: json)
    }

    static func _test_encodePayload(_ obj: some Encodable) throws -> String {
        try self.encodePayload(obj)
    }

    func _test_isCameraEnabled() -> Bool {
        self.isCameraEnabled()
    }

    func _test_triggerCameraFlash() {
        self.triggerCameraFlash()
    }

    func _test_showCameraHUD(text: String, kind: CameraHUDKind, autoHideSeconds: Double? = nil) {
        self.showCameraHUD(text: text, kind: kind, autoHideSeconds: autoHideSeconds)
    }

    func _test_showLocalCanvasOnDisconnect() {
    }
}
#endif
