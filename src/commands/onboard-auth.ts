import type { OAuthCredentials, OAuthProvider } from "@mariozechner/pi-ai";
import { upsertAuthProfile } from "../agents/auth-profiles.js";
import type { NexusConfig } from "../config/config.js";

export async function writeOAuthCredentials(
  provider: OAuthProvider,
  creds: OAuthCredentials,
): Promise<void> {
  const access =
    "accessToken" in creds && typeof creds.accessToken === "string"
      ? creds.accessToken
      : typeof (creds as { access?: unknown }).access === "string"
        ? (creds as { access?: string }).access
        : undefined;
  const refresh =
    "refreshToken" in creds && typeof creds.refreshToken === "string"
      ? creds.refreshToken
      : typeof (creds as { refresh?: unknown }).refresh === "string"
        ? (creds as { refresh?: string }).refresh
        : undefined;
  const rawExpires =
    "expiresAt" in creds
      ? (creds as { expiresAt?: unknown }).expiresAt
      : (creds as { expires?: unknown }).expires;
  const parsedExpires =
    typeof rawExpires === "number"
      ? rawExpires
      : typeof rawExpires === "string"
        ? Number.parseInt(rawExpires, 10)
        : undefined;
  const expires =
    typeof parsedExpires === "number" && Number.isFinite(parsedExpires)
      ? parsedExpires
      : undefined;
  const email = typeof creds.email === "string" ? creds.email : undefined;
  upsertAuthProfile({
    profileId: `${provider}:${email ?? "default"}`,
    credential: {
      type: "oauth",
      provider,
      access,
      refresh,
      expires,
      email,
    },
  });
}

export async function setAnthropicApiKey(key: string) {
  upsertAuthProfile({
    profileId: "anthropic:default",
    credential: {
      type: "api_key",
      provider: "anthropic",
      key,
    },
  });
}

export function applyAuthProfileConfig(
  cfg: NexusConfig,
  params: {
    profileId: string;
    provider: string;
    mode: "api_key" | "oauth" | "token";
    email?: string;
  },
): NexusConfig {
  const profiles = {
    ...cfg.auth?.profiles,
    [params.profileId]: {
      provider: params.provider,
      mode: params.mode,
      ...(params.email ? { email: params.email } : {}),
    },
  };

  // Only maintain `auth.order` when the user explicitly configured it.
  // Default behavior: no explicit order -> resolveAuthProfileOrder can round-robin by lastUsed.
  const existingProviderOrder = cfg.auth?.order?.[params.provider];
  const order =
    existingProviderOrder !== undefined
      ? {
          ...cfg.auth?.order,
          [params.provider]: existingProviderOrder.includes(params.profileId)
            ? existingProviderOrder
            : [...existingProviderOrder, params.profileId],
        }
      : cfg.auth?.order;
  return {
    ...cfg,
    auth: {
      ...cfg.auth,
      profiles,
      ...(order ? { order } : {}),
    },
  };
}

export function applyMinimaxConfig(cfg: NexusConfig): NexusConfig {
  const models = { ...cfg.agent?.models };
  models["anthropic/claude-opus-4-5"] = {
    ...models["anthropic/claude-opus-4-5"],
    alias: models["anthropic/claude-opus-4-5"]?.alias ?? "Opus",
  };
  models["lmstudio/minimax-m2.1-gs32"] = {
    ...models["lmstudio/minimax-m2.1-gs32"],
    alias: models["lmstudio/minimax-m2.1-gs32"]?.alias ?? "Minimax",
  };

  const providers = { ...cfg.models?.providers };
  if (!providers.lmstudio) {
    providers.lmstudio = {
      baseUrl: "http://127.0.0.1:1234/v1",
      apiKey: "lmstudio",
      api: "openai-responses",
      models: [
        {
          id: "minimax-m2.1-gs32",
          name: "MiniMax M2.1 GS32",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 196608,
          maxTokens: 8192,
        },
      ],
    };
  }

  return {
    ...cfg,
    agent: {
      ...cfg.agent,
      model: {
        ...(cfg.agent?.model &&
        "fallbacks" in (cfg.agent.model as Record<string, unknown>)
          ? {
              fallbacks: (cfg.agent.model as { fallbacks?: string[] })
                .fallbacks,
            }
          : undefined),
        primary: "lmstudio/minimax-m2.1-gs32",
      },
      models,
    },
    models: {
      mode: cfg.models?.mode ?? "merge",
      providers,
    },
  };
}
