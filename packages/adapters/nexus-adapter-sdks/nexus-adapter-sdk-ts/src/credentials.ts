import type { AdapterContext } from "./run.js";

export type CredentialLookupOptions = {
  fields?: string[];
  env?: string[];
  allowValue?: boolean;
  label?: string;
};

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function readCredential(
  ctx: AdapterContext,
  options: CredentialLookupOptions = {},
): string | undefined {
  const fields = options.fields ?? [];
  for (const field of fields) {
    const value = ctx.runtime?.credential?.fields?.[field]?.trim();
    if (value) {
      return value;
    }
  }

  if (options.allowValue !== false) {
    const runtimeValue = ctx.runtime?.credential?.value?.trim();
    if (runtimeValue) {
      return runtimeValue;
    }
  }

  const envVars = options.env ?? [];
  for (const name of envVars) {
    const value = readEnv(name);
    if (value) {
      return value;
    }
  }

  return undefined;
}

export function requireCredential(
  ctx: AdapterContext,
  options: CredentialLookupOptions = {},
): string {
  const value = readCredential(ctx, options);
  if (value) {
    return value;
  }

  const label = options.label?.trim() || "credential";
  const sources: string[] = [];
  if ((options.fields ?? []).length > 0) {
    sources.push(`runtime credential fields ${JSON.stringify(options.fields)}`);
  }
  if (options.allowValue !== false) {
    sources.push("runtime credential value");
  }
  if ((options.env ?? []).length > 0) {
    sources.push(`environment ${JSON.stringify(options.env)}`);
  }
  const suffix = sources.length > 0 ? ` (looked in ${sources.join(", ")})` : "";
  throw new Error(`missing ${label}${suffix}`);
}
