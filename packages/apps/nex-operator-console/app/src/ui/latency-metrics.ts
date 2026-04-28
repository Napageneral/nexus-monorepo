export type ConsoleLatencyOutcome = "ok" | "error";

export type ConsoleLatencyDetails = Record<string, string | number | boolean | null | undefined>;

export type ConsoleLatencyEntry = {
  id: string;
  label: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  outcome: ConsoleLatencyOutcome;
  details?: ConsoleLatencyDetails;
};

type ConsoleLatencyToken = {
  id: string;
  label: string;
  startedAt: number;
  details?: ConsoleLatencyDetails;
};

declare global {
  interface Window {
    __nexusConsoleTimings?: ConsoleLatencyEntry[];
  }
}

const BUFFER_LIMIT = 250;
const SLOW_LOG_MS = 250;

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function wallClockMs(): number {
  return Date.now();
}

function metricsBuffer(): ConsoleLatencyEntry[] | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (!window.__nexusConsoleTimings) {
    window.__nexusConsoleTimings = [];
  }
  return window.__nexusConsoleTimings;
}

export function consoleLatencyEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const params = new URL(window.location.href).searchParams;
    return (
      params.get("perf") === "1" ||
      params.get("latency") === "1" ||
      window.localStorage.getItem("nexus.console.latency") === "1"
    );
  } catch {
    return false;
  }
}

export function startConsoleLatency(
  label: string,
  details?: ConsoleLatencyDetails,
): ConsoleLatencyToken {
  return {
    id: `${wallClockMs().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    startedAt: nowMs(),
    ...(details ? { details } : {}),
  };
}

export function finishConsoleLatency(
  token: ConsoleLatencyToken,
  outcome: ConsoleLatencyOutcome = "ok",
  details?: ConsoleLatencyDetails,
): ConsoleLatencyEntry {
  const finishedAt = nowMs();
  const mergedDetails = {
    ...(token.details ?? {}),
    ...(details ?? {}),
  };
  const entry: ConsoleLatencyEntry = {
    id: token.id,
    label: token.label,
    startedAt: token.startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAt - token.startedAt),
    outcome,
    ...(Object.keys(mergedDetails).length > 0 ? { details: mergedDetails } : {}),
  };
  recordConsoleLatency(entry);
  return entry;
}

export function recordConsoleLatency(entry: ConsoleLatencyEntry): void {
  const buffer = metricsBuffer();
  if (!buffer) {
    return;
  }
  buffer.push(entry);
  if (buffer.length > BUFFER_LIMIT) {
    buffer.splice(0, buffer.length - BUFFER_LIMIT);
  }
  if (entry.durationMs >= SLOW_LOG_MS || consoleLatencyEnabled()) {
    const details = entry.details ? ` ${JSON.stringify(entry.details)}` : "";
    console.info(
      `[nexus-console:latency] ${entry.label} ${entry.durationMs.toFixed(1)}ms ${entry.outcome}${details}`,
    );
  }
  try {
    window.dispatchEvent(new CustomEvent("nexus-console-latency", { detail: entry }));
  } catch {
    // The event is a convenience for browser debugging; ignore dispatch failures.
  }
}

export async function measureConsoleLatency<T>(
  label: string,
  fn: () => Promise<T>,
  details?: ConsoleLatencyDetails,
): Promise<T> {
  const token = startConsoleLatency(label, details);
  try {
    const result = await fn();
    finishConsoleLatency(token, "ok");
    return result;
  } catch (error) {
    finishConsoleLatency(token, "error", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function latestConsoleLatencyEntries(limit = 20): ConsoleLatencyEntry[] {
  const buffer = metricsBuffer();
  if (!buffer) {
    return [];
  }
  return buffer.slice(-limit).reverse();
}

export function clearConsoleLatencyEntries(): void {
  const buffer = metricsBuffer();
  if (buffer) {
    buffer.splice(0, buffer.length);
  }
}
