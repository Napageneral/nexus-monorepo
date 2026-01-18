import os from "node:os";
import path from "node:path";
import type { NexusConfig } from "./types.js";

/**
 * Nix mode detection: When NEXUS_NIX_MODE=1, the gateway is running under Nix.
 * In this mode:
 * - No auto-install flows should be attempted
 * - Missing dependencies should produce actionable Nix-specific error messages
 * - Config is managed externally (read-only from Nix perspective)
 */
export function resolveIsNixMode(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NEXUS_NIX_MODE === "1";
}

export const isNixMode = resolveIsNixMode();

/**
 * State directory for mutable data (sessions, logs, caches).
 * Can be overridden via NEXUS_STATE_DIR.
 * Default: ~/nexus/state
 */
export function resolveStateDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const override = env.NEXUS_STATE_DIR?.trim();
  if (override) return resolveUserPath(override);
  const envHome = env.HOME?.trim();
  if (envHome) return path.join(resolveUserPath(envHome), "nexus", "state");
  const envProfile = env.USERPROFILE?.trim();
  if (envProfile)
    return path.join(resolveUserPath(envProfile), "nexus", "state");
  return path.join(homedir(), "nexus", "state");
}

function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    return path.resolve(trimmed.replace("~", os.homedir()));
  }
  return path.resolve(trimmed);
}

export const STATE_DIR_NEXUS = resolveStateDir();

/**
 * Config file path (JSON5).
 * Can be overridden via NEXUS_CONFIG_PATH.
 * Default: $NEXUS_STATE_DIR/nexus/config.json
 */
export function resolveConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  stateDir: string = resolveStateDir(env, os.homedir),
): string {
  const override = env.NEXUS_CONFIG_PATH?.trim();
  if (override) return resolveUserPath(override);
  return path.join(stateDir, "nexus", "config.json");
}

export const CONFIG_PATH_NEXUS = resolveConfigPath();

export const DEFAULT_GATEWAY_PORT = 18789;

/**
 * Credentials root directory.
 */
export function resolveCredentialsDir(
  env: NodeJS.ProcessEnv = process.env,
  stateDir: string = resolveStateDir(env, os.homedir),
): string {
  const override = env.NEXUS_CREDENTIALS_DIR?.trim();
  if (override) return resolveUserPath(override);
  return path.join(stateDir, "credentials");
}

/**
 * Bootstrap prompt path (shared across agents).
 * Default: $NEXUS_STATE_DIR/agents/BOOTSTRAP.md
 */
export function resolveBootstrapPath(
  env: NodeJS.ProcessEnv = process.env,
  stateDir: string = resolveStateDir(env, os.homedir),
): string {
  const override = env.NEXUS_BOOTSTRAP_PATH?.trim();
  if (override) return resolveUserPath(override);
  return path.join(stateDir, "agents", "BOOTSTRAP.md");
}

const OAUTH_FILENAME = "oauth.json";

/** @deprecated Use resolveCredentialsDir. */
export function resolveOAuthDir(
  env: NodeJS.ProcessEnv = process.env,
  stateDir: string = resolveStateDir(env, os.homedir),
): string {
  const override = env.NEXUS_OAUTH_DIR?.trim();
  if (override) return resolveUserPath(override);
  return resolveCredentialsDir(env, stateDir);
}

/** @deprecated Legacy oauth.json path (deprecated). */
export function resolveOAuthPath(
  env: NodeJS.ProcessEnv = process.env,
  stateDir: string = resolveStateDir(env, os.homedir),
): string {
  return path.join(resolveOAuthDir(env, stateDir), OAUTH_FILENAME);
}

export function resolveGatewayPort(
  cfg?: NexusConfig,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const envRaw = env.NEXUS_GATEWAY_PORT?.trim();
  if (envRaw) {
    const parsed = Number.parseInt(envRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const configPort = cfg?.gateway?.port;
  if (typeof configPort === "number" && Number.isFinite(configPort)) {
    if (configPort > 0) return configPort;
  }
  return DEFAULT_GATEWAY_PORT;
}
