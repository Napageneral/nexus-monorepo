import { html, type TemplateResult } from "lit";
import type {
  IdentityChannel,
  IdentityContact,
  IdentityGroup,
  IdentityMergeCandidate,
  IdentityPolicy,
} from "../controllers/identity.ts";
import type { AccessViewProps } from "./access-view.ts";
import type { DirectoryProps } from "./directory.ts";
import { renderAccessView } from "./access-view.ts";
import { renderDirectory } from "./directory.ts";

export type IdentitySubTab =
  | "entities"
  | "contacts"
  | "channels"
  | "groups"
  | "policies"
  | "merges"
  | "access";

export type IdentityViewProps = {
  subTab: IdentitySubTab;
  onSubTabChange: (sub: IdentitySubTab) => void;
  identityLoading: boolean;
  identityError: string | null;
  mergeBusyId: string | null;
  contacts: IdentityContact[];
  channels: IdentityChannel[];
  groups: IdentityGroup[];
  policies: IdentityPolicy[];
  mergeCandidates: IdentityMergeCandidate[];
  onOpenEntity: (entityId: string) => void;
  onResolveMerge: (id: string, status: "approved" | "rejected") => void;
  directoryProps: DirectoryProps;
  accessProps: AccessViewProps;
};

export function renderIdentityView(props: IdentityViewProps): TemplateResult {
  return html`
    <div class="access-view">
      <div class="sub-tabs">
        <button
          class="sub-tab ${props.subTab === "entities" ? "active" : ""}"
          @click=${() => props.onSubTabChange("entities")}
        >
          <span class="sub-tab__text">Entities</span>
          <span class="sub-tab__desc">Contacts, channels, graph detail, and linking evidence</span>
        </button>
        <button
          class="sub-tab ${props.subTab === "contacts" ? "active" : ""}"
          @click=${() => props.onSubTabChange("contacts")}
        >
          <span class="sub-tab__text">Contacts</span>
          <span class="sub-tab__desc">Resolved contacts across adapters and origins</span>
        </button>
        <button
          class="sub-tab ${props.subTab === "channels" ? "active" : ""}"
          @click=${() => props.onSubTabChange("channels")}
        >
          <span class="sub-tab__text">Channels</span>
          <span class="sub-tab__desc">Canonical channel directory and addressability</span>
        </button>
        <button
          class="sub-tab ${props.subTab === "groups" ? "active" : ""}"
          @click=${() => props.onSubTabChange("groups")}
        >
          <span class="sub-tab__text">Groups</span>
          <span class="sub-tab__desc">Operator-managed group structure and membership scope</span>
        </button>
        <button
          class="sub-tab ${props.subTab === "policies" ? "active" : ""}"
          @click=${() => props.onSubTabChange("policies")}
        >
          <span class="sub-tab__text">Policies</span>
          <span class="sub-tab__desc">Active grants, effects, and runtime policy ordering</span>
        </button>
        <button
          class="sub-tab ${props.subTab === "merges" ? "active" : ""}"
          @click=${() => props.onSubTabChange("merges")}
        >
          <span class="sub-tab__text">Merge Queue</span>
          <span class="sub-tab__desc">Proposed identity merges and operator review evidence</span>
        </button>
        <button
          class="sub-tab ${props.subTab === "access" ? "active" : ""}"
          @click=${() => props.onSubTabChange("access")}
        >
          <span class="sub-tab__text">Policies & Access</span>
          <span class="sub-tab__desc">Requests, credentials, and identity-side access controls</span>
        </button>
      </div>

      <div class="access-view__content">
        ${
          props.subTab === "entities"
            ? renderDirectory(props.directoryProps)
            : props.subTab === "contacts"
              ? renderContacts(props.contacts, props.identityLoading, props.identityError)
              : props.subTab === "channels"
                ? renderChannels(props.channels, props.identityLoading, props.identityError)
                : props.subTab === "groups"
                  ? renderGroups(props.groups, props.identityLoading, props.identityError)
                  : props.subTab === "policies"
                    ? renderPolicies(props.policies, props.identityLoading, props.identityError)
                    : props.subTab === "merges"
                      ? renderMergeQueue(
                          props.mergeCandidates,
                          props.contacts,
                          props.identityLoading,
                          props.identityError,
                          props.mergeBusyId,
                          props.onOpenEntity,
                          props.onResolveMerge,
                        )
                      : renderAccessView(props.accessProps)
        }
      </div>
    </div>
  `;
}

