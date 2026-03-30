#!/usr/bin/env node
import crypto from "node:crypto";
import process from "node:process";
import { WebSocket } from "ws";
import { fail, parseJsonOrNull, text } from "./frontdoor-smoke-lib.mjs";

const PROTOCOL_VERSION = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

function usage() {
  process.stderr.write(
    [
      "Usage: node ./scripts/frontdoor-runtime-rpc.mjs --method <runtime.method> [--params '<json>']",
      "",
      "Environment:",
      "  FRONTDOOR_SMOKE_RUNTIME_ACCESS_TOKEN   Runtime bearer token",
      "  FRONTDOOR_SMOKE_RUNTIME_WS_URL         Runtime WebSocket URL",
      "  FRONTDOOR_SMOKE_RUNTIME_BASE_URL       Optional base URL used to derive /runtime/ws",
      "",
    ].join("\n") + "\n",
  );
}

function parseArgs(argv) {
  let method = "";
  let paramsRaw = "{}";
  let wsUrl = "";
  let token = "";
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--method") {
      method = text(argv[++i]);
    } else if (arg === "--params") {
      paramsRaw = text(argv[++i]) || "{}";
    } else if (arg === "--ws-url") {
      wsUrl = text(argv[++i]);
    } else if (arg === "--token") {
      token = text(argv[++i]);
    } else if (arg === "--timeout-ms") {
      const parsed = Number(argv[++i]);
      if (Number.isFinite(parsed) && parsed > 0) {
        timeoutMs = parsed;
      }
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      fail("unknown argument", { argument: arg });
    }
  }

  if (!method) {
    usage();
    fail("missing required --method");
  }

  const params = parseJsonOrNull(paramsRaw);
  if (paramsRaw && params === null) {
    fail("invalid --params JSON", { params: paramsRaw });
  }

  const envToken = text(process.env.FRONTDOOR_SMOKE_RUNTIME_ACCESS_TOKEN);
  const envWsUrl =
    text(process.env.FRONTDOOR_SMOKE_RUNTIME_WS_URL) ||
    deriveWsUrl(text(process.env.FRONTDOOR_SMOKE_RUNTIME_BASE_URL));

  return {
    method,
    params: params ?? {},
    wsUrl: wsUrl || envWsUrl,
    token: token || envToken,
    timeoutMs,
  };
}

function deriveWsUrl(baseUrl) {
  if (!baseUrl) {
    return "";
  }
  try {
    const url = new URL("/runtime/ws", `${baseUrl.replace(/\/+$/g, "")}/`);
    if (url.protocol === "http:") {
      url.protocol = "ws:";
    } else if (url.protocol === "https:") {
      url.protocol = "wss:";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function awaitFrame(ws, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timeout waiting for runtime frame"));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      ws.off("message", onMessage);
      ws.off("close", onClose);
      ws.off("error", onError);
    };
    const onMessage = (data) => {
      let frame;
      try {
        frame = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!predicate(frame)) {
        return;
      }
      cleanup();
      resolve(frame);
    };
    const onClose = (code, reason) => {
      cleanup();
      reject(new Error(`runtime websocket closed (${code}): ${String(reason)}`));
    };
    const onError = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    ws.on("message", onMessage);
    ws.once("close", onClose);
    ws.once("error", onError);
  });
}

async function openRuntimeSocket(wsUrl, timeoutMs) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting for runtime websocket open")), timeoutMs);
    ws.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  return ws;
}

async function connectRuntime(ws, token, timeoutMs) {
  const id = crypto.randomUUID();
  ws.send(
    JSON.stringify({
      type: "req",
      id,
      method: "connect",
      params: {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        client: {
          id: "test",
          version: "1.0.0",
          platform: "frontdoor-smoke",
          mode: "test",
        },
        caps: [],
        commands: [],
        role: "operator",
        auth: token ? { token } : undefined,
      },
    }),
  );
  const response = await awaitFrame(
    ws,
    (frame) => frame && frame.type === "res" && frame.id === id,
    timeoutMs,
  );
  if (!response.ok) {
    fail("runtime connect failed", { error: response.error ?? null });
  }
}

async function callRuntime(ws, method, params, timeoutMs) {
  const id = crypto.randomUUID();
  ws.send(
    JSON.stringify({
      type: "req",
      id,
      method,
      params,
    }),
  );
  const response = await awaitFrame(
    ws,
    (frame) => frame && frame.type === "res" && frame.id === id,
    timeoutMs,
  );
  if (!response.ok) {
    fail("runtime RPC failed", {
      method,
      error: response.error ?? null,
    });
  }
  return response.payload ?? null;
}

async function main() {
  const { method, params, wsUrl, token, timeoutMs } = parseArgs(process.argv.slice(2));
  if (!wsUrl) {
    fail("missing runtime websocket URL", {
      required_env: [
        "FRONTDOOR_SMOKE_RUNTIME_WS_URL",
        "FRONTDOOR_SMOKE_RUNTIME_BASE_URL",
      ],
    });
  }
  if (!token) {
    fail("missing runtime access token", {
      required_env: ["FRONTDOOR_SMOKE_RUNTIME_ACCESS_TOKEN"],
    });
  }

  const ws = await openRuntimeSocket(wsUrl, timeoutMs);
  try {
    await connectRuntime(ws, token, timeoutMs);
    const payload = await callRuntime(ws, method, params, timeoutMs);
    process.stdout.write(`${JSON.stringify({ ok: true, method, payload }, null, 2)}\n`);
  } finally {
    ws.close();
  }
}

main().catch((error) => {
  fail("unexpected_failure", {
    detail: error instanceof Error ? error.message : String(error),
  });
});
