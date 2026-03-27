import { html, nothing } from "lit";
import type { AdapterConnectionEntry } from "../../ui/controllers/integrations.ts";
import { icons } from "../../ui/icons.ts";

// ─── Wizard state ────────────────────────────────────────────────────

export type AgentCreateStep = 1 | 2 | 3 | 4;

export type AgentCreateForm = {
  name: string;
  description: string;
  model: "haiku" | "sonnet" | "opus";
  selectedApps: Set<string>;
  actionPolicy: "full" | "read-write" | "read-only";
  budget: string;
  maxSteps: string;
  memory: "stateless" | "persistent";
};

export type AgentCreateProps = {
  step: AgentCreateStep;
  form: AgentCreateForm;
  adapters: AdapterConnectionEntry[];
  onStepChange: (step: AgentCreateStep) => void;
  onFormChange: (patch: Partial<AgentCreateForm>) => void;
  onAppToggle: (adapter: string) => void;
  onCancel: () => void;
  onCreate: () => void;
};

// ─── Stepper ─────────────────────────────────────────────────────────

const STEPS = [
  { num: 1, label: "Basics" },
  { num: 2, label: "Apps" },
  { num: 3, label: "Guardrails" },
  { num: 4, label: "Review" },
] as const;

function renderStepper(currentStep: AgentCreateStep) {
  return html`
    <div class="v2-wizard-stepper">
      ${STEPS.map((s, i) => {
        const completed = s.num < currentStep;
        const active = s.num === currentStep;
        return html`
          ${i > 0 ? html`<div class="v2-wizard-stepper-line ${completed ? "v2-wizard-stepper-line--done" : ""}"></div>` : nothing}
          <div class="v2-wizard-stepper-step ${active ? "v2-wizard-stepper-step--active" : ""} ${completed ? "v2-wizard-stepper-step--done" : ""}">
            <div class="v2-wizard-stepper-num">
              ${completed
                ? html`<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:3;"><polyline points="20 6 9 17 4 12"/></svg>`
                : s.num}
            </div>
            <span class="v2-wizard-stepper-label">${s.label}</span>
          </div>
        `;
      })}
    </div>
  `;
}

// ─── Step 1: Basics ──────────────────────────────────────────────────

function renderStep1(props: AgentCreateProps) {
  const { form } = props;
  return html`
    <div class="v2-wizard-form">
      <div class="v2-col" style="gap: 6px; margin-bottom: var(--v2-space-5);">
        <label class="v2-label">Name <span class="v2-gold-text">*</span></label>
        <input class="v2-input ${form.name.length === 0 && (form as any)._touched ? "v2-input--invalid" : ""}"
          placeholder="e.g. Sales Assistant"
          .value=${form.name}
          @input=${(e: InputEvent) => { (form as any)._touched = true; props.onFormChange({ name: (e.target as HTMLInputElement).value }); }}
          @blur=${() => { (form as any)._touched = true; }}
          required />
        ${form.name.length === 0 && (form as any)._touched
          ? html`<div class="v2-field-error">Agent name is required</div>`
          : nothing}
      </div>

      <div class="v2-col" style="gap: 6px; margin-bottom: var(--v2-space-4);">
        <label class="v2-label">What should your agent do?</label>
        <textarea class="v2-textarea" rows="4"
          placeholder="e.g. Help customers with billing questions, research leads and add them to the CRM..."
          .value=${form.description}
          @input=${(e: InputEvent) => props.onFormChange({ description: (e.target as HTMLTextAreaElement).value })}
        ></textarea>
        <div class="v2-helper">This becomes your agent's initial persona in CLAUDE.md. You can edit it anytime from the settings.</div>
      </div>

      <div class="v2-col" style="gap: 6px; margin-bottom: var(--v2-space-5);">
        <label class="v2-label">Model <span class="v2-gold-text">*</span></label>
        <div class="v2-grid-3">
          ${(["haiku", "sonnet", "opus"] as const).map((m) => html`
            <div
              class="v2-selectable ${form.model === m ? "v2-selectable--active" : ""}"
              @click=${() => props.onFormChange({ model: m })}
            >
              <div class="v2-selectable-title">${m.charAt(0).toUpperCase() + m.slice(1)}</div>
              <div class="v2-selectable-desc">
                ${m === "haiku" ? "Fast and lightweight" : m === "sonnet" ? "Balanced performance" : "Most capable"}
              </div>
            </div>
          `)}
        </div>
      </div>
    </div>
  `;
}

