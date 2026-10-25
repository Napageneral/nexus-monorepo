// Methods validate their own params (Nex runs no schema validation on app methods). A bad param is
// a usage output (exit 1) inside the payload, never a thrown error: the ops API's Nex client would
// flatten a throw to "unavailable" and hide the fix.

export class ParamError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

// An actor id like claude@tyler-mac#4f2a or luna@team1: no dots, so it can never be an address.
export const ACTOR_RE = /^[a-z0-9][a-z0-9_-]{0,40}@[a-z0-9][a-z0-9_-]{0,40}(#[A-Za-z0-9_-]{1,40})?$/;
export const SERIES_ID_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

type Params = Record<string, unknown>;

export function allowOnly(params: Params, allowed: readonly string[]): void {
  for (const key of Object.keys(params)) {
    if (!allowed.includes(key)) throw new ParamError(key, `unknown param '${key}' (allowed: ${allowed.join(", ") || "none"})`);
  }
}

export function str(params: Params, name: string, options: { pattern?: RegExp; max?: number; required?: boolean; aliases?: string[] } = {}): string | undefined {
  const keys = [name, ...(options.aliases ?? [])];
  const key = keys.find((candidate) => params[candidate] !== undefined && params[candidate] !== null && params[candidate] !== "");
  if (key === undefined) {
    if (options.required) throw new ParamError(name, `'${name}' is required`);
    return undefined;
  }
  const value = params[key];
  if (typeof value !== "string") throw new ParamError(name, `'${name}' must be a string`);
  if (value.length > (options.max ?? 400)) throw new ParamError(name, `'${name}' is longer than ${options.max ?? 400} characters`);
  if (options.pattern && !options.pattern.test(value)) throw new ParamError(name, `'${name}' does not match ${options.pattern}`);
  return value;
}

export function oneOf<T extends string>(params: Params, name: string, values: readonly T[], fallback?: T): T {
  const value = params[name] ?? fallback;
  if (typeof value !== "string" || !values.includes(value as T)) throw new ParamError(name, `'${name}' must be one of ${values.join(", ")}`);
  return value as T;
}

/** Query strings arrive as text: "1", "true" and true all mean yes. */
export function flag(params: Params, name: string): boolean {
  const value = params[name];
  return value === true || value === "1" || value === "true" || value === "yes";
}

export function int(params: Params, name: string, options: { min: number; max: number; fallback: number }): number {
  const raw = params[name];
  if (raw === undefined || raw === null || raw === "") return options.fallback;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(value) || value < options.min || value > options.max) throw new ParamError(name, `'${name}' must be an integer ${options.min}-${options.max}`);
  return value;
}

export function isoTime(params: Params, name: string): string | undefined {
  const value = str(params, name, { max: 40 });
  if (value === undefined) return undefined;
  if (!ISO_RE.test(value) || !Number.isFinite(Date.parse(value))) throw new ParamError(name, `'${name}' must be an ISO time, e.g. 2026-10-27T13:00:00Z`);
  return new Date(value).toISOString();
}

export function stringList(params: Params, name: string, options: { pattern?: RegExp; max?: number; aliases?: string[] } = {}): string[] {
  const keys = [name, ...(options.aliases ?? [])];
  const key = keys.find((candidate) => params[candidate] !== undefined);
  if (key === undefined) return [];
  const raw = params[key];
  const values = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : null;
  if (!values || values.some((value) => typeof value !== "string")) throw new ParamError(name, `'${name}' must be a list of strings`);
  const cleaned = (values as string[]).map((value) => value.trim()).filter(Boolean);
  if (cleaned.length > (options.max ?? 50)) throw new ParamError(name, `'${name}' takes at most ${options.max ?? 50} items`);
  for (const value of cleaned) if (options.pattern && !options.pattern.test(value)) throw new ParamError(name, `'${value}' in '${name}' does not match ${options.pattern}`);
  return cleaned;
}

/** No address ever travels as a param: refs, ids, hashes and actor ids only (ax principle 11). */
export function refuseAddresses(params: Params): void {
  const text = JSON.stringify(params);
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/.test(text)) throw new ParamError("params", "params carry something shaped like an email address; addresses travel only on stdin to the person view (P4)");
}
