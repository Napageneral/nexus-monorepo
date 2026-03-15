import { z } from "zod";

export const AdapterOperationSchema = z.enum([
  "adapter.info",
  "adapter.health",
  "adapter.accounts.list",
  "adapter.monitor.start",
  "adapter.serve.start",
  "adapter.setup.start",
  "adapter.setup.submit",
  "adapter.setup.status",
  "adapter.setup.cancel",
  "records.backfill",
  "channels.send",
  "channels.stream",
  "channels.react",
  "channels.edit",
  "channels.delete",
]);

export type AdapterOperation = z.infer<typeof AdapterOperationSchema>;

export const ChannelCapabilitiesSchema = z
  .object({
    text_limit: z.number().int().nonnegative().optional(),
    caption_limit: z.number().int().nonnegative().optional(),
    supports_markdown: z.boolean().optional(),
    markdown_flavor: z.string().optional(),
    supports_tables: z.boolean().optional(),
    supports_code_blocks: z.boolean().optional(),
    supports_embeds: z.boolean().optional(),
    supports_threads: z.boolean().optional(),
    supports_reactions: z.boolean().optional(),
    supports_polls: z.boolean().optional(),
    supports_buttons: z.boolean().optional(),
    supports_edit: z.boolean().optional(),
    supports_delete: z.boolean().optional(),
    supports_media: z.boolean().optional(),
    supports_voice_notes: z.boolean().optional(),
    supports_streaming_edit: z.boolean().optional(),
    supports_ptt: z.boolean().optional(),
    supports_streaming: z.boolean().optional(),
    max_message_length: z.number().int().positive().optional(),
    max_attachments: z.number().int().positive().optional(),
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
  id: z.string(),
  type: z.literal("oauth2"),
  label: z.string(),
  icon: z.string(),
  service: z.string(),
  scopes: z.array(z.string()),
  platformCredentials: z.boolean().optional(),
  platformCredentialUrl: z.string().optional(),
});

export const AdapterAuthMethodApiKeySchema = z.object({
  id: z.string(),
  type: z.literal("api_key"),
  label: z.string(),
  icon: z.string(),
  service: z.string(),
  fields: z.array(AdapterAuthFieldSchema),
});

export const AdapterAuthMethodFileUploadSchema = z.object({
  id: z.string(),
  type: z.literal("file_upload"),
  label: z.string(),
  icon: z.string(),
  accept: z.array(z.string()),
  templateUrl: z.string().optional(),
  maxSize: z.number().int().positive().optional(),
});

export const AdapterAuthMethodCustomFlowSchema = z.object({
  id: z.string(),
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

export const AdapterMethodContextHintValueSchema = z.object({
  value: z.unknown(),
  source: z.string(),
  confidence: z.enum(["exact", "derived", "weak"]),
});

export const AdapterMethodContextHintsSchema = z.object({
  params: z.record(z.string(), AdapterMethodContextHintValueSchema),
});

export const AdapterMethodOriginSchema = z.object({
  kind: z.enum(["core", "app", "adapter"]),
  package_id: z.string().nullable(),
  package_version: z.string().nullable(),
  declaration_mode: z.enum(["manifest", "openapi", "builtin"]),
  declaration_source: z.string(),
  namespace: z.string(),
});

export const AdapterMethodSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  action: z.enum(["read", "write"]).optional(),
  params: z.record(z.string(), z.unknown()).nullable().optional(),
  response: z.record(z.string(), z.unknown()).nullable().optional(),
  connection_required: z.boolean().optional(),
  mutates_remote: z.boolean().optional(),
  context_hints: AdapterMethodContextHintsSchema.optional(),
  origin: AdapterMethodOriginSchema.optional(),
});

export const AdapterMethodCatalogSchema = z.object({
  source: z.enum(["manifest", "openapi"]).optional(),
  document: z.string().optional(),
  namespace: z.string().optional(),
});

export const AdapterInfoSchema = z.object({
  platform: z.string(),
  name: z.string(),
  version: z.string(),
  operations: z.array(AdapterOperationSchema),
  methods: z.array(AdapterMethodSchema),
  credential_service: z.string().optional(),
  multi_account: z.boolean(),
  platform_capabilities: ChannelCapabilitiesSchema,
  auth: AdapterAuthManifestSchema.optional(),
  methodCatalog: AdapterMethodCatalogSchema.optional(),
});

