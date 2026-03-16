import AVFoundation
import Contacts
import CoreLocation
import CoreMotion
import EventKit
import Foundation
import NexusKit
import Network
import Observation
import Photos
import ReplayKit
import Speech
import SwiftUI
import UIKit

@MainActor
@Observable
final class RuntimeConnectionController {
    private(set) var runtimes: [RuntimeDiscoveryModel.DiscoveredRuntime] = []
    private(set) var discoveryStatusText: String = "Idle"
    private(set) var discoveryDebugLog: [RuntimeDiscoveryModel.DebugLogEntry] = []

    private let discovery = RuntimeDiscoveryModel()
    private weak var appModel: NodeAppModel?
    private var didAutoConnect = false

    init(appModel: NodeAppModel, startDiscovery: Bool = true) {
        self.appModel = appModel

        RuntimeSettingsStore.bootstrapPersistence()
        let defaults = UserDefaults.standard
        self.discovery.setDebugLoggingEnabled(defaults.bool(forKey: "runtime.discovery.debugLogs"))

        self.updateFromDiscovery()
        self.observeDiscovery()

        if startDiscovery {
            self.discovery.start()
        }
    }

    func setDiscoveryDebugLoggingEnabled(_ enabled: Bool) {
        self.discovery.setDebugLoggingEnabled(enabled)
    }

    func setScenePhase(_ phase: ScenePhase) {
        switch phase {
        case .background:
            self.discovery.stop()
        case .active, .inactive:
            self.discovery.start()
            self.attemptAutoReconnectIfNeeded()
        @unknown default:
            self.discovery.start()
            self.attemptAutoReconnectIfNeeded()
        }
    }

    func connect(_ runtime: RuntimeDiscoveryModel.DiscoveredRuntime) async {
        let instanceId = UserDefaults.standard.string(forKey: "node.instanceId")?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let token = RuntimeSettingsStore.loadRuntimeToken(instanceId: instanceId)
        let password = RuntimeSettingsStore.loadRuntimePassword(instanceId: instanceId)
        guard let host = self.resolveRuntimeHost(runtime) else { return }
        let port = runtime.runtimePort ?? 18789
        let tlsParams = self.resolveDiscoveredTLSParams(runtime: runtime)
        guard let url = self.buildRuntimeURL(
            host: host,
            port: port,
            useTLS: tlsParams?.required == true)
        else { return }
        RuntimeSettingsStore.saveLastRuntimeConnection(
            host: host,
            port: port,
            useTLS: tlsParams?.required == true,
            stableID: runtime.stableID)
        self.didAutoConnect = true
        self.startAutoConnect(
            url: url,
            runtimeStableID: runtime.stableID,
            tls: tlsParams,
            token: token,
            password: password)
    }

    func connectManual(host: String, port: Int, useTLS: Bool) async {
        let instanceId = UserDefaults.standard.string(forKey: "node.instanceId")?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let token = RuntimeSettingsStore.loadRuntimeToken(instanceId: instanceId)
        let password = RuntimeSettingsStore.loadRuntimePassword(instanceId: instanceId)
        let resolvedUseTLS = useTLS
        guard let resolvedPort = self.resolveManualPort(host: host, port: port, useTLS: resolvedUseTLS)
        else { return }
        let stableID = self.manualStableID(host: host, port: resolvedPort)
        let tlsParams = self.resolveManualTLSParams(
            stableID: stableID,
            tlsEnabled: resolvedUseTLS,
            allowTOFUReset: self.shouldForceTLS(host: host))
        guard let url = self.buildRuntimeURL(
            host: host,
            port: resolvedPort,
            useTLS: tlsParams?.required == true)
        else { return }
        RuntimeSettingsStore.saveLastRuntimeConnection(
            host: host,
            port: resolvedPort,
            useTLS: tlsParams?.required == true,
            stableID: stableID)
        self.didAutoConnect = true
        self.startAutoConnect(
            url: url,
            runtimeStableID: stableID,
            tls: tlsParams,
            token: token,
            password: password)
    }

