import fs from "node:fs";
import { z } from "zod";

export const ADAPTER_CONTEXT_ENV_VAR = "NEXUS_ADAPTER_CONTEXT_PATH";
export const ADAPTER_STATE_DIR_ENV_VAR = "NEXUS_ADAPTER_STATE_DIR";

const AdapterRuntimeCredentialSchema = z
  .object({
    kind: z.string(),
    value: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
    auth_id: z.string().optional(),
    type: z.string().optional(),
    ref: z.string().optional(),
    service: z.string().optional(),
    account: z.string().optional(),
  })
  .catchall(z.unknown());

const AdapterRuntimeContextFileSchema = z
  .object({
    version: z.number().optional(),
    platform: z.string(),
    connection_id: z.string(),
    config: z.record(z.string(), z.unknown()).default({}),
    credential: AdapterRuntimeCredentialSchema.optional(),
  })
  .catchall(z.unknown());

export type AdapterRuntimeCredential = z.infer<typeof AdapterRuntimeCredentialSchema>;

export type AdapterRuntimeContext = {
  platform: string;
  connection_id: string;
  config: Record<string, unknown>;
  credential?: AdapterRuntimeCredential;
  raw?: Record<string, unknown>;
};

export function readAdapterRuntimeContextFile(pathValue: string): AdapterRuntimeContext {
  const raw = fs.readFileSync(pathValue, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const file = AdapterRuntimeContextFileSchema.parse(parsed);
  return {
    platform: file.platform,
    connection_id: file.connection_id,
    config: file.config,
    ...(file.credential ? { credential: file.credential } : {}),
    raw: file as unknown as Record<string, unknown>,
  };
}

export function loadAdapterRuntimeContext(
  env: NodeJS.ProcessEnv = process.env,
): AdapterRuntimeContext | null {
  const pathValue = env[ADAPTER_CONTEXT_ENV_VAR]?.trim();
  if (!pathValue) {
    return null;
  }
  return readAdapterRuntimeContextFile(pathValue);
}

export function requireAdapterRuntimeContext(
  env: NodeJS.ProcessEnv = process.env,
): AdapterRuntimeContext {
  const context = loadAdapterRuntimeContext(env);
  if (!context) {
    throw new Error(
      `Missing adapter runtime context (expected $${ADAPTER_CONTEXT_ENV_VAR} to point at runtime-context.json)`,
    );
  }
  return context;
}

export function loadAdapterStateDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env[ADAPTER_STATE_DIR_ENV_VAR]?.trim();
  return value ? value : null;
}

export function requireAdapterStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const value = loadAdapterStateDir(env);
  if (!value) {
    throw new Error(
      `Missing adapter state dir (expected $${ADAPTER_STATE_DIR_ENV_VAR} to point at a writable adapter state directory)`,
    );
  }
  return value;
}