function renderContacts(
  contacts: IdentityContact[],
  loading: boolean,
  error: string | null,
): TemplateResult {
  return renderSimpleTable({
    title: "Contacts",
    subtitle: "Resolved contacts linked into canonical entities.",
    loading,
    error,
    empty: "No contact rows found.",
    headers: ["Name", "Platform", "Entity", "Origin"],
    rows: contacts.map((contact) => [
      contact.contact_name || contact.contact_id || contact.id,
      contact.platform || "—",
      contact.entity_id || "—",
      contact.origin || "—",
    ]),
  });
}

function renderChannels(
  channels: IdentityChannel[],
  loading: boolean,
  error: string | null,
): TemplateResult {
  return renderSimpleTable({
    title: "Channels",
    subtitle: "Canonical channel directory and addressability state.",
    loading,
    error,
    empty: "No channels found.",
    headers: ["Channel", "Platform", "Connection", "Container", "Thread"],
    rows: channels.map((channel) => [
      channel.id,
      channel.platform || "—",
      channel.connection_id || "—",
      channel.container_name || channel.container_id || "—",
      channel.thread_name || "—",
    ]),
  });
}

function renderGroups(
  groups: IdentityGroup[],
  loading: boolean,
  error: string | null,
): TemplateResult {
  return renderSimpleTable({
    title: "Groups",
    subtitle: "Operator-managed identity group structure.",
    loading,
    error,
    empty: "No groups found.",
    headers: ["Name", "Members", "Parent", "Description"],
    rows: groups.map((group) => [
      group.name || group.id,
      String(group.member_count ?? 0),
      group.parent_group_id || "—",
      group.description || "—",
    ]),
  });
}

function renderPolicies(
  policies: IdentityPolicy[],
  loading: boolean,
  error: string | null,
): TemplateResult {
  return renderSimpleTable({
    title: "Policies",
    subtitle: "Ordered runtime policy set for access and control decisions.",
    loading,
    error,
    empty: "No policies found.",
    headers: ["Name", "Effect", "Priority", "Enabled", "Built-in"],
    rows: policies.map((policy) => [
      policy.name || policy.id,
      policy.effect || "—",
      String(policy.priority ?? 0),
      policy.enabled ? "yes" : "no",
      policy.is_builtin ? "yes" : "no",
    ]),
  });
}

