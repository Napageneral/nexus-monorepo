import { html, nothing } from "lit";
import type { AgentsListResult } from "../../ui/types.ts";
import { icons } from "../../ui/icons.ts";
import { renderChat, type ChatProps } from "../../ui/views/chat.ts";
import {
  renderScheduleTemplatesModal,
  renderManageToolsModal,
  renderEditGuardrailsModal,
  renderManageMemoryModal,
  renderEditSkillModal,
} from "../components/modals.ts";

export type AgentDetailTab = "settings" | "skills" | "run-history";

export type AgentDetailModal = null | "schedule" | "tools" | "guardrails" | "memory" | "skill-edit";

export type AgentDetailProps = {
  agentId: string;
  agentsList: AgentsListResult | null;
  activeTab: AgentDetailTab;
  activeModal: AgentDetailModal;
  chatProps: ChatProps | null;
  onTabChange: (tab: AgentDetailTab) => void;
  onModalChange: (modal: AgentDetailModal) => void;
  onBack: () => void;
};

// ─── Header ──────────────────────────────────────────────────────────

function renderDetailHeader(props: AgentDetailProps) {
  const agents = props.agentsList?.agents ?? [];
  const agent = agents.find((a) => a.id === props.agentId);
  const name = (agent as any)?.identity?.name || props.agentId;

  return html`
    <div class="v2-agent-header">
      <div class="v2-row" style="gap: var(--v2-space-3);">
        <button class="v2-icon-btn" @click=${props.onBack} title="Back to agents">
          <svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div>
          <div class="v2-agent-header-name">${name}</div>
          <div class="v2-agent-header-meta">Created less than a minute ago</div>
        </div>
      </div>
      <div class="v2-row" style="gap: var(--v2-space-2);">
        <button class="v2-btn v2-btn--secondary v2-btn--sm">Dupe</button>
        <span class="v2-badge v2-badge--success">Active</span>
        <button class="v2-btn v2-btn--secondary v2-btn--sm">Pause</button>
      </div>
    </div>
  `;
}

// ─── Tab bar ─────────────────────────────────────────────────────────

function renderDetailTabs(activeTab: AgentDetailTab, onTabChange: (tab: AgentDetailTab) => void) {
  const tabs: { key: AgentDetailTab; label: string }[] = [
    { key: "settings", label: "Settings" },
    { key: "skills", label: "Skills" },
    { key: "run-history", label: "Run History" },
  ];
  return html`
    <div class="v2-agent-tabs">
      ${tabs.map((t) => html`
        <button
          class="v2-agent-tab ${activeTab === t.key ? "v2-agent-tab--active" : ""}"
          @click=${() => onTabChange(t.key)}
        >${t.label}</button>
      `)}
    </div>
  `;
}

// ─── Settings sections ───────────────────────────────────────────────

