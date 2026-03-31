import type { StorageLike } from "./types.js";

const DEFAULT_PREFIX = "nexus_website_input";

function randomSegment(randomId?: () => string): string {
  if (randomId) {
    return randomId();
  }
  return Math.random().toString(36).slice(2, 10);
}

export function createBrowserId(now: Date = new Date(), randomId?: () => string): string {
  return `wb_${now.getTime()}_${randomSegment(randomId)}`;
}

export function createSessionId(now: Date = new Date(), randomId?: () => string): string {
  return `ws_${now.getTime()}_${randomSegment(randomId)}`;
}

export function storageKey(prefix: string | undefined, suffix: string): string {
  return `${prefix || DEFAULT_PREFIX}_${suffix}`;
}

export function getOrCreateStoredId(
  storage: StorageLike,
  key: string,
  factory: () => string,
): string {
  const existing = storage.getItem(key)?.trim();
  if (existing) {
    return existing;
  }
  const created = factory();
  storage.setItem(key, created);
  return created;
}
