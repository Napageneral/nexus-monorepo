import Foundation
import Testing
@testable import Nexus

private struct KeychainEntry: Hashable {
    let service: String
    let account: String
}

private let runtimeService = "ai.nexus.runtime"
private let nodeService = "ai.nexus.node"
private let instanceIdEntry = KeychainEntry(service: nodeService, account: "instanceId")
private let preferredRuntimeEntry = KeychainEntry(service: runtimeService, account: "preferredStableID")
private let lastRuntimeEntry = KeychainEntry(service: runtimeService, account: "lastDiscoveredStableID")

private func snapshotDefaults(_ keys: [String]) -> [String: Any?] {
    let defaults = UserDefaults.standard
    var snapshot: [String: Any?] = [:]
    for key in keys {
        snapshot[key] = defaults.object(forKey: key)
    }
    return snapshot
}

private func applyDefaults(_ values: [String: Any?]) {
    let defaults = UserDefaults.standard
    for (key, value) in values {
        if let value {
            defaults.set(value, forKey: key)
        } else {
            defaults.removeObject(forKey: key)
        }
    }
}

private func restoreDefaults(_ snapshot: [String: Any?]) {
    applyDefaults(snapshot)
}

private func snapshotKeychain(_ entries: [KeychainEntry]) -> [KeychainEntry: String?] {
    var snapshot: [KeychainEntry: String?] = [:]
    for entry in entries {
        snapshot[entry] = KeychainStore.loadString(service: entry.service, account: entry.account)
    }
    return snapshot
}

private func applyKeychain(_ values: [KeychainEntry: String?]) {
    for (entry, value) in values {
        if let value {
            _ = KeychainStore.saveString(value, service: entry.service, account: entry.account)
        } else {
            _ = KeychainStore.delete(service: entry.service, account: entry.account)
        }
    }
}

private func restoreKeychain(_ snapshot: [KeychainEntry: String?]) {
    applyKeychain(snapshot)
}

@Suite(.serialized) struct RuntimeSettingsStoreTests {
    @Test func bootstrapCopiesDefaultsToKeychainWhenMissing() {
        let defaultsKeys = [
            "node.instanceId",
            "runtime.preferredStableID",
            "runtime.lastDiscoveredStableID",
        ]
        let entries = [instanceIdEntry, preferredRuntimeEntry, lastRuntimeEntry]
        let defaultsSnapshot = snapshotDefaults(defaultsKeys)
        let keychainSnapshot = snapshotKeychain(entries)
        defer {
            restoreDefaults(defaultsSnapshot)
            restoreKeychain(keychainSnapshot)
        }

        applyDefaults([
            "node.instanceId": "node-test",
            "runtime.preferredStableID": "preferred-test",
            "runtime.lastDiscoveredStableID": "last-test",
        ])
        applyKeychain([
            instanceIdEntry: nil,
            preferredRuntimeEntry: nil,
            lastRuntimeEntry: nil,
        ])

        RuntimeSettingsStore.bootstrapPersistence()

        #expect(KeychainStore.loadString(service: nodeService, account: "instanceId") == "node-test")
        #expect(KeychainStore.loadString(service: runtimeService, account: "preferredStableID") == "preferred-test")
        #expect(KeychainStore.loadString(service: runtimeService, account: "lastDiscoveredStableID") == "last-test")
    }

    @Test func bootstrapCopiesKeychainToDefaultsWhenMissing() {
        let defaultsKeys = [
            "node.instanceId",
            "runtime.preferredStableID",
            "runtime.lastDiscoveredStableID",
        ]
        let entries = [instanceIdEntry, preferredRuntimeEntry, lastRuntimeEntry]
        let defaultsSnapshot = snapshotDefaults(defaultsKeys)
        let keychainSnapshot = snapshotKeychain(entries)
        defer {
            restoreDefaults(defaultsSnapshot)
            restoreKeychain(keychainSnapshot)
        }

        applyDefaults([
            "node.instanceId": nil,
            "runtime.preferredStableID": nil,
            "runtime.lastDiscoveredStableID": nil,
        ])
        applyKeychain([
            instanceIdEntry: "node-from-keychain",
            preferredRuntimeEntry: "preferred-from-keychain",
            lastRuntimeEntry: "last-from-keychain",
        ])

        RuntimeSettingsStore.bootstrapPersistence()

        let defaults = UserDefaults.standard
        #expect(defaults.string(forKey: "node.instanceId") == "node-from-keychain")
        #expect(defaults.string(forKey: "runtime.preferredStableID") == "preferred-from-keychain")
        #expect(defaults.string(forKey: "runtime.lastDiscoveredStableID") == "last-from-keychain")
    }
}
