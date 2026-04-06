import { html, nothing } from "lit";
import { icons } from "../../ui/icons.ts";

// ─── Types ───────────────────────────────────────────────────────────

export type UserMenuDropdownProps = {
  open: boolean;
  name: string;
  email: string;
  plan: string;
  onClose: () => void;
  onProfile: () => void;
  onLogout: () => void;
};

export type WorkspaceSwitcherProps = {
  open: boolean;
  currentWorkspace: string;
  onClose: () => void;
  onCreateOrg: () => void;
};

export type ProvisioningStep = {
  label: string;
  status: "pending" | "active" | "done";
};

export type ProvisioningSequenceProps = {
  agentName: string;
  steps: ProvisioningStep[];
  allDone: boolean;
  onStartChatting: () => void;
};

// ─── User Menu Dropdown ──────────────────────────────────────────────

export function renderUserMenuDropdown(props: UserMenuDropdownProps) {
  if (!props.open) return nothing;

  return html`
    <div class="console-dropdown" @click=${(e: Event) => e.stopPropagation()}>
      <div class="console-user-menu-info">
        <div class="console-user-menu-name">${props.name}</div>
        <div class="console-user-menu-email">${props.email}</div>
        <div class="console-user-menu-plan">
          <span class="console-badge console-badge--neutral">${props.plan}</span>
        </div>
      </div>
      <div class="console-dropdown-sep"></div>
      <button class="console-dropdown-item" @click=${props.onProfile}>
        Profile
      </button>
      <button class="console-dropdown-item">
        Settings
      </button>
      <div class="console-dropdown-sep"></div>
      <button class="console-dropdown-item" @click=${props.onLogout}>
        Log out
      </button>
    </div>
  `;
}

// ─── Workspace Switcher ──────────────────────────────────────────────

export function renderWorkspaceSwitcher(props: WorkspaceSwitcherProps) {
  if (!props.open) return nothing;

  return html`
    <div class="console-dropdown" @click=${(e: Event) => e.stopPropagation()}>
      <button class="console-dropdown-item console-dropdown-item--active">
        <span style="display:flex;align-items:center;gap:8px;">
          ${props.currentWorkspace}
          <span style="color:var(--console-success);display:flex;">${icons.check}</span>
        </span>
      </button>
      <div class="console-dropdown-sep"></div>
      <button class="console-dropdown-item" @click=${props.onCreateOrg}>
        Create organization
      </button>
    </div>
  `;
}

// ─── Provisioning Sequence ───────────────────────────────────────────

function renderStepIcon(status: ProvisioningStep["status"]) {
  if (status === "done") {
    return html`
      <span class="console-provisioning-step-icon" style="color:var(--console-success);">
        ${icons.check}
      </span>
    `;
  }
  if (status === "active") {
    return html`<span class="console-provisioning-step-icon"></span>`;
  }
  // pending
  return html`
    <span class="console-provisioning-step-icon" style="color:var(--console-text-faint);">
      ${icons.circle}
    </span>
  `;
}

export function renderProvisioningSequence(props: ProvisioningSequenceProps) {
  if (props.allDone) {
    return html`
      <div class="console-provisioning">
        <div class="console-provisioning-done-icon">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        <div class="console-provisioning-title">${props.agentName} is ready</div>
        <div class="console-provisioning-subtitle">Your agent is live. Try sending a message.</div>
        <button
          class="console-btn console-btn--lg"
          style="background:#fff;color:#000;border-color:#fff;"
          @click=${props.onStartChatting}
        >
          Start chatting &rarr;
        </button>
      </div>
    `;
  }

  return html`
    <div class="console-provisioning">
      <div class="console-provisioning-spinner"></div>
      <div class="console-provisioning-title">Setting up ${props.agentName}</div>
      <div class="console-provisioning-steps">
        ${props.steps.map(
          (step) => html`
            <div class="console-provisioning-step console-provisioning-step--${step.status}">
              ${renderStepIcon(step.status)}
              <span>${step.label}</span>
            </div>
          `
        )}
      </div>
    </div>
  `;
}
