import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  defineAdapter,
  messageRecord,
  readReplyToTarget,
  requireContainerTarget,
  sleepWithSignal,
  type AdapterInboundRecord,
  type Attachment,
  type AdapterContext,
  type DeliveryResult,
} from "@nexus-project/adapter-sdk-ts";

type UnknownRecord = Record<string, unknown>;

const WHATSAPP_TEXT_LIMIT = 4000;

type BaileysModule = {
  default: (options: Record<string, unknown>) => unknown;
  useMultiFileAuthState: (
    dir: string,
  ) => Promise<{ state: unknown; saveCreds: (...args: unknown[]) => void }>;
};

const silentLogger = {
  level: "silent",
  child() {
    return this;
  },
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
};

function asRecord(value: unknown): UnknownRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  const record = asRecord(value);
  if (record) {
    const low = asNumber(record.low);
    if (low !== undefined) {
      return low;
    }
  }
  return undefined;
}

function toUnixMs(value: unknown): number {
  const parsed = asNumber(value);
  if (parsed === undefined) {
    return Date.now();
  }
  // Baileys often exposes seconds for messageTimestamp.
  if (parsed < 10_000_000_000) {
    return Math.trunc(parsed * 1000);
  }
  return Math.trunc(parsed);
}

function stripWhatsAppPrefix(raw: string): string {
  return raw.trim().replace(/^whatsapp:/i, "").trim();
}

export function normalizeWhatsAppTarget(raw: string): string {
  const candidate = stripWhatsAppPrefix(raw);
  if (!candidate) {
    throw new Error("target is required");
  }

  if (/@(g\.us|s\.whatsapp\.net|lid)$/i.test(candidate)) {
    return candidate;
  }

  const digits = candidate.replace(/[^\d]/g, "");
  if (!digits) {
    throw new Error(`invalid WhatsApp target: ${raw}`);
  }
  return `${digits}@s.whatsapp.net`;
}

function resolveAuthDir(ctx: AdapterContext, connectionID: string): string {
  const fromEnv = process.env.NEXUS_WHATSAPP_AUTH_DIR?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }

  const config = (ctx.runtime?.config ?? {}) as UnknownRecord;
  const fromConfig = asString(config.auth_dir) ?? asString(config.authDir);
  if (fromConfig) {
    return path.resolve(fromConfig);
  }

  return path.resolve(os.homedir(), "nexus", "state", "credentials", "whatsapp", connectionID);
}

function ensureAuthDir(authDir: string): void {
  fs.mkdirSync(authDir, { recursive: true });
}

function inferContentType(messagePayload: UnknownRecord): "text" | "reaction" | "membership" {
  if (asRecord(messagePayload.reactionMessage)) {
    return "reaction";
  }
  return "text";
}

function inferContent(messagePayload: UnknownRecord): string {
  const conversation = asString(messagePayload.conversation);
  if (conversation) {
    return conversation;
  }

  const extended = asRecord(messagePayload.extendedTextMessage);
  const extendedText = asString(extended?.text);
  if (extendedText) {
    return extendedText;
  }

  const image = asRecord(messagePayload.imageMessage);
  if (image) {
    return asString(image.caption) ?? "[image]";
  }

  const video = asRecord(messagePayload.videoMessage);
  if (video) {
    return asString(video.caption) ?? "[video]";
  }

  if (asRecord(messagePayload.audioMessage)) {
    return "[audio]";
  }

  const document = asRecord(messagePayload.documentMessage);
  if (document) {
    return `[file] ${asString(document.fileName) ?? "document"}`;
  }

  const reaction = asRecord(messagePayload.reactionMessage);
  if (reaction) {
    const reactionText = asString(reaction.text);
    return reactionText ? `[reaction] ${reactionText}` : "[reaction]";
  }

  return "[unsupported whatsapp message]";
}

function extractReplyToID(messagePayload: UnknownRecord): string | undefined {
  const candidates = [
    asRecord(messagePayload.extendedTextMessage),
    asRecord(messagePayload.imageMessage),
    asRecord(messagePayload.videoMessage),
    asRecord(messagePayload.audioMessage),
    asRecord(messagePayload.documentMessage),
  ];

  for (const candidate of candidates) {
    const context = asRecord(candidate?.contextInfo);
    const stanzaID = asString(context?.stanzaId);
    if (stanzaID) {
      return stanzaID;
    }
  }

  const reaction = asRecord(messagePayload.reactionMessage);
  const reactionKey = asRecord(reaction?.key);
  return asString(reactionKey?.id);
}