function renderMergeQueue(
  candidates: IdentityMergeCandidate[],
  contacts: IdentityContact[],
  loading: boolean,
  error: string | null,
  mergeBusyId: string | null,
  onOpenEntity: (entityId: string) => void,
  onResolveMerge: (id: string, status: "approved" | "rejected") => void,
): TemplateResult {
  return html`
    <section class="card">
      <div class="card-title">Merge Queue</div>
      <div class="card-sub">
        Pending operator review for cross-adapter identity linking. Approving merges the source
        entity into the target and rebases linked contacts.
      </div>
      ${error ? html`<div class="callout danger" style="margin-top: 12px;">${error}</div>` : null}
      ${
        loading
          ? html`
              <div class="directory-loading" style="margin-top: 12px"><span class="spinner"></span> Loading…</div>
            `
          : candidates.length === 0
            ? html`
                <div class="muted" style="margin-top: 12px">No pending merge candidates.</div>
              `
            : html`
                <div class="stack" style="margin-top: 14px; gap: 12px;">
                  ${candidates.map((candidate) => {
                    const busy = mergeBusyId === candidate.id;
                    const confidence = candidate.confidence ?? 0;
                    const tone = confidence >= 90 ? "ok" : confidence >= 70 ? "warn" : "danger";
                    return html`
                      <div class="card" style="border-style: solid;">
                        <div class="row" style="justify-content: space-between; gap: 16px; align-items: flex-start;">
                          <div style="flex: 1 1 auto;">
                            <div class="row" style="align-items: center; gap: 8px; flex-wrap: wrap;">
                              ${renderEntityChip(candidate.source_entity_id, onOpenEntity)}
                              <span class="muted">→</span>
                              ${renderEntityChip(candidate.target_entity_id, onOpenEntity)}
                              <span class="pill ${tone}">${confidence}% confidence</span>
                            </div>
                            <div class="muted" style="margin-top: 8px;">
                              ${candidate.reason || "No merge rationale provided."}
                            </div>
                            <div class="grid grid-cols-2" style="margin-top: 12px; gap: 12px;">
                              ${renderMergeEvidenceColumn(
                                "Source evidence",
                                candidate.source_entity_id,
                                contacts,
                              )}
                              ${renderMergeEvidenceColumn(
                                "Target evidence",
                                candidate.target_entity_id,
                                contacts,
                              )}
                            </div>
                            <div class="mono muted" style="margin-top: 8px;">
                              Proposal ${candidate.id}
                            </div>
                          </div>
                          <div class="row" style="gap: 8px; flex-wrap: wrap; justify-content: flex-end;">
                            <button
                              class="btn btn--sm"
                              ?disabled=${busy}
                              @click=${() => onResolveMerge(candidate.id, "approved")}
                            >
                              ${busy ? "Working…" : "Approve Merge"}
                            </button>
                            <button
                              class="btn btn--sm btn--ghost"
                              ?disabled=${busy}
                              @click=${() => onResolveMerge(candidate.id, "rejected")}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    `;
                  })}
                </div>
              `
      }
    </section>
  `;
}

function renderEntityChip(
  entityId: string | null | undefined,
  onOpenEntity: (entityId: string) => void,
): TemplateResult {
  if (!entityId) {
    return html`<div class="card-title" style="margin: 0;">Unknown entity</div>`;
  }
  return html`
    <button class="btn btn--sm btn--ghost" @click=${() => onOpenEntity(entityId)}>
      ${entityId}
    </button>
  `;
}

function renderMergeEvidenceColumn(
  title: string,
  entityId: string | null | undefined,
  contacts: IdentityContact[],
): TemplateResult {
  const evidence = contacts.filter((contact) => contact.entity_id === entityId).slice(0, 3);
  return html`
    <div style="min-width: 0;">
      <div class="note-title">${title}</div>
      ${
        !entityId
          ? html`<div class="muted" style="margin-top: 6px;">No linked entity id.</div>`
          : evidence.length === 0
            ? html`<div class="muted" style="margin-top: 6px;">No linked contacts loaded for this entity.</div>`
            : html`
                <div class="stack" style="margin-top: 6px; gap: 6px;">
                  ${evidence.map(
                    (contact) => html`
                      <div class="row" style="justify-content: space-between; gap: 8px;">
                        <div>${contact.contact_name || contact.contact_id || contact.id}</div>
                        <div class="mono muted">${contact.platform || contact.origin || "—"}</div>
                      </div>
                    `,
                  )}
                </div>
              `
      }
    </div>
  `;
}

function renderSimpleTable(props: {
  title: string;
  subtitle: string;
  loading: boolean;
  error: string | null;
  empty: string;
  headers: string[];
  rows: string[][];
}): TemplateResult {
  return html`
    <section class="card">
      <div class="card-title">${props.title}</div>
      <div class="card-sub">${props.subtitle}</div>
      ${props.error ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>` : null}
      ${
        props.loading
          ? html`
              <div class="directory-loading" style="margin-top: 12px"><span class="spinner"></span> Loading…</div>
            `
          : props.rows.length === 0
            ? html`<div class="muted" style="margin-top: 12px;">${props.empty}</div>`
            : html`
                <div class="table" style="margin-top: 12px;">
                  <table>
                    <thead>
                      <tr>
                        ${props.headers.map((header) => html`<th>${header}</th>`)}
                      </tr>
                    </thead>
                    <tbody>
                      ${props.rows.map(
                        (row) => html`<tr>${row.map((cell) => html`<td>${cell}</td>`)}</tr>`,
                      )}
                    </tbody>
                  </table>
                </div>
              `
      }
    </section>
  `;
}
