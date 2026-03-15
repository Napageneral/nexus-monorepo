import { createAdapterLogger, patchConsoleToStderr, type AdapterLogger } from "./logger.js";
import { writeJSONLine } from "./io.js";
import { createAdapterServeSession, type AdapterServeSession } from "./serve.js";
import {
  AdapterAccountSchema,
  AdapterHealthSchema,
  AdapterInboundRecordSchema,
  AdapterInfoSchema,
  AdapterSetupResultSchema,
  AdapterStreamStatusSchema,
  DeliveryResultSchema,
  DeliveryTargetSchema,
  SendRequestSchema,
  type AdapterAccount,
  type AdapterHealth,
  type AdapterInboundRecord,
  type AdapterInfo,
  type AdapterSetupResult,
  type AdapterStreamStatus,
  type DeliveryResult,
  type SendRequest,
} from "./protocol.js";
import {
  loadAdapterRuntimeContext,
  requireAdapterRuntimeContext,
  type AdapterRuntimeContext,
} from "./runtime-context.js";
import { handleStream, type StreamHandlers } from "./stream.js";

export type AdapterContext = {
  signal: AbortSignal;
  runtime: AdapterRuntimeContext | null;
  log: AdapterLogger;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
};

export type AdapterSetupRequest = {
  connection_id?: string;
  session_id?: string;
  payload?: Record<string, unknown>;
};

export type AdapterMethodInvokeRequest = {
  connection_id?: string;
  payload?: Record<string, unknown>;
};

export type AdapterOperations = {
  "adapter.info"?: (ctx: AdapterContext) => AdapterInfo | Promise<AdapterInfo>;
  "adapter.monitor.start"?: (
    ctx: AdapterContext,
    args: { connection_id: string },
    emit: (record: AdapterInboundRecord) => void,
  ) => void | Promise<void>;
  "records.backfill"?: (
    ctx: AdapterContext,
    args: { connection_id: string; since: Date },
    emit: (record: AdapterInboundRecord) => void,
  ) => void | Promise<void>;
  "channels.send"?: (ctx: AdapterContext, req: SendRequest) => DeliveryResult | Promise<DeliveryResult>;
  "adapter.health"?: (
    ctx: AdapterContext,
    args: { connection_id: string },
  ) => AdapterHealth | Promise<AdapterHealth>;
  "adapter.accounts.list"?: (ctx: AdapterContext) => AdapterAccount[] | Promise<AdapterAccount[]>;
  "adapter.setup.start"?: (
    ctx: AdapterContext,
    req: AdapterSetupRequest,
  ) => AdapterSetupResult | Promise<AdapterSetupResult>;
  "adapter.setup.submit"?: (
    ctx: AdapterContext,
    req: AdapterSetupRequest,
  ) => AdapterSetupResult | Promise<AdapterSetupResult>;
  "adapter.setup.status"?: (
    ctx: AdapterContext,
    req: AdapterSetupRequest,
  ) => AdapterSetupResult | Promise<AdapterSetupResult>;
  "adapter.setup.cancel"?: (
    ctx: AdapterContext,
    req: AdapterSetupRequest,
  ) => AdapterSetupResult | Promise<AdapterSetupResult>;
  "adapter.serve.start"?: (
    ctx: AdapterContext,
    args: { connection_id: string },
    session: AdapterServeSession,
  ) => void | Promise<void>;
  "channels.stream"?: StreamHandlers;
  methods?: Record<
    string,
    (ctx: AdapterContext, req: AdapterMethodInvokeRequest) => unknown | Promise<unknown>
  >;
};

export type AdapterDefinition = {
  operations: AdapterOperations;
};

export type RunAdapterOptions = {
  argv?: string[];
  env?: NodeJS.ProcessEnv;
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WriteStream;
  stderr?: NodeJS.WriteStream;
  requireRuntimeContext?: boolean;
  validateOutput?: boolean;
  patchConsole?: boolean;
  installSignalHandlers?: boolean;
};

