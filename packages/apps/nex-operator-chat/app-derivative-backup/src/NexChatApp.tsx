import { RouterProvider, createBrowserHistory } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { NexChatAppConfigProvider } from "./app-config";
import { APP_DISPLAY_NAME, getRouter } from "./router";
import { resolveNexChatRuntimeBridge } from "./runtime-bridge";
import type { NexChatRuntimeBridge } from "./types";

export type NexChatAppProps = {
  bridge?: NexChatRuntimeBridge;
  initialLaneId?: string;
};

function readBasepath(): string {
  if (typeof window === "undefined") {
    return "/";
  }
  return window.location.pathname || "/";
}

export function NexChatApp(props: NexChatAppProps) {
  const routerRef = useRef(getRouter(createBrowserHistory(), { basepath: readBasepath() }));
  const bridgeBundle = useMemo(
    () => ({
      bridge: resolveNexChatRuntimeBridge({
        bridge: props.bridge,
      }),
    }),
    [props.bridge],
  );

  useEffect(() => {
    document.title = APP_DISPLAY_NAME;
    return () => {
      bridgeBundle.bridge.dispose?.();
    };
  }, [bridgeBundle]);

  return (
    <NexChatAppConfigProvider
      bridge={bridgeBundle.bridge}
      initialLaneId={props.initialLaneId?.trim() || null}
    >
      <RouterProvider router={routerRef.current} />
    </NexChatAppConfigProvider>
  );
}
