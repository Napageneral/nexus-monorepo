import type { ChannelRef } from "./protocol.js";

function asNonEmptyString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function requireContainerTarget(channel: ChannelRef): string {
  const value = asNonEmptyString(channel.container_id);
  if (!value) {
    throw new Error("channel.container_id is required");
  }
  return value;
}

export function readThreadTarget(channel: ChannelRef): string | undefined {
  return asNonEmptyString(channel.thread_id);
}

export function readReplyToTarget(replyToID: string | undefined): string | undefined {
  return asNonEmptyString(replyToID);
}
