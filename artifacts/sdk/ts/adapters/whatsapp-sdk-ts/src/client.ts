import {
  HttpClient,
  type ClientOptions,
  type RequestOptions,
} from "./http.js";
import type { OperationRequest, OperationResponse } from "./types.js";

export type AdapterConnectionsListRequest = OperationRequest<"adapter.connections.list">;
export type AdapterConnectionsListResponse = OperationResponse<"adapter.connections.list">;

export type AdapterHealthRequest = OperationRequest<"adapter.health">;
export type AdapterHealthResponse = OperationResponse<"adapter.health">;

export type AdapterInfoRequest = OperationRequest<"adapter.info">;
export type AdapterInfoResponse = OperationResponse<"adapter.info">;

export type WhatsappSendRequest = OperationRequest<"whatsapp.send">;
export type WhatsappSendResponse = OperationResponse<"whatsapp.send">;

export interface Client {
  "adapter": {
    "connections": {
      "list": (options?: RequestOptions) => Promise<AdapterConnectionsListResponse>;
    };
    "health": (request: AdapterHealthRequest, options?: RequestOptions) => Promise<AdapterHealthResponse>;
    "info": (options?: RequestOptions) => Promise<AdapterInfoResponse>;
  };
  "whatsapp": {
    "send": (request: WhatsappSendRequest, options?: RequestOptions) => Promise<WhatsappSendResponse>;
  };
}

export function createWhatsappAdapterClient(options: ClientOptions): Client {
  const http = new HttpClient(options);
  return {
    "adapter": {
      "connections": {
        "list": async (options?: RequestOptions) => {
      return http.request<AdapterConnectionsListResponse>({
        method: "POST",
        path: "/operations/adapter.connections.list",
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
    "whatsapp": {
      "send": async (request: WhatsappSendRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<WhatsappSendResponse>({
        method: "POST",
        path: "/operations/whatsapp.send",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
    },
  };
}
