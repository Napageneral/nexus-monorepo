import { RuntimeBrowserClient } from "./runtime";
import { createDemoBridge } from "./demo";
import type { ChatEvent, NexChatRuntimeBridge } from "./types";

export type ManagedNexChatRuntimeBridge = NexChatRuntimeBridge & {
  dispose?: () => void;
};

function readSearchParam(name: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = new URL(window.location.href).searchParams.get(name)?.trim();
  return value || null;
}

export function createStandaloneRuntimeBridge(input: {
  url: string;
  token?: string | null;
}): ManagedNexChatRuntimeBridge {
  const listeners = new Set<(event: { event: "chat"; payload: ChatEvent }) => void>();
  let readyResolve: (() => void) | null = null;
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });
  const client = new RuntimeBrowserClient({
    url: input.url,
    ...(input.token?.trim() ? { token: input.token.trim() } : {}),
    onHello: () => {
      readyResolve?.();
      readyResolve = null;
    },
    onEvent: (event) => {
      if (event.event !== "chat" || !event.payload) {
        return;
      }
      const payload = event.payload as ChatEvent;
      for (const listener of listeners) {
        listener({ event: "chat", payload });
      }
    },
  });

  client.start();

  return {
    async request<T = unknown>(method: string, params?: unknown): Promise<T> {
      await ready;
      return client.request<T>(method, params);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      listeners.clear();
      client.stop();
    },
  };
}

export function resolveNexChatRuntimeBridge(input: {
  bridge?: NexChatRuntimeBridge;
  runtimeUrl?: string;
  runtimeToken?: string;
}): ManagedNexChatRuntimeBridge {
  if (input.bridge) {
    return input.bridge;
  }

  const runtimeUrl = input.runtimeUrl?.trim() || readSearchParam("runtimeUrl");
  const runtimeToken =
    input.runtimeToken?.trim() ||
    readSearchParam("runtimeToken") ||
    readSearchParam("token");

  if (runtimeUrl) {
    return createStandaloneRuntimeBridge({
      url: runtimeUrl,
      token: runtimeToken,
    });
  }

  return createDemoBridge();
}
