/**
 * Module classification and resolution helpers.
 *
 * Node built-ins are split into three tiers:
 * - Bridge modules: fully polyfilled by the bridge (fs, process, http, etc.)
 * - Deferred core modules: known but not yet bridge-supported; surfaced via
 *   deferred stubs in require paths and polyfills/wrappers in ESM paths
 * - Unsupported core modules: known but intentionally unimplemented
 *
 * Everything else falls through to node-stdlib-browser polyfills or node_modules.
 */
/**
 * Known named exports for each built-in module. Used by the ESM wrapper
 * generator to create `export const X = _builtin.X;` re-exports so that
 * `import { readFile } from 'fs'` works inside the isolate.
 */
export declare const BUILTIN_NAMED_EXPORTS: Record<string, string[]>;
/**
 * Normalize a module specifier to its canonical form if it's a known built-in.
 * Returns null for non-builtin specifiers.
 * Preserves the `node:` prefix when present, strips it otherwise.
 */
export declare function normalizeBuiltinSpecifier(request: string): string | null;
/** Extract the directory portion of a path (lightweight dirname without node:path). */
export declare function getPathDir(path: string): string;
