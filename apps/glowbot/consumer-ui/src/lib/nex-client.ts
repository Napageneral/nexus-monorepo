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
}

type RuntimeRequestFrame = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

type RuntimeResponseFrame<TPayload = unknown> = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: TPayload;
  error?: { code?: string; message?: string };
};

type RuntimeEventFrame = {
  type: "event";
  event?: string;
};

type RuntimeConnectParams = {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: "runtime-client";
    version: string;
    platform: string;
    mode: "backend";
  };
  caps: [];
  role: "operator";
  scopes: ["operator.admin"];
  auth?: {
    token?: string;
    password?: string;
  };
};

type RuntimeTokenResponseShape = {
  ok?: boolean;
  error?: string;
  detail?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  runtime?: {
    ws_url?: string;
  };
};

type RuntimeTokenState = {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
  runtimeWsUrl?: string;
};

const PROTOCOL_VERSION = 3;
const DEFAULT_TIMEOUT_MS = 10_000;
const TOKEN_REFRESH_HEADROOM_MS = 60_000;

let runtimeTokenCache: RuntimeTokenState | null = null;
let runtimeTokenInFlight: Promise<RuntimeTokenState> | null = null;

function envValue(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveConfiguredRuntimeWsUrl(options?: GlowbotRpcTransportOptions): string | undefined {
  const explicit = options?.runtimeWsUrl?.trim();
  if (explicit) {
    return explicit;
  }

  const fromEnv =
    envValue("GLOWBOT_RUNTIME_WS_URL") ?? envValue("NEXT_PUBLIC_GLOWBOT_RUNTIME_WS_URL");
  if (fromEnv) {
    return fromEnv;
  }

  return undefined;
}

function resolveBrowserFallbackRuntimeWsUrl(): string | undefined {
  if (typeof window !== "undefined" && window.location?.host) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/runtime/ws`;
  }
  return undefined;
}

function resolveRuntimeToken(options?: GlowbotRpcTransportOptions): string | undefined {
  const explicit = options?.runtimeToken?.trim();
  if (explicit) {
    return explicit;
  }
  return envValue("GLOWBOT_RUNTIME_TOKEN") ?? envValue("NEXT_PUBLIC_GLOWBOT_RUNTIME_TOKEN");
}

function resolveRuntimePassword(options?: GlowbotRpcTransportOptions): string | undefined {
  const explicit = options?.runtimePassword?.trim();
  if (explicit) {
    return explicit;
  }
  return envValue("GLOWBOT_RUNTIME_PASSWORD");
}

function resolveAutoRuntimeToken(options?: GlowbotRpcTransportOptions): boolean {
  if (typeof options?.autoRuntimeToken === "boolean") {
    return options.autoRuntimeToken;
  }
  const value = (
    envValue("GLOWBOT_AUTO_RUNTIME_TOKEN") ?? envValue("NEXT_PUBLIC_GLOWBOT_AUTO_RUNTIME_TOKEN")
  )
    ?.trim()
    .toLowerCase();
  if (!value) {
    return true;
  }
  return value !== "0" && value !== "false" && value !== "off";
}

function resolveTokenMintUrl(options?: GlowbotRpcTransportOptions): string {
  return (
    options?.runtimeTokenMintUrl?.trim() ||
    envValue("GLOWBOT_RUNTIME_TOKEN_MINT_URL") ||
    envValue("NEXT_PUBLIC_GLOWBOT_RUNTIME_TOKEN_MINT_URL") ||
    "/api/runtime/token"
  );
}

function resolveTokenRefreshUrl(options?: GlowbotRpcTransportOptions): string {
  return (
    options?.runtimeTokenRefreshUrl?.trim() ||
    envValue("GLOWBOT_RUNTIME_TOKEN_REFRESH_URL") ||
    envValue("NEXT_PUBLIC_GLOWBOT_RUNTIME_TOKEN_REFRESH_URL") ||
    "/api/runtime/token/refresh"
  );
}

function resolveFrontdoorClientId(options?: GlowbotRpcTransportOptions): string | undefined {
  return (
    options?.frontdoorClientId?.trim() ||
    envValue("GLOWBOT_FRONTDOOR_CLIENT_ID") ||
    envValue("NEXT_PUBLIC_GLOWBOT_FRONTDOOR_CLIENT_ID") ||
    "glowbot-web"
  );
}

function resolveFrontdoorWorkspaceId(options?: GlowbotRpcTransportOptions): string | undefined {
  return (
    options?.frontdoorWorkspaceId?.trim() ||
    envValue("GLOWBOT_FRONTDOOR_WORKSPACE_ID") ||
    envValue("NEXT_PUBLIC_GLOWBOT_FRONTDOOR_WORKSPACE_ID")
  );
}

function resolveTimeoutMs(options?: GlowbotRpcTransportOptions): number {
  const value = options?.timeoutMs;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  return DEFAULT_TIMEOUT_MS;
}

function resolveClientPlatform(): string {
  if (typeof navigator !== "undefined" && typeof navigator.platform === "string") {
    return navigator.platform || "web";
  }
  if (typeof process !== "undefined" && typeof process.platform === "string") {
    return process.platform;
  }
  return "unknown";
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `rpc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseRuntimeError(defaultMessage: string, error: unknown): Error {
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return new Error(message.trim());
    }
  }
  return new Error(defaultMessage);
}

