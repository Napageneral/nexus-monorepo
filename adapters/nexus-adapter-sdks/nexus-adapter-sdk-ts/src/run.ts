import { createAdapterLogger, patchConsoleToStderr, type AdapterLogger } from "./logger.js";
import { writeJSONLine } from "./io.js";
import { createAdapterControlSession, type AdapterControlSession } from "./control.js";
import {
  AdapterAccountSchema,
  AdapterHealthSchema,
  AdapterInfoSchema,
  AdapterSetupResultSchema,
  DeliveryResultSchema,
  NexusEventSchema,
  SendRequestSchema,
  type AdapterAccount,
  type AdapterHealth,
  type AdapterInfo,
  type AdapterSetupResult,
  type DeliveryResult,
  type NexusEvent,
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
  account?: string;
  session_id?: string;
  payload?: Record<string, unknown>;
};

export type AdapterOperations = {
  "adapter.info"?: (ctx: AdapterContext) => AdapterInfo | Promise<AdapterInfo>;
  "adapter.monitor.start"?: (
    ctx: AdapterContext,
    args: { account: string },
    emit: (e: NexusEvent) => void,
  ) => void | Promise<void>;
  "event.backfill"?: (
    ctx: AdapterContext,
    args: { account: string; since: Date },
    emit: (e: NexusEvent) => void,
  ) => void | Promise<void>;
  "delivery.send"?: (ctx: AdapterContext, req: SendRequest) => DeliveryResult | Promise<DeliveryResult>;
  "adapter.health"?: (
    ctx: AdapterContext,
    args: { account: string },
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
  "adapter.control.start"?: (
    ctx: AdapterContext,
    args: { account: string },
    session: AdapterControlSession,
  ) => void | Promise<void>;
  "delivery.stream"?: StreamHandlers;
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

  // Filter out global flags from args passed to subcommands.
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
        const account = requireFlag(filteredArgs, "--account");
        const emit = (event: NexusEvent) => {
          const payload = validateOutput ? NexusEventSchema.parse(event) : event;
          writeJSONLine(stdout, payload);
        };
        ctx.log.info("monitor starting for account %s", JSON.stringify(account));
        await handler(ctx, { account }, emit);
        ctx.log.info("monitor stopped cleanly");
        return 0;
      }
      case "event.backfill": {
        const handler = operations["event.backfill"];
        if (!handler) {
          throw new Error("event.backfill not supported by this adapter");
        }
        const account = requireFlag(filteredArgs, "--account");
        const sinceRaw = requireFlag(filteredArgs, "--since");
        const since = parseDate(sinceRaw);
        const emit = (event: NexusEvent) => {
          const payload = validateOutput ? NexusEventSchema.parse(event) : event;
          writeJSONLine(stdout, payload);
        };
        ctx.log.info(
          "backfill starting for account %s since %s",
          JSON.stringify(account),
          since.toISOString(),
        );
        await handler(ctx, { account, since }, emit);
        ctx.log.info("backfill completed");
        return 0;
      }
      case "delivery.send": {
        const handler = operations["delivery.send"];
        if (!handler) {
          throw new Error("delivery.send not supported by this adapter");
        }
        const account = requireFlag(filteredArgs, "--account");
        const to = requireFlag(filteredArgs, "--to");
        const text = readFlag(filteredArgs, "--text");
        const media = readFlag(filteredArgs, "--media");
        const caption = readFlag(filteredArgs, "--caption");
        const replyTo = readFlag(filteredArgs, "--reply-to");
        const threadID = readFlag(filteredArgs, "--thread");

        if (!text && !media) {
          throw new Error("delivery.send requires --text or --media");
        }
        if (text && media) {
          throw new Error("delivery.send must not specify both --text and --media");
        }
        if (caption && !media) {
          throw new Error("delivery.send --caption requires --media");
        }

        const req: SendRequest = {
          account,
          to,
          ...(text ? { text } : {}),
          ...(media ? { media } : {}),
          ...(caption ? { caption } : {}),
          ...(replyTo ? { reply_to_id: replyTo } : {}),
          ...(threadID ? { thread_id: threadID } : {}),
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
        const account = requireFlag(filteredArgs, "--account");
        try {
          const health = await handler(ctx, { account });
          writeJSONLine(stdout, validateOutput ? AdapterHealthSchema.parse(health) : health);
          return 0;
        } catch (err) {
          const health: AdapterHealth = {
            connected: false,
            account,
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
      case "adapter.control.start": {
        const handler = operations["adapter.control.start"];
        if (!handler) {
          throw new Error("adapter.control.start not supported by this adapter");
        }
        const account = requireFlag(filteredArgs, "--account");
        const session = createAdapterControlSession({
          stdin,
          stdout,
          signal: ctx.signal,
          validateFrames: validateOutput,
          log: ctx.log,
        });
        await handler(ctx, { account }, session);
        return 0;
      }
      case "delivery.stream": {
        const handler = operations["delivery.stream"];
        if (!handler) {
          throw new Error("delivery.stream not supported by this adapter");
        }
        // --account remains required by runtime process contract, even though stream_start.target
        // carries canonical account_id for each stream request.
        void requireFlag(filteredArgs, "--account");
        ctx.log.info("stream handler starting");
        await handleStream({ ctx, handlers: handler, stdin, stdout, validate: validateOutput });
        ctx.log.info("stream handler stopped cleanly");
        return 0;
      }
      default:
        stderr.write(`unknown command: ${command}\n`);
        printUsage(argv[1] ?? "adapter", stderr);
        return 1;
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
  stderr.write("  adapter.monitor.start --account <id>\n");
  stderr.write("  event.backfill --account <id> --since <date>\n");
  stderr.write("  delivery.send --account <id> --to <target> --text \"...\"\n");
  stderr.write("  adapter.health --account <id>\n");
  stderr.write("  adapter.accounts.list\n");
  stderr.write("  adapter.setup.start [--account <id>] [--session-id <id>] [--payload-json <json>]\n");
  stderr.write("  adapter.setup.submit --session-id <id> [--account <id>] [--payload-json <json>]\n");
  stderr.write("  adapter.setup.status --session-id <id> [--account <id>]\n");
  stderr.write("  adapter.setup.cancel --session-id <id> [--account <id>]\n");
  stderr.write("  adapter.control.start --account <id>\n");
  stderr.write("  delivery.stream --account <id>\n\n");
  stderr.write("Global flags:\n");
  stderr.write("  --verbose, -v                     Enable debug logging\n");
}

function readFlag(args: string[], name: string): string | undefined {
  // Support both: --flag value and --flag=value
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
  const account = readFlag(args, "--account");
  const sessionID = requireSessionID
    ? requireFlag(args, "--session-id")
    : readFlag(args, "--session-id");
  const payloadRaw = readFlag(args, "--payload-json");
  const payload = payloadRaw ? parseJsonObjectFlag(payloadRaw, "--payload-json") : undefined;
  return {
    ...(account ? { account } : {}),
    ...(sessionID ? { session_id: sessionID } : {}),
    ...(payload ? { payload } : {}),
  };
}

function parseDate(s: string): Date {
  const trimmed = s.trim();
  if (!trimmed) {
    throw new Error("date is required");
  }

  // Try common formats (mirrors Go SDK behavior).
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed);
  }

  // YYYY-MM-DD (Date.parse handles this in most runtimes, but keep explicit).
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
