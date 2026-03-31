/**
 * Check if a path exists in the filesystem
 */
export async function exists(fs, path) {
    return fs.exists(path);
}
/**
 * Get file/directory stats
 */
export async function stat(fs, path) {
    return fs.stat(path);
}
/**
 * Rename/move a file
 */
export async function rename(fs, oldPath, newPath) {
    await fs.rename(oldPath, newPath);
}
/**
 * Read directory with type info
 */
export async function readDirWithTypes(fs, path) {
    return fs.readDirWithTypes(path);
}
/**
 * Create a directory (recursively creates parent directories)
 */
export async function mkdir(fs, path) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const parts = normalizedPath.split("/").filter(Boolean);
    let currentPath = "";
    for (const part of parts) {
        currentPath += `/${part}`;
        try {
            await fs.createDir(currentPath);
        }
        catch {
            // Directory might already exist, ignore error
        }
    }
}
