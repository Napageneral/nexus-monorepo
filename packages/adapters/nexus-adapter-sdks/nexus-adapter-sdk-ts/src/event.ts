import type { AdapterInboundRecord, Attachment, ContentType, ContainerKind } from "./protocol.js";

export class RecordBuilder {
  private record: AdapterInboundRecord;

  constructor(platform: string, externalRecordID: string) {
    this.record = {
      operation: "record.ingest",
      routing: {
        platform,
        connection_id: "",
        sender_id: "",
        container_id: "",
        container_kind: "direct",
      },
      payload: {
        external_record_id: externalRecordID,
        timestamp: Date.now(),
        content: "",
        content_type: "text",
      },
    };
  }

  withTimestamp(date: Date): this {
    this.record.payload.timestamp = date.getTime();
    return this;
  }

  withTimestampUnixMs(ms: number): this {
    this.record.payload.timestamp = ms;
    return this;
  }

  withContent(content: string): this {
    this.record.payload.content = content;
    return this;
  }

  withContentType(contentType: ContentType): this {
    this.record.payload.content_type = contentType;
    return this;
  }

  withSender(senderID: string, senderName?: string): this {
    this.record.routing.sender_id = senderID;
    if (senderName) {
      this.record.routing.sender_name = senderName;
    }
    return this;
  }

  withReceiver(receiverID: string, receiverName?: string): this {
    this.record.routing.receiver_id = receiverID;
    if (receiverName) {
      this.record.routing.receiver_name = receiverName;
    }
    return this;
  }

  withContainer(containerID: string, kind: ContainerKind, containerName?: string): this {
    this.record.routing.container_id = containerID;
    this.record.routing.container_kind = kind;
    if (containerName) {
      this.record.routing.container_name = containerName;
    }
    return this;
  }

  withConnection(connectionID: string): this {
    this.record.routing.connection_id = connectionID;
    return this;
  }

  withThread(threadID: string, threadName?: string): this {
    this.record.routing.thread_id = threadID;
    if (threadName) {
      this.record.routing.thread_name = threadName;
    }
    return this;
  }

  withSpace(spaceID: string, spaceName?: string): this {
    this.record.routing.space_id = spaceID;
    if (spaceName) {
      this.record.routing.space_name = spaceName;
    }
    return this;
  }

  withReplyTo(replyToID: string): this {
    this.record.routing.reply_to_id = replyToID;
    this.record.payload.reply_to_id = replyToID;
    return this;
  }

  withAttachment(attachment: Attachment): this {
    if (!this.record.payload.attachments) {
      this.record.payload.attachments = [];
    }
    this.record.payload.attachments.push(attachment);
    return this;
  }

  withRecipient(recipientID: string): this {
    if (!this.record.payload.recipients) {
      this.record.payload.recipients = [];
    }
    this.record.payload.recipients.push(recipientID);
    return this;
  }

  withMetadata(key: string, value: unknown): this {
    if (!this.record.payload.metadata) {
      this.record.payload.metadata = {};
    }
    this.record.payload.metadata[key] = value;
    return this;
  }

  withRoutingMetadata(key: string, value: unknown): this {
    if (!this.record.routing.metadata) {
      this.record.routing.metadata = {};
    }
    this.record.routing.metadata[key] = value;
    return this;
  }

  build(): AdapterInboundRecord {
    return this.record;
  }
}

export function newRecord(platform: string, externalRecordID: string): RecordBuilder {
  return new RecordBuilder(platform, externalRecordID);
}

export type MessageRecordOptions = {
  platform: string;
  connectionId: string;
  externalRecordId: string;
  senderId: string;
  senderName?: string;
  receiverId?: string;
  receiverName?: string;
  spaceId?: string;
  spaceName?: string;
  containerId: string;
  containerKind: ContainerKind;
  containerName?: string;
  threadId?: string;
  threadName?: string;
  replyToId?: string;
  timestamp?: Date | number;
  content: string;
  contentType?: ContentType;
  attachments?: Attachment[];
  recipients?: string[];
  metadata?: Record<string, unknown>;
  routingMetadata?: Record<string, unknown>;
};

export function messageRecord(options: MessageRecordOptions): AdapterInboundRecord {
  const builder = newRecord(options.platform, options.externalRecordId)
    .withConnection(options.connectionId)
    .withSender(options.senderId, options.senderName)
    .withContainer(options.containerId, options.containerKind, options.containerName)
    .withContent(options.content)
    .withContentType(options.contentType ?? "text");

  if (options.timestamp instanceof Date) {
    builder.withTimestamp(options.timestamp);
  } else if (typeof options.timestamp === "number" && Number.isFinite(options.timestamp)) {
    builder.withTimestampUnixMs(options.timestamp);
  }

  if (options.receiverId) {
    builder.withReceiver(options.receiverId, options.receiverName);
  }
  if (options.spaceId) {
    builder.withSpace(options.spaceId, options.spaceName);
  }
  if (options.threadId) {
    builder.withThread(options.threadId, options.threadName);
  }
  if (options.replyToId) {
    builder.withReplyTo(options.replyToId);
  }
  for (const attachment of options.attachments ?? []) {
    builder.withAttachment(attachment);
  }
  for (const recipient of options.recipients ?? []) {
    builder.withRecipient(recipient);
  }
  for (const [key, value] of Object.entries(options.metadata ?? {})) {
    builder.withMetadata(key, value);
  }
  for (const [key, value] of Object.entries(options.routingMetadata ?? {})) {
    builder.withRoutingMetadata(key, value);
  }
  return builder.build();
}
