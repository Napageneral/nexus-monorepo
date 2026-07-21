import { createHmac } from "node:crypto";

export const ALIBABA_OPEN_PLATFORM_ENDPOINT = "https://eco.taobao.com/router/rest";
export const ALIBABA_CONVERSATION_LIST_METHOD =
  "alibaba.interaction.im.conversation.list.query";
export const ALIBABA_MESSAGE_LIST_METHOD = "alibaba.interaction.im.message.list.query";

export type AlibabaOpenPlatformInputs = {
  app_key: string;
  app_secret: string;
  seller_account_id: string;
  self_account_id: string;
};

export type AlibabaEligibilityAssessment = {
  state:
    | "blocked_missing_app_credentials"
    | "blocked_missing_account_identifiers"
    | "ready_for_read_probe";
  app_credentials_present: boolean;
  seller_account_id_present: boolean;
  self_account_id_present: boolean;
  provider_call_performed: false;
  remote_mutation_enabled: false;
};

export type AlibabaReadProbeResult = {
  state: "eligible" | "api_refused" | "invalid_response";
  conversation_list_accessible: boolean;
  message_list_accessible: boolean;
  conversation_count: number;
  message_count: number;
  provider_call_performed: true;
  remote_mutation_enabled: false;
  provider_error_code?: string;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Pick<Response, "status" | "headers" | "json">>;

function exactText(value: unknown, maxBytes: number): string {
  if (typeof value !== "string" || value !== value.trim() || !value) return "";
  if (Buffer.byteLength(value, "utf8") > maxBytes) return "";
  return value;
}

function accountIdentifier(value: unknown): string {
  const text = exactText(value, 128);
  return /^[A-Za-z0-9._@:+\-$]+$/.test(text) ? text : "";
}

export function readAlibabaOpenPlatformInputs(
  env: NodeJS.ProcessEnv,
): Partial<AlibabaOpenPlatformInputs> {
  const appKey = exactText(env.ALIBABA_OPEN_PLATFORM_APP_KEY, 256);
  const appSecret = exactText(env.ALIBABA_OPEN_PLATFORM_APP_SECRET, 1024);
  const sellerAccountId = accountIdentifier(env.ALIBABA_OPEN_PLATFORM_SELLER_ACCOUNT_ID);
  const selfAccountId = accountIdentifier(env.ALIBABA_OPEN_PLATFORM_SELF_ACCOUNT_ID);
  return {
    ...(appKey ? { app_key: appKey } : {}),
    ...(appSecret ? { app_secret: appSecret } : {}),
    ...(sellerAccountId ? { seller_account_id: sellerAccountId } : {}),
    ...(selfAccountId ? { self_account_id: selfAccountId } : {}),
  };
}

export function assessAlibabaOpenPlatformEligibility(
  inputs: Partial<AlibabaOpenPlatformInputs>,
): AlibabaEligibilityAssessment {
  const appCredentialsPresent = Boolean(inputs.app_key && inputs.app_secret);
  const sellerAccountIdPresent = Boolean(inputs.seller_account_id);
  const selfAccountIdPresent = Boolean(inputs.self_account_id);
  return {
    state: !appCredentialsPresent
      ? "blocked_missing_app_credentials"
      : !sellerAccountIdPresent || !selfAccountIdPresent
        ? "blocked_missing_account_identifiers"
        : "ready_for_read_probe",
    app_credentials_present: appCredentialsPresent,
    seller_account_id_present: sellerAccountIdPresent,
    self_account_id_present: selfAccountIdPresent,
    provider_call_performed: false,
    remote_mutation_enabled: false,
  };
}

function utcPlusEightTimestamp(now: Date): string {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 19).replace("T", " ");
}

