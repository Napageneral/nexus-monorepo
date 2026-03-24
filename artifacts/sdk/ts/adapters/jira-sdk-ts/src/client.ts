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

export type JiraCommentsCreateRequest = OperationRequest<"jira.comments.create">;
export type JiraCommentsCreateResponse = OperationResponse<"jira.comments.create">;

export type JiraIssuesAssignRequest = OperationRequest<"jira.issues.assign">;
export type JiraIssuesAssignResponse = OperationResponse<"jira.issues.assign">;

export type JiraIssuesCreateRequest = OperationRequest<"jira.issues.create">;
export type JiraIssuesCreateResponse = OperationResponse<"jira.issues.create">;

export type JiraIssuesLabelsAddRequest = OperationRequest<"jira.issues.labels.add">;
export type JiraIssuesLabelsAddResponse = OperationResponse<"jira.issues.labels.add">;

export type JiraTransitionsApplyRequest = OperationRequest<"jira.transitions.apply">;
export type JiraTransitionsApplyResponse = OperationResponse<"jira.transitions.apply">;

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
  "jira": {
    "comments": {
      "create": (request: JiraCommentsCreateRequest, options?: RequestOptions) => Promise<JiraCommentsCreateResponse>;
    };
    "issues": {
      "assign": (request: JiraIssuesAssignRequest, options?: RequestOptions) => Promise<JiraIssuesAssignResponse>;
      "create": (request: JiraIssuesCreateRequest, options?: RequestOptions) => Promise<JiraIssuesCreateResponse>;
      "labels": {
        "add": (request: JiraIssuesLabelsAddRequest, options?: RequestOptions) => Promise<JiraIssuesLabelsAddResponse>;
      };
    };
    "transitions": {
      "apply": (request: JiraTransitionsApplyRequest, options?: RequestOptions) => Promise<JiraTransitionsApplyResponse>;
    };
  };
}

export function createJiraAdapterClient(options: ClientOptions): Client {
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
    "jira": {
      "comments": {
        "create": async (request: JiraCommentsCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<JiraCommentsCreateResponse>({
        method: "POST",
        path: "/operations/jira.comments.create",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
      },
      "issues": {
        "assign": async (request: JiraIssuesAssignRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<JiraIssuesAssignResponse>({
        method: "POST",
        path: "/operations/jira.issues.assign",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
        "create": async (request: JiraIssuesCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<JiraIssuesCreateResponse>({
        method: "POST",
        path: "/operations/jira.issues.create",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
        "labels": {
          "add": async (request: JiraIssuesLabelsAddRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<JiraIssuesLabelsAddResponse>({
        method: "POST",
        path: "/operations/jira.issues.labels.add",
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
      "transitions": {
        "apply": async (request: JiraTransitionsApplyRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<JiraTransitionsApplyResponse>({
        method: "POST",
        path: "/operations/jira.transitions.apply",
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
