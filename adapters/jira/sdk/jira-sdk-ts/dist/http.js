export class HttpClient {
    baseUrl;
    fetchImpl;
    headers;
    constructor(options) {
        if (!options.baseUrl) {
            throw new Error("baseUrl is required");
        }
        this.baseUrl = options.baseUrl.replace(/\/+$/, "");
        this.fetchImpl = options.fetch ?? globalThis.fetch;
        if (typeof this.fetchImpl !== "function") {
            throw new Error("fetch implementation is required");
        }
        this.headers = options.headers;
    }
    async request(args) {
        const url = new URL(`${this.baseUrl}${args.path}`);
        appendQuery(url, args.query);
        const headers = await resolveHeaders(this.headers, args.options?.headers);
        const body = args.body === undefined ? undefined : JSON.stringify(args.body);
        if (body !== undefined && !headers.has("content-type")) {
            headers.set("content-type", "application/json");
        }
        const response = await this.fetchImpl(url, {
            method: args.method,
            headers,
            body,
            signal: args.options?.signal,
        });
        if (!response.ok) {
            throw new Error(`request failed: ${args.method} ${args.path} -> ${response.status}`);
        }
        if (response.status === 204) {
            return undefined;
        }
        return (await response.json());
    }
}
export function interpolatePath(template, values) {
    let resolved = template;
    for (const [key, value] of Object.entries(values)) {
        resolved = resolved.replaceAll(`{${key}}`, encodeURIComponent(String(value)));
    }
    return resolved;
}
function appendQuery(url, query) {
    if (!query) {
        return;
    }
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) {
            continue;
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                if (item !== undefined && item !== null) {
                    url.searchParams.append(key, String(item));
                }
            }
            continue;
        }
        url.searchParams.set(key, String(value));
    }
}
async function resolveHeaders(baseHeaders, overrideHeaders) {
    const resolved = typeof baseHeaders === "function" ? await baseHeaders() : baseHeaders;
    const headers = new Headers(resolved ?? undefined);
    if (overrideHeaders) {
        new Headers(overrideHeaders).forEach((value, key) => {
            headers.set(key, value);
        });
    }
    return headers;
}
