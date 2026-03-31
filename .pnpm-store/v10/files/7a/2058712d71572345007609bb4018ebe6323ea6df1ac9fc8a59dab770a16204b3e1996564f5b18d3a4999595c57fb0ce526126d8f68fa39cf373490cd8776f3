interface RequireFunction {
    (request: string): unknown;
    resolve: RequireResolve;
    cache: Record<string, {
        exports: unknown;
    }>;
    main: Module | undefined;
    extensions: Record<string, (module: Module, filename: string) => void>;
}
interface RequireResolve {
    (request: string, options?: {
        paths?: string[];
    }): string;
    paths: (request: string) => string[] | null;
}
/**
 * Create a require function that resolves relative to the given filename.
 * This mimics Node.js's module.createRequire(filename).
 */
export declare function createRequire(filename: string | URL): RequireFunction;
/**
 * Polyfill of Node.js `Module` class for sandbox compatibility. Provides
 * `_compile`, `_resolveFilename`, `_load`, `_extensions`, and `_cache` statics
 * that npm tooling (promzard, resolve, etc.) relies on.
 */
export declare class Module {
    id: string;
    path: string;
    exports: unknown;
    filename: string;
    loaded: boolean;
    children: Module[];
    paths: string[];
    parent: Module | null | undefined;
    isPreloading: boolean;
    constructor(id: string, parent?: Module | null);
    require(request: string): unknown;
    _compile(content: string, filename: string): unknown;
    static _extensions: Record<string, (module: Module, filename: string) => void>;
    static _cache: Record<string, {
        exports: unknown;
    }>;
    static _resolveFilename(request: string, parent: Module | null | undefined, _isMain?: boolean, _options?: unknown): string;
    static wrap(content: string): string;
    static builtinModules: string[];
    static isBuiltin(moduleName: string): boolean;
    static createRequire: typeof createRequire;
    static syncBuiltinESMExports(): void;
    static findSourceMap(_path: string): undefined;
    static _nodeModulePaths(from: string): string[];
    static _load(request: string, parent: Module | null | undefined, _isMain?: boolean): unknown;
    static runMain(): void;
}
export declare class SourceMap {
    constructor(_payload: unknown);
    get payload(): never;
    set payload(_value: unknown);
    findEntry(_line: number, _column: number): never;
}
declare const moduleModule: {
    Module: typeof Module;
    createRequire: typeof createRequire;
    _extensions: Record<string, (module: Module, filename: string) => void>;
    _cache: Record<string, {
        exports: unknown;
    }>;
    builtinModules: string[];
    isBuiltin: typeof Module.isBuiltin;
    _resolveFilename: typeof Module._resolveFilename;
    wrap: typeof Module.wrap;
    syncBuiltinESMExports: typeof Module.syncBuiltinESMExports;
    findSourceMap: typeof Module.findSourceMap;
    SourceMap: typeof SourceMap;
};
export default moduleModule;
