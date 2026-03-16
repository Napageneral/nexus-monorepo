import NexusProtocol

/// Server-push messages from the runtime websocket.
///
/// This is the in-process replacement for the legacy `NotificationCenter` fan-out.
public enum RuntimePush: Sendable {
    /// A full snapshot that arrives on connect (or reconnect).
    case snapshot(HelloOk)
    /// A server push event frame.
    case event(EventFrame)
    /// A detected sequence gap (`expected...received`) for event frames.
    case seqGap(expected: Int, received: Int)
}