function parseRuntimeTokenError(defaultMessage: string, payload: RuntimeTokenResponseShape): Error {
  if (typeof payload.error === "string" && payload.error.trim()) {
    if (typeof payload.detail === "string" && payload.detail.trim()) {
      return new Error(`${payload.error}: ${payload.detail}`);
    }
    return new Error(payload.error);
  }
  return new Error(defaultMessage);
}

function parseRuntimeTokenResponse(
  payload: RuntimeTokenResponseShape,
  fallbackMessage: string,
): RuntimeTokenState {
  if (payload.ok === false) {
    throw parseRuntimeTokenError(fallbackMessage, payload);
  }

  const accessToken = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token.trim() : "";
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : NaN;

  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error(fallbackMessage);
  }

  const runtimeWsUrl =
    payload.runtime && typeof payload.runtime.ws_url === "string" ? payload.runtime.ws_url.trim() : "";

  return {
    accessToken,
    refreshToken,
    expiresAtMs: Date.now() + expiresIn * 1000,
    runtimeWsUrl: runtimeWsUrl || undefined,
  };
}

function runtimeTokenFresh(token: RuntimeTokenState): boolean {
  return token.expiresAtMs - Date.now() > TOKEN_REFRESH_HEADROOM_MS;
}

function runtimeTokenBody(options?: GlowbotRpcTransportOptions): Record<string, string> {
  const body: Record<string, string> = {};
  const clientId = resolveFrontdoorClientId(options);
  const workspaceId = resolveFrontdoorWorkspaceId(options);
  if (clientId) {
    body.client_id = clientId;
  }
  if (workspaceId) {
    body.workspace_id = workspaceId;
  }
  return body;
}

async function postRuntimeTokenEndpoint(
  endpoint: string,
  body: Record<string, string>,
  fallbackMessage: string,
): Promise<RuntimeTokenState> {
  if (typeof fetch !== "function") {
    throw new Error("fetch is not available for runtime token minting");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload: RuntimeTokenResponseShape = {};
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as RuntimeTokenResponseShape;
    } catch {
      payload = {};
    }
  }

  if (!response.ok) {
    throw parseRuntimeTokenError(`${fallbackMessage} (status ${response.status})`, payload);
  }

  return parseRuntimeTokenResponse(payload, fallbackMessage);
}

async function mintRuntimeToken(options?: GlowbotRpcTransportOptions): Promise<RuntimeTokenState> {
  return await postRuntimeTokenEndpoint(
    resolveTokenMintUrl(options),
    runtimeTokenBody(options),
    "runtime token mint failed",
  );
}

async function refreshRuntimeToken(
  refreshToken: string,
  options?: GlowbotRpcTransportOptions,
): Promise<RuntimeTokenState> {
  return await postRuntimeTokenEndpoint(
    resolveTokenRefreshUrl(options),
    {
      ...runtimeTokenBody(options),
      refresh_token: refreshToken,
    },
    "runtime token refresh failed",
  );
}

function isBrowserContext(): boolean {
  return typeof window !== "undefined";
}

function clearRuntimeTokenState() {
  runtimeTokenCache = null;
  runtimeTokenInFlight = null;
}

async function getRuntimeTokenState(
  options?: GlowbotRpcTransportOptions,
): Promise<RuntimeTokenState | null> {
  if (resolveRuntimeToken(options)) {
    return null;
  }
  if (!resolveAutoRuntimeToken(options) || !isBrowserContext()) {
    return null;
  }

  if (runtimeTokenCache && runtimeTokenFresh(runtimeTokenCache)) {
    return runtimeTokenCache;
  }

  if (runtimeTokenInFlight) {
    return await runtimeTokenInFlight;
  }

  runtimeTokenInFlight = (async () => {
    if (runtimeTokenCache?.refreshToken) {
      try {
        const refreshed = await refreshRuntimeToken(runtimeTokenCache.refreshToken, options);
        runtimeTokenCache = refreshed;
        return refreshed;
      } catch {
        // refresh failed; mint next
      }
    }

    const minted = await mintRuntimeToken(options);
    runtimeTokenCache = minted;
    return minted;
  })();

  try {
    return await runtimeTokenInFlight;
  } finally {
    runtimeTokenInFlight = null;
  }
}

