import Foundation
import os

enum RuntimeSettingsStore {
    private static let runtimeService = "ai.nexus.runtime"
    private static let nodeService = "ai.nexus.node"

    private static let instanceIdDefaultsKey = "node.instanceId"
    private static let preferredRuntimeStableIDDefaultsKey = "runtime.preferredStableID"
    private static let lastDiscoveredRuntimeStableIDDefaultsKey = "runtime.lastDiscoveredStableID"
    private static let manualEnabledDefaultsKey = "runtime.manual.enabled"
    private static let manualHostDefaultsKey = "runtime.manual.host"
    private static let manualPortDefaultsKey = "runtime.manual.port"
    private static let manualTlsDefaultsKey = "runtime.manual.tls"
    private static let discoveryDebugLogsDefaultsKey = "runtime.discovery.debugLogs"
    private static let lastRuntimeHostDefaultsKey = "runtime.last.host"
    private static let lastRuntimePortDefaultsKey = "runtime.last.port"
    private static let lastRuntimeTlsDefaultsKey = "runtime.last.tls"
    private static let lastRuntimeStableIDDefaultsKey = "runtime.last.stableID"
    private static let clientIdOverrideDefaultsPrefix = "runtime.clientIdOverride."
    private static let selectedAgentDefaultsPrefix = "runtime.selectedAgentId."

    private static let instanceIdAccount = "instanceId"
    private static let preferredRuntimeStableIDAccount = "preferredStableID"
    private static let lastDiscoveredRuntimeStableIDAccount = "lastDiscoveredStableID"

    static func bootstrapPersistence() {
        self.ensureStableInstanceID()
        self.ensurePreferredRuntimeStableID()
        self.ensureLastDiscoveredRuntimeStableID()
    }

    static func loadStableInstanceID() -> String? {
        if let value = KeychainStore.loadString(service: self.nodeService, account: self.instanceIdAccount)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
            !value.isEmpty
        {
            return value
        }

        return nil
    }

    static func saveStableInstanceID(_ instanceId: String) {
        _ = KeychainStore.saveString(instanceId, service: self.nodeService, account: self.instanceIdAccount)
    }

    static func loadPreferredRuntimeStableID() -> String? {
        if let value = KeychainStore.loadString(
            service: self.runtimeService,
            account: self.preferredRuntimeStableIDAccount
        )?.trimmingCharacters(in: .whitespacesAndNewlines),
            !value.isEmpty
        {
            return value
        }

        return nil
    }

    static func savePreferredRuntimeStableID(_ stableID: String) {
        _ = KeychainStore.saveString(
            stableID,
            service: self.runtimeService,
            account: self.preferredRuntimeStableIDAccount)
    }

    static func loadLastDiscoveredRuntimeStableID() -> String? {
        if let value = KeychainStore.loadString(
            service: self.runtimeService,
            account: self.lastDiscoveredRuntimeStableIDAccount
        )?.trimmingCharacters(in: .whitespacesAndNewlines),
            !value.isEmpty
        {
            return value
        }

        return nil
    }

    static func saveLastDiscoveredRuntimeStableID(_ stableID: String) {
        _ = KeychainStore.saveString(
            stableID,
            service: self.runtimeService,
            account: self.lastDiscoveredRuntimeStableIDAccount)
    }

    static func loadRuntimeToken(instanceId: String) -> String? {
        let account = self.runtimeTokenAccount(instanceId: instanceId)
        let token = KeychainStore.loadString(service: self.runtimeService, account: account)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if token?.isEmpty == false { return token }
        return nil
    }

    static func saveRuntimeToken(_ token: String, instanceId: String) {
        _ = KeychainStore.saveString(
            token,
            service: self.runtimeService,
            account: self.runtimeTokenAccount(instanceId: instanceId))
    }

