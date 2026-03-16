import SwiftUI
import UIKit

struct RootCanvas: View {
    @Environment(NodeAppModel.self) private var appModel
    @Environment(\.colorScheme) private var systemColorScheme
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("screen.preventSleep") private var preventSleep: Bool = true
    @AppStorage("canvas.debugStatusEnabled") private var canvasDebugStatusEnabled: Bool = false
    @AppStorage("runtime.onboardingComplete") private var onboardingComplete: Bool = false
    @AppStorage("runtime.hasConnectedOnce") private var hasConnectedOnce: Bool = false
    @AppStorage("runtime.preferredStableID") private var preferredRuntimeStableID: String = ""
    @AppStorage("runtime.manual.enabled") private var manualRuntimeEnabled: Bool = false
    @AppStorage("runtime.manual.host") private var manualRuntimeHost: String = ""
    @State private var presentedSheet: PresentedSheet?
    @State private var didAutoOpenSettings: Bool = false

    private enum PresentedSheet: Identifiable {
        case settings
        case chat

        var id: Int {
            switch self {
            case .settings: 0
            case .chat: 1
            }
        }
    }

    var body: some View {
        ZStack {
            CanvasContent(
                systemColorScheme: self.systemColorScheme,
                runtimeStatus: self.runtimeStatus,
                cameraHUDText: self.appModel.cameraHUDText,
                cameraHUDKind: self.appModel.cameraHUDKind,
                openChat: {
                    self.presentedSheet = .chat
                },
                openSettings: {
                    self.presentedSheet = .settings
                })
                .preferredColorScheme(.dark)

            if self.appModel.cameraFlashNonce != 0 {
                CameraFlashOverlay(nonce: self.appModel.cameraFlashNonce)
            }
        }
        .sheet(item: self.$presentedSheet) { sheet in
            switch sheet {
            case .settings:
                SettingsTab()
            case .chat:
                ChatSheet(
                    runtime: self.appModel.operatorSession,
                    sessionKey: self.appModel.mainSessionKey,
                    agentName: self.appModel.activeAgentName,
                    userAccent: self.appModel.seamColor)
            }
        }
        .onAppear { self.updateIdleTimer() }
        .onAppear { self.maybeAutoOpenSettings() }
        .onChange(of: self.preventSleep) { _, _ in self.updateIdleTimer() }
        .onChange(of: self.scenePhase) { _, _ in self.updateIdleTimer() }
        .onAppear { self.updateCanvasDebugStatus() }
        .onChange(of: self.canvasDebugStatusEnabled) { _, _ in self.updateCanvasDebugStatus() }
        .onChange(of: self.appModel.runtimeStatusText) { _, _ in self.updateCanvasDebugStatus() }
        .onChange(of: self.appModel.runtimeServerName) { _, _ in self.updateCanvasDebugStatus() }
        .onChange(of: self.appModel.runtimeRemoteAddress) { _, _ in self.updateCanvasDebugStatus() }
        .onChange(of: self.appModel.runtimeServerName) { _, newValue in
            if newValue != nil {
                self.onboardingComplete = true
                self.hasConnectedOnce = true
            }
            self.maybeAutoOpenSettings()
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }

    private var runtimeStatus: StatusPill.RuntimeState {
        if self.appModel.runtimeServerName != nil { return .connected }

        let text = self.appModel.runtimeStatusText.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.localizedCaseInsensitiveContains("connecting") ||
            text.localizedCaseInsensitiveContains("reconnecting")
        {
            return .connecting
        }

        if text.localizedCaseInsensitiveContains("error") {
            return .error
        }

        return .disconnected
    }

    private func updateIdleTimer() {
        UIApplication.shared.isIdleTimerDisabled = (self.scenePhase == .active && self.preventSleep)
    }

    private func updateCanvasDebugStatus() {
        self.appModel.screen.setDebugStatusEnabled(self.canvasDebugStatusEnabled)
        guard self.canvasDebugStatusEnabled else { return }
        let title = self.appModel.runtimeStatusText.trimmingCharacters(in: .whitespacesAndNewlines)
        let subtitle = self.appModel.runtimeServerName ?? self.appModel.runtimeRemoteAddress
        self.appModel.screen.updateDebugStatus(title: title, subtitle: subtitle)
    }

    private func shouldAutoOpenSettings() -> Bool {
        if self.appModel.runtimeServerName != nil { return false }
        if !self.hasConnectedOnce { return true }
        if !self.onboardingComplete { return true }
        return !self.hasExistingRuntimeConfig()
    }

    private func hasExistingRuntimeConfig() -> Bool {
        if RuntimeSettingsStore.loadLastRuntimeConnection() != nil { return true }
        let manualHost = self.manualRuntimeHost.trimmingCharacters(in: .whitespacesAndNewlines)
        return self.manualRuntimeEnabled && !manualHost.isEmpty
    }

    private func maybeAutoOpenSettings() {
        guard !self.didAutoOpenSettings else { return }
        guard self.shouldAutoOpenSettings() else { return }
        self.didAutoOpenSettings = true
        self.presentedSheet = .settings
    }
}

private struct CanvasContent: View {
    @Environment(NodeAppModel.self) private var appModel
    @AppStorage("talk.enabled") private var talkEnabled: Bool = false
    @AppStorage("talk.button.enabled") private var talkButtonEnabled: Bool = true
    @State private var showRuntimeActions: Bool = false
    var systemColorScheme: ColorScheme
    var runtimeStatus: StatusPill.RuntimeState
    var cameraHUDText: String?
    var cameraHUDKind: NodeAppModel.CameraHUDKind?
    var openChat: () -> Void
    var openSettings: () -> Void

    private var brightenButtons: Bool { self.systemColorScheme == .light }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            ScreenTab()