export async function runAdapter(adapter: AdapterDefinition, opts: RunAdapterOptions = {}): Promise<number> {
  const argv = opts.argv ?? process.argv;
  const env = opts.env ?? process.env;
  const stdin = opts.stdin ?? process.stdin;
  const stdout = opts.stdout ?? process.stdout;
  const stderr = opts.stderr ?? process.stderr;
  const requireRuntimeContext = opts.requireRuntimeContext ?? true;
  const validateOutput = opts.validateOutput ?? true;
  const doPatchConsole = opts.patchConsole ?? true;
  const installSignalHandlers = opts.installSignalHandlers ?? true;

  const command = String(argv[2] ?? "").trim();
  const args = argv.slice(3);

  const verbose = args.includes("--verbose") || args.includes("-v");
  const log = createAdapterLogger({ verbose, stderr });

  if (doPatchConsole) {
    patchConsoleToStderr(log);
  }

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage(argv[1] ?? "adapter", stderr);
    return command ? 0 : 1;
  }

  const filteredArgs = args.filter((a) => a !== "--verbose" && a !== "-v");

  const controller = new AbortController();
  if (installSignalHandlers) {
    const onSignal = () => controller.abort();
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  }

  let runtime: AdapterRuntimeContext | null = null;
  const commandNeedsRuntimeContext =
    command !== "adapter.info" &&
    command !== "adapter.setup.start" &&
    command !== "adapter.setup.submit" &&
    command !== "adapter.setup.status" &&
    command !== "adapter.setup.cancel";
  if (commandNeedsRuntimeContext) {
    try {
      runtime = requireRuntimeContext ? requireAdapterRuntimeContext(env) : loadAdapterRuntimeContext(env);
    } catch (err) {
      log.error("%s", errorToString(err));
      return 1;
    }
  }

  const ctx: AdapterContext = {
    signal: controller.signal,
    runtime,
    log,
    stdout,
    stderr,
  };

  const operations = adapter.operations;

  try {
    switch (command) {
      case "adapter.info": {
        const handler = operations["adapter.info"];
        if (!handler) {
          throw new Error("adapter.info not supported by this adapter");
        }
        const info = await handler(ctx);
        writeJSONLine(stdout, validateOutput ? AdapterInfoSchema.parse(info) : info);
        return 0;
      }
      case "adapter.monitor.start": {
        const handler = operations["adapter.monitor.start"];
        if (!handler) {
          throw new Error("adapter.monitor.start not supported by this adapter");
        }
        const connectionID = requireFlag(filteredArgs, "--connection");
        const emit = (record: AdapterInboundRecord) => {
          const payload = validateOutput ? AdapterInboundRecordSchema.parse(record) : record;
          writeJSONLine(stdout, payload);
        };
        ctx.log.info("monitor starting for connection %s", JSON.stringify(connectionID));
        await handler(ctx, { connection_id: connectionID }, emit);
        ctx.log.info("monitor stopped cleanly");
        return 0;
      }
      case "records.backfill": {
        const handler = operations["records.backfill"];
        if (!handler) {
          throw new Error("records.backfill not supported by this adapter");
        }
        const connectionID = requireFlag(filteredArgs, "--connection");
        const sinceRaw = requireFlag(filteredArgs, "--since");
        const since = parseDate(sinceRaw);
        const emit = (record: AdapterInboundRecord) => {
          const payload = validateOutput ? AdapterInboundRecordSchema.parse(record) : record;
          writeJSONLine(stdout, payload);
        };
        ctx.log.info(
          "backfill starting for connection %s since %s",
          JSON.stringify(connectionID),
          since.toISOString(),
        );
        await handler(ctx, { connection_id: connectionID, since }, emit);
        ctx.log.info("backfill completed");
        return 0;
      }
      case "channels.send": {
        const handler = operations["channels.send"];
        if (!handler) {
          throw new Error("channels.send not supported by this adapter");
        }
        const connectionID = requireFlag(filteredArgs, "--connection");
        const targetRaw = requireFlag(filteredArgs, "--target-json");
        const target = DeliveryTargetSchema.parse(parseJsonObjectFlag(targetRaw, "--target-json"));
        if (target.connection_id !== connectionID) {
          throw new Error(
            `--connection ${JSON.stringify(connectionID)} does not match target.connection_id ${JSON.stringify(target.connection_id)}`,
          );
        }
        const text = readFlag(filteredArgs, "--text");
        const media = readFlag(filteredArgs, "--media");
        const caption = readFlag(filteredArgs, "--caption");

        if (!text && !media) {
          throw new Error("channels.send requires --text or --media");
        }
        if (text && media) {
          throw new Error("channels.send must not specify both --text and --media");
        }
        if (caption && !media) {
          throw new Error("channels.send --caption requires --media");
        }

        const req: SendRequest = {
          target,
          ...(text ? { text } : {}),
          ...(media ? { media } : {}),
          ...(caption ? { caption } : {}),
        };
        const parsedReq = validateOutput ? SendRequestSchema.parse(req) : req;

        try {
          const result = await handler(ctx, parsedReq);
          writeJSONLine(stdout, validateOutput ? DeliveryResultSchema.parse(result) : result);
          return 0;
        } catch (err) {
          const failure: DeliveryResult = {
            success: false,
            message_ids: [],
            chunks_sent: 0,
            error: {
              type: "unknown",
              message: errorToString(err),
              retry: false,
            },
          };
          writeJSONLine(stdout, validateOutput ? DeliveryResultSchema.parse(failure) : failure);
          return 0;
        }
      }
      case "adapter.health": {
        const handler = operations["adapter.health"];
        if (!handler) {
          throw new Error("adapter.health not supported by this adapter");
        }
        const connectionID = requireFlag(filteredArgs, "--connection");
        try {
          const health = await handler(ctx, { connection_id: connectionID });
          writeJSONLine(stdout, validateOutput ? AdapterHealthSchema.parse(health) : health);
          return 0;
        } catch (err) {
          const health: AdapterHealth = {
            connected: false,
            connection_id: connectionID,
            error: errorToString(err),
          };
          writeJSONLine(stdout, validateOutput ? AdapterHealthSchema.parse(health) : health);
          return 0;
        }
      }
      case "adapter.accounts.list": {
        const handler = operations["adapter.accounts.list"];
        if (!handler) {
          throw new Error("adapter.accounts.list not supported by this adapter");
        }
        const accounts = await handler(ctx);
        const payload = validateOutput ? zArray(AdapterAccountSchema).parse(accounts) : accounts;
        writeJSONLine(stdout, payload);
        return 0;
      }
      case "adapter.setup.start": {
        const handler = operations["adapter.setup.start"];
        if (!handler) {
          throw new Error("adapter.setup.start not supported by this adapter");
        }
        const req = readAdapterSetupRequest(filteredArgs, false);
        const result = await handler(ctx, req);
        writeJSONLine(stdout, validateOutput ? AdapterSetupResultSchema.parse(result) : result);
        return 0;
      }
      case "adapter.setup.submit": {
        const handler = operations["adapter.setup.submit"];
        if (!handler) {
          throw new Error("adapter.setup.submit not supported by this adapter");
        }
        const req = readAdapterSetupRequest(filteredArgs, true);
        const result = await handler(ctx, req);
        writeJSONLine(stdout, validateOutput ? AdapterSetupResultSchema.parse(result) : result);
        return 0;
      }
      case "adapter.setup.status": {
        const handler = operations["adapter.setup.status"];
        if (!handler) {
          throw new Error("adapter.setup.status not supported by this adapter");
        }
        const req = readAdapterSetupRequest(filteredArgs, true);
        const result = await handler(ctx, req);
        writeJSONLine(stdout, validateOutput ? AdapterSetupResultSchema.parse(result) : result);
        return 0;
      }
      case "adapter.setup.cancel": {
        const handler = operations["adapter.setup.cancel"];
        if (!handler) {
          throw new Error("adapter.setup.cancel not supported by this adapter");
        }
        const req = readAdapterSetupRequest(filteredArgs, true);
        const result = await handler(ctx, req);
        writeJSONLine(stdout, validateOutput ? AdapterSetupResultSchema.parse(result) : result);
        return 0;
      }
      case "adapter.serve.start": {
        const handler = operations["adapter.serve.start"];
        if (!handler) {
          throw new Error("adapter.serve.start not supported by this adapter");
        }
        const connectionID = requireFlag(filteredArgs, "--connection");
        const session = createAdapterServeSession({
          stdin,
          stdout,
          signal: ctx.signal,
          validateFrames: validateOutput,
          log: ctx.log,
        });
        await handler(ctx, { connection_id: connectionID }, session);
        return 0;
      }
      case "channels.stream": {
        const handler = operations["channels.stream"];
        if (!handler) {
          throw new Error("channels.stream not supported by this adapter");
        }
        void requireFlag(filteredArgs, "--connection");
        ctx.log.info("stream handler starting");
        await handleStream({ ctx, handlers: handler, stdin, stdout, validate: validateOutput });
        ctx.log.info("stream handler stopped cleanly");
        return 0;
      }
      default: {
        const handler = operations.methods?.[command];
        if (!handler) {
          stderr.write(`unknown command: ${command}\n`);
          printUsage(argv[1] ?? "adapter", stderr);
          return 1;
        }
        const connectionID = readFlag(filteredArgs, "--connection");
        const payloadRaw = readFlag(filteredArgs, "--payload-json");
        const payload = payloadRaw ? parseJsonObjectFlag(payloadRaw, "--payload-json") : undefined;
        const result = await handler(ctx, {
          ...(connectionID ? { connection_id: connectionID } : {}),
          ...(payload ? { payload } : {}),
        });
        writeJSONLine(stdout, result ?? {});
        return 0;
      }
    }
  } catch (err) {
    log.error("%s", errorToString(err));
    return 1;
  }
}

