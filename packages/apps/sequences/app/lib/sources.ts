// The ops sources client: https://ops.moonsleep.co/api/sequences/sources/<name>, read-only, hashes
// and counts only. It sends the engine's Cloudflare Access service token, read with
// credentials.resolve from two fixed rows (§5 step 12). Every answer must carry
// {contract, as_of, sha256, count, rows}; anything else holds the step with hold.source_stale.
// Reads retry three times with backoff on transport errors, 5xx and 429 (honouring Retry-After).
import { RELEASED_SOURCE_ROUTES, SOURCES_BASE_URL, SOURCES_CONTRACT } from "./catalog.js";
import { asString, errorText, unwrapPayload, type Row } from "./nex.js";
import { QUICKNET_CHAIN } from "./draw/rank.js";
import type { EntriesRows, ExplainRows } from "./draw/shadow.js";
import { jcsSha256, SHA256_RE } from "./sha.js";
import type { NexClient } from "./types.js";

// UNCONFIRMED (§8 R-2): that a worker attempt may call credentials.resolve. The rows are seeded on
// Tyler's go as Nex vault credentials {service: "sequences", account: <name>} (NX-P11).
export const OPS_ACCESS_CREDENTIALS = {
  clientId: { service: "sequences", account: "ops-access-client-id" },
  clientSecret: { service: "sequences", account: "ops-access-client-secret" },
} as const;

export const SOURCE_TIMEOUT_MS = 20_000;
export const SOURCE_RETRIES = 3;
export const DRAND_BASE_URL = "https://api.drand.sh";

export type SourceAnswer = { contract: string; as_of: string; sha256: string; count: number; rows: unknown } & Record<string, unknown>;

/** The ops API's digest: the answer without ok, as_of, in_recovery and sha256 (sequences_sources.py finish_answer). */
const VOLATILE = new Set(["ok", "as_of", "in_recovery", "sha256"]);
export function answerSha256(answer: Record<string, unknown>): string {
  return jcsSha256(Object.fromEntries(Object.entries(answer).filter(([key]) => !VOLATILE.has(key))));
}

/** What a snapshot keeps: the answer without its volatile keys (hashes and counts only). */
export function snapshotBody(source: string, answer: SourceAnswer): unknown {
  if (source === "entries") return entriesRowsOf(answer);
  return Object.fromEntries(Object.entries(answer).filter(([key]) => !VOLATILE.has(key)));
}

type ExplainMember = { address_sha256: string; created_at?: string | null; invitation_status?: string | null; last_error?: string | null; updated_at?: string | null };

/**
 * The `entries` answer (B1 sequences_sources.read_entries) in the shadow compare's shape: entrants in
 * rows / review_entrants, the group fields beside them, members as the member hashes, and explain
 * {invitations, reviews} with each invitation's status split from its last_error.
 */
export function entriesRowsOf(answer: Record<string, unknown>): EntriesRows & { explain?: ExplainRows } {
  const nested = answer.rows && typeof answer.rows === "object" && !Array.isArray(answer.rows) ? (answer.rows as Record<string, unknown>) : null;
  const pick = (key: string) => (answer[key] !== undefined ? answer[key] : nested?.[key]);
  const entrants = (Array.isArray(answer.review_entrants) ? answer.review_entrants : Array.isArray(answer.rows) ? answer.rows : nested?.review_entrants ?? []) as EntriesRows["review_entrants"];
  const members = (pick("members") ?? pick("member_hashes")) as string[] | undefined;
  const out: EntriesRows & { explain?: ExplainRows } = {
    group_size: Number(pick("group_size") ?? 0),
    invitation_statuses: (pick("invitation_statuses") ?? {}) as Record<string, number>,
    group_email_at_utc: (pick("group_email_at_utc") as string | null | undefined) ?? null,
    reviews_entered: Number(pick("reviews_entered") ?? 0),
    review_entrants: entrants.map((entrant) => ({ address_sha256: entrant.address_sha256, ...(entrant.entry_id ? { entry_id: entrant.entry_id } : {}), ...(entrant.review_ids ? { review_ids: entrant.review_ids } : {}) })),
    ...(Array.isArray(members) ? { member_hashes: [...members].sort() } : {}),
  };
  const explain = explainOf(answer);
  if (explain) out.explain = explain;
  return out;
}

