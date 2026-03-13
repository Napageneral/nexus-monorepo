import { type ClientOptions, type RequestOptions } from "./http.js";
import type { OperationRequest, OperationResponse } from "./types.js";
export type AdapterAccountsListRequest = OperationRequest<"adapter.accounts.list">;
export type AdapterAccountsListResponse = OperationResponse<"adapter.accounts.list">;
export type AdapterHealthRequest = OperationRequest<"adapter.health">;
export type AdapterHealthResponse = OperationResponse<"adapter.health">;
export type AdapterInfoRequest = OperationRequest<"adapter.info">;
export type AdapterInfoResponse = OperationResponse<"adapter.info">;
export type ChannelsSendRequest = OperationRequest<"channels.send">;
export type ChannelsSendResponse = OperationResponse<"channels.send">;
export interface Client {
    "adapter": {
        "accounts": {
            "list": (options?: RequestOptions) => Promise<AdapterAccountsListResponse>;
        };
        "health": (request: AdapterHealthRequest, options?: RequestOptions) => Promise<AdapterHealthResponse>;
        "info": (options?: RequestOptions) => Promise<AdapterInfoResponse>;
    };
    "channels": {
        "send": (request: ChannelsSendRequest, options?: RequestOptions) => Promise<ChannelsSendResponse>;
    };
}
export declare function createDiscordAdapterClient(options: ClientOptions): Client;
