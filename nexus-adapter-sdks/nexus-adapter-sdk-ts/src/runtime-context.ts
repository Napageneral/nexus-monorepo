import fs from "node:fs";
import { z } from "zod";

export const ADAPTER_CONTEXT_ENV_VAR = "NEXUS_ADAPTER_CONTEXT_PATH";

const AdapterRuntimeCredentialSchemaV1 = z.object({
  // Legacy Nex injection (pre-spec): carries credential identity fields.
  ref: z.string(),
  service: z.string(),
  account: z.string(),
  value: z.string(),
});

const AdapterRuntimeCredentialSchemaV2 = z
  .object({
    // Spec shape.
    kind: z.string(),
    value: z.string(),
  })
  .catchall(z.unknown());

const AdapterRuntimeContextFileSchema = z
  .object({
    version: z.number().optional(),
    channel: z.string(),
    account_id: z.string(),
    config: z.record(z.string(), z.unknown()).default({}),
    credential: z.union([AdapterRuntimeCredentialSchemaV2, AdapterRuntimeCredentialSchemaV1]).optional(),
  })
  .catchall(z.unknown());

export type AdapterRuntimeCredential =
  | (z.infer<typeof AdapterRuntimeCredentialSchemaV2> & {
      ref?: string;
      service?: string;
      account?: string;
    })
  | (z.infer<typeof AdapterRuntimeCredentialSchemaV1> & { kind: string });

export type AdapterRuntimeContext = {
  channel: string;
  account_id: string;
  config: Record<string, unknown>;
  credential?: AdapterRuntimeCredential;
  // Allow future evolution without breaking consumers.
  raw?: Record<string, unknown>;
};

function normalizeCredential(cred: unknown): AdapterRuntimeCredential | undefined {
  if (!cred) {
    return undefined;
  }

  const v2 = AdapterRuntimeCredentialSchemaV2.safeParse(cred);
  if (v2.success) {
    const rec = v2.data as { kind: string; value: string; [k: string]: unknown };
    const ref = typeof rec.ref === "string" ? rec.ref : undefined;
    const service = typeof rec.service === "string" ? rec.service : undefined;
    const account = typeof rec.account === "string" ? rec.account : undefined;
    return { kind: rec.kind, value: rec.value, ...(ref ? { ref } : {}), ...(service ? { service } : {}), ...(account ? { account } : {}) };
  }

  const v1 = AdapterRuntimeCredentialSchemaV1.safeParse(cred);
  if (v1.success) {
    return {
      kind: "token",
      ref: v1.data.ref,
      service: v1.data.service,
      account: v1.data.account,
      value: v1.data.value,
    };
  }

  throw new Error("Invalid runtime context credential shape");
}

export function readAdapterRuntimeContextFile(pathValue: string): AdapterRuntimeContext {
  const raw = fs.readFileSync(pathValue, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const file = AdapterRuntimeContextFileSchema.parse(parsed);
  return {
    channel: file.channel,
    account_id: file.account_id,
    config: file.config,
    ...(file.credential ? { credential: normalizeCredential(file.credential) } : {}),
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
