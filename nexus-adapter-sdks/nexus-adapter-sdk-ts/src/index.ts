export type { AdapterRuntimeContext, AdapterRuntimeCredential } from "./runtime-context.js";
export {
  ADAPTER_CONTEXT_ENV_VAR,
  loadAdapterRuntimeContext,
  readAdapterRuntimeContextFile,
  requireAdapterRuntimeContext,
} from "./runtime-context.js";

export type {
  AdapterContext,
  AdapterDefinition,
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
  AdapterAuthMethodApiKeySchema,
  AdapterAuthMethodCustomFlowSchema,
  AdapterAuthMethodFileUploadSchema,
  AdapterAuthMethodOAuthSchema,
  AdapterAuthMethodSchema,
  AdapterControlEndpointSchema,
  AdapterControlEndpointRemoveFrameSchema,
  AdapterControlEndpointUpsertFrameSchema,
  AdapterControlEventIngestFrameSchema,
  AdapterControlInputFrameSchema,
  AdapterControlInvokeCancelFrameSchema,
  AdapterControlInvokeErrorSchema,
  AdapterControlInvokeRequestFrameSchema,
  AdapterControlInvokeResultFrameSchema,
  AdapterControlOutputFrameSchema,
  AdapterOperationSchema,
  AdapterSetupResultSchema,
  AdapterSetupStatusSchema,
  AdapterHealthSchema,
  AdapterInfoSchema,
  AdapterStreamStatusSchema,
  AttachmentSchema,
  ChannelCapabilitiesSchema,
  ContainerKindSchema,
  ContentTypeSchema,
  DeliveryErrorTypeSchema,
  DeliveryErrorSchema,
  DeliveryResultSchema,
  DeliveryTargetSchema,
  NexusEventSchema,
  PeerKindSchema,
  SendRequestSchema,
  StreamEventSchema,
} from "./protocol.js";

export type {
  AdapterAccount,
  AdapterAuthField,
  AdapterAuthManifest,
  AdapterAuthMethod,
  AdapterAuthMethodApiKey,
  AdapterAuthMethodCustomFlow,
  AdapterAuthMethodFileUpload,
  AdapterAuthMethodOAuth,
  AdapterControlEndpoint,
  AdapterControlEndpointRemoveFrame,
  AdapterControlEndpointUpsertFrame,
  AdapterControlEventIngestFrame,
  AdapterControlInputFrame,
  AdapterControlInvokeCancelFrame,
  AdapterControlInvokeError,
  AdapterControlInvokeRequestFrame,
  AdapterControlInvokeResultFrame,
  AdapterControlOutputFrame,
  AdapterOperation,
  AdapterSetupResult,
  AdapterSetupStatus,
  AdapterHealth,
  AdapterInfo,
  AdapterStreamStatus,
  ChannelCapabilities,
  ContainerKind,
  ContentType,
  DeliveryErrorType,
  DeliveryError,
  DeliveryResult,
  DeliveryTarget,
  NexusEvent,
  PeerKind,
  SendRequest,
  StreamEvent,
} from "./protocol.js";

export type { StreamHandlers } from "./stream.js";
export { emitStreamStatus, handleStream } from "./stream.js";

export type { PollConfig, EmitFunc, MonitorHandler } from "./monitor.js";
export { pollMonitor } from "./monitor.js";

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

export { newEvent, EventBuilder } from "./event.js";

export type { AdapterLogger } from "./logger.js";
export { createAdapterLogger, patchConsoleToStderr } from "./logger.js";
