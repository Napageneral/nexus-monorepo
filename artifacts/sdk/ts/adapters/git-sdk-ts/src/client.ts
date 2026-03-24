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

export type GitBranchesCreateRequest = OperationRequest<"git.branches.create">;
export type GitBranchesCreateResponse = OperationResponse<"git.branches.create">;

export type GitPullRequestsCommentsCreateRequest = OperationRequest<"git.pull_requests.comments.create">;
export type GitPullRequestsCommentsCreateResponse = OperationResponse<"git.pull_requests.comments.create">;

export type GitPullRequestsCreateRequest = OperationRequest<"git.pull_requests.create">;
export type GitPullRequestsCreateResponse = OperationResponse<"git.pull_requests.create">;

export type GitPullRequestsMergeRequest = OperationRequest<"git.pull_requests.merge">;
export type GitPullRequestsMergeResponse = OperationResponse<"git.pull_requests.merge">;

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
  "git": {
    "branches": {
      "create": (request: GitBranchesCreateRequest, options?: RequestOptions) => Promise<GitBranchesCreateResponse>;
    };
    "pull_requests": {
      "comments": {
        "create": (request: GitPullRequestsCommentsCreateRequest, options?: RequestOptions) => Promise<GitPullRequestsCommentsCreateResponse>;
      };
      "create": (request: GitPullRequestsCreateRequest, options?: RequestOptions) => Promise<GitPullRequestsCreateResponse>;
      "merge": (request: GitPullRequestsMergeRequest, options?: RequestOptions) => Promise<GitPullRequestsMergeResponse>;
    };
  };
}

export function createGitAdapterClient(options: ClientOptions): Client {
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
    "git": {
      "branches": {
        "create": async (request: GitBranchesCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<GitBranchesCreateResponse>({
        method: "POST",
        path: "/operations/git.branches.create",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
      },
      "pull_requests": {
        "comments": {
          "create": async (request: GitPullRequestsCommentsCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<GitPullRequestsCommentsCreateResponse>({
        method: "POST",
        path: "/operations/git.pull_requests.comments.create",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
        },
        "create": async (request: GitPullRequestsCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<GitPullRequestsCreateResponse>({
        method: "POST",
        path: "/operations/git.pull_requests.create",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
        "merge": async (request: GitPullRequestsMergeRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<GitPullRequestsMergeResponse>({
        method: "POST",
        path: "/operations/git.pull_requests.merge",
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
