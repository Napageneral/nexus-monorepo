import { HttpClient, } from "./http.js";
export function createDiscordAdapterClient(options) {
    const http = new HttpClient(options);
    return {
        "adapter": {
            "accounts": {
                "list": async (options) => {
                    return http.request({
                        method: "POST",
                        path: "/operations/adapter.accounts.list",
                        query: undefined,
                        body: undefined,
                        options,
                    });
                },
            },
            "health": async (request, options) => {
                return http.request({
                    method: "POST",
                    path: "/operations/adapter.health",
                    query: undefined,
                    body: request,
                    options,
                });
            },
            "info": async (options) => {
                return http.request({
                    method: "POST",
                    path: "/operations/adapter.info",
                    query: undefined,
                    body: undefined,
                    options,
                });
            },
        },
        "channels": {
            "send": async (request, options) => {
                return http.request({
                    method: "POST",
                    path: "/operations/channels.send",
                    query: undefined,
                    body: request,
                    options,
                });
            },
        },
    };
}
