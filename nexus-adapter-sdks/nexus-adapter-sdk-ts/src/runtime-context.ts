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
    fields: z.record(z.string(), z.string()).optional(),
    auth_id: z.string().optional(),
    type: z.string().optional(),
  })
  .catchall(z.unknown());

const AdapterRuntimeContextFileSchema = z
  .object({
    version: z.number().optional(),
    platform: z.string(),
    account_id: z.string(),
    config: z.record(z.string(), z.unknown()).default({}),
    credential: z.union([AdapterRuntimeCredentialSchemaV2, AdapterRuntimeCredentialSchemaV1]).optional(),
  })
  .catchall(z.unknown());

export type AdapterRuntimeCredential =
  // Canonical runtime fields.
  {
    kind: string;
    value: string;
    // Optional expanded fields injected by runtime for multi-field credentials.
    fields?: Record<string, string>;
    // Optional credential identity details for adapter introspection.
    ref?: string;
    service?: string;
    account?: string;
    auth_id?: string;
    type?: string;
  };

export type AdapterRuntimeContext = {
  platform: string;
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
    const rec = v2.data as {
      kind: string;
      value: string;
      fields?: Record<string, string>;
      auth_id?: string;
      type?: string;
      [k: string]: unknown;
    };
    const ref = typeof rec.ref === "string" ? rec.ref : undefined;
    const service = typeof rec.service === "string" ? rec.service : undefined;
    const account = typeof rec.account === "string" ? rec.account : undefined;
    const fields =
      rec.fields && typeof rec.fields === "object" && !Array.isArray(rec.fields)
        ? rec.fields
        : undefined;
    const authID = typeof rec.auth_id === "string" ? rec.auth_id : undefined;
    const type = typeof rec.type === "string" ? rec.type : undefined;
    return {
      kind: rec.kind,
      value: rec.value,
      ...(fields ? { fields } : {}),
      ...(ref ? { ref } : {}),
      ...(service ? { service } : {}),
      ...(account ? { account } : {}),
      ...(authID ? { auth_id: authID } : {}),
      ...(type ? { type } : {}),
    };
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
    platform: file.platform,
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
