import { HttpClient, } from "./http.js";
export function createJiraAdapterClient(options) {
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
            "setup": {
                "cancel": async (request, options) => {
                    return http.request({
                        method: "POST",
                        path: "/operations/adapter.setup.cancel",
                        query: undefined,
                        body: request,
                        options,
                    });
                },
                "start": async (request, options) => {
                    return http.request({
                        method: "POST",
                        path: "/operations/adapter.setup.start",
                        query: undefined,
                        body: request,
                        options,
                    });
                },
                "status": async (request, options) => {
                    return http.request({
                        method: "POST",
                        path: "/operations/adapter.setup.status",
                        query: undefined,
                        body: request,
                        options,
                    });
                },
                "submit": async (request, options) => {
                    return http.request({
                        method: "POST",
                        path: "/operations/adapter.setup.submit",
                        query: undefined,
                        body: request,
                        options,
                    });
                },
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