export function explainOf(answer: Record<string, unknown>): ExplainRows | null {
  const nested = answer.rows && typeof answer.rows === "object" && !Array.isArray(answer.rows) ? (answer.rows as Record<string, unknown>) : null;
  const raw = (answer.explain ?? nested?.explain) as { invitations?: ExplainMember[]; members?: ExplainMember[]; reviews?: ExplainRows["reviews"] } | undefined;
  if (!raw || typeof raw !== "object") return null;
  const members = (raw.invitations ?? raw.members ?? []).map((row) => {
    // A combined "cancelled:klaviyo_bounced" status splits at its first ':' (older answers).
    const combined = !row.last_error && typeof (row as { status?: unknown }).status === "string" ? String((row as { status?: string }).status) : null;
    const [status, error] = combined ? [combined.split(":")[0]!, combined.includes(":") ? combined.slice(combined.indexOf(":") + 1) : null] : [row.invitation_status ?? null, row.last_error ?? null];
    return { address_sha256: row.address_sha256, created_at: row.created_at ?? null, invitation_status: status, last_error: error, updated_at: row.updated_at ?? null };
  });
  return { members, reviews: raw.reviews ?? [] };
}

export type SourceRead =
  | { ok: true; answer: SourceAnswer; local_sha256: string; sha_matches: boolean; url_path: string; attempts: number }
  | { ok: false; code: "hold.source_stale" | "transient.ops_unreachable" | "transient.credentials_unavailable"; message: string; status: number | null; attempts: number };

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; signal: AbortSignal }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export type SourceDeps = {
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  abortSignal?: AbortSignal;
  baseUrl?: string;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Reads both Access rows; never logs or returns the values beyond the request headers. */
export async function resolveOpsAccess(nex: NexClient): Promise<{ id: string; secret: string } | null> {
  try {
    const id = asString(unwrapPayload(await nex.credentials.resolve(OPS_ACCESS_CREDENTIALS.clientId)).value);
    const secret = asString(unwrapPayload(await nex.credentials.resolve(OPS_ACCESS_CREDENTIALS.clientSecret)).value);
    return id && secret ? { id, secret } : null;
  } catch {
    return null;
  }
}

function backoffMs(attempt: number, retryAfter: string | null): number {
  const seconds = retryAfter !== null ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds, 60) * 1000;
  return 1000 * 2 ** (attempt - 1);
}

/** The answer contract every route promises. Returns the reason it fails, or null. */
export function contractProblem(body: unknown): string | null {
  const answer = body as Partial<SourceAnswer> | null;
  if (!answer || typeof answer !== "object") return "the answer is not an object";
  if (answer.contract !== SOURCES_CONTRACT) return `contract is ${JSON.stringify(answer.contract)}, not ${SOURCES_CONTRACT}`;
  if (typeof answer.as_of !== "string" || !Number.isFinite(Date.parse(answer.as_of))) return "as_of is missing or not a time";
  if (typeof answer.sha256 !== "string" || !SHA256_RE.test(answer.sha256)) return "sha256 is missing";
  if (!Number.isInteger(answer.count) || (answer.count as number) < 0) return "count is missing";
  if (answer.rows === undefined) return "rows is missing";
  if (Array.isArray(answer.rows) && answer.rows.length !== answer.count) return `count ${answer.count} but ${answer.rows.length} rows`;
  if (JSON.stringify(answer.rows).includes("@")) return "the answer carries an address (HR-21)";
  return null;
}

