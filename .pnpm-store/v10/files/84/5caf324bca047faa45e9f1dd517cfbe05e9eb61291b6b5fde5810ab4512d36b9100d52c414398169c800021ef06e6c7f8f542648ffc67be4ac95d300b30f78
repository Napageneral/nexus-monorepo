/**
 * Classification for globals the runtime installs on the isolate's `globalThis`.
 *
 * - `hardened`: non-writable, non-configurable. Prevents sandbox code from
 *   replacing bridge callbacks or lifecycle hooks.
 * - `mutable-runtime-state`: writable per-execution state (module cache,
 *   stdin data, CJS module/exports wrappers) that must be reset between runs.
 */
export type CustomGlobalClassification = "hardened" | "mutable-runtime-state";
export interface CustomGlobalInventoryEntry {
    name: string;
    classification: CustomGlobalClassification;
    rationale: string;
}
export declare const NODE_CUSTOM_GLOBAL_INVENTORY: readonly CustomGlobalInventoryEntry[];
export declare const HARDENED_NODE_CUSTOM_GLOBALS: string[];
export declare const MUTABLE_NODE_CUSTOM_GLOBALS: string[];
interface ExposeGlobalOptions {
    mutable?: boolean;
    enumerable?: boolean;
}
/**
 * Define a property on `target` using `Object.defineProperty`.
 * By default the property is non-writable/non-configurable (hardened).
 */
export declare function exposeGlobalBinding(target: Record<string, unknown>, name: string, value: unknown, options?: ExposeGlobalOptions): void;
/** Install a hardened (non-writable) global on `globalThis`. */
export declare function exposeCustomGlobal(name: string, value: unknown): void;
/** Install a writable global on `globalThis` for per-execution state. */
export declare function exposeMutableRuntimeStateGlobal(name: string, value: unknown): void;
/**
 * Inline JavaScript source that provides `exposeCustomGlobal` and
 * `exposeMutableRuntimeStateGlobal` inside the isolate's V8 context.
 * Evaluated by the host after context creation so that bridge/runtime
 * scripts can harden their own globals.
 */
export declare const ISOLATE_GLOBAL_EXPOSURE_HELPER_SOURCE = "(() => {\n  const exposeGlobalBinding = (name, value, mutable = false) => {\n    Object.defineProperty(globalThis, name, {\n      value,\n      writable: mutable,\n      configurable: mutable,\n      enumerable: true,\n    });\n  };\n  const exposeCustomGlobal = (name, value) => exposeGlobalBinding(name, value, false);\n  const exposeMutableRuntimeStateGlobal = (name, value) =>\n    exposeGlobalBinding(name, value, true);\n  return {\n    exposeCustomGlobal,\n    exposeMutableRuntimeStateGlobal,\n  };\n})()";
export {};
