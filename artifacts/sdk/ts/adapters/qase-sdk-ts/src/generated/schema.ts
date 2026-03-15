export type paths = {
    "/operations/adapter.accounts.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** List adapter accounts */
        post: operations["adapter.accounts.list"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/adapter.health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Check adapter connection health */
        post: operations["adapter.health"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/adapter.info": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Read adapter package metadata */
        post: operations["adapter.info"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/adapter.setup.start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Start adapter setup */
        post: operations["adapter.setup.start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/adapter.setup.submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Submit adapter setup input */
        post: operations["adapter.setup.submit"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/channels.send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Send outbound content through the adapter */
        post: operations["channels.send"];
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
        AdapterAccountSchema: {
            credential_ref?: string;
            display_name?: string;
            id: string;
            /** @enum {string} */
            status: "ready" | "active" | "error";
        };
        AdapterAccountsListResultSchema: components["schemas"]["AdapterAccountSchema"][];
        AdapterConnectionRequestSchema: {
            connection_id: string;
        };
        AdapterEmptyRequestSchema: Record<string, never>;
        AdapterHealthSchema: {
            connected: boolean;
            connection_id: string;
            details?: {
                [key: string]: unknown;
            };
            error?: string;
            last_event_at?: number;
        };
        AdapterInfoSchema: {
            auth?: {
                methods: ({
                    icon: string;
                    id: string;
                    label: string;
                    platformCredentials?: boolean;
                    platformCredentialUrl?: string;
                    scopes: string[];
                    service: string;
                    /** @constant */
                    type: "oauth2";
                } | {
                    fields: {
                        label: string;
                        name: string;
                        options?: {
                            label: string;
                            value: string;
                        }[];
                        placeholder?: string;
                        required: boolean;
                        /** @enum {string} */
                        type: "secret" | "text" | "select";
                    }[];
                    icon: string;
                    id: string;
                    label: string;
                    service: string;
                    /** @constant */
                    type: "api_key";
                } | {
                    accept: string[];
                    icon: string;
                    id: string;
                    label: string;
                    maxSize?: number;
                    templateUrl?: string;
                    /** @constant */
                    type: "file_upload";
                } | {
                    fields?: {
                        label: string;
                        name: string;
                        options?: {
                            label: string;
                            value: string;
                        }[];
                        placeholder?: string;
                        required: boolean;
                        /** @enum {string} */
                        type: "secret" | "text" | "select";
                    }[];
                    icon: string;
                    id: string;
                    label: string;
                    service: string;
                    /** @constant */
                    type: "custom_flow";
                })[];
                setupGuide?: string;
            };
            credential_service?: string;
            methodCatalog?: {
                document?: string;
                namespace?: string;
                /** @enum {string} */
                source?: "manifest" | "openapi";
            };
            methods: {
                /** @enum {string} */
                action?: "read" | "write";
                connection_required?: boolean;
                context_hints?: {
                    params: {
                        [key: string]: {
                            /** @enum {string} */
                            confidence: "exact" | "derived" | "weak";
                            source: string;
                            value: unknown;
                        };
                    };
                };
                description?: string | null;
                mutates_remote?: boolean;
                name: string;
                origin?: {
                    /** @enum {string} */
                    declaration_mode: "manifest" | "openapi" | "builtin";
                    declaration_source: string;
                    /** @enum {string} */
                    kind: "core" | "app" | "adapter";
                    namespace: string;
                    package_id: string | null;
                    package_version: string | null;
                };
                params?: {
                    [key: string]: unknown;
                } | null;
                response?: {
                    [key: string]: unknown;
                } | null;
            }[];
            multi_account: boolean;
            name: string;
            operations: ("adapter.info" | "adapter.health" | "adapter.accounts.list" | "adapter.monitor.start" | "adapter.serve.start" | "adapter.setup.start" | "adapter.setup.submit" | "adapter.setup.status" | "adapter.setup.cancel" | "records.backfill" | "channels.send" | "channels.stream" | "channels.react" | "channels.edit" | "channels.delete")[];
            platform: string;
            platform_capabilities: {
                caption_limit?: number;
                markdown_flavor?: string;
                max_attachments?: number;
                max_message_length?: number;
                supports_buttons?: boolean;
                supports_code_blocks?: boolean;
                supports_delete?: boolean;
                supports_edit?: boolean;
                supports_embeds?: boolean;
                supports_markdown?: boolean;
                supports_media?: boolean;
                supports_polls?: boolean;
                supports_ptt?: boolean;
                supports_reactions?: boolean;
                supports_streaming?: boolean;
                supports_streaming_edit?: boolean;
                supports_tables?: boolean;
                supports_threads?: boolean;
                supports_voice_notes?: boolean;
                text_limit?: number;
            } & {
                [key: string]: unknown;
            };
            version: string;
        };
        AdapterSetupRequestSchema: {
            connection_id?: string;
            payload?: {
                [key: string]: unknown;
            };
            session_id?: string;
        };
        AdapterSetupResultSchema: {
            connection_id?: string;
            fields?: {
                label: string;
                name: string;
                options?: {
                    label: string;
                    value: string;
                }[];
                placeholder?: string;
                required: boolean;
                /** @enum {string} */
                type: "secret" | "text" | "select";
            }[];
            instructions?: string;
            message?: string;
            metadata?: {
                [key: string]: unknown;
            };
            secret_fields?: {
                [key: string]: string;
            };
            service?: string;
            session_id?: string;
            /** @enum {string} */
            status: "pending" | "requires_input" | "completed" | "failed" | "cancelled";
        } & {
            [key: string]: unknown;
        };
        DeliveryResultSchema: {
            chunks_sent: number;
            error?: string | {
                details?: {
                    [key: string]: unknown;
                };
                message: string;
                retry?: boolean;
                retry_after_ms?: number;
                /** @enum {string} */
                type?: "rate_limited" | "permission_denied" | "not_found" | "content_rejected" | "network" | "unknown";
            };
            message_ids: string[];
            success: boolean;
            total_chars?: number;
        };
        SendRequestSchema: {
            caption?: string;
            media?: string;
            target: {
                channel: {
                    container_id?: string;
                    /** @enum {string} */
                    container_kind?: "direct" | "group";
                    platform: string;
                    space_id?: string;
                    thread_id?: string;
                };
                connection_id: string;
                reply_to_id?: string;
            };
            text?: string;
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
    "adapter.accounts.list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful adapter package response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdapterAccountsListResultSchema"];
                };
            };
        };
    };
    "adapter.health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdapterConnectionRequestSchema"];
            };
        };
        responses: {
            /** @description Successful adapter package response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdapterHealthSchema"];
                };
            };
        };
    };
    "adapter.info": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful adapter package response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdapterInfoSchema"];
                };
            };
        };
    };
    "adapter.setup.start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdapterSetupRequestSchema"];
            };
        };
        responses: {
            /** @description Successful adapter package response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdapterSetupResultSchema"];
                };
            };
        };
    };
    "adapter.setup.submit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AdapterSetupRequestSchema"];
            };
        };
        responses: {
            /** @description Successful adapter package response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdapterSetupResultSchema"];
                };
            };
        };
    };
    "channels.send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SendRequestSchema"];
            };
        };
        responses: {
            /** @description Successful adapter package response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeliveryResultSchema"];
                };
            };
        };
    };
}
