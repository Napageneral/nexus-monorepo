import type { AdapterInboundRecord } from "./protocol.js";
import type { DefinedAdapterContext } from "./define.js";
import type { AdapterDefinition } from "./run.js";
import { sleepWithSignal } from "./retry.js";

export type EmitFunc = (record: AdapterInboundRecord) => void;

type MaybePromise<T> = T | Promise<T>;

export type PollConfig<TClient, TCursor, TPage, TItem> = {
  initialCursor?: (args: {
    ctx: DefinedAdapterContext<TClient>;
    connectionId: string;
  }) => MaybePromise<TCursor | undefined>;
  poll: (args: {
    ctx: DefinedAdapterContext<TClient>;
    connectionId: string;
    cursor: TCursor | undefined;
    signal: AbortSignal;
  }) => MaybePromise<TPage>;
  items: (page: TPage) => Iterable<TItem>;
  toRecord: (args: {
    ctx: DefinedAdapterContext<TClient>;
    connectionId: string;
    cursor: TCursor | undefined;
    page: TPage;
    item: TItem;
  }) => MaybePromise<AdapterInboundRecord | AdapterInboundRecord[] | null | undefined>;
  nextCursor?: (args: {
    ctx: DefinedAdapterContext<TClient>;
    connectionId: string;
    cursor: TCursor | undefined;
    page: TPage;
    item: TItem;
  }) => MaybePromise<TCursor | undefined>;
  pageCursor?: (args: {
    ctx: DefinedAdapterContext<TClient>;
    connectionId: string;
    cursor: TCursor | undefined;
    page: TPage;
  }) => MaybePromise<TCursor | undefined>;
  idleMs?: number;
  errorDelayMs?: number;
};

export type MonitorHandler = NonNullable<AdapterDefinition["operations"]["adapter.monitor.start"]>;

export type BackfillHandler = NonNullable<AdapterDefinition["operations"]["records.backfill"]>;

export type PollBackfillConfig<TClient, TCursor, TPage, TItem> = {
  initialCursor?: (args: {
    ctx: DefinedAdapterContext<TClient>;
    connectionId: string;
    since: Date;
  }) => MaybePromise<TCursor | undefined>;
  poll: (args: {
    ctx: DefinedAdapterContext<TClient>;
    connectionId: string;
    cursor: TCursor | undefined;
    since: Date;
    signal: AbortSignal;
  }) => MaybePromise<TPage>;
  items: (page: TPage) => Iterable<TItem>;
  toRecord: (args: {
    ctx: DefinedAdapterContext<TClient>;
    connectionId: string;
    cursor: TCursor | undefined;
    page: TPage;
    item: TItem;
  }) => MaybePromise<AdapterInboundRecord | AdapterInboundRecord[] | null | undefined>;
  nextCursor?: (args: {
    ctx: DefinedAdapterContext<TClient>;
    connectionId: string;
    cursor: TCursor | undefined;
    page: TPage;
    item: TItem;
  }) => MaybePromise<TCursor | undefined>;
  pageCursor?: (args: {
    ctx: DefinedAdapterContext<TClient>;
    connectionId: string;
    cursor: TCursor | undefined;
    page: TPage;
  }) => MaybePromise<TCursor | undefined>;
  hasMore?: (args: {
    ctx: DefinedAdapterContext<TClient>;
    connectionId: string;
    cursor: TCursor | undefined;
    page: TPage;
    itemCount: number;
  }) => MaybePromise<boolean>;
};

export function pollMonitor<TClient, TCursor, TPage, TItem>(
  config: PollConfig<TClient, TCursor, TPage, TItem>,
): (ctx: DefinedAdapterContext<TClient>, emit: EmitFunc) => Promise<void> {
  return async (ctx, emit) => {
    const connectionId = requireConnectionId(ctx);
    let cursor = config.initialCursor
      ? await config.initialCursor({ ctx, connectionId })
      : undefined;
    const idleMs = Math.max(0, Math.trunc(config.idleMs ?? 0));
    const errorDelayMs = Math.max(0, Math.trunc(config.errorDelayMs ?? 1_000));

    while (!ctx.signal.aborted) {
      try {
        const page = await config.poll({
          ctx,
          connectionId,
          cursor,
          signal: ctx.signal,
        });

        let emitted = 0;
        for (const item of config.items(page)) {
          const result = await config.toRecord({
            ctx,
            connectionId,
            cursor,
            page,
            item,
          });
          for (const record of asRecords(result)) {
            emit(record);
            emitted += 1;
          }
          if (config.nextCursor) {
            cursor = await config.nextCursor({
              ctx,
              connectionId,
              cursor,
              page,
              item,
            });
          }
        }

        if (config.pageCursor) {
          cursor = await config.pageCursor({
            ctx,
            connectionId,
            cursor,
            page,
          });
        }

        if (emitted > 0) {
          ctx.log.debug("emitted %d records", emitted);
        }
        if (idleMs > 0) {
          await sleepWithSignal(ctx.signal, idleMs);
        }
      } catch (err) {
        if (ctx.signal.aborted) {
          break;
        }
        ctx.log.error("poll monitor error: %s", err instanceof Error ? err.message : String(err));
        if (errorDelayMs > 0) {
          await sleepWithSignal(ctx.signal, errorDelayMs);
        }
      }
    }
  };
}

export function pollBackfill<TClient, TCursor, TPage, TItem>(
  config: PollBackfillConfig<TClient, TCursor, TPage, TItem>,
): (ctx: DefinedAdapterContext<TClient>, args: { since: Date }, emit: EmitFunc) => Promise<void> {
  return async (ctx, args, emit) => {
    const connectionId = requireConnectionId(ctx);
    let cursor = config.initialCursor
      ? await config.initialCursor({ ctx, connectionId, since: args.since })
      : undefined;

    while (!ctx.signal.aborted) {
      const page = await config.poll({
        ctx,
        connectionId,
        cursor,
        since: args.since,
        signal: ctx.signal,
      });

      let itemCount = 0;
      for (const item of config.items(page)) {
        itemCount += 1;
        const result = await config.toRecord({
          ctx,
          connectionId,
          cursor,
          page,
          item,
        });
        for (const record of asRecords(result)) {
          emit(record);
        }
        if (config.nextCursor) {
          cursor = await config.nextCursor({
            ctx,
            connectionId,
            cursor,
            page,
            item,
          });
        }
      }

      if (config.pageCursor) {
        cursor = await config.pageCursor({
          ctx,
          connectionId,
          cursor,
          page,
        });
      }

      const hasMore = config.hasMore
        ? await config.hasMore({
            ctx,
            connectionId,
            cursor,
            page,
            itemCount,
          })
        : itemCount > 0;
      if (!hasMore) {
        return;
      }
    }
  };
}

function asRecords(
  value: AdapterInboundRecord | AdapterInboundRecord[] | null | undefined,
): AdapterInboundRecord[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function requireConnectionId<TClient>(ctx: DefinedAdapterContext<TClient>): string {
  const connectionId = ctx.connectionId?.trim();
  if (!connectionId) {
    throw new Error("connection id is required");
  }
  return connectionId;
}
