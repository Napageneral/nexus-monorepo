import type {
  BrowserDocumentLike,
  BrowserEnvironment,
  ConsentState,
  WebsiteEvent,
} from "./types.js";
import { storageKey } from "./ids.js";

type AttributionSnapshot = Pick<
  WebsiteEvent,
  | "event_source_url"
  | "referrer"
  | "utm_source"
  | "utm_medium"
  | "utm_campaign"
  | "utm_content"
  | "utm_term"
  | "fbclid"
  | "fbc"
  | "fbp"
  | "gclid"
  | "gbraid"
  | "wbraid"
  | "ttclid"
  | "ttp"
  | "msclkid"
>;

const QUERY_FIELDS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "ttclid",
  "msclkid",
] as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function parseCookieHeader(documentLike?: BrowserDocumentLike): Record<string, string> {
  const raw = documentLike?.cookie?.trim();
  if (!raw) {
    return {};
  }
  return Object.fromEntries(
    raw
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator <= 0) {
          return null;
        }
        return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()] as const;
      })
      .filter((entry): entry is readonly [string, string] => Boolean(entry)),
  );
}

function readSnapshot(raw: string | null): AttributionSnapshot {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return asRecord(parsed) as AttributionSnapshot;
  } catch {
    return {};
  }
}

function writeSnapshot(env: BrowserEnvironment, key: string, value: AttributionSnapshot): void {
  try {
    env.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore private-mode or quota failures.
  }
}

function deriveFbc(fbclid: string, now: Date): string {
  return `fb.1.${now.getTime()}.${fbclid}`;
}

export function captureAttributionSnapshot(
  env: BrowserEnvironment,
  consentState: ConsentState,
  now: Date,
  prefix?: string,
): AttributionSnapshot {
  const snapshotKey = storageKey(prefix, "attribution");
  const current = readSnapshot(env.localStorage.getItem(snapshotKey));
  const next: AttributionSnapshot = { ...current };

  const url = new URL(env.location.href);
  for (const field of QUERY_FIELDS) {
    const value = url.searchParams.get(field)?.trim();
    if (value) {
      next[field] = value;
    }
  }

  if (url.search) {
    next.event_source_url = current.event_source_url || url.href;
  } else if (!next.event_source_url) {
    next.event_source_url = url.href;
  }

  const referrer = env.document?.referrer?.trim();
  if (referrer) {
    next.referrer = referrer;
  }

  if (consentState === "granted") {
    const cookies = parseCookieHeader(env.document);
    if (next.fbclid && !next.fbc) {
      next.fbc = deriveFbc(next.fbclid, now);
    }
    if (cookies._fbc) {
      next.fbc = cookies._fbc;
    }
    if (cookies._fbp) {
      next.fbp = cookies._fbp;
    }
    if (cookies._ttp) {
      next.ttp = cookies._ttp;
    }
  } else {
    delete next.fbc;
    delete next.fbp;
    delete next.ttp;
  }

  writeSnapshot(env, snapshotKey, next);
  return next;
}
