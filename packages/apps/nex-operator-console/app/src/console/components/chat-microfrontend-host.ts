import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  finishConsoleLatency,
  measureConsoleLatency,
  startConsoleLatency,
} from "../../ui/latency-metrics.ts";
import type { RuntimeBrowserClient, RuntimeEventFrame } from "../../ui/runtime.ts";

type NexChatBridgeProps = {
  bridge: {
    request<T = unknown>(method: string, params?: unknown): Promise<T>;
    subscribe(listener: (event: { event: "chat"; payload: unknown }) => void): () => void;
  };
  basepath?: string;
  initialLaneId?: string;
};

type NexChatMount = {
  update(nextProps: NexChatBridgeProps): void;
  unmount(): void;
};

type NexChatModule = {
  mountNexChatApp(target: Element | DocumentFragment, props: NexChatBridgeProps): NexChatMount;
};

type RuntimeHostApp = {
  client?: RuntimeBrowserClient | null;
  subscribeRuntimeEvents?: (listener: (event: RuntimeEventFrame) => void) => () => void;
};

let nexChatModulePromise: Promise<NexChatModule> | null = null;

async function loadNexChatModule(): Promise<NexChatModule> {
  if (!nexChatModulePromise) {
    nexChatModulePromise = (
      // @ts-ignore sibling microfrontend source is bundled by Vite even though this package's tsconfig does not include JSX
      import("../../../../../nex-operator-chat/app/src/index.ts")
    ) as Promise<NexChatModule>;
  }
  return nexChatModulePromise;
}

@customElement("nexus-console-chat-host")
export class NexusConsoleChatHost extends LitElement {
  static styles = css`
    :host {
      display: block;
      flex: 1 1 auto;
      min-height: 0;
      height: 100%;
    }

    .nex-chat-host__frame {
      position: relative;
      min-height: 100%;
      height: 100%;
    }

    .nex-chat-host__mount {
      min-height: 100%;
      height: 100%;
    }

    .nex-chat-host__notice {
      position: absolute;
      inset: 24px 24px auto;
      z-index: 1;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid rgba(31, 107, 87, 0.16);
      background: rgba(255, 252, 247, 0.92);
      color: #1d2a26;
      box-shadow: 0 18px 48px rgba(27, 37, 34, 0.12);
      font:
        500 13px/1.5 "Inter",
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
      letter-spacing: 0.01em;
    }

    .nex-chat-host__notice--error {
      border-color: rgba(148, 35, 35, 0.24);
      color: #7f1d1d;
    }
  `;

  @property({ attribute: false }) runtimeClient: RuntimeBrowserClient | null = null;
  @property({ attribute: false }) subscribeRuntimeEvents:
    | ((listener: (event: RuntimeEventFrame) => void) => () => void)
    | null = null;
  @property({ type: Boolean }) connected = false;
  @property({ type: Boolean }) runtimeConnecting = false;
  @property() initialLaneId = "";

  @state() private bootError: string | null = null;
  @state() private loading = false;