function renderSettingsTab(onModalChange: (modal: AgentDetailModal) => void) {
  return html`
    <!-- TRIGGERS -->
    <div class="v2-agent-section">
      <div class="v2-agent-section-label">Triggers</div>
      <div class="v2-card">
        <div class="v2-empty" style="padding: var(--v2-space-5);">
          <div class="v2-muted" style="font-size: var(--v2-text-xs); margin-bottom: var(--v2-space-3);">No triggers configured</div>
          <div class="v2-row" style="gap: var(--v2-space-2);">
            <button class="v2-btn v2-btn--secondary v2-btn--sm" @click=${() => onModalChange("schedule")}>
              <svg viewBox="0 0 24 24" style="width:12px;height:12px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Add schedule
            </button>
            <button class="v2-btn v2-btn--secondary v2-btn--sm">
              <svg viewBox="0 0 24 24" style="width:12px;height:12px;"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/></svg>
              Add event trigger
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- TOOLS -->
    <div class="v2-agent-section">
      <div class="v2-row-between">
        <div class="v2-agent-section-label">Tools</div>
        <button class="v2-btn v2-btn--ghost v2-btn--sm v2-gold-text" @click=${() => onModalChange("tools")}>Manage</button>
      </div>
      <div class="v2-card" style="padding: var(--v2-space-3) var(--v2-space-4);">
        <div class="v2-row">
          <div class="v2-table-platform-icon">${icons.plug}</div>
          <span>1 connection</span>
        </div>
      </div>
    </div>

    <!-- GUARDRAILS -->
    <div class="v2-agent-section">
      <div class="v2-row-between">
        <div class="v2-agent-section-label">Guardrails</div>
        <button class="v2-btn v2-btn--ghost v2-btn--sm v2-gold-text" @click=${() => onModalChange("guardrails")}>Edit</button>
      </div>
      <div class="v2-card" style="padding: var(--v2-space-3) var(--v2-space-4);">
        <div class="v2-row" style="gap: var(--v2-space-3);">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:var(--v2-text-muted);fill:none;stroke-width:2;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
          <span>Full access</span>
          <span class="v2-faint">|</span>
          <span>$5/conversation</span>
          <span class="v2-faint">|</span>
          <span>100 steps</span>
        </div>
      </div>
    </div>

    <!-- MEMORY -->
    <div class="v2-agent-section">
      <div class="v2-row-between">
        <div class="v2-agent-section-label">Memory</div>
        <button class="v2-btn v2-btn--ghost v2-btn--sm v2-gold-text" @click=${() => onModalChange("memory")}>Manage</button>
      </div>
      <div class="v2-card" style="padding: var(--v2-space-3) var(--v2-space-4);">
        <span>Persistent</span>
      </div>
    </div>

    <!-- STORED MEMORIES -->
    <div class="v2-agent-section">
      <div class="v2-row-between">
        <div class="v2-agent-section-label">Stored Memories</div>
        <button class="v2-btn v2-btn--ghost v2-btn--sm v2-gold-text">Refresh</button>
      </div>
      <div class="v2-card" style="padding: var(--v2-space-3) var(--v2-space-4);">
        <span class="v2-muted" style="font-size: var(--v2-text-xs);">No memories yet. This agent will save important facts after conversations.</span>
      </div>
    </div>

    <!-- CHANNELS -->
    <div class="v2-agent-section">
      <div class="v2-agent-section-label">Channels</div>

      <div class="v2-card v2-agent-channel-card">
        <div class="v2-row-between">
          <div class="v2-row" style="gap: var(--v2-space-3);">
            <div class="v2-agent-channel-icon" style="background: #0088cc;">T</div>
            <div>
              <div class="v2-strong">Telegram</div>
              <div class="v2-muted" style="font-size: var(--v2-text-2xs);">4 /281</div>
            </div>
          </div>
          <button class="v2-btn v2-btn--primary v2-btn--sm">Connect</button>
        </div>
      </div>

      <div class="v2-card v2-agent-channel-card">
        <div class="v2-row-between">
          <div class="v2-row" style="gap: var(--v2-space-3);">
            <div class="v2-agent-channel-icon" style="background: #4A154B;">S</div>
            <div>
              <div class="v2-strong">Slack</div>
              <div class="v2-muted" style="font-size: var(--v2-text-2xs);">0 /0</div>
            </div>
          </div>
          <button class="v2-btn v2-btn--primary v2-btn--sm">Connect</button>
        </div>
      </div>

      <div class="v2-card v2-agent-channel-card">
        <div class="v2-row-between">
          <div class="v2-row" style="gap: var(--v2-space-3);">
            <div class="v2-agent-channel-icon" style="background: #25D366;">W</div>
            <div>
              <div class="v2-strong">WhatsApp</div>
              <div class="v2-muted" style="font-size: var(--v2-text-2xs);">Coming soon...</div>
            </div>
          </div>
          <button class="v2-btn v2-btn--secondary v2-btn--sm">Configure</button>
        </div>
      </div>
    </div>

    <!-- PERSONA & INFO -->
    <div class="v2-agent-section">
      <div class="v2-agent-section-label">Persona & Info</div>

      <div class="v2-card" style="margin-bottom: var(--v2-space-3);">
        <div class="v2-row-between" style="margin-bottom: var(--v2-space-2);">
          <span class="v2-label--upper" style="margin: 0;">CLAUDE.MD</span>
          <button class="v2-btn v2-btn--ghost v2-btn--sm v2-gold-text">Refresh</button>
        </div>
        <span class="v2-muted" style="font-size: var(--v2-text-xs);">No claude.md yet. Start chatting with the agent and it will be created automatically.</span>
      </div>

      <div class="v2-card" style="padding: var(--v2-space-3) var(--v2-space-4);">
        <div class="v2-review-row"><span class="v2-muted">Model</span><span class="v2-row" style="gap: 4px;"><span class="v2-strong">Opus</span><button class="v2-btn v2-btn--ghost v2-btn--sm v2-gold-text" style="padding: 0;">Open</button></span></div>
        <div class="v2-review-row"><span class="v2-muted">Environment</span><span class="v2-mono">b14a5de0-d669-4f...</span></div>
        <div class="v2-review-row"><span class="v2-muted">Environment</span><span class="v2-strong">Live</span></div>
        <div class="v2-review-row"><span class="v2-muted">Version</span><span class="v2-strong">100</span></div>
      </div>
    </div>
  `;
}

