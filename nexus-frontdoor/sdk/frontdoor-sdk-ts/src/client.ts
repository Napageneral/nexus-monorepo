import {
  HttpClient,
  interpolatePath,
  type ClientOptions,
  type RequestOptions,
} from "./http.js";
import type { OperationRequest, OperationResponse } from "./types.js";

export type FrontdoorAppsCatalogRequest = OperationRequest<"frontdoor.apps.catalog">;
export type FrontdoorAppsCatalogResponse = OperationResponse<"frontdoor.apps.catalog">;

export type FrontdoorAuthLoginRequest = OperationRequest<"frontdoor.auth.login">;
export type FrontdoorAuthLoginResponse = OperationResponse<"frontdoor.auth.login">;

export type FrontdoorAuthMeRequest = OperationRequest<"frontdoor.auth.me">;
export type FrontdoorAuthMeResponse = OperationResponse<"frontdoor.auth.me">;

export type FrontdoorRuntimeTokenIssueRequest = OperationRequest<"frontdoor.runtime.token.issue">;
export type FrontdoorRuntimeTokenIssueResponse = OperationResponse<"frontdoor.runtime.token.issue">;

export type FrontdoorRuntimeTokenRefreshRequest = OperationRequest<"frontdoor.runtime.token.refresh">;
export type FrontdoorRuntimeTokenRefreshResponse = OperationResponse<"frontdoor.runtime.token.refresh">;

export type FrontdoorRuntimeTokenRevokeRequest = OperationRequest<"frontdoor.runtime.token.revoke">;
export type FrontdoorRuntimeTokenRevokeResponse = OperationResponse<"frontdoor.runtime.token.revoke">;

export type FrontdoorServersAdaptersInstallRequest = OperationRequest<"frontdoor.servers.adapters.install">;
export type FrontdoorServersAdaptersInstallResponse = OperationResponse<"frontdoor.servers.adapters.install">;

export type FrontdoorServersAdaptersInstallStatusRequest = OperationRequest<"frontdoor.servers.adapters.installStatus">;
export type FrontdoorServersAdaptersInstallStatusResponse = OperationResponse<"frontdoor.servers.adapters.installStatus">;

export type FrontdoorServersAdaptersUninstallRequest = OperationRequest<"frontdoor.servers.adapters.uninstall">;
export type FrontdoorServersAdaptersUninstallResponse = OperationResponse<"frontdoor.servers.adapters.uninstall">;

export type FrontdoorServersAdaptersUpgradeRequest = OperationRequest<"frontdoor.servers.adapters.upgrade">;
export type FrontdoorServersAdaptersUpgradeResponse = OperationResponse<"frontdoor.servers.adapters.upgrade">;

export type FrontdoorServersAppsInstallRequest = OperationRequest<"frontdoor.servers.apps.install">;
export type FrontdoorServersAppsInstallResponse = OperationResponse<"frontdoor.servers.apps.install">;

export type FrontdoorServersAppsInstallStatusRequest = OperationRequest<"frontdoor.servers.apps.installStatus">;
export type FrontdoorServersAppsInstallStatusResponse = OperationResponse<"frontdoor.servers.apps.installStatus">;

export type FrontdoorServersAppsUninstallRequest = OperationRequest<"frontdoor.servers.apps.uninstall">;
export type FrontdoorServersAppsUninstallResponse = OperationResponse<"frontdoor.servers.apps.uninstall">;

export type FrontdoorServersAppsUpgradeRequest = OperationRequest<"frontdoor.servers.apps.upgrade">;
export type FrontdoorServersAppsUpgradeResponse = OperationResponse<"frontdoor.servers.apps.upgrade">;

export type FrontdoorServersGetRequest = OperationRequest<"frontdoor.servers.get">;
export type FrontdoorServersGetResponse = OperationResponse<"frontdoor.servers.get">;

