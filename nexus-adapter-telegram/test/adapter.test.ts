import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runAdapter } from "@nexus-project/adapter-sdk-ts";
import { buildEventFromUpdate, parseTelegramTarget, telegramAdapter } from "../src/adapter.js";

function createCaptureStream() {
  let data = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      data += String(chunk);
      callback();
    },
  });
  return {
    stream,
    read() {
      return data;
    },
  };
}

function createRuntimeContextEnv(): { env: NodeJS.ProcessEnv; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "telegram-adapter-test-"));
  const contextPath = path.join(dir, "runtime-context.json");
  fs.writeFileSync(
    contextPath,
    JSON.stringify(
      {
        version: 1,
        channel: "telegram",
        account_id: "default",
        config: {},
        credential: {
          kind: "token",
          value: "bot-token-test",
          ref: "telegram/default",
          service: "telegram",
          account: "default",
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    env: {
      ...process.env,
      NEXUS_ADAPTER_CONTEXT_PATH: contextPath,
    },
    cleanup: () => {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("telegram adapter contract smoke", () => {
  it("parses target prefixes", () => {
    expect(parseTelegramTarget("telegram:-100123")).toBe("-100123");
    expect(parseTelegramTarget("chat:@mybot")).toBe("@mybot");
    expect(parseTelegramTarget("123456")).toBe("123456");
  });

  it("prints valid info payload", async () => {
    const stdout = createCaptureStream();
    const stderr = createCaptureStream();

    const code = await runAdapter(telegramAdapter, {
      argv: ["node", "adapter", "info"],
      stdout: stdout.stream,
      stderr: stderr.stream,
      patchConsole: false,
      installSignalHandlers: false,
      requireRuntimeContext: false,
    });

    expect(code).toBe(0);
    const line = stdout
      .read()
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find(Boolean);
    expect(line).toBeTruthy();
    const parsed = JSON.parse(line ?? "{}");
    expect(parsed.channel).toBe("telegram");
    expect(parsed.supports).toContain("monitor");
    expect(parsed.supports).toContain("send");
    expect(parsed.channel_capabilities.supports_threads).toBe(true);
  });

  it("passes thread_id and reply_to_id to Telegram API on send", async () => {
    const stdout = createCaptureStream();
    const stderr = createCaptureStream();
    const runtime = createRuntimeContextEnv();

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      expect(body.chat_id).toBe("-100123");
      expect(body.message_thread_id).toBe(7);
      expect(body.reply_to_message_id).toBe(42);
      expect(body.text).toBe("hello");
      return new Response(
        JSON.stringify({
          ok: true,
          result: { message_id: 9001 },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    try {
      const code = await runAdapter(telegramAdapter, {
        argv: [
          "node",
          "adapter",
          "send",
          "--account",
          "default",
          "--to",
          "telegram:-100123",
          "--thread",
          "7",
          "--reply-to",
          "42",
          "--text",
          "hello",
        ],
        env: runtime.env,
        stdout: stdout.stream,
        stderr: stderr.stream,
        patchConsole: false,
        installSignalHandlers: false,
        requireRuntimeContext: false,
      });

      expect(code).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const line = stdout
        .read()
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .find(Boolean);
      const parsed = JSON.parse(line ?? "{}");
      expect(parsed.success).toBe(true);
      expect(parsed.message_ids).toEqual(["9001"]);
      expect(parsed.chunks_sent).toBe(1);
    } finally {
      runtime.cleanup();
      vi.unstubAllGlobals();
    }
  });

  it("builds strict v2 event shape from Telegram update", () => {
    const event = buildEventFromUpdate(
      {
        update_id: 321,
        message: {
          message_id: 99,
          date: 1_701_000_000,
          text: "hello world",
          message_thread_id: 12,
          reply_to_message: { message_id: 55 },
          chat: {
            id: -100123,
            type: "supergroup",
            title: "Ops",
          },
          from: {
            id: 777,
            username: "alice",
          },
        },
      },
      "default",
    );

    expect(event).toBeTruthy();
    expect(event?.platform).toBe("telegram");
    expect(event?.account_id).toBe("default");
    expect(event?.container_kind).toBe("group");
    expect(event?.container_id).toBe("-100123");
    expect(event?.thread_id).toBe("12");
    expect(event?.reply_to_id).toBe("55");
    expect(event?.sender_id).toBe("777");
    expect(event?.sender_name).toBe("@alice");
    expect(event?.content).toBe("hello world");

    const asRecord = event as unknown as Record<string, unknown>;
    expect(asRecord.channel).toBeUndefined();
    expect(asRecord.peer_id).toBeUndefined();
    expect(asRecord.peer_kind).toBeUndefined();
  });
});
