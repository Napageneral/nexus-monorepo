/**
 * Access composite view — IAM dashboard.
 *
 * Wraps the legacy "Approvals" tab (ACL requests + ingress credentials)
 * with a more IAM-focused framing. Future additions: roles, groups,
 * policies, grant management, access audit log.
 */
import { html, type TemplateResult } from "lit";
import {
  renderApprovalRequests,
  renderIngressCredentials,
  type ApprovalsProps,
} from "./approvals.ts";

export type AccessSubTab = "requests" | "credentials";

export type AccessViewProps = {
  subTab: AccessSubTab;
  onSubTabChange: (sub: AccessSubTab) => void;
  approvalsProps: ApprovalsProps;
};

export function renderAccessView(props: AccessViewProps): TemplateResult {
  return html`
    <div class="access-view">
      <div class="sub-tabs">
        <button
          class="sub-tab ${props.subTab === "requests" ? "active" : ""}"
          @click=${() => props.onSubTabChange("requests")}
        >
          <span class="sub-tab__text">Pending Requests</span>
          <span class="sub-tab__desc">Review and resolve permission requests</span>
        </button>
        <button
          class="sub-tab ${props.subTab === "credentials" ? "active" : ""}"
          @click=${() => props.onSubTabChange("credentials")}
        >
          <span class="sub-tab__text">API Credentials</span>
          <span class="sub-tab__desc">Ingress tokens and API key management</span>
        </button>
      </div>

      <div class="access-view__content">
        ${
          props.subTab === "requests"
            ? renderApprovalRequests(props.approvalsProps)
            : renderIngressCredentials(props.approvalsProps)
        }
      </div>
    </div>
  `;
}
