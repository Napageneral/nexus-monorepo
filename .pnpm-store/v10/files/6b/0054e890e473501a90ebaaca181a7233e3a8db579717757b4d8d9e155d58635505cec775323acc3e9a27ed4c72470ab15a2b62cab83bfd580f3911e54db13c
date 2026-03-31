/**
 * Bundle a stdlib polyfill module using esbuild
 */
export declare function bundlePolyfill(moduleName: string): Promise<string>;
/**
 * Get all available stdlib modules (those with non-null polyfills)
 */
export declare function getAvailableStdlib(): string[];
/**
 * Check if a module has a polyfill available
 * Note: fs returns null from node-stdlib-browser since we provide our own implementation
 */
export declare function hasPolyfill(moduleName: string): boolean;
/**
 * Pre-bundle all polyfills (for faster startup)
 */
export declare function prebundleAllPolyfills(): Promise<Map<string, string>>;