            VStack(spacing: 10) {
                OverlayButton(systemImage: "text.bubble.fill", brighten: self.brightenButtons) {
                    self.openChat()
                }
                .accessibilityLabel("Chat")

                if self.talkButtonEnabled {
                    // Talk mode lives on a side bubble so it doesn't get buried in settings.
                    OverlayButton(
                        systemImage: self.appModel.talkMode.isEnabled ? "waveform.circle.fill" : "waveform.circle",
                        brighten: self.brightenButtons,
                        tint: self.appModel.seamColor,
                        isActive: self.appModel.talkMode.isEnabled)
                    {
                        let next = !self.appModel.talkMode.isEnabled
                        self.talkEnabled = next
                        self.appModel.setTalkEnabled(next)
                    }
                    .accessibilityLabel("Talk Mode")
                }

                OverlayButton(systemImage: "gearshape.fill", brighten: self.brightenButtons) {
                    self.openSettings()
                }
                .accessibilityLabel("Settings")
            }
            .padding(.top, 10)
            .padding(.trailing, 10)
        }
        .overlay(alignment: .center) {
            if self.appModel.talkMode.isEnabled {
                TalkOrbOverlay()
                    .transition(.opacity)
            }
        }
        .overlay(alignment: .topLeading) {
            StatusPill(
                runtime: self.runtimeStatus,
                activity: self.statusActivity,
                brighten: self.brightenButtons,
                onTap: {
                    if self.runtimeStatus == .connected {
                        self.showRuntimeActions = true
                    } else {
                        self.openSettings()
                    }
                })
                .padding(.leading, 10)
                .safeAreaPadding(.top, 10)
        }
        .confirmationDialog(
            "Runtime",
            isPresented: self.$showRuntimeActions,
            titleVisibility: .visible)
        {
            Button("Disconnect", role: .destructive) {
                self.appModel.disconnectRuntime()
            }
            Button("Open Settings") {
                self.openSettings()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Disconnect from the runtime?")
        }
    }

    private var statusActivity: StatusPill.Activity? {
        // Status pill owns transient activity state so it doesn't overlap the connection indicator.
        if self.appModel.isBackgrounded {
            return StatusPill.Activity(
                title: "Foreground required",
                systemImage: "exclamationmark.triangle.fill",
                tint: .orange)
        }

        let runtimeStatus = self.appModel.runtimeStatusText.trimmingCharacters(in: .whitespacesAndNewlines)
        let runtimeLower = runtimeStatus.lowercased()
        if runtimeLower.contains("repair") {
            return StatusPill.Activity(title: "Repairing…", systemImage: "wrench.and.screwdriver", tint: .orange)
        }
        if runtimeLower.contains("approval") || runtimeLower.contains("pairing") {
            return StatusPill.Activity(title: "Approval pending", systemImage: "person.crop.circle.badge.clock")
        }
        // Avoid duplicating the primary runtime status ("Connecting…") in the activity slot.

        if self.appModel.screenRecordActive {
            return StatusPill.Activity(title: "Recording screen…", systemImage: "record.circle.fill", tint: .red)
        }

        if let cameraHUDText, !cameraHUDText.isEmpty, let cameraHUDKind {
            let systemImage: String
            let tint: Color?
            switch cameraHUDKind {
            case .photo:
                systemImage = "camera.fill"
                tint = nil
            case .recording:
                systemImage = "video.fill"
                tint = .red
            case .success:
                systemImage = "checkmark.circle.fill"
                tint = .green
            case .error:
                systemImage = "exclamationmark.triangle.fill"
                tint = .red
            }
            return StatusPill.Activity(title: cameraHUDText, systemImage: systemImage, tint: tint)
        }

        return nil
    }
}

private struct OverlayButton: View {
    let systemImage: String
    let brighten: Bool
    var tint: Color?
    var isActive: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: self.action) {
            Image(systemName: self.systemImage)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(self.isActive ? (self.tint ?? .primary) : .primary)
                .padding(10)
                .background {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(.ultraThinMaterial)
                        .overlay {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(
                                    LinearGradient(
                                        colors: [
                                            .white.opacity(self.brighten ? 0.26 : 0.18),
                                            .white.opacity(self.brighten ? 0.08 : 0.04),
                                            .clear,
                                        ],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing))
                                .blendMode(.overlay)
                        }
                        .overlay {
                            if let tint {
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(
                                        LinearGradient(
                                            colors: [
                                                tint.opacity(self.isActive ? 0.22 : 0.14),
                                                tint.opacity(self.isActive ? 0.10 : 0.06),
                                                .clear,
                                            ],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing))
                                    .blendMode(.overlay)
                            }
                        }
                        .overlay {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .strokeBorder(
                                    (self.tint ?? .white).opacity(self.isActive ? 0.34 : (self.brighten ? 0.24 : 0.18)),
                                    lineWidth: self.isActive ? 0.7 : 0.5)
                        }
                        .shadow(color: .black.opacity(0.35), radius: 12, y: 6)
                }
        }
        .buttonStyle(.plain)
    }
}

private struct CameraFlashOverlay: View {
    var nonce: Int

    @State private var opacity: CGFloat = 0
    @State private var task: Task<Void, Never>?

    var body: some View {
        Color.white
            .opacity(self.opacity)
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .onChange(of: self.nonce) { _, _ in
                self.task?.cancel()
                self.task = Task { @MainActor in
                    withAnimation(.easeOut(duration: 0.08)) {
                        self.opacity = 0.85
                    }
                    try? await Task.sleep(nanoseconds: 110_000_000)
                    withAnimation(.easeOut(duration: 0.32)) {
                        self.opacity = 0
                    }
                }
            }
    }
}
