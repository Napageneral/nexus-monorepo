import { html, type TemplateResult } from "lit";
import type { ConfigProps } from "./config.ts";
import type { DebugProps } from "./debug.ts";
import type { LogsProps } from "./logs.ts";
import type { OverviewProps } from "./overview.ts";
import type { SessionsProps } from "./sessions.ts";
import type { UsageProps } from "./usage.ts";
import { renderConfig } from "./config.ts";
import { renderDebug } from "./debug.ts";
import { renderLogs } from "./logs.ts";
import { renderOverview } from "./overview.ts";
import { renderSessions } from "./sessions.ts";
import { renderUsage } from "./usage.ts";

export type SystemSubTab = "overview" | "sessions" | "config" | "logs" | "debug" | "usage";

export type SystemViewProps = {
  subTab: SystemSubTab;
  onSubTabChange: (sub: SystemSubTab) => void;
  overviewProps: OverviewProps;
  sessionsProps: SessionsProps;
  configProps: ConfigProps;
  logsProps: LogsProps;
  debugProps: DebugProps;
  usageProps: UsageProps;
};

export function renderSystemView(props: SystemViewProps): TemplateResult {
  return html`
    <div class="access-view">
      <div class="sub-tabs">
        <button class="sub-tab ${props.subTab === "overview" ? "active" : ""}" @click=${() => props.onSubTabChange("overview")}>
          <span class="sub-tab__text">Overview</span>
          <span class="sub-tab__desc">Runtime health and access snapshot</span>
        </button>
        <button class="sub-tab ${props.subTab === "sessions" ? "active" : ""}" @click=${() => props.onSubTabChange("sessions")}>
          <span class="sub-tab__text">Sessions</span>
          <span class="sub-tab__desc">Lower-level continuity, overrides, and admin session controls</span>
        </button>
        <button class="sub-tab ${props.subTab === "config" ? "active" : ""}" @click=${() => props.onSubTabChange("config")}>
          <span class="sub-tab__text">Config</span>
          <span class="sub-tab__desc">Raw and guided runtime configuration</span>
        </button>
        <button class="sub-tab ${props.subTab === "logs" ? "active" : ""}" @click=${() => props.onSubTabChange("logs")}>
          <span class="sub-tab__text">Logs</span>
          <span class="sub-tab__desc">Runtime log stream and export</span>
        </button>
        <button class="sub-tab ${props.subTab === "debug" ? "active" : ""}" @click=${() => props.onSubTabChange("debug")}>
          <span class="sub-tab__text">Debug</span>
          <span class="sub-tab__desc">Snapshots, events, and manual runtime calls</span>
        </button>
        <button class="sub-tab ${props.subTab === "usage" ? "active" : ""}" @click=${() => props.onSubTabChange("usage")}>
          <span class="sub-tab__text">Usage</span>
          <span class="sub-tab__desc">Token, model, and cost analytics</span>
        </button>
      </div>

      <div class="access-view__content">
        ${
          props.subTab === "overview"
            ? renderOverview(props.overviewProps)
            : props.subTab === "sessions"
              ? renderSessions(props.sessionsProps)
              : props.subTab === "config"
                ? renderConfig(props.configProps)
                : props.subTab === "logs"
                  ? renderLogs(props.logsProps)
                  : props.subTab === "debug"
                    ? renderDebug(props.debugProps)
                    : renderUsage(props.usageProps)
        }
      </div>
    </div>
  `;
}
