import { GLOWBOT_METHODS } from "./glowbot";

export type GlowbotRpcMethod = (typeof GLOWBOT_METHODS)[keyof typeof GLOWBOT_METHODS];

export interface GlowbotRpcRequest<TParams = unknown> {
  id?: string;
  method: string;
  params: TParams;
}

export interface GlowbotRpcResponse<TPayload = unknown> {
  id?: string;
  ok: boolean;
  payload?: TPayload;
  error?: string;
}

export interface GlowbotRpcTransportOptions {
  runtimeWsUrl?: string;
  runtimeToken?: string;
  runtimePassword?: string;
  autoRuntimeToken?: boolean;
  runtimeTokenMintUrl?: string;
  runtimeTokenRefreshUrl?: string;
  frontdoorClientId?: string;
  frontdoorWorkspaceId?: string;
  timeoutMs?: number;
  clientVersion?: string;
}

type RuntimeBridge = {
  rpcCall<TPayload = unknown, TParams = unknown>(
    method: string,
    params: TParams,
    options?: GlowbotRpcTransportOptions,
  ): Promise<TPayload>;
  clearRuntimeTokenState?: () => void;
};

declare global {
  interface Window {
    NexusRuntimeBridge?: RuntimeBridge;
  }
}

function envValue(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveTransportOptions(options?: GlowbotRpcTransportOptions): GlowbotRpcTransportOptions {
  return {
    runtimeWsUrl:
      options?.runtimeWsUrl?.trim() ||
      envValue("GLOWBOT_RUNTIME_WS_URL") ||
      envValue("NEXT_PUBLIC_GLOWBOT_RUNTIME_WS_URL"),
    runtimeToken:
      options?.runtimeToken?.trim() ||
      envValue("GLOWBOT_RUNTIME_TOKEN") ||
      envValue("NEXT_PUBLIC_GLOWBOT_RUNTIME_TOKEN"),
    runtimePassword: options?.runtimePassword?.trim() || envValue("GLOWBOT_RUNTIME_PASSWORD"),
    autoRuntimeToken:
      typeof options?.autoRuntimeToken === "boolean"
        ? options.autoRuntimeToken
        : (() => {
            const raw = (
              envValue("GLOWBOT_AUTO_RUNTIME_TOKEN") ||
              envValue("NEXT_PUBLIC_GLOWBOT_AUTO_RUNTIME_TOKEN")
            )
              ?.trim()
              .toLowerCase();
            if (!raw) {
              return true;
            }
            return raw !== "0" && raw !== "false" && raw !== "off";
          })(),
    runtimeTokenMintUrl:
      options?.runtimeTokenMintUrl?.trim() ||
      envValue("GLOWBOT_RUNTIME_TOKEN_MINT_URL") ||
      envValue("NEXT_PUBLIC_GLOWBOT_RUNTIME_TOKEN_MINT_URL"),
    runtimeTokenRefreshUrl:
      options?.runtimeTokenRefreshUrl?.trim() ||
      envValue("GLOWBOT_RUNTIME_TOKEN_REFRESH_URL") ||
      envValue("NEXT_PUBLIC_GLOWBOT_RUNTIME_TOKEN_REFRESH_URL"),
    frontdoorClientId:
      options?.frontdoorClientId?.trim() ||
      envValue("GLOWBOT_FRONTDOOR_CLIENT_ID") ||
      envValue("NEXT_PUBLIC_GLOWBOT_FRONTDOOR_CLIENT_ID"),
    frontdoorWorkspaceId:
      options?.frontdoorWorkspaceId?.trim() ||
      envValue("GLOWBOT_FRONTDOOR_WORKSPACE_ID") ||
      envValue("NEXT_PUBLIC_GLOWBOT_FRONTDOOR_WORKSPACE_ID"),
    timeoutMs: options?.timeoutMs,
    clientVersion: options?.clientVersion?.trim() || "glowbot-web",
  };
}

function getRuntimeBridge(): RuntimeBridge {
  const bridge =
    (typeof window !== "undefined" ? window.NexusRuntimeBridge : undefined) ||
    ((globalThis as typeof globalThis & { NexusRuntimeBridge?: RuntimeBridge }).NexusRuntimeBridge ??
      undefined);
  if (!bridge || typeof bridge.rpcCall !== "function") {
    throw new Error("nexus runtime bridge unavailable");
  }
  return bridge;
}

export async function rpcCall<TPayload = unknown, TParams = unknown>(
  method: string,
  params: TParams,
  options?: GlowbotRpcTransportOptions,
): Promise<TPayload> {
  return await getRuntimeBridge().rpcCall<TPayload, TParams>(
    method,
    params,
    resolveTransportOptions(options),
  );
}

export async function rpcDispatch<TPayload = unknown, TParams = unknown>(
  request: GlowbotRpcRequest<TParams>,
  options?: GlowbotRpcTransportOptions,
): Promise<GlowbotRpcResponse<TPayload>> {
  try {
    const payload = await rpcCall<TPayload, TParams>(request.method, request.params, options);
    return {
      id: request.id,
      ok: true,
      payload,
    };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