export interface Client {
  "apps": {
    "catalog": (options?: RequestOptions) => Promise<FrontdoorAppsCatalogResponse>;
  };
  "auth": {
    "login": (request: FrontdoorAuthLoginRequest, options?: RequestOptions) => Promise<FrontdoorAuthLoginResponse>;
    "me": (options?: RequestOptions) => Promise<FrontdoorAuthMeResponse>;
  };
  "runtime": {
    "token": {
      "issue": (request: FrontdoorRuntimeTokenIssueRequest, options?: RequestOptions) => Promise<FrontdoorRuntimeTokenIssueResponse>;
      "refresh": (request: FrontdoorRuntimeTokenRefreshRequest, options?: RequestOptions) => Promise<FrontdoorRuntimeTokenRefreshResponse>;
      "revoke": (request: FrontdoorRuntimeTokenRevokeRequest, options?: RequestOptions) => Promise<FrontdoorRuntimeTokenRevokeResponse>;
    };
  };
  "servers": {
    "adapters": {
      "install": (request: FrontdoorServersAdaptersInstallRequest, options?: RequestOptions) => Promise<FrontdoorServersAdaptersInstallResponse>;
      "installStatus": (request: FrontdoorServersAdaptersInstallStatusRequest, options?: RequestOptions) => Promise<FrontdoorServersAdaptersInstallStatusResponse>;
      "uninstall": (request: FrontdoorServersAdaptersUninstallRequest, options?: RequestOptions) => Promise<FrontdoorServersAdaptersUninstallResponse>;
      "upgrade": (request: FrontdoorServersAdaptersUpgradeRequest, options?: RequestOptions) => Promise<FrontdoorServersAdaptersUpgradeResponse>;
    };
    "apps": {
      "install": (request: FrontdoorServersAppsInstallRequest, options?: RequestOptions) => Promise<FrontdoorServersAppsInstallResponse>;
      "installStatus": (request: FrontdoorServersAppsInstallStatusRequest, options?: RequestOptions) => Promise<FrontdoorServersAppsInstallStatusResponse>;
      "uninstall": (request: FrontdoorServersAppsUninstallRequest, options?: RequestOptions) => Promise<FrontdoorServersAppsUninstallResponse>;
      "upgrade": (request: FrontdoorServersAppsUpgradeRequest, options?: RequestOptions) => Promise<FrontdoorServersAppsUpgradeResponse>;
    };
    "get": (request: FrontdoorServersGetRequest, options?: RequestOptions) => Promise<FrontdoorServersGetResponse>;
  };
}