  private chatMount: NexChatMount | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.applyHostSizing();
  }

  private readonly bridge = {
    request: <T = unknown>(method: string, params?: unknown) => {
      const client = this.resolveRuntimeClient();
      if (!client || !client.connected) {
        return Promise.reject(new Error("runtime not connected"));
      }
      return measureConsoleLatency(
        `chat.bridge.request.${method}`,
        () => client.request<T>(method, params),
        {
          method,
        },
      );
    },
    subscribe: (listener: (event: { event: "chat"; payload: unknown }) => void) => {
      const subscribe = this.resolveRuntimeEventSubscription();
      if (!subscribe) {
        return () => {};
      }
      return subscribe((event) => {
        if (event.event !== "chat") {
          return;
        }
        listener({
          event: "chat",
          payload: event.payload,
        });
      });
    },
  };

  protected firstUpdated() {
    void this.ensureMounted();
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    if (
      !this.chatMount &&
      (changed.has("connected") || changed.has("runtimeClient") || changed.has("subscribeRuntimeEvents"))
    ) {
      void this.ensureMounted();
      return;
    }
    if (changed.has("initialLaneId") && this.chatMount) {
      this.chatMount.update(this.buildProps());
    }
  }

  disconnectedCallback() {
    this.chatMount?.unmount();
    this.chatMount = null;
    super.disconnectedCallback();
  }

  render() {
    return html`
      <section
        class="nex-chat-host__frame"
        style="position:relative;display:flex;flex:1 1 auto;min-width:0;min-height:100%;height:100%;"
      >
        <div
          id="mount"
          class="nex-chat-host__mount"
          style="display:flex;flex:1 1 auto;min-width:0;min-height:100%;height:100%;"
        ></div>
        ${this.bootError
          ? html`<div class="nex-chat-host__notice nex-chat-host__notice--error">${this.bootError}</div>`
          : !this.connected && !this.chatMount
            ? html`<div class="nex-chat-host__notice">
                ${this.runtimeConnecting
                  ? "Connecting to the Nex runtime."
                  : "Waiting for the Nex runtime connection."}
              </div>`
            : this.loading && !this.chatMount
              ? html`<div class="nex-chat-host__notice">Loading the operator chat surface.</div>`
              : nothing}
      </section>
    `;
  }

  private buildProps(): NexChatBridgeProps {
    return {
      bridge: this.bridge,
      basepath: "/app/console/chat",
      ...(this.initialLaneId.trim() ? { initialLaneId: this.initialLaneId.trim() } : {}),
    };
  }

  private getMountTarget(): HTMLDivElement | null {
    return this.querySelector<HTMLDivElement>("#mount");
  }

  private applyHostSizing(): void {
    this.style.display = "flex";
    this.style.flex = "1 1 auto";
    this.style.minHeight = "0";
    this.style.height = "100%";
    this.style.minWidth = "0";
  }

  private resolveRuntimeHostApp(): RuntimeHostApp | null {
    if (typeof document === "undefined") {
      return null;
    }
    return document.querySelector("nexus-app") as RuntimeHostApp | null;
  }

  private resolveRuntimeClient(): RuntimeBrowserClient | null {
    return this.runtimeClient ?? this.resolveRuntimeHostApp()?.client ?? null;
  }

  private resolveRuntimeEventSubscription():
    | ((listener: (event: RuntimeEventFrame) => void) => () => void)
    | null {
    return this.subscribeRuntimeEvents ?? this.resolveRuntimeHostApp()?.subscribeRuntimeEvents ?? null;
  }

  private async ensureMounted(): Promise<void> {
    if (this.chatMount) {
      this.chatMount.update(this.buildProps());
      return;
    }
    if (this.loading || !this.connected || !this.resolveRuntimeClient()) {
      return;
    }

    const mountTarget = this.getMountTarget();
    if (!mountTarget) {
      return;
    }

    this.loading = true;
    this.bootError = null;
    const loadToken = startConsoleLatency("chat.microfrontend.load", {
      initial_lane_id: this.initialLaneId.trim() || null,
    });
    let loadSettled = false;
    const finishLoad = (
      outcome: Parameters<typeof finishConsoleLatency>[1],
      details?: Parameters<typeof finishConsoleLatency>[2],
    ) => {
      if (loadSettled) {
        return;
      }
      loadSettled = true;
      finishConsoleLatency(loadToken, outcome, details);
    };
    try {
      const module = await loadNexChatModule();
      finishLoad("ok");
      const mountToken = startConsoleLatency("chat.microfrontend.mount", {
        initial_lane_id: this.initialLaneId.trim() || null,
      });
      this.chatMount = module.mountNexChatApp(mountTarget, this.buildProps());
      finishConsoleLatency(mountToken, "ok");
    } catch (error) {
      finishLoad("error", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.bootError = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
    }
  }
}
