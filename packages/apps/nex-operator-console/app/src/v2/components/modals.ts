import { html, nothing } from "lit";
import { icons } from "../../ui/icons.ts";

// ─── Helpers ─────────────────────────────────────────────────────────

function stopPropagation(e: Event) {
  e.stopPropagation();
}

function renderCheckboxRow(
  eventId: string,
  label: string,
  description: string,
  checked: boolean,
  onToggle: (e: string) => void,
) {
  return html`
    <div class="v2-card" style="padding: 10px 14px; margin-bottom: 6px; cursor: pointer;" @click=${() => onToggle(eventId)}>
      <div class="v2-row" style="gap: 10px;">
        <div style="width: 18px; height: 18px; border-radius: 4px; border: 1.5px solid ${checked ? "var(--v2-accent)" : "var(--v2-border)"}; background: ${checked ? "var(--v2-accent)" : "transparent"}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          ${checked ? html`<svg viewBox="0 0 24 24" style="width:12px;height:12px;stroke:#000;fill:none;stroke-width:3;"><polyline points="20 6 9 17 4 12"/></svg>` : nothing}
        </div>
        <div class="v2-col" style="gap: 2px;">
          <span class="v2-strong" style="font-size: var(--v2-text-xs);">${label}</span>
          <span class="v2-faint" style="font-size: var(--v2-text-2xs);">${description}</span>
        </div>
      </div>
    </div>
  `;
}

// ─── 1. OAuth Connect Modal ─────────────────────────────────────────

export type OAuthConnectModalProps = {
  platform: string;
  onConnect: () => void;
  onClose: () => void;
};

