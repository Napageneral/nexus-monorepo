import { AdapterLogger } from "./logger.js";
import { NexusEvent } from "./protocol.js";
import type { AdapterContext, AdapterDefinition } from "./run.js";

export type EmitFunc = (event: NexusEvent) => void;

export type PollConfig = {
  intervalMs: number;
  fetch: (
    ctx: AdapterContext,
    since: Date,
    account: string,
  ) => Promise<{ events: NexusEvent[]; newCursor?: Date }> | { events: NexusEvent[]; newCursor?: Date };
  initialCursor?: Date;
  errorBackoffMs?: number;
  maxConsecutiveErrors?: number;
};

export type MonitorHandler = NonNullable<AdapterDefinition["monitor"]>;

export function pollMonitor(config: PollConfig): MonitorHandler {
  return async (ctx: AdapterContext, args: { account: string }, emit: EmitFunc) => {
    const intervalMs = config.intervalMs;
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new Error(`pollMonitor: invalid intervalMs: ${intervalMs}`);
    }

    let cursor = config.initialCursor ?? new Date();
    let errorBackoffMs = config.errorBackoffMs ?? intervalMs;
    if (!Number.isFinite(errorBackoffMs) || errorBackoffMs <= 0) {
      errorBackoffMs = intervalMs;
    }

    let consecutiveErrors = 0;
    const maxConsecutiveErrors = config.maxConsecutiveErrors ?? 0;

    while (true) {
      if (ctx.signal.aborted) {
        ctx.log.info("monitor shutting down (signal aborted)");
        return;
      }

      let fetched: { events: NexusEvent[]; newCursor?: Date };
      try {
        fetched = await config.fetch(ctx, cursor, args.account);
      } catch (err) {
        consecutiveErrors++;
        ctx.log.error("poll fetch error (%d consecutive): %s", consecutiveErrors, errorToString(err));

        if (maxConsecutiveErrors > 0 && consecutiveErrors >= maxConsecutiveErrors) {
          throw err instanceof Error ? err : new Error(String(err));
        }

        await sleep(errorBackoffMs, ctx.signal, ctx.log);
        continue;
      }

      consecutiveErrors = 0;

      const events = fetched.events ?? [];
      for (const event of events) {
        emit(event);
      }
      if (events.length > 0) {
        ctx.log.debug("emitted %d events", events.length);
      }

      if (fetched.newCursor instanceof Date && !Number.isNaN(fetched.newCursor.valueOf())) {
        cursor = fetched.newCursor;
      }

      await sleep(intervalMs, ctx.signal, ctx.log);
    }
  };
}

function errorToString(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function sleep(ms: number, signal: AbortSignal, log: AdapterLogger): Promise<void> {
  await new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(t);
      signal.removeEventListener("abort", onAbort);
      log.debug("sleep aborted");
      resolve();
    };

    if (signal.aborted) {
      clearTimeout(t);
      resolve();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
