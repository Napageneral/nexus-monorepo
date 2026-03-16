import NexusKit
import Network
import Observation
import os
import SwiftUI
import UIKit

struct SettingsTab: View {
    @Environment(NodeAppModel.self) private var appModel: NodeAppModel
    @Environment(RuntimeConnectionController.self) private var runtimeController: RuntimeConnectionController
    @Environment(\.dismiss) private var dismiss
    @AppStorage("node.displayName") private var displayName: String = "iOS Node"
    @AppStorage("node.instanceId") private var instanceId: String = UUID().uuidString
    @AppStorage("talk.enabled") private var talkEnabled: Bool = false
    @AppStorage("talk.button.enabled") private var talkButtonEnabled: Bool = true
    @AppStorage("camera.enabled") private var cameraEnabled: Bool = true
    @AppStorage("location.enabledMode") private var locationEnabledModeRaw: String = NexusLocationMode.off.rawValue
    @AppStorage("location.preciseEnabled") private var locationPreciseEnabled: Bool = true
    @AppStorage("screen.preventSleep") private var preventSleep: Bool = true
    @AppStorage("runtime.preferredStableID") private var preferredRuntimeStableID: String = ""
    @AppStorage("runtime.lastDiscoveredStableID") private var lastDiscoveredRuntimeStableID: String = ""
    @AppStorage("runtime.autoconnect") private var runtimeAutoConnect: Bool = false
    @AppStorage("runtime.manual.enabled") private var manualRuntimeEnabled: Bool = false
    @AppStorage("runtime.manual.host") private var manualRuntimeHost: String = ""
    @AppStorage("runtime.manual.port") private var manualRuntimePort: Int = 18789
    @AppStorage("runtime.manual.tls") private var manualRuntimeTLS: Bool = true
    @AppStorage("runtime.discovery.debugLogs") private var discoveryDebugLogsEnabled: Bool = false
    @AppStorage("canvas.debugStatusEnabled") private var canvasDebugStatusEnabled: Bool = false
    @State private var connectingRuntimeID: String?
    @State private var localIPAddress: String?
    @State private var lastLocationModeRaw: String = NexusLocationMode.off.rawValue
    @State private var runtimeToken: String = ""
    @State private var runtimePassword: String = ""
    @AppStorage("runtime.setupCode") private var setupCode: String = ""
    @State private var setupStatusText: String?
    @State private var manualRuntimePortText: String = ""
    @State private var runtimeExpanded: Bool = true
    @State private var selectedAgentPickerId: String = ""

