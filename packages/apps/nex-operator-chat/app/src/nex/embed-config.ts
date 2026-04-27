import type { NexChatRuntimeBridge } from "./chat-types";

export type NexChatEmbedConfig = {
  bridge: NexChatRuntimeBridge;
  basepath?: string | null;
  initialLaneId?: string | null;
};

const EMBED_CONFIG_KEY = "__NEX_CHAT_EMBED_CONFIG__";

type EmbedConfigHost = typeof globalThis & {
  [EMBED_CONFIG_KEY]?: NexChatEmbedConfig | null;
};

let currentConfig: NexChatEmbedConfig | null = null;

export function setNexChatEmbedConfig(config: NexChatEmbedConfig | null): void {
  currentConfig = config;
  (globalThis as EmbedConfigHost)[EMBED_CONFIG_KEY] = config;
}

export function readNexChatEmbedConfig(): NexChatEmbedConfig | null {
  const globalConfig = (globalThis as EmbedConfigHost)[EMBED_CONFIG_KEY];
  if (globalConfig !== undefined) {
    currentConfig = globalConfig;
  }
  return currentConfig;
}

export function requireNexChatEmbedConfig(): NexChatEmbedConfig {
  const config = readNexChatEmbedConfig();
  if (!config) {
    throw new Error("Nex chat embed config is not available.");
  }
  return config;
}

export function isNexEmbedded(): boolean {
  return readNexChatEmbedConfig() !== null;
}
