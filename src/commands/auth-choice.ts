import {
  CLAUDE_CLI_PROFILE_ID,
  ensureAuthProfileStore,
  upsertAuthProfile,
} from "../agents/auth-profiles.js";
import type { NexusConfig } from "../config/config.js";
import type { OAuthCredentials, OAuthProvider } from "@mariozechner/pi-ai";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import {
  buildTokenProfileId,
  validateAnthropicSetupToken,
} from "./auth-token.js";
import { CHUTES_TOKEN_ENDPOINT } from "../agents/chutes-oauth.js";
import { importCliCredential } from "./credential.js";
import { applyAuthProfileConfig, writeOAuthCredentials } from "./onboard-auth.js";
import type { AuthChoice } from "./onboard-types.js";

export async function applyAuthChoice(params: {
  authChoice: AuthChoice;
  config: NexusConfig;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  agentDir?: string;
  setDefaultModel: boolean;
  agentId?: string;
}): Promise<{ config: NexusConfig; agentModelOverride?: string }> {
  let nextConfig = params.config;
  const agentModelOverride: string | undefined = undefined;

  if (params.authChoice === "claude-cli") {
    const store = ensureAuthProfileStore();
    const hasClaudeCli = Boolean(store.profiles[CLAUDE_CLI_PROFILE_ID]);
    if (!hasClaudeCli && process.platform === "darwin") {
      await params.prompter.note(
        [
          "macOS will show a Keychain prompt next.",
          'Choose "Always Allow" so the launchd gateway can start without prompts.',
          'If you choose "Allow" or "Deny", each restart will block on a Keychain alert.',
        ].join("\n"),
        "Claude CLI Keychain",
      );
      const proceed = await params.prompter.confirm({
        message: "Check Keychain for Claude CLI credentials now?",
        initialValue: true,
      });
      if (!proceed) {
        return { config: nextConfig, agentModelOverride };
      }
    }

    let hasProfile = hasClaudeCli;
    if (!hasProfile) {
      try {
        await importCliCredential({
          source: "claude-cli",
          allowKeychainPrompt: true,
        });
      } catch {
        // ignore; we will prompt for setup-token below
      }
      const refreshed = ensureAuthProfileStore();
      hasProfile = Boolean(refreshed.profiles[CLAUDE_CLI_PROFILE_ID]);
    }

    if (!hasProfile) {
      if (process.stdin.isTTY) {
        const runNow = await params.prompter.confirm({
          message: "Run `claude setup-token` now?",
          initialValue: true,
        });
        if (runNow) {
          const res = await (async () => {
            const { spawnSync } = await import("node:child_process");
            return spawnSync("claude", ["setup-token"], { stdio: "inherit" });
          })();
          if (res.error) {
            await params.prompter.note(
              `Failed to run claude: ${String(res.error)}`,
              "Claude setup-token",
            );
          }
        }
      } else {
        await params.prompter.note(
          "`claude setup-token` requires an interactive TTY.",
          "Claude setup-token",
        );
      }

      try {
        await importCliCredential({
          source: "claude-cli",
          allowKeychainPrompt: true,
          force: true,
        });
      } catch {
        // ignore; handled below
      }
      const refreshed = ensureAuthProfileStore();
      if (!refreshed.profiles[CLAUDE_CLI_PROFILE_ID]) {
        await params.prompter.note(
          process.platform === "darwin"
            ? 'No Claude CLI credentials found in Keychain ("Claude Code-credentials") or ~/.claude/.credentials.json.'
            : "No Claude CLI credentials found at ~/.claude/.credentials.json.",
          "Claude CLI OAuth",
        );
        return { config: nextConfig, agentModelOverride };
      }
    }
    nextConfig = applyAuthProfileConfig(nextConfig, {
      profileId: CLAUDE_CLI_PROFILE_ID,
      provider: "anthropic",
      mode: "token",
    });
  } else if (
    params.authChoice === "setup-token" ||
    params.authChoice === "oauth"
  ) {
    await params.prompter.note(
      [
        "This will run `claude setup-token` to create a long-lived Anthropic token.",
        "Requires an interactive TTY and a Claude Pro/Max subscription.",
      ].join("\n"),
      "Anthropic setup-token",
    );

    if (!process.stdin.isTTY) {
      await params.prompter.note(
        "`claude setup-token` requires an interactive TTY.",
        "Anthropic setup-token",
      );
      return { config: nextConfig, agentModelOverride };
    }

    const proceed = await params.prompter.confirm({
      message: "Run `claude setup-token` now?",
      initialValue: true,
    });
    if (!proceed) return { config: nextConfig, agentModelOverride };

    const res = await (async () => {
      const { spawnSync } = await import("node:child_process");
      return spawnSync("claude", ["setup-token"], { stdio: "inherit" });
    })();
    if (res.error) {
      await params.prompter.note(
        `Failed to run claude: ${String(res.error)}`,
        "Anthropic setup-token",
      );
      return { config: nextConfig, agentModelOverride };
    }
    if (typeof res.status === "number" && res.status !== 0) {
      await params.prompter.note(
        `claude setup-token failed (exit ${res.status})`,
        "Anthropic setup-token",
      );
      return { config: nextConfig, agentModelOverride };
    }

    try {
      await importCliCredential({
        source: "claude-cli",
        allowKeychainPrompt: true,
        force: true,
      });
    } catch {
      // ignore; handled below
    }
    const store = ensureAuthProfileStore();
    if (!store.profiles[CLAUDE_CLI_PROFILE_ID]) {
      await params.prompter.note(
        `No Claude CLI credentials found after setup-token. Expected ${CLAUDE_CLI_PROFILE_ID}.`,
        "Anthropic setup-token",
      );
      return { config: nextConfig, agentModelOverride };
    }

    nextConfig = applyAuthProfileConfig(nextConfig, {
      profileId: CLAUDE_CLI_PROFILE_ID,
      provider: "anthropic",
      mode: "token",
    });
  } else if (params.authChoice === "token") {
    const provider = (await params.prompter.select({
      message: "Token provider",
      options: [{ value: "anthropic", label: "Anthropic (only supported)" }],
    })) as "anthropic";
    await params.prompter.note(
      [
        "Run `claude setup-token` in your terminal.",
        "Then paste the generated token below.",
      ].join("\n"),
      "Anthropic token",
    );

    const tokenRaw = await params.prompter.text({
      message: "Paste Anthropic setup-token",
      validate: (value) => validateAnthropicSetupToken(String(value ?? "")),
    });
    const tokenInput = String(tokenRaw).trim();
    const tokenMatch = tokenInput.match(/sk-ant-oat01-[A-Za-z0-9_-]+/);
    const token = tokenMatch?.[0] ?? tokenInput;

    const profileNameRaw = await params.prompter.text({
      message: "Token name (blank = default)",
      placeholder: "default",
    });
    const namedProfileId = buildTokenProfileId({
      provider,
      name: String(profileNameRaw ?? ""),
    });

    upsertAuthProfile({
      profileId: namedProfileId,
      credential: {
        type: "token",
        provider,
        token,
      },
    });

    nextConfig = applyAuthProfileConfig(nextConfig, {
      profileId: namedProfileId,
      provider,
      mode: "token",
    });
  } else if (params.authChoice === "chutes") {
    const clientId = process.env.CHUTES_CLIENT_ID?.trim();
    if (!clientId) {
      params.runtime.error("CHUTES_CLIENT_ID is required for Chutes OAuth.");
      params.runtime.exit(1);
      return { config: nextConfig, agentModelOverride };
    }
    const rawInput = await params.prompter.text({
      message: "Paste the redirect URL (or authorization code)",
    });
    const raw = String(rawInput ?? "").trim();
    if (!raw) {
      params.runtime.error("Missing Chutes authorization code.");
      params.runtime.exit(1);
      return { config: nextConfig, agentModelOverride };
    }
    let code = raw;
    try {
      const url = new URL(raw);
      code = url.searchParams.get("code") ?? url.searchParams.get("authorization_code") ?? raw;
    } catch {
      // leave raw as code
    }
    const tokenRes = await fetch(CHUTES_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
      }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "");
      params.runtime.error(
        `Chutes token exchange failed (${tokenRes.status}): ${text || "no response"}`,
      );
      params.runtime.exit(1);
      return { config: nextConfig, agentModelOverride };
    }
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number | string;
    };
    const accessToken = tokenJson.access_token?.trim();
    const refreshToken = tokenJson.refresh_token?.trim();
    if (!accessToken || !refreshToken) {
      params.runtime.error("Chutes token response missing access or refresh token.");
      params.runtime.exit(1);
      return { config: nextConfig, agentModelOverride };
    }
    const expiresIn =
      typeof tokenJson.expires_in === "number"
        ? tokenJson.expires_in
        : Number.parseInt(String(tokenJson.expires_in ?? ""), 10);
    const expiresAt =
      Number.isFinite(expiresIn) && expiresIn > 0
        ? Date.now() + expiresIn * 1000
        : undefined;
    const userRes = await fetch("https://api.chutes.ai/idp/userinfo", {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) {
      const text = await userRes.text().catch(() => "");
      params.runtime.error(
        `Chutes userinfo failed (${userRes.status}): ${text || "no response"}`,
      );
      params.runtime.exit(1);
      return { config: nextConfig, agentModelOverride };
    }
    const userJson = (await userRes.json()) as { username?: string; email?: string };
    const account = userJson.username?.trim() || userJson.email?.trim() || "default";
    const expires =
      typeof expiresAt === "number" && Number.isFinite(expiresAt)
        ? expiresAt
        : Date.now() + 3600_000;
    const oauthCreds: OAuthCredentials = {
      access: accessToken,
      refresh: refreshToken,
      expires,
      email: account,
    };
    await writeOAuthCredentials(
      "chutes" as unknown as OAuthProvider,
      oauthCreds,
    );
    const profileId = `chutes:${account}`;
    nextConfig = applyAuthProfileConfig(nextConfig, {
      profileId,
      provider: "chutes",
      mode: "oauth",
      email: account,
    });
  } else if (params.authChoice === "github-copilot") {
    try {
      const { githubCopilotLoginCommand } = await import(
        "../providers/github-copilot-auth.js"
      );
      await githubCopilotLoginCommand({ yes: true }, params.runtime);
    } catch (err) {
      params.runtime.error(`GitHub Copilot login failed: ${String(err)}`);
      params.runtime.exit(1);
      return { config: nextConfig, agentModelOverride };
    }
    const profileId = "github-copilot:github";
    nextConfig = applyAuthProfileConfig(nextConfig, {
      profileId,
      provider: "github-copilot",
      mode: "token",
    });
    if (params.setDefaultModel) {
      const existing = nextConfig.agent?.model;
      const fallbacks =
        existing && typeof existing === "object" && "fallbacks" in existing
          ? { fallbacks: (existing as { fallbacks?: string[] }).fallbacks }
          : undefined;
      nextConfig = {
        ...nextConfig,
        agent: {
          ...nextConfig.agent,
          model: {
            ...fallbacks,
            primary: "github-copilot/gpt-4o",
          },
        },
      };
    }
  }

  return { config: nextConfig, agentModelOverride };
}