    static func loadRuntimePassword(instanceId: String) -> String? {
        KeychainStore.loadString(
            service: self.runtimeService,
            account: self.runtimePasswordAccount(instanceId: instanceId))?
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func saveRuntimePassword(_ password: String, instanceId: String) {
        _ = KeychainStore.saveString(
            password,
            service: self.runtimeService,
            account: self.runtimePasswordAccount(instanceId: instanceId))
    }

    static func saveLastRuntimeConnection(host: String, port: Int, useTLS: Bool, stableID: String) {
        let defaults = UserDefaults.standard
        defaults.set(host, forKey: self.lastRuntimeHostDefaultsKey)
        defaults.set(port, forKey: self.lastRuntimePortDefaultsKey)
        defaults.set(useTLS, forKey: self.lastRuntimeTlsDefaultsKey)
        defaults.set(stableID, forKey: self.lastRuntimeStableIDDefaultsKey)
    }

    static func loadLastRuntimeConnection() -> (host: String, port: Int, useTLS: Bool, stableID: String)? {
        let defaults = UserDefaults.standard
        let host = defaults.string(forKey: self.lastRuntimeHostDefaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let port = defaults.integer(forKey: self.lastRuntimePortDefaultsKey)
        let useTLS = defaults.bool(forKey: self.lastRuntimeTlsDefaultsKey)
        let stableID = defaults.string(forKey: self.lastRuntimeStableIDDefaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        guard !host.isEmpty, port > 0, port <= 65535, !stableID.isEmpty else { return nil }
        return (host: host, port: port, useTLS: useTLS, stableID: stableID)
    }

    static func loadRuntimeClientIdOverride(stableID: String) -> String? {
        let trimmedID = stableID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedID.isEmpty else { return nil }
        let key = self.clientIdOverrideDefaultsPrefix + trimmedID
        let value = UserDefaults.standard.string(forKey: key)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if value?.isEmpty == false { return value }
        return nil
    }

    static func saveRuntimeClientIdOverride(stableID: String, clientId: String?) {
        let trimmedID = stableID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedID.isEmpty else { return }
        let key = self.clientIdOverrideDefaultsPrefix + trimmedID
        let trimmedClientId = clientId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if trimmedClientId.isEmpty {
            UserDefaults.standard.removeObject(forKey: key)
        } else {
            UserDefaults.standard.set(trimmedClientId, forKey: key)
        }
    }

    static func loadRuntimeSelectedAgentId(stableID: String) -> String? {
        let trimmedID = stableID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedID.isEmpty else { return nil }
        let key = self.selectedAgentDefaultsPrefix + trimmedID
        let value = UserDefaults.standard.string(forKey: key)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if value?.isEmpty == false { return value }
        return nil
    }

    static func saveRuntimeSelectedAgentId(stableID: String, agentId: String?) {
        let trimmedID = stableID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedID.isEmpty else { return }
        let key = self.selectedAgentDefaultsPrefix + trimmedID
        let trimmedAgentId = agentId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if trimmedAgentId.isEmpty {
            UserDefaults.standard.removeObject(forKey: key)
        } else {
            UserDefaults.standard.set(trimmedAgentId, forKey: key)
        }
    }

    private static func runtimeTokenAccount(instanceId: String) -> String {
        "runtime-token.\(instanceId)"
    }

    private static func runtimePasswordAccount(instanceId: String) -> String {
        "runtime-password.\(instanceId)"
    }

    private static func ensureStableInstanceID() {
        let defaults = UserDefaults.standard

        if let existing = defaults.string(forKey: self.instanceIdDefaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
            !existing.isEmpty
        {
            if self.loadStableInstanceID() == nil {
                self.saveStableInstanceID(existing)
            }
            return
        }

        if let stored = self.loadStableInstanceID(), !stored.isEmpty {
            defaults.set(stored, forKey: self.instanceIdDefaultsKey)
            return
        }

        let fresh = UUID().uuidString
        self.saveStableInstanceID(fresh)
        defaults.set(fresh, forKey: self.instanceIdDefaultsKey)
    }

    private static func ensurePreferredRuntimeStableID() {
        let defaults = UserDefaults.standard

        if let existing = defaults.string(forKey: self.preferredRuntimeStableIDDefaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
            !existing.isEmpty
        {
            if self.loadPreferredRuntimeStableID() == nil {
                self.savePreferredRuntimeStableID(existing)
            }
            return
        }

        if let stored = self.loadPreferredRuntimeStableID(), !stored.isEmpty {
            defaults.set(stored, forKey: self.preferredRuntimeStableIDDefaultsKey)
        }
    }

    private static func ensureLastDiscoveredRuntimeStableID() {
        let defaults = UserDefaults.standard

        if let existing = defaults.string(forKey: self.lastDiscoveredRuntimeStableIDDefaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
            !existing.isEmpty
        {
            if self.loadLastDiscoveredRuntimeStableID() == nil {
                self.saveLastDiscoveredRuntimeStableID(existing)
            }
            return
        }

        if let stored = self.loadLastDiscoveredRuntimeStableID(), !stored.isEmpty {
            defaults.set(stored, forKey: self.lastDiscoveredRuntimeStableIDDefaultsKey)
        }
    }

}

enum RuntimeDiagnostics {
    private static let logger = Logger(subsystem: "ai.nexus.ios", category: "RuntimeDiag")
    private static let queue = DispatchQueue(label: "ai.nexus.runtime.diagnostics")
    private static let maxLogBytes: Int64 = 512 * 1024
    private static let keepLogBytes: Int64 = 256 * 1024
    private static let logSizeCheckEveryWrites = 50
    nonisolated(unsafe) private static var logWritesSinceCheck = 0
    private static var fileURL: URL? {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?
            .appendingPathComponent("nexus-runtime.log")
    }

    private static func truncateLogIfNeeded(url: URL) {
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
              let sizeNumber = attrs[.size] as? NSNumber
        else { return }
        let size = sizeNumber.int64Value
        guard size > self.maxLogBytes else { return }

        do {
            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }

            let start = max(Int64(0), size - self.keepLogBytes)
            try handle.seek(toOffset: UInt64(start))
            var tail = try handle.readToEnd() ?? Data()

            // If we truncated mid-line, drop the first partial line so logs remain readable.
            if start > 0, let nl = tail.firstIndex(of: 10) {
                let next = tail.index(after: nl)
                if next < tail.endIndex {
                    tail = tail.suffix(from: next)
                } else {
                    tail = Data()
                }
            }

            try tail.write(to: url, options: .atomic)
        } catch {
            // Best-effort only.
        }
    }

    private static func appendToLog(url: URL, data: Data) {
        if FileManager.default.fileExists(atPath: url.path) {
            if let handle = try? FileHandle(forWritingTo: url) {
                defer { try? handle.close() }
                _ = try? handle.seekToEnd()
                try? handle.write(contentsOf: data)
            }
        } else {
            try? data.write(to: url, options: .atomic)
        }
    }

    static func bootstrap() {
        guard let url = fileURL else { return }
        queue.async {
            self.truncateLogIfNeeded(url: url)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let timestamp = formatter.string(from: Date())
            let line = "[\(timestamp)] runtime diagnostics started\n"
            if let data = line.data(using: .utf8) {
                self.appendToLog(url: url, data: data)
            }
        }
    }

    static func log(_ message: String) {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let timestamp = formatter.string(from: Date())
        let line = "[\(timestamp)] \(message)"
        logger.info("\(line, privacy: .public)")

        guard let url = fileURL else { return }
        queue.async {
            self.logWritesSinceCheck += 1
            if self.logWritesSinceCheck >= self.logSizeCheckEveryWrites {
                self.logWritesSinceCheck = 0
                self.truncateLogIfNeeded(url: url)
            }
            let entry = line + "\n"
            if let data = entry.data(using: .utf8) {
                self.appendToLog(url: url, data: data)
            }
        }
    }

    static func reset() {
        guard let url = fileURL else { return }
        queue.async {
            try? FileManager.default.removeItem(at: url)
        }
    }
}