export function sourcePath(name: string, params: Record<string, string>): string {
  if (!(name in RELEASED_SOURCE_ROUTES)) throw new Error(`sequences: source route '${name}' is not released`);
  const query = Object.entries(params)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return `/${name}${query ? `?${query}` : ""}`;
}

export async function readSource(name: string, params: Record<string, string>, access: { id: string; secret: string } | null, deps: SourceDeps = {}): Promise<SourceRead> {
  if (!access) return { ok: false, code: "transient.credentials_unavailable", message: "the engine's ops Access credential is not readable (credentials.resolve)", status: null, attempts: 0 };
  const doFetch = deps.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const sleep = deps.sleep ?? defaultSleep;
  const urlPath = sourcePath(name, params);
  const url = `${deps.baseUrl ?? SOURCES_BASE_URL}${urlPath}`;
  let lastStatus: number | null = null;
  let lastMessage = "";
  for (let attempt = 1; attempt <= SOURCE_RETRIES + 1; attempt += 1) {
    const signals = [AbortSignal.timeout(SOURCE_TIMEOUT_MS), ...(deps.abortSignal ? [deps.abortSignal] : [])];
    let retryAfter: string | null = null;
    try {
      const response = await doFetch(url, {
        method: "GET",
        headers: { "CF-Access-Client-Id": access.id, "CF-Access-Client-Secret": access.secret, Accept: "application/json" },
        signal: AbortSignal.any(signals),
      });
      lastStatus = response.status;
      if (response.status === 200) {
        let body: unknown;
        try {
          body = JSON.parse(await response.text());
        } catch {
          return { ok: false, code: "hold.source_stale", message: `${urlPath}: the answer is not JSON`, status: 200, attempts: attempt };
        }
        const broken = contractProblem(body);
        if (broken) return { ok: false, code: "hold.source_stale", message: `${urlPath}: ${broken}`, status: 200, attempts: attempt };
        const answer = body as SourceAnswer;
        const local = answerSha256(answer);
        return { ok: true, answer, local_sha256: local, sha_matches: local === answer.sha256, url_path: urlPath, attempts: attempt };
      }
      lastMessage = `${urlPath}: HTTP ${response.status}`;
      if (!(response.status === 429 || response.status >= 500)) {
        return { ok: false, code: "hold.source_stale", message: lastMessage, status: response.status, attempts: attempt };
      }
      retryAfter = response.headers.get("retry-after");
    } catch (error) {
      if (deps.abortSignal?.aborted) throw error;
      lastMessage = `${urlPath}: ${errorText(error).slice(0, 160)}`;
    }
    if (attempt <= SOURCE_RETRIES) await sleep(backoffMs(attempt, retryAfter));
  }
  return { ok: false, code: lastStatus === 503 ? "hold.source_stale" : "transient.ops_unreachable", message: lastMessage, status: lastStatus, attempts: SOURCE_RETRIES + 1 };
}

/** drand quicknet: the chain's info (reach probe) or one round (beacon check). No credential. */
export async function readDrand(round: number | "info", deps: SourceDeps = {}): Promise<{ ok: true; body: Row } | { ok: false; message: string }> {
  const doFetch = deps.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const sleep = deps.sleep ?? defaultSleep;
  const url = `${DRAND_BASE_URL}/${QUICKNET_CHAIN}/${round === "info" ? "info" : `public/${round}`}`;
  let message = "";
  for (let attempt = 1; attempt <= SOURCE_RETRIES + 1; attempt += 1) {
    try {
      const response = await doFetch(url, { method: "GET", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
      if (response.status === 200) return { ok: true, body: JSON.parse(await response.text()) as Row };
      message = `drand HTTP ${response.status}`;
      if (!(response.status === 429 || response.status >= 500)) break;
    } catch (error) {
      message = `drand: ${errorText(error).slice(0, 160)}`;
    }
    if (attempt <= SOURCE_RETRIES) await sleep(backoffMs(attempt, null));
  }
  return { ok: false, message };
}