    private let runtimeLogger = Logger(subsystem: "ai.nexus.ios", category: "RuntimeSettings")

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DisclosureGroup(isExpanded: self.$runtimeExpanded) {
                        if !self.isRuntimeConnected {
                            Text(
                                "1. Open Telegram and message your bot: /pair\n"
                                    + "2. Copy the setup code it returns\n"
                                    + "3. Paste here and tap Connect\n"
                                    + "4. Back in Telegram, run /pair approve")
                                .font(.footnote)
                                .foregroundStyle(.secondary)

                            if let warning = self.tailnetWarningText {
                                Text(warning)
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(.orange)
                            }

                            TextField("Paste setup code", text: self.$setupCode)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()

                            Button {
                                Task { await self.applySetupCodeAndConnect() }
                            } label: {
                                if self.connectingRuntimeID == "manual" {
                                    HStack(spacing: 8) {
                                        ProgressView()
                                            .progressViewStyle(.circular)
                                        Text("Connecting…")
                                    }
                                } else {
                                    Text("Connect with setup code")
                                }
                            }
                            .disabled(self.connectingRuntimeID != nil
                                || self.setupCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                            if let status = self.setupStatusLine {
                                Text(status)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        if self.isRuntimeConnected {
                            Picker("Bot", selection: self.$selectedAgentPickerId) {
                                Text("Default").tag("")
                                let defaultId = (self.appModel.runtimeDefaultAgentId ?? "")
                                    .trimmingCharacters(in: .whitespacesAndNewlines)
                                ForEach(self.appModel.runtimeAgents.filter { $0.id != defaultId }, id: \.id) { agent in
                                    let name = (agent.name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                                    Text(name.isEmpty ? agent.id : name).tag(agent.id)
                                }
                            }
                            Text("Controls which bot Chat and Talk speak to.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }

                        DisclosureGroup("Advanced") {
                        if self.appModel.runtimeServerName == nil {
                            LabeledContent("Discovery", value: self.runtimeController.discoveryStatusText)
                        }
                        LabeledContent("Status", value: self.appModel.runtimeStatusText)
                        Toggle("Auto-connect on launch", isOn: self.$runtimeAutoConnect)

                        if let serverName = self.appModel.runtimeServerName {
                            LabeledContent("Server", value: serverName)
                            if let addr = self.appModel.runtimeRemoteAddress {
                                let parts = Self.parseHostPort(from: addr)
                                let urlString = Self.httpURLString(host: parts?.host, port: parts?.port, fallback: addr)
                                LabeledContent("Address") {
                                    Text(urlString)
                                }
                                .contextMenu {
                                    Button {
                                        UIPasteboard.general.string = urlString
                                    } label: {
                                        Label("Copy URL", systemImage: "doc.on.doc")
                                    }

                                    if let parts {
                                        Button {
                                            UIPasteboard.general.string = parts.host
                                        } label: {
                                            Label("Copy Host", systemImage: "doc.on.doc")
                                        }

                                        Button {
                                            UIPasteboard.general.string = "\(parts.port)"
                                        } label: {
                                            Label("Copy Port", systemImage: "doc.on.doc")
                                        }
                                    }
                                }
                            }

                            Button("Disconnect", role: .destructive) {
                                self.appModel.disconnectRuntime()
                            }
                        } else {
                            self.runtimeList(showing: .all)
                        }

                        Toggle("Use Manual Runtime", isOn: self.$manualRuntimeEnabled)

                        TextField("Host", text: self.$manualRuntimeHost)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()

                        TextField("Port (optional)", text: self.manualPortBinding)
                            .keyboardType(.numberPad)

                        Toggle("Use TLS", isOn: self.$manualRuntimeTLS)

                        Button {
                            Task { await self.connectManual() }
                        } label: {
                            if self.connectingRuntimeID == "manual" {
                                HStack(spacing: 8) {
                                    ProgressView()
                                        .progressViewStyle(.circular)
                                    Text("Connecting…")
                                }
                            } else {
                                Text("Connect (Manual)")
                            }
                        }
                        .disabled(self.connectingRuntimeID != nil || self.manualRuntimeHost
                            .trimmingCharacters(in: .whitespacesAndNewlines)
                            .isEmpty || !self.manualPortIsValid)

                        Text(
                            "Use this when mDNS/Bonjour discovery is blocked. "
                                + "Leave port empty for 443 on tailnet DNS (TLS) or 18789 otherwise.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)

                        Toggle("Discovery Debug Logs", isOn: self.$discoveryDebugLogsEnabled)
                            .onChange(of: self.discoveryDebugLogsEnabled) { _, newValue in
                                self.runtimeController.setDiscoveryDebugLoggingEnabled(newValue)
                            }

                        NavigationLink("Discovery Logs") {
                            RuntimeDiscoveryDebugLogView()
                        }

                        Toggle("Debug Canvas Status", isOn: self.$canvasDebugStatusEnabled)

                        TextField("Runtime Token", text: self.$runtimeToken)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()

                        SecureField("Runtime Password", text: self.$runtimePassword)

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Debug")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(.secondary)
                            Text(self.runtimeDebugText())
                                .font(.system(size: 12, weight: .regular, design: .monospaced))
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10)
                                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                    }
                    } label: {
                        HStack(spacing: 10) {
                            Circle()
                                .fill(self.isRuntimeConnected ? Color.green : Color.secondary.opacity(0.35))
                                .frame(width: 10, height: 10)
                            Text("Runtime")
                            Spacer()
                            Text(self.runtimeSummaryText)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section("Device") {
                    DisclosureGroup("Features") {
                        Toggle("Talk Mode", isOn: self.$talkEnabled)
                            .onChange(of: self.talkEnabled) { _, newValue in
                                self.appModel.setTalkEnabled(newValue)
                            }
                        // Keep this separate so users can hide the side bubble without disabling Talk Mode.
                        Toggle("Show Talk Button", isOn: self.$talkButtonEnabled)

                        Toggle("Allow Camera", isOn: self.$cameraEnabled)
                        Text("Allows the runtime to request photos or short video clips (foreground only).")
                            .font(.footnote)
                            .foregroundStyle(.secondary)

                        Picker("Location Access", selection: self.$locationEnabledModeRaw) {
                            Text("Off").tag(NexusLocationMode.off.rawValue)
                            Text("While Using").tag(NexusLocationMode.whileUsing.rawValue)
                            Text("Always").tag(NexusLocationMode.always.rawValue)
                        }
                        .pickerStyle(.segmented)

                        Toggle("Precise Location", isOn: self.$locationPreciseEnabled)
                            .disabled(self.locationMode == .off)

                        Text("Always requires system permission and may prompt to open Settings.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)

                        Toggle("Prevent Sleep", isOn: self.$preventSleep)
                        Text("Keeps the screen awake while Nexus is open.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                    DisclosureGroup("Device Info") {
                        TextField("Name", text: self.$displayName)
                        Text(self.instanceId)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        LabeledContent("IP", value: self.localIPAddress ?? "—")
                            .contextMenu {
                                if let ip = self.localIPAddress {
                                    Button {
                                        UIPasteboard.general.string = ip
                                    } label: {
                                        Label("Copy", systemImage: "doc.on.doc")
                                    }
                                }
                            }
                        LabeledContent("Platform", value: self.platformString())
                        LabeledContent("Version", value: self.appVersion())
                        LabeledContent("Model", value: self.modelIdentifier())
                    }
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        self.dismiss()
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel("Close")
                }
            }
            .onAppear {
                self.localIPAddress = Self.primaryIPv4Address()
                self.lastLocationModeRaw = self.locationEnabledModeRaw
                self.syncManualPortText()
                let trimmedInstanceId = self.instanceId.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmedInstanceId.isEmpty {
                    self.runtimeToken = RuntimeSettingsStore.loadRuntimeToken(instanceId: trimmedInstanceId) ?? ""
                    self.runtimePassword = RuntimeSettingsStore.loadRuntimePassword(instanceId: trimmedInstanceId) ?? ""
                }
                // Keep setup front-and-center when disconnected; keep things compact once connected.
                self.runtimeExpanded = !self.isRuntimeConnected
                self.selectedAgentPickerId = self.appModel.selectedAgentId ?? ""
            }
            .onChange(of: self.selectedAgentPickerId) { _, newValue in
                let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                self.appModel.setSelectedAgentId(trimmed.isEmpty ? nil : trimmed)
            }
            .onChange(of: self.appModel.selectedAgentId ?? "") { _, newValue in
                if newValue != self.selectedAgentPickerId {
                    self.selectedAgentPickerId = newValue
                }
            }
            .onChange(of: self.preferredRuntimeStableID) { _, newValue in
                let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { return }
                RuntimeSettingsStore.savePreferredRuntimeStableID(trimmed)
            }
            .onChange(of: self.runtimeToken) { _, newValue in
                let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                let instanceId = self.instanceId.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !instanceId.isEmpty else { return }
                RuntimeSettingsStore.saveRuntimeToken(trimmed, instanceId: instanceId)
            }
            .onChange(of: self.runtimePassword) { _, newValue in
                let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                let instanceId = self.instanceId.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !instanceId.isEmpty else { return }
                RuntimeSettingsStore.saveRuntimePassword(trimmed, instanceId: instanceId)
            }
            .onChange(of: self.manualRuntimePort) { _, _ in
                self.syncManualPortText()
            }
            .onChange(of: self.appModel.runtimeServerName) { _, newValue in
                if newValue != nil {
                    self.setupCode = ""
                    self.setupStatusText = nil
                    return
                }
                if self.manualRuntimeEnabled {
                    self.setupStatusText = self.appModel.runtimeStatusText
                }
            }
            .onChange(of: self.appModel.runtimeStatusText) { _, newValue in
                guard self.manualRuntimeEnabled || self.connectingRuntimeID == "manual" else { return }
                let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { return }
                self.setupStatusText = trimmed
            }
            .onChange(of: self.locationEnabledModeRaw) { _, newValue in
                let previous = self.lastLocationModeRaw
                self.lastLocationModeRaw = newValue
                guard let mode = NexusLocationMode(rawValue: newValue) else { return }
                Task {
                    let granted = await self.appModel.requestLocationPermissions(mode: mode)
                    if !granted {
                        await MainActor.run {
                            self.locationEnabledModeRaw = previous
                            self.lastLocationModeRaw = previous
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func runtimeList(showing: RuntimeListMode) -> some View {
        if self.runtimeController.runtimes.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text("No runtimes found yet.")
                    .foregroundStyle(.secondary)
                Text("If your runtime is on another network, connect it and ensure DNS is working.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                if let lastKnown = RuntimeSettingsStore.loadLastRuntimeConnection() {
                    Button {
                        Task { await self.connectLastKnown() }
                    } label: {
                        self.lastKnownButtonLabel(host: lastKnown.host, port: lastKnown.port)
                    }
                    .disabled(self.connectingRuntimeID != nil)
                    .buttonStyle(.borderedProminent)
                    .tint(self.appModel.seamColor)
                }
            }
        } else {
            let connectedID = self.appModel.connectedRuntimeID
            let rows = self.runtimeController.runtimes.filter { runtime in
                let isConnected = runtime.stableID == connectedID
                switch showing {
                case .all:
                    return true
                case .availableOnly:
                    return !isConnected
                }
            }

            if rows.isEmpty, showing == .availableOnly {
                Text("No other runtimes found.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(rows) { runtime in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(runtime.name)
                            let detailLines = self.runtimeDetailLines(runtime)
                            ForEach(detailLines, id: \.self) { line in
                                Text(line)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Spacer()

                        Button {
                            Task { await self.connect(runtime) }
                        } label: {
                            if self.connectingRuntimeID == runtime.id {
                                ProgressView()
                                    .progressViewStyle(.circular)
                            } else {
                                Text("Connect")
                            }
                        }
                        .disabled(self.connectingRuntimeID != nil)
                    }
                }
            }
        }
    }

    private enum RuntimeListMode: Equatable {
        case all
        case availableOnly
    }

    private var isRuntimeConnected: Bool {
        let status = self.appModel.runtimeStatusText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if status.contains("connected") { return true }
        return self.appModel.runtimeServerName != nil && !status.contains("offline")
    }

    private var runtimeSummaryText: String {
        if let server = self.appModel.runtimeServerName, self.isRuntimeConnected {
            return server
        }
        let trimmed = self.appModel.runtimeStatusText.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "Not connected" : trimmed
    }

    private func platformString() -> String {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return "iOS \(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
    }

    private var locationMode: NexusLocationMode {
        NexusLocationMode(rawValue: self.locationEnabledModeRaw) ?? .off
    }

    private func appVersion() -> String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev"
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

    private func connect(_ runtime: RuntimeDiscoveryModel.DiscoveredRuntime) async {
        self.connectingRuntimeID = runtime.id
        self.manualRuntimeEnabled = false
        self.preferredRuntimeStableID = runtime.stableID
        RuntimeSettingsStore.savePreferredRuntimeStableID(runtime.stableID)
        self.lastDiscoveredRuntimeStableID = runtime.stableID
        RuntimeSettingsStore.saveLastDiscoveredRuntimeStableID(runtime.stableID)
        defer { self.connectingRuntimeID = nil }

        await self.runtimeController.connect(runtime)
    }

    private func connectLastKnown() async {
        self.connectingRuntimeID = "last-known"
        defer { self.connectingRuntimeID = nil }
        await self.runtimeController.connectLastKnown()
    }

    private func runtimeDebugText() -> String {
        var lines: [String] = [
            "runtime: \(self.appModel.runtimeStatusText)",
            "discovery: \(self.runtimeController.discoveryStatusText)",
        ]
        lines.append("server: \(self.appModel.runtimeServerName ?? "—")")
        lines.append("address: \(self.appModel.runtimeRemoteAddress ?? "—")")
        if let last = self.runtimeController.discoveryDebugLog.last?.message {
            lines.append("discovery log: \(last)")
        }
        return lines.joined(separator: "\n")
    }

    @ViewBuilder
    private func lastKnownButtonLabel(host: String, port: Int) -> some View {
        if self.connectingRuntimeID == "last-known" {
            HStack(spacing: 8) {
                ProgressView()
                    .progressViewStyle(.circular)
                Text("Connecting…")
            }
            .frame(maxWidth: .infinity)
        } else {
            HStack(spacing: 8) {
                Image(systemName: "bolt.horizontal.circle.fill")
                VStack(alignment: .leading, spacing: 2) {
                    Text("Connect last known")
                    Text("\(host):\(port)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var manualPortBinding: Binding<String> {
        Binding(
            get: { self.manualRuntimePortText },
            set: { newValue in
                let filtered = newValue.filter(\.isNumber)
                if self.manualRuntimePortText != filtered {
                    self.manualRuntimePortText = filtered
                }
                if filtered.isEmpty {
                    if self.manualRuntimePort != 0 {
                        self.manualRuntimePort = 0
                    }
                } else if let port = Int(filtered), self.manualRuntimePort != port {
                    self.manualRuntimePort = port
                }
            })
    }

    private var manualPortIsValid: Bool {
        if self.manualRuntimePortText.isEmpty { return true }
        return self.manualRuntimePort >= 1 && self.manualRuntimePort <= 65535
    }

    private func syncManualPortText() {
        if self.manualRuntimePort > 0 {
            let next = String(self.manualRuntimePort)
            if self.manualRuntimePortText != next {
                self.manualRuntimePortText = next
            }
        } else if !self.manualRuntimePortText.isEmpty {
            self.manualRuntimePortText = ""
        }
    }

    private struct SetupPayload: Codable {
        var url: String?
        var host: String?
        var port: Int?
        var tls: Bool?
        var token: String?
        var password: String?
    }

    private func applySetupCodeAndConnect() async {
        self.setupStatusText = nil
        guard self.applySetupCode() else { return }
        let host = self.manualRuntimeHost.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedPort = self.resolvedManualPort(host: host)
        let hasToken = !self.runtimeToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let hasPassword = !self.runtimePassword.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        RuntimeDiagnostics.log(
            "setup code applied host=\(host) port=\(resolvedPort ?? -1) tls=\(self.manualRuntimeTLS) token=\(hasToken) password=\(hasPassword)")
        guard let port = resolvedPort else {
            self.setupStatusText = "Failed: invalid port"
            return
        }
        let ok = await self.preflightRuntime(host: host, port: port, useTLS: self.manualRuntimeTLS)
        guard ok else { return }
        self.setupStatusText = "Setup code applied. Connecting…"
        await self.connectManual()
    }

    @discardableResult
    private func applySetupCode() -> Bool {
        let raw = self.setupCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else {
            self.setupStatusText = "Paste a setup code to continue."
            return false
        }

        guard let payload = self.decodeSetupPayload(raw: raw) else {
            self.setupStatusText = "Setup code not recognized."
            return false
        }

        if let urlString = payload.url, let url = URL(string: urlString) {
            self.applySetupURL(url)
        } else if let host = payload.host, !host.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            self.manualRuntimeHost = host.trimmingCharacters(in: .whitespacesAndNewlines)
            if let port = payload.port {
                self.manualRuntimePort = port
                self.manualRuntimePortText = String(port)
            } else {
                self.manualRuntimePort = 0
                self.manualRuntimePortText = ""
            }
            if let tls = payload.tls {
                self.manualRuntimeTLS = tls
            }
        } else if let url = URL(string: raw), url.scheme != nil {
            self.applySetupURL(url)
        } else {
            self.setupStatusText = "Setup code missing URL or host."
            return false
        }

        let trimmedInstanceId = self.instanceId.trimmingCharacters(in: .whitespacesAndNewlines)
        if let token = payload.token, !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let trimmedToken = token.trimmingCharacters(in: .whitespacesAndNewlines)
            self.runtimeToken = trimmedToken
            if !trimmedInstanceId.isEmpty {
                RuntimeSettingsStore.saveRuntimeToken(trimmedToken, instanceId: trimmedInstanceId)
            }
        }
        if let password = payload.password, !password.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let trimmedPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)
            self.runtimePassword = trimmedPassword
            if !trimmedInstanceId.isEmpty {
                RuntimeSettingsStore.saveRuntimePassword(trimmedPassword, instanceId: trimmedInstanceId)
            }
        }

        return true
    }

    private func applySetupURL(_ url: URL) {
        guard let host = url.host, !host.isEmpty else { return }
        self.manualRuntimeHost = host
        if let port = url.port {
            self.manualRuntimePort = port
            self.manualRuntimePortText = String(port)
        } else {
            self.manualRuntimePort = 0
            self.manualRuntimePortText = ""
        }
        let scheme = (url.scheme ?? "").lowercased()
        if scheme == "wss" || scheme == "https" {
            self.manualRuntimeTLS = true
        } else if scheme == "ws" || scheme == "http" {
            self.manualRuntimeTLS = false
        }
    }

    private func resolvedManualPort(host: String) -> Int? {
        if self.manualRuntimePort > 0 {
            return self.manualRuntimePort <= 65535 ? self.manualRuntimePort : nil
        }
        let trimmed = host.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if self.manualRuntimeTLS && trimmed.lowercased().hasSuffix(".ts.net") {
            return 443
        }
        return 18789
    }

    private func preflightRuntime(host: String, port: Int, useTLS: Bool) async -> Bool {
        let trimmed = host.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }

        if Self.isTailnetHostOrIP(trimmed) && !Self.hasTailnetIPv4() {
            let msg = "Tailscale is off on this iPhone. Turn it on, then try again."
            self.setupStatusText = msg
            RuntimeDiagnostics.log("preflight fail: tailnet missing host=\(trimmed)")
            self.runtimeLogger.warning("\(msg, privacy: .public)")
            return false
        }

        self.setupStatusText = "Checking runtime reachability…"
        let ok = await Self.probeTCP(host: trimmed, port: port, timeoutSeconds: 3)
        if !ok {
            let msg = "Can't reach runtime at \(trimmed):\(port). Check Tailscale or LAN."
            self.setupStatusText = msg
            RuntimeDiagnostics.log("preflight fail: unreachable host=\(trimmed) port=\(port)")
            self.runtimeLogger.warning("\(msg, privacy: .public)")
            return false
        }
        RuntimeDiagnostics.log("preflight ok host=\(trimmed) port=\(port) tls=\(useTLS)")
        return true
    }

    private static func probeTCP(host: String, port: Int, timeoutSeconds: Double) async -> Bool {
        guard let nwPort = NWEndpoint.Port(rawValue: UInt16(port)) else { return false }
        let endpointHost = NWEndpoint.Host(host)
        let connection = NWConnection(host: endpointHost, port: nwPort, using: .tcp)
        return await withCheckedContinuation { cont in
            let queue = DispatchQueue(label: "runtime.preflight")
            let finished = OSAllocatedUnfairLock(initialState: false)
            let finish: @Sendable (Bool) -> Void = { ok in
                let shouldResume = finished.withLock { flag -> Bool in
                    if flag { return false }
                    flag = true
                    return true
                }
                guard shouldResume else { return }
                connection.cancel()
                cont.resume(returning: ok)
            }
            connection.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    finish(true)
                case .failed, .cancelled:
                    finish(false)
                default:
                    break
                }
            }
            connection.start(queue: queue)
            queue.asyncAfter(deadline: .now() + timeoutSeconds) {
                finish(false)
            }
        }
    }

    private func decodeSetupPayload(raw: String) -> SetupPayload? {
        if let payload = decodeSetupPayloadFromJSON(raw) {
            return payload
        }
        if let decoded = decodeBase64Payload(raw),
           let payload = decodeSetupPayloadFromJSON(decoded)
        {
            return payload
        }
        return nil
    }

    private func decodeSetupPayloadFromJSON(_ json: String) -> SetupPayload? {
        guard let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(SetupPayload.self, from: data)
    }

    private func decodeBase64Payload(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let normalized = trimmed
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let padding = normalized.count % 4
        let padded = padding == 0 ? normalized : normalized + String(repeating: "=", count: 4 - padding)
        guard let data = Data(base64Encoded: padded) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func connectManual() async {
        let host = self.manualRuntimeHost.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !host.isEmpty else {
            self.setupStatusText = "Failed: host required"
            return
        }
        guard self.manualPortIsValid else {
            self.setupStatusText = "Failed: invalid port"
            return
        }

        self.connectingRuntimeID = "manual"
        self.manualRuntimeEnabled = true
        defer { self.connectingRuntimeID = nil }

        RuntimeDiagnostics.log(
            "connect manual host=\(host) port=\(self.manualRuntimePort) tls=\(self.manualRuntimeTLS)")
        await self.runtimeController.connectManual(
            host: host,
            port: self.manualRuntimePort,
            useTLS: self.manualRuntimeTLS)
    }

    private var setupStatusLine: String? {
        let trimmedSetup = self.setupStatusText?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let runtimeStatus = self.appModel.runtimeStatusText.trimmingCharacters(in: .whitespacesAndNewlines)
        if let friendly = self.friendlyRuntimeMessage(from: runtimeStatus) { return friendly }
        if let friendly = self.friendlyRuntimeMessage(from: trimmedSetup) { return friendly }
        if !trimmedSetup.isEmpty { return trimmedSetup }
        if runtimeStatus.isEmpty || runtimeStatus == "Offline" { return nil }
        return runtimeStatus
    }

    private var tailnetWarningText: String? {
        let host = self.manualRuntimeHost.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !host.isEmpty else { return nil }
        guard Self.isTailnetHostOrIP(host) else { return nil }
        guard !Self.hasTailnetIPv4() else { return nil }
        return "This runtime is on your tailnet. Turn on Tailscale on this iPhone, then tap Connect."
    }

    private func friendlyRuntimeMessage(from raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let lower = trimmed.lowercased()
        if lower.contains("pairing required") {
            return "Pairing required. Go back to Telegram and run /pair approve, then tap Connect again."
        }
        if lower.contains("device nonce required") || lower.contains("device nonce mismatch") {
            return "Secure handshake failed. Make sure Tailscale is connected, then tap Connect again."
        }
        if lower.contains("device signature expired") || lower.contains("device signature invalid") {
            return "Secure handshake failed. Check that your iPhone time is correct, then tap Connect again."
        }
        if lower.contains("connect timed out") || lower.contains("timed out") {
            return "Connection timed out. Make sure Tailscale is connected, then try again."
        }
        if lower.contains("unauthorized role") {
            return "Connected, but some controls are restricted for nodes. This is expected."
        }
        return nil
    }

    private static func primaryIPv4Address() -> String? {
        var addrList: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&addrList) == 0, let first = addrList else { return nil }
        defer { freeifaddrs(addrList) }

        var fallback: String?
        var en0: String?

        for ptr in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let flags = Int32(ptr.pointee.ifa_flags)
            let isUp = (flags & IFF_UP) != 0
            let isLoopback = (flags & IFF_LOOPBACK) != 0
            let name = String(cString: ptr.pointee.ifa_name)
            let family = ptr.pointee.ifa_addr.pointee.sa_family
            if !isUp || isLoopback || family != UInt8(AF_INET) { continue }

            var addr = ptr.pointee.ifa_addr.pointee
            var buffer = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            let result = getnameinfo(
                &addr,
                socklen_t(ptr.pointee.ifa_addr.pointee.sa_len),
                &buffer,
                socklen_t(buffer.count),
                nil,
                0,
                NI_NUMERICHOST)
            guard result == 0 else { continue }
            let len = buffer.prefix { $0 != 0 }
            let bytes = len.map { UInt8(bitPattern: $0) }
            guard let ip = String(bytes: bytes, encoding: .utf8) else { continue }

            if name == "en0" { en0 = ip; break }
            if fallback == nil { fallback = ip }
        }

        return en0 ?? fallback
    }

    private static func hasTailnetIPv4() -> Bool {
        var addrList: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&addrList) == 0, let first = addrList else { return false }
        defer { freeifaddrs(addrList) }

        for ptr in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let flags = Int32(ptr.pointee.ifa_flags)
            let isUp = (flags & IFF_UP) != 0
            let isLoopback = (flags & IFF_LOOPBACK) != 0
            let family = ptr.pointee.ifa_addr.pointee.sa_family
            if !isUp || isLoopback || family != UInt8(AF_INET) { continue }

            var addr = ptr.pointee.ifa_addr.pointee
            var buffer = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            let result = getnameinfo(
                &addr,
                socklen_t(ptr.pointee.ifa_addr.pointee.sa_len),
                &buffer,
                socklen_t(buffer.count),
                nil,
                0,
                NI_NUMERICHOST)
            guard result == 0 else { continue }
            let len = buffer.prefix { $0 != 0 }
            let bytes = len.map { UInt8(bitPattern: $0) }
            guard let ip = String(bytes: bytes, encoding: .utf8) else { continue }
            if self.isTailnetIPv4(ip) { return true }
        }

        return false
    }

    private static func isTailnetHostOrIP(_ host: String) -> Bool {
        let trimmed = host.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if trimmed.hasSuffix(".ts.net") || trimmed.hasSuffix(".ts.net.") {
            return true
        }
        return self.isTailnetIPv4(trimmed)
    }

    private static func isTailnetIPv4(_ ip: String) -> Bool {
        let parts = ip.split(separator: ".")
        guard parts.count == 4 else { return false }
        let octets = parts.compactMap { Int($0) }
        guard octets.count == 4 else { return false }
        let a = octets[0]
        let b = octets[1]
        guard (0...255).contains(a), (0...255).contains(b) else { return false }
        return a == 100 && b >= 64 && b <= 127
    }

    private static func parseHostPort(from address: String) -> SettingsHostPort? {
        SettingsNetworkingHelpers.parseHostPort(from: address)
    }

    private static func httpURLString(host: String?, port: Int?, fallback: String) -> String {
        SettingsNetworkingHelpers.httpURLString(host: host, port: port, fallback: fallback)
    }

    private func runtimeDetailLines(_ runtime: RuntimeDiscoveryModel.DiscoveredRuntime) -> [String] {
        var lines: [String] = []
        if let lanHost = runtime.lanHost { lines.append("LAN: \(lanHost)") }
        if let tailnet = runtime.tailnetDns { lines.append("Tailnet: \(tailnet)") }

        let runtimePort = runtime.runtimePort
        let canvasPort = runtime.canvasPort
        if runtimePort != nil || canvasPort != nil {
            let gw = runtimePort.map(String.init) ?? "—"
            let canvas = canvasPort.map(String.init) ?? "—"
            lines.append("Ports: runtime \(gw) · canvas \(canvas)")
        }

        if lines.isEmpty {
            lines.append(runtime.debugID)
        }

        return lines
    }
}
