import {
  newEvent,
  type AdapterContext,
  type AdapterDefinition,
  type DeliveryResult,
  type NexusEvent,
} from "@nexus-project/adapter-sdk-ts";

type UnknownRecord = Record<string, unknown>;

type TelegramEnvelope<T> = {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
};

type ExtractedPayload = {
  updateType: string;
  updateID: number;
  message: UnknownRecord;
};

const TELEGRAM_API_BASE_URL = process.env.TELEGRAM_API_BASE_URL?.trim() || "https://api.telegram.org";

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
  return undefined;
}

function asInteger(value: unknown): number | undefined {
  const numberValue = asNumber(value);
  if (numberValue === undefined) {
    return undefined;
  }
  return Math.trunc(numberValue);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function inferContainerKind(chatType: string | undefined): NexusEvent["container_kind"] {
  const normalized = chatType?.toLowerCase();
  if (normalized === "group" || normalized === "supergroup") {
    return "group";
  }
  if (normalized === "channel") {
    return "channel";
  }
  if (normalized === "private") {
    return "direct";
  }
  return "direct";
}

function inferSenderName(from: UnknownRecord | undefined, chat: UnknownRecord | undefined): string | undefined {
  const username = asString(from?.username);
  if (username) {
    return `@${username}`;
  }
  const firstName = asString(from?.first_name);
  const lastName = asString(from?.last_name);
  const fullName = [firstName, lastName].filter((entry): entry is string => Boolean(entry)).join(" ");
  if (fullName) {
    return fullName;
  }
  return asString(chat?.title);
}

function extractAttachmentFromPhoto(photos: unknown[]): NonNullable<NexusEvent["attachments"]>[number] | null {
  if (photos.length === 0) {
    return null;
  }
  const candidates = photos
    .map((photo) => asRecord(photo))
    .filter((photo): photo is UnknownRecord => Boolean(photo));
  if (candidates.length === 0) {
    return null;
  }
  candidates.sort((a, b) => (asInteger(a.file_size) ?? 0) - (asInteger(b.file_size) ?? 0));
  const largest = candidates[candidates.length - 1];
  const fileID = asString(largest?.file_id);
  if (!fileID) {
    return null;
  }
  const uniqueID = asString(largest?.file_unique_id) ?? fileID;
  return {
    id: fileID,
    filename: `${uniqueID}.jpg`,
    content_type: "image/jpeg",
    ...(asInteger(largest?.file_size) ? { size_bytes: asInteger(largest?.file_size) } : {}),
  };
}

function inferContentType(message: UnknownRecord): NexusEvent["content_type"] {
  if (asString(message.text) || asString(message.caption)) {
    return "text";
  }
  if (asArray(message.photo).length > 0) {
    return "image";
  }
  if (asRecord(message.video)) {
    return "video";
  }
  if (asRecord(message.voice) || asRecord(message.audio)) {
    return "audio";
  }
  if (asRecord(message.document)) {
    return "file";
  }
  if (asRecord(message.new_chat_member) || asArray(message.new_chat_members).length > 0) {
    return "membership";
  }
  return "text";
}

function extractContent(message: UnknownRecord): string {
  const text = asString(message.text);
  if (text) {
    return text;
  }
  const caption = asString(message.caption);
  if (caption) {
    return caption;
  }
  if (asArray(message.photo).length > 0) {
    return "[photo]";
  }
  if (asRecord(message.video)) {
    return "[video]";
  }
  if (asRecord(message.voice)) {
    return "[voice]";
  }
  if (asRecord(message.audio)) {
    return "[audio]";
  }
  if (asRecord(message.document)) {
    const doc = asRecord(message.document);
    return `[file] ${asString(doc?.file_name) ?? "document"}`;
  }
  if (asRecord(message.sticker)) {
    const sticker = asRecord(message.sticker);
    return `[sticker] ${asString(sticker?.emoji) ?? ""}`.trim();
  }
  if (asRecord(message.poll)) {
    const poll = asRecord(message.poll);
    return `[poll] ${asString(poll?.question) ?? ""}`.trim();
  }
  return "[unsupported telegram message]";
}

function extractAttachments(message: UnknownRecord): NonNullable<NexusEvent["attachments"]> {
  const attachments: NonNullable<NexusEvent["attachments"]> = [];
  const photoAttachment = extractAttachmentFromPhoto(asArray(message.photo));
  if (photoAttachment) {
    attachments.push(photoAttachment);
  }

  const document = asRecord(message.document);
  if (document) {
    const fileID = asString(document.file_id);
    if (fileID) {
      attachments.push({
        id: fileID,
        filename: asString(document.file_name) ?? `${fileID}.bin`,
        content_type: asString(document.mime_type) ?? "application/octet-stream",
        ...(asInteger(document.file_size) ? { size_bytes: asInteger(document.file_size) } : {}),
      });
    }
  }

  const video = asRecord(message.video);
  if (video) {
    const fileID = asString(video.file_id);
    if (fileID) {
      attachments.push({
        id: fileID,
        filename: `${asString(video.file_unique_id) ?? fileID}.mp4`,
        content_type: asString(video.mime_type) ?? "video/mp4",
        ...(asInteger(video.file_size) ? { size_bytes: asInteger(video.file_size) } : {}),
      });
    }
  }

  const audio = asRecord(message.audio) ?? asRecord(message.voice);
  if (audio) {
    const fileID = asString(audio.file_id);
    if (fileID) {
      attachments.push({
        id: fileID,
        filename: `${asString(audio.file_unique_id) ?? fileID}.ogg`,
        content_type: asString(audio.mime_type) ?? "audio/ogg",
        ...(asInteger(audio.file_size) ? { size_bytes: asInteger(audio.file_size) } : {}),
      });
    }
  }

  return attachments;
}

function extractMessagePayload(update: UnknownRecord): ExtractedPayload | null {
  const updateID = asInteger(update.update_id);
  if (updateID === undefined) {
    return null;
  }

  const candidates = [
    "message",
    "edited_message",
    "channel_post",
    "edited_channel_post",
  ] as const;

  for (const key of candidates) {
    const message = asRecord(update[key]);
    if (!message) {
      continue;
    }
    return {
      updateType: key,
      updateID,
      message,
    };
  }

  return null;
}

export function buildEventFromUpdate(update: UnknownRecord, accountID: string): NexusEvent | null {
  const payload = extractMessagePayload(update);
  if (!payload) {
    return null;
  }

  const message = payload.message;
  const chat = asRecord(message.chat);
  const chatIDRaw = chat?.id;
  const chatID =
    typeof chatIDRaw === "number" || typeof chatIDRaw === "bigint"
      ? String(chatIDRaw)
      : asString(chatIDRaw) ?? "unknown";

  const from = asRecord(message.from);
  const senderIDRaw = from?.id;
  const senderID =
    typeof senderIDRaw === "number" || typeof senderIDRaw === "bigint"
      ? String(senderIDRaw)
      : asString(senderIDRaw) ?? chatID;

  const senderName = inferSenderName(from, chat);
  const containerKind = inferContainerKind(asString(chat?.type));
  const containerName = asString(chat?.title);
  const messageID = asInteger(message.message_id);
  const replyToID = asInteger(asRecord(message.reply_to_message)?.message_id);
  const threadID = asInteger(message.message_thread_id);
  const timestampSeconds = asInteger(message.date);
  const timestampMs = timestampSeconds ? timestampSeconds * 1000 : Date.now();

  const builder = newEvent(
    "telegram",
    `telegram:update:${payload.updateID}:${messageID ?? "unknown"}`,
  )
    .withTimestampUnixMs(timestampMs)
    .withAccount(accountID)
    .withSender(senderID, senderName)
    .withContainer(chatID, containerKind)
    .withContent(extractContent(message))
    .withContentType(inferContentType(message))
    .withMetadata("telegram_update_id", payload.updateID)
    .withMetadata("telegram_update_type", payload.updateType)
    .withMetadata("telegram_chat_type", asString(chat?.type) ?? "unknown")
    .withMetadata("telegram_message_id", messageID ?? null);

  if (threadID !== undefined) {
    builder.withThread(String(threadID));
  }
  if (replyToID !== undefined) {
    builder.withReplyTo(String(replyToID));
  }

  const attachments = extractAttachments(message);
  for (const attachment of attachments) {
    builder.withAttachment(attachment);
  }

  const event = builder.build();
  if (containerName) {
    event.container_name = containerName;
  }
  return event;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveTelegramToken(ctx: AdapterContext): string {
  const runtimeToken = ctx.runtime?.credential?.value?.trim();
  if (runtimeToken) {
    return runtimeToken;
  }
  const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }
  throw new Error("missing telegram bot token (runtime credential or TELEGRAM_BOT_TOKEN)");
}

export function parseTelegramTarget(raw: string): string {
  let target = raw.trim();
  if (!target) {
    throw new Error("target is required");
  }
  target = target.replace(/^telegram:/i, "").trim();
  target = target.replace(/^chat:/i, "").trim();
  if (!target) {
    throw new Error("invalid telegram target");
  }
  return target;
}

function parseOptionalMessageID(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function telegramRequest<T>(params: {
  token: string;
  method: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<T> {
  const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${params.token}/${params.method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(params.body),
    signal: params.signal,
  });

  const payload = (await response.json()) as TelegramEnvelope<T>;
  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new Error(
      `telegram api ${params.method} failed: ${payload.description ?? `http ${response.status}`}`,
    );
  }
  return payload.result;
}

async function sendTelegramText(params: {
  ctx: AdapterContext;
  account: string;
  to: string;
  text: string;
  threadID?: string;
  replyToID?: string;
}): Promise<DeliveryResult> {
  const token = resolveTelegramToken(params.ctx);
  const chatID = parseTelegramTarget(params.to);
  const messageThreadID = parseOptionalMessageID(params.threadID);
  const replyToMessageID = parseOptionalMessageID(params.replyToID);

  const result = await telegramRequest<{ message_id?: number }>({
    token,
    method: "sendMessage",
    body: {
      chat_id: chatID,
      text: params.text,
      ...(messageThreadID !== undefined ? { message_thread_id: messageThreadID } : {}),
      ...(replyToMessageID !== undefined ? { reply_to_message_id: replyToMessageID } : {}),
    },
    signal: params.ctx.signal,
  });

  const messageID = result.message_id !== undefined ? String(result.message_id) : "";
  return {
    success: true,
    message_ids: messageID ? [messageID] : [],
    chunks_sent: 1,
    total_chars: params.text.length,
  };
}

const TELEGRAM_CHANNEL_CAPABILITIES = {
  text_limit: 4096,
  caption_limit: 1024,
  supports_markdown: false,
  markdown_flavor: "telegram_html",
  supports_tables: false,
  supports_code_blocks: true,
  supports_embeds: false,
  supports_threads: true,
  supports_reactions: true,
  supports_polls: true,
  supports_buttons: true,
  supports_edit: true,
  supports_delete: true,
  supports_media: true,
  supports_voice_notes: true,
  supports_streaming_edit: false,
} as const;

export const telegramAdapter: AdapterDefinition = {
  info: async () => ({
    channel: "telegram",
    name: "nexus-adapter-telegram",
    version: "0.1.0",
    supports: ["monitor", "send", "health", "accounts"],
    credential_service: "telegram",
    multi_account: true,
    channel_capabilities: TELEGRAM_CHANNEL_CAPABILITIES,
  }),

  accounts: async (ctx) => {
    const accountID = ctx.runtime?.account_id || "default";
    return [
      {
        id: accountID,
        status: "ready" as const,
        ...(ctx.runtime?.credential?.ref ? { credential_ref: ctx.runtime.credential.ref } : {}),
      },
    ];
  },

  health: async (ctx, args) => {
    const token = resolveTelegramToken(ctx);
    const me = await telegramRequest<UnknownRecord>({
      token,
      method: "getMe",
      body: {},
      signal: ctx.signal,
    });
    return {
      connected: true,
      account: args.account,
      last_event_at: Date.now(),
      details: {
        id: asInteger(me.id),
        username: asString(me.username),
      },
    };
  },

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

    return await sendTelegramText({
      ctx,
      account: req.account,
      to: req.to,
      text,
      threadID: req.thread_id,
      replyToID: req.reply_to_id,
    });
  },

  monitor: async (ctx, args, emit) => {
    const token = resolveTelegramToken(ctx);
    let offset = 0;

    while (!ctx.signal.aborted) {
      try {
        const updates = await telegramRequest<unknown[]>({
          token,
          method: "getUpdates",
          body: {
            timeout: 25,
            ...(offset > 0 ? { offset } : {}),
            allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post"],
          },
          signal: ctx.signal,
        });

        if (updates.length === 0) {
          continue;
        }

        for (const rawUpdate of updates) {
          if (ctx.signal.aborted) {
            break;
          }
          const update = asRecord(rawUpdate);
          if (!update) {
            continue;
          }
          const updateID = asInteger(update.update_id);
          if (updateID !== undefined) {
            offset = Math.max(offset, updateID + 1);
          }
          const event = buildEventFromUpdate(update, args.account);
          if (event) {
            emit(event);
          }
        }
      } catch (error) {
        if (ctx.signal.aborted) {
          break;
        }
        ctx.log.info(
          "telegram monitor loop error: %s",
          error instanceof Error ? error.message : String(error),
        );
        await sleep(1500);
      }
    }
  },
};