function extractAttachments(messagePayload: UnknownRecord, messageID: string): Attachment[] {
  const attachments: Attachment[] = [];

  const image = asRecord(messagePayload.imageMessage);
  if (image) {
    attachments.push({
      id: `${messageID}:image`,
      filename: `${messageID}.jpg`,
      mime_type: asString(image.mimetype) ?? "image/jpeg",
      ...(asNumber(image.fileLength) ? { size: Math.trunc(asNumber(image.fileLength) ?? 0) } : {}),
    });
  }

  const video = asRecord(messagePayload.videoMessage);
  if (video) {
    attachments.push({
      id: `${messageID}:video`,
      filename: `${messageID}.mp4`,
      mime_type: asString(video.mimetype) ?? "video/mp4",
      ...(asNumber(video.fileLength) ? { size: Math.trunc(asNumber(video.fileLength) ?? 0) } : {}),
    });
  }

  const audio = asRecord(messagePayload.audioMessage);
  if (audio) {
    attachments.push({
      id: `${messageID}:audio`,
      filename: `${messageID}.ogg`,
      mime_type: asString(audio.mimetype) ?? "audio/ogg",
      ...(asNumber(audio.fileLength) ? { size: Math.trunc(asNumber(audio.fileLength) ?? 0) } : {}),
    });
  }

  const document = asRecord(messagePayload.documentMessage);
  if (document) {
    attachments.push({
      id: `${messageID}:document`,
      filename: asString(document.fileName) ?? `${messageID}.bin`,
      mime_type: asString(document.mimetype) ?? "application/octet-stream",
      ...(asNumber(document.fileLength) ? { size: Math.trunc(asNumber(document.fileLength) ?? 0) } : {}),
    });
  }

  return attachments;
}

export function buildEventFromBaileysMessage(
  raw: UnknownRecord,
  connectionID: string,
): AdapterInboundRecord | null {
  const key = asRecord(raw.key);
  const remoteJid = asString(key?.remoteJid);
  const messageID = asString(key?.id);
  const fromMe = Boolean(key?.fromMe);

  if (!remoteJid || !messageID || fromMe) {
    return null;
  }

  const messagePayload = asRecord(raw.message);
  if (!messagePayload) {
    return null;
  }

  const isGroup = remoteJid.endsWith("@g.us");
  const senderID = isGroup ? asString(key?.participant) ?? remoteJid : remoteJid;
  const senderName = asString(raw.pushName);
  const contentType = inferContentType(messagePayload);
  const content = inferContent(messagePayload);
  const timestamp = toUnixMs(raw.messageTimestamp);
  const replyToID = extractReplyToID(messagePayload);

  return messageRecord({
    platform: "whatsapp",
    connectionId: connectionID,
    externalRecordId: `whatsapp:${messageID}`,
    timestamp,
    senderId: senderID,
    senderName,
    containerId: remoteJid,
    containerKind: isGroup ? "group" : "direct",
    ...(replyToID ? { replyToId: replyToID } : {}),
    content,
    contentType,
    attachments: extractAttachments(messagePayload, messageID),
    metadata: {
      remote_jid: remoteJid,
      participant: asString(key?.participant) ?? null,
      message_id: messageID,
    },
  });
}

