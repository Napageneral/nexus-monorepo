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
    <div class="console-agent-header">
      <div class="console-row" style="gap: var(--console-space-3);">
        <button class="console-icon-btn" @click=${props.onBack} title="Back to agents">
          <svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div>
          <div class="console-agent-header-name">${name}</div>
          <div class="console-agent-header-meta">Created less than a minute ago</div>
        </div>
      </div>
      <div class="console-row" style="gap: var(--console-space-2);">
        <button class="console-btn console-btn--secondary console-btn--sm">Dupe</button>
        <span class="console-badge console-badge--success">Active</span>
        <button class="console-btn console-btn--secondary console-btn--sm">Pause</button>
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
    <div class="console-agent-tabs">
      ${tabs.map((t) => html`
        <button
          class="console-agent-tab ${activeTab === t.key ? "console-agent-tab--active" : ""}"
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
    <div class="console-agent-section">
      <div class="console-agent-section-label">Triggers</div>
      <div class="console-card">
        <div class="console-empty" style="padding: var(--console-space-5);">
          <div class="console-muted" style="font-size: var(--console-text-xs); margin-bottom: var(--console-space-3);">No triggers configured</div>
          <div class="console-row" style="gap: var(--console-space-2);">
            <button class="console-btn console-btn--secondary console-btn--sm" @click=${() => onModalChange("schedule")}>
              <svg viewBox="0 0 24 24" style="width:12px;height:12px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Add schedule
            </button>
            <button class="console-btn console-btn--secondary console-btn--sm">
              <svg viewBox="0 0 24 24" style="width:12px;height:12px;"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/></svg>
              Add event trigger
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- TOOLS -->
    <div class="console-agent-section">
      <div class="console-row-between">
        <div class="console-agent-section-label">Tools</div>
        <button class="console-btn console-btn--ghost console-btn--sm console-gold-text" @click=${() => onModalChange("tools")}>Manage</button>
      </div>
      <div class="console-card" style="padding: var(--console-space-3) var(--console-space-4);">
        <div class="console-row">
          <div class="console-table-platform-icon">${icons.plug}</div>
          <span>1 connection</span>
        </div>
      </div>
    </div>

    <!-- GUARDRAILS -->
    <div class="console-agent-section">
      <div class="console-row-between">
        <div class="console-agent-section-label">Guardrails</div>
        <button class="console-btn console-btn--ghost console-btn--sm console-gold-text" @click=${() => onModalChange("guardrails")}>Edit</button>
      </div>
      <div class="console-card" style="padding: var(--console-space-3) var(--console-space-4);">
        <div class="console-row" style="gap: var(--console-space-3);">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:var(--console-text-muted);fill:none;stroke-width:2;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
          <span>Full access</span>
          <span class="console-faint">|</span>
          <span>$5/conversation</span>
          <span class="console-faint">|</span>
          <span>100 steps</span>
        </div>
      </div>
    </div>

    <!-- MEMORY -->
    <div class="console-agent-section">
      <div class="console-row-between">
        <div class="console-agent-section-label">Memory</div>
        <button class="console-btn console-btn--ghost console-btn--sm console-gold-text" @click=${() => onModalChange("memory")}>Manage</button>
      </div>
      <div class="console-card" style="padding: var(--console-space-3) var(--console-space-4);">
        <span>Persistent</span>
      </div>
    </div>

    <!-- STORED MEMORIES -->
    <div class="console-agent-section">
      <div class="console-row-between">
        <div class="console-agent-section-label">Stored Memories</div>
        <button class="console-btn console-btn--ghost console-btn--sm console-gold-text">Refresh</button>
      </div>
      <div class="console-card" style="padding: var(--console-space-3) var(--console-space-4);">
        <span class="console-muted" style="font-size: var(--console-text-xs);">No memories yet. This agent will save important facts after conversations.</span>
      </div>
    </div>

    <!-- CHANNELS -->
    <div class="console-agent-section">
      <div class="console-agent-section-label">Channels</div>

      <div class="console-card console-agent-channel-card">
        <div class="console-row-between">
          <div class="console-row" style="gap: var(--console-space-3);">
            <div class="console-agent-channel-icon" style="background: #0088cc;">T</div>
            <div>
              <div class="console-strong">Telegram</div>
              <div class="console-muted" style="font-size: var(--console-text-2xs);">4 /281</div>
            </div>
          </div>
          <button class="console-btn console-btn--primary console-btn--sm">Connect</button>
        </div>
      </div>

      <div class="console-card console-agent-channel-card">
        <div class="console-row-between">
          <div class="console-row" style="gap: var(--console-space-3);">
            <div class="console-agent-channel-icon" style="background: #4A154B;">S</div>
            <div>
              <div class="console-strong">Slack</div>
              <div class="console-muted" style="font-size: var(--console-text-2xs);">0 /0</div>
            </div>
          </div>
          <button class="console-btn console-btn--primary console-btn--sm">Connect</button>
        </div>
      </div>

      <div class="console-card console-agent-channel-card">
        <div class="console-row-between">
          <div class="console-row" style="gap: var(--console-space-3);">
            <div class="console-agent-channel-icon" style="background: #25D366;">W</div>
            <div>
              <div class="console-strong">WhatsApp</div>
              <div class="console-muted" style="font-size: var(--console-text-2xs);">Coming soon...</div>
            </div>
          </div>
          <button class="console-btn console-btn--secondary console-btn--sm">Configure</button>
        </div>
      </div>
    </div>

    <!-- PERSONA & INFO -->
    <div class="console-agent-section">
      <div class="console-agent-section-label">Persona & Info</div>

      <div class="console-card" style="margin-bottom: var(--console-space-3);">
        <div class="console-row-between" style="margin-bottom: var(--console-space-2);">
          <span class="console-label--upper" style="margin: 0;">CLAUDE.MD</span>
          <button class="console-btn console-btn--ghost console-btn--sm console-gold-text">Refresh</button>
        </div>
        <span class="console-muted" style="font-size: var(--console-text-xs);">No claude.md yet. Start chatting with the agent and it will be created automatically.</span>
      </div>

      <div class="console-card" style="padding: var(--console-space-3) var(--console-space-4);">
        <div class="console-review-row"><span class="console-muted">Model</span><span class="console-row" style="gap: 4px;"><span class="console-strong">Opus</span><button class="console-btn console-btn--ghost console-btn--sm console-gold-text" style="padding: 0;">Open</button></span></div>
        <div class="console-review-row"><span class="console-muted">Environment</span><span class="console-mono">b14a5de0-d669-4f...</span></div>
        <div class="console-review-row"><span class="console-muted">Environment</span><span class="console-strong">Live</span></div>
        <div class="console-review-row"><span class="console-muted">Version</span><span class="console-strong">100</span></div>
      </div>
    </div>
  `;
}

// ─── Skills tab ──────────────────────────────────────────────────────

function renderSkillsTab() {
  return html`
    <div class="console-card">
      <div class="console-empty">
        <div class="console-empty-icon">
          <svg viewBox="0 0 24 24" style="width:48px;height:48px;stroke:var(--console-text-faint);fill:none;stroke-width:1.5;"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
        </div>
        <div class="console-empty-title">No skills attached</div>
        <div class="console-empty-description">Skills give your agent reusable playbooks for multi-step automations. Add a prebuilt skill or create your own.</div>
        <button class="console-btn console-btn--primary">+ Add your first skill</button>
      </div>
    </div>
  `;
}

// ─── Run History tab ─────────────────────────────────────────────────

function renderRunHistoryTab() {
  return html`
    <div class="console-grid-3" style="margin-bottom: var(--console-space-5);">
      <div class="console-card">
        <div class="console-card-title" style="font-size: var(--console-text-xs);">Test AI</div>
        <div class="console-row" style="margin-top: 4px; gap: var(--console-space-3);">
          <span style="font-size: var(--console-text-xs);"><span class="console-strong">0</span> <span class="console-muted">Succeeded</span></span>
          <span style="font-size: var(--console-text-xs);"><span class="console-strong">0</span> <span class="console-muted">Failure</span></span>
        </div>
      </div>
      <div class="console-card">
        <div class="console-card-title" style="font-size: var(--console-text-xs);">Last Job</div>
        <div class="console-row" style="margin-top: 4px; gap: var(--console-space-3);">
          <span style="font-size: var(--console-text-xs);"><span class="console-strong">0</span> <span class="console-muted">Succeeded</span></span>
          <span style="font-size: var(--console-text-xs);"><span class="console-strong">0</span> <span class="console-muted">Muted</span></span>
        </div>
      </div>
      <div class="console-card">
        <div class="console-card-title" style="font-size: var(--console-text-xs);">Test AI</div>
        <div class="console-row" style="margin-top: 4px; gap: var(--console-space-3);">
          <span style="font-size: var(--console-text-xs);"><span class="console-strong">0</span> <span class="console-muted">Succeeded</span></span>
          <span style="font-size: var(--console-text-xs);"><span class="console-strong">0</span> <span class="console-muted">Failure</span></span>
        </div>
      </div>
    </div>

    <div class="console-agent-section-label">Run History</div>
    <div class="console-card">
      <div class="console-empty" style="padding: var(--console-space-6);">
        <div class="console-empty-icon">
          <svg viewBox="0 0 24 24" style="width:32px;height:32px;stroke:var(--console-text-faint);fill:none;stroke-width:1.5;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="console-empty-title">No runs yet</div>
        <div class="console-empty-description">Runs will appear here once a schedule triggers or an automated flow executes. You can also use "Run now" to test.</div>
      </div>
    </div>
  `;
}

// ─── Chat panel (right side) ─────────────────────────────────────────

function renderChatPanel(agentName: string, chatProps: ChatProps | null) {
  // If we have real chat props, use the existing chat renderer
  if (chatProps) {
    return html`
      <div class="console-agent-chat console-agent-chat--real">
        ${renderChat({ ...chatProps, focusMode: false })}
      </div>
    `;
  }

  // Fallback: placeholder chat UI
  return html`
    <div class="console-agent-chat">
      <div class="console-agent-chat-header">
        <span class="console-strong">${agentName}</span>
      </div>
      <div class="console-agent-chat-messages">
        <div class="console-muted" style="text-align: center; font-size: var(--console-text-xs); padding: var(--console-space-8);">
          Start a conversation with your agent.
        </div>
      </div>
      <div class="console-agent-chat-footer">
        <div class="console-row" style="gap: var(--console-space-2); flex: 1;">
          <input class="console-input" style="flex: 1; height: 34px;" placeholder="Send a message..." />
          <button class="console-icon-btn" style="flex-shrink: 0;">
            <svg viewBox="0 0 24 24"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        <div class="console-row-between" style="margin-top: var(--console-space-2);">
          <div></div>
          <button class="console-btn console-btn--ghost console-btn--sm">
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
    <div class="console-agent-detail">
      <div class="console-agent-detail-left">
        ${renderDetailHeader(props)}
        ${renderDetailTabs(props.activeTab, props.onTabChange)}

        <div class="console-agent-detail-content">
          ${props.activeTab === "settings" ? renderSettingsTab(props.onModalChange) : nothing}
          ${props.activeTab === "skills" ? renderSkillsTab() : nothing}
          ${props.activeTab === "run-history" ? renderRunHistoryTab() : nothing}
        </div>
      </div>
      <div class="console-agent-detail-right">
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
