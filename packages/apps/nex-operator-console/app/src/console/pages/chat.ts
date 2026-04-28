import { html } from "lit";
import type { RuntimeBrowserClient, RuntimeEventFrame } from "../../ui/runtime.ts";
import "../components/chat-microfrontend-host.ts";

export type ChatPageProps = {
  connected: boolean;
  runtimeConnecting: boolean;
  runtimeClient: RuntimeBrowserClient | null;
  subscribeRuntimeEvents: (listener: (event: RuntimeEventFrame) => void) => () => void;
};

export function renderChatPage(props: ChatPageProps) {
  return html`
    <nexus-console-chat-host
      .connected=${props.connected}
      .runtimeConnecting=${props.runtimeConnecting}
      .runtimeClient=${props.runtimeClient}
      .subscribeRuntimeEvents=${props.subscribeRuntimeEvents}
    ></nexus-console-chat-host>
  `;
}
