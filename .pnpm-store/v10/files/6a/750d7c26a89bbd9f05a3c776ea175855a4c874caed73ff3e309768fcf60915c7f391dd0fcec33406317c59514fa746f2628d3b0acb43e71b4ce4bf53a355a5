// Path utilities (since we can't use node:path in a way that works in isolate)
function dirname(p) {
    const lastSlash = p.lastIndexOf("/");
    if (lastSlash === -1)
        return ".";
    if (lastSlash === 0)
        return "/";
    return p.slice(0, lastSlash);
}
function join(...parts) {
    const segments = [];
    for (const part of parts) {
        if (part.startsWith("/")) {
            segments.length = 0;
        }
        for (const seg of part.split("/")) {
            if (seg === "..") {
                segments.pop();
            }
            else if (seg && seg !== ".") {
                segments.push(seg);
            }
        }
    }
    return `/${segments.join("/")}`;
}
const FILE_EXTENSIONS = [".js", ".json", ".mjs", ".cjs"];
export function createResolutionCache() {
    return {
        resolveResults: new Map(),
        packageJsonResults: new Map(),
        existsResults: new Map(),
        statResults: new Map(),
    };
}
/**
 * Resolve a module request to an absolute path in the virtual filesystem
 */
export async function resolveModule(request, fromDir, fs, mode = "require", cache) {
    // Check top-level cache
    if (cache) {
        const cacheKey = `${request}\0${fromDir}\0${mode}`;
        if (cache.resolveResults.has(cacheKey)) {
            return cache.resolveResults.get(cacheKey);
        }
    }
    let result;
    // Absolute paths - resolve directly
    if (request.startsWith("/")) {
        result = await resolveAbsolute(request, fs, mode, cache);
    }
    else if (
    // Relative imports (including bare '.' and '..')
    request.startsWith("./") ||
        request.startsWith("../") ||
        request === "." ||
        request === "..") {
        result = await resolveRelative(request, fromDir, fs, mode, cache);
    }
    else if (request.startsWith("#")) {
        // Package import maps, e.g. "#dev"
        result = await resolvePackageImports(request, fromDir, fs, mode, cache);
    }
    else {
        // Bare imports - walk up node_modules
        result = await resolveNodeModules(request, fromDir, fs, mode, cache);
    }
    // Store in top-level cache
    if (cache) {
        const cacheKey = `${request}\0${fromDir}\0${mode}`;
        cache.resolveResults.set(cacheKey, result);
    }
    return result;
}
/** Resolve `#`-prefixed import-map specifiers by walking up to find the nearest package.json with `imports`. */
async function resolvePackageImports(request, fromDir, fs, mode, cache) {
    let dir = fromDir;
    while (dir !== "" && dir !== ".") {
        const pkgJsonPath = join(dir, "package.json");
        const pkgJson = await readPackageJson(fs, pkgJsonPath, cache);
        if (pkgJson?.imports !== undefined) {
            const target = resolveImportsTarget(pkgJson.imports, request, mode);
            if (!target) {
                return null;
            }
            if (target.startsWith("#")) {
                // Avoid recursive import-map loops.
                return null;
            }
            const targetPath = target.startsWith("/")
                ? target
                : join(dir, normalizePackagePath(target));
            return resolvePath(targetPath, fs, mode, cache);
        }
        if (dir === "/") {
            break;
        }
        dir = dirname(dir);
    }
    return null;
}
/**
 * Resolve an absolute path
 */
async function resolveAbsolute(request, fs, mode, cache) {
    return resolvePath(request, fs, mode, cache);
}
/**
 * Resolve a relative import
 */
async function resolveRelative(request, fromDir, fs, mode, cache) {
    const basePath = join(fromDir, request);
    return resolvePath(basePath, fs, mode, cache);
}
/**
 * Resolve a bare module import by walking up node_modules
 */
