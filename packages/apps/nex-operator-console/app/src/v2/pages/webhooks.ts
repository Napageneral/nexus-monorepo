import { html, nothing } from "lit";
import { icons } from "../../ui/icons.ts";
import { renderCreateWebhookModal } from "../components/modals.ts";

export type WebhooksPageProps = {
  showCreateModal: boolean;
  onToggleCreateModal: () => void;
};

export function renderWebhooksPage(_props: WebhooksPageProps = { showCreateModal: false, onToggleCreateModal: () => {} }) {
  return html`
    <div class="v2-page-header">
      <div class="v2-page-header-row">
        <div>
          <h1 class="v2-page-title">Webhooks</h1>
          <p class="v2-page-subtitle">Subscribe to real-time events and deliver them to your endpoints.</p>
        </div>
        <div class="v2-row">
          <button class="v2-btn v2-btn--secondary">Event history</button>
          <button class="v2-btn v2-btn--primary" @click=${_props.onToggleCreateModal}>+ Create webhook</button>
        </div>
      </div>
    </div>

    <div class="v2-filter-bar">
      <div class="v2-search-wrap">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input class="v2-search-input" type="text" placeholder="Search webhooks..." />
      </div>
    </div>

    <div class="v2-card">
      <div class="v2-empty">
        <div class="v2-empty-icon">${icons.radio}</div>
        <div class="v2-empty-title">No webhook subscriptions</div>
        <div class="v2-empty-description">
          Create your first webhook subscription to start receiving events.
        </div>
        <button class="v2-btn v2-btn--primary">+ Create webhook</button>
      </div>
    </div>

    <div class="v2-get-started-section">
      <div class="v2-get-started-label">What can you do with webhooks?</div>
      <div class="v2-get-started">
      <div class="v2-get-started-card">
        <div class="v2-get-started-card-title">React to any third-party events</div>
        <div class="v2-get-started-card-desc">
          Subscribe to events from Stripe, GitHub, Slack and more.
        </div>
        <div class="v2-get-started-card-link">Learn more &rarr;</div>
      </div>
      <div class="v2-get-started-card">
        <div class="v2-get-started-card-title">Track connection changes</div>
        <div class="v2-get-started-card-desc">
          Monitor when connections are created, updated, or disconnected.
        </div>
        <div class="v2-get-started-card-link">Learn more &rarr;</div>
      </div>
      <div class="v2-get-started-card">
        <div class="v2-get-started-card-title">Detect failed auth</div>
        <div class="v2-get-started-card-desc">
          Get notified when authentication tokens expire or fail.
        </div>
        <div class="v2-get-started-card-link">Learn more &rarr;</div>
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