function printUsage(name: string, stderr: NodeJS.WriteStream): void {
  stderr.write(`Usage: ${name} <operation> [flags]\n\n`);
  stderr.write("Operations:\n");
  stderr.write("  adapter.info\n");
  stderr.write("  adapter.monitor.start --connection <id>\n");
  stderr.write("  records.backfill --connection <id> --since <date>\n");
  stderr.write("  channels.send --connection <id> --target-json <json> --text \"...\"\n");
  stderr.write("  adapter.health --connection <id>\n");
  stderr.write("  adapter.accounts.list\n");
  stderr.write("  adapter.setup.start [--connection <id>] [--session-id <id>] [--payload-json <json>]\n");
  stderr.write("  adapter.setup.submit --session-id <id> [--connection <id>] [--payload-json <json>]\n");
  stderr.write("  adapter.setup.status --session-id <id> [--connection <id>]\n");
  stderr.write("  adapter.setup.cancel --session-id <id> [--connection <id>]\n");
  stderr.write("  adapter.serve.start --connection <id>\n");
  stderr.write("  channels.stream --connection <id>\n\n");
  stderr.write("  <namespace.method> [--connection <id>] [--payload-json <json>]\n\n");
  stderr.write("Global flags:\n");
  stderr.write("  --verbose, -v                     Enable debug logging\n");
}