/** Walk up from `fromDir` checking `node_modules/` (including pnpm virtual-store layouts) for the package. */
async function resolveNodeModules(request, fromDir, fs, mode, cache) {
    // Handle scoped packages: @scope/package
    let packageName;
    let subpath;
    if (request.startsWith("@")) {
        // Scoped package: @scope/package or @scope/package/subpath
        const parts = request.split("/");
        if (parts.length >= 2) {
            packageName = `${parts[0]}/${parts[1]}`;
            subpath = parts.slice(2).join("/");
        }
        else {
            return null;
        }
    }
    else {
        // Regular package: package or package/subpath
        const slashIndex = request.indexOf("/");
        if (slashIndex === -1) {
            packageName = request;
            subpath = "";
        }
        else {
            packageName = request.slice(0, slashIndex);
            subpath = request.slice(slashIndex + 1);
        }
    }
    let dir = fromDir;
    while (dir !== "" && dir !== ".") {
        const candidatePackageDirs = getNodeModulesCandidatePackageDirs(dir, packageName);
        for (const packageDir of candidatePackageDirs) {
            let entry;
            try {
                entry = await resolvePackageEntryFromDir(packageDir, subpath, fs, mode, cache);
            }
            catch (error) {
                if (isPermissionProbeError(error)) {
                    continue;
                }
                throw error;
            }
            if (entry) {
                return entry;
            }
        }
        if (dir === "/")
            break;
        dir = dirname(dir);
    }
    // Also check root node_modules
    const rootPackageDir = join("/node_modules", packageName);
    let rootEntry;
    try {
        rootEntry = await resolvePackageEntryFromDir(rootPackageDir, subpath, fs, mode, cache);
    }
    catch (error) {
        if (isPermissionProbeError(error)) {
            rootEntry = null;
        }
        else {
            throw error;
        }
    }
    if (rootEntry) {
        return rootEntry;
    }
    return null;
}
function getNodeModulesCandidatePackageDirs(dir, packageName) {
    const candidates = new Set();
    candidates.add(join(dir, "node_modules", packageName));
    candidates.add(join(dir, "node_modules", ".pnpm", "node_modules", packageName));
    // Match Node's "parent node_modules" lookup when the current directory is
    // already a node_modules folder.
    if (dir === "/node_modules" || dir.endsWith("/node_modules")) {
        candidates.add(join(dir, packageName));
    }
    // Support pnpm virtual-store layouts where transitive dependencies are linked
    // under <root>/node_modules/.pnpm/node_modules.
    const nodeModulesSegment = "/node_modules/";
    const nodeModulesIndex = dir.lastIndexOf(nodeModulesSegment);
    if (nodeModulesIndex !== -1) {
        const nodeModulesRoot = dir.slice(0, nodeModulesIndex + nodeModulesSegment.length - 1);
        candidates.add(join(nodeModulesRoot, ".pnpm", "node_modules", packageName));
    }
    return Array.from(candidates);
}
/**
 * Given a package directory and optional subpath, resolve the entry file using
 * `exports` map (if present), then `main`, then `index.js` fallback. When
 * `exports` is defined, no fallback to `main` occurs (Node.js semantics).
 */
