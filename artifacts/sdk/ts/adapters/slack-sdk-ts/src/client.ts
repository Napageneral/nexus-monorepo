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

export type AdapterSetupCancelRequest = OperationRequest<"adapter.setup.cancel">;
export type AdapterSetupCancelResponse = OperationResponse<"adapter.setup.cancel">;

export type AdapterSetupStartRequest = OperationRequest<"adapter.setup.start">;
export type AdapterSetupStartResponse = OperationResponse<"adapter.setup.start">;

export type AdapterSetupStatusRequest = OperationRequest<"adapter.setup.status">;
export type AdapterSetupStatusResponse = OperationResponse<"adapter.setup.status">;

export type AdapterSetupSubmitRequest = OperationRequest<"adapter.setup.submit">;
export type AdapterSetupSubmitResponse = OperationResponse<"adapter.setup.submit">;

export type SlackEditRequest = OperationRequest<"slack.edit">;
export type SlackEditResponse = OperationResponse<"slack.edit">;

export type SlackProcessingStartRequest = OperationRequest<"slack.processing.start">;
export type SlackProcessingStartResponse = OperationResponse<"slack.processing.start">;

export type SlackProcessingStopRequest = OperationRequest<"slack.processing.stop">;
export type SlackProcessingStopResponse = OperationResponse<"slack.processing.stop">;

export type SlackReactRequest = OperationRequest<"slack.react">;
export type SlackReactResponse = OperationResponse<"slack.react">;

export type SlackSendRequest = OperationRequest<"slack.send">;
export type SlackSendResponse = OperationResponse<"slack.send">;

export interface Client {
  "adapter": {
    "connections": {
      "list": (options?: RequestOptions) => Promise<AdapterConnectionsListResponse>;
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
  "slack": {
    "edit": (request: SlackEditRequest, options?: RequestOptions) => Promise<SlackEditResponse>;
    "processing": {
      "start": (request: SlackProcessingStartRequest, options?: RequestOptions) => Promise<SlackProcessingStartResponse>;
      "stop": (request: SlackProcessingStopRequest, options?: RequestOptions) => Promise<SlackProcessingStopResponse>;
    };
    "react": (request: SlackReactRequest, options?: RequestOptions) => Promise<SlackReactResponse>;
    "send": (request: SlackSendRequest, options?: RequestOptions) => Promise<SlackSendResponse>;
  };
}

export function createSlackAdapterClient(options: ClientOptions): Client {
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
    "slack": {
      "edit": async (request: SlackEditRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SlackEditResponse>({
        method: "POST",
        path: "/operations/slack.edit",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
      "processing": {
        "start": async (request: SlackProcessingStartRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SlackProcessingStartResponse>({
        method: "POST",
        path: "/operations/slack.processing.start",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
        "stop": async (request: SlackProcessingStopRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SlackProcessingStopResponse>({
        method: "POST",
        path: "/operations/slack.processing.stop",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
      },
      "react": async (request: SlackReactRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SlackReactResponse>({
        method: "POST",
        path: "/operations/slack.react",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
      "send": async (request: SlackSendRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SlackSendResponse>({
        method: "POST",
        path: "/operations/slack.send",
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