    func connectLastKnown() async {
        guard let last = RuntimeSettingsStore.loadLastRuntimeConnection() else { return }
        let instanceId = UserDefaults.standard.string(forKey: "node.instanceId")?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let token = RuntimeSettingsStore.loadRuntimeToken(instanceId: instanceId)
        let password = RuntimeSettingsStore.loadRuntimePassword(instanceId: instanceId)
        let resolvedUseTLS = last.useTLS
        let tlsParams = self.resolveManualTLSParams(
            stableID: last.stableID,
            tlsEnabled: resolvedUseTLS,
            allowTOFUReset: self.shouldForceTLS(host: last.host))
        guard let url = self.buildRuntimeURL(
            host: last.host,
            port: last.port,
            useTLS: tlsParams?.required == true)
        else { return }
        if resolvedUseTLS != last.useTLS {
            RuntimeSettingsStore.saveLastRuntimeConnection(
                host: last.host,
                port: last.port,
                useTLS: resolvedUseTLS,
                stableID: last.stableID)
        }
        self.didAutoConnect = true
        self.startAutoConnect(
            url: url,
            runtimeStableID: last.stableID,
            tls: tlsParams,
            token: token,
            password: password)
    }

    private func updateFromDiscovery() {
        let newRuntimes = self.discovery.runtimes
        self.runtimes = newRuntimes
        self.discoveryStatusText = self.discovery.statusText
        self.discoveryDebugLog = self.discovery.debugLog
        self.updateLastDiscoveredRuntime(from: newRuntimes)
        self.maybeAutoConnect()
    }

