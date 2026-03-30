import {
  HttpClient,
  type ClientOptions,
  type RequestOptions,
} from "./http.js";
import type { OperationRequest, OperationResponse } from "./types.js";

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