export function renderOAuthConnectModal(props: OAuthConnectModalProps) {
  const initial = props.platform.charAt(0).toUpperCase();
  return html`
    <div class="v2-modal-backdrop" @click=${props.onClose}>
      <div class="v2-modal" @click=${stopPropagation}>
        <div class="v2-modal-body" style="padding-top: var(--v2-space-6); text-align: center;">
          <!-- Platform icon placeholder -->
          <div style="width: 56px; height: 56px; border-radius: 50%; background: var(--v2-accent); display: flex; align-items: center; justify-content: center; margin: 0 auto var(--v2-space-4); font-size: 24px; font-weight: 700; color: #000;">
            ${initial}
          </div>
          <div class="v2-modal-title" style="margin-bottom: var(--v2-space-1);">Connect your ${props.platform} account</div>
          <div class="v2-modal-subtitle" style="margin-bottom: var(--v2-space-5);">Authorize nexus to access your ${props.platform} account securely.</div>

          <!-- Benefit rows -->
          <div class="v2-col" style="gap: var(--v2-space-3); text-align: left; margin-bottom: var(--v2-space-5);">
            <div class="v2-row" style="gap: var(--v2-space-3);">
              <span style="width: 20px; height: 20px; flex-shrink: 0; stroke: currentColor; fill: none; stroke-width: 2; color: var(--v2-accent);">${icons.zap}</span>
              <span class="v2-strong" style="font-size: var(--v2-text-sm);">Authenticate instantly</span>
            </div>
            <div class="v2-row" style="gap: var(--v2-space-3);">
              <span style="width: 20px; height: 20px; flex-shrink: 0; stroke: currentColor; fill: none; stroke-width: 2; color: var(--v2-accent);">
                <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
              </span>
              <span class="v2-strong" style="font-size: var(--v2-text-sm);">Always connected</span>
            </div>
            <div class="v2-row" style="gap: var(--v2-space-3);">
              <span style="width: 20px; height: 20px; flex-shrink: 0; stroke: currentColor; fill: none; stroke-width: 2; color: var(--v2-accent);">${icons.shield}</span>
              <span class="v2-strong" style="font-size: var(--v2-text-sm);">Enterprise security</span>
            </div>
          </div>

          <button class="v2-btn v2-btn--primary" style="width: 100%;" @click=${props.onConnect}>Connect</button>

          <div class="v2-faint" style="font-size: var(--v2-text-2xs); margin-top: var(--v2-space-3); padding-bottom: var(--v2-space-2);">
            <span style="width: 12px; height: 12px; display: inline-block; vertical-align: middle; stroke: currentColor; fill: none; stroke-width: 2;">${icons.shield}</span>
            Secured by nexus
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── 2. OAuth Success Modal ─────────────────────────────────────────

export type OAuthSuccessModalProps = {
  onClose: () => void;
};

export function renderOAuthSuccessModal(props: OAuthSuccessModalProps) {
  return html`
    <div class="v2-modal-backdrop" @click=${props.onClose}>
      <div class="v2-modal" @click=${stopPropagation}>
        <div class="v2-modal-body" style="padding-top: var(--v2-space-6); text-align: center;">
          <!-- Green checkmark circle -->
          <div style="width: 56px; height: 56px; border-radius: 50%; background: #22c55e; display: flex; align-items: center; justify-content: center; margin: 0 auto var(--v2-space-4);">
            <svg viewBox="0 0 24 24" style="width:28px;height:28px;stroke:#fff;fill:none;stroke-width:2.5;"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="v2-modal-title" style="margin-bottom: var(--v2-space-1);">Connected successfully!</div>
          <div class="v2-modal-subtitle" style="margin-bottom: var(--v2-space-5);">Your integration is ready to use.</div>

          <button class="v2-btn v2-btn--primary" style="width: 100%;" @click=${props.onClose}>Close</button>

          <div class="v2-faint" style="font-size: var(--v2-text-2xs); margin-top: var(--v2-space-3); padding-bottom: var(--v2-space-2);">
            <span style="width: 12px; height: 12px; display: inline-block; vertical-align: middle; stroke: currentColor; fill: none; stroke-width: 2;">${icons.shield}</span>
            Secured by nexus
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── 3. Schedule Templates Modal ────────────────────────────────────

export type ScheduleTemplatesModalProps = {
  onSelectTemplate: (id: string) => void;
  onStartFromScratch: () => void;
  onClose: () => void;
};

const SCHEDULE_TEMPLATES = [
  { id: "morning-inbox", icon: "messageSquare", title: "Morning inbox summary", schedule: "Every day at 8am" },
  { id: "weekly-email", icon: "fileText", title: "Weekly email digest", schedule: "Every Monday at 9am" },
  { id: "daily-summary", icon: "barChart", title: "Daily Summary", schedule: "Every day at 8pm" },
  { id: "hourly-monitor", icon: "monitor", title: "Hourly Monitor", schedule: "Every hour" },
  { id: "weekday-standup", icon: "users", title: "Weekday Standup", schedule: "Weekdays at 9am" },
  { id: "weekly-digest", icon: "scrollText", title: "Weekly Digest", schedule: "Every Monday at 9am" },
  { id: "nightly-cleanup", icon: "settings", title: "Nightly Cleanup", schedule: "Every day at midnight" },
  { id: "alert-check", icon: "zap", title: "Alert Check", schedule: "Every 15 min during business hours" },
] as const;

export function renderScheduleTemplatesModal(props: ScheduleTemplatesModalProps) {
  return html`
    <div class="v2-modal-backdrop" @click=${props.onClose}>
      <div class="v2-modal v2-modal--lg" @click=${stopPropagation}>
        <div class="v2-modal-header">
          <div>
            <div class="v2-modal-title">New Schedule</div>
            <div class="v2-modal-subtitle">Pick a template or start from scratch</div>
          </div>
          <button class="v2-btn v2-btn--ghost" style="padding: 4px;" @click=${props.onClose}>${icons.x}</button>
        </div>
        <div class="v2-modal-body">
          <div class="v2-grid-2" style="gap: var(--v2-space-2);">
            ${SCHEDULE_TEMPLATES.map((t) => html`
              <div class="v2-card v2-card--interactive" style="padding: var(--v2-space-3); cursor: pointer;"
                @click=${() => props.onSelectTemplate(t.id)}>
                <div class="v2-row" style="gap: var(--v2-space-2); margin-bottom: 4px;">
                  <span style="width: 16px; height: 16px; flex-shrink: 0; stroke: currentColor; fill: none; stroke-width: 2; color: var(--v2-accent);">
                    ${icons[t.icon as keyof typeof icons]}
                  </span>
                  <span class="v2-strong" style="font-size: var(--v2-text-sm);">${t.title}</span>
                </div>
                <div class="v2-faint" style="font-size: var(--v2-text-2xs); padding-left: 24px;">${t.schedule}</div>
              </div>
            `)}
          </div>
        </div>
        <div class="v2-modal-footer" style="justify-content: center;">
          <button class="v2-btn v2-btn--ghost" @click=${props.onStartFromScratch}>Start from scratch</button>
        </div>
      </div>
    </div>
  `;
}

// ─── 4. Manage Tools Modal ──────────────────────────────────────────

export type ManageToolsModalProps = {
  connections: Array<{ name: string; adapter: string; enabled: boolean }>;
  onToggle: (adapter: string) => void;
  onSave: () => void;
  onClose: () => void;
};

export function renderManageToolsModal(props: ManageToolsModalProps) {
  return html`
    <div class="v2-modal-backdrop" @click=${props.onClose}>
      <div class="v2-modal v2-modal--lg" @click=${stopPropagation}>
        <div class="v2-modal-header">
          <div>
            <div class="v2-modal-title">Manage Tools</div>
            <div class="v2-modal-subtitle">Configure connections, custom tools, and MCP servers.</div>
          </div>
          <button class="v2-btn v2-btn--ghost" style="padding: 4px;" @click=${props.onClose}>${icons.x}</button>
        </div>
        <div class="v2-modal-body">
          <!-- Connections Section -->
          <div class="v2-row-between" style="margin-bottom: var(--v2-space-2);">
            <span class="v2-section-label" style="margin: 0;">CONNECTIONS</span>
            <button class="v2-btn v2-btn--ghost v2-btn--sm">Unselect all</button>
          </div>
          <div class="v2-search-wrap" style="max-width: none; margin-bottom: var(--v2-space-3);">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input class="v2-search-input" style="max-width: none; width: 100%;" placeholder="Search connections..." />
          </div>
          <div class="v2-col" style="gap: 6px; margin-bottom: var(--v2-space-5);">
            ${props.connections.map((conn) => html`
              <div class="v2-card" style="padding: var(--v2-space-2) var(--v2-space-3);">
                <div class="v2-row-between">
                  <div class="v2-row" style="gap: var(--v2-space-2);">
                    <div class="v2-table-platform-icon">${icons.plug}</div>
                    <span class="v2-strong" style="font-size: var(--v2-text-sm);">${conn.name}</span>
                  </div>
                  <div class="v2-toggle ${conn.enabled ? "v2-toggle--on" : ""}"
                    @click=${() => props.onToggle(conn.adapter)}></div>
                </div>
              </div>
            `)}
          </div>

          <!-- Action Permissions Section -->
          <span class="v2-section-label">ACTION PERMISSIONS</span>
          <div class="v2-card" style="padding: var(--v2-space-3); margin-top: var(--v2-space-2);">
            <div class="v2-row-between">
              <span class="v2-muted" style="font-size: var(--v2-text-xs);">Per-action controls coming soon</span>
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          </div>
        </div>
        <div class="v2-modal-footer">
          <button class="v2-btn v2-btn--secondary" @click=${props.onClose}>Cancel</button>
          <button class="v2-btn v2-btn--primary" @click=${props.onSave}>Save</button>
        </div>
      </div>
    </div>
  `;
}

// ─── 5. Edit Guardrails Modal ───────────────────────────────────────

export type EditGuardrailsModalProps = {
  actionPolicy: string;
  budget: string;
  maxSteps: string;
  onPolicyChange: (p: string) => void;
  onBudgetChange: (b: string) => void;
  onMaxStepsChange: (m: string) => void;
  onSave: () => void;
  onClose: () => void;
};

const ACTION_POLICIES = [
  { id: "full", title: "Full access", desc: "Agent can read, write, and execute any available action." },
  { id: "read-write", title: "Read & write", desc: "Agent can read and write data but cannot execute destructive actions." },
  { id: "read-only", title: "Read only", desc: "Agent can only read data. No writes or side effects." },
] as const;

export function renderEditGuardrailsModal(props: EditGuardrailsModalProps) {
  return html`
    <div class="v2-modal-backdrop" @click=${props.onClose}>
      <div class="v2-modal" @click=${stopPropagation}>
        <div class="v2-modal-header">
          <div>
            <div class="v2-modal-title">Edit Guardrails</div>
            <div class="v2-modal-subtitle">Configure action policy, budget, and step limits.</div>
          </div>
          <button class="v2-btn v2-btn--ghost" style="padding: 4px;" @click=${props.onClose}>${icons.x}</button>
        </div>
        <div class="v2-modal-body">
          <!-- Action Policy -->
          <span class="v2-section-label">ACTION POLICY</span>
          <div class="v2-col" style="gap: var(--v2-space-2); margin-top: var(--v2-space-2); margin-bottom: var(--v2-space-5);">
            ${ACTION_POLICIES.map((p) => html`
              <div class="v2-selectable ${props.actionPolicy === p.id ? "v2-selectable--active" : ""}"
                @click=${() => props.onPolicyChange(p.id)}>
                <div class="v2-selectable-title">${p.title}</div>
                <div class="v2-selectable-desc">${p.desc}</div>
              </div>
            `)}
          </div>

          <!-- Budget -->
          <span class="v2-section-label">BUDGET / CONVERSATION</span>
          <div style="position: relative; margin-top: var(--v2-space-2); margin-bottom: var(--v2-space-4);">
            <span style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--v2-text-muted); font-size: var(--v2-text-sm);">$</span>
            <input class="v2-input" style="padding-left: 28px; width: 100%;"
              .value=${props.budget}
              @input=${(e: InputEvent) => props.onBudgetChange((e.target as HTMLInputElement).value)} />
          </div>

          <!-- Max Steps -->
          <span class="v2-section-label">MAX STEPS</span>
          <input class="v2-input" style="width: 100%; margin-top: var(--v2-space-2);"
            .value=${props.maxSteps}
            @input=${(e: InputEvent) => props.onMaxStepsChange((e.target as HTMLInputElement).value)} />
        </div>
        <div class="v2-modal-footer">
          <button class="v2-btn v2-btn--secondary" @click=${props.onClose}>Cancel</button>
          <button class="v2-btn v2-btn--primary" @click=${props.onSave}>Save</button>
        </div>
      </div>
    </div>
  `;
}

// ─── 6. Manage Memory Modal ─────────────────────────────────────────

export type ManageMemoryModalProps = {
  mode: "stateless" | "persistent";
  onModeChange: (m: string) => void;
  onSave: () => void;
  onClose: () => void;
};

export function renderManageMemoryModal(props: ManageMemoryModalProps) {
  return html`
    <div class="v2-modal-backdrop" @click=${props.onClose}>
      <div class="v2-modal" @click=${stopPropagation}>
        <div class="v2-modal-header">
          <div>
            <div class="v2-modal-title">Manage Memory</div>
            <div class="v2-modal-subtitle">Choose how the agent remembers conversations.</div>
          </div>
          <button class="v2-btn v2-btn--ghost" style="padding: 4px;" @click=${props.onClose}>${icons.x}</button>
        </div>
        <div class="v2-modal-body">
          <div class="v2-grid-2" style="gap: var(--v2-space-2);">
            <div class="v2-selectable ${props.mode === "stateless" ? "v2-selectable--active" : ""}"
              @click=${() => props.onModeChange("stateless")}>
              <div class="v2-selectable-title">Stateless</div>
              <div class="v2-selectable-desc">No memory between messages</div>
            </div>
            <div class="v2-selectable ${props.mode === "persistent" ? "v2-selectable--active" : ""}"
              @click=${() => props.onModeChange("persistent")}>
              <div class="v2-selectable-title">Persistent</div>
              <div class="v2-selectable-desc">Remembers across all conversations</div>
            </div>
          </div>
        </div>
        <div class="v2-modal-footer">
          <button class="v2-btn v2-btn--secondary" @click=${props.onClose}>Cancel</button>
          <button class="v2-btn v2-btn--primary" @click=${props.onSave}>Save</button>
        </div>
      </div>
    </div>
  `;
}

// ─── 7. Create Slack App Modal ──────────────────────────────────────

export type CreateSlackAppModalProps = {
  step: 1 | 2;
  botToken: string;
  onTokenChange: (t: string) => void;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
};

const SLACK_MANIFEST_YAML = `display_information:
  name: My Nex Agent
  description: Nex-powered Slack bot
  background_color: "#1a1a2e"
features:
  bot_user:
    display_name: nex-agent
    always_online: true
oauth_config:
  scopes:
    bot:
      - channels:history
      - channels:read
      - chat:write
      - users:read`;

export function renderCreateSlackAppModal(props: CreateSlackAppModalProps) {
  return html`
    <div class="v2-modal-backdrop" @click=${props.onClose}>
      <div class="v2-modal v2-modal--lg" @click=${stopPropagation}>
        <div class="v2-modal-header">
          <div>
            <div class="v2-modal-title">${props.step === 1 ? "Create Slack App" : "Bot Token"}</div>
            <div class="v2-modal-subtitle">${props.step === 1 ? "Follow the steps below to create your Slack app." : "Enter the bot token from your Slack app."}</div>
          </div>
          <button class="v2-btn v2-btn--ghost" style="padding: 4px;" @click=${props.onClose}>${icons.x}</button>
        </div>
        <div class="v2-modal-body">
          ${props.step === 1
            ? html`
                <div class="v2-col" style="gap: var(--v2-space-3);">
                  <div class="v2-row" style="gap: var(--v2-space-2);">
                    <span class="v2-badge v2-badge--neutral" style="width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: var(--v2-text-2xs); flex-shrink: 0;">1</span>
                    <span style="font-size: var(--v2-text-sm);">Go to <span class="v2-gold-text">api.slack.com/apps</span> and click <strong>Create New App</strong></span>
                  </div>
                  <div class="v2-row" style="gap: var(--v2-space-2);">
                    <span class="v2-badge v2-badge--neutral" style="width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: var(--v2-text-2xs); flex-shrink: 0;">2</span>
                    <span style="font-size: var(--v2-text-sm);">Choose <strong>From an app manifest</strong></span>
                  </div>
                  <div class="v2-row" style="gap: var(--v2-space-2);">
                    <span class="v2-badge v2-badge--neutral" style="width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: var(--v2-text-2xs); flex-shrink: 0;">3</span>
                    <span style="font-size: var(--v2-text-sm);">Select your workspace and paste this manifest:</span>
                  </div>
                  <pre style="background: #0d0d14; border: 1px solid var(--v2-border); border-radius: var(--v2-radius-md); padding: var(--v2-space-3); font-family: 'SF Mono', 'Fira Code', monospace; font-size: var(--v2-text-2xs); color: var(--v2-text-muted); overflow-x: auto; white-space: pre; line-height: 1.6; margin: 0;">${SLACK_MANIFEST_YAML}</pre>
                  <div class="v2-row" style="gap: var(--v2-space-2);">
                    <span class="v2-badge v2-badge--neutral" style="width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: var(--v2-text-2xs); flex-shrink: 0;">4</span>
                    <span style="font-size: var(--v2-text-sm);">Click <strong>Create</strong> and proceed to install</span>
                  </div>
                </div>
                <div class="v2-faint" style="text-align: center; font-size: var(--v2-text-2xs); margin-top: var(--v2-space-4);">Step 1 of 3</div>
              `
            : html`
                <div class="v2-col" style="gap: var(--v2-space-3);">
                  <div style="font-size: var(--v2-text-sm); color: var(--v2-text-muted);">
                    Go to <strong>OAuth & Permissions</strong> in your Slack app settings and copy the <strong>Bot User OAuth Token</strong>.
                  </div>
                  <div class="v2-col" style="gap: 6px;">
                    <label class="v2-label">Bot Token</label>
                    <input class="v2-input" placeholder="xoxb-..."
                      .value=${props.botToken}
                      @input=${(e: InputEvent) => props.onTokenChange((e.target as HTMLInputElement).value)} />
                    <div class="v2-helper">Starts with xoxb-</div>
                  </div>
                </div>
                <div class="v2-faint" style="text-align: center; font-size: var(--v2-text-2xs); margin-top: var(--v2-space-4);">Step 2 of 3</div>
              `
          }
        </div>
        <div class="v2-modal-footer">
          ${props.step === 1
            ? html`
                <button class="v2-btn v2-btn--secondary" @click=${props.onClose}>Cancel</button>
                <button class="v2-btn v2-btn--primary" @click=${props.onNext}>Next &rarr;</button>
              `
            : html`
                <button class="v2-btn v2-btn--secondary" @click=${props.onBack}>&larr; Back</button>
                <button class="v2-btn v2-btn--primary" @click=${props.onNext}>Next &rarr;</button>
              `
          }
        </div>
      </div>
    </div>
  `;
}

// ─── 8. Edit Skill Modal ────────────────────────────────────────────

export type EditSkillModalProps = {
  name: string;
  description: string;
  content: string;
  onDescriptionChange: (d: string) => void;
  onContentChange: (c: string) => void;
  onSave: () => void;
  onClose: () => void;
};

export function renderEditSkillModal(props: EditSkillModalProps) {
  return html`
    <div class="v2-modal-backdrop" @click=${props.onClose}>
      <div class="v2-modal v2-modal--lg" @click=${stopPropagation}>
        <div class="v2-modal-header">
          <div>
            <div class="v2-modal-title">Edit: ${props.name}</div>
          </div>
          <button class="v2-btn v2-btn--ghost" style="padding: 4px;" @click=${props.onClose}>${icons.x}</button>
        </div>
        <div class="v2-modal-body">
          <div class="v2-col" style="gap: 6px; margin-bottom: var(--v2-space-4);">
            <label class="v2-label">Description</label>
            <input class="v2-input" style="width: 100%;"
              .value=${props.description}
              @input=${(e: InputEvent) => props.onDescriptionChange((e.target as HTMLInputElement).value)} />
          </div>

          <div class="v2-col" style="gap: 6px;">
            <label class="v2-label">Skill content (Markdown)</label>
            <textarea class="v2-textarea" rows="16"
              style="font-family: 'SF Mono', 'Fira Code', monospace; font-size: var(--v2-text-xs); line-height: 1.6; resize: vertical;"
              .value=${props.content}
              @input=${(e: InputEvent) => props.onContentChange((e.target as HTMLTextAreaElement).value)}
            ></textarea>
          </div>
        </div>
        <div class="v2-modal-footer">
          <button class="v2-btn v2-btn--secondary" @click=${props.onClose}>Cancel</button>
          <button class="v2-btn v2-btn--primary" @click=${props.onSave}>Save changes</button>
        </div>
      </div>
    </div>
  `;
}

// ─── 9. Create Webhook Modal ────────────────────────────────────────

export type CreateWebhookModalProps = {
  url: string;
  secret: string;
  description: string;
  active: boolean;
  selectedEvents: Set<string>;
  onUrlChange: (u: string) => void;
  onSecretChange: (s: string) => void;
  onDescriptionChange: (d: string) => void;
  onActiveToggle: () => void;
  onEventToggle: (e: string) => void;
  onCreate: () => void;
  onClose: () => void;
};

const WEBHOOK_EVENTS = [
  { id: "passthrough.executed", label: "passthrough.executed", desc: "Fired when a passthrough request completes" },
  { id: "connection.created", label: "connection.created", desc: "Fired when a new connection is established" },
  { id: "connection.updated", label: "connection.updated", desc: "Fired when a connection is modified" },
  { id: "connection_config.created", label: "connection_config.created", desc: "Fired when a connection config is created" },
  { id: "invoice.updated", label: "invoice.updated", desc: "Fired when an invoice is updated" },
  { id: "checkout.retrieved", label: "checkout.retrieved", desc: "Fired when a checkout session is retrieved" },
] as const;

export function renderCreateWebhookModal(props: CreateWebhookModalProps) {
  return html`
    <div class="v2-modal-backdrop" @click=${props.onClose}>
      <div class="v2-modal v2-modal--lg" @click=${stopPropagation}>
        <div class="v2-modal-header">
          <div>
            <div class="v2-modal-title">Create webhook subscription</div>
            <div class="v2-modal-subtitle">Subscribe to real-time events and deliver them to your endpoint.</div>
          </div>
          <button class="v2-btn v2-btn--ghost" style="padding: 4px;" @click=${props.onClose}>${icons.x}</button>
        </div>
        <div class="v2-modal-body">
          <!-- Webhook URL -->
          <div class="v2-col" style="gap: 6px; margin-bottom: var(--v2-space-4);">
            <label class="v2-label">Webhook URL <span class="v2-gold-text">*</span></label>
            <input class="v2-input" style="width: 100%;" placeholder="https://example.com/webhooks"
              .value=${props.url}
              @input=${(e: InputEvent) => props.onUrlChange((e.target as HTMLInputElement).value)} />
          </div>

          <!-- Event Types -->
          <div class="v2-col" style="gap: 6px; margin-bottom: var(--v2-space-4);">
            <label class="v2-label">Event types</label>
            <div class="v2-col" style="gap: 0;">
              ${WEBHOOK_EVENTS.map((ev) =>
                renderCheckboxRow(
                  ev.id,
                  ev.label,
                  ev.desc,
                  props.selectedEvents.has(ev.id),
                  props.onEventToggle,
                ),
              )}
            </div>
          </div>

          <!-- Secret -->
          <div class="v2-col" style="gap: 6px; margin-bottom: var(--v2-space-4);">
            <label class="v2-label">Webhook secret <span class="v2-faint">(optional)</span></label>
            <input class="v2-input" style="width: 100%;" placeholder="whsec_..."
              .value=${props.secret}
              @input=${(e: InputEvent) => props.onSecretChange((e.target as HTMLInputElement).value)} />
          </div>

          <!-- Description -->
          <div class="v2-col" style="gap: 6px; margin-bottom: var(--v2-space-4);">
            <label class="v2-label">Description <span class="v2-faint">(optional)</span></label>
            <input class="v2-input" style="width: 100%;" placeholder="Production webhook for..."
              .value=${props.description}
              @input=${(e: InputEvent) => props.onDescriptionChange((e.target as HTMLInputElement).value)} />
          </div>

          <!-- Active toggle -->
          <div class="v2-row-between" style="margin-bottom: var(--v2-space-2);">
            <div class="v2-col" style="gap: 2px;">
              <span class="v2-strong" style="font-size: var(--v2-text-sm);">Active</span>
              <span class="v2-helper" style="margin: 0;">Webhook will start receiving events immediately.</span>
            </div>
            <div class="v2-toggle ${props.active ? "v2-toggle--on" : ""}"
              @click=${props.onActiveToggle}></div>
          </div>
        </div>
        <div class="v2-modal-footer">
          <button class="v2-btn v2-btn--secondary" @click=${props.onClose}>Cancel</button>
          <button class="v2-btn v2-btn--primary" ?disabled=${!props.url.trim()} @click=${props.onCreate}>Create webhook</button>
        </div>
      </div>
    </div>
  `;
}

// ─── 10. Create API Key Modal ───────────────────────────────────────

export type CreateApiKeyModalProps = {
  keyName: string;
  onNameChange: (n: string) => void;
  onCreate: () => void;
  onClose: () => void;
};

export function renderCreateApiKeyModal(props: CreateApiKeyModalProps) {
  return html`
    <div class="v2-modal-backdrop" @click=${props.onClose}>
      <div class="v2-modal" @click=${stopPropagation}>
        <div class="v2-modal-header">
          <div>
            <div class="v2-modal-title">Create a new API key</div>
          </div>
          <button class="v2-btn v2-btn--ghost" style="padding: 4px;" @click=${props.onClose}>${icons.x}</button>
        </div>
        <div class="v2-modal-body">
          <div class="v2-col" style="gap: 6px;">
            <label class="v2-label">Key name</label>
            <input class="v2-input ${props.keyName.length > 0 && !/^[a-z0-9-]+$/.test(props.keyName) ? "v2-input--invalid" : ""}"
              style="width: 100%;" placeholder="e.g. production-key"
              .value=${props.keyName}
              @input=${(e: InputEvent) => props.onNameChange((e.target as HTMLInputElement).value)} />
            ${props.keyName.length > 0 && !/^[a-z0-9-]+$/.test(props.keyName)
              ? html`<div class="v2-field-error">API key name must be lowercase, using only letters, numbers, and hyphens.</div>`
              : html`<div class="v2-helper">API key name cannot contain spaces or special characters. Use letters, numbers, and hyphens only.</div>`
            }
          </div>
        </div>
        <div class="v2-modal-footer">
          <button class="v2-btn v2-btn--secondary" @click=${props.onClose}>Cancel</button>
          <button class="v2-btn v2-btn--primary" ?disabled=${!props.keyName.trim()} @click=${props.onCreate}>Create</button>
        </div>
      </div>
    </div>
  `;
}