function shouldRetryWithFreshToken(
  options: GlowbotRpcTransportOptions | undefined,
  error: unknown,
): boolean {
  if (resolveRuntimeToken(options)) {
    return false;
  }
  if (!resolveAutoRuntimeToken(options) || !isBrowserContext()) {
    return false;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("unauthorized") || message.includes("token") || message.includes("expired");
}

function parseSocketMessageData(data: unknown): string | null {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }
  if (data && typeof data === "object" && "toString" in data) {
    const text = (data as { toString: () => string }).toString();
    return typeof text === "string" && text.length > 0 ? text : null;
  }
  return null;
}

function parseFrame(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function rpcCallRuntimeWs<TPayload = unknown, TParams = unknown>(
  method: string,
  params: TParams,
  options?: GlowbotRpcTransportOptions,
): Promise<TPayload> {
  const runtimeTokenState = await getRuntimeTokenState(options);
  const runtimeWsUrl =
    resolveConfiguredRuntimeWsUrl(options) ??
    runtimeTokenState?.runtimeWsUrl ??
    resolveBrowserFallbackRuntimeWsUrl();
  if (!runtimeWsUrl) {
    throw new Error("runtime ws transport selected but runtime ws url is not configured");
  }

  const WebSocketCtor = globalThis.WebSocket;
  if (typeof WebSocketCtor !== "function") {
    throw new Error("WebSocket is not available in this runtime");
  }

  const runtimeToken = resolveRuntimeToken(options) ?? runtimeTokenState?.accessToken;
  const runtimePassword = resolveRuntimePassword(options);
  const timeoutMs = resolveTimeoutMs(options);

  const connectId = createRequestId();
  const requestId = createRequestId();

  return await new Promise<TPayload>((resolve, reject) => {
    const socket = new WebSocketCtor(runtimeWsUrl);
    let connected = false;
    let settled = false;

    const cleanup = () => {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      clearTimeout(timeoutHandle);
    };

    const closeSocket = () => {
      try {
        socket.close();
      } catch {
        // no-op
      }
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      closeSocket();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const succeed = (payload: TPayload) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      closeSocket();
      resolve(payload);
    };

    const timeoutHandle = setTimeout(() => {
      fail(new Error(`runtime rpc timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const sendFrame = (frame: RuntimeRequestFrame) => {
      try {
        socket.send(JSON.stringify(frame));
      } catch (error) {
        fail(error);
      }
    };

    socket.onopen = () => {
      const connectParams: RuntimeConnectParams = {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        client: {
          id: "runtime-client",
          version: "glowbot-dev",
          platform: resolveClientPlatform(),
          mode: "backend",
        },
        caps: [],
        role: "operator",
        scopes: ["operator.admin"],
      };

      if (runtimeToken || runtimePassword) {
        connectParams.auth = {
          token: runtimeToken,
          password: runtimePassword,
        };
      }

      sendFrame({
        type: "req",
        id: connectId,
        method: "connect",
        params: connectParams,
      });
    };

    socket.onmessage = (event) => {
      const raw = parseSocketMessageData(event.data);
      if (!raw) {
        return;
      }
      const frame = parseFrame(raw);
      if (!frame) {
        return;
      }
      if (frame.type === "event") {
        const evt = frame as RuntimeEventFrame;
        if (evt.event === "connect.challenge") {
          return;
        }
        return;
      }
      if (frame.type !== "res") {
        return;
      }

      const response = frame as RuntimeResponseFrame<TPayload>;
      if (response.id === connectId) {
        if (!response.ok) {
          fail(parseRuntimeError("runtime connect failed", response.error));
          return;
        }
        connected = true;
        sendFrame({
          type: "req",
          id: requestId,
          method,
          params,
        });
        return;
      }

      if (response.id !== requestId) {
        return;
      }

      if (!connected) {
        fail(new Error("runtime request response received before connect completed"));
        return;
      }

      if (!response.ok) {
        fail(parseRuntimeError(`runtime method ${method} failed`, response.error));
        return;
      }

      succeed(response.payload as TPayload);
    };

    socket.onerror = () => {
      fail(new Error("runtime websocket error"));
    };

    socket.onclose = (event) => {
      if (settled) {
        return;
      }
      const reason = typeof event.reason === "string" ? event.reason : "";
      fail(new Error(`runtime closed (${event.code}): ${reason}`));
    };
  });
}

export async function rpcCall<TPayload = unknown, TParams = unknown>(
  method: string,
  params: TParams,
  options?: GlowbotRpcTransportOptions,
): Promise<TPayload> {
  try {
    return await rpcCallRuntimeWs<TPayload, TParams>(method, params, options);
  } catch (error) {
    if (!shouldRetryWithFreshToken(options, error)) {
      throw error;
    }
    clearRuntimeTokenState();
    return await rpcCallRuntimeWs<TPayload, TParams>(method, params, options);
  }
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