// ─── Skills tab ──────────────────────────────────────────────────────

function renderSkillsTab() {
  return html`
    <div class="v2-card">
      <div class="v2-empty">
        <div class="v2-empty-icon">
          <svg viewBox="0 0 24 24" style="width:48px;height:48px;stroke:var(--v2-text-faint);fill:none;stroke-width:1.5;"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
        </div>
        <div class="v2-empty-title">No skills attached</div>
        <div class="v2-empty-description">Skills give your agent reusable playbooks for multi-step automations. Add a prebuilt skill or create your own.</div>
        <button class="v2-btn v2-btn--primary">+ Add your first skill</button>
      </div>
    </div>
  `;
}

// ─── Run History tab ─────────────────────────────────────────────────

function renderRunHistoryTab() {
  return html`
    <div class="v2-grid-3" style="margin-bottom: var(--v2-space-5);">
      <div class="v2-card">
        <div class="v2-card-title" style="font-size: var(--v2-text-xs);">Test AI</div>
        <div class="v2-row" style="margin-top: 4px; gap: var(--v2-space-3);">
          <span style="font-size: var(--v2-text-xs);"><span class="v2-strong">0</span> <span class="v2-muted">Succeeded</span></span>
          <span style="font-size: var(--v2-text-xs);"><span class="v2-strong">0</span> <span class="v2-muted">Failure</span></span>
        </div>
      </div>
      <div class="v2-card">
        <div class="v2-card-title" style="font-size: var(--v2-text-xs);">Last Job</div>
        <div class="v2-row" style="margin-top: 4px; gap: var(--v2-space-3);">
          <span style="font-size: var(--v2-text-xs);"><span class="v2-strong">0</span> <span class="v2-muted">Succeeded</span></span>
          <span style="font-size: var(--v2-text-xs);"><span class="v2-strong">0</span> <span class="v2-muted">Muted</span></span>
        </div>
      </div>
      <div class="v2-card">
        <div class="v2-card-title" style="font-size: var(--v2-text-xs);">Test AI</div>
        <div class="v2-row" style="margin-top: 4px; gap: var(--v2-space-3);">
          <span style="font-size: var(--v2-text-xs);"><span class="v2-strong">0</span> <span class="v2-muted">Succeeded</span></span>
          <span style="font-size: var(--v2-text-xs);"><span class="v2-strong">0</span> <span class="v2-muted">Failure</span></span>
        </div>
      </div>
    </div>

    <div class="v2-agent-section-label">Run History</div>
    <div class="v2-card">
      <div class="v2-empty" style="padding: var(--v2-space-6);">
        <div class="v2-empty-icon">
          <svg viewBox="0 0 24 24" style="width:32px;height:32px;stroke:var(--v2-text-faint);fill:none;stroke-width:1.5;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="v2-empty-title">No runs yet</div>
        <div class="v2-empty-description">Runs will appear here once a schedule triggers or an automated flow executes. You can also use "Run now" to test.</div>
      </div>
    </div>
  `;
}

