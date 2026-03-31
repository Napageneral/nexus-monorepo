/**
 * Detect if code uses ESM syntax.
 */
export declare function isESM(code: string, filePath?: string): boolean;
/**
 * Transform dynamic import() calls to __dynamicImport() calls.
 */
export declare function transformDynamicImport(code: string): string;
/**
 * Extract static import specifiers from transformed code.
 */
export declare function extractDynamicImportSpecifiers(code: string): string[];
/**
 * Convert CJS module to ESM-compatible wrapper.
 */
/**
 * Wrap CommonJS code in an ESM-compatible module that exports `module.exports`
 * as the default export plus any statically-detectable named exports.
 */
export declare function wrapCJSForESM(code: string): string;
export declare function wrapCJSForESMWithModulePath(code: string, modulePath: string): string;
/**
 * Scan CJS code for `module.exports.X =`, `exports.X =`, and
 * `Object.defineProperty(exports, 'X', ...)` patterns to discover named exports
 * that can be re-exported from the ESM wrapper.
 */
declare function extractCjsNamedExports(code: string): string[];
export { extractCjsNamedExports };