export type AdapterInfo = z.infer<typeof AdapterInfoSchema>;
export type AdapterMethod = z.infer<typeof AdapterMethodSchema>;
export type AdapterMethodCatalog = z.infer<typeof AdapterMethodCatalogSchema>;
export type AdapterMethodContextHintValue = z.infer<typeof AdapterMethodContextHintValueSchema>;
export type AdapterMethodContextHints = z.infer<typeof AdapterMethodContextHintsSchema>;
export type AdapterMethodOrigin = z.infer<typeof AdapterMethodOriginSchema>;
export type AdapterAuthField = z.infer<typeof AdapterAuthFieldSchema>;
export type AdapterAuthMethodOAuth = z.infer<typeof AdapterAuthMethodOAuthSchema>;
export type AdapterAuthMethodApiKey = z.infer<typeof AdapterAuthMethodApiKeySchema>;
export type AdapterAuthMethodFileUpload = z.infer<typeof AdapterAuthMethodFileUploadSchema>;
export type AdapterAuthMethodCustomFlow = z.infer<typeof AdapterAuthMethodCustomFlowSchema>;
export type AdapterAuthMethod = z.infer<typeof AdapterAuthMethodSchema>;
export type AdapterAuthManifest = z.infer<typeof AdapterAuthManifestSchema>;

export const AttachmentSchema = z.object({
  id: z.string(),
  filename: z.string().optional(),
  mime_type: z.string(),
  media_type: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  url: z.string().optional(),
  local_path: z.string().optional(),
  content_hash: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type Attachment = z.infer<typeof AttachmentSchema>;

export const RecipientSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  avatar_url: z.string().optional(),
});

export type Recipient = z.infer<typeof RecipientSchema>;

