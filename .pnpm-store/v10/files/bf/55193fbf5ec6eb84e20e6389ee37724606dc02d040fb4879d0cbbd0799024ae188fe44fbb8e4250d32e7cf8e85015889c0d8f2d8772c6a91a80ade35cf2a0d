import type { DriverDeps } from "./isolate-bootstrap.js";
type ResolverDeps = Pick<DriverDeps, "filesystem" | "packageTypeCache" | "moduleFormatCache" | "isolateJsonPayloadLimitBytes" | "resolutionCache">;
export declare function getNearestPackageType(deps: ResolverDeps, filePath: string): Promise<"module" | "commonjs" | null>;
export declare function getModuleFormat(deps: ResolverDeps, filePath: string, sourceCode?: string): Promise<"esm" | "cjs" | "json">;
export declare function shouldRunAsESM(deps: ResolverDeps, code: string, filePath?: string): Promise<boolean>;
export declare function resolveReferrerDirectory(deps: Pick<DriverDeps, "filesystem">, referrerPath: string): Promise<string>;
export declare function resolveESMPath(deps: Pick<DriverDeps, "filesystem" | "resolutionCache">, specifier: string, referrerPath: string): Promise<string | null>;
export {};
