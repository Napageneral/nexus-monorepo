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

export type AdapterSetupStartRequest = OperationRequest<"adapter.setup.start">;
export type AdapterSetupStartResponse = OperationResponse<"adapter.setup.start">;

export type AdapterSetupSubmitRequest = OperationRequest<"adapter.setup.submit">;
export type AdapterSetupSubmitResponse = OperationResponse<"adapter.setup.submit">;

export type QaseCasesCreateRequest = OperationRequest<"qase.cases.create">;
export type QaseCasesCreateResponse = OperationResponse<"qase.cases.create">;

export type QaseCasesUpdateRequest = OperationRequest<"qase.cases.update">;
export type QaseCasesUpdateResponse = OperationResponse<"qase.cases.update">;

export type QaseDefectsCreateRequest = OperationRequest<"qase.defects.create">;
export type QaseDefectsCreateResponse = OperationResponse<"qase.defects.create">;

export type QaseResultsLogRequest = OperationRequest<"qase.results.log">;
export type QaseResultsLogResponse = OperationResponse<"qase.results.log">;

export interface Client {
  "adapter": {
    "connections": {
      "list": (options?: RequestOptions) => Promise<AdapterConnectionsListResponse>;
    };
    "health": (request: AdapterHealthRequest, options?: RequestOptions) => Promise<AdapterHealthResponse>;
    "info": (options?: RequestOptions) => Promise<AdapterInfoResponse>;
    "setup": {
      "start": (request: AdapterSetupStartRequest, options?: RequestOptions) => Promise<AdapterSetupStartResponse>;
      "submit": (request: AdapterSetupSubmitRequest, options?: RequestOptions) => Promise<AdapterSetupSubmitResponse>;
    };
  };
  "qase": {
    "cases": {
      "create": (request: QaseCasesCreateRequest, options?: RequestOptions) => Promise<QaseCasesCreateResponse>;
      "update": (request: QaseCasesUpdateRequest, options?: RequestOptions) => Promise<QaseCasesUpdateResponse>;
    };
    "defects": {
      "create": (request: QaseDefectsCreateRequest, options?: RequestOptions) => Promise<QaseDefectsCreateResponse>;
    };
    "results": {
      "log": (request: QaseResultsLogRequest, options?: RequestOptions) => Promise<QaseResultsLogResponse>;
    };
  };
}

export function createQaseAdapterClient(options: ClientOptions): Client {
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
    "qase": {
      "cases": {
        "create": async (request: QaseCasesCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<QaseCasesCreateResponse>({
        method: "POST",
        path: "/operations/qase.cases.create",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
        "update": async (request: QaseCasesUpdateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<QaseCasesUpdateResponse>({
        method: "POST",
        path: "/operations/qase.cases.update",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
      },
      "defects": {
        "create": async (request: QaseDefectsCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<QaseDefectsCreateResponse>({
        method: "POST",
        path: "/operations/qase.defects.create",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
      },
      "results": {
        "log": async (request: QaseResultsLogRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<QaseResultsLogResponse>({
        method: "POST",
        path: "/operations/qase.results.log",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
      },
    },
  };
}
