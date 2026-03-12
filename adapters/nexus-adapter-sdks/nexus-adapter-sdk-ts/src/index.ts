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
  AdapterAccountSchema,
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
  AdapterControlEndpointSchema,
  AdapterControlEndpointRemoveFrameSchema,
  AdapterControlEndpointUpsertFrameSchema,
  AdapterControlInputFrameSchema,
  AdapterControlInvokeCancelFrameSchema,
  AdapterControlInvokeErrorSchema,
  AdapterControlInvokeRequestFrameSchema,
  AdapterControlInvokeResultFrameSchema,
  AdapterControlOutputFrameSchema,
  AdapterControlRecordIngestFrameSchema,
  AdapterInboundPayloadSchema,
  AdapterInboundRecordSchema,
  AdapterInboundRoutingSchema,
  AdapterOperationSchema,
  AdapterSetupResultSchema,
  AdapterSetupStatusSchema,
  AdapterHealthSchema,
  AdapterInfoSchema,
  AdapterStreamStatusSchema,
  AttachmentSchema,
  ChannelCapabilitiesSchema,
  ChannelRefSchema,
  ContainerKindSchema,
  ContentTypeSchema,
  DeliveryErrorTypeSchema,
  DeliveryErrorSchema,
  DeliveryResultSchema,
  DeliveryTargetSchema,
  RecipientSchema,
  SendRequestSchema,
  StreamEventSchema,
} from "./protocol.js";

export type {
  AdapterAccount,
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
  AdapterControlEndpoint,
  AdapterControlEndpointRemoveFrame,
  AdapterControlEndpointUpsertFrame,
  AdapterControlInputFrame,
  AdapterControlInvokeCancelFrame,
  AdapterControlInvokeError,
  AdapterControlInvokeRequestFrame,
  AdapterControlInvokeResultFrame,
  AdapterControlOutputFrame,
  AdapterControlRecordIngestFrame,
  AdapterInboundPayload,
  AdapterInboundRecord,
  AdapterInboundRouting,
  AdapterOperation,
  AdapterSetupResult,
  AdapterSetupStatus,
  AdapterHealth,
  AdapterInfo,
  AdapterStreamStatus,
  Attachment,
  ChannelRef,
  ChannelCapabilities,
  ContainerKind,
  ContentType,
  DeliveryErrorType,
  DeliveryError,
  DeliveryResult,
  DeliveryTarget,
  Recipient,
  SendRequest,
  StreamEvent,
} from "./protocol.js";

export type { StreamHandlers } from "./stream.js";
export { emitStreamStatus, handleStream } from "./stream.js";

export type { PollConfig, PollBackfillConfig, EmitFunc, MonitorHandler, BackfillHandler } from "./monitor.js";
export { pollMonitor, pollBackfill } from "./monitor.js";

export type {
  AdapterControlInvokeReply,
  AdapterControlServeHandlers,
  AdapterControlSessionOptions,
} from "./control.js";
export {
  AdapterControlEndpointRegistry,
  AdapterControlSession,
  createAdapterControlSession,
} from "./control.js";

export { chunkText, sendWithChunking } from "./send.js";

export type { MessageRecordOptions } from "./event.js";
export { newRecord, RecordBuilder, messageRecord } from "./event.js";

export type { AdapterLogger } from "./logger.js";
export { createAdapterLogger, patchConsoleToStderr } from "./logger.js";