async function waitForOpen(params: {
  sock: any;
  signal: AbortSignal;
  timeoutMs: number;
}): Promise<void> {
  const { sock, signal, timeoutMs } = params;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error("aborted"));
    };

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error(`whatsapp connection timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const onConnectionUpdate = (update: unknown) => {
      const record = asRecord(update);
      const state = asString(record?.connection);
      if (state === "open") {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve();
        return;
      }
      if (state === "close") {
        const reason = asRecord(record?.lastDisconnect);
        const err = asRecord(reason?.error);
        const message = asString(err?.message) ?? "whatsapp connection closed";
        const status = extractStatusCode(err);
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        const wrapped = new Error(message) as Error & { status?: number };
        if (status !== undefined) {
          wrapped.status = status;
        }
        reject(wrapped);
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      sock.ev.off("connection.update", onConnectionUpdate);
    };

    signal.addEventListener("abort", onAbort, { once: true });
    sock.ev.on("connection.update", onConnectionUpdate);
  });
}

async function connectSocket(params: {
  authDir: string;
  signal: AbortSignal;
  timeoutMs: number;
}) {
  const baileys = await loadBaileysModule();
  const state = await baileys.useMultiFileAuthState(params.authDir);

  const sock = baileys.default({
    auth: state.state,
    logger: silentLogger as any,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    printQRInTerminal: false,
    browser: ["Mac OS", "Chrome", "22.0.0"],
  }) as any;

  sock.ev.on("creds.update", state.saveCreds);
  await waitForOpen({ sock, signal: params.signal, timeoutMs: params.timeoutMs });

  return {
    sock,
    close: () => {
      try {
        sock.end?.();
      } catch {
        // no-op
      }
      try {
        sock.ws?.close?.();
      } catch {
        // no-op
      }
    },
  };
}

function extractStatusCode(error: unknown): number | undefined {
  const record = asRecord(error);
  const direct = asNumber(record?.status);
  if (direct !== undefined) {
    return direct;
  }

  const output = asRecord(record?.output);
  const outputCode = asNumber(output?.statusCode);
  if (outputCode !== undefined) {
    return outputCode;
  }

  const payload = asRecord(output?.payload);
  const payloadCode = asNumber(payload?.statusCode);
  if (payloadCode !== undefined) {
    return payloadCode;
  }

  const nested = asRecord(record?.error);
  if (nested) {
    return extractStatusCode(nested);
  }
  return undefined;
}

function clearAuthSession(authDir: string): void {
  try {
    const entries = fs.readdirSync(authDir);
    for (const entry of entries) {
      fs.rmSync(path.join(authDir, entry), { recursive: true, force: true });
    }
  } catch {
    // no-op
  }
}

async function loadBaileysModule(): Promise<BaileysModule> {
  const cryptoRecord = globalThis as Record<string, unknown> & { crypto?: unknown };
  const existingCrypto = cryptoRecord.crypto as { subtle?: unknown } | undefined;
  if (!existingCrypto?.subtle) {
    const cryptoMod = await import("node:crypto");
    const webcrypto = (cryptoMod as { webcrypto?: { subtle?: unknown } }).webcrypto;
    if (webcrypto?.subtle) {
      try {
        cryptoRecord.crypto = webcrypto;
      } catch {
        // Some Node builds expose globalThis.crypto as getter-only.
      }
      try {
        Object.defineProperty(globalThis, "crypto", {
          value: webcrypto,
          configurable: true,
          enumerable: true,
          writable: true,
        });
      } catch {
        // Ignore if descriptor is non-configurable.
      }
    }
  }

  try {
    const mod = (await import("@whiskeysockets/baileys")) as unknown as Partial<BaileysModule>;
    if (typeof mod.default === "function" && typeof mod.useMultiFileAuthState === "function") {
      return mod as BaileysModule;
    }
  } catch (error) {
    throw new Error(
      `failed to load @whiskeysockets/baileys: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  throw new Error("failed to load @whiskeysockets/baileys: invalid module shape");
}

const WHATSAPP_CHANNEL_CAPABILITIES = {
  text_limit: WHATSAPP_TEXT_LIMIT,
  supports_markdown: false,
  markdown_flavor: "none",
  supports_tables: false,
  supports_code_blocks: false,
  supports_embeds: false,
  supports_threads: false,
  supports_reactions: true,
  supports_polls: true,
  supports_buttons: false,
  supports_edit: false,
  supports_delete: true,
  supports_media: true,
  supports_voice_notes: true,
  supports_streaming_edit: false,
} as const;

