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

export type LinkedinCommentsListRequest = OperationRequest<"linkedin.comments.list">;
export type LinkedinCommentsListResponse = OperationResponse<"linkedin.comments.list">;

export type LinkedinOrganizationsListRequest = OperationRequest<"linkedin.organizations.list">;
export type LinkedinOrganizationsListResponse = OperationResponse<"linkedin.organizations.list">;

export type LinkedinPostsCreateRequest = OperationRequest<"linkedin.posts.create">;
export type LinkedinPostsCreateResponse = OperationResponse<"linkedin.posts.create">;

export type LinkedinPostsGetRequest = OperationRequest<"linkedin.posts.get">;
export type LinkedinPostsGetResponse = OperationResponse<"linkedin.posts.get">;

export type LinkedinPostsListRequest = OperationRequest<"linkedin.posts.list">;
export type LinkedinPostsListResponse = OperationResponse<"linkedin.posts.list">;

export type LinkedinSocialMetadataGetRequest = OperationRequest<"linkedin.socialMetadata.get">;
export type LinkedinSocialMetadataGetResponse = OperationResponse<"linkedin.socialMetadata.get">;

export interface Client {
  "adapter": {
    "connections": {
      "list": (options?: RequestOptions) => Promise<AdapterConnectionsListResponse>;
    };
    "health": (request: AdapterHealthRequest, options?: RequestOptions) => Promise<AdapterHealthResponse>;
    "info": (options?: RequestOptions) => Promise<AdapterInfoResponse>;
  };
  "linkedin": {
    "comments": {
      "list": (request: LinkedinCommentsListRequest, options?: RequestOptions) => Promise<LinkedinCommentsListResponse>;
    };
    "organizations": {
      "list": (request: LinkedinOrganizationsListRequest, options?: RequestOptions) => Promise<LinkedinOrganizationsListResponse>;
    };
    "posts": {
      "create": (request: LinkedinPostsCreateRequest, options?: RequestOptions) => Promise<LinkedinPostsCreateResponse>;
      "get": (request: LinkedinPostsGetRequest, options?: RequestOptions) => Promise<LinkedinPostsGetResponse>;
      "list": (request: LinkedinPostsListRequest, options?: RequestOptions) => Promise<LinkedinPostsListResponse>;
    };
    "socialMetadata": {
      "get": (request: LinkedinSocialMetadataGetRequest, options?: RequestOptions) => Promise<LinkedinSocialMetadataGetResponse>;
    };
  };
}

export function createLinkedinAdapterClient(options: ClientOptions): Client {
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
    "linkedin": {
      "comments": {
        "list": async (request: LinkedinCommentsListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<LinkedinCommentsListResponse>({
        method: "POST",
        path: "/operations/linkedin.comments.list",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
      },
      "organizations": {
        "list": async (request: LinkedinOrganizationsListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<LinkedinOrganizationsListResponse>({
        method: "POST",
        path: "/operations/linkedin.organizations.list",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
      },
      "posts": {
        "create": async (request: LinkedinPostsCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<LinkedinPostsCreateResponse>({
        method: "POST",
        path: "/operations/linkedin.posts.create",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
        "get": async (request: LinkedinPostsGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<LinkedinPostsGetResponse>({
        method: "POST",
        path: "/operations/linkedin.posts.get",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
        "list": async (request: LinkedinPostsListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<LinkedinPostsListResponse>({
        method: "POST",
        path: "/operations/linkedin.posts.list",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
        "payload": input["payload"],
      },
        options,
      })
    },
      },
      "socialMetadata": {
        "get": async (request: LinkedinSocialMetadataGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<LinkedinSocialMetadataGetResponse>({
        method: "POST",
        path: "/operations/linkedin.socialMetadata.get",
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
