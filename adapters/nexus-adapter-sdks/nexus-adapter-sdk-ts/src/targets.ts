import type { DeliveryTarget } from "./protocol.js";

function asNonEmptyString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function requireContainerTarget(target: DeliveryTarget): string {
  const value = asNonEmptyString(target.channel.container_id);
  if (!value) {
    throw new Error("target.channel.container_id is required");
  }
  return value;
}

export function readThreadTarget(target: DeliveryTarget): string | undefined {
  return asNonEmptyString(target.channel.thread_id);
}

export function readReplyToTarget(target: DeliveryTarget): string | undefined {
  return asNonEmptyString(target.reply_to_id);
}
