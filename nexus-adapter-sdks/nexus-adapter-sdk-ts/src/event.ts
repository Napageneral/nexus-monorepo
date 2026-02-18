import { NexusEvent } from "./protocol.js";

export class EventBuilder {
  private event: NexusEvent;

  constructor(channel: string, eventID: string) {
    this.event = {
      channel,
      event_id: eventID,
      timestamp: Date.now(),
      content: "",
      content_type: "text",
      account_id: "",
      sender_id: "",
      peer_id: "",
      peer_kind: "dm",
    };
  }

  withTimestamp(date: Date): this {
    this.event.timestamp = date.getTime();
    return this;
  }

  withTimestampUnixMs(ms: number): this {
    this.event.timestamp = ms;
    return this;
  }

  withContent(content: string): this {
    this.event.content = content;
    return this;
  }

  withContentType(contentType: NexusEvent["content_type"]): this {
    this.event.content_type = contentType;
    return this;
  }

  withSender(senderID: string, senderName?: string): this {
    this.event.sender_id = senderID;
    if (senderName) {
      this.event.sender_name = senderName;
    }
    return this;
  }

  withPeer(peerID: string, kind: NexusEvent["peer_kind"]): this {
    this.event.peer_id = peerID;
    this.event.peer_kind = kind;
    return this;
  }

  withAccount(accountID: string): this {
    this.event.account_id = accountID;
    return this;
  }

  withThread(threadID: string): this {
    this.event.thread_id = threadID;
    return this;
  }

  withReplyTo(replyToID: string): this {
    this.event.reply_to_id = replyToID;
    return this;
  }

  withAttachment(attachment: NonNullable<NexusEvent["attachments"]>[number]): this {
    if (!this.event.attachments) {
      this.event.attachments = [];
    }
    this.event.attachments.push(attachment);
    return this;
  }

  withMetadata(key: string, value: unknown): this {
    if (!this.event.metadata) {
      this.event.metadata = {};
    }
    this.event.metadata[key] = value;
    return this;
  }

  build(): NexusEvent {
    return this.event;
  }
}

export function newEvent(channel: string, eventID: string): EventBuilder {
  return new EventBuilder(channel, eventID);
}