export function createFrontdoorClient(options: ClientOptions): Client {
  const http = new HttpClient(options);
  return {
    "apps": {
      "catalog": async (options?: RequestOptions) => {
      return http.request<FrontdoorAppsCatalogResponse>({
        method: "GET",
        path: "/api/apps/catalog",
        query: undefined,
        body: undefined,
        options,
      })
    },
    },
    "auth": {
      "login": async (request: FrontdoorAuthLoginRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<FrontdoorAuthLoginResponse>({
        method: "POST",
        path: "/api/auth/login",
        query: undefined,
        body: {
        "username": input["username"],
        "password": input["password"],
      },
        options,
      })
    },
      "me": async (options?: RequestOptions) => {
      return http.request<FrontdoorAuthMeResponse>({
        method: "GET",
        path: "/api/auth/me",
        query: undefined,
        body: undefined,
        options,
      })
    },
    },
    "runtime": {
      "token": {
        "issue": async (request: FrontdoorRuntimeTokenIssueRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<FrontdoorRuntimeTokenIssueResponse>({
        method: "POST",
        path: "/api/runtime/token",
        query: undefined,
        body: {
        "client_id": input["client_id"],
        "server_id": input["server_id"],
      },
        options,
      })
    },
        "refresh": async (request: FrontdoorRuntimeTokenRefreshRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<FrontdoorRuntimeTokenRefreshResponse>({
        method: "POST",
        path: "/api/runtime/token/refresh",
        query: undefined,
        body: {
        "refresh_token": input["refresh_token"],
        "client_id": input["client_id"],
        "server_id": input["server_id"],
      },
        options,
      })
    },
        "revoke": async (request: FrontdoorRuntimeTokenRevokeRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<FrontdoorRuntimeTokenRevokeResponse>({
        method: "POST",
        path: "/api/runtime/token/revoke",
        query: undefined,
        body: {
        "refresh_token": input["refresh_token"],
      },
        options,
      })
    },
      },
    },
    "servers": {
      "adapters": {
        "install": async (request: FrontdoorServersAdaptersInstallRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<FrontdoorServersAdaptersInstallResponse>({
        method: "POST",
        path: interpolatePath("/api/servers/{serverId}/adapters/{adapterId}/install", {
        "serverId": input["serverId"],
        "adapterId": input["adapterId"],
      }),
        query: undefined,
        body: {
        "version": input["version"],
      },
        options,
      })
    },
        "installStatus": async (request: FrontdoorServersAdaptersInstallStatusRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<FrontdoorServersAdaptersInstallStatusResponse>({
        method: "GET",
        path: interpolatePath("/api/servers/{serverId}/adapters/{adapterId}/install-status", {
        "serverId": input["serverId"],
        "adapterId": input["adapterId"],
      }),
        query: undefined,
        body: undefined,
        options,
      })
    },
        "uninstall": async (request: FrontdoorServersAdaptersUninstallRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<FrontdoorServersAdaptersUninstallResponse>({
        method: "DELETE",
        path: interpolatePath("/api/servers/{serverId}/adapters/{adapterId}/install", {
        "serverId": input["serverId"],
        "adapterId": input["adapterId"],
      }),
        query: undefined,
        body: undefined,
        options,
      })
    },
        "upgrade": async (request: FrontdoorServersAdaptersUpgradeRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<FrontdoorServersAdaptersUpgradeResponse>({
        method: "POST",
        path: interpolatePath("/api/servers/{serverId}/adapters/{adapterId}/upgrade", {
        "serverId": input["serverId"],
        "adapterId": input["adapterId"],
      }),
        query: undefined,
        body: {
        "target_version": input["target_version"],
      },
        options,
      })
    },
      },
      "apps": {
        "install": async (request: FrontdoorServersAppsInstallRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<FrontdoorServersAppsInstallResponse>({
        method: "POST",
        path: interpolatePath("/api/servers/{serverId}/apps/{appId}/install", {
        "serverId": input["serverId"],
        "appId": input["appId"],
      }),
        query: undefined,
        body: undefined,
        options,
      })
    },
        "installStatus": async (request: FrontdoorServersAppsInstallStatusRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<FrontdoorServersAppsInstallStatusResponse>({
        method: "GET",
        path: interpolatePath("/api/servers/{serverId}/apps/{appId}/install-status", {
        "serverId": input["serverId"],
        "appId": input["appId"],
      }),
        query: undefined,
        body: undefined,
        options,
      })
    },
        "uninstall": async (request: FrontdoorServersAppsUninstallRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<FrontdoorServersAppsUninstallResponse>({
        method: "DELETE",
        path: interpolatePath("/api/servers/{serverId}/apps/{appId}/install", {
        "serverId": input["serverId"],
        "appId": input["appId"],
      }),
        query: undefined,
        body: undefined,
        options,
      })
    },
        "upgrade": async (request: FrontdoorServersAppsUpgradeRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<FrontdoorServersAppsUpgradeResponse>({
        method: "POST",
        path: interpolatePath("/api/servers/{serverId}/apps/{appId}/upgrade", {
        "serverId": input["serverId"],
        "appId": input["appId"],
      }),
        query: undefined,
        body: {
        "target_version": input["target_version"],
      },
        options,
      })
    },
      },
      "get": async (request: FrontdoorServersGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<FrontdoorServersGetResponse>({
        method: "GET",
        path: interpolatePath("/api/servers/{serverId}", {
        "serverId": input["serverId"],
      }),
        query: undefined,
        body: undefined,
        options,
      })
    },
    },
  };
}
