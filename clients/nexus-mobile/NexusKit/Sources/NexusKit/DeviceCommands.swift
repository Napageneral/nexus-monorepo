import Foundation

public enum NexusDeviceCommand: String, Codable, Sendable {
    case status = "device.status"
    case info = "device.info"
}

public enum NexusBatteryState: String, Codable, Sendable {
    case unknown
    case unplugged
    case charging
    case full
}

public enum NexusThermalState: String, Codable, Sendable {
    case nominal
    case fair
    case serious
    case critical
}

public enum NexusNetworkPathStatus: String, Codable, Sendable {
    case satisfied
    case unsatisfied
    case requiresConnection
}

public enum NexusNetworkInterfaceType: String, Codable, Sendable {
    case wifi
    case cellular
    case wired
    case other
}

public struct NexusBatteryStatusPayload: Codable, Sendable, Equatable {
    public var level: Double?
    public var state: NexusBatteryState
    public var lowPowerModeEnabled: Bool

    public init(level: Double?, state: NexusBatteryState, lowPowerModeEnabled: Bool) {
        self.level = level
        self.state = state
        self.lowPowerModeEnabled = lowPowerModeEnabled
    }
}

public struct NexusThermalStatusPayload: Codable, Sendable, Equatable {
    public var state: NexusThermalState

    public init(state: NexusThermalState) {
        self.state = state
    }
}

public struct NexusStorageStatusPayload: Codable, Sendable, Equatable {
    public var totalBytes: Int64
    public var freeBytes: Int64
    public var usedBytes: Int64

    public init(totalBytes: Int64, freeBytes: Int64, usedBytes: Int64) {
        self.totalBytes = totalBytes
        self.freeBytes = freeBytes
        self.usedBytes = usedBytes
    }
}

public struct NexusNetworkStatusPayload: Codable, Sendable, Equatable {
    public var status: NexusNetworkPathStatus
    public var isExpensive: Bool
    public var isConstrained: Bool
    public var interfaces: [NexusNetworkInterfaceType]

    public init(
        status: NexusNetworkPathStatus,
        isExpensive: Bool,
        isConstrained: Bool,
        interfaces: [NexusNetworkInterfaceType])
    {
        self.status = status
        self.isExpensive = isExpensive
        self.isConstrained = isConstrained
        self.interfaces = interfaces
    }
}

public struct NexusDeviceStatusPayload: Codable, Sendable, Equatable {
    public var battery: NexusBatteryStatusPayload
    public var thermal: NexusThermalStatusPayload
    public var storage: NexusStorageStatusPayload
    public var network: NexusNetworkStatusPayload
    public var uptimeSeconds: Double

    public init(
        battery: NexusBatteryStatusPayload,
        thermal: NexusThermalStatusPayload,
        storage: NexusStorageStatusPayload,
        network: NexusNetworkStatusPayload,
        uptimeSeconds: Double)
    {
        self.battery = battery
        self.thermal = thermal
        self.storage = storage
        self.network = network
        self.uptimeSeconds = uptimeSeconds
    }
}

public struct NexusDeviceInfoPayload: Codable, Sendable, Equatable {
    public var deviceName: String
    public var modelIdentifier: String
    public var systemName: String
    public var systemVersion: String
    public var appVersion: String
    public var appBuild: String
    public var locale: String

    public init(
        deviceName: String,
        modelIdentifier: String,
        systemName: String,
        systemVersion: String,
        appVersion: String,
        appBuild: String,
        locale: String)
    {
        self.deviceName = deviceName
        self.modelIdentifier = modelIdentifier
        self.systemName = systemName
        self.systemVersion = systemVersion
        self.appVersion = appVersion
        self.appBuild = appBuild
        self.locale = locale
    }
}
