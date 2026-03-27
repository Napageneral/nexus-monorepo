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
    <div class="v2-dropdown" @click=${(e: Event) => e.stopPropagation()}>
      <div class="v2-user-menu-info">
        <div class="v2-user-menu-name">${props.name}</div>
        <div class="v2-user-menu-email">${props.email}</div>
        <div class="v2-user-menu-plan">
          <span class="v2-badge v2-badge--neutral">${props.plan}</span>
        </div>
      </div>
      <div class="v2-dropdown-sep"></div>
      <button class="v2-dropdown-item" @click=${props.onProfile}>
        Profile
      </button>
      <button class="v2-dropdown-item">
        Settings
      </button>
      <div class="v2-dropdown-sep"></div>
      <button class="v2-dropdown-item" @click=${props.onLogout}>
        Log out
      </button>
    </div>
  `;
}

// ─── Workspace Switcher ──────────────────────────────────────────────

export function renderWorkspaceSwitcher(props: WorkspaceSwitcherProps) {
  if (!props.open) return nothing;

  return html`
    <div class="v2-dropdown" @click=${(e: Event) => e.stopPropagation()}>
      <button class="v2-dropdown-item v2-dropdown-item--active">
        <span style="display:flex;align-items:center;gap:8px;">
          ${props.currentWorkspace}
          <span style="color:var(--v2-success);display:flex;">${icons.check}</span>
        </span>
      </button>
      <div class="v2-dropdown-sep"></div>
      <button class="v2-dropdown-item" @click=${props.onCreateOrg}>
        Create organization
      </button>
    </div>
  `;
}

// ─── Provisioning Sequence ───────────────────────────────────────────

function renderStepIcon(status: ProvisioningStep["status"]) {
  if (status === "done") {
    return html`
      <span class="v2-provisioning-step-icon" style="color:var(--v2-success);">
        ${icons.check}
      </span>
    `;
  }
  if (status === "active") {
    return html`<span class="v2-provisioning-step-icon"></span>`;
  }
  // pending
  return html`
    <span class="v2-provisioning-step-icon" style="color:var(--v2-text-faint);">
      ${icons.circle}
    </span>
  `;
}

export function renderProvisioningSequence(props: ProvisioningSequenceProps) {
  if (props.allDone) {
    return html`
      <div class="v2-provisioning">
        <div class="v2-provisioning-done-icon">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        <div class="v2-provisioning-title">${props.agentName} is ready</div>
        <div class="v2-provisioning-subtitle">Your agent is live. Try sending a message.</div>
        <button
          class="v2-btn v2-btn--lg"
          style="background:#fff;color:#000;border-color:#fff;"
          @click=${props.onStartChatting}
        >
          Start chatting &rarr;
        </button>
      </div>
    `;
  }

  return html`
    <div class="v2-provisioning">
      <div class="v2-provisioning-spinner"></div>
      <div class="v2-provisioning-title">Setting up ${props.agentName}</div>
      <div class="v2-provisioning-steps">
        ${props.steps.map(
          (step) => html`
            <div class="v2-provisioning-step v2-provisioning-step--${step.status}">
              ${renderStepIcon(step.status)}
              <span>${step.label}</span>
            </div>
          `
        )}
      </div>
    </div>
  `;
}
