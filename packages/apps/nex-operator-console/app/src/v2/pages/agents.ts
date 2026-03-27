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
    <div class="v2-card v2-card--interactive" @click=${onClick}>
      <div class="v2-row-between" style="margin-bottom: var(--v2-space-3);">
        <div class="v2-row">
          <div style="
            width: 40px; height: 40px; border-radius: 50%;
            background: var(--v2-bg-nav-pill); display: flex;
            align-items: center; justify-content: center;
            color: var(--v2-text-muted);
          ">
            ${icons.bot}
          </div>
          <div>
            <div class="v2-strong" style="font-size: var(--v2-text-md);">${name}</div>
            ${model ? html`<div class="v2-muted" style="font-size: var(--v2-text-xs);">${model}</div>` : nothing}
          </div>
        </div>
        <span class="v2-badge v2-badge--success">Active</span>
      </div>
      ${desc
        ? html`<div class="v2-muted" style="font-size: var(--v2-text-sm); margin-bottom: var(--v2-space-3); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${desc}</div>`
        : nothing
      }
      <div class="v2-row-between" style="gap: var(--v2-space-2);">
        <span class="v2-badge v2-badge--neutral">All tools</span>
        <span class="v2-faint" style="font-size: var(--v2-text-2xs);">4 minutes ago</span>
      </div>
    </div>
  `;
}

function renderEmptyState(onCreateAgent: () => void) {
  return html`
    <div class="v2-card">
      <div class="v2-empty">
        <div class="v2-empty-icon">${icons.bot}</div>
        <div class="v2-empty-title">No agents yet</div>
        <div class="v2-empty-description">
          Create your first AI agent to automate tasks across your connected platforms.
        </div>
        <button class="v2-btn v2-btn--primary" @click=${onCreateAgent}>+ Create agent</button>
      </div>
    </div>
  `;
}

export function renderAgentsPage(props: AgentsPageProps) {
  const agents = props.agentsList?.agents ?? [];
  const count = agents.length;
  const maxSeats = 1; // placeholder

  return html`
    <div class="v2-page-header">
      <div class="v2-page-header-row">
        <div>
          <h1 class="v2-page-title">Agents ${count > 0 ? html`<span class="v2-muted" style="font-weight: 400;">(${count})</span>` : nothing}</h1>
          <p class="v2-page-subtitle">${count} of ${maxSeats} agent seats used</p>
        </div>
        <div class="v2-row">
          ${count > 0
            ? html`
                <button class="v2-btn v2-btn--secondary">Buy a seat</button>
                <button class="v2-btn v2-btn--primary" @click=${props.onCreateAgent}>+ Create agent</button>
              `
            : nothing
          }
        </div>
      </div>
    </div>

    ${props.loading
      ? html`<div class="v2-muted" style="padding: var(--v2-space-8); text-align: center;">Loading agents...</div>`
      : count === 0
        ? renderEmptyState(props.onCreateAgent)
        : html`
            <div class="v2-grid-3">
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
