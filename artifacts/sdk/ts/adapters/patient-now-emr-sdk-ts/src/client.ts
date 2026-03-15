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

export interface Client {
  "adapter": {
    "accounts": {
      "list": (options?: RequestOptions) => Promise<AdapterAccountsListResponse>;
    };
    "health": (request: AdapterHealthRequest, options?: RequestOptions) => Promise<AdapterHealthResponse>;
    "info": (options?: RequestOptions) => Promise<AdapterInfoResponse>;
  };
}

export function createPatientNowEmrAdapterClient(options: ClientOptions): Client {
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
    },
  };
}