export const ContentTypeSchema = z.enum(["text", "reaction", "membership"]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const ContainerKindSchema = z.enum(["direct", "group"]);
export type ContainerKind = z.infer<typeof ContainerKindSchema>;

export const AdapterInboundRoutingSchema = z.object({
  adapter: z.string().optional(),
  platform: z.string(),
  connection_id: z.string(),
  sender_id: z.string(),
  sender_name: z.string().optional(),
  receiver_id: z.string().optional(),
  receiver_name: z.string().optional(),
  space_id: z.string().optional(),
  space_name: z.string().optional(),
  container_kind: ContainerKindSchema,
  container_id: z.string(),
  container_name: z.string().optional(),
  thread_id: z.string().optional(),
  thread_name: z.string().optional(),
  reply_to_id: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AdapterInboundRouting = z.infer<typeof AdapterInboundRoutingSchema>;

export const AdapterInboundPayloadSchema = z.object({
  external_record_id: z.string(),
  timestamp: z.number().int(),
  content: z.string(),
  content_type: ContentTypeSchema,
  reply_to_id: z.string().optional(),
  attachments: z.array(AttachmentSchema).optional(),
  recipients: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AdapterInboundPayload = z.infer<typeof AdapterInboundPayloadSchema>;

export const AdapterInboundRecordSchema = z.object({
  operation: z.literal("record.ingest"),
  routing: AdapterInboundRoutingSchema,
  payload: AdapterInboundPayloadSchema,
});

export type AdapterInboundRecord = z.infer<typeof AdapterInboundRecordSchema>;

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
  type: DeliveryErrorTypeSchema.optional(),
  message: z.string(),
  retry: z.boolean().optional(),
  retry_after_ms: z.number().int().nonnegative().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type DeliveryError = z.infer<typeof DeliveryErrorSchema>;

export const DeliveryResultSchema = z.object({
  success: z.boolean(),
  message_ids: z.array(z.string()),
  chunks_sent: z.number().int().nonnegative(),
  total_chars: z.number().int().nonnegative().optional(),
  error: z.union([z.string(), DeliveryErrorSchema]).optional(),
});

export type DeliveryResult = z.infer<typeof DeliveryResultSchema>;

export const ChannelRefSchema = z.object({
  platform: z.string(),
  space_id: z.string().optional(),
  container_kind: ContainerKindSchema.optional(),
  container_id: z.string().optional(),
  thread_id: z.string().optional(),
});

export type ChannelRef = z.infer<typeof ChannelRefSchema>;

export const DeliveryTargetSchema = z.object({
  connection_id: z.string(),
  channel: ChannelRefSchema,
  reply_to_id: z.string().optional(),
});

export type DeliveryTarget = z.infer<typeof DeliveryTargetSchema>;

export const SendRequestSchema = z.object({
  target: DeliveryTargetSchema,
  text: z.string().optional(),
  media: z.string().optional(),
  caption: z.string().optional(),
});

export type SendRequest = z.infer<typeof SendRequestSchema>;

export const AdapterHealthSchema = z.object({
  connected: z.boolean(),
  connection_id: z.string(),
  last_event_at: z.number().int().optional(),
  error: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type AdapterHealth = z.infer<typeof AdapterHealthSchema>;

export const AdapterAccountSchema = z.object({
  id: z.string(),
  display_name: z.string().optional(),
  credential_ref: z.string().optional(),
  status: z.enum(["ready", "active", "error"]),
});

export type AdapterAccount = z.infer<typeof AdapterAccountSchema>;

export const AdapterServeEndpointSchema = z.object({
  endpoint_id: z.string(),
  display_name: z.string().optional(),
  platform: z.string().optional(),
  caps: z.array(z.string()),
  commands: z.array(z.string()),
  permissions: z.record(z.string(), z.boolean()).optional(),
});

export type AdapterServeEndpoint = z.infer<typeof AdapterServeEndpointSchema>;

export const AdapterServeInvokeErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

export type AdapterServeInvokeError = z.infer<typeof AdapterServeInvokeErrorSchema>;

export const AdapterServeInvokeRequestFrameSchema = z.object({
  type: z.literal("invoke.request"),
  request_id: z.string(),
  endpoint_id: z.string(),
  command: z.string(),
  payload: z.unknown().optional(),
  timeout_ms: z.number().int().nonnegative().optional(),
  idempotency_key: z.string().optional(),
});

export type AdapterServeInvokeRequestFrame = z.infer<
  typeof AdapterServeInvokeRequestFrameSchema
>;

export const AdapterServeInvokeCancelFrameSchema = z.object({
  type: z.literal("invoke.cancel"),
  request_id: z.string(),
});

export type AdapterServeInvokeCancelFrame = z.infer<
  typeof AdapterServeInvokeCancelFrameSchema
>;

export const AdapterServeInputFrameSchema = z.discriminatedUnion("type", [
  AdapterServeInvokeRequestFrameSchema,
  AdapterServeInvokeCancelFrameSchema,
]);

export type AdapterServeInputFrame = z.infer<typeof AdapterServeInputFrameSchema>;

export const AdapterServeEndpointUpsertFrameSchema = z.object({
  type: z.literal("endpoint.upsert"),
  endpoint_id: z.string(),
  display_name: z.string().optional(),
  platform: z.string().optional(),
  caps: z.array(z.string()),
  commands: z.array(z.string()),
  permissions: z.record(z.string(), z.boolean()).optional(),
});

export type AdapterServeEndpointUpsertFrame = z.infer<
  typeof AdapterServeEndpointUpsertFrameSchema
>;

export const AdapterServeEndpointRemoveFrameSchema = z.object({
  type: z.literal("endpoint.remove"),
  endpoint_id: z.string(),
});

export type AdapterServeEndpointRemoveFrame = z.infer<
  typeof AdapterServeEndpointRemoveFrameSchema
>;

export const AdapterServeInvokeResultFrameSchema = z.object({
  type: z.literal("invoke.result"),
  request_id: z.string(),
  ok: z.boolean(),
  payload: z.unknown().optional(),
  error: z.union([z.string(), AdapterServeInvokeErrorSchema]).optional(),
});

export type AdapterServeInvokeResultFrame = z.infer<
  typeof AdapterServeInvokeResultFrameSchema
>;

export const AdapterServeRecordIngestFrameSchema = z.object({
  type: z.literal("record.ingest"),
  record: z.record(z.string(), z.unknown()),
});

export type AdapterServeRecordIngestFrame = z.infer<
  typeof AdapterServeRecordIngestFrameSchema
>;

export const AdapterServeOutputFrameSchema = z.discriminatedUnion("type", [
  AdapterServeEndpointUpsertFrameSchema,
  AdapterServeEndpointRemoveFrameSchema,
  AdapterServeInvokeResultFrameSchema,
  AdapterServeRecordIngestFrameSchema,
]);

export type AdapterServeOutputFrame = z.infer<typeof AdapterServeOutputFrameSchema>;

export const StreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stream_start"),
    runId: z.string(),
    session_id: z.string().optional(),
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
    partial: z.boolean().optional(),
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
  z.object({ type: z.literal("error"), error: z.string() }),
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
    connection_id: z.string().optional(),
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
