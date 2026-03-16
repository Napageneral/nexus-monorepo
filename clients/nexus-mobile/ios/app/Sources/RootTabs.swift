import SwiftUI

struct RootTabs: View {
    @Environment(NodeAppModel.self) private var appModel
    @State private var selectedTab: Int = 0
    @State private var showRuntimeActions: Bool = false

    var body: some View {
        TabView(selection: self.$selectedTab) {
            ScreenTab()
                .tabItem { Label("Screen", systemImage: "rectangle.and.hand.point.up.left") }
                .tag(0)

            SettingsTab()
                .tabItem { Label("Settings", systemImage: "gearshape") }
                .tag(1)
        }
        .overlay(alignment: .topLeading) {
            StatusPill(
                runtime: self.runtimeStatus,
                activity: self.statusActivity,
                onTap: {
                    if self.runtimeStatus == .connected {
                        self.showRuntimeActions = true
                    } else {
                        self.selectedTab = 2
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
                self.selectedTab = 2
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Disconnect from the runtime?")
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

    private var statusActivity: StatusPill.Activity? {
        // Keep the top pill consistent across tabs (camera + voice wake + pairing states).
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

        if let cameraHUDText = self.appModel.cameraHUDText,
           let cameraHUDKind = self.appModel.cameraHUDKind,
           !cameraHUDText.isEmpty
        {
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