// ─── Chat panel (right side) ─────────────────────────────────────────

function renderChatPanel(agentName: string, chatProps: ChatProps | null) {
  // If we have real chat props, use the existing chat renderer
  if (chatProps) {
    return html`
      <div class="v2-agent-chat v2-agent-chat--real">
        ${renderChat({ ...chatProps, focusMode: false })}
      </div>
    `;
  }

  // Fallback: placeholder chat UI
  return html`
    <div class="v2-agent-chat">
      <div class="v2-agent-chat-header">
        <span class="v2-strong">${agentName}</span>
      </div>
      <div class="v2-agent-chat-messages">
        <div class="v2-muted" style="text-align: center; font-size: var(--v2-text-xs); padding: var(--v2-space-8);">
          Start a conversation with your agent.
        </div>
      </div>
      <div class="v2-agent-chat-footer">
        <div class="v2-row" style="gap: var(--v2-space-2); flex: 1;">
          <input class="v2-input" style="flex: 1; height: 34px;" placeholder="Send a message..." />
          <button class="v2-icon-btn" style="flex-shrink: 0;">
            <svg viewBox="0 0 24 24"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        <div class="v2-row-between" style="margin-top: var(--v2-space-2);">
          <div></div>
          <button class="v2-btn v2-btn--ghost v2-btn--sm">
            <svg viewBox="0 0 24 24" style="width:12px;height:12px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            New session
          </button>
        </div>
      </div>
    </div>
  `;
}

// ─── Main render ─────────────────────────────────────────────────────

export function renderAgentDetail(props: AgentDetailProps) {
  const agents = props.agentsList?.agents ?? [];
  const agent = agents.find((a) => a.id === props.agentId);
  const agentName = (agent as any)?.identity?.name || "Test Agent";

  return html`
    <div class="v2-agent-detail">
      <div class="v2-agent-detail-left">
        ${renderDetailHeader(props)}
        ${renderDetailTabs(props.activeTab, props.onTabChange)}

        <div class="v2-agent-detail-content">
          ${props.activeTab === "settings" ? renderSettingsTab(props.onModalChange) : nothing}
          ${props.activeTab === "skills" ? renderSkillsTab() : nothing}
          ${props.activeTab === "run-history" ? renderRunHistoryTab() : nothing}
        </div>
      </div>
      <div class="v2-agent-detail-right">
        ${renderChatPanel(agentName, props.chatProps)}
      </div>

      <!-- Modals -->
      ${props.activeModal === "schedule"
        ? renderScheduleTemplatesModal({
            onSelectTemplate: () => props.onModalChange(null),
            onStartFromScratch: () => props.onModalChange(null),
            onClose: () => props.onModalChange(null),
          })
        : nothing}

      ${props.activeModal === "tools"
        ? renderManageToolsModal({
            connections: [{ name: "Gmail", adapter: "gmail", enabled: true }],
            onToggle: () => {},
            onSave: () => props.onModalChange(null),
            onClose: () => props.onModalChange(null),
          })
        : nothing}

      ${props.activeModal === "guardrails"
        ? renderEditGuardrailsModal({
            actionPolicy: "full",
            budget: "5",
            maxSteps: "100",
            onPolicyChange: () => {},
            onBudgetChange: () => {},
            onMaxStepsChange: () => {},
            onSave: () => props.onModalChange(null),
            onClose: () => props.onModalChange(null),
          })
        : nothing}

      ${props.activeModal === "memory"
        ? renderManageMemoryModal({
            mode: "persistent",
            onModeChange: () => {},
            onSave: () => props.onModalChange(null),
            onClose: () => props.onModalChange(null),
          })
        : nothing}
    </div>
  `;
}
