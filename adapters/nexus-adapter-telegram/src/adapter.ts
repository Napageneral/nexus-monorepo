import {
  defineAdapter,
  messageRecord,
  pollMonitor,
  readReplyToTarget,
  readThreadTarget,
  requireContainerTarget,
  requireCredential,
  type AdapterInboundRecord,
  type Attachment,
  type ContainerKind,
  type DeliveryResult,
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

function inferContainerKind(chatType: string | undefined): ContainerKind {
  const normalized = chatType?.toLowerCase();
  if (normalized === "group" || normalized === "supergroup") {
    return "group";
  }
  if (normalized === "channel") {
    return "group";
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

function extractAttachmentFromPhoto(photos: unknown[]): Attachment | null {
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
    mime_type: "image/jpeg",
    ...(asInteger(largest?.file_size) ? { size: asInteger(largest?.file_size) } : {}),
  };
}

function inferContentType(message: UnknownRecord): "text" | "reaction" | "membership" {
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

function extractAttachments(message: UnknownRecord): Attachment[] {
  const attachments: Attachment[] = [];
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
        mime_type: asString(document.mime_type) ?? "application/octet-stream",
        ...(asInteger(document.file_size) ? { size: asInteger(document.file_size) } : {}),
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
        mime_type: asString(video.mime_type) ?? "video/mp4",
        ...(asInteger(video.file_size) ? { size: asInteger(video.file_size) } : {}),
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
        mime_type: asString(audio.mime_type) ?? "audio/ogg",
        ...(asInteger(audio.file_size) ? { size: asInteger(audio.file_size) } : {}),
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

export function buildEventFromUpdate(update: UnknownRecord, connectionID: string): AdapterInboundRecord | null {
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

  return messageRecord({
    platform: "telegram",
    connectionId: connectionID,
    externalRecordId: `telegram:update:${payload.updateID}:${messageID ?? "unknown"}`,
    timestamp: timestampMs,
    senderId: senderID,
    senderName,
    containerId: chatID,
    containerKind,
    containerName,
    ...(threadID !== undefined ? { threadId: String(threadID) } : {}),
    ...(replyToID !== undefined ? { replyToId: String(replyToID) } : {}),
    content: extractContent(message),
    contentType: inferContentType(message),
    attachments: extractAttachments(message),
    metadata: {
      telegram_update_id: payload.updateID,
      telegram_update_type: payload.updateType,
      telegram_chat_type: asString(chat?.type) ?? "unknown",
      telegram_message_id: messageID ?? null,
    },
  });
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
  token: string;
  to: string;
  text: string;
  threadID?: string;
  replyToID?: string;
  signal?: AbortSignal;
}): Promise<DeliveryResult> {
  const chatID = parseTelegramTarget(params.to);
  const messageThreadID = parseOptionalMessageID(params.threadID);
  const replyToMessageID = parseOptionalMessageID(params.replyToID);

  const result = await telegramRequest<{ message_id?: number }>({
    token: params.token,
    method: "sendMessage",
    body: {
      chat_id: chatID,
      text: params.text,
      ...(messageThreadID !== undefined ? { message_thread_id: messageThreadID } : {}),
      ...(replyToMessageID !== undefined ? { reply_to_message_id: replyToMessageID } : {}),
    },
    signal: params.signal,
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

export const telegramAdapter = defineAdapter<{ token: string }>({
  platform: "telegram",
  name: "nexus-adapter-telegram",
  version: "0.1.0",
  multi_account: true,
  credential_service: "telegram",
  auth: {
    methods: [
      {
        id: "telegram_bot_token",
        type: "api_key",
        label: "Enter Bot Token",
        icon: "key",
        service: "telegram",
        fields: [
          {
            name: "bot_token",
            label: "Bot Token",
            type: "secret",
            required: true,
            placeholder: "123456789:AA...",
          },
        ],
      },
    ],
    setupGuide:
      "Create a bot with BotFather, copy the bot token, and connect this adapter with that token.",
  },
  capabilities: TELEGRAM_CHANNEL_CAPABILITIES,
  client: {
    create: ({ ctx }) => ({
      token: requireCredential(ctx, {
        label: "telegram bot token",
        fields: ["bot_token", "token"],
        env: ["TELEGRAM_BOT_TOKEN"],
      }),
    }),
  },
  connection: {
    health: async (ctx) => {
      const me = await telegramRequest<UnknownRecord>({
        token: ctx.client?.token ?? "",
        method: "getMe",
        body: {},
        signal: ctx.signal,
      });
      return {
        connected: true,
        last_event_at: Date.now(),
        details: {
          id: asInteger(me.id),
          username: asString(me.username),
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

      return await sendTelegramText({
        token: ctx.client!.token,
        to: requireContainerTarget(req.target),
        text,
        threadID: readThreadTarget(req.target),
        replyToID: readReplyToTarget(req.target),
        signal: ctx.signal,
      });
    },
  },
  ingest: {
    monitor: pollMonitor<{ token: string }, number, unknown[], UnknownRecord>({
      initialCursor: () => 0,
      poll: async ({ ctx, cursor }) => {
        return await telegramRequest<unknown[]>({
          token: ctx.client!.token,
          method: "getUpdates",
          body: {
            timeout: 25,
            ...(cursor && cursor > 0 ? { offset: cursor } : {}),
            allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post"],
          },
          signal: ctx.signal,
        });
      },
      items: (page) =>
        page
          .map((entry) => asRecord(entry))
          .filter((entry): entry is UnknownRecord => Boolean(entry)),
      toRecord: ({ item, connectionId }) => buildEventFromUpdate(item, connectionId),
      nextCursor: ({ item, cursor }) => {
        const updateID = asInteger(item.update_id);
        if (updateID === undefined) {
          return cursor;
        }
        return Math.max(cursor ?? 0, updateID + 1);
      },
      idleMs: 0,
      errorDelayMs: 1500,
    }),
  },
});
