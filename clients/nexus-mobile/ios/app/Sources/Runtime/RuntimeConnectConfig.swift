import Foundation
import NexusKit

/// Single source of truth for "how we connect" to the current runtime.
///
/// The iOS app maintains two WebSocket sessions to the same runtime:
/// - a `role=node` session for device capabilities (`node.invoke.*`)
/// - a `role=operator` session for chat/talk/config (`chat.*`, `talk.*`, etc.)
///
/// Both sessions should derive all connection inputs from this config so we
/// don't accidentally persist runtime-scoped state under different keys.
struct RuntimeConnectConfig: Sendable {
    let url: URL
    let stableID: String
    let tls: RuntimeTLSParams?
    let token: String?
    let password: String?
    let nodeOptions: RuntimeConnectOptions

    /// Stable, non-empty identifier used for runtime-scoped persistence keys.
    /// If the caller doesn't provide a stableID, fall back to URL identity.
    var effectiveStableID: String {
        let trimmed = self.stableID.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return self.url.absoluteString }
        return trimmed
    }
}