function readFlag(args: string[], name: string): string | undefined {
  const eqPrefix = `${name}=`;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === name) {
      const v = args[i + 1];
      return typeof v === "string" ? v : undefined;
    }
    if (a.startsWith(eqPrefix)) {
      return a.slice(eqPrefix.length);
    }
  }
  return undefined;
}

function requireFlag(args: string[], name: string): string {
  const v = readFlag(args, name);
  if (!v || !v.trim()) {
    throw new Error(`Missing required flag: ${name}`);
  }
  return v;
}

function parseJsonObjectFlag(raw: string, flagName: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${flagName} must be valid JSON: ${errorToString(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${flagName} must decode to a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function readAdapterSetupRequest(args: string[], requireSessionID: boolean): AdapterSetupRequest {
  const connectionID = readFlag(args, "--connection");
  const sessionID = requireSessionID
    ? requireFlag(args, "--session-id")
    : readFlag(args, "--session-id");
  const payloadRaw = readFlag(args, "--payload-json");
  const payload = payloadRaw ? parseJsonObjectFlag(payloadRaw, "--payload-json") : undefined;
  return {
    ...(connectionID ? { connection_id: connectionID } : {}),
    ...(sessionID ? { session_id: sessionID } : {}),
    ...(payload ? { payload } : {}),
  };
}

function parseDate(s: string): Date {
  const trimmed = s.trim();
  if (!trimmed) {
    throw new Error("date is required");
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed);
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(trimmed);
  if (m) {
    return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  }

  throw new Error("unrecognized date format (expected ISO 8601 or YYYY-MM-DD)");
}

function errorToString(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function zArray<T>(schema: { parse: (value: unknown) => T }): { parse: (value: unknown) => T[] } {
  return {
    parse: (value: unknown) => {
      if (!Array.isArray(value)) {
        throw new Error("expected array");
      }
      return value.map((v) => schema.parse(v));
    },
  };
}
