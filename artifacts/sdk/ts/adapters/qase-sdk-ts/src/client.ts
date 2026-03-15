import {
  HttpClient,
  type ClientOptions,
  type RequestOptions,
} from "./http.js";
import type { OperationRequest, OperationResponse } from "./types.js";

export type AdapterAccountsListRequest = OperationRequest<"adapter.accounts.list">;
export type AdapterAccountsListResponse = OperationResponse<"adapter.accounts.list">;

export type AdapterHealthRequest = OperationRequest<"adapter.health">;
export type AdapterHealthResponse = OperationResponse<"adapter.health">;

export type AdapterInfoRequest = OperationRequest<"adapter.info">;
export type AdapterInfoResponse = OperationResponse<"adapter.info">;

export type AdapterSetupStartRequest = OperationRequest<"adapter.setup.start">;
export type AdapterSetupStartResponse = OperationResponse<"adapter.setup.start">;

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
      "start": (request: AdapterSetupStartRequest, options?: RequestOptions) => Promise<AdapterSetupStartResponse>;
      "submit": (request: AdapterSetupSubmitRequest, options?: RequestOptions) => Promise<AdapterSetupSubmitResponse>;
    };
  };
  "channels": {
    "send": (request: ChannelsSendRequest, options?: RequestOptions) => Promise<ChannelsSendResponse>;
  };
}

export function createQaseAdapterClient(options: ClientOptions): Client {
  const http = new HttpClient(options);
  return {
    "adapter": {
      "accounts": {
        "list": async (options?: RequestOptions) => {
      return http.request<AdapterAccountsListResponse>({
        method: "POST",
        path: "/operations/adapter.accounts.list",
        query: undefined,
        body: undefined,
        options,
      })
    },
      },
      "health": async (request: AdapterHealthRequest, options?: RequestOptions) => {
      return http.request<AdapterHealthResponse>({
        method: "POST",
        path: "/operations/adapter.health",
        query: undefined,
        body: request,
        options,
      })
    },
      "info": async (options?: RequestOptions) => {
      return http.request<AdapterInfoResponse>({
        method: "POST",
        path: "/operations/adapter.info",
        query: undefined,
        body: undefined,
        options,
      })
    },
      "setup": {
        "start": async (request: AdapterSetupStartRequest, options?: RequestOptions) => {
      return http.request<AdapterSetupStartResponse>({
        method: "POST",
        path: "/operations/adapter.setup.start",
        query: undefined,
        body: request,
        options,
      })
    },
        "submit": async (request: AdapterSetupSubmitRequest, options?: RequestOptions) => {
      return http.request<AdapterSetupSubmitResponse>({
        method: "POST",
        path: "/operations/adapter.setup.submit",
        query: undefined,
        body: request,
        options,
      })
    },
      },
    },
    "channels": {
      "send": async (request: ChannelsSendRequest, options?: RequestOptions) => {
      return http.request<ChannelsSendResponse>({
        method: "POST",
        path: "/operations/channels.send",
        query: undefined,
        body: request,
        options,
      })
    },
    },
  };
}
