import { z } from "zod";

// --- Adapter Identity & Registration ---

export const AdapterCapabilitySchema = z.enum([
  "monitor",
  "send",
  "stream",
  "backfill",
  "health",
  "accounts",
  "react",
  "edit",
  "delete",
  "poll",
]);

export type AdapterCapability = z.infer<typeof AdapterCapabilitySchema>;

// ChannelCapabilities is for agent context + adapter self-description via `info`.
// Keep this aligned with `nexus-adapter-sdk-go/types.go` JSON tags.
export const ChannelCapabilitiesSchema = z
  .object({
    text_limit: z.number().int().nonnegative(),
    caption_limit: z.number().int().nonnegative().optional(),

    supports_markdown: z.boolean(),
    markdown_flavor: z.string().optional(),
    supports_tables: z.boolean(),
    supports_code_blocks: z.boolean(),

    supports_embeds: z.boolean(),
    supports_threads: z.boolean(),
    supports_reactions: z.boolean(),
    supports_polls: z.boolean(),
    supports_buttons: z.boolean(),
    supports_edit: z.boolean(),
    supports_delete: z.boolean(),
    supports_media: z.boolean(),
    supports_voice_notes: z.boolean(),

    supports_streaming_edit: z.boolean(),
  })
  .catchall(z.unknown());

export type ChannelCapabilities = z.infer<typeof ChannelCapabilitiesSchema>;

export const AdapterInfoSchema = z.object({
  channel: z.string(),
  name: z.string(),
  version: z.string(),
  supports: z.array(AdapterCapabilitySchema),
  credential_service: z.string().optional(),
  multi_account: z.boolean(),
  channel_capabilities: ChannelCapabilitiesSchema,
});

export type AdapterInfo = z.infer<typeof AdapterInfoSchema>;

// --- NexusEvent (Inbound) ---

export const AttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  content_type: z.string(),
  size_bytes: z.number().int().nonnegative().optional(),
  url: z.string().optional(),
  path: z.string().optional(),
});

export type Attachment = z.infer<typeof AttachmentSchema>;

export const ContainerKindSchema = z.enum(["dm", "direct", "group", "channel"]);
export type ContainerKind = z.infer<typeof ContainerKindSchema>;
// Deprecated alias retained for transition.
export const PeerKindSchema = ContainerKindSchema;
export type PeerKind = ContainerKind;

export const ContentTypeSchema = z.enum([
  "text",
  "image",
  "audio",
  "video",
  "file",
  "reaction",
  "membership",
]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

// NexusEvent is the normalized event format that all adapters emit.
// One JSON object per line on stdout (JSONL).
export const NexusEventSchema = z.object({
  // Identity
  event_id: z.string(), // "{platform}:{source_id}"
  timestamp: z.number().int(), // Unix ms

  // Content
  content: z.string(),
  content_type: ContentTypeSchema,
  attachments: z.array(AttachmentSchema).optional(),

  // Routing context
  platform: z.string(),
  account_id: z.string(),
  sender_id: z.string(),
  sender_name: z.string().optional(),
  space_id: z.string().optional(),
  space_name: z.string().optional(),
  container_id: z.string(),
  container_kind: ContainerKindSchema,
  container_name: z.string().optional(),
  thread_id: z.string().optional(),
  thread_name: z.string().optional(),
  reply_to_id: z.string().optional(),

  // Platform metadata
  metadata: z.record(z.string(), z.unknown()).optional(),
  delivery_metadata: z.record(z.string(), z.unknown()).optional(),
});

export type NexusEvent = z.infer<typeof NexusEventSchema>;

// --- Outbound Delivery ---

export const DeliveryErrorTypeSchema = z.enum([
  "rate_limited",
  "permission_denied",
  "not_found",
  "content_rejected",
  "network",
  "unknown",
]);

export type DeliveryErrorType = z.infer<typeof DeliveryErrorTypeSchema>;

export const DeliveryErrorSchema = z.object({
  type: DeliveryErrorTypeSchema,
  message: z.string(),
  retry: z.boolean(),
  retry_after_ms: z.number().int().nonnegative().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type DeliveryError = z.infer<typeof DeliveryErrorSchema>;

export const DeliveryResultSchema = z.object({
  success: z.boolean(),
  message_ids: z.array(z.string()),
  chunks_sent: z.number().int().nonnegative(),
  total_chars: z.number().int().nonnegative().optional(),
  error: DeliveryErrorSchema.optional(),
});

export type DeliveryResult = z.infer<typeof DeliveryResultSchema>;

export const SendRequestSchema = z.object({
  account: z.string(),
  to: z.string(),
  text: z.string().optional(),
  media: z.string().optional(),
  caption: z.string().optional(),
  reply_to_id: z.string().optional(),
  thread_id: z.string().optional(),
});

export type SendRequest = z.infer<typeof SendRequestSchema>;

// --- Health ---

export const AdapterHealthSchema = z.object({
  connected: z.boolean(),
  account: z.string(),
  last_event_at: z.number().int().optional(),
  error: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type AdapterHealth = z.infer<typeof AdapterHealthSchema>;

// --- Accounts ---

export const AdapterAccountSchema = z.object({
  id: z.string(),
  display_name: z.string().optional(),
  credential_ref: z.string().optional(),
  status: z.enum(["ready", "active", "error"]),
});

export type AdapterAccount = z.infer<typeof AdapterAccountSchema>;

// --- Streaming Protocol ---

export const DeliveryTargetSchema = z.object({
  platform: z.string(),
  account_id: z.string(),
  to: z.string(),
  thread_id: z.string().optional(),
  reply_to_id: z.string().optional(),
});

export type DeliveryTarget = z.infer<typeof DeliveryTargetSchema>;

export const StreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stream_start"),
    runId: z.string(),
    sessionLabel: z.string(),
    target: DeliveryTargetSchema,
  }),
  z.object({ type: z.literal("token"), text: z.string() }),
  z.object({
    type: z.literal("tool_status"),
    toolName: z.string(),
    toolCallId: z.string(),
    status: z.enum(["started", "completed", "failed"]),
    summary: z.string().optional(),
  }),
  z.object({ type: z.literal("reasoning"), text: z.string() }),
  z.object({
    type: z.literal("stream_end"),
    runId: z.string(),
    final: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("stream_error"),
    error: z.string(),
    partial: z.boolean(),
  }),
]);

export type StreamEvent = z.infer<typeof StreamEventSchema>;

export const AdapterStreamStatusSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message_created"), messageId: z.string() }),
  z.object({
    type: z.literal("message_updated"),
    messageId: z.string(),
    chars: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal("message_sent"), messageId: z.string(), final: z.boolean() }),
  z.object({ type: z.literal("delivery_complete"), messageIds: z.array(z.string()) }),
  z.object({ type: z.literal("delivery_error"), error: z.string() }),
]);

export type AdapterStreamStatus = z.infer<typeof AdapterStreamStatusSchema>;
