import { createContext, useContext, type ReactNode } from "react";
import type { NexChatRuntimeBridge } from "./types";

type NexChatAppConfig = {
  bridge: NexChatRuntimeBridge;
  initialLaneId?: string | null;
};

const NexChatAppConfigContext = createContext<NexChatAppConfig | null>(null);

export function NexChatAppConfigProvider(
  props: NexChatAppConfig & {
    children: ReactNode;
  },
) {
  return (
    <NexChatAppConfigContext.Provider
      value={{
        bridge: props.bridge,
        initialLaneId: props.initialLaneId?.trim() || null,
      }}
    >
      {props.children}
    </NexChatAppConfigContext.Provider>
  );
}

export function useNexChatAppConfig() {
  const context = useContext(NexChatAppConfigContext);
  if (!context) {
    throw new Error("NexChatAppConfigProvider is required");
  }
  return context;
}
