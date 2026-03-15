export type paths = {
    "/api/apps/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List installable apps from the frontdoor product catalog */
        get: operations["frontdoor.apps.catalog"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Authenticate a frontdoor user session */
        post: operations["frontdoor.auth.login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Return the authenticated frontdoor user context */
        get: operations["frontdoor.auth.me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runtime/token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Mint a runtime access token for the active server context */
        post: operations["frontdoor.runtime.token.issue"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runtime/token/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Refresh a runtime access token using a refresh token */
        post: operations["frontdoor.runtime.token.refresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runtime/token/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revoke a runtime refresh token */
        post: operations["frontdoor.runtime.token.revoke"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/servers/{serverId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get one hosted server and installed app state */
        get: operations["frontdoor.servers.get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/servers/{serverId}/adapters/{adapterId}/install": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Install an adapter on a hosted server */
        post: operations["frontdoor.servers.adapters.install"];
        /** Uninstall an adapter from a hosted server */
        delete: operations["frontdoor.servers.adapters.uninstall"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/servers/{serverId}/adapters/{adapterId}/install-status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get adapter install status for a hosted server */
        get: operations["frontdoor.servers.adapters.installStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/servers/{serverId}/adapters/{adapterId}/upgrade": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upgrade an installed adapter on a hosted server */
        post: operations["frontdoor.servers.adapters.upgrade"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/servers/{serverId}/apps/{appId}/install": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Install an app on a hosted server */
        post: operations["frontdoor.servers.apps.install"];
        /** Uninstall an app from a hosted server */
        delete: operations["frontdoor.servers.apps.uninstall"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/servers/{serverId}/apps/{appId}/install-status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get app entitlement and install status for a hosted server */
        get: operations["frontdoor.servers.apps.installStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/servers/{serverId}/apps/{appId}/upgrade": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upgrade an installed app on a hosted server */
        post: operations["frontdoor.servers.apps.upgrade"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
};
export type webhooks = Record<string, never>;
export type components = {
    schemas: {
        GenericError: {
            detail?: string | null;
            error: string;
            ok: boolean;
        };
        UnauthorizedError: {
            /** @enum {string} */
            error: "unauthorized" | "not_authenticated";
            /** @enum {boolean} */
            ok: false;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
};
export type $defs = Record<string, never>;
export interface operations {
    "frontdoor.apps.catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description App catalog */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: {
                            accent_color?: string | null;
                            app_id: string;
                            display_name: string;
                            homepage_url?: string | null;
                            installed_on: string[];
                            latest_version?: string | null;
                            tagline?: string | null;
                        }[];
                        /** @enum {boolean} */
                        ok: true;
                    };
                };
            };
        };
    };
    "frontdoor.auth.login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    password: string;
                    username: string;
                };
            };
        };
        responses: {
            /** @description Authenticated session details */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        account_id?: string | null;
                        /** @enum {boolean} */
                        authenticated: true;
                        entity_id: string;
                        /** @enum {boolean} */
                        ok: true;
                        roles: string[];
                        scopes: string[];
                        server_count: number;
                        server_id?: string | null;
                        session_id: string;
                        tenant_id?: string;
                        user_id: string;
                    };
                };
            };
            /** @description Invalid credentials */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
            /** @description Login rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
        };
    };
    "frontdoor.auth.me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authenticated user context */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        account_id: string | null;
                        display_name: string;
                        email?: string | null;
                        /** @enum {boolean} */
                        ok: true;
                        roles: string[];
                        scopes: string[];
                        server_id: string | null;
                        tenant_id: string | null;
                        user_id: string;
                        username: string;
                    };
                };
            };
            /** @description Not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
        };
    };
    "frontdoor.runtime.token.issue": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    client_id?: string;
                    server_id?: string;
                };
            };
        };
        responses: {
            /** @description Runtime access token response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        access_token: string;
                        entity_id: string;
                        expires_in: number;
                        key_id?: string;
                        /** @enum {boolean} */
                        ok: true;
                        refresh_expires_in: number;
                        refresh_token: string;
                        roles: string[];
                        runtime: {
                            /** Format: uri */
                            base_url: string;
                            /** Format: uri */
                            http_base_url: string;
                            server_id: string;
                            /** Format: uri */
                            sse_url: string;
                            tenant_id: string;
                            /** Format: uri */
                            ws_url: string;
                        };
                        scopes: string[];
                        server_id: string;
                        tenant_id: string;
                        /** @enum {string} */
                        token_type: "Bearer";
                    };
                };
            };
            /** @description Invalid server context */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
            /** @description Not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
        };
    };
    "frontdoor.runtime.token.refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    client_id?: string;
                    refresh_token: string;
                    server_id?: string;
                };
            };
        };
        responses: {
            /** @description Refreshed runtime token response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        access_token: string;
                        entity_id: string;
                        expires_in: number;
                        key_id?: string;
                        /** @enum {boolean} */
                        ok: true;
                        refresh_expires_in: number;
                        refresh_token: string;
                        roles: string[];
                        runtime: {
                            /** Format: uri */
                            base_url: string;
                            /** Format: uri */
                            http_base_url: string;
                            server_id: string;
                            /** Format: uri */
                            sse_url: string;
                            tenant_id: string;
                            /** Format: uri */
                            ws_url: string;
                        };
                        scopes: string[];
                        server_id: string;
                        tenant_id: string;
                        /** @enum {string} */
                        token_type: "Bearer";
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
            /** @description Invalid refresh token */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
        };
    };
    "frontdoor.runtime.token.revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    refresh_token: string;
                };
            };
        };
        responses: {
            /** @description Refresh token revoked */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        ok: boolean;
                    };
                };
            };
            /** @description Refresh token not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        ok: boolean;
                    };
                };
            };
        };
    };
    "frontdoor.servers.get": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                serverId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Server details */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {boolean} */
                        ok: true;
                        server: {
                            account_id: string;
                            active_recovery_point_id: string | null;
                            archived_at: string | null;
                            backup_enabled: boolean;
                            delete_protection_enabled: boolean;
                            destroyed_at: string | null;
                            display_name: string;
                            generated_name: string;
                            installed_app_ids: string[];
                            installed_apps: {
                                app_id: string;
                                installed_at: string | null;
                                status: string;
                                version: string | null;
                            }[];
                            last_recovered_at: string | null;
                            plan: string;
                            rebuild_protection_enabled: boolean;
                            /** Format: uri */
                            runtime_public_base_url: string;
                            server_id: string;
                            status: string;
                        };
                    };
                };
            };
            /** @description Missing server id */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
            /** @description Not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
        };
    };
    "frontdoor.servers.adapters.install": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                adapterId: string;
                serverId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    version: string;
                };
            };
        };
        responses: {
            /** @description Adapter install result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        adapter_id: string;
                        install_status: string;
                        /** @enum {boolean} */
                        ok: true;
                        server_id: string;
                        version: string;
                    };
                };
            };
            /** @description Invalid install request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
            /** @description Not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
            /** @description Adapter not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
        };
    };
    "frontdoor.servers.adapters.uninstall": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                adapterId: string;
                serverId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Adapter uninstall result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        adapter_id?: string;
                        app_id?: string;
                        install_status: string;
                        /** @enum {boolean} */
                        ok: true;
                        server_id: string;
                    };
                };
            };
            /** @description Invalid uninstall request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
            /** @description Not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
        };
    };
    "frontdoor.servers.adapters.installStatus": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                adapterId: string;
                serverId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Adapter install status */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        active_version: string | null;
                        adapter_id: string;
                        desired_version: string | null;
                        install_status: string;
                        last_error: string | null;
                        /** @enum {boolean} */
                        ok: true;
                        server_id: string;
                    };
                };
            };
            /** @description Invalid install status request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
            /** @description Not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
        };
    };
    "frontdoor.servers.adapters.upgrade": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                adapterId: string;
                serverId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    target_version: string;
                };
            };
        };
        responses: {
            /** @description Adapter upgrade result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        adapter_id?: string;
                        app_id?: string;
                        install_status: string;
                        /** @enum {boolean} */
                        ok: true;
                        server_id: string;
                        version: string;
                    };
                };
            };
            /** @description Invalid upgrade request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
            /** @description Not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
            /** @description Adapter not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
        };
    };
    "frontdoor.servers.apps.install": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                appId: string;
                serverId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description App install result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        app_id: string;
                        entry_path: string;
                        install_status: string;
                        /** @enum {boolean} */
                        ok: true;
                        server_id: string;
                        version: string;
                    };
                };
            };
            /** @description Invalid install request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
            /** @description Not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
            /** @description Install blocked by entitlement or access policy */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
            /** @description App not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
        };
    };
    "frontdoor.servers.apps.uninstall": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                appId: string;
                serverId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description App uninstall result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        adapter_id?: string;
                        app_id?: string;
                        install_status: string;
                        /** @enum {boolean} */
                        ok: true;
                        server_id: string;
                    };
                };
            };
            /** @description Invalid uninstall request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
            /** @description Not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
        };
    };
    "frontdoor.servers.apps.installStatus": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                appId: string;
                serverId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Install status */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        app_id: string;
                        entitlement_status: string;
                        entry_path: string;
                        install_status: string;
                        last_error: string | null;
                        /** @enum {boolean} */
                        ok: true;
                        server_id: string;
                    };
                };
            };
            /** @description Invalid request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
            /** @description Not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
        };
    };
    "frontdoor.servers.apps.upgrade": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                appId: string;
                serverId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    target_version: string;
                };
            };
        };
        responses: {
            /** @description App upgrade result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        adapter_id?: string;
                        app_id?: string;
                        install_status: string;
                        /** @enum {boolean} */
                        ok: true;
                        server_id: string;
                        version: string;
                    };
                };
            };
            /** @description Invalid upgrade request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
            /** @description Not authenticated */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
            /** @description App not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        detail?: string | null;
                        error: string;
                        ok: boolean;
                        server_count?: number;
                    };
                };
            };
        };
    };
}
