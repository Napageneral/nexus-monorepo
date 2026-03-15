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

export type AdapterSetupCancelRequest = OperationRequest<"adapter.setup.cancel">;
export type AdapterSetupCancelResponse = OperationResponse<"adapter.setup.cancel">;

export type AdapterSetupStartRequest = OperationRequest<"adapter.setup.start">;
export type AdapterSetupStartResponse = OperationResponse<"adapter.setup.start">;

export type AdapterSetupStatusRequest = OperationRequest<"adapter.setup.status">;
export type AdapterSetupStatusResponse = OperationResponse<"adapter.setup.status">;

export type AdapterSetupSubmitRequest = OperationRequest<"adapter.setup.submit">;
export type AdapterSetupSubmitResponse = OperationResponse<"adapter.setup.submit">;

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
}

export function createDeviceMacosAdapterClient(options: ClientOptions): Client {
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
        "cancel": async (request: AdapterSetupCancelRequest, options?: RequestOptions) => {
      return http.request<AdapterSetupCancelResponse>({
        method: "POST",
        path: "/operations/adapter.setup.cancel",
        query: undefined,
        body: request,
        options,
      })
    },
        "start": async (request: AdapterSetupStartRequest, options?: RequestOptions) => {
      return http.request<AdapterSetupStartResponse>({
        method: "POST",
        path: "/operations/adapter.setup.start",
        query: undefined,
        body: request,
        options,
      })
    },
        "status": async (request: AdapterSetupStatusRequest, options?: RequestOptions) => {
      return http.request<AdapterSetupStatusResponse>({
        method: "POST",
        path: "/operations/adapter.setup.status",
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
  };
}
