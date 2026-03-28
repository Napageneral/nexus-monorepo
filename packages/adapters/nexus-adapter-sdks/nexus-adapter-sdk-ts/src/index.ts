export type { AdapterRuntimeContext, AdapterRuntimeCredential } from "./runtime-context.js";
export {
  ADAPTER_CONTEXT_ENV_VAR,
  ADAPTER_STATE_DIR_ENV_VAR,
  loadAdapterStateDir,
  loadAdapterRuntimeContext,
  readAdapterRuntimeContextFile,
  requireAdapterStateDir,
  requireAdapterRuntimeContext,
} from "./runtime-context.js";
export type {
  DeclaredAdapterMethod,
  DefineAdapterConfig,
  DefinedAdapterContext,
} from "./define.js";
export { defineAdapter, method } from "./define.js";
export type { CredentialLookupOptions } from "./credentials.js";
export { readCredential, requireCredential } from "./credentials.js";
export { requireContainerTarget, readReplyToTarget, readThreadTarget } from "./targets.js";
export type { RetryOptions } from "./retry.js";
export { parseRetryAfterMs, sleepWithSignal, withRetry } from "./retry.js";

export type {
  AdapterContext,
  AdapterDefinition,
  AdapterMethodInvokeRequest,
  AdapterOperations,
  AdapterSetupRequest,
  RunAdapterOptions,
} from "./run.js";
export { runAdapter } from "./run.js";

// Legacy export name (older prototype of this package).
export { runAdapter as runAdapterCLI } from "./run.js";

export {
  ConnectionAccountContactSchema,
  AdapterConnectionIdentitySchema,
  AdapterAuthFieldSchema,
  AdapterAuthManifestSchema,
  AdapterMethodSchema,
  AdapterMethodCatalogSchema,
  AdapterMethodContextHintValueSchema,
  AdapterMethodContextHintsSchema,
  AdapterMethodOriginSchema,
  AdapterAuthMethodApiKeySchema,
  AdapterAuthMethodCustomFlowSchema,
  AdapterAuthMethodFileUploadSchema,
  AdapterAuthMethodOAuthSchema,
  AdapterAuthMethodSchema,
  AdapterServeEndpointSchema,
  AdapterServeEndpointRemoveFrameSchema,
  AdapterServeEndpointUpsertFrameSchema,
  AdapterServeInputFrameSchema,
  AdapterServeInvokeCancelFrameSchema,
  AdapterServeInvokeErrorSchema,
  AdapterServeInvokeRequestFrameSchema,
  AdapterServeInvokeResultFrameSchema,
  AdapterServeOutputFrameSchema,
  AdapterServeRecordIngestFrameSchema,
  AdapterInboundPayloadSchema,
  AdapterInboundRecordSchema,
  AdapterInboundRoutingSchema,
  AdapterOperationSchema,
  AdapterSetupResultSchema,
  AdapterSetupStatusSchema,
  AdapterHealthSchema,
  AdapterInfoSchema,
  AttachmentSchema,
  ChannelCapabilitiesSchema,
  ChannelRefSchema,
  ContainerKindSchema,
  ContentTypeSchema,
  DeliveryErrorTypeSchema,
  DeliveryErrorSchema,
  RecipientSchema,
} from "./protocol.js";

export type {
  ConnectionAccountContact,
  AdapterConnectionIdentity,
  AdapterAuthField,
  AdapterAuthManifest,
  AdapterMethod,
  AdapterMethodCatalog,
  AdapterMethodContextHintValue,
  AdapterMethodContextHints,
  AdapterMethodOrigin,
  AdapterAuthMethod,
  AdapterAuthMethodApiKey,
  AdapterAuthMethodCustomFlow,
  AdapterAuthMethodFileUpload,
  AdapterAuthMethodOAuth,
  AdapterServeEndpoint,
  AdapterServeEndpointRemoveFrame,
  AdapterServeEndpointUpsertFrame,
  AdapterServeInputFrame,
  AdapterServeInvokeCancelFrame,
  AdapterServeInvokeError,
  AdapterServeInvokeRequestFrame,
  AdapterServeInvokeResultFrame,
  AdapterServeOutputFrame,
  AdapterServeRecordIngestFrame,
  AdapterInboundPayload,
  AdapterInboundRecord,
  AdapterInboundRouting,
  AdapterOperation,
  AdapterSetupResult,
  AdapterSetupStatus,
  AdapterHealth,
  AdapterInfo,
  Attachment,
  ChannelRef,
  ChannelCapabilities,
  ContainerKind,
  ContentType,
  DeliveryErrorType,
  DeliveryError,
  Recipient,
} from "./protocol.js";

export type { PollConfig, PollBackfillConfig, EmitFunc, MonitorHandler, BackfillHandler } from "./monitor.js";
export { pollMonitor, pollBackfill } from "./monitor.js";

export type {
  AdapterServeInvokeReply,
  AdapterServeHandlers,
  AdapterServeSessionOptions,
} from "./serve.js";
export {
  AdapterServeEndpointRegistry,
  AdapterServeSession,
  createAdapterServeSession,
} from "./serve.js";

export { chunkText, sendWithChunking } from "./send.js";

export type { MessageRecordOptions } from "./event.js";
export { newRecord, RecordBuilder, messageRecord } from "./event.js";

export type { AdapterLogger } from "./logger.js";
export { createAdapterLogger, patchConsoleToStderr } from "./logger.js";
