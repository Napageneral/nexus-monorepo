import Foundation

public enum NexusBonjour {
    // v0: internal-only, subject to rename.
    public static let runtimeServiceType = "_nexus-gw._tcp"
    public static let runtimeServiceDomain = "local."
    public static var wideAreaRuntimeServiceDomain: String? {
        let env = ProcessInfo.processInfo.environment
        return resolveWideAreaDomain(env["NEXUS_WIDE_AREA_DOMAIN"])
    }

    public static var runtimeServiceDomains: [String] {
        var domains = [runtimeServiceDomain]
        if let wideArea = wideAreaRuntimeServiceDomain {
            domains.append(wideArea)
        }
        return domains
    }

    private static func resolveWideAreaDomain(_ raw: String?) -> String? {
        let trimmed = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }
        let normalized = normalizeServiceDomain(trimmed)
        return normalized == runtimeServiceDomain ? nil : normalized
    }

    public static func normalizeServiceDomain(_ raw: String?) -> String {
        let trimmed = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return self.runtimeServiceDomain
        }

        let lower = trimmed.lowercased()
        if lower == "local" || lower == "local." {
            return self.runtimeServiceDomain
        }

        return lower.hasSuffix(".") ? lower : (lower + ".")
    }
}