// ─── Step 2: Apps ────────────────────────────────────────────────────

function renderStep2(props: AgentCreateProps) {
  const connected = props.adapters.filter((a) => a.status === "connected");
  return html`
    <div class="v2-wizard-form">
      <div class="v2-row-between" style="margin-bottom: var(--v2-space-3);">
        <label class="v2-label" style="margin-bottom: 0;">Connected platforms</label>
        <div class="v2-row" style="gap: var(--v2-space-2);">
          <button class="v2-btn v2-btn--ghost v2-btn--sm">Select all</button>
          <button class="v2-btn v2-btn--ghost v2-btn--sm">+ Add new app</button>
        </div>
      </div>
      <div class="v2-search-wrap" style="max-width: none; margin-bottom: var(--v2-space-3);">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input class="v2-search-input" style="max-width: none; width: 100%;" placeholder="Search connections..." />
      </div>
      ${connected.length === 0
        ? html`<div class="v2-muted" style="text-align: center; padding: var(--v2-space-6); font-size: var(--v2-text-xs);">No connected platforms yet. Add an app first.</div>`
        : connected.map((adapter) => html`
            <div class="v2-card v2-card--interactive" style="margin-bottom: var(--v2-space-2); padding: var(--v2-space-3) var(--v2-space-4);"
              @click=${() => props.onAppToggle(adapter.adapter)}>
              <div class="v2-row-between">
                <div class="v2-row">
                  <div class="v2-table-platform-icon">${icons.plug}</div>
                  <span class="v2-strong">${adapter.label || adapter.adapter}</span>
                </div>
                <div class="v2-toggle ${props.form.selectedApps.has(adapter.adapter) ? "v2-toggle--on" : ""}"></div>
              </div>
            </div>
          `)
      }
    </div>
  `;
}

// ─── Step 3: Guardrails ──────────────────────────────────────────────

