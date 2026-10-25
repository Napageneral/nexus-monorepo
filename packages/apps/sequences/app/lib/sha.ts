import { createHash } from "node:crypto";
import { canonicalize } from "./jcs.js";

export const SHA256_RE = /^[0-9a-f]{64}$/;

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** sha256 over the RFC 8785 canonical form: the one way this app fingerprints JSON. */
export function jcsSha256(value: unknown): string {
  return sha256Hex(Buffer.from(canonicalize(value), "utf8"));
}

/** definition_sha256: the normalized definition (defaults expanded), canonicalized and hashed. */
export function definitionSha(normalized: unknown): string {
  return jcsSha256(normalized);
}

/** plan_sha256: the materialized plan (every step instance of every instance), canonicalized. */
export function planSha(plan: unknown): string {
  return jcsSha256(plan);
}

/** A short stable id from parts, for rows whose natural key is long (step instances, alerts). */
export function shortId(prefix: string, ...parts: string[]): string {
  return `${prefix}_${sha256Hex(parts.join("\u001f")).slice(0, 24)}`;
}
