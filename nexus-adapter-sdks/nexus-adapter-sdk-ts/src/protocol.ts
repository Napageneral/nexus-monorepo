import { z } from "zod";

// --- Adapter Identity & Registration ---

export const AdapterOperationSchema = z.enum([
  "adapter.info",
  "adapter.health",
  "adapter.accounts.list",
  "adapter.monitor.start",
  "adapter.control.start",
  "adapter.setup.start",
  "adapter.setup.submit",
  "adapter.setup.status",
  "adapter.setup.cancel",
  "event.backfill",
  "delivery.send",
  "delivery.stream",
  "delivery.react",
  "delivery.edit",
  "delivery.delete",
  "delivery.poll",
]);

export type AdapterOperation = z.infer<typeof AdapterOperationSchema>;

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

export const AdapterAuthFieldOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export const AdapterAuthFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(["secret", "text", "select"]),
  required: z.boolean(),
  placeholder: z.string().optional(),
  options: z.array(AdapterAuthFieldOptionSchema).optional(),
});

export const AdapterAuthMethodOAuthSchema = z.object({
  type: z.literal("oauth2"),
  label: z.string(),
  icon: z.string(),
  service: z.string(),
  scopes: z.array(z.string()),
  platformCredentials: z.boolean().optional(),
  platformCredentialUrl: z.string().optional(),
});

export const AdapterAuthMethodApiKeySchema = z.object({
  type: z.literal("api_key"),
  label: z.string(),
  icon: z.string(),
  service: z.string(),
  fields: z.array(AdapterAuthFieldSchema),
});

export const AdapterAuthMethodFileUploadSchema = z.object({
  type: z.literal("file_upload"),
  label: z.string(),
  icon: z.string(),
  accept: z.array(z.string()),
  templateUrl: z.string().optional(),
  maxSize: z.number().int().positive().optional(),
});

export const AdapterAuthMethodCustomFlowSchema = z.object({
  type: z.literal("custom_flow"),
  label: z.string(),
  icon: z.string(),
  service: z.string(),
  fields: z.array(AdapterAuthFieldSchema).optional(),
});

export const AdapterAuthMethodSchema = z.discriminatedUnion("type", [
  AdapterAuthMethodOAuthSchema,
  AdapterAuthMethodApiKeySchema,
  AdapterAuthMethodFileUploadSchema,
  AdapterAuthMethodCustomFlowSchema,
]);

export const AdapterAuthManifestSchema = z.object({
  methods: z.array(AdapterAuthMethodSchema),
  setupGuide: z.string().optional(),
});

export const AdapterInfoSchema = z.object({
  platform: z.string(),
  name: z.string(),
  version: z.string(),
  operations: z.array(AdapterOperationSchema),
  credential_service: z.string().optional(),
  multi_account: z.boolean(),
  platform_capabilities: ChannelCapabilitiesSchema,
  auth: AdapterAuthManifestSchema.optional(),
});

export type AdapterInfo = z.infer<typeof AdapterInfoSchema>;
export type AdapterAuthField = z.infer<typeof AdapterAuthFieldSchema>;
export type AdapterAuthMethodOAuth = z.infer<typeof AdapterAuthMethodOAuthSchema>;
export type AdapterAuthMethodApiKey = z.infer<typeof AdapterAuthMethodApiKeySchema>;
export type AdapterAuthMethodFileUpload = z.infer<typeof AdapterAuthMethodFileUploadSchema>;
export type AdapterAuthMethodCustomFlow = z.infer<typeof AdapterAuthMethodCustomFlowSchema>;
export type AdapterAuthMethod = z.infer<typeof AdapterAuthMethodSchema>;
export type AdapterAuthManifest = z.infer<typeof AdapterAuthManifestSchema>;

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

// --- Adapter Control Session Protocol ---

export const AdapterControlEndpointSchema = z.object({
  endpoint_id: z.string(),
  display_name: z.string().optional(),
  platform: z.string().optional(),
  caps: z.array(z.string()),
  commands: z.array(z.string()),
  permissions: z.record(z.string(), z.boolean()).optional(),
});