function renderStep3(props: AgentCreateProps) {
  const { form } = props;
  return html`
    <div class="v2-wizard-form">
      <div style="margin-bottom: var(--v2-space-5);">
        <label class="v2-label">What can your agent do?</label>
        <div class="v2-helper" style="margin-bottom: var(--v2-space-3);">All actions are enabled by default. Deselect specific actions to restrict what the agent can do.</div>
        <!-- Placeholder for per-app action config -->
        <div class="v2-card" style="padding: var(--v2-space-3) var(--v2-space-4);">
          <div class="v2-row-between">
            <div class="v2-row">
              <div class="v2-table-platform-icon">${icons.plug}</div>
              <span class="v2-strong">All connections</span>
            </div>
            <span class="v2-muted" style="font-size: var(--v2-text-xs);">All actions</span>
          </div>
        </div>
      </div>

      <div class="v2-grid-2" style="margin-bottom: var(--v2-space-5);">
        <div class="v2-col" style="gap: 6px;">
          <label class="v2-label">Budget per conversation</label>
          <div style="position: relative;">
            <span style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--v2-text-muted); font-size: var(--v2-text-sm);">$</span>
            <input class="v2-input" style="padding-left: 28px;"
              .value=${form.budget}
              @input=${(e: InputEvent) => props.onFormChange({ budget: (e.target as HTMLInputElement).value })} />
          </div>
        </div>
        <div class="v2-col" style="gap: 6px;">
          <label class="v2-label">Max steps per task</label>
          <input class="v2-input"
            .value=${form.maxSteps}
            @input=${(e: InputEvent) => props.onFormChange({ maxSteps: (e.target as HTMLInputElement).value })} />
        </div>
      </div>

      <div style="margin-bottom: var(--v2-space-4);">
        <label class="v2-label">Memory</label>
        <div class="v2-grid-2">
          <div class="v2-selectable ${form.memory === "stateless" ? "v2-selectable--active" : ""}"
            @click=${() => props.onFormChange({ memory: "stateless" })}>
            <div class="v2-selectable-title">Stateless</div>
            <div class="v2-selectable-desc">No memory between messages</div>
          </div>
          <div class="v2-selectable ${form.memory === "persistent" ? "v2-selectable--active" : ""}"
            @click=${() => props.onFormChange({ memory: "persistent" })}>
            <div class="v2-selectable-title">Persistent</div>
            <div class="v2-selectable-desc">Remembers across all conversations</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── Step 4: Review ──────────────────────────────────────────────────

function renderStep4(props: AgentCreateProps) {
  const { form } = props;
  const modelLabel = form.model.charAt(0).toUpperCase() + form.model.slice(1);
  return html`
    <div class="v2-wizard-form">
      <div class="v2-muted" style="margin-bottom: var(--v2-space-5); font-size: var(--v2-text-sm);">
        Review your agent configuration before creating it.
      </div>
      <div class="v2-card" style="margin-bottom: var(--v2-space-3);">
        <div class="v2-section-label" style="margin-top: 0;">Basics</div>
        <div class="v2-review-row"><span class="v2-muted">Name</span><span class="v2-strong">${form.name || "—"}</span></div>
        <div class="v2-review-row"><span class="v2-muted">Model</span><span class="v2-strong">${modelLabel}</span></div>
      </div>
      <div class="v2-card" style="margin-bottom: var(--v2-space-3);">
        <div class="v2-section-label" style="margin-top: 0;">Tools</div>
        <div class="v2-review-row"><span class="v2-muted">Connections</span><span class="v2-strong">${form.selectedApps.size > 0 ? `${form.selectedApps.size} selected` : "All connections"}</span></div>
      </div>
      <div class="v2-card" style="margin-bottom: var(--v2-space-3);">
        <div class="v2-section-label" style="margin-top: 0;">Guardrails</div>
        <div class="v2-review-row"><span class="v2-muted">Action policy</span><span class="v2-strong">Full access</span></div>
        <div class="v2-review-row"><span class="v2-muted">Budget</span><span class="v2-strong">$${form.budget} / conversation</span></div>
        <div class="v2-review-row"><span class="v2-muted">Max steps</span><span class="v2-strong">${form.maxSteps}</span></div>
      </div>
      <div class="v2-card">
        <div class="v2-section-label" style="margin-top: 0;">Memory</div>
        <div class="v2-review-row"><span class="v2-muted">Mode</span><span class="v2-strong">${form.memory === "persistent" ? "Persistent" : "Stateless"}</span></div>
      </div>
    </div>
  `;
}

// ─── Footer ──────────────────────────────────────────────────────────

function canProceed(props: AgentCreateProps): boolean {
  if (props.step === 1) return props.form.name.trim().length > 0;
  return true;
}

function renderFooter(props: AgentCreateProps) {
  const isFirst = props.step === 1;
  const isLast = props.step === 4;
  const canNext = canProceed(props);
  return html`
    <div class="v2-wizard-footer">
      ${isFirst
        ? html`<button class="v2-btn v2-btn--ghost" @click=${props.onCancel}>&larr; Cancel</button>`
        : html`<button class="v2-btn v2-btn--ghost" @click=${() => props.onStepChange((props.step - 1) as AgentCreateStep)}>&larr; Back</button>`
      }
      ${isLast
        ? html`<button class="v2-btn v2-btn--primary" @click=${props.onCreate}>
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;"><polyline points="20 6 9 17 4 12"/></svg>
            Create agent
          </button>`
        : html`<button class="v2-btn v2-btn--primary" ?disabled=${!canNext} @click=${() => canNext && props.onStepChange((props.step + 1) as AgentCreateStep)}>Next &rarr;</button>`
      }
    </div>
  `;
}

// ─── Main wizard render ──────────────────────────────────────────────

export function renderAgentCreateWizard(props: AgentCreateProps) {
  return html`
    <div class="v2-wizard">
      <h1 class="v2-wizard-title">Create a new agent</h1>
      <p class="v2-wizard-subtitle">Configure your agent in a few steps</p>

      ${renderStepper(props.step)}

      ${props.step === 1 ? renderStep1(props) : nothing}
      ${props.step === 2 ? renderStep2(props) : nothing}
      ${props.step === 3 ? renderStep3(props) : nothing}
      ${props.step === 4 ? renderStep4(props) : nothing}

      ${renderFooter(props)}
    </div>
  `;
}
