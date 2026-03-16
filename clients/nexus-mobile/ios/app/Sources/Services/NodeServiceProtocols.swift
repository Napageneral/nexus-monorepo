import CoreLocation
import Foundation
import NexusKit
import UIKit

protocol CameraServicing: Sendable {
    func listDevices() async -> [CameraController.CameraDeviceInfo]
    func snap(params: NexusCameraSnapParams) async throws -> (format: String, base64: String, width: Int, height: Int)
    func clip(params: NexusCameraClipParams) async throws -> (format: String, base64: String, durationMs: Int, hasAudio: Bool)
}

protocol ScreenRecordingServicing: Sendable {
    func record(
        screenIndex: Int?,
        durationMs: Int?,
        fps: Double?,
        includeAudio: Bool?,
        outPath: String?) async throws -> String
}

@MainActor
protocol LocationServicing: Sendable {
    func authorizationStatus() -> CLAuthorizationStatus
    func accuracyAuthorization() -> CLAccuracyAuthorization
    func ensureAuthorization(mode: NexusLocationMode) async -> CLAuthorizationStatus
    func currentLocation(
        params: NexusLocationGetParams,
        desiredAccuracy: NexusLocationAccuracy,
        maxAgeMs: Int?,
        timeoutMs: Int?) async throws -> CLLocation
}

protocol DeviceStatusServicing: Sendable {
    func status() async throws -> NexusDeviceStatusPayload
    func info() -> NexusDeviceInfoPayload
}

protocol PhotosServicing: Sendable {
    func latest(params: NexusPhotosLatestParams) async throws -> NexusPhotosLatestPayload
}

protocol ContactsServicing: Sendable {
    func search(params: NexusContactsSearchParams) async throws -> NexusContactsSearchPayload
    func add(params: NexusContactsAddParams) async throws -> NexusContactsAddPayload
}

protocol CalendarServicing: Sendable {
    func events(params: NexusCalendarEventsParams) async throws -> NexusCalendarEventsPayload
    func add(params: NexusCalendarAddParams) async throws -> NexusCalendarAddPayload
}

protocol RemindersServicing: Sendable {
    func list(params: NexusRemindersListParams) async throws -> NexusRemindersListPayload
    func add(params: NexusRemindersAddParams) async throws -> NexusRemindersAddPayload
}

protocol MotionServicing: Sendable {
    func activities(params: NexusMotionActivityParams) async throws -> NexusMotionActivityPayload
    func pedometer(params: NexusPedometerParams) async throws -> NexusPedometerPayload
}

extension CameraController: CameraServicing {}
extension ScreenRecordService: ScreenRecordingServicing {}
extension LocationService: LocationServicing {}
