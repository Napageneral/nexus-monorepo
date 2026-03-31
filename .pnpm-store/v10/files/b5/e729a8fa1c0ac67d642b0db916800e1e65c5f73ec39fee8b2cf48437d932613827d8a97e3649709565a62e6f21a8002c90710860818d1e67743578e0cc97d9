/** Node-compatible system error shape with code, errno, path, and syscall. */
export interface SystemError extends Error {
    code?: string;
    errno?: number | string;
    path?: string;
    syscall?: string;
}
/** Build a system error with the given POSIX error code (ENOENT, EACCES, etc.). */
export declare function createSystemError(code: string, message: string, details?: {
    path?: string;
    syscall?: string;
}): SystemError;
/** Create a permission-denied error matching Node's EACCES format. */
export declare function createEaccesError(op: string, path?: string, reason?: string): SystemError;
/** Create a "function not implemented" error for unsupported operations. */
export declare function createEnosysError(op: string, path?: string): SystemError;
