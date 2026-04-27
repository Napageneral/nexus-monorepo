import React from "react";
import ReactDOM from "react-dom/client";
import { NexChatApp, type NexChatAppProps } from "./NexChatApp";
import "./index.css";

export type NexChatMount = {
  update(nextProps: NexChatAppProps): void;
  unmount(): void;
};

export function mountNexChatApp(
  target: Element | DocumentFragment,
  props: NexChatAppProps,
): NexChatMount {
  const mountTarget = prepareMountTarget(target);
  const root = ReactDOM.createRoot(mountTarget.container);

  const render = (nextProps: NexChatAppProps) => {
    root.render(
      <React.StrictMode>
        <NexChatApp {...nextProps} />
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
      mountTarget.cleanup();
    },
  };
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