export function signAlibabaTopParams(
  params: Record<string, string>,
  appSecret: string,
): string {
  const secret = exactText(appSecret, 1024);
  if (!secret) throw new Error("Alibaba app secret is invalid");
  const canonical = Object.entries(params)
    .filter(([name]) => name !== "sign")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}${value}`)
    .join("");
  return createHmac("md5", secret).update(canonical, "utf8").digest("hex").toUpperCase();
}

export function buildAlibabaTopRequest(input: {
  app_key: string;
  app_secret: string;
  method: string;
  params: Record<string, unknown>;
  now: Date;
}): URLSearchParams {
  const appKey = exactText(input.app_key, 256);
  const method = exactText(input.method, 256);
  if (!appKey || !method) throw new Error("Alibaba app key or method is invalid");
  const common: Record<string, string> = {
    app_key: appKey,
    format: "json",
    method,
    sign_method: "hmac",
    timestamp: utcPlusEightTimestamp(input.now),
    v: "2.0",
    params: JSON.stringify(input.params),
  };
  return new URLSearchParams({
    ...common,
    sign: signAlibabaTopParams(common, input.app_secret),
  });
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function responseResult(payload: unknown, responseKey: string): Record<string, unknown> {
  return asObject(asObject(asObject(payload)[responseKey]).result);
}

function responseRows(result: Record<string, unknown>, rowKey: string): Record<string, unknown>[] {
  const data = asObject(result.data);
  const list = asObject(data.list);
  const value = list[rowKey];
  if (Array.isArray(value)) return value.map(asObject);
  if (value && typeof value === "object") return [asObject(value)];
  return [];
}

function providerErrorCode(payload: unknown): string | undefined {
  const error = asObject(asObject(payload).error_response);
  const code = error.sub_code ?? error.code;
  return typeof code === "string" || typeof code === "number" ? String(code) : undefined;
}

async function postSigned(
  fetcher: FetchLike,
  body: URLSearchParams,
): Promise<{ status: number; payload: unknown }> {
  const response = await fetcher(ALIBABA_OPEN_PLATFORM_ENDPOINT, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=utf-8",
      accept: "application/json",
    },
    body,
  });
  if (response.status !== 200) return { status: response.status, payload: null };
  return { status: response.status, payload: await response.json() };
}

export async function probeAlibabaOpenPlatformReadAccess(input: {
  credentials: AlibabaOpenPlatformInputs;
  fetcher?: FetchLike;
  now?: Date;
}): Promise<AlibabaReadProbeResult> {
  const assessment = assessAlibabaOpenPlatformEligibility(input.credentials);
  if (assessment.state !== "ready_for_read_probe") {
    throw new Error(`Alibaba read probe is not ready: ${assessment.state}`);
  }
  const fetcher = input.fetcher ?? fetch;
  const now = input.now ?? new Date();
  const conversationResponse = await postSigned(
    fetcher,
    buildAlibabaTopRequest({
      app_key: input.credentials.app_key,
      app_secret: input.credentials.app_secret,
      method: ALIBABA_CONVERSATION_LIST_METHOD,
      params: {
        seller_account_id: input.credentials.seller_account_id,
        limit_time_stamp: 0,
        count: 1,
      },
      now,
    }),
  );
  if (conversationResponse.status !== 200) {
    return {
      state: "api_refused",
      conversation_list_accessible: false,
      message_list_accessible: false,
      conversation_count: 0,
      message_count: 0,
      provider_call_performed: true,
      remote_mutation_enabled: false,
      provider_error_code: `http_${conversationResponse.status}`,
    };
  }
  const conversationError = providerErrorCode(conversationResponse.payload);
  if (conversationError) {
    return {
      state: "api_refused",
      conversation_list_accessible: false,
      message_list_accessible: false,
      conversation_count: 0,
      message_count: 0,
      provider_call_performed: true,
      remote_mutation_enabled: false,
      provider_error_code: conversationError,
    };
  }
  const conversationResult = responseResult(
    conversationResponse.payload,
    "alibaba_interaction_im_conversation_list_query_response",
  );
  if (conversationResult.success !== true) {
    return {
      state: "invalid_response",
      conversation_list_accessible: false,
      message_list_accessible: false,
      conversation_count: 0,
      message_count: 0,
      provider_call_performed: true,
      remote_mutation_enabled: false,
    };
  }
  const conversations = responseRows(conversationResult, "conversation_d_t_o");
  if (conversations.length === 0) {
    return {
      state: "eligible",
      conversation_list_accessible: true,
      message_list_accessible: true,
      conversation_count: 0,
      message_count: 0,
      provider_call_performed: true,
      remote_mutation_enabled: false,
    };
  }
  const conversationId = exactText(conversations[0]!.conversation_id, 512);
  if (!conversationId) {
    return {
      state: "invalid_response",
      conversation_list_accessible: true,
      message_list_accessible: false,
      conversation_count: conversations.length,
      message_count: 0,
      provider_call_performed: true,
      remote_mutation_enabled: false,
    };
  }
  const messageResponse = await postSigned(
    fetcher,
    buildAlibabaTopRequest({
      app_key: input.credentials.app_key,
      app_secret: input.credentials.app_secret,
      method: ALIBABA_MESSAGE_LIST_METHOD,
      params: {
        conversation_id: conversationId,
        count: 1,
        forward: true,
        limit_time_stamp: 0,
        self_account_id: input.credentials.self_account_id,
      },
      now,
    }),
  );
  const messageError = providerErrorCode(messageResponse.payload);
  if (messageResponse.status !== 200 || messageError) {
    return {
      state: "api_refused",
      conversation_list_accessible: true,
      message_list_accessible: false,
      conversation_count: conversations.length,
      message_count: 0,
      provider_call_performed: true,
      remote_mutation_enabled: false,
      provider_error_code: messageError ?? `http_${messageResponse.status}`,
    };
  }
  const messageResult = responseResult(
    messageResponse.payload,
    "alibaba_interaction_im_message_list_query_response",
  );
  if (messageResult.success !== true) {
    return {
      state: "invalid_response",
      conversation_list_accessible: true,
      message_list_accessible: false,
      conversation_count: conversations.length,
      message_count: 0,
      provider_call_performed: true,
      remote_mutation_enabled: false,
    };
  }
  return {
    state: "eligible",
    conversation_list_accessible: true,
    message_list_accessible: true,
    conversation_count: conversations.length,
    message_count: responseRows(messageResult, "message_d_t_o").length,
    provider_call_performed: true,
    remote_mutation_enabled: false,
  };
}
