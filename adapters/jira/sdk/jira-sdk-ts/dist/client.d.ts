import { type ClientOptions, type RequestOptions } from "./http.js";
import type { OperationRequest, OperationResponse } from "./types.js";
export type AdapterAccountsListRequest = OperationRequest<"adapter.accounts.list">;
export type AdapterAccountsListResponse = OperationResponse<"adapter.accounts.list">;
export type AdapterHealthRequest = OperationRequest<"adapter.health">;
export type AdapterHealthResponse = OperationResponse<"adapter.health">;
export type AdapterInfoRequest = OperationRequest<"adapter.info">;
export type AdapterInfoResponse = OperationResponse<"adapter.info">;
export type AdapterSetupCancelRequest = OperationRequest<"adapter.setup.cancel">;
export type AdapterSetupCancelResponse = OperationResponse<"adapter.setup.cancel">;
export type AdapterSetupStartRequest = OperationRequest<"adapter.setup.start">;
export type AdapterSetupStartResponse = OperationResponse<"adapter.setup.start">;
export type AdapterSetupStatusRequest = OperationRequest<"adapter.setup.status">;
export type AdapterSetupStatusResponse = OperationResponse<"adapter.setup.status">;
export type AdapterSetupSubmitRequest = OperationRequest<"adapter.setup.submit">;
export type AdapterSetupSubmitResponse = OperationResponse<"adapter.setup.submit">;
export type ChannelsSendRequest = OperationRequest<"channels.send">;
export type ChannelsSendResponse = OperationResponse<"channels.send">;
export interface Client {
    "adapter": {
        "accounts": {
            "list": (options?: RequestOptions) => Promise<AdapterAccountsListResponse>;
        };
        "health": (request: AdapterHealthRequest, options?: RequestOptions) => Promise<AdapterHealthResponse>;
        "info": (options?: RequestOptions) => Promise<AdapterInfoResponse>;
        "setup": {
            "cancel": (request: AdapterSetupCancelRequest, options?: RequestOptions) => Promise<AdapterSetupCancelResponse>;
            "start": (request: AdapterSetupStartRequest, options?: RequestOptions) => Promise<AdapterSetupStartResponse>;
            "status": (request: AdapterSetupStatusRequest, options?: RequestOptions) => Promise<AdapterSetupStatusResponse>;
            "submit": (request: AdapterSetupSubmitRequest, options?: RequestOptions) => Promise<AdapterSetupSubmitResponse>;
        };
    };
    "channels": {
        "send": (request: ChannelsSendRequest, options?: RequestOptions) => Promise<ChannelsSendResponse>;
    };
}
export declare function createJiraAdapterClient(options: ClientOptions): Client;
