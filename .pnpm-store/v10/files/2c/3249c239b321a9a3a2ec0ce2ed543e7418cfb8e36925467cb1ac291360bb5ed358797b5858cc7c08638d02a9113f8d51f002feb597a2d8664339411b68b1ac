import { createRequire } from "node:module";
// Constants
export const DEFAULT_BRIDGE_BASE64_TRANSFER_BYTES = 16 * 1024 * 1024;
export const DEFAULT_ISOLATE_JSON_PAYLOAD_BYTES = 4 * 1024 * 1024;
export const MIN_CONFIGURED_PAYLOAD_BYTES = 1024;
export const MAX_CONFIGURED_PAYLOAD_BYTES = 64 * 1024 * 1024;
export const PAYLOAD_LIMIT_ERROR_CODE = "ERR_SANDBOX_PAYLOAD_TOO_LARGE";
export const RESOURCE_BUDGET_ERROR_CODE = "ERR_RESOURCE_BUDGET_EXCEEDED";
export const DEFAULT_MAX_TIMERS = 10_000;
export const DEFAULT_MAX_HANDLES = 10_000;
export const DEFAULT_SANDBOX_CWD = "/root";
export const DEFAULT_SANDBOX_HOME = "/root";
export const DEFAULT_SANDBOX_TMPDIR = "/tmp";
export class PayloadLimitError extends Error {
    constructor(payloadLabel, maxBytes, actualBytes) {
        super(`${PAYLOAD_LIMIT_ERROR_CODE}: ${payloadLabel} exceeds ${maxBytes} bytes (got ${actualBytes})`);
        this.name = "PayloadLimitError";
    }
}
export function normalizePayloadLimit(configuredValue, defaultValue, optionName) {
    if (configuredValue === undefined) {
        return defaultValue;
    }
    if (!Number.isFinite(configuredValue) || configuredValue <= 0) {
        throw new RangeError(`${optionName} must be a positive finite number`);
    }
    const normalizedValue = Math.floor(configuredValue);
    if (normalizedValue < MIN_CONFIGURED_PAYLOAD_BYTES) {
        throw new RangeError(`${optionName} must be at least ${MIN_CONFIGURED_PAYLOAD_BYTES} bytes`);
    }
    if (normalizedValue > MAX_CONFIGURED_PAYLOAD_BYTES) {
        throw new RangeError(`${optionName} must be at most ${MAX_CONFIGURED_PAYLOAD_BYTES} bytes`);
    }
    return normalizedValue;
}
export function getUtf8ByteLength(text) {
    return Buffer.byteLength(text, "utf8");
}
export function getBase64EncodedByteLength(rawByteLength) {
    return Math.ceil(rawByteLength / 3) * 4;
}
export function assertPayloadByteLength(payloadLabel, actualBytes, maxBytes) {
    if (actualBytes <= maxBytes) {
        return;
    }
    throw new PayloadLimitError(payloadLabel, maxBytes, actualBytes);
}
export function assertTextPayloadSize(payloadLabel, text, maxBytes) {
    assertPayloadByteLength(payloadLabel, getUtf8ByteLength(text), maxBytes);
}
export function createBudgetState() {
    return { outputBytes: 0, bridgeCalls: 0, activeTimers: 0, childProcesses: 0 };
}
export function clearActiveHostTimers(deps) {
    for (const id of deps.activeHostTimers) {
        clearTimeout(id);
    }
    deps.activeHostTimers.clear();
}
export function killActiveChildProcesses(deps) {
    for (const proc of deps.activeChildProcesses.values()) {
        try {
            proc.kill(9); // SIGKILL
        }
        catch {
            // Process may already be dead
        }
    }
    deps.activeChildProcesses.clear();
}
export function checkBridgeBudget(deps) {
    if (deps.maxBridgeCalls === undefined)
        return;
    deps.budgetState.bridgeCalls++;
    if (deps.budgetState.bridgeCalls > deps.maxBridgeCalls) {
        throw new Error(`${RESOURCE_BUDGET_ERROR_CODE}: maximum bridge calls exceeded`);
    }
}
export function parseJsonWithLimit(payloadLabel, jsonText, maxBytes) {
    assertTextPayloadSize(payloadLabel, jsonText, maxBytes);
    return JSON.parse(jsonText);
}
export function getExecutionTimeoutMs(override, cpuTimeLimitMs) {
    const timeoutMs = override ?? cpuTimeLimitMs;
    if (timeoutMs === undefined) {
        return undefined;
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new RangeError("cpuTimeLimitMs must be a positive finite number");
    }
    return Math.floor(timeoutMs);
}
export function getTimingMitigation(override, defaultMitigation) {
    return override ?? defaultMitigation;
}
// Module-level caches for polyfill and host builtin named exports
export const polyfillCodeCache = new Map();
export const polyfillNamedExportsCache = new Map();
export const hostBuiltinNamedExportsCache = new Map();
export const hostRequire = createRequire(import.meta.url);
export function isValidExportName(name) {
    return /^[A-Za-z_$][\w$]*$/.test(name);
}
export function getHostBuiltinNamedExports(moduleName) {
    const cached = hostBuiltinNamedExportsCache.get(moduleName);
    if (cached) {
        return cached;
    }
    try {
        const loaded = hostRequire(`node:${moduleName}`);
        const names = Array.from(new Set([
            ...Object.keys(loaded ?? {}),
            ...Object.getOwnPropertyNames(loaded ?? {}),
        ]))
            .filter((name) => name !== "default")
            .filter(isValidExportName)
            .sort();
        hostBuiltinNamedExportsCache.set(moduleName, names);
        return names;
    }
    catch {
        hostBuiltinNamedExportsCache.set(moduleName, []);
        return [];
    }
}