export type AdapterControlEndpoint = z.infer<typeof AdapterControlEndpointSchema>;

export const AdapterControlInvokeErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

export type AdapterControlInvokeError = z.infer<typeof AdapterControlInvokeErrorSchema>;

export const AdapterControlInvokeRequestFrameSchema = z.object({
  type: z.literal("invoke.request"),
  request_id: z.string(),
  endpoint_id: z.string(),
  command: z.string(),
  payload: z.unknown().optional(),
  timeout_ms: z.number().int().nonnegative().optional(),
  idempotency_key: z.string().optional(),
});

export type AdapterControlInvokeRequestFrame = z.infer<
  typeof AdapterControlInvokeRequestFrameSchema
>;

export const AdapterControlInvokeCancelFrameSchema = z.object({
  type: z.literal("invoke.cancel"),
  request_id: z.string(),
});

export type AdapterControlInvokeCancelFrame = z.infer<
  typeof AdapterControlInvokeCancelFrameSchema
>;

export const AdapterControlInputFrameSchema = z.discriminatedUnion("type", [
  AdapterControlInvokeRequestFrameSchema,
  AdapterControlInvokeCancelFrameSchema,
]);

export type AdapterControlInputFrame = z.infer<typeof AdapterControlInputFrameSchema>;

export const AdapterControlEndpointUpsertFrameSchema = z.object({
  type: z.literal("endpoint.upsert"),
  endpoint_id: z.string(),
  display_name: z.string().optional(),
  platform: z.string().optional(),
  caps: z.array(z.string()),
  commands: z.array(z.string()),
  permissions: z.record(z.string(), z.boolean()).optional(),
});

export type AdapterControlEndpointUpsertFrame = z.infer<
  typeof AdapterControlEndpointUpsertFrameSchema
>;

export const AdapterControlEndpointRemoveFrameSchema = z.object({
  type: z.literal("endpoint.remove"),
  endpoint_id: z.string(),
});

export type AdapterControlEndpointRemoveFrame = z.infer<
  typeof AdapterControlEndpointRemoveFrameSchema
>;

export const AdapterControlInvokeResultFrameSchema = z.object({
  type: z.literal("invoke.result"),
  request_id: z.string(),
  ok: z.boolean(),
  payload: z.unknown().optional(),
  error: z.union([z.string(), AdapterControlInvokeErrorSchema]).optional(),
});

export type AdapterControlInvokeResultFrame = z.infer<
  typeof AdapterControlInvokeResultFrameSchema
>;

export const AdapterControlEventIngestFrameSchema = z.object({
  type: z.literal("event.ingest"),
  event: z.record(z.string(), z.unknown()),
});

export type AdapterControlEventIngestFrame = z.infer<typeof AdapterControlEventIngestFrameSchema>;

export const AdapterControlOutputFrameSchema = z.discriminatedUnion("type", [
  AdapterControlEndpointUpsertFrameSchema,
  AdapterControlEndpointRemoveFrameSchema,
  AdapterControlInvokeResultFrameSchema,
  AdapterControlEventIngestFrameSchema,
]);

export type AdapterControlOutputFrame = z.infer<typeof AdapterControlOutputFrameSchema>;

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

export const AdapterSetupStatusSchema = z.enum([
  "pending",
  "requires_input",
  "completed",
  "failed",
  "cancelled",
]);

export const AdapterSetupResultSchema = z
  .object({
    status: AdapterSetupStatusSchema,
    session_id: z.string().optional(),
    account: z.string().optional(),
    service: z.string().optional(),
    message: z.string().optional(),
    instructions: z.string().optional(),
    fields: z.array(AdapterAuthFieldSchema).optional(),
    secret_fields: z.record(z.string(), z.string()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .catchall(z.unknown());

export type AdapterSetupStatus = z.infer<typeof AdapterSetupStatusSchema>;
export type AdapterSetupResult = z.infer<typeof AdapterSetupResultSchema>;
