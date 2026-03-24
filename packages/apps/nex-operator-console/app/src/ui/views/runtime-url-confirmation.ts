import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state.ts";

export function renderRuntimeUrlConfirmation(state: AppViewState) {
  const { pendingRuntimeUrl } = state;
  if (!pendingRuntimeUrl) {
    return nothing;
  }

  return html`
    <div class="exec-approval-overlay" role="dialog" aria-modal="true" aria-live="polite">
      <div class="exec-approval-card">
        <div class="exec-approval-header">
          <div>
            <div class="exec-approval-title">Change Runtime URL</div>
            <div class="exec-approval-sub">This will reconnect to a different runtime server</div>
          </div>
        </div>
        <div class="exec-approval-command mono">${pendingRuntimeUrl}</div>
        <div class="callout danger" style="margin-top: 12px;">
          Only confirm if you trust this URL. Malicious URLs can compromise your system.
        </div>
        <div class="exec-approval-actions">
          <button
            class="btn primary"
            @click=${() => state.handleRuntimeUrlConfirm()}
          >
            Confirm
          </button>
          <button
            class="btn"
            @click=${() => state.handleRuntimeUrlCancel()}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  `;
}
