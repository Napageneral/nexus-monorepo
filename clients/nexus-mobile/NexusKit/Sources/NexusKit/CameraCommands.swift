import Foundation

public enum NexusCameraCommand: String, Codable, Sendable {
    case list = "camera.list"
    case snap = "camera.snap"
    case clip = "camera.clip"
}

public enum NexusCameraFacing: String, Codable, Sendable {
    case back
    case front
}

public enum NexusCameraImageFormat: String, Codable, Sendable {
    case jpg
    case jpeg
}

public enum NexusCameraVideoFormat: String, Codable, Sendable {
    case mp4
}

public struct NexusCameraSnapParams: Codable, Sendable, Equatable {
    public var facing: NexusCameraFacing?
    public var maxWidth: Int?
    public var quality: Double?
    public var format: NexusCameraImageFormat?
    public var deviceId: String?
    public var delayMs: Int?

    public init(
        facing: NexusCameraFacing? = nil,
        maxWidth: Int? = nil,
        quality: Double? = nil,
        format: NexusCameraImageFormat? = nil,
        deviceId: String? = nil,
        delayMs: Int? = nil)
    {
        self.facing = facing
        self.maxWidth = maxWidth
        self.quality = quality
        self.format = format
        self.deviceId = deviceId
        self.delayMs = delayMs
    }
}

public struct NexusCameraClipParams: Codable, Sendable, Equatable {
    public var facing: NexusCameraFacing?
    public var durationMs: Int?
    public var includeAudio: Bool?
    public var format: NexusCameraVideoFormat?
    public var deviceId: String?

    public init(
        facing: NexusCameraFacing? = nil,
        durationMs: Int? = nil,
        includeAudio: Bool? = nil,
        format: NexusCameraVideoFormat? = nil,
        deviceId: String? = nil)
    {
        self.facing = facing
        self.durationMs = durationMs
        self.includeAudio = includeAudio
        self.format = format
        self.deviceId = deviceId
    }
}
