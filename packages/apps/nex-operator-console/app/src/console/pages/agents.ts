import { html, nothing } from "lit";
import type { AgentsListResult } from "../../ui/types.ts";
import { icons } from "../../ui/icons.ts";
import { formatRelativeTimestamp } from "../../ui/format.ts";

export type AgentsPageProps = {
  loading: boolean;
  error: string | null;
  agentsList: AgentsListResult | null;
  onSelectAgent: (agentId: string) => void;
  onCreateAgent: () => void;
  onRefresh: () => void;
};

function renderAgentCard(agent: { id: string; identity?: { name?: string; avatarUrl?: string; avatar?: string; model?: string; description?: string }; model?: string }, onClick: () => void) {
  const name = agent.identity?.name || agent.id;
  const model = agent.identity?.model || agent.model || "";
  const desc = agent.identity?.description || "";

  return html`
    <div class="console-card console-card--interactive" @click=${onClick}>
      <div class="console-row-between" style="margin-bottom: var(--console-space-3);">
        <div class="console-row">
          <div style="
            width: 40px; height: 40px; border-radius: 50%;
            background: var(--console-bg-nav-pill); display: flex;
            align-items: center; justify-content: center;
            color: var(--console-text-muted);
          ">
            ${icons.bot}
          </div>
          <div>
            <div class="console-strong" style="font-size: var(--console-text-md);">${name}</div>
            ${model ? html`<div class="console-muted" style="font-size: var(--console-text-xs);">${model}</div>` : nothing}
          </div>
        </div>
        <span class="console-badge console-badge--success">Active</span>
      </div>
      ${desc
        ? html`<div class="console-muted" style="font-size: var(--console-text-sm); margin-bottom: var(--console-space-3); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${desc}</div>`
        : nothing
      }
      <div class="console-row-between" style="gap: var(--console-space-2);">
        <span class="console-badge console-badge--neutral">All tools</span>
        <span class="console-faint" style="font-size: var(--console-text-2xs);">4 minutes ago</span>
      </div>
    </div>
  `;
}

function renderEmptyState(onCreateAgent: () => void) {
  return html`
    <div class="console-card">
      <div class="console-empty">
        <div class="console-empty-icon">${icons.bot}</div>
        <div class="console-empty-title">No agents yet</div>
        <div class="console-empty-description">
          Create your first AI agent to automate tasks across your connected platforms.
        </div>
        <button class="console-btn console-btn--primary" @click=${onCreateAgent}>+ Create agent</button>
      </div>
    </div>
  `;
}

export function renderAgentsPage(props: AgentsPageProps) {
  const agents = props.agentsList?.agents ?? [];
  const count = agents.length;
  const maxSeats = 1; // placeholder

  return html`
    <div class="console-page-header">
      <div class="console-page-header-row">
        <div>
          <h1 class="console-page-title">Agents ${count > 0 ? html`<span class="console-muted" style="font-weight: 400;">(${count})</span>` : nothing}</h1>
          <p class="console-page-subtitle">${count} of ${maxSeats} agent seats used</p>
        </div>
        <div class="console-row">
          ${count > 0
            ? html`
                <button class="console-btn console-btn--secondary">Buy a seat</button>
                <button class="console-btn console-btn--primary" @click=${props.onCreateAgent}>+ Create agent</button>
              `
            : nothing
          }
        </div>
      </div>
    </div>

    ${props.loading
      ? html`<div class="console-muted" style="padding: var(--console-space-8); text-align: center;">Loading agents...</div>`
      : count === 0
        ? renderEmptyState(props.onCreateAgent)
        : html`
            <div class="console-grid-3">
              ${agents.map((agent) =>
                renderAgentCard(
                  agent as any,
                  () => props.onSelectAgent(agent.id),
                ),
              )}
            </div>
          `
    }
  `;
}