async function resolvePackageEntryFromDir(packageDir, subpath, fs, mode, cache) {
    const pkgJsonPath = join(packageDir, "package.json");
    const pkgJson = await readPackageJson(fs, pkgJsonPath, cache);
    if (!pkgJson && !(await cachedSafeExists(fs, packageDir, cache))) {
        return null;
    }
    // If package uses "exports", follow it and do not fall back to main/subpath
    if (pkgJson?.exports !== undefined) {
        const exportsTarget = resolveExportsTarget(pkgJson.exports, subpath ? `./${subpath}` : ".", mode);
        if (!exportsTarget) {
            return null;
        }
        const targetPath = join(packageDir, normalizePackagePath(exportsTarget));
        const resolvedTarget = await resolvePath(targetPath, fs, mode, cache);
        return resolvedTarget ?? targetPath;
    }
    // Bare subpath import without exports map: package/sub/path
    if (subpath) {
        return resolvePath(join(packageDir, subpath), fs, mode, cache);
    }
    // Root package import
    const entryField = getPackageEntryField(pkgJson, mode);
    if (entryField) {
        const entryPath = join(packageDir, normalizePackagePath(entryField));
        const resolved = await resolvePath(entryPath, fs, mode, cache);
        if (resolved)
            return resolved;
        if (pkgJson) {
            return entryPath;
        }
    }
    // Default fallback
    return resolvePath(join(packageDir, "index"), fs, mode, cache);
}
async function resolvePath(basePath, fs, mode, cache) {
    let isDirectory = false;
    // Use cached stat when available
    const statResult = await cachedStat(fs, basePath, cache);
    if (statResult !== null) {
        if (!statResult.isDirectory) {
            return basePath;
        }
        isDirectory = true;
    }
    // For extensionless specifiers, try files before directory resolution.
    for (const ext of FILE_EXTENSIONS) {
        const withExt = `${basePath}${ext}`;
        if (await cachedSafeExists(fs, withExt, cache)) {
            return withExt;
        }
    }
    if (isDirectory) {
        const pkgJsonPath = join(basePath, "package.json");
        const pkgJson = await readPackageJson(fs, pkgJsonPath, cache);
        const entryField = getPackageEntryField(pkgJson, mode);
        if (entryField) {
            const entryPath = join(basePath, normalizePackagePath(entryField));
            // Avoid directory self-reference loops like "main": "."
            if (entryPath !== basePath) {
                const entry = await resolvePath(entryPath, fs, mode, cache);
                if (entry)
                    return entry;
            }
        }
        for (const ext of FILE_EXTENSIONS) {
            const indexPath = join(basePath, `index${ext}`);
            if (await cachedSafeExists(fs, indexPath, cache)) {
                return indexPath;
            }
        }
    }
    return null;
}
async function readPackageJson(fs, pkgJsonPath, cache) {
    if (cache?.packageJsonResults.has(pkgJsonPath)) {
        return cache.packageJsonResults.get(pkgJsonPath);
    }
    if (!(await cachedSafeExists(fs, pkgJsonPath, cache))) {
        cache?.packageJsonResults.set(pkgJsonPath, null);
        return null;
    }
    try {
        const result = JSON.parse(await fs.readTextFile(pkgJsonPath));
        cache?.packageJsonResults.set(pkgJsonPath, result);
        return result;
    }
    catch {
        cache?.packageJsonResults.set(pkgJsonPath, null);
        return null;
    }
}
/** Treat EACCES/EPERM as "path not available" during resolution probing. */
function isPermissionProbeError(error) {
    const err = error;
    return err?.code === "EACCES" || err?.code === "EPERM";
}
async function safeExists(fs, path) {
    try {
        return await fs.exists(path);
    }
    catch (error) {
        if (isPermissionProbeError(error)) {
            return false;
        }
        throw error;
    }
}
/** Cached wrapper around safeExists — avoids repeated VFS probes for the same path. */
async function cachedSafeExists(fs, path, cache) {
    if (cache?.existsResults.has(path)) {
        return cache.existsResults.get(path);
    }
    const result = await safeExists(fs, path);
    cache?.existsResults.set(path, result);
    return result;
}
/** Cached stat — returns { isDirectory } or null for ENOENT. */
async function cachedStat(fs, path, cache) {
    if (cache?.statResults.has(path)) {
        return cache.statResults.get(path);
    }
    try {
        const statInfo = await fs.stat(path);
        const result = { isDirectory: statInfo.isDirectory };
        cache?.statResults.set(path, result);
        return result;
    }
    catch (error) {
        const err = error;
        if (err?.code && err.code !== "ENOENT") {
            throw err;
        }
        cache?.statResults.set(path, null);
        return null;
    }
}
function normalizePackagePath(value) {
    return value.replace(/^\.\//, "").replace(/\/$/, "");
}
function getPackageEntryField(pkgJson, _mode) {
    if (!pkgJson)
        return "index.js";
    // Match Node's package entrypoint precedence when exports is absent.
    if (typeof pkgJson.main === "string")
        return pkgJson.main;
    return "index.js";
}
/**
 * Implement Node.js `package.json` "exports" resolution. Handles string, array,
 * conditions-object, subpath keys, and wildcard `*` patterns.
 */
function resolveExportsTarget(exportsField, subpath, mode) {
    // "exports": "./dist/index.js"
    if (typeof exportsField === "string") {
        return subpath === "." ? exportsField : null;
    }
    // "exports": ["./a.js", "./b.js"]
    if (Array.isArray(exportsField)) {
        for (const item of exportsField) {
            const resolved = resolveExportsTarget(item, subpath, mode);
            if (resolved)
                return resolved;
        }
        return null;
    }
    if (!exportsField || typeof exportsField !== "object") {
        return null;
    }
    const record = exportsField;
    // Root conditions object (no "./" keys)
    if (subpath === "." && !Object.keys(record).some((key) => key.startsWith("./"))) {
        return resolveConditionalTarget(record, mode);
    }
    // Exact subpath key first
    if (subpath in record) {
        return resolveExportsTarget(record[subpath], ".", mode);
    }
    // Pattern keys like "./*"
    for (const [key, value] of Object.entries(record)) {
        if (!key.includes("*"))
            continue;
        const [prefix, suffix] = key.split("*");
        if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix))
            continue;
        const wildcard = subpath.slice(prefix.length, subpath.length - suffix.length);
        const resolved = resolveExportsTarget(value, ".", mode);
        if (!resolved)
            continue;
        return resolved.replaceAll("*", wildcard);
    }
    // Root key may still be present in object with subpaths
    if (subpath === "." && "." in record) {
        return resolveExportsTarget(record["."], ".", mode);
    }
    return null;
}
/** Pick the first matching condition key (import/require/node/default) from an exports conditions object. */
function resolveConditionalTarget(record, mode) {
    const order = mode === "import"
        ? ["import", "node", "module", "default", "require"]
        : ["require", "node", "default", "import", "module"];
    for (const key of order) {
        if (!(key in record))
            continue;
        const resolved = resolveExportsTarget(record[key], ".", mode);
        if (resolved)
            return resolved;
    }
    // Last resort: first key that resolves
    for (const value of Object.values(record)) {
        const resolved = resolveExportsTarget(value, ".", mode);
        if (resolved)
            return resolved;
    }
    return null;
}
/** Resolve a `#`-prefixed specifier against a package.json `imports` field, including wildcard patterns. */
function resolveImportsTarget(importsField, specifier, mode) {
    if (typeof importsField === "string") {
        return importsField;
    }
    if (Array.isArray(importsField)) {
        for (const item of importsField) {
            const resolved = resolveImportsTarget(item, specifier, mode);
            if (resolved) {
                return resolved;
            }
        }
        return null;
    }
    if (!importsField || typeof importsField !== "object") {
        return null;
    }
    const record = importsField;
    if (specifier in record) {
        return resolveExportsTarget(record[specifier], ".", mode);
    }
    for (const [key, value] of Object.entries(record)) {
        if (!key.includes("*"))
            continue;
        const [prefix, suffix] = key.split("*");
        if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix))
            continue;
        const wildcard = specifier.slice(prefix.length, specifier.length - suffix.length);
        const resolved = resolveExportsTarget(value, ".", mode);
        if (!resolved)
            continue;
        return resolved.replaceAll("*", wildcard);
    }
    return null;
}
/**
 * Load a file's content from the virtual filesystem
 */
export async function loadFile(path, fs) {
    try {
        return await fs.readTextFile(path);
    }
    catch {
        return null;
    }
}
/**
 * Legacy function - bundle a package from node_modules (simple approach)
 * This is kept for backwards compatibility but the new dynamic resolution is preferred
 */
export async function bundlePackage(packageName, fs) {
    // Resolve the package entry point
    const entryPath = await resolveNodeModules(packageName, "/", fs, "require");
    if (!entryPath) {
        return null;
    }
    try {
        const entryCode = await fs.readTextFile(entryPath);
        // Wrap the code in an IIFE that sets up module.exports
        const wrappedCode = `(function() {
      var module = { exports: {} };
      var exports = module.exports;
      ${entryCode}
      return module.exports;
    })()`;
        return wrappedCode;
    }
    catch {
        return null;
    }
}
