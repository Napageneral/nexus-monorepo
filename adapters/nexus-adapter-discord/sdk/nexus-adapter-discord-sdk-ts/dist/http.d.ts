export interface ClientOptions {
    baseUrl: string;
    fetch?: typeof globalThis.fetch;
    headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
}
export interface RequestOptions {
    headers?: HeadersInit;
    signal?: AbortSignal;
}
type RequestArgs = {
    method: string;
    path: string;
    query?: Record<string, unknown>;
    body?: unknown;
    options?: RequestOptions;
};
export declare class HttpClient {
    private readonly baseUrl;
    private readonly fetchImpl;
    private readonly headers;
    constructor(options: ClientOptions);
    request<T>(args: RequestArgs): Promise<T>;
}
export declare function interpolatePath(template: string, values: Record<string, unknown>): string;
export {};
