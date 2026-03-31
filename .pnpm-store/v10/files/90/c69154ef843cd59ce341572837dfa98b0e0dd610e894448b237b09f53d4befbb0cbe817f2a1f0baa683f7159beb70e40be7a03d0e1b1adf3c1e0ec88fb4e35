/**
 * Controls how deeply and widely console.log arguments are serialized.
 * Prevents CPU amplification and memory buildup from deeply-nested or
 * massive objects being logged inside the sandbox.
 */
export interface ConsoleSerializationBudget {
    maxDepth: number;
    maxKeys: number;
    maxArrayLength: number;
    maxOutputLength: number;
}
export declare const DEFAULT_CONSOLE_SERIALIZATION_BUDGET: ConsoleSerializationBudget;
/** Serialize a single value with circular reference detection and budget limits. */
export declare function safeStringifyConsoleValue(value: unknown, rawBudget: ConsoleSerializationBudget): string;
/** Format an array of console arguments into a single space-separated string. */
export declare function formatConsoleArgs(args: unknown[], rawBudget: ConsoleSerializationBudget): string;
/**
 * Generate isolate-side JavaScript that installs a `globalThis.console` shim.
 * The shim serializes arguments using the budget and forwards them to host
 * bridge references (`_log` / `_error`) via `applySync`.
 */
export declare function getConsoleSetupCode(budget?: ConsoleSerializationBudget): string;
