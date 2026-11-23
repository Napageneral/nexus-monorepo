// Refs are full, stable and never guessed (ax principle 12):
//   <series>/<instance>.<step>[/<item>.<childstep>]
// A short form resolves only when it is unique across the given series; anything else refuses with
// refuse.ambiguous_ref and lists the candidates. Acting on several instances needs a wildcard.

export const SERIES_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
export const INSTANCE_RE = /^[a-z][a-z0-9_]{0,30}$/;
export const STEP_RE = /^[a-z][a-z0-9_]{0,62}$/;
const ITEM_RE = /^[a-z0-9_]{1,40}$/;

export type Ref = { series: string; instance: string; step: string; item?: string; child?: string };

export function formatRef(ref: Ref): string {
  return `${ref.series}/${ref.instance}.${ref.step}${ref.item ? `/${ref.item}.${ref.child}` : ""}`;
}

export function parseFullRef(text: string): Ref | null {
  const match = /^([^/]+)\/([^./]+)\.([^./]+)(?:\/([^./]+)\.([^./]+))?$/.exec(text.trim());
  if (!match) return null;
  const [, series, instance, step, item, child] = match;
  if (!SERIES_RE.test(series!) || !INSTANCE_RE.test(instance!) || !STEP_RE.test(step!)) return null;
  if (item !== undefined && (!ITEM_RE.test(item) || !STEP_RE.test(child!))) return null;
  return { series: series!, instance: instance!, step: step!, ...(item ? { item, child: child! } : {}) };
}

export type RefResolution =
  | { ok: true; ref: string; resolved_from: string | null }
  | { ok: false; code: "refuse.ambiguous_ref" | "refuse.wildcard_required" | "check.unknown_ref"; message: string; candidates: string[] };

/**
 * Resolves what a person typed against the known step-instance refs. Accepted forms: the full ref,
 * `<instance>.<step>` (unique across the given series), or `<series>/<instance>.<step>`.
 * Wildcards are refused here: they go through resolveWildcard on purpose.
 */
export function resolveRef(text: string, known: readonly string[]): RefResolution {
  const typed = text.trim();
  if (typed.includes("*")) {
    return { ok: false, code: "refuse.wildcard_required", message: `'${typed}' is a wildcard; this command acts on one ref`, candidates: [] };
  }
  if (known.includes(typed)) return { ok: true, ref: typed, resolved_from: null };
  const suffix = typed.includes("/") ? null : `/${typed}`;
  const candidates = suffix ? known.filter((ref) => ref.endsWith(suffix) && !ref.slice(0, -suffix.length).includes(".")) : [];
  if (candidates.length === 1) return { ok: true, ref: candidates[0]!, resolved_from: typed };
  if (candidates.length > 1) {
    return {
      ok: false,
      code: "refuse.ambiguous_ref",
      message: `'${typed}' matches ${candidates.length} refs; type one in full`,
      candidates: [...candidates].sort(),
    };
  }
  return { ok: false, code: "check.unknown_ref", message: `no step '${typed}' in the known series`, candidates: [] };
}

/** `g*.codes` within one series: explicit, so a missing `g4.` can never move five groups. */
export function resolveWildcard(series: string, pattern: string, known: readonly string[]): string[] {
  if (!/^[a-z0-9_*]+\.[a-z0-9_*]+$/.test(pattern) || !pattern.includes("*")) return [];
  const re = new RegExp(`^${series.replace(/[-]/g, "\\-")}/${pattern.replace(/\./g, "\\.").replace(/\*/g, "[a-z0-9_]*")}$`);
  return known.filter((ref) => re.test(ref)).sort();
}

/** The run key of one engine Run of one step phase: seq:<series>:<instance>:<step>:<phase>:a<n>. */
export function runKey(series: string, instance: string, step: string, phase: string, attempt: number): string {
  return `seq:${series}:${instance}:${step}:${phase}:a${attempt}`;
}

export function parseRunKey(key: string): { series: string; instance: string; step: string; phase: string; attempt: number } | null {
  const match = /^seq:([a-z0-9-]+):([a-z0-9_]+):([a-z0-9_]+):([a-z0-9_]+):a(\d+)$/.exec(key);
  if (!match) return null;
  return { series: match[1]!, instance: match[2]!, step: match[3]!, phase: match[4]!, attempt: Number(match[5]) };
}
