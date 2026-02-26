import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { runAdapter } from "@nexus-project/adapter-sdk-ts";
import {
  buildEventFromBaileysMessage,
  normalizeWhatsAppTarget,
  whatsappAdapter,
} from "../src/adapter.js";

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

describe("whatsapp adapter contract smoke", () => {
  it("normalizes WhatsApp targets", () => {
    expect(normalizeWhatsAppTarget("whatsapp:+14155550123")).toBe("14155550123@s.whatsapp.net");
    expect(normalizeWhatsAppTarget("120363401234567890@g.us")).toBe("120363401234567890@g.us");
    expect(normalizeWhatsAppTarget("41796666864:0@s.whatsapp.net")).toBe(
      "41796666864:0@s.whatsapp.net",
    );
  });

  it("prints valid info payload", async () => {
    const stdout = createCaptureStream();
    const stderr = createCaptureStream();

    const code = await runAdapter(whatsappAdapter, {
      argv: ["node", "adapter", "adapter.info"],
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
    const parsed = JSON.parse(line ?? "{}");
    expect(parsed.platform).toBe("whatsapp");
    expect(parsed.operations).toContain("adapter.monitor.start");
    expect(parsed.operations).toContain("delivery.send");
  });

  it("reports disconnected health when auth session is missing", async () => {
    const stdout = createCaptureStream();
    const stderr = createCaptureStream();
    const authDir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-auth-"));
    const previousAuthDir = process.env.NEXUS_WHATSAPP_AUTH_DIR;
    process.env.NEXUS_WHATSAPP_AUTH_DIR = authDir;

    try {
      const code = await runAdapter(whatsappAdapter, {
        argv: ["node", "adapter", "adapter.health", "--account", "default"],
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
      const parsed = JSON.parse(line ?? "{}");
      expect(parsed.connected).toBe(false);
      expect(parsed.account).toBe("default");
    } finally {
      if (previousAuthDir) {
        process.env.NEXUS_WHATSAPP_AUTH_DIR = previousAuthDir;
      } else {
        delete process.env.NEXUS_WHATSAPP_AUTH_DIR;
      }
      fs.rmSync(authDir, { recursive: true, force: true });
    }
  });

  it("builds strict v2 event shape from a Baileys message", () => {
    const event = buildEventFromBaileysMessage(
      {
        key: {
          id: "ABC123",
          remoteJid: "120363401234567890@g.us",
          participant: "15550001111@s.whatsapp.net",
          fromMe: false,
        },
        pushName: "Alice",
        messageTimestamp: 1_701_000_000,
        message: {
          extendedTextMessage: {
            text: "hello from group",
            contextInfo: {
              stanzaId: "PREV999",
            },
          },
        },
      },
      "default",
    );

    expect(event).toBeTruthy();
    expect(event?.platform).toBe("whatsapp");
    expect(event?.account_id).toBe("default");
    expect(event?.container_kind).toBe("group");
    expect(event?.container_id).toBe("120363401234567890@g.us");
    expect(event?.sender_id).toBe("15550001111@s.whatsapp.net");
    expect(event?.reply_to_id).toBe("PREV999");
    expect(event?.content).toBe("hello from group");

    const asRecord = event as unknown as Record<string, unknown>;
    expect(asRecord.channel).toBeUndefined();
    expect(asRecord.peer_id).toBeUndefined();
    expect(asRecord.peer_kind).toBeUndefined();
  });
});
