import { html, nothing } from "lit";
import { icons } from "../../ui/icons.ts";
import { renderCreateWebhookModal } from "../components/modals.ts";

export type WebhooksPageProps = {
  showCreateModal: boolean;
  onToggleCreateModal: () => void;
};

export function renderWebhooksPage(_props: WebhooksPageProps = { showCreateModal: false, onToggleCreateModal: () => {} }) {
  return html`
    <div class="console-page-header">
      <div class="console-page-header-row">
        <div>
          <h1 class="console-page-title">Webhooks</h1>
          <p class="console-page-subtitle">Subscribe to real-time events and deliver them to your endpoints.</p>
        </div>
        <div class="console-row">
          <button class="console-btn console-btn--secondary">Event history</button>
          <button class="console-btn console-btn--primary" @click=${_props.onToggleCreateModal}>+ Create webhook</button>
        </div>
      </div>
    </div>

    <div class="console-filter-bar">
      <div class="console-search-wrap">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input class="console-search-input" type="text" placeholder="Search webhooks..." />
      </div>
    </div>

    <div class="console-card">
      <div class="console-empty">
        <div class="console-empty-icon">${icons.radio}</div>
        <div class="console-empty-title">No webhook subscriptions</div>
        <div class="console-empty-description">
          Create your first webhook subscription to start receiving events.
        </div>
        <button class="console-btn console-btn--primary">+ Create webhook</button>
      </div>
    </div>

    <div class="console-get-started-section">
      <div class="console-get-started-label">What can you do with webhooks?</div>
      <div class="console-get-started">
      <div class="console-get-started-card">
        <div class="console-get-started-card-title">React to any third-party events</div>
        <div class="console-get-started-card-desc">
          Subscribe to events from Stripe, GitHub, Slack and more.
        </div>
        <div class="console-get-started-card-link">Learn more &rarr;</div>
      </div>
      <div class="console-get-started-card">
        <div class="console-get-started-card-title">Track connection changes</div>
        <div class="console-get-started-card-desc">
          Monitor when connections are created, updated, or disconnected.
        </div>
        <div class="console-get-started-card-link">Learn more &rarr;</div>
      </div>
      <div class="console-get-started-card">
        <div class="console-get-started-card-title">Detect failed auth</div>
        <div class="console-get-started-card-desc">
          Get notified when authentication tokens expire or fail.
        </div>
        <div class="console-get-started-card-link">Learn more &rarr;</div>
      </div>
      </div>
    </div>

    ${_props.showCreateModal
      ? renderCreateWebhookModal({
          url: "",
          secret: "",
          description: "",
          active: true,
          selectedEvents: new Set<string>(),
          onUrlChange: () => {},
          onSecretChange: () => {},
          onDescriptionChange: () => {},
          onActiveToggle: () => {},
          onEventToggle: () => {},
          onCreate: _props.onToggleCreateModal,
          onClose: _props.onToggleCreateModal,
        })
      : nothing}
  `;
}
