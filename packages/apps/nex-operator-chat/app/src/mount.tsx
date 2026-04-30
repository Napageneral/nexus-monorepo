import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserHistory, createMemoryHistory } from "@tanstack/react-router";
import { RouterProvider } from "@tanstack/react-router";
import { requestServerConfig } from "./nex/chat-adapter";
import { createNexEmbeddedNativeApi, resetNexEmbeddedNativeApi } from "./nex/native-api";
import { setNexChatEmbedConfig, type NexChatEmbedConfig } from "./nex/embed-config";
import { resetNexEmbeddedWsRpcClient } from "./nex/ws-rpc-client";
import { setServerConfigSnapshot } from "./rpc/serverState";
import { getRouter } from "./router";
import "./index.css";
import "@xterm/xterm/css/xterm.css";

export type NexChatBridgeProps = {
  bridge: NexChatEmbedConfig["bridge"];
  basepath?: string;
  initialLaneId?: string;
  onLaneSelectionChange?: (laneId: string | null) => void;
};

export type NexChatMount = {
  update(nextProps: NexChatBridgeProps): void;
  unmount(): void;
};

export function mountNexChatApp(
  target: Element | DocumentFragment,
  props: NexChatBridgeProps,
): NexChatMount {
  const mountTarget = prepareMountTarget(target);
  const embedded = Boolean(props.basepath?.trim());
  const history = embedded
    ? createMemoryHistory({
        initialEntries: [buildEmbeddedInitialEntry(props.initialLaneId)],
      })
    : createBrowserHistory();
  let router = getRouter(history, embedded ? undefined : props.basepath?.trim() || undefined);
  const root = ReactDOM.createRoot(mountTarget.container);
  const previousNativeApi = window.nativeApi;

  const render = (nextProps: NexChatBridgeProps) => {
    const nextEmbedded = Boolean(nextProps.basepath?.trim());
    setNexChatEmbedConfig({
      bridge: nextProps.bridge,
      basepath: nextEmbedded ? null : nextProps.basepath?.trim() || null,
      initialLaneId: nextProps.initialLaneId?.trim() || null,
      ...(nextProps.onLaneSelectionChange
        ? { onLaneSelectionChange: nextProps.onLaneSelectionChange }
        : {}),
    });
    if (nextEmbedded) {
      const nextEntry = buildEmbeddedInitialEntry(nextProps.initialLaneId);
      if (history.location.pathname !== nextEntry) {
        history.replace(nextEntry);
      }
    }
    resetNexEmbeddedWsRpcClient();
    resetNexEmbeddedNativeApi();
    window.nativeApi = createNexEmbeddedNativeApi();
    void requestServerConfig()
      .then((config) => {
        setServerConfigSnapshot(config);
      })
      .catch(() => undefined);
    router = getRouter(history, nextEmbedded ? undefined : nextProps.basepath?.trim() || undefined);
    root.render(
      <React.StrictMode>
        <RouterProvider router={router} />
      </React.StrictMode>,
    );
  };

  render(props);

  return {
    update(nextProps) {
      render(nextProps);
    },
    unmount() {
      root.unmount();
      setNexChatEmbedConfig(null);
      resetNexEmbeddedWsRpcClient();
      resetNexEmbeddedNativeApi();
      if (previousNativeApi) {
        window.nativeApi = previousNativeApi;
      } else {
        delete window.nativeApi;
      }
      mountTarget.cleanup();
    },
  };
}

function buildEmbeddedInitialEntry(initialLaneId?: string | null): string {
  const laneId = initialLaneId?.trim();
  return laneId ? `/${laneId}` : "/";
}

function prepareMountTarget(target: Element | DocumentFragment): {
  container: Element | DocumentFragment;
  cleanup(): void;
} {
  if (target instanceof ShadowRoot) {
    const container = target.ownerDocument.createElement("div");
    target.replaceChildren(container);
    return {
      container,
      cleanup() {
        target.replaceChildren();
      },
    };
  }

  return {
    container: target,
    cleanup() {},
  };
}
