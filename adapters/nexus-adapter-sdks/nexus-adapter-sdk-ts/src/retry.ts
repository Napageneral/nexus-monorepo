export type RetryOptions = {
  attempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void | Promise<void>;
};

export async function sleepWithSignal(signal: AbortSignal, ms: number): Promise<void> {
  if (ms <= 0 || signal.aborted) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function parseRetryAfterMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.trunc(seconds * 1000);
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) {
    return undefined;
  }
  return Math.max(0, dateMs - Date.now());
}

export async function withRetry<T>(work: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, Math.trunc(options.attempts ?? 3));
  const factor = options.factor && options.factor > 0 ? options.factor : 2;
  const maxDelayMs = Math.max(0, Math.trunc(options.maxDelayMs ?? 30_000));
  let delayMs = Math.max(0, Math.trunc(options.initialDelayMs ?? 1_000));
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      return await work();
    } catch (error) {
      const shouldRetry = options.shouldRetry ? options.shouldRetry(error, attempt) : attempt < attempts;
      if (!shouldRetry || attempt >= attempts || options.signal?.aborted) {
        throw error;
      }
      if (options.onRetry) {
        await options.onRetry(error, attempt, delayMs);
      }
      if (options.signal) {
        await sleepWithSignal(options.signal, delayMs);
      } else if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      delayMs = Math.min(maxDelayMs, Math.max(delayMs, 1) * factor);
    }
  }
}