export const whatsappAdapter = defineAdapter({
  platform: "whatsapp",
  name: "nexus-adapter-whatsapp",
  version: "0.1.0",
  multi_account: true,
  credential_service: "whatsapp",
  auth: {
    methods: [
      {
        id: "whatsapp_session_upload",
        type: "file_upload",
        label: "Upload WhatsApp Session",
        icon: "upload",
        accept: [".json", ".zip"],
        templateUrl: "/templates/whatsapp-session.json",
      },
    ],
    setupGuide:
      "Provide an exported WhatsApp auth session bundle (Baileys creds/session files) to connect this account.",
  },
  capabilities: WHATSAPP_CHANNEL_CAPABILITIES,
  connection: {
    health: async (ctx) => {
      const authDir = resolveAuthDir(ctx, ctx.connectionId ?? "default");
      const credsPath = path.join(authDir, "creds.json");
      const connected = fs.existsSync(credsPath);
      return {
        connected,
        ...(connected ? { last_event_at: Date.now() } : { error: "missing WhatsApp auth session" }),
        details: {
          auth_dir: authDir,
        },
      };
    },
  },
  delivery: {
    send: async (ctx, req) => {
      if (req.media) {
        return {
          success: false,
          message_ids: [],
          chunks_sent: 0,
          error: {
            type: "content_rejected",
            message: "media send is not implemented in this adapter yet",
            retry: false,
          },
        };
      }

      const text = req.text?.trim();
      if (!text) {
        return {
          success: true,
          message_ids: [],
          chunks_sent: 0,
          total_chars: 0,
        };
      }

      const target = normalizeWhatsAppTarget(requireContainerTarget(req.target));
      const authDir = resolveAuthDir(ctx, ctx.connectionId ?? req.target.connection_id);
      ensureAuthDir(authDir);

      const connection = await connectSocket({
        authDir,
        signal: ctx.signal,
        timeoutMs: 20_000,
      });

      try {
        const quotedReplyTo = readReplyToTarget(req.target);
        const quoted = quotedReplyTo
          ? ({
              key: {
                remoteJid: target,
                id: quotedReplyTo,
                fromMe: false,
              },
              message: {
                conversation: "",
              },
            } as unknown)
          : undefined;

        const result = await connection.sock.sendMessage(
          target,
          { text },
          quoted ? { quoted } : undefined,
        );

        const messageID = asString(asRecord(result)?.key && asRecord(asRecord(result)?.key)?.id);
        return {
          success: true,
          message_ids: messageID ? [messageID] : [],
          chunks_sent: 1,
          total_chars: text.length,
        };
      } finally {
        connection.close();
      }
    },
  },
  ingest: {
    monitor: async (ctx, emit) => {
      const authDir = resolveAuthDir(ctx, ctx.connectionId ?? "default");
      ensureAuthDir(authDir);
      const credsPath = path.join(authDir, "creds.json");

      while (!ctx.signal.aborted) {
        let connection: Awaited<ReturnType<typeof connectSocket>> | null = null;
        try {
          connection = await connectSocket({ authDir, signal: ctx.signal, timeoutMs: 20_000 });
          const sock = connection.sock;

          const onMessages = (upsert: unknown) => {
            const record = asRecord(upsert);
            const messages = Array.isArray(record?.messages) ? record.messages : [];
            for (const raw of messages) {
              const parsed = buildEventFromBaileysMessage(
                asRecord(raw) ?? {},
                ctx.connectionId ?? "default",
              );
              if (parsed) {
                emit(parsed);
              }
            }
          };

          const closed = new Promise<void>((resolve) => {
            const onConnectionUpdate = (update: unknown) => {
              const state = asString(asRecord(update)?.connection);
              if (state === "close") {
                sock.ev.off("connection.update", onConnectionUpdate);
                resolve();
              }
            };
            sock.ev.on("connection.update", onConnectionUpdate);
          });

          sock.ev.on("messages.upsert", onMessages);

          await Promise.race([
            closed,
            new Promise<void>((resolve) => {
              ctx.signal.addEventListener("abort", () => resolve(), { once: true });
            }),
          ]);

          sock.ev.off("messages.upsert", onMessages);
        } catch (error) {
          if (ctx.signal.aborted) {
            break;
          }
          const status = extractStatusCode(error);
          if (status === 401 || status === 403) {
            clearAuthSession(authDir);
            ctx.log.info(
              "whatsapp auth session invalid (status=%s); cleared auth state, waiting for relink",
              String(status),
            );
            while (!ctx.signal.aborted) {
              if (fs.existsSync(credsPath)) {
                break;
              }
              await sleepWithSignal(ctx.signal, 5000);
            }
            continue;
          }
          ctx.log.info(
            "whatsapp monitor loop error: %s",
            error instanceof Error ? error.message : String(error),
          );
          await sleepWithSignal(ctx.signal, 1500);
        } finally {
          connection?.close();
        }

        if (!ctx.signal.aborted) {
          await sleepWithSignal(ctx.signal, 1000);
        }
      }
    },
  },
});