    private func observeDiscovery() {
        withObservationTracking {
            _ = self.discovery.runtimes
            _ = self.discovery.statusText
            _ = self.discovery.debugLog
        } onChange: { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                self.updateFromDiscovery()
                self.observeDiscovery()
            }
        }
    }

    private func maybeAutoConnect() {
        guard !self.didAutoConnect else { return }
        guard let appModel = self.appModel else { return }
        guard appModel.runtimeServerName == nil else { return }

        let defaults = UserDefaults.standard
        guard defaults.bool(forKey: "runtime.autoconnect") else { return }
        let manualEnabled = defaults.bool(forKey: "runtime.manual.enabled")

        let instanceId = defaults.string(forKey: "node.instanceId")?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !instanceId.isEmpty else { return }

        let token = RuntimeSettingsStore.loadRuntimeToken(instanceId: instanceId)
        let password = RuntimeSettingsStore.loadRuntimePassword(instanceId: instanceId)

        if manualEnabled {
            let manualHost = defaults.string(forKey: "runtime.manual.host")?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !manualHost.isEmpty else { return }

            let manualPort = defaults.integer(forKey: "runtime.manual.port")
            let manualTLS = defaults.bool(forKey: "runtime.manual.tls")
            let resolvedUseTLS = manualTLS || self.shouldForceTLS(host: manualHost)
            guard let resolvedPort = self.resolveManualPort(
                host: manualHost,
                port: manualPort,
                useTLS: resolvedUseTLS)
            else { return }

            let stableID = self.manualStableID(host: manualHost, port: resolvedPort)
            let tlsParams = self.resolveManualTLSParams(
                stableID: stableID,
                tlsEnabled: resolvedUseTLS,
                allowTOFUReset: self.shouldForceTLS(host: manualHost))

            guard let url = self.buildRuntimeURL(
                host: manualHost,
                port: resolvedPort,
                useTLS: tlsParams?.required == true)
            else { return }

            self.didAutoConnect = true
            self.startAutoConnect(
                url: url,
                runtimeStableID: stableID,
                tls: tlsParams,
                token: token,
                password: password)
            return
        }

        if let lastKnown = RuntimeSettingsStore.loadLastRuntimeConnection() {
            let resolvedUseTLS = lastKnown.useTLS || self.shouldForceTLS(host: lastKnown.host)
            let tlsParams = self.resolveManualTLSParams(
                stableID: lastKnown.stableID,
                tlsEnabled: resolvedUseTLS,
                allowTOFUReset: self.shouldForceTLS(host: lastKnown.host))
            guard let url = self.buildRuntimeURL(
                host: lastKnown.host,
                port: lastKnown.port,
                useTLS: tlsParams?.required == true)
            else { return }

            self.didAutoConnect = true
            self.startAutoConnect(
                url: url,
                runtimeStableID: lastKnown.stableID,
                tls: tlsParams,
                token: token,
                password: password)
            return
        }

        let preferredStableID = defaults.string(forKey: "runtime.preferredStableID")?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let lastDiscoveredStableID = defaults.string(forKey: "runtime.lastDiscoveredStableID")?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        let candidates = [preferredStableID, lastDiscoveredStableID].filter { !$0.isEmpty }
        if let targetStableID = candidates.first(where: { id in
            self.runtimes.contains(where: { $0.stableID == id })
        }) {
            guard let target = self.runtimes.first(where: { $0.stableID == targetStableID }) else { return }
            guard let host = self.resolveRuntimeHost(target) else { return }
            let port = target.runtimePort ?? 18789
            let tlsParams = self.resolveDiscoveredTLSParams(runtime: target)
            guard let url = self.buildRuntimeURL(host: host, port: port, useTLS: tlsParams?.required == true)
            else { return }

            self.didAutoConnect = true
            self.startAutoConnect(
                url: url,
                runtimeStableID: target.stableID,
                tls: tlsParams,
                token: token,
                password: password)
            return
        }

        if self.runtimes.count == 1, let runtime = self.runtimes.first {
            guard let host = self.resolveRuntimeHost(runtime) else { return }
            let port = runtime.runtimePort ?? 18789
            let tlsParams = self.resolveDiscoveredTLSParams(runtime: runtime)
            guard let url = self.buildRuntimeURL(host: host, port: port, useTLS: tlsParams?.required == true)
            else { return }

            self.didAutoConnect = true
            self.startAutoConnect(
                url: url,
                runtimeStableID: runtime.stableID,
                tls: tlsParams,
                token: token,
                password: password)
            return
        }
    }

    private func attemptAutoReconnectIfNeeded() {
        guard let appModel = self.appModel else { return }
        guard appModel.runtimeAutoReconnectEnabled else { return }
        // Avoid starting duplicate connect loops while a prior config is active.
        guard appModel.activeRuntimeConnectConfig == nil else { return }
        guard UserDefaults.standard.bool(forKey: "runtime.autoconnect") else { return }
        self.didAutoConnect = false
        self.maybeAutoConnect()
    }

    private func updateLastDiscoveredRuntime(from runtimes: [RuntimeDiscoveryModel.DiscoveredRuntime]) {
        let defaults = UserDefaults.standard
        let preferred = defaults.string(forKey: "runtime.preferredStableID")?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let existingLast = defaults.string(forKey: "runtime.lastDiscoveredStableID")?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        // Avoid overriding user intent (preferred/lastDiscovered are also set on manual Connect).
        guard preferred.isEmpty, existingLast.isEmpty else { return }
        guard let first = runtimes.first else { return }

        defaults.set(first.stableID, forKey: "runtime.lastDiscoveredStableID")
        RuntimeSettingsStore.saveLastDiscoveredRuntimeStableID(first.stableID)
    }

    private func startAutoConnect(
        url: URL,
        runtimeStableID: String,
        tls: RuntimeTLSParams?,
        token: String?,
        password: String?)
    {
        guard let appModel else { return }
        let connectOptions = self.makeConnectOptions(stableID: runtimeStableID)

        Task { [weak appModel] in
            guard let appModel else { return }
            await MainActor.run {
                appModel.runtimeStatusText = "Connecting…"
            }
            let cfg = RuntimeConnectConfig(
                url: url,
                stableID: runtimeStableID,
                tls: tls,
                token: token,
                password: password,
                nodeOptions: connectOptions)
            appModel.applyRuntimeConnectConfig(cfg)
        }
    }

    private func resolveDiscoveredTLSParams(runtime: RuntimeDiscoveryModel.DiscoveredRuntime) -> RuntimeTLSParams? {
        let stableID = runtime.stableID
        let stored = RuntimeTLSStore.loadFingerprint(stableID: stableID)

        if runtime.tlsEnabled || runtime.tlsFingerprintSha256 != nil || stored != nil {
            return RuntimeTLSParams(
                required: true,
                expectedFingerprint: runtime.tlsFingerprintSha256 ?? stored,
                allowTOFU: stored == nil,
                storeKey: stableID)
        }

        return nil
    }

    private func resolveManualTLSParams(
        stableID: String,
        tlsEnabled: Bool,
        allowTOFUReset: Bool = false) -> RuntimeTLSParams?
    {
        let stored = RuntimeTLSStore.loadFingerprint(stableID: stableID)
        if tlsEnabled || stored != nil {
            return RuntimeTLSParams(
                required: true,
                expectedFingerprint: stored,
                allowTOFU: stored == nil || allowTOFUReset,
                storeKey: stableID)
        }

        return nil
    }

    private func resolveRuntimeHost(_ runtime: RuntimeDiscoveryModel.DiscoveredRuntime) -> String? {
        if let tailnet = runtime.tailnetDns?.trimmingCharacters(in: .whitespacesAndNewlines), !tailnet.isEmpty {
            return tailnet
        }
        if let lanHost = runtime.lanHost?.trimmingCharacters(in: .whitespacesAndNewlines), !lanHost.isEmpty {
            return lanHost
        }
        return nil
    }

    private func buildRuntimeURL(host: String, port: Int, useTLS: Bool) -> URL? {
        let scheme = useTLS ? "wss" : "ws"
        var components = URLComponents()
        components.scheme = scheme
        components.host = host
        components.port = port
        return components.url
    }

    private func shouldForceTLS(host: String) -> Bool {
        let trimmed = host.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if trimmed.isEmpty { return false }
        return trimmed.hasSuffix(".ts.net") || trimmed.hasSuffix(".ts.net.")
    }

    private func manualStableID(host: String, port: Int) -> String {
        "manual|\(host.lowercased())|\(port)"
    }

    private func makeConnectOptions(stableID: String?) -> RuntimeConnectOptions {
        let defaults = UserDefaults.standard
        let displayName = self.resolvedDisplayName(defaults: defaults)
        let resolvedClientId = self.resolvedClientId(defaults: defaults, stableID: stableID)

        return RuntimeConnectOptions(
            role: "operator",
            scopes: [],
            caps: self.currentCaps(),
            commands: self.currentCommands(),
            permissions: self.currentPermissions(),
            clientId: resolvedClientId,
            clientMode: "node",
            clientDisplayName: displayName)
    }

    private func resolvedClientId(defaults: UserDefaults, stableID: String?) -> String {
        if let stableID,
           let override = RuntimeSettingsStore.loadRuntimeClientIdOverride(stableID: stableID) {
            return override
        }
        let manualClientId = defaults.string(forKey: "runtime.manual.clientId")?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if manualClientId?.isEmpty == false {
            return manualClientId!
        }
        return "nexus-ios"
    }

    private func resolveManualPort(host: String, port: Int, useTLS: Bool) -> Int? {
        if port > 0 {
            return port <= 65535 ? port : nil
        }
        let trimmedHost = host.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedHost.isEmpty else { return nil }
        if useTLS && self.shouldForceTLS(host: trimmedHost) {
            return 443
        }
        return 18789
    }

    private func resolvedDisplayName(defaults: UserDefaults) -> String {
        let key = "node.displayName"
        let existingRaw = defaults.string(forKey: key)
        let resolved = NodeDisplayName.resolve(
            existing: existingRaw,
            deviceName: UIDevice.current.name,
            interfaceIdiom: UIDevice.current.userInterfaceIdiom)
        let existing = existingRaw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if existing.isEmpty || NodeDisplayName.isGeneric(existing) {
            defaults.set(resolved, forKey: key)
        }
        return resolved
    }

    private func currentCaps() -> [String] {
        var caps = [NexusCapability.canvas.rawValue, NexusCapability.screen.rawValue]

        // Default-on: if the key doesn't exist yet, treat it as enabled.
        let cameraEnabled =
            UserDefaults.standard.object(forKey: "camera.enabled") == nil
                ? true
                : UserDefaults.standard.bool(forKey: "camera.enabled")
        if cameraEnabled { caps.append(NexusCapability.camera.rawValue) }

        let locationModeRaw = UserDefaults.standard.string(forKey: "location.enabledMode") ?? "off"
        let locationMode = NexusLocationMode(rawValue: locationModeRaw) ?? .off
        if locationMode != .off { caps.append(NexusCapability.location.rawValue) }

        caps.append(NexusCapability.device.rawValue)
        caps.append(NexusCapability.photos.rawValue)
        caps.append(NexusCapability.contacts.rawValue)
        caps.append(NexusCapability.calendar.rawValue)
        caps.append(NexusCapability.reminders.rawValue)
        if Self.motionAvailable() {
            caps.append(NexusCapability.motion.rawValue)
        }

        return caps
    }

    private func currentCommands() -> [String] {
        var commands: [String] = [
            NexusCanvasCommand.present.rawValue,
            NexusCanvasCommand.hide.rawValue,
            NexusCanvasCommand.navigate.rawValue,
            NexusCanvasCommand.evalJS.rawValue,
            NexusCanvasCommand.snapshot.rawValue,
            NexusScreenCommand.record.rawValue,
            NexusSystemCommand.notify.rawValue,
            NexusChatCommand.push.rawValue,
            NexusTalkCommand.pttStart.rawValue,
            NexusTalkCommand.pttStop.rawValue,
            NexusTalkCommand.pttCancel.rawValue,
            NexusTalkCommand.pttOnce.rawValue,
        ]

        let caps = Set(self.currentCaps())
        if caps.contains(NexusCapability.camera.rawValue) {
            commands.append(NexusCameraCommand.list.rawValue)
            commands.append(NexusCameraCommand.snap.rawValue)
            commands.append(NexusCameraCommand.clip.rawValue)
        }
        if caps.contains(NexusCapability.location.rawValue) {
            commands.append(NexusLocationCommand.get.rawValue)
        }
        if caps.contains(NexusCapability.device.rawValue) {
            commands.append(NexusDeviceCommand.status.rawValue)
            commands.append(NexusDeviceCommand.info.rawValue)
        }
        if caps.contains(NexusCapability.photos.rawValue) {
            commands.append(NexusPhotosCommand.latest.rawValue)
        }
        if caps.contains(NexusCapability.contacts.rawValue) {
            commands.append(NexusContactsCommand.search.rawValue)
            commands.append(NexusContactsCommand.add.rawValue)
        }
        if caps.contains(NexusCapability.calendar.rawValue) {
            commands.append(NexusCalendarCommand.events.rawValue)
            commands.append(NexusCalendarCommand.add.rawValue)
        }
        if caps.contains(NexusCapability.reminders.rawValue) {
            commands.append(NexusRemindersCommand.list.rawValue)
            commands.append(NexusRemindersCommand.add.rawValue)
        }
        if caps.contains(NexusCapability.motion.rawValue) {
            commands.append(NexusMotionCommand.activity.rawValue)
            commands.append(NexusMotionCommand.pedometer.rawValue)
        }

        return commands
    }

    private func currentPermissions() -> [String: Bool] {
        var permissions: [String: Bool] = [:]
        permissions["camera"] = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
        permissions["microphone"] = AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
        permissions["speechRecognition"] = SFSpeechRecognizer.authorizationStatus() == .authorized
        permissions["location"] = Self.isLocationAuthorized(
            status: CLLocationManager().authorizationStatus)
            && CLLocationManager.locationServicesEnabled()
        permissions["screenRecording"] = RPScreenRecorder.shared().isAvailable

        let photoStatus = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        permissions["photos"] = photoStatus == .authorized || photoStatus == .limited
        let contactsStatus = CNContactStore.authorizationStatus(for: .contacts)
        permissions["contacts"] = contactsStatus == .authorized || contactsStatus == .limited

        let calendarStatus = EKEventStore.authorizationStatus(for: .event)
        permissions["calendar"] =
            calendarStatus == .authorized || calendarStatus == .fullAccess || calendarStatus == .writeOnly
        let remindersStatus = EKEventStore.authorizationStatus(for: .reminder)
        permissions["reminders"] =
            remindersStatus == .authorized || remindersStatus == .fullAccess || remindersStatus == .writeOnly

        let motionStatus = CMMotionActivityManager.authorizationStatus()
        let pedometerStatus = CMPedometer.authorizationStatus()
        permissions["motion"] =
            motionStatus == .authorized || pedometerStatus == .authorized

        return permissions
    }

    private static func isLocationAuthorized(status: CLAuthorizationStatus) -> Bool {
        switch status {
        case .authorizedAlways, .authorizedWhenInUse, .authorized:
            return true
        default:
            return false
        }
    }

    private static func motionAvailable() -> Bool {
        CMMotionActivityManager.isActivityAvailable() || CMPedometer.isStepCountingAvailable()
    }

    private func platformString() -> String {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        let name = switch UIDevice.current.userInterfaceIdiom {
        case .pad:
            "iPadOS"
        case .phone:
            "iOS"
        default:
            "iOS"
        }
        return "\(name) \(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
    }

    private func deviceFamily() -> String {
        switch UIDevice.current.userInterfaceIdiom {
        case .pad:
            "iPad"
        case .phone:
            "iPhone"
        default:
            "iOS"
        }
    }

    private func modelIdentifier() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let machine = withUnsafeBytes(of: &systemInfo.machine) { ptr in
            String(bytes: ptr.prefix { $0 != 0 }, encoding: .utf8)
        }
        let trimmed = machine?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? "unknown" : trimmed
    }

    private func appVersion() -> String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev"
    }
}

#if DEBUG
extension RuntimeConnectionController {
    func _test_resolvedDisplayName(defaults: UserDefaults) -> String {
        self.resolvedDisplayName(defaults: defaults)
    }

    func _test_currentCaps() -> [String] {
        self.currentCaps()
    }

    func _test_currentCommands() -> [String] {
        self.currentCommands()
    }

    func _test_currentPermissions() -> [String: Bool] {
        self.currentPermissions()
    }

    func _test_platformString() -> String {
        self.platformString()
    }

    func _test_deviceFamily() -> String {
        self.deviceFamily()
    }

    func _test_modelIdentifier() -> String {
        self.modelIdentifier()
    }

    func _test_appVersion() -> String {
        self.appVersion()
    }

    func _test_setRuntimes(_ runtimes: [RuntimeDiscoveryModel.DiscoveredRuntime]) {
        self.runtimes = runtimes
    }

    func _test_triggerAutoConnect() {
        self.maybeAutoConnect()
    }
}
#endif
