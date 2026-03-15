import {
  HttpClient,
  type ClientOptions,
  type RequestOptions,
} from "./http.js";
import type { OperationRequest, OperationResponse } from "./types.js";

export type AclApprovalRequestRequest = OperationRequest<"acl.approval.request">;
export type AclApprovalRequestResponse = OperationResponse<"acl.approval.request">;

export type AclAuditGetRequest = OperationRequest<"acl.audit.get">;
export type AclAuditGetResponse = OperationResponse<"acl.audit.get">;

export type AclAuditListRequest = OperationRequest<"acl.audit.list">;
export type AclAuditListResponse = OperationResponse<"acl.audit.list">;

export type AclAuditStatsRequest = OperationRequest<"acl.audit.stats">;
export type AclAuditStatsResponse = OperationResponse<"acl.audit.stats">;

export type AclEvaluateRequest = OperationRequest<"acl.evaluate">;
export type AclEvaluateResponse = OperationResponse<"acl.evaluate">;

export type AclPoliciesCreateRequest = OperationRequest<"acl.policies.create">;
export type AclPoliciesCreateResponse = OperationResponse<"acl.policies.create">;

export type AclPoliciesDeleteRequest = OperationRequest<"acl.policies.delete">;
export type AclPoliciesDeleteResponse = OperationResponse<"acl.policies.delete">;

export type AclPoliciesDisableRequest = OperationRequest<"acl.policies.disable">;
export type AclPoliciesDisableResponse = OperationResponse<"acl.policies.disable">;

export type AclPoliciesEnableRequest = OperationRequest<"acl.policies.enable">;
export type AclPoliciesEnableResponse = OperationResponse<"acl.policies.enable">;

export type AclPoliciesGetRequest = OperationRequest<"acl.policies.get">;
export type AclPoliciesGetResponse = OperationResponse<"acl.policies.get">;

export type AclPoliciesListRequest = OperationRequest<"acl.policies.list">;
export type AclPoliciesListResponse = OperationResponse<"acl.policies.list">;

export type AclPoliciesUpdateRequest = OperationRequest<"acl.policies.update">;
export type AclPoliciesUpdateResponse = OperationResponse<"acl.policies.update">;

export type AclRequestsApproveRequest = OperationRequest<"acl.requests.approve">;
export type AclRequestsApproveResponse = OperationResponse<"acl.requests.approve">;

export type AclRequestsDenyRequest = OperationRequest<"acl.requests.deny">;
export type AclRequestsDenyResponse = OperationResponse<"acl.requests.deny">;

export type AclRequestsListRequest = OperationRequest<"acl.requests.list">;
export type AclRequestsListResponse = OperationResponse<"acl.requests.list">;

export type AclRequestsShowRequest = OperationRequest<"acl.requests.show">;
export type AclRequestsShowResponse = OperationResponse<"acl.requests.show">;

export type AdapterAccountsListRequest = OperationRequest<"adapter.accounts.list">;
export type AdapterAccountsListResponse = OperationResponse<"adapter.accounts.list">;

export type AdapterHealthRequest = OperationRequest<"adapter.health">;
export type AdapterHealthResponse = OperationResponse<"adapter.health">;

export type AdapterInfoRequest = OperationRequest<"adapter.info">;
export type AdapterInfoResponse = OperationResponse<"adapter.info">;

export type AdapterMonitorStartRequest = OperationRequest<"adapter.monitor.start">;
export type AdapterMonitorStartResponse = OperationResponse<"adapter.monitor.start">;

export type AdapterMonitorStopRequest = OperationRequest<"adapter.monitor.stop">;
export type AdapterMonitorStopResponse = OperationResponse<"adapter.monitor.stop">;

export type AdapterServeStartRequest = OperationRequest<"adapter.serve.start">;
export type AdapterServeStartResponse = OperationResponse<"adapter.serve.start">;

export type AdapterSetupCancelRequest = OperationRequest<"adapter.setup.cancel">;
export type AdapterSetupCancelResponse = OperationResponse<"adapter.setup.cancel">;

export type AdapterSetupStartRequest = OperationRequest<"adapter.setup.start">;
export type AdapterSetupStartResponse = OperationResponse<"adapter.setup.start">;

export type AdapterSetupStatusRequest = OperationRequest<"adapter.setup.status">;
export type AdapterSetupStatusResponse = OperationResponse<"adapter.setup.status">;

export type AdapterSetupSubmitRequest = OperationRequest<"adapter.setup.submit">;
export type AdapterSetupSubmitResponse = OperationResponse<"adapter.setup.submit">;

export type AdaptersConnectionsBackfillRequest = OperationRequest<"adapters.connections.backfill">;
export type AdaptersConnectionsBackfillResponse = OperationResponse<"adapters.connections.backfill">;

export type AdaptersConnectionsCreateRequest = OperationRequest<"adapters.connections.create">;
export type AdaptersConnectionsCreateResponse = OperationResponse<"adapters.connections.create">;

export type AdaptersConnectionsCredentialsGetRequest = OperationRequest<"adapters.connections.credentials.get">;
export type AdaptersConnectionsCredentialsGetResponse = OperationResponse<"adapters.connections.credentials.get">;

export type AdaptersConnectionsCustomCancelRequest = OperationRequest<"adapters.connections.custom.cancel">;
export type AdaptersConnectionsCustomCancelResponse = OperationResponse<"adapters.connections.custom.cancel">;

export type AdaptersConnectionsCustomStartRequest = OperationRequest<"adapters.connections.custom.start">;
export type AdaptersConnectionsCustomStartResponse = OperationResponse<"adapters.connections.custom.start">;

export type AdaptersConnectionsCustomStatusRequest = OperationRequest<"adapters.connections.custom.status">;
export type AdaptersConnectionsCustomStatusResponse = OperationResponse<"adapters.connections.custom.status">;

export type AdaptersConnectionsCustomSubmitRequest = OperationRequest<"adapters.connections.custom.submit">;
export type AdaptersConnectionsCustomSubmitResponse = OperationResponse<"adapters.connections.custom.submit">;

export type AdaptersConnectionsDisconnectRequest = OperationRequest<"adapters.connections.disconnect">;
export type AdaptersConnectionsDisconnectResponse = OperationResponse<"adapters.connections.disconnect">;

export type AdaptersConnectionsGetRequest = OperationRequest<"adapters.connections.get">;
export type AdaptersConnectionsGetResponse = OperationResponse<"adapters.connections.get">;

export type AdaptersConnectionsListRequest = OperationRequest<"adapters.connections.list">;
export type AdaptersConnectionsListResponse = OperationResponse<"adapters.connections.list">;

export type AdaptersConnectionsOauthCompleteRequest = OperationRequest<"adapters.connections.oauth.complete">;
export type AdaptersConnectionsOauthCompleteResponse = OperationResponse<"adapters.connections.oauth.complete">;

export type AdaptersConnectionsOauthStartRequest = OperationRequest<"adapters.connections.oauth.start">;
export type AdaptersConnectionsOauthStartResponse = OperationResponse<"adapters.connections.oauth.start">;

export type AdaptersConnectionsStatusRequest = OperationRequest<"adapters.connections.status">;
export type AdaptersConnectionsStatusResponse = OperationResponse<"adapters.connections.status">;

export type AdaptersConnectionsTestRequest = OperationRequest<"adapters.connections.test">;
export type AdaptersConnectionsTestResponse = OperationResponse<"adapters.connections.test">;

export type AdaptersConnectionsUpdateRequest = OperationRequest<"adapters.connections.update">;
export type AdaptersConnectionsUpdateResponse = OperationResponse<"adapters.connections.update">;

export type AdaptersConnectionsUploadRequest = OperationRequest<"adapters.connections.upload">;
export type AdaptersConnectionsUploadResponse = OperationResponse<"adapters.connections.upload">;

export type AdaptersMethodsRequest = OperationRequest<"adapters.methods">;
export type AdaptersMethodsResponse = OperationResponse<"adapters.methods">;

export type AgentsConfigsCreateRequest = OperationRequest<"agents.configs.create">;
export type AgentsConfigsCreateResponse = OperationResponse<"agents.configs.create">;

export type AgentsConfigsDeleteRequest = OperationRequest<"agents.configs.delete">;
export type AgentsConfigsDeleteResponse = OperationResponse<"agents.configs.delete">;

export type AgentsConfigsGetRequest = OperationRequest<"agents.configs.get">;
export type AgentsConfigsGetResponse = OperationResponse<"agents.configs.get">;

export type AgentsConfigsListRequest = OperationRequest<"agents.configs.list">;
export type AgentsConfigsListResponse = OperationResponse<"agents.configs.list">;

export type AgentsConfigsUpdateRequest = OperationRequest<"agents.configs.update">;
export type AgentsConfigsUpdateResponse = OperationResponse<"agents.configs.update">;

export type AgentsConversationsAbortRequest = OperationRequest<"agents.conversations.abort">;
export type AgentsConversationsAbortResponse = OperationResponse<"agents.conversations.abort">;

export type AgentsConversationsGetRequest = OperationRequest<"agents.conversations.get">;
export type AgentsConversationsGetResponse = OperationResponse<"agents.conversations.get">;

export type AgentsConversationsHistoryRequest = OperationRequest<"agents.conversations.history">;
export type AgentsConversationsHistoryResponse = OperationResponse<"agents.conversations.history">;

export type AgentsConversationsListRequest = OperationRequest<"agents.conversations.list">;
export type AgentsConversationsListResponse = OperationResponse<"agents.conversations.list">;

export type AgentsConversationsSearchRequest = OperationRequest<"agents.conversations.search">;
export type AgentsConversationsSearchResponse = OperationResponse<"agents.conversations.search">;

export type AgentsConversationsSendRequest = OperationRequest<"agents.conversations.send">;
export type AgentsConversationsSendResponse = OperationResponse<"agents.conversations.send">;

export type AgentsCreateRequest = OperationRequest<"agents.create">;
export type AgentsCreateResponse = OperationResponse<"agents.create">;

export type AgentsDeleteRequest = OperationRequest<"agents.delete">;
export type AgentsDeleteResponse = OperationResponse<"agents.delete">;

export type AgentsFilesGetRequest = OperationRequest<"agents.files.get">;
export type AgentsFilesGetResponse = OperationResponse<"agents.files.get">;

export type AgentsFilesListRequest = OperationRequest<"agents.files.list">;
export type AgentsFilesListResponse = OperationResponse<"agents.files.list">;

export type AgentsFilesSetRequest = OperationRequest<"agents.files.set">;
export type AgentsFilesSetResponse = OperationResponse<"agents.files.set">;

export type AgentsIdentityGetRequest = OperationRequest<"agents.identity.get">;
export type AgentsIdentityGetResponse = OperationResponse<"agents.identity.get">;

export type AgentsListRequest = OperationRequest<"agents.list">;
export type AgentsListResponse = OperationResponse<"agents.list">;

export type AgentsSessionsArchiveRequest = OperationRequest<"agents.sessions.archive">;
export type AgentsSessionsArchiveResponse = OperationResponse<"agents.sessions.archive">;

export type AgentsSessionsCompactRequest = OperationRequest<"agents.sessions.compact">;
export type AgentsSessionsCompactResponse = OperationResponse<"agents.sessions.compact">;

export type AgentsSessionsCreateRequest = OperationRequest<"agents.sessions.create">;
export type AgentsSessionsCreateResponse = OperationResponse<"agents.sessions.create">;

export type AgentsSessionsForkRequest = OperationRequest<"agents.sessions.fork">;
export type AgentsSessionsForkResponse = OperationResponse<"agents.sessions.fork">;

export type AgentsSessionsGetRequest = OperationRequest<"agents.sessions.get">;
export type AgentsSessionsGetResponse = OperationResponse<"agents.sessions.get">;

export type AgentsSessionsHistoryRequest = OperationRequest<"agents.sessions.history">;
export type AgentsSessionsHistoryResponse = OperationResponse<"agents.sessions.history">;

export type AgentsSessionsImportChunkRequest = OperationRequest<"agents.sessions.import.chunk">;
export type AgentsSessionsImportChunkResponse = OperationResponse<"agents.sessions.import.chunk">;

export type AgentsSessionsImportExecuteRequest = OperationRequest<"agents.sessions.import.execute">;
export type AgentsSessionsImportExecuteResponse = OperationResponse<"agents.sessions.import.execute">;

export type AgentsSessionsImportsListRequest = OperationRequest<"agents.sessions.imports.list">;
export type AgentsSessionsImportsListResponse = OperationResponse<"agents.sessions.imports.list">;

export type AgentsSessionsListRequest = OperationRequest<"agents.sessions.list">;
export type AgentsSessionsListResponse = OperationResponse<"agents.sessions.list">;

export type AgentsSessionsPatchRequest = OperationRequest<"agents.sessions.patch">;
export type AgentsSessionsPatchResponse = OperationResponse<"agents.sessions.patch">;

export type AgentsSessionsPreviewRequest = OperationRequest<"agents.sessions.preview">;
export type AgentsSessionsPreviewResponse = OperationResponse<"agents.sessions.preview">;

export type AgentsSessionsResetRequest = OperationRequest<"agents.sessions.reset">;
export type AgentsSessionsResetResponse = OperationResponse<"agents.sessions.reset">;

export type AgentsSessionsResolveRequest = OperationRequest<"agents.sessions.resolve">;
export type AgentsSessionsResolveResponse = OperationResponse<"agents.sessions.resolve">;

export type AgentsSessionsSendRequest = OperationRequest<"agents.sessions.send">;
export type AgentsSessionsSendResponse = OperationResponse<"agents.sessions.send">;

export type AgentsSessionsTransferRequest = OperationRequest<"agents.sessions.transfer">;
export type AgentsSessionsTransferResponse = OperationResponse<"agents.sessions.transfer">;

export type AgentsUpdateRequest = OperationRequest<"agents.update">;
export type AgentsUpdateResponse = OperationResponse<"agents.update">;

export type AgentsWaitRequest = OperationRequest<"agents.wait">;
export type AgentsWaitResponse = OperationResponse<"agents.wait">;

export type AppsGetRequest = OperationRequest<"apps.get">;
export type AppsGetResponse = OperationResponse<"apps.get">;

export type AppsInstallRequest = OperationRequest<"apps.install">;
export type AppsInstallResponse = OperationResponse<"apps.install">;

export type AppsListRequest = OperationRequest<"apps.list">;
export type AppsListResponse = OperationResponse<"apps.list">;

export type AppsLogsRequest = OperationRequest<"apps.logs">;
export type AppsLogsResponse = OperationResponse<"apps.logs">;

export type AppsMethodsRequest = OperationRequest<"apps.methods">;
export type AppsMethodsResponse = OperationResponse<"apps.methods">;

export type AppsStartRequest = OperationRequest<"apps.start">;
export type AppsStartResponse = OperationResponse<"apps.start">;

export type AppsStatusRequest = OperationRequest<"apps.status">;
export type AppsStatusResponse = OperationResponse<"apps.status">;

export type AppsStopRequest = OperationRequest<"apps.stop">;
export type AppsStopResponse = OperationResponse<"apps.stop">;

export type AppsUninstallRequest = OperationRequest<"apps.uninstall">;
export type AppsUninstallResponse = OperationResponse<"apps.uninstall">;

export type AuthLoginRequest = OperationRequest<"auth.login">;
export type AuthLoginResponse = OperationResponse<"auth.login">;

export type AuthTokensCreateRequest = OperationRequest<"auth.tokens.create">;
export type AuthTokensCreateResponse = OperationResponse<"auth.tokens.create">;

export type AuthTokensListRequest = OperationRequest<"auth.tokens.list">;
export type AuthTokensListResponse = OperationResponse<"auth.tokens.list">;

export type AuthTokensRevokeRequest = OperationRequest<"auth.tokens.revoke">;
export type AuthTokensRevokeResponse = OperationResponse<"auth.tokens.revoke">;

export type AuthTokensRotateRequest = OperationRequest<"auth.tokens.rotate">;
export type AuthTokensRotateResponse = OperationResponse<"auth.tokens.rotate">;

export type AuthUsersCreateRequest = OperationRequest<"auth.users.create">;
export type AuthUsersCreateResponse = OperationResponse<"auth.users.create">;

export type AuthUsersListRequest = OperationRequest<"auth.users.list">;
export type AuthUsersListResponse = OperationResponse<"auth.users.list">;

export type AuthUsersSetPasswordRequest = OperationRequest<"auth.users.setPassword">;
export type AuthUsersSetPasswordResponse = OperationResponse<"auth.users.setPassword">;

export type BrowserRequestRequest = OperationRequest<"browser.request">;
export type BrowserRequestResponse = OperationResponse<"browser.request">;

export type ChannelsCreateRequest = OperationRequest<"channels.create">;
export type ChannelsCreateResponse = OperationResponse<"channels.create">;

export type ChannelsDeleteRequest = OperationRequest<"channels.delete">;
export type ChannelsDeleteResponse = OperationResponse<"channels.delete">;

export type ChannelsEditRequest = OperationRequest<"channels.edit">;
export type ChannelsEditResponse = OperationResponse<"channels.edit">;

export type ChannelsGetRequest = OperationRequest<"channels.get">;
export type ChannelsGetResponse = OperationResponse<"channels.get">;

export type ChannelsHistoryRequest = OperationRequest<"channels.history">;
export type ChannelsHistoryResponse = OperationResponse<"channels.history">;

export type ChannelsListRequest = OperationRequest<"channels.list">;
export type ChannelsListResponse = OperationResponse<"channels.list">;

export type ChannelsParticipantsGetRequest = OperationRequest<"channels.participants.get">;
export type ChannelsParticipantsGetResponse = OperationResponse<"channels.participants.get">;

export type ChannelsParticipantsHistoryRequest = OperationRequest<"channels.participants.history">;
export type ChannelsParticipantsHistoryResponse = OperationResponse<"channels.participants.history">;

export type ChannelsParticipantsListRequest = OperationRequest<"channels.participants.list">;
export type ChannelsParticipantsListResponse = OperationResponse<"channels.participants.list">;

export type ChannelsReactRequest = OperationRequest<"channels.react">;
export type ChannelsReactResponse = OperationResponse<"channels.react">;

export type ChannelsResolveRequest = OperationRequest<"channels.resolve">;
export type ChannelsResolveResponse = OperationResponse<"channels.resolve">;

export type ChannelsSearchRequest = OperationRequest<"channels.search">;
export type ChannelsSearchResponse = OperationResponse<"channels.search">;

export type ChannelsSendRequest = OperationRequest<"channels.send">;
export type ChannelsSendResponse = OperationResponse<"channels.send">;

export type ChannelsStatusRequest = OperationRequest<"channels.status">;
export type ChannelsStatusResponse = OperationResponse<"channels.status">;

export type ChannelsStreamRequest = OperationRequest<"channels.stream">;
export type ChannelsStreamResponse = OperationResponse<"channels.stream">;

export type ChannelsUpdateRequest = OperationRequest<"channels.update">;
export type ChannelsUpdateResponse = OperationResponse<"channels.update">;

export type ConfigApplyRequest = OperationRequest<"config.apply">;
export type ConfigApplyResponse = OperationResponse<"config.apply">;

export type ConfigGetRequest = OperationRequest<"config.get">;
export type ConfigGetResponse = OperationResponse<"config.get">;

export type ConfigPatchRequest = OperationRequest<"config.patch">;
export type ConfigPatchResponse = OperationResponse<"config.patch">;

export type ConfigSchemaRequest = OperationRequest<"config.schema">;
export type ConfigSchemaResponse = OperationResponse<"config.schema">;

export type ConfigSetRequest = OperationRequest<"config.set">;
export type ConfigSetResponse = OperationResponse<"config.set">;

export type ContactsCreateRequest = OperationRequest<"contacts.create">;
export type ContactsCreateResponse = OperationResponse<"contacts.create">;

export type ContactsGetRequest = OperationRequest<"contacts.get">;
export type ContactsGetResponse = OperationResponse<"contacts.get">;

export type ContactsHistoryRequest = OperationRequest<"contacts.history">;
export type ContactsHistoryResponse = OperationResponse<"contacts.history">;

export type ContactsImportRequest = OperationRequest<"contacts.import">;
export type ContactsImportResponse = OperationResponse<"contacts.import">;

export type ContactsListRequest = OperationRequest<"contacts.list">;
export type ContactsListResponse = OperationResponse<"contacts.list">;

export type ContactsSearchRequest = OperationRequest<"contacts.search">;
export type ContactsSearchResponse = OperationResponse<"contacts.search">;

export type ContactsUpdateRequest = OperationRequest<"contacts.update">;
export type ContactsUpdateResponse = OperationResponse<"contacts.update">;

export type CredentialsCreateRequest = OperationRequest<"credentials.create">;
export type CredentialsCreateResponse = OperationResponse<"credentials.create">;

export type CredentialsGetRequest = OperationRequest<"credentials.get">;
export type CredentialsGetResponse = OperationResponse<"credentials.get">;

export type CredentialsListRequest = OperationRequest<"credentials.list">;
export type CredentialsListResponse = OperationResponse<"credentials.list">;

export type CredentialsResolveRequest = OperationRequest<"credentials.resolve">;
export type CredentialsResolveResponse = OperationResponse<"credentials.resolve">;

export type CredentialsRevokeRequest = OperationRequest<"credentials.revoke">;
export type CredentialsRevokeResponse = OperationResponse<"credentials.revoke">;

export type CredentialsUpdateRequest = OperationRequest<"credentials.update">;
export type CredentialsUpdateResponse = OperationResponse<"credentials.update">;

export type CredentialsVaultRetrieveRequest = OperationRequest<"credentials.vault.retrieve">;
export type CredentialsVaultRetrieveResponse = OperationResponse<"credentials.vault.retrieve">;

export type CredentialsVaultStoreRequest = OperationRequest<"credentials.vault.store">;
export type CredentialsVaultStoreResponse = OperationResponse<"credentials.vault.store">;

export type DagsCreateRequest = OperationRequest<"dags.create">;
export type DagsCreateResponse = OperationResponse<"dags.create">;

export type DagsDeleteRequest = OperationRequest<"dags.delete">;
export type DagsDeleteResponse = OperationResponse<"dags.delete">;

export type DagsGetRequest = OperationRequest<"dags.get">;
export type DagsGetResponse = OperationResponse<"dags.get">;

export type DagsListRequest = OperationRequest<"dags.list">;
export type DagsListResponse = OperationResponse<"dags.list">;

export type DagsRunsCancelRequest = OperationRequest<"dags.runs.cancel">;
export type DagsRunsCancelResponse = OperationResponse<"dags.runs.cancel">;

export type DagsRunsGetRequest = OperationRequest<"dags.runs.get">;
export type DagsRunsGetResponse = OperationResponse<"dags.runs.get">;

export type DagsRunsListRequest = OperationRequest<"dags.runs.list">;
export type DagsRunsListResponse = OperationResponse<"dags.runs.list">;

export type DagsRunsPauseRequest = OperationRequest<"dags.runs.pause">;
export type DagsRunsPauseResponse = OperationResponse<"dags.runs.pause">;

export type DagsRunsResumeRequest = OperationRequest<"dags.runs.resume">;
export type DagsRunsResumeResponse = OperationResponse<"dags.runs.resume">;

export type DagsRunsStartRequest = OperationRequest<"dags.runs.start">;
export type DagsRunsStartResponse = OperationResponse<"dags.runs.start">;

export type DagsUpdateRequest = OperationRequest<"dags.update">;
export type DagsUpdateResponse = OperationResponse<"dags.update">;

export type EntitiesCreateRequest = OperationRequest<"entities.create">;
export type EntitiesCreateResponse = OperationResponse<"entities.create">;

export type EntitiesGetRequest = OperationRequest<"entities.get">;
export type EntitiesGetResponse = OperationResponse<"entities.get">;

export type EntitiesListRequest = OperationRequest<"entities.list">;
export type EntitiesListResponse = OperationResponse<"entities.list">;

export type EntitiesMergeApplyRequest = OperationRequest<"entities.merge.apply">;
export type EntitiesMergeApplyResponse = OperationResponse<"entities.merge.apply">;

export type EntitiesMergeCandidatesRequest = OperationRequest<"entities.merge.candidates">;
export type EntitiesMergeCandidatesResponse = OperationResponse<"entities.merge.candidates">;

export type EntitiesMergeProposeRequest = OperationRequest<"entities.merge.propose">;
export type EntitiesMergeProposeResponse = OperationResponse<"entities.merge.propose">;

export type EntitiesMergeResolveRequest = OperationRequest<"entities.merge.resolve">;
export type EntitiesMergeResolveResponse = OperationResponse<"entities.merge.resolve">;

export type EntitiesResolveRequest = OperationRequest<"entities.resolve">;
export type EntitiesResolveResponse = OperationResponse<"entities.resolve">;

export type EntitiesTagsAddRequest = OperationRequest<"entities.tags.add">;
export type EntitiesTagsAddResponse = OperationResponse<"entities.tags.add">;

export type EntitiesTagsListRequest = OperationRequest<"entities.tags.list">;
export type EntitiesTagsListResponse = OperationResponse<"entities.tags.list">;

export type EntitiesTagsRemoveRequest = OperationRequest<"entities.tags.remove">;
export type EntitiesTagsRemoveResponse = OperationResponse<"entities.tags.remove">;

export type EntitiesUpdateRequest = OperationRequest<"entities.update">;
export type EntitiesUpdateResponse = OperationResponse<"entities.update">;

export type EventsPublishRequest = OperationRequest<"events.publish">;
export type EventsPublishResponse = OperationResponse<"events.publish">;

export type EventsSubscribeRequest = OperationRequest<"events.subscribe">;
export type EventsSubscribeResponse = OperationResponse<"events.subscribe">;

export type EventsSubscriptionsCreateRequest = OperationRequest<"events.subscriptions.create">;
export type EventsSubscriptionsCreateResponse = OperationResponse<"events.subscriptions.create">;

export type EventsSubscriptionsDeleteRequest = OperationRequest<"events.subscriptions.delete">;
export type EventsSubscriptionsDeleteResponse = OperationResponse<"events.subscriptions.delete">;

export type EventsSubscriptionsGetRequest = OperationRequest<"events.subscriptions.get">;
export type EventsSubscriptionsGetResponse = OperationResponse<"events.subscriptions.get">;

export type EventsSubscriptionsListRequest = OperationRequest<"events.subscriptions.list">;
export type EventsSubscriptionsListResponse = OperationResponse<"events.subscriptions.list">;

export type EventsSubscriptionsUpdateRequest = OperationRequest<"events.subscriptions.update">;
export type EventsSubscriptionsUpdateResponse = OperationResponse<"events.subscriptions.update">;

export type EventsUnsubscribeRequest = OperationRequest<"events.unsubscribe">;
export type EventsUnsubscribeResponse = OperationResponse<"events.unsubscribe">;

export type GroupsCreateRequest = OperationRequest<"groups.create">;
export type GroupsCreateResponse = OperationResponse<"groups.create">;

export type GroupsDeleteRequest = OperationRequest<"groups.delete">;
export type GroupsDeleteResponse = OperationResponse<"groups.delete">;

export type GroupsGetRequest = OperationRequest<"groups.get">;
export type GroupsGetResponse = OperationResponse<"groups.get">;

export type GroupsListRequest = OperationRequest<"groups.list">;
export type GroupsListResponse = OperationResponse<"groups.list">;

export type GroupsMembersAddRequest = OperationRequest<"groups.members.add">;
export type GroupsMembersAddResponse = OperationResponse<"groups.members.add">;

export type GroupsMembersListRequest = OperationRequest<"groups.members.list">;
export type GroupsMembersListResponse = OperationResponse<"groups.members.list">;

export type GroupsMembersRemoveRequest = OperationRequest<"groups.members.remove">;
export type GroupsMembersRemoveResponse = OperationResponse<"groups.members.remove">;

export type GroupsUpdateRequest = OperationRequest<"groups.update">;
export type GroupsUpdateResponse = OperationResponse<"groups.update">;

export type JobsCancelRequest = OperationRequest<"jobs.cancel">;
export type JobsCancelResponse = OperationResponse<"jobs.cancel">;

export type JobsCreateRequest = OperationRequest<"jobs.create">;
export type JobsCreateResponse = OperationResponse<"jobs.create">;

export type JobsDeleteRequest = OperationRequest<"jobs.delete">;
export type JobsDeleteResponse = OperationResponse<"jobs.delete">;

export type JobsGetRequest = OperationRequest<"jobs.get">;
export type JobsGetResponse = OperationResponse<"jobs.get">;

export type JobsInvokeRequest = OperationRequest<"jobs.invoke">;
export type JobsInvokeResponse = OperationResponse<"jobs.invoke">;

export type JobsListRequest = OperationRequest<"jobs.list">;
export type JobsListResponse = OperationResponse<"jobs.list">;

export type JobsQueueGetRequest = OperationRequest<"jobs.queue.get">;
export type JobsQueueGetResponse = OperationResponse<"jobs.queue.get">;

export type JobsQueueListRequest = OperationRequest<"jobs.queue.list">;
export type JobsQueueListResponse = OperationResponse<"jobs.queue.list">;

export type JobsRequeueRequest = OperationRequest<"jobs.requeue">;
export type JobsRequeueResponse = OperationResponse<"jobs.requeue">;

export type JobsRetryRequest = OperationRequest<"jobs.retry">;
export type JobsRetryResponse = OperationResponse<"jobs.retry">;

export type JobsRunsGetRequest = OperationRequest<"jobs.runs.get">;
export type JobsRunsGetResponse = OperationResponse<"jobs.runs.get">;

export type JobsRunsListRequest = OperationRequest<"jobs.runs.list">;
export type JobsRunsListResponse = OperationResponse<"jobs.runs.list">;

export type JobsUpdateRequest = OperationRequest<"jobs.update">;
export type JobsUpdateResponse = OperationResponse<"jobs.update">;

export type LogsTailRequest = OperationRequest<"logs.tail">;
export type LogsTailResponse = OperationResponse<"logs.tail">;

export type MemoryElementsConsolidateRequest = OperationRequest<"memory.elements.consolidate">;
export type MemoryElementsConsolidateResponse = OperationResponse<"memory.elements.consolidate">;

export type MemoryElementsCreateRequest = OperationRequest<"memory.elements.create">;
export type MemoryElementsCreateResponse = OperationResponse<"memory.elements.create">;

export type MemoryElementsDefinitionsCreateRequest = OperationRequest<"memory.elements.definitions.create">;
export type MemoryElementsDefinitionsCreateResponse = OperationResponse<"memory.elements.definitions.create">;

export type MemoryElementsDefinitionsGetRequest = OperationRequest<"memory.elements.definitions.get">;
export type MemoryElementsDefinitionsGetResponse = OperationResponse<"memory.elements.definitions.get">;

export type MemoryElementsDefinitionsListRequest = OperationRequest<"memory.elements.definitions.list">;
export type MemoryElementsDefinitionsListResponse = OperationResponse<"memory.elements.definitions.list">;

export type MemoryElementsEntitiesLinkRequest = OperationRequest<"memory.elements.entities.link">;
export type MemoryElementsEntitiesLinkResponse = OperationResponse<"memory.elements.entities.link">;

export type MemoryElementsEntitiesListRequest = OperationRequest<"memory.elements.entities.list">;
export type MemoryElementsEntitiesListResponse = OperationResponse<"memory.elements.entities.list">;

export type MemoryElementsGetRequest = OperationRequest<"memory.elements.get">;
export type MemoryElementsGetResponse = OperationResponse<"memory.elements.get">;

export type MemoryElementsLinksCreateRequest = OperationRequest<"memory.elements.links.create">;
export type MemoryElementsLinksCreateResponse = OperationResponse<"memory.elements.links.create">;

export type MemoryElementsLinksListRequest = OperationRequest<"memory.elements.links.list">;
export type MemoryElementsLinksListResponse = OperationResponse<"memory.elements.links.list">;

export type MemoryElementsLinksTraverseRequest = OperationRequest<"memory.elements.links.traverse">;
export type MemoryElementsLinksTraverseResponse = OperationResponse<"memory.elements.links.traverse">;

export type MemoryElementsListRequest = OperationRequest<"memory.elements.list">;
export type MemoryElementsListResponse = OperationResponse<"memory.elements.list">;

export type MemoryElementsResolveHeadRequest = OperationRequest<"memory.elements.resolve_head">;
export type MemoryElementsResolveHeadResponse = OperationResponse<"memory.elements.resolve_head">;

export type MemoryElementsSearchRequest = OperationRequest<"memory.elements.search">;
export type MemoryElementsSearchResponse = OperationResponse<"memory.elements.search">;

export type MemoryElementsUpdateRequest = OperationRequest<"memory.elements.update">;
export type MemoryElementsUpdateResponse = OperationResponse<"memory.elements.update">;

export type MemoryEntitiesConfirmRequest = OperationRequest<"memory.entities.confirm">;
export type MemoryEntitiesConfirmResponse = OperationResponse<"memory.entities.confirm">;

export type MemoryEntitiesCreateRequest = OperationRequest<"memory.entities.create">;
export type MemoryEntitiesCreateResponse = OperationResponse<"memory.entities.create">;

export type MemoryEntitiesProposeMergeRequest = OperationRequest<"memory.entities.propose_merge">;
export type MemoryEntitiesProposeMergeResponse = OperationResponse<"memory.entities.propose_merge">;

export type MemoryRecallRequest = OperationRequest<"memory.recall">;
export type MemoryRecallResponse = OperationResponse<"memory.recall">;

export type MemoryReviewEntityGetRequest = OperationRequest<"memory.review.entity.get">;
export type MemoryReviewEntityGetResponse = OperationResponse<"memory.review.entity.get">;

export type MemoryReviewEpisodeGetRequest = OperationRequest<"memory.review.episode.get">;
export type MemoryReviewEpisodeGetResponse = OperationResponse<"memory.review.episode.get">;

export type MemoryReviewEpisodeOutputsGetRequest = OperationRequest<"memory.review.episode.outputs.get">;
export type MemoryReviewEpisodeOutputsGetResponse = OperationResponse<"memory.review.episode.outputs.get">;

export type MemoryReviewFactGetRequest = OperationRequest<"memory.review.fact.get">;
export type MemoryReviewFactGetResponse = OperationResponse<"memory.review.fact.get">;

export type MemoryReviewObservationGetRequest = OperationRequest<"memory.review.observation.get">;
export type MemoryReviewObservationGetResponse = OperationResponse<"memory.review.observation.get">;

export type MemoryReviewQualityItemsListRequest = OperationRequest<"memory.review.quality.items.list">;
export type MemoryReviewQualityItemsListResponse = OperationResponse<"memory.review.quality.items.list">;

export type MemoryReviewQualitySummaryRequest = OperationRequest<"memory.review.quality.summary">;
export type MemoryReviewQualitySummaryResponse = OperationResponse<"memory.review.quality.summary">;

export type MemoryReviewRunEpisodesListRequest = OperationRequest<"memory.review.run.episodes.list">;
export type MemoryReviewRunEpisodesListResponse = OperationResponse<"memory.review.run.episodes.list">;

export type MemoryReviewRunGetRequest = OperationRequest<"memory.review.run.get">;
export type MemoryReviewRunGetResponse = OperationResponse<"memory.review.run.get">;

export type MemoryReviewRunsListRequest = OperationRequest<"memory.review.runs.list">;
export type MemoryReviewRunsListResponse = OperationResponse<"memory.review.runs.list">;

export type MemoryReviewSearchRequest = OperationRequest<"memory.review.search">;
export type MemoryReviewSearchResponse = OperationResponse<"memory.review.search">;

export type MemorySetsCreateRequest = OperationRequest<"memory.sets.create">;
export type MemorySetsCreateResponse = OperationResponse<"memory.sets.create">;

export type MemorySetsGetRequest = OperationRequest<"memory.sets.get">;
export type MemorySetsGetResponse = OperationResponse<"memory.sets.get">;

export type MemorySetsListRequest = OperationRequest<"memory.sets.list">;
export type MemorySetsListResponse = OperationResponse<"memory.sets.list">;

export type MemorySetsMembersAddRequest = OperationRequest<"memory.sets.members.add">;
export type MemorySetsMembersAddResponse = OperationResponse<"memory.sets.members.add">;

export type MemorySetsMembersListRequest = OperationRequest<"memory.sets.members.list">;
export type MemorySetsMembersListResponse = OperationResponse<"memory.sets.members.list">;

export type ModelsCatalogGetRequest = OperationRequest<"models.catalog.get">;
export type ModelsCatalogGetResponse = OperationResponse<"models.catalog.get">;

export type ModelsCatalogListRequest = OperationRequest<"models.catalog.list">;
export type ModelsCatalogListResponse = OperationResponse<"models.catalog.list">;

export type ModelsConfigsCreateRequest = OperationRequest<"models.configs.create">;
export type ModelsConfigsCreateResponse = OperationResponse<"models.configs.create">;

export type ModelsConfigsDeleteRequest = OperationRequest<"models.configs.delete">;
export type ModelsConfigsDeleteResponse = OperationResponse<"models.configs.delete">;

export type ModelsConfigsGetRequest = OperationRequest<"models.configs.get">;
export type ModelsConfigsGetResponse = OperationResponse<"models.configs.get">;

export type ModelsConfigsListRequest = OperationRequest<"models.configs.list">;
export type ModelsConfigsListResponse = OperationResponse<"models.configs.list">;

export type ModelsConfigsUpdateRequest = OperationRequest<"models.configs.update">;
export type ModelsConfigsUpdateResponse = OperationResponse<"models.configs.update">;

export type ModelsDefaultsGetRequest = OperationRequest<"models.defaults.get">;
export type ModelsDefaultsGetResponse = OperationResponse<"models.defaults.get">;

export type ModelsDefaultsPutRequest = OperationRequest<"models.defaults.put">;
export type ModelsDefaultsPutResponse = OperationResponse<"models.defaults.put">;

export type ModelsGetRequest = OperationRequest<"models.get">;
export type ModelsGetResponse = OperationResponse<"models.get">;

export type ModelsListRequest = OperationRequest<"models.list">;
export type ModelsListResponse = OperationResponse<"models.list">;

export type ModelsProvidersDeleteRequest = OperationRequest<"models.providers.delete">;
export type ModelsProvidersDeleteResponse = OperationResponse<"models.providers.delete">;

export type ModelsProvidersGetRequest = OperationRequest<"models.providers.get">;
export type ModelsProvidersGetResponse = OperationResponse<"models.providers.get">;

export type ModelsProvidersListRequest = OperationRequest<"models.providers.list">;
export type ModelsProvidersListResponse = OperationResponse<"models.providers.list">;

export type ModelsProvidersPutRequest = OperationRequest<"models.providers.put">;
export type ModelsProvidersPutResponse = OperationResponse<"models.providers.put">;

export type ModelsProvidersTestRequest = OperationRequest<"models.providers.test">;
export type ModelsProvidersTestResponse = OperationResponse<"models.providers.test">;

export type OperatorPackagesGetRequest = OperationRequest<"operator.packages.get">;
export type OperatorPackagesGetResponse = OperationResponse<"operator.packages.get">;

export type OperatorPackagesHealthRequest = OperationRequest<"operator.packages.health">;
export type OperatorPackagesHealthResponse = OperationResponse<"operator.packages.health">;

export type OperatorPackagesInstallRequest = OperationRequest<"operator.packages.install">;
export type OperatorPackagesInstallResponse = OperationResponse<"operator.packages.install">;

export type OperatorPackagesUninstallRequest = OperationRequest<"operator.packages.uninstall">;
export type OperatorPackagesUninstallResponse = OperationResponse<"operator.packages.uninstall">;

export type OperatorPackagesUpgradeRequest = OperationRequest<"operator.packages.upgrade">;
export type OperatorPackagesUpgradeResponse = OperationResponse<"operator.packages.upgrade">;

export type OrientationContractsRequest = OperationRequest<"orientation.contracts">;
export type OrientationContractsResponse = OperationResponse<"orientation.contracts">;

export type OrientationInventoryRequest = OperationRequest<"orientation.inventory">;
export type OrientationInventoryResponse = OperationResponse<"orientation.inventory">;

export type OrientationSchemasRequest = OperationRequest<"orientation.schemas">;
export type OrientationSchemasResponse = OperationResponse<"orientation.schemas">;

export type OrientationSummaryRequest = OperationRequest<"orientation.summary">;
export type OrientationSummaryResponse = OperationResponse<"orientation.summary">;

export type OrientationTaxonomyRequest = OperationRequest<"orientation.taxonomy">;
export type OrientationTaxonomyResponse = OperationResponse<"orientation.taxonomy">;

export type ProductControlPlaneCallRequest = OperationRequest<"productControlPlane.call">;
export type ProductControlPlaneCallResponse = OperationResponse<"productControlPlane.call">;

export type RecordIngestRequest = OperationRequest<"record.ingest">;
export type RecordIngestResponse = OperationResponse<"record.ingest">;

export type RecordsGetRequest = OperationRequest<"records.get">;
export type RecordsGetResponse = OperationResponse<"records.get">;

export type RecordsListRequest = OperationRequest<"records.list">;
export type RecordsListResponse = OperationResponse<"records.list">;

export type RecordsSearchRequest = OperationRequest<"records.search">;
export type RecordsSearchResponse = OperationResponse<"records.search">;

export type RolesCreateRequest = OperationRequest<"roles.create">;
export type RolesCreateResponse = OperationResponse<"roles.create">;

export type RolesDeleteRequest = OperationRequest<"roles.delete">;
export type RolesDeleteResponse = OperationResponse<"roles.delete">;

export type RolesGetRequest = OperationRequest<"roles.get">;
export type RolesGetResponse = OperationResponse<"roles.get">;

export type RolesListRequest = OperationRequest<"roles.list">;
export type RolesListResponse = OperationResponse<"roles.list">;

export type RolesUpdateRequest = OperationRequest<"roles.update">;
export type RolesUpdateResponse = OperationResponse<"roles.update">;

export type RuntimeHealthRequest = OperationRequest<"runtime.health">;
export type RuntimeHealthResponse = OperationResponse<"runtime.health">;

export type SandboxesCreateRequest = OperationRequest<"sandboxes.create">;
export type SandboxesCreateResponse = OperationResponse<"sandboxes.create">;

export type SandboxesDestroyRequest = OperationRequest<"sandboxes.destroy">;
export type SandboxesDestroyResponse = OperationResponse<"sandboxes.destroy">;

export type SandboxesExecRequest = OperationRequest<"sandboxes.exec">;
export type SandboxesExecResponse = OperationResponse<"sandboxes.exec">;

export type SandboxesForkRequest = OperationRequest<"sandboxes.fork">;
export type SandboxesForkResponse = OperationResponse<"sandboxes.fork">;

export type SandboxesGetRequest = OperationRequest<"sandboxes.get">;
export type SandboxesGetResponse = OperationResponse<"sandboxes.get">;

export type SandboxesListRequest = OperationRequest<"sandboxes.list">;
export type SandboxesListResponse = OperationResponse<"sandboxes.list">;

export type SandboxesResumeRequest = OperationRequest<"sandboxes.resume">;
export type SandboxesResumeResponse = OperationResponse<"sandboxes.resume">;

export type SandboxesRetainRequest = OperationRequest<"sandboxes.retain">;
export type SandboxesRetainResponse = OperationResponse<"sandboxes.retain">;

export type SchedulesCreateRequest = OperationRequest<"schedules.create">;
export type SchedulesCreateResponse = OperationResponse<"schedules.create">;

export type SchedulesDeleteRequest = OperationRequest<"schedules.delete">;
export type SchedulesDeleteResponse = OperationResponse<"schedules.delete">;

export type SchedulesGetRequest = OperationRequest<"schedules.get">;
export type SchedulesGetResponse = OperationResponse<"schedules.get">;

export type SchedulesListRequest = OperationRequest<"schedules.list">;
export type SchedulesListResponse = OperationResponse<"schedules.list">;

export type SchedulesTriggerRequest = OperationRequest<"schedules.trigger">;
export type SchedulesTriggerResponse = OperationResponse<"schedules.trigger">;

export type SchedulesUpdateRequest = OperationRequest<"schedules.update">;
export type SchedulesUpdateResponse = OperationResponse<"schedules.update">;

export type SearchRebuildRequest = OperationRequest<"search.rebuild">;
export type SearchRebuildResponse = OperationResponse<"search.rebuild">;

export type SearchStatusRequest = OperationRequest<"search.status">;
export type SearchStatusResponse = OperationResponse<"search.status">;

export type SkillsListRequest = OperationRequest<"skills.list">;
export type SkillsListResponse = OperationResponse<"skills.list">;

export type SkillsSearchRequest = OperationRequest<"skills.search">;
export type SkillsSearchResponse = OperationResponse<"skills.search">;

export type SkillsUseRequest = OperationRequest<"skills.use">;
export type SkillsUseResponse = OperationResponse<"skills.use">;

export type StatusRequest = OperationRequest<"status">;
export type StatusResponse = OperationResponse<"status">;

export type SystemPresenceRequest = OperationRequest<"system-presence">;
export type SystemPresenceResponse = OperationResponse<"system-presence">;

export type TalkModeRequest = OperationRequest<"talk.mode">;
export type TalkModeResponse = OperationResponse<"talk.mode">;

export type ToolsCatalogRequest = OperationRequest<"tools.catalog">;
export type ToolsCatalogResponse = OperationResponse<"tools.catalog">;

export type ToolsInvokeRequest = OperationRequest<"tools.invoke">;
export type ToolsInvokeResponse = OperationResponse<"tools.invoke">;

export type UpdateRunRequest = OperationRequest<"update.run">;
export type UpdateRunResponse = OperationResponse<"update.run">;

export type WizardCancelRequest = OperationRequest<"wizard.cancel">;
export type WizardCancelResponse = OperationResponse<"wizard.cancel">;

export type WizardNextRequest = OperationRequest<"wizard.next">;
export type WizardNextResponse = OperationResponse<"wizard.next">;

export type WizardStartRequest = OperationRequest<"wizard.start">;
export type WizardStartResponse = OperationResponse<"wizard.start">;

export type WizardStatusRequest = OperationRequest<"wizard.status">;
export type WizardStatusResponse = OperationResponse<"wizard.status">;

export type WorkspacesCreateRequest = OperationRequest<"workspaces.create">;
export type WorkspacesCreateResponse = OperationResponse<"workspaces.create">;

export type WorkspacesDeleteRequest = OperationRequest<"workspaces.delete">;
export type WorkspacesDeleteResponse = OperationResponse<"workspaces.delete">;

export type WorkspacesFilesDeleteRequest = OperationRequest<"workspaces.files.delete">;
export type WorkspacesFilesDeleteResponse = OperationResponse<"workspaces.files.delete">;

export type WorkspacesFilesGetRequest = OperationRequest<"workspaces.files.get">;
export type WorkspacesFilesGetResponse = OperationResponse<"workspaces.files.get">;

export type WorkspacesFilesListRequest = OperationRequest<"workspaces.files.list">;
export type WorkspacesFilesListResponse = OperationResponse<"workspaces.files.list">;

export type WorkspacesFilesSetRequest = OperationRequest<"workspaces.files.set">;
export type WorkspacesFilesSetResponse = OperationResponse<"workspaces.files.set">;

export type WorkspacesGetRequest = OperationRequest<"workspaces.get">;
export type WorkspacesGetResponse = OperationResponse<"workspaces.get">;

export type WorkspacesListRequest = OperationRequest<"workspaces.list">;
export type WorkspacesListResponse = OperationResponse<"workspaces.list">;

export type WorkspacesManifestGetRequest = OperationRequest<"workspaces.manifest.get">;
export type WorkspacesManifestGetResponse = OperationResponse<"workspaces.manifest.get">;

export type WorkspacesManifestUpdateRequest = OperationRequest<"workspaces.manifest.update">;
export type WorkspacesManifestUpdateResponse = OperationResponse<"workspaces.manifest.update">;

export interface Client {
  "acl": {
    "approval": {
      "request": (request: AclApprovalRequestRequest, options?: RequestOptions) => Promise<AclApprovalRequestResponse>;
    };
    "audit": {
      "get": (request: AclAuditGetRequest, options?: RequestOptions) => Promise<AclAuditGetResponse>;
      "list": (request: AclAuditListRequest, options?: RequestOptions) => Promise<AclAuditListResponse>;
      "stats": (request: AclAuditStatsRequest, options?: RequestOptions) => Promise<AclAuditStatsResponse>;
    };
    "evaluate": (request: AclEvaluateRequest, options?: RequestOptions) => Promise<AclEvaluateResponse>;
    "policies": {
      "create": (request: AclPoliciesCreateRequest, options?: RequestOptions) => Promise<AclPoliciesCreateResponse>;
      "delete": (request: AclPoliciesDeleteRequest, options?: RequestOptions) => Promise<AclPoliciesDeleteResponse>;
      "disable": (request: AclPoliciesDisableRequest, options?: RequestOptions) => Promise<AclPoliciesDisableResponse>;
      "enable": (request: AclPoliciesEnableRequest, options?: RequestOptions) => Promise<AclPoliciesEnableResponse>;
      "get": (request: AclPoliciesGetRequest, options?: RequestOptions) => Promise<AclPoliciesGetResponse>;
      "list": (request: AclPoliciesListRequest, options?: RequestOptions) => Promise<AclPoliciesListResponse>;
      "update": (request: AclPoliciesUpdateRequest, options?: RequestOptions) => Promise<AclPoliciesUpdateResponse>;
    };
    "requests": {
      "approve": (request: AclRequestsApproveRequest, options?: RequestOptions) => Promise<AclRequestsApproveResponse>;
      "deny": (request: AclRequestsDenyRequest, options?: RequestOptions) => Promise<AclRequestsDenyResponse>;
      "list": (request: AclRequestsListRequest, options?: RequestOptions) => Promise<AclRequestsListResponse>;
      "show": (request: AclRequestsShowRequest, options?: RequestOptions) => Promise<AclRequestsShowResponse>;
    };
  };
  "adapter": {
    "accounts": {
      "list": (request: AdapterAccountsListRequest, options?: RequestOptions) => Promise<AdapterAccountsListResponse>;
    };
    "health": (request: AdapterHealthRequest, options?: RequestOptions) => Promise<AdapterHealthResponse>;
    "info": (request: AdapterInfoRequest, options?: RequestOptions) => Promise<AdapterInfoResponse>;
    "monitor": {
      "start": (request: AdapterMonitorStartRequest, options?: RequestOptions) => Promise<AdapterMonitorStartResponse>;
      "stop": (request: AdapterMonitorStopRequest, options?: RequestOptions) => Promise<AdapterMonitorStopResponse>;
    };
    "serve": {
      "start": (request: AdapterServeStartRequest, options?: RequestOptions) => Promise<AdapterServeStartResponse>;
    };
    "setup": {
      "cancel": (request: AdapterSetupCancelRequest, options?: RequestOptions) => Promise<AdapterSetupCancelResponse>;
      "start": (request: AdapterSetupStartRequest, options?: RequestOptions) => Promise<AdapterSetupStartResponse>;
      "status": (request: AdapterSetupStatusRequest, options?: RequestOptions) => Promise<AdapterSetupStatusResponse>;
      "submit": (request: AdapterSetupSubmitRequest, options?: RequestOptions) => Promise<AdapterSetupSubmitResponse>;
    };
  };
  "adapters": {
    "connections": {
      "backfill": (request: AdaptersConnectionsBackfillRequest, options?: RequestOptions) => Promise<AdaptersConnectionsBackfillResponse>;
      "create": (request: AdaptersConnectionsCreateRequest, options?: RequestOptions) => Promise<AdaptersConnectionsCreateResponse>;
      "credentials": {
        "get": (request: AdaptersConnectionsCredentialsGetRequest, options?: RequestOptions) => Promise<AdaptersConnectionsCredentialsGetResponse>;
      };
      "custom": {
        "cancel": (request: AdaptersConnectionsCustomCancelRequest, options?: RequestOptions) => Promise<AdaptersConnectionsCustomCancelResponse>;
        "start": (request: AdaptersConnectionsCustomStartRequest, options?: RequestOptions) => Promise<AdaptersConnectionsCustomStartResponse>;
        "status": (request: AdaptersConnectionsCustomStatusRequest, options?: RequestOptions) => Promise<AdaptersConnectionsCustomStatusResponse>;
        "submit": (request: AdaptersConnectionsCustomSubmitRequest, options?: RequestOptions) => Promise<AdaptersConnectionsCustomSubmitResponse>;
      };
      "disconnect": (request: AdaptersConnectionsDisconnectRequest, options?: RequestOptions) => Promise<AdaptersConnectionsDisconnectResponse>;
      "get": (request: AdaptersConnectionsGetRequest, options?: RequestOptions) => Promise<AdaptersConnectionsGetResponse>;
      "list": (request: AdaptersConnectionsListRequest, options?: RequestOptions) => Promise<AdaptersConnectionsListResponse>;
      "oauth": {
        "complete": (request: AdaptersConnectionsOauthCompleteRequest, options?: RequestOptions) => Promise<AdaptersConnectionsOauthCompleteResponse>;
        "start": (request: AdaptersConnectionsOauthStartRequest, options?: RequestOptions) => Promise<AdaptersConnectionsOauthStartResponse>;
      };
      "status": (request: AdaptersConnectionsStatusRequest, options?: RequestOptions) => Promise<AdaptersConnectionsStatusResponse>;
      "test": (request: AdaptersConnectionsTestRequest, options?: RequestOptions) => Promise<AdaptersConnectionsTestResponse>;
      "update": (request: AdaptersConnectionsUpdateRequest, options?: RequestOptions) => Promise<AdaptersConnectionsUpdateResponse>;
      "upload": (request: AdaptersConnectionsUploadRequest, options?: RequestOptions) => Promise<AdaptersConnectionsUploadResponse>;
    };
    "methods": (request: AdaptersMethodsRequest, options?: RequestOptions) => Promise<AdaptersMethodsResponse>;
  };
  "agents": {
    "configs": {
      "create": (request: AgentsConfigsCreateRequest, options?: RequestOptions) => Promise<AgentsConfigsCreateResponse>;
      "delete": (request: AgentsConfigsDeleteRequest, options?: RequestOptions) => Promise<AgentsConfigsDeleteResponse>;
      "get": (request: AgentsConfigsGetRequest, options?: RequestOptions) => Promise<AgentsConfigsGetResponse>;
      "list": (request: AgentsConfigsListRequest, options?: RequestOptions) => Promise<AgentsConfigsListResponse>;
      "update": (request: AgentsConfigsUpdateRequest, options?: RequestOptions) => Promise<AgentsConfigsUpdateResponse>;
    };
    "conversations": {
      "abort": (request: AgentsConversationsAbortRequest, options?: RequestOptions) => Promise<AgentsConversationsAbortResponse>;
      "get": (request: AgentsConversationsGetRequest, options?: RequestOptions) => Promise<AgentsConversationsGetResponse>;
      "history": (request: AgentsConversationsHistoryRequest, options?: RequestOptions) => Promise<AgentsConversationsHistoryResponse>;
      "list": (request: AgentsConversationsListRequest, options?: RequestOptions) => Promise<AgentsConversationsListResponse>;
      "search": (request: AgentsConversationsSearchRequest, options?: RequestOptions) => Promise<AgentsConversationsSearchResponse>;
      "send": (request: AgentsConversationsSendRequest, options?: RequestOptions) => Promise<AgentsConversationsSendResponse>;
    };
    "create": (request: AgentsCreateRequest, options?: RequestOptions) => Promise<AgentsCreateResponse>;
    "delete": (request: AgentsDeleteRequest, options?: RequestOptions) => Promise<AgentsDeleteResponse>;
    "files": {
      "get": (request: AgentsFilesGetRequest, options?: RequestOptions) => Promise<AgentsFilesGetResponse>;
      "list": (request: AgentsFilesListRequest, options?: RequestOptions) => Promise<AgentsFilesListResponse>;
      "set": (request: AgentsFilesSetRequest, options?: RequestOptions) => Promise<AgentsFilesSetResponse>;
    };
    "identity": {
      "get": (request: AgentsIdentityGetRequest, options?: RequestOptions) => Promise<AgentsIdentityGetResponse>;
    };
    "list": (request: AgentsListRequest, options?: RequestOptions) => Promise<AgentsListResponse>;
    "sessions": {
      "archive": (request: AgentsSessionsArchiveRequest, options?: RequestOptions) => Promise<AgentsSessionsArchiveResponse>;
      "compact": (request: AgentsSessionsCompactRequest, options?: RequestOptions) => Promise<AgentsSessionsCompactResponse>;
      "create": (request: AgentsSessionsCreateRequest, options?: RequestOptions) => Promise<AgentsSessionsCreateResponse>;
      "fork": (request: AgentsSessionsForkRequest, options?: RequestOptions) => Promise<AgentsSessionsForkResponse>;
      "get": (request: AgentsSessionsGetRequest, options?: RequestOptions) => Promise<AgentsSessionsGetResponse>;
      "history": (request: AgentsSessionsHistoryRequest, options?: RequestOptions) => Promise<AgentsSessionsHistoryResponse>;
      "import": {
        "chunk": (request: AgentsSessionsImportChunkRequest, options?: RequestOptions) => Promise<AgentsSessionsImportChunkResponse>;
        "execute": (request: AgentsSessionsImportExecuteRequest, options?: RequestOptions) => Promise<AgentsSessionsImportExecuteResponse>;
      };
      "imports": {
        "list": (request: AgentsSessionsImportsListRequest, options?: RequestOptions) => Promise<AgentsSessionsImportsListResponse>;
      };
      "list": (request: AgentsSessionsListRequest, options?: RequestOptions) => Promise<AgentsSessionsListResponse>;
      "patch": (request: AgentsSessionsPatchRequest, options?: RequestOptions) => Promise<AgentsSessionsPatchResponse>;
      "preview": (request: AgentsSessionsPreviewRequest, options?: RequestOptions) => Promise<AgentsSessionsPreviewResponse>;
      "reset": (request: AgentsSessionsResetRequest, options?: RequestOptions) => Promise<AgentsSessionsResetResponse>;
      "resolve": (request: AgentsSessionsResolveRequest, options?: RequestOptions) => Promise<AgentsSessionsResolveResponse>;
      "send": (request: AgentsSessionsSendRequest, options?: RequestOptions) => Promise<AgentsSessionsSendResponse>;
      "transfer": (request: AgentsSessionsTransferRequest, options?: RequestOptions) => Promise<AgentsSessionsTransferResponse>;
    };
    "update": (request: AgentsUpdateRequest, options?: RequestOptions) => Promise<AgentsUpdateResponse>;
    "wait": (request: AgentsWaitRequest, options?: RequestOptions) => Promise<AgentsWaitResponse>;
  };
  "apps": {
    "get": (request: AppsGetRequest, options?: RequestOptions) => Promise<AppsGetResponse>;
    "install": (request: AppsInstallRequest, options?: RequestOptions) => Promise<AppsInstallResponse>;
    "list": (request: AppsListRequest, options?: RequestOptions) => Promise<AppsListResponse>;
    "logs": (request: AppsLogsRequest, options?: RequestOptions) => Promise<AppsLogsResponse>;
    "methods": (request: AppsMethodsRequest, options?: RequestOptions) => Promise<AppsMethodsResponse>;
    "start": (request: AppsStartRequest, options?: RequestOptions) => Promise<AppsStartResponse>;
    "status": (request: AppsStatusRequest, options?: RequestOptions) => Promise<AppsStatusResponse>;
    "stop": (request: AppsStopRequest, options?: RequestOptions) => Promise<AppsStopResponse>;
    "uninstall": (request: AppsUninstallRequest, options?: RequestOptions) => Promise<AppsUninstallResponse>;
  };
  "auth": {
    "login": (request: AuthLoginRequest, options?: RequestOptions) => Promise<AuthLoginResponse>;
    "tokens": {
      "create": (request: AuthTokensCreateRequest, options?: RequestOptions) => Promise<AuthTokensCreateResponse>;
      "list": (request: AuthTokensListRequest, options?: RequestOptions) => Promise<AuthTokensListResponse>;
      "revoke": (request: AuthTokensRevokeRequest, options?: RequestOptions) => Promise<AuthTokensRevokeResponse>;
      "rotate": (request: AuthTokensRotateRequest, options?: RequestOptions) => Promise<AuthTokensRotateResponse>;
    };
    "users": {
      "create": (request: AuthUsersCreateRequest, options?: RequestOptions) => Promise<AuthUsersCreateResponse>;
      "list": (request: AuthUsersListRequest, options?: RequestOptions) => Promise<AuthUsersListResponse>;
      "setPassword": (request: AuthUsersSetPasswordRequest, options?: RequestOptions) => Promise<AuthUsersSetPasswordResponse>;
    };
  };
  "browser": {
    "request": (request: BrowserRequestRequest, options?: RequestOptions) => Promise<BrowserRequestResponse>;
  };
  "channels": {
    "create": (request: ChannelsCreateRequest, options?: RequestOptions) => Promise<ChannelsCreateResponse>;
    "delete": (request: ChannelsDeleteRequest, options?: RequestOptions) => Promise<ChannelsDeleteResponse>;
    "edit": (request: ChannelsEditRequest, options?: RequestOptions) => Promise<ChannelsEditResponse>;
    "get": (request: ChannelsGetRequest, options?: RequestOptions) => Promise<ChannelsGetResponse>;
    "history": (request: ChannelsHistoryRequest, options?: RequestOptions) => Promise<ChannelsHistoryResponse>;
    "list": (request: ChannelsListRequest, options?: RequestOptions) => Promise<ChannelsListResponse>;
    "participants": {
      "get": (request: ChannelsParticipantsGetRequest, options?: RequestOptions) => Promise<ChannelsParticipantsGetResponse>;
      "history": (request: ChannelsParticipantsHistoryRequest, options?: RequestOptions) => Promise<ChannelsParticipantsHistoryResponse>;
      "list": (request: ChannelsParticipantsListRequest, options?: RequestOptions) => Promise<ChannelsParticipantsListResponse>;
    };
    "react": (request: ChannelsReactRequest, options?: RequestOptions) => Promise<ChannelsReactResponse>;
    "resolve": (request: ChannelsResolveRequest, options?: RequestOptions) => Promise<ChannelsResolveResponse>;
    "search": (request: ChannelsSearchRequest, options?: RequestOptions) => Promise<ChannelsSearchResponse>;
    "send": (request: ChannelsSendRequest, options?: RequestOptions) => Promise<ChannelsSendResponse>;
    "status": (request: ChannelsStatusRequest, options?: RequestOptions) => Promise<ChannelsStatusResponse>;
    "stream": (request: ChannelsStreamRequest, options?: RequestOptions) => Promise<ChannelsStreamResponse>;
    "update": (request: ChannelsUpdateRequest, options?: RequestOptions) => Promise<ChannelsUpdateResponse>;
  };
  "config": {
    "apply": (request: ConfigApplyRequest, options?: RequestOptions) => Promise<ConfigApplyResponse>;
    "get": (request: ConfigGetRequest, options?: RequestOptions) => Promise<ConfigGetResponse>;
    "patch": (request: ConfigPatchRequest, options?: RequestOptions) => Promise<ConfigPatchResponse>;
    "schema": (request: ConfigSchemaRequest, options?: RequestOptions) => Promise<ConfigSchemaResponse>;
    "set": (request: ConfigSetRequest, options?: RequestOptions) => Promise<ConfigSetResponse>;
  };
  "contacts": {
    "create": (request: ContactsCreateRequest, options?: RequestOptions) => Promise<ContactsCreateResponse>;
    "get": (request: ContactsGetRequest, options?: RequestOptions) => Promise<ContactsGetResponse>;
    "history": (request: ContactsHistoryRequest, options?: RequestOptions) => Promise<ContactsHistoryResponse>;
    "import": (request: ContactsImportRequest, options?: RequestOptions) => Promise<ContactsImportResponse>;
    "list": (request: ContactsListRequest, options?: RequestOptions) => Promise<ContactsListResponse>;
    "search": (request: ContactsSearchRequest, options?: RequestOptions) => Promise<ContactsSearchResponse>;
    "update": (request: ContactsUpdateRequest, options?: RequestOptions) => Promise<ContactsUpdateResponse>;
  };
  "credentials": {
    "create": (request: CredentialsCreateRequest, options?: RequestOptions) => Promise<CredentialsCreateResponse>;
    "get": (request: CredentialsGetRequest, options?: RequestOptions) => Promise<CredentialsGetResponse>;
    "list": (request: CredentialsListRequest, options?: RequestOptions) => Promise<CredentialsListResponse>;
    "resolve": (request: CredentialsResolveRequest, options?: RequestOptions) => Promise<CredentialsResolveResponse>;
    "revoke": (request: CredentialsRevokeRequest, options?: RequestOptions) => Promise<CredentialsRevokeResponse>;
    "update": (request: CredentialsUpdateRequest, options?: RequestOptions) => Promise<CredentialsUpdateResponse>;
    "vault": {
      "retrieve": (request: CredentialsVaultRetrieveRequest, options?: RequestOptions) => Promise<CredentialsVaultRetrieveResponse>;
      "store": (request: CredentialsVaultStoreRequest, options?: RequestOptions) => Promise<CredentialsVaultStoreResponse>;
    };
  };
  "dags": {
    "create": (request: DagsCreateRequest, options?: RequestOptions) => Promise<DagsCreateResponse>;
    "delete": (request: DagsDeleteRequest, options?: RequestOptions) => Promise<DagsDeleteResponse>;
    "get": (request: DagsGetRequest, options?: RequestOptions) => Promise<DagsGetResponse>;
    "list": (request: DagsListRequest, options?: RequestOptions) => Promise<DagsListResponse>;
    "runs": {
      "cancel": (request: DagsRunsCancelRequest, options?: RequestOptions) => Promise<DagsRunsCancelResponse>;
      "get": (request: DagsRunsGetRequest, options?: RequestOptions) => Promise<DagsRunsGetResponse>;
      "list": (request: DagsRunsListRequest, options?: RequestOptions) => Promise<DagsRunsListResponse>;
      "pause": (request: DagsRunsPauseRequest, options?: RequestOptions) => Promise<DagsRunsPauseResponse>;
      "resume": (request: DagsRunsResumeRequest, options?: RequestOptions) => Promise<DagsRunsResumeResponse>;
      "start": (request: DagsRunsStartRequest, options?: RequestOptions) => Promise<DagsRunsStartResponse>;
    };
    "update": (request: DagsUpdateRequest, options?: RequestOptions) => Promise<DagsUpdateResponse>;
  };
  "entities": {
    "create": (request: EntitiesCreateRequest, options?: RequestOptions) => Promise<EntitiesCreateResponse>;
    "get": (request: EntitiesGetRequest, options?: RequestOptions) => Promise<EntitiesGetResponse>;
    "list": (request: EntitiesListRequest, options?: RequestOptions) => Promise<EntitiesListResponse>;
    "merge": {
      "apply": (request: EntitiesMergeApplyRequest, options?: RequestOptions) => Promise<EntitiesMergeApplyResponse>;
      "candidates": (request: EntitiesMergeCandidatesRequest, options?: RequestOptions) => Promise<EntitiesMergeCandidatesResponse>;
      "propose": (request: EntitiesMergeProposeRequest, options?: RequestOptions) => Promise<EntitiesMergeProposeResponse>;
      "resolve": (request: EntitiesMergeResolveRequest, options?: RequestOptions) => Promise<EntitiesMergeResolveResponse>;
    };
    "resolve": (request: EntitiesResolveRequest, options?: RequestOptions) => Promise<EntitiesResolveResponse>;
    "tags": {
      "add": (request: EntitiesTagsAddRequest, options?: RequestOptions) => Promise<EntitiesTagsAddResponse>;
      "list": (request: EntitiesTagsListRequest, options?: RequestOptions) => Promise<EntitiesTagsListResponse>;
      "remove": (request: EntitiesTagsRemoveRequest, options?: RequestOptions) => Promise<EntitiesTagsRemoveResponse>;
    };
    "update": (request: EntitiesUpdateRequest, options?: RequestOptions) => Promise<EntitiesUpdateResponse>;
  };
  "events": {
    "publish": (request: EventsPublishRequest, options?: RequestOptions) => Promise<EventsPublishResponse>;
    "subscribe": (request: EventsSubscribeRequest, options?: RequestOptions) => Promise<EventsSubscribeResponse>;
    "subscriptions": {
      "create": (request: EventsSubscriptionsCreateRequest, options?: RequestOptions) => Promise<EventsSubscriptionsCreateResponse>;
      "delete": (request: EventsSubscriptionsDeleteRequest, options?: RequestOptions) => Promise<EventsSubscriptionsDeleteResponse>;
      "get": (request: EventsSubscriptionsGetRequest, options?: RequestOptions) => Promise<EventsSubscriptionsGetResponse>;
      "list": (request: EventsSubscriptionsListRequest, options?: RequestOptions) => Promise<EventsSubscriptionsListResponse>;
      "update": (request: EventsSubscriptionsUpdateRequest, options?: RequestOptions) => Promise<EventsSubscriptionsUpdateResponse>;
    };
    "unsubscribe": (request: EventsUnsubscribeRequest, options?: RequestOptions) => Promise<EventsUnsubscribeResponse>;
  };
  "groups": {
    "create": (request: GroupsCreateRequest, options?: RequestOptions) => Promise<GroupsCreateResponse>;
    "delete": (request: GroupsDeleteRequest, options?: RequestOptions) => Promise<GroupsDeleteResponse>;
    "get": (request: GroupsGetRequest, options?: RequestOptions) => Promise<GroupsGetResponse>;
    "list": (request: GroupsListRequest, options?: RequestOptions) => Promise<GroupsListResponse>;
    "members": {
      "add": (request: GroupsMembersAddRequest, options?: RequestOptions) => Promise<GroupsMembersAddResponse>;
      "list": (request: GroupsMembersListRequest, options?: RequestOptions) => Promise<GroupsMembersListResponse>;
      "remove": (request: GroupsMembersRemoveRequest, options?: RequestOptions) => Promise<GroupsMembersRemoveResponse>;
    };
    "update": (request: GroupsUpdateRequest, options?: RequestOptions) => Promise<GroupsUpdateResponse>;
  };
  "jobs": {
    "cancel": (request: JobsCancelRequest, options?: RequestOptions) => Promise<JobsCancelResponse>;
    "create": (request: JobsCreateRequest, options?: RequestOptions) => Promise<JobsCreateResponse>;
    "delete": (request: JobsDeleteRequest, options?: RequestOptions) => Promise<JobsDeleteResponse>;
    "get": (request: JobsGetRequest, options?: RequestOptions) => Promise<JobsGetResponse>;
    "invoke": (request: JobsInvokeRequest, options?: RequestOptions) => Promise<JobsInvokeResponse>;
    "list": (request: JobsListRequest, options?: RequestOptions) => Promise<JobsListResponse>;
    "queue": {
      "get": (request: JobsQueueGetRequest, options?: RequestOptions) => Promise<JobsQueueGetResponse>;
      "list": (request: JobsQueueListRequest, options?: RequestOptions) => Promise<JobsQueueListResponse>;
    };
    "requeue": (request: JobsRequeueRequest, options?: RequestOptions) => Promise<JobsRequeueResponse>;
    "retry": (request: JobsRetryRequest, options?: RequestOptions) => Promise<JobsRetryResponse>;
    "runs": {
      "get": (request: JobsRunsGetRequest, options?: RequestOptions) => Promise<JobsRunsGetResponse>;
      "list": (request: JobsRunsListRequest, options?: RequestOptions) => Promise<JobsRunsListResponse>;
    };
    "update": (request: JobsUpdateRequest, options?: RequestOptions) => Promise<JobsUpdateResponse>;
  };
  "logs": {
    "tail": (request: LogsTailRequest, options?: RequestOptions) => Promise<LogsTailResponse>;
  };
  "memory": {
    "elements": {
      "consolidate": (request: MemoryElementsConsolidateRequest, options?: RequestOptions) => Promise<MemoryElementsConsolidateResponse>;
      "create": (request: MemoryElementsCreateRequest, options?: RequestOptions) => Promise<MemoryElementsCreateResponse>;
      "definitions": {
        "create": (request: MemoryElementsDefinitionsCreateRequest, options?: RequestOptions) => Promise<MemoryElementsDefinitionsCreateResponse>;
        "get": (request: MemoryElementsDefinitionsGetRequest, options?: RequestOptions) => Promise<MemoryElementsDefinitionsGetResponse>;
        "list": (request: MemoryElementsDefinitionsListRequest, options?: RequestOptions) => Promise<MemoryElementsDefinitionsListResponse>;
      };
      "entities": {
        "link": (request: MemoryElementsEntitiesLinkRequest, options?: RequestOptions) => Promise<MemoryElementsEntitiesLinkResponse>;
        "list": (request: MemoryElementsEntitiesListRequest, options?: RequestOptions) => Promise<MemoryElementsEntitiesListResponse>;
      };
      "get": (request: MemoryElementsGetRequest, options?: RequestOptions) => Promise<MemoryElementsGetResponse>;
      "links": {
        "create": (request: MemoryElementsLinksCreateRequest, options?: RequestOptions) => Promise<MemoryElementsLinksCreateResponse>;
        "list": (request: MemoryElementsLinksListRequest, options?: RequestOptions) => Promise<MemoryElementsLinksListResponse>;
        "traverse": (request: MemoryElementsLinksTraverseRequest, options?: RequestOptions) => Promise<MemoryElementsLinksTraverseResponse>;
      };
      "list": (request: MemoryElementsListRequest, options?: RequestOptions) => Promise<MemoryElementsListResponse>;
      "resolve_head": (request: MemoryElementsResolveHeadRequest, options?: RequestOptions) => Promise<MemoryElementsResolveHeadResponse>;
      "search": (request: MemoryElementsSearchRequest, options?: RequestOptions) => Promise<MemoryElementsSearchResponse>;
      "update": (request: MemoryElementsUpdateRequest, options?: RequestOptions) => Promise<MemoryElementsUpdateResponse>;
    };
    "entities": {
      "confirm": (request: MemoryEntitiesConfirmRequest, options?: RequestOptions) => Promise<MemoryEntitiesConfirmResponse>;
      "create": (request: MemoryEntitiesCreateRequest, options?: RequestOptions) => Promise<MemoryEntitiesCreateResponse>;
      "propose_merge": (request: MemoryEntitiesProposeMergeRequest, options?: RequestOptions) => Promise<MemoryEntitiesProposeMergeResponse>;
    };
    "recall": (request: MemoryRecallRequest, options?: RequestOptions) => Promise<MemoryRecallResponse>;
    "review": {
      "entity": {
        "get": (request: MemoryReviewEntityGetRequest, options?: RequestOptions) => Promise<MemoryReviewEntityGetResponse>;
      };
      "episode": {
        "get": (request: MemoryReviewEpisodeGetRequest, options?: RequestOptions) => Promise<MemoryReviewEpisodeGetResponse>;
        "outputs": {
          "get": (request: MemoryReviewEpisodeOutputsGetRequest, options?: RequestOptions) => Promise<MemoryReviewEpisodeOutputsGetResponse>;
        };
      };
      "fact": {
        "get": (request: MemoryReviewFactGetRequest, options?: RequestOptions) => Promise<MemoryReviewFactGetResponse>;
      };
      "observation": {
        "get": (request: MemoryReviewObservationGetRequest, options?: RequestOptions) => Promise<MemoryReviewObservationGetResponse>;
      };
      "quality": {
        "items": {
          "list": (request: MemoryReviewQualityItemsListRequest, options?: RequestOptions) => Promise<MemoryReviewQualityItemsListResponse>;
        };
        "summary": (request: MemoryReviewQualitySummaryRequest, options?: RequestOptions) => Promise<MemoryReviewQualitySummaryResponse>;
      };
      "run": {
        "episodes": {
          "list": (request: MemoryReviewRunEpisodesListRequest, options?: RequestOptions) => Promise<MemoryReviewRunEpisodesListResponse>;
        };
        "get": (request: MemoryReviewRunGetRequest, options?: RequestOptions) => Promise<MemoryReviewRunGetResponse>;
      };
      "runs": {
        "list": (request: MemoryReviewRunsListRequest, options?: RequestOptions) => Promise<MemoryReviewRunsListResponse>;
      };
      "search": (request: MemoryReviewSearchRequest, options?: RequestOptions) => Promise<MemoryReviewSearchResponse>;
    };
    "sets": {
      "create": (request: MemorySetsCreateRequest, options?: RequestOptions) => Promise<MemorySetsCreateResponse>;
      "get": (request: MemorySetsGetRequest, options?: RequestOptions) => Promise<MemorySetsGetResponse>;
      "list": (request: MemorySetsListRequest, options?: RequestOptions) => Promise<MemorySetsListResponse>;
      "members": {
        "add": (request: MemorySetsMembersAddRequest, options?: RequestOptions) => Promise<MemorySetsMembersAddResponse>;
        "list": (request: MemorySetsMembersListRequest, options?: RequestOptions) => Promise<MemorySetsMembersListResponse>;
      };
    };
  };
  "models": {
    "catalog": {
      "get": (request: ModelsCatalogGetRequest, options?: RequestOptions) => Promise<ModelsCatalogGetResponse>;
      "list": (request: ModelsCatalogListRequest, options?: RequestOptions) => Promise<ModelsCatalogListResponse>;
    };
    "configs": {
      "create": (request: ModelsConfigsCreateRequest, options?: RequestOptions) => Promise<ModelsConfigsCreateResponse>;
      "delete": (request: ModelsConfigsDeleteRequest, options?: RequestOptions) => Promise<ModelsConfigsDeleteResponse>;
      "get": (request: ModelsConfigsGetRequest, options?: RequestOptions) => Promise<ModelsConfigsGetResponse>;
      "list": (request: ModelsConfigsListRequest, options?: RequestOptions) => Promise<ModelsConfigsListResponse>;
      "update": (request: ModelsConfigsUpdateRequest, options?: RequestOptions) => Promise<ModelsConfigsUpdateResponse>;
    };
    "defaults": {
      "get": (request: ModelsDefaultsGetRequest, options?: RequestOptions) => Promise<ModelsDefaultsGetResponse>;
      "put": (request: ModelsDefaultsPutRequest, options?: RequestOptions) => Promise<ModelsDefaultsPutResponse>;
    };
    "get": (request: ModelsGetRequest, options?: RequestOptions) => Promise<ModelsGetResponse>;
    "list": (request: ModelsListRequest, options?: RequestOptions) => Promise<ModelsListResponse>;
    "providers": {
      "delete": (request: ModelsProvidersDeleteRequest, options?: RequestOptions) => Promise<ModelsProvidersDeleteResponse>;
      "get": (request: ModelsProvidersGetRequest, options?: RequestOptions) => Promise<ModelsProvidersGetResponse>;
      "list": (request: ModelsProvidersListRequest, options?: RequestOptions) => Promise<ModelsProvidersListResponse>;
      "put": (request: ModelsProvidersPutRequest, options?: RequestOptions) => Promise<ModelsProvidersPutResponse>;
      "test": (request: ModelsProvidersTestRequest, options?: RequestOptions) => Promise<ModelsProvidersTestResponse>;
    };
  };
  "operator": {
    "packages": {
      "get": (request: OperatorPackagesGetRequest, options?: RequestOptions) => Promise<OperatorPackagesGetResponse>;
      "health": (request: OperatorPackagesHealthRequest, options?: RequestOptions) => Promise<OperatorPackagesHealthResponse>;
      "install": (request: OperatorPackagesInstallRequest, options?: RequestOptions) => Promise<OperatorPackagesInstallResponse>;
      "uninstall": (request: OperatorPackagesUninstallRequest, options?: RequestOptions) => Promise<OperatorPackagesUninstallResponse>;
      "upgrade": (request: OperatorPackagesUpgradeRequest, options?: RequestOptions) => Promise<OperatorPackagesUpgradeResponse>;
    };
  };
  "orientation": {
    "contracts": (request: OrientationContractsRequest, options?: RequestOptions) => Promise<OrientationContractsResponse>;
    "inventory": (request: OrientationInventoryRequest, options?: RequestOptions) => Promise<OrientationInventoryResponse>;
    "schemas": (request: OrientationSchemasRequest, options?: RequestOptions) => Promise<OrientationSchemasResponse>;
    "summary": (request: OrientationSummaryRequest, options?: RequestOptions) => Promise<OrientationSummaryResponse>;
    "taxonomy": (request: OrientationTaxonomyRequest, options?: RequestOptions) => Promise<OrientationTaxonomyResponse>;
  };
  "productControlPlane": {
    "call": (request: ProductControlPlaneCallRequest, options?: RequestOptions) => Promise<ProductControlPlaneCallResponse>;
  };
  "record": {
    "ingest": (request: RecordIngestRequest, options?: RequestOptions) => Promise<RecordIngestResponse>;
  };
  "records": {
    "get": (request: RecordsGetRequest, options?: RequestOptions) => Promise<RecordsGetResponse>;
    "list": (request: RecordsListRequest, options?: RequestOptions) => Promise<RecordsListResponse>;
    "search": (request: RecordsSearchRequest, options?: RequestOptions) => Promise<RecordsSearchResponse>;
  };
  "roles": {
    "create": (request: RolesCreateRequest, options?: RequestOptions) => Promise<RolesCreateResponse>;
    "delete": (request: RolesDeleteRequest, options?: RequestOptions) => Promise<RolesDeleteResponse>;
    "get": (request: RolesGetRequest, options?: RequestOptions) => Promise<RolesGetResponse>;
    "list": (request: RolesListRequest, options?: RequestOptions) => Promise<RolesListResponse>;
    "update": (request: RolesUpdateRequest, options?: RequestOptions) => Promise<RolesUpdateResponse>;
  };
  "runtime": {
    "health": (request: RuntimeHealthRequest, options?: RequestOptions) => Promise<RuntimeHealthResponse>;
  };
  "sandboxes": {
    "create": (request: SandboxesCreateRequest, options?: RequestOptions) => Promise<SandboxesCreateResponse>;
    "destroy": (request: SandboxesDestroyRequest, options?: RequestOptions) => Promise<SandboxesDestroyResponse>;
    "exec": (request: SandboxesExecRequest, options?: RequestOptions) => Promise<SandboxesExecResponse>;
    "fork": (request: SandboxesForkRequest, options?: RequestOptions) => Promise<SandboxesForkResponse>;
    "get": (request: SandboxesGetRequest, options?: RequestOptions) => Promise<SandboxesGetResponse>;
    "list": (request: SandboxesListRequest, options?: RequestOptions) => Promise<SandboxesListResponse>;
    "resume": (request: SandboxesResumeRequest, options?: RequestOptions) => Promise<SandboxesResumeResponse>;
    "retain": (request: SandboxesRetainRequest, options?: RequestOptions) => Promise<SandboxesRetainResponse>;
  };
  "schedules": {
    "create": (request: SchedulesCreateRequest, options?: RequestOptions) => Promise<SchedulesCreateResponse>;
    "delete": (request: SchedulesDeleteRequest, options?: RequestOptions) => Promise<SchedulesDeleteResponse>;
    "get": (request: SchedulesGetRequest, options?: RequestOptions) => Promise<SchedulesGetResponse>;
    "list": (request: SchedulesListRequest, options?: RequestOptions) => Promise<SchedulesListResponse>;
    "trigger": (request: SchedulesTriggerRequest, options?: RequestOptions) => Promise<SchedulesTriggerResponse>;
    "update": (request: SchedulesUpdateRequest, options?: RequestOptions) => Promise<SchedulesUpdateResponse>;
  };
  "search": {
    "rebuild": (request: SearchRebuildRequest, options?: RequestOptions) => Promise<SearchRebuildResponse>;
    "status": (request: SearchStatusRequest, options?: RequestOptions) => Promise<SearchStatusResponse>;
  };
  "skills": {
    "list": (request: SkillsListRequest, options?: RequestOptions) => Promise<SkillsListResponse>;
    "search": (request: SkillsSearchRequest, options?: RequestOptions) => Promise<SkillsSearchResponse>;
    "use": (request: SkillsUseRequest, options?: RequestOptions) => Promise<SkillsUseResponse>;
  };
  "status": (request: StatusRequest, options?: RequestOptions) => Promise<StatusResponse>;
  "system-presence": (request: SystemPresenceRequest, options?: RequestOptions) => Promise<SystemPresenceResponse>;
  "talk": {
    "mode": (request: TalkModeRequest, options?: RequestOptions) => Promise<TalkModeResponse>;
  };
  "tools": {
    "catalog": (request: ToolsCatalogRequest, options?: RequestOptions) => Promise<ToolsCatalogResponse>;
    "invoke": (request: ToolsInvokeRequest, options?: RequestOptions) => Promise<ToolsInvokeResponse>;
  };
  "update": {
    "run": (request: UpdateRunRequest, options?: RequestOptions) => Promise<UpdateRunResponse>;
  };
  "wizard": {
    "cancel": (request: WizardCancelRequest, options?: RequestOptions) => Promise<WizardCancelResponse>;
    "next": (request: WizardNextRequest, options?: RequestOptions) => Promise<WizardNextResponse>;
    "start": (request: WizardStartRequest, options?: RequestOptions) => Promise<WizardStartResponse>;
    "status": (request: WizardStatusRequest, options?: RequestOptions) => Promise<WizardStatusResponse>;
  };
  "workspaces": {
    "create": (request: WorkspacesCreateRequest, options?: RequestOptions) => Promise<WorkspacesCreateResponse>;
    "delete": (request: WorkspacesDeleteRequest, options?: RequestOptions) => Promise<WorkspacesDeleteResponse>;
    "files": {
      "delete": (request: WorkspacesFilesDeleteRequest, options?: RequestOptions) => Promise<WorkspacesFilesDeleteResponse>;
      "get": (request: WorkspacesFilesGetRequest, options?: RequestOptions) => Promise<WorkspacesFilesGetResponse>;
      "list": (request: WorkspacesFilesListRequest, options?: RequestOptions) => Promise<WorkspacesFilesListResponse>;
      "set": (request: WorkspacesFilesSetRequest, options?: RequestOptions) => Promise<WorkspacesFilesSetResponse>;
    };
    "get": (request: WorkspacesGetRequest, options?: RequestOptions) => Promise<WorkspacesGetResponse>;
    "list": (request: WorkspacesListRequest, options?: RequestOptions) => Promise<WorkspacesListResponse>;
    "manifest": {
      "get": (request: WorkspacesManifestGetRequest, options?: RequestOptions) => Promise<WorkspacesManifestGetResponse>;
      "update": (request: WorkspacesManifestUpdateRequest, options?: RequestOptions) => Promise<WorkspacesManifestUpdateResponse>;
    };
  };
}

export function createNexClient(options: ClientOptions): Client {
  const http = new HttpClient(options);
  return {
    "acl": {
      "approval": {
        "request": async (request: AclApprovalRequestRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AclApprovalRequestResponse>({
        method: "POST",
        path: "/runtime/operations/acl.approval.request",
        query: undefined,
        body: {
        "id": input["id"],
        "resources": input["resources"],
        "requesterId": input["requesterId"],
        "requesterChannel": input["requesterChannel"],
        "kind": input["kind"],
        "toolName": input["toolName"],
        "toolCallId": input["toolCallId"],
        "sessionKey": input["sessionKey"],
        "nexusRequestId": input["nexusRequestId"],
        "summary": input["summary"],
        "reason": input["reason"],
        "context": input["context"],
        "originalMessage": input["originalMessage"],
        "timeoutMs": input["timeoutMs"],
      },
        options,
      })
    },
      },
      "audit": {
        "get": async (request: AclAuditGetRequest, options?: RequestOptions) => {
      return http.request<AclAuditGetResponse>({
        method: "POST",
        path: "/runtime/operations/acl.audit.get",
        query: undefined,
        body: request,
        options,
      })
    },
        "list": async (request: AclAuditListRequest, options?: RequestOptions) => {
      return http.request<AclAuditListResponse>({
        method: "POST",
        path: "/runtime/operations/acl.audit.list",
        query: undefined,
        body: request,
        options,
      })
    },
        "stats": async (request: AclAuditStatsRequest, options?: RequestOptions) => {
      return http.request<AclAuditStatsResponse>({
        method: "POST",
        path: "/runtime/operations/acl.audit.stats",
        query: undefined,
        body: request,
        options,
      })
    },
      },
      "evaluate": async (request: AclEvaluateRequest, options?: RequestOptions) => {
      return http.request<AclEvaluateResponse>({
        method: "POST",
        path: "/runtime/operations/acl.evaluate",
        query: undefined,
        body: request,
        options,
      })
    },
      "policies": {
        "create": async (request: AclPoliciesCreateRequest, options?: RequestOptions) => {
      return http.request<AclPoliciesCreateResponse>({
        method: "POST",
        path: "/runtime/operations/acl.policies.create",
        query: undefined,
        body: request,
        options,
      })
    },
        "delete": async (request: AclPoliciesDeleteRequest, options?: RequestOptions) => {
      return http.request<AclPoliciesDeleteResponse>({
        method: "POST",
        path: "/runtime/operations/acl.policies.delete",
        query: undefined,
        body: request,
        options,
      })
    },
        "disable": async (request: AclPoliciesDisableRequest, options?: RequestOptions) => {
      return http.request<AclPoliciesDisableResponse>({
        method: "POST",
        path: "/runtime/operations/acl.policies.disable",
        query: undefined,
        body: request,
        options,
      })
    },
        "enable": async (request: AclPoliciesEnableRequest, options?: RequestOptions) => {
      return http.request<AclPoliciesEnableResponse>({
        method: "POST",
        path: "/runtime/operations/acl.policies.enable",
        query: undefined,
        body: request,
        options,
      })
    },
        "get": async (request: AclPoliciesGetRequest, options?: RequestOptions) => {
      return http.request<AclPoliciesGetResponse>({
        method: "POST",
        path: "/runtime/operations/acl.policies.get",
        query: undefined,
        body: request,
        options,
      })
    },
        "list": async (request: AclPoliciesListRequest, options?: RequestOptions) => {
      return http.request<AclPoliciesListResponse>({
        method: "POST",
        path: "/runtime/operations/acl.policies.list",
        query: undefined,
        body: request,
        options,
      })
    },
        "update": async (request: AclPoliciesUpdateRequest, options?: RequestOptions) => {
      return http.request<AclPoliciesUpdateResponse>({
        method: "POST",
        path: "/runtime/operations/acl.policies.update",
        query: undefined,
        body: request,
        options,
      })
    },
      },
      "requests": {
        "approve": async (request: AclRequestsApproveRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AclRequestsApproveResponse>({
        method: "POST",
        path: "/runtime/operations/acl.requests.approve",
        query: undefined,
        body: {
        "id": input["id"],
        "mode": input["mode"],
        "responder": input["responder"],
        "responseChannel": input["responseChannel"],
        "reason": input["reason"],
        "platform": input["platform"],
        "session": input["session"],
      },
        options,
      })
    },
        "deny": async (request: AclRequestsDenyRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AclRequestsDenyResponse>({
        method: "POST",
        path: "/runtime/operations/acl.requests.deny",
        query: undefined,
        body: {
        "id": input["id"],
        "responder": input["responder"],
        "responseChannel": input["responseChannel"],
      },
        options,
      })
    },
        "list": async (request: AclRequestsListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AclRequestsListResponse>({
        method: "POST",
        path: "/runtime/operations/acl.requests.list",
        query: undefined,
        body: {
        "status": input["status"],
        "requesterId": input["requesterId"],
        "includeExpired": input["includeExpired"],
        "limit": input["limit"],
        "offset": input["offset"],
      },
        options,
      })
    },
        "show": async (request: AclRequestsShowRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AclRequestsShowResponse>({
        method: "POST",
        path: "/runtime/operations/acl.requests.show",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      },
    },
    "adapter": {
      "accounts": {
        "list": async (request: AdapterAccountsListRequest, options?: RequestOptions) => {
      return http.request<AdapterAccountsListResponse>({
        method: "POST",
        path: "/runtime/operations/adapter.accounts.list",
        query: undefined,
        body: request,
        options,
      })
    },
      },
      "health": async (request: AdapterHealthRequest, options?: RequestOptions) => {
      return http.request<AdapterHealthResponse>({
        method: "POST",
        path: "/runtime/operations/adapter.health",
        query: undefined,
        body: request,
        options,
      })
    },
      "info": async (request: AdapterInfoRequest, options?: RequestOptions) => {
      return http.request<AdapterInfoResponse>({
        method: "POST",
        path: "/runtime/operations/adapter.info",
        query: undefined,
        body: request,
        options,
      })
    },
      "monitor": {
        "start": async (request: AdapterMonitorStartRequest, options?: RequestOptions) => {
      return http.request<AdapterMonitorStartResponse>({
        method: "POST",
        path: "/runtime/operations/adapter.monitor.start",
        query: undefined,
        body: request,
        options,
      })
    },
        "stop": async (request: AdapterMonitorStopRequest, options?: RequestOptions) => {
      return http.request<AdapterMonitorStopResponse>({
        method: "POST",
        path: "/runtime/operations/adapter.monitor.stop",
        query: undefined,
        body: request,
        options,
      })
    },
      },
      "serve": {
        "start": async (request: AdapterServeStartRequest, options?: RequestOptions) => {
      return http.request<AdapterServeStartResponse>({
        method: "POST",
        path: "/runtime/operations/adapter.serve.start",
        query: undefined,
        body: request,
        options,
      })
    },
      },
      "setup": {
        "cancel": async (request: AdapterSetupCancelRequest, options?: RequestOptions) => {
      return http.request<AdapterSetupCancelResponse>({
        method: "POST",
        path: "/runtime/operations/adapter.setup.cancel",
        query: undefined,
        body: request,
        options,
      })
    },
        "start": async (request: AdapterSetupStartRequest, options?: RequestOptions) => {
      return http.request<AdapterSetupStartResponse>({
        method: "POST",
        path: "/runtime/operations/adapter.setup.start",
        query: undefined,
        body: request,
        options,
      })
    },
        "status": async (request: AdapterSetupStatusRequest, options?: RequestOptions) => {
      return http.request<AdapterSetupStatusResponse>({
        method: "POST",
        path: "/runtime/operations/adapter.setup.status",
        query: undefined,
        body: request,
        options,
      })
    },
        "submit": async (request: AdapterSetupSubmitRequest, options?: RequestOptions) => {
      return http.request<AdapterSetupSubmitResponse>({
        method: "POST",
        path: "/runtime/operations/adapter.setup.submit",
        query: undefined,
        body: request,
        options,
      })
    },
      },
    },
    "adapters": {
      "connections": {
        "backfill": async (request: AdaptersConnectionsBackfillRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AdaptersConnectionsBackfillResponse>({
        method: "POST",
        path: "/runtime/operations/adapters.connections.backfill",
        query: undefined,
        body: {
        "connectionId": input["connectionId"],
        "since": input["since"],
        "to": input["to"],
      },
        options,
      })
    },
        "create": async (request: AdaptersConnectionsCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AdaptersConnectionsCreateResponse>({
        method: "POST",
        path: "/runtime/operations/adapters.connections.create",
        query: undefined,
        body: {
        "appId": input["appId"],
        "adapter": input["adapter"],
        "connectionProfileId": input["connectionProfileId"],
        "authMethodId": input["authMethodId"],
        "scope": input["scope"],
        "managedProfileId": input["managedProfileId"],
        "account": input["account"],
        "fields": input["fields"],
        "config": input["config"],
      },
        options,
      })
    },
        "credentials": {
          "get": async (request: AdaptersConnectionsCredentialsGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AdaptersConnectionsCredentialsGetResponse>({
        method: "POST",
        path: "/runtime/operations/adapters.connections.credentials.get",
        query: undefined,
        body: {
        "connection_id": input["connection_id"],
      },
        options,
      })
    },
        },
        "custom": {
          "cancel": async (request: AdaptersConnectionsCustomCancelRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AdaptersConnectionsCustomCancelResponse>({
        method: "POST",
        path: "/runtime/operations/adapters.connections.custom.cancel",
        query: undefined,
        body: {
        "adapter": input["adapter"],
        "sessionId": input["sessionId"],
        "account": input["account"],
      },
        options,
      })
    },
          "start": async (request: AdaptersConnectionsCustomStartRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AdaptersConnectionsCustomStartResponse>({
        method: "POST",
        path: "/runtime/operations/adapters.connections.custom.start",
        query: undefined,
        body: {
        "appId": input["appId"],
        "adapter": input["adapter"],
        "connectionProfileId": input["connectionProfileId"],
        "authMethodId": input["authMethodId"],
        "scope": input["scope"],
        "managedProfileId": input["managedProfileId"],
        "account": input["account"],
        "payload": input["payload"],
      },
        options,
      })
    },
          "status": async (request: AdaptersConnectionsCustomStatusRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AdaptersConnectionsCustomStatusResponse>({
        method: "POST",
        path: "/runtime/operations/adapters.connections.custom.status",
        query: undefined,
        body: {
        "adapter": input["adapter"],
        "sessionId": input["sessionId"],
        "account": input["account"],
      },
        options,
      })
    },
          "submit": async (request: AdaptersConnectionsCustomSubmitRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AdaptersConnectionsCustomSubmitResponse>({
        method: "POST",
        path: "/runtime/operations/adapters.connections.custom.submit",
        query: undefined,
        body: {
        "adapter": input["adapter"],
        "sessionId": input["sessionId"],
        "account": input["account"],
        "payload": input["payload"],
      },
        options,
      })
    },
        },
        "disconnect": async (request: AdaptersConnectionsDisconnectRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AdaptersConnectionsDisconnectResponse>({
        method: "POST",
        path: "/runtime/operations/adapters.connections.disconnect",
        query: undefined,
        body: {
        "connectionId": input["connectionId"],
      },
        options,
      })
    },
        "get": async (request: AdaptersConnectionsGetRequest, options?: RequestOptions) => {
      return http.request<AdaptersConnectionsGetResponse>({
        method: "POST",
        path: "/runtime/operations/adapters.connections.get",
        query: undefined,
        body: request,
        options,
      })
    },
        "list": async (request: AdaptersConnectionsListRequest, options?: RequestOptions) => {
      return http.request<AdaptersConnectionsListResponse>({
        method: "POST",
        path: "/runtime/operations/adapters.connections.list",
        query: undefined,
        body: request,
        options,
      })
    },
        "oauth": {
          "complete": async (request: AdaptersConnectionsOauthCompleteRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AdaptersConnectionsOauthCompleteResponse>({
        method: "POST",
        path: "/runtime/operations/adapters.connections.oauth.complete",
        query: undefined,
        body: {
        "adapter": input["adapter"],
        "code": input["code"],
        "state": input["state"],
      },
        options,
      })
    },
          "start": async (request: AdaptersConnectionsOauthStartRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AdaptersConnectionsOauthStartResponse>({
        method: "POST",
        path: "/runtime/operations/adapters.connections.oauth.start",
        query: undefined,
        body: {
        "appId": input["appId"],
        "adapter": input["adapter"],
        "connectionProfileId": input["connectionProfileId"],
        "authMethodId": input["authMethodId"],
        "scope": input["scope"],
        "managedProfileId": input["managedProfileId"],
        "redirectBaseUrl": input["redirectBaseUrl"],
      },
        options,
      })
    },
        },
        "status": async (request: AdaptersConnectionsStatusRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AdaptersConnectionsStatusResponse>({
        method: "POST",
        path: "/runtime/operations/adapters.connections.status",
        query: undefined,
        body: {
        "connectionId": input["connectionId"],
      },
        options,
      })
    },
        "test": async (request: AdaptersConnectionsTestRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AdaptersConnectionsTestResponse>({
        method: "POST",
        path: "/runtime/operations/adapters.connections.test",
        query: undefined,
        body: {
        "connectionId": input["connectionId"],
      },
        options,
      })
    },
        "update": async (request: AdaptersConnectionsUpdateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AdaptersConnectionsUpdateResponse>({
        method: "POST",
        path: "/runtime/operations/adapters.connections.update",
        query: undefined,
        body: {
        "connectionId": input["connectionId"],
        "appId": input["appId"],
        "adapter": input["adapter"],
        "connectionProfileId": input["connectionProfileId"],
        "authMethodId": input["authMethodId"],
        "scope": input["scope"],
        "managedProfileId": input["managedProfileId"],
        "account": input["account"],
        "fields": input["fields"],
        "config": input["config"],
      },
        options,
      })
    },
        "upload": async (request: AdaptersConnectionsUploadRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AdaptersConnectionsUploadResponse>({
        method: "POST",
        path: "/runtime/operations/adapters.connections.upload",
        query: undefined,
        body: {
        "appId": input["appId"],
        "adapter": input["adapter"],
        "connectionProfileId": input["connectionProfileId"],
        "authMethodId": input["authMethodId"],
        "scope": input["scope"],
        "managedProfileId": input["managedProfileId"],
        "fileName": input["fileName"],
        "filePath": input["filePath"],
      },
        options,
      })
    },
      },
      "methods": async (request: AdaptersMethodsRequest, options?: RequestOptions) => {
      return http.request<AdaptersMethodsResponse>({
        method: "POST",
        path: "/runtime/operations/adapters.methods",
        query: undefined,
        body: request,
        options,
      })
    },
    },
    "agents": {
      "configs": {
        "create": async (request: AgentsConfigsCreateRequest, options?: RequestOptions) => {
      return http.request<AgentsConfigsCreateResponse>({
        method: "POST",
        path: "/runtime/operations/agents.configs.create",
        query: undefined,
        body: request,
        options,
      })
    },
        "delete": async (request: AgentsConfigsDeleteRequest, options?: RequestOptions) => {
      return http.request<AgentsConfigsDeleteResponse>({
        method: "POST",
        path: "/runtime/operations/agents.configs.delete",
        query: undefined,
        body: request,
        options,
      })
    },
        "get": async (request: AgentsConfigsGetRequest, options?: RequestOptions) => {
      return http.request<AgentsConfigsGetResponse>({
        method: "POST",
        path: "/runtime/operations/agents.configs.get",
        query: undefined,
        body: request,
        options,
      })
    },
        "list": async (request: AgentsConfigsListRequest, options?: RequestOptions) => {
      return http.request<AgentsConfigsListResponse>({
        method: "POST",
        path: "/runtime/operations/agents.configs.list",
        query: undefined,
        body: request,
        options,
      })
    },
        "update": async (request: AgentsConfigsUpdateRequest, options?: RequestOptions) => {
      return http.request<AgentsConfigsUpdateResponse>({
        method: "POST",
        path: "/runtime/operations/agents.configs.update",
        query: undefined,
        body: request,
        options,
      })
    },
      },
      "conversations": {
        "abort": async (request: AgentsConversationsAbortRequest, options?: RequestOptions) => {
      return http.request<AgentsConversationsAbortResponse>({
        method: "POST",
        path: "/runtime/operations/agents.conversations.abort",
        query: undefined,
        body: request,
        options,
      })
    },
        "get": async (request: AgentsConversationsGetRequest, options?: RequestOptions) => {
      return http.request<AgentsConversationsGetResponse>({
        method: "POST",
        path: "/runtime/operations/agents.conversations.get",
        query: undefined,
        body: request,
        options,
      })
    },
        "history": async (request: AgentsConversationsHistoryRequest, options?: RequestOptions) => {
      return http.request<AgentsConversationsHistoryResponse>({
        method: "POST",
        path: "/runtime/operations/agents.conversations.history",
        query: undefined,
        body: request,
        options,
      })
    },
        "list": async (request: AgentsConversationsListRequest, options?: RequestOptions) => {
      return http.request<AgentsConversationsListResponse>({
        method: "POST",
        path: "/runtime/operations/agents.conversations.list",
        query: undefined,
        body: request,
        options,
      })
    },
        "search": async (request: AgentsConversationsSearchRequest, options?: RequestOptions) => {
      return http.request<AgentsConversationsSearchResponse>({
        method: "POST",
        path: "/runtime/operations/agents.conversations.search",
        query: undefined,
        body: request,
        options,
      })
    },
        "send": async (request: AgentsConversationsSendRequest, options?: RequestOptions) => {
      return http.request<AgentsConversationsSendResponse>({
        method: "POST",
        path: "/runtime/operations/agents.conversations.send",
        query: undefined,
        body: request,
        options,
      })
    },
      },
      "create": async (request: AgentsCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsCreateResponse>({
        method: "POST",
        path: "/runtime/operations/agents.create",
        query: undefined,
        body: {
        "name": input["name"],
        "workspace": input["workspace"],
        "emoji": input["emoji"],
        "avatar": input["avatar"],
      },
        options,
      })
    },
      "delete": async (request: AgentsDeleteRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsDeleteResponse>({
        method: "POST",
        path: "/runtime/operations/agents.delete",
        query: undefined,
        body: {
        "agentId": input["agentId"],
        "deleteFiles": input["deleteFiles"],
      },
        options,
      })
    },
      "files": {
        "get": async (request: AgentsFilesGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsFilesGetResponse>({
        method: "POST",
        path: "/runtime/operations/agents.files.get",
        query: undefined,
        body: {
        "agentId": input["agentId"],
        "name": input["name"],
      },
        options,
      })
    },
        "list": async (request: AgentsFilesListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsFilesListResponse>({
        method: "POST",
        path: "/runtime/operations/agents.files.list",
        query: undefined,
        body: {
        "agentId": input["agentId"],
      },
        options,
      })
    },
        "set": async (request: AgentsFilesSetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsFilesSetResponse>({
        method: "POST",
        path: "/runtime/operations/agents.files.set",
        query: undefined,
        body: {
        "agentId": input["agentId"],
        "name": input["name"],
        "content": input["content"],
      },
        options,
      })
    },
      },
      "identity": {
        "get": async (request: AgentsIdentityGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsIdentityGetResponse>({
        method: "POST",
        path: "/runtime/operations/agents.identity.get",
        query: undefined,
        body: {
        "agentId": input["agentId"],
        "sessionKey": input["sessionKey"],
      },
        options,
      })
    },
      },
      "list": async (request: AgentsListRequest, options?: RequestOptions) => {
      return http.request<AgentsListResponse>({
        method: "POST",
        path: "/runtime/operations/agents.list",
        query: undefined,
        body: request,
        options,
      })
    },
      "sessions": {
        "archive": async (request: AgentsSessionsArchiveRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsSessionsArchiveResponse>({
        method: "POST",
        path: "/runtime/operations/agents.sessions.archive",
        query: undefined,
        body: {
        "key": input["key"],
        "deleteTranscript": input["deleteTranscript"],
      },
        options,
      })
    },
        "compact": async (request: AgentsSessionsCompactRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsSessionsCompactResponse>({
        method: "POST",
        path: "/runtime/operations/agents.sessions.compact",
        query: undefined,
        body: {
        "key": input["key"],
        "maxLines": input["maxLines"],
      },
        options,
      })
    },
        "create": async (request: AgentsSessionsCreateRequest, options?: RequestOptions) => {
      return http.request<AgentsSessionsCreateResponse>({
        method: "POST",
        path: "/runtime/operations/agents.sessions.create",
        query: undefined,
        body: request,
        options,
      })
    },
        "fork": async (request: AgentsSessionsForkRequest, options?: RequestOptions) => {
      return http.request<AgentsSessionsForkResponse>({
        method: "POST",
        path: "/runtime/operations/agents.sessions.fork",
        query: undefined,
        body: request,
        options,
      })
    },
        "get": async (request: AgentsSessionsGetRequest, options?: RequestOptions) => {
      return http.request<AgentsSessionsGetResponse>({
        method: "POST",
        path: "/runtime/operations/agents.sessions.get",
        query: undefined,
        body: request,
        options,
      })
    },
        "history": async (request: AgentsSessionsHistoryRequest, options?: RequestOptions) => {
      return http.request<AgentsSessionsHistoryResponse>({
        method: "POST",
        path: "/runtime/operations/agents.sessions.history",
        query: undefined,
        body: request,
        options,
      })
    },
        "import": {
          "chunk": async (request: AgentsSessionsImportChunkRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsSessionsImportChunkResponse>({
        method: "POST",
        path: "/runtime/operations/agents.sessions.import.chunk",
        query: undefined,
        body: {
        "source": input["source"],
        "runId": input["runId"],
        "mode": input["mode"],
        "workspaceId": input["workspaceId"],
        "sourceEntityId": input["sourceEntityId"],
        "sourceContactId": input["sourceContactId"],
        "aixSourceId": input["aixSourceId"],
        "idempotencyKey": input["idempotencyKey"],
        "uploadId": input["uploadId"],
        "chunkIndex": input["chunkIndex"],
        "chunkTotal": input["chunkTotal"],
        "encoding": input["encoding"],
        "data": input["data"],
        "sourceProvider": input["sourceProvider"],
        "sourceSessionId": input["sourceSessionId"],
        "sourceSessionFingerprint": input["sourceSessionFingerprint"],
      },
        options,
      })
    },
          "execute": async (request: AgentsSessionsImportExecuteRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsSessionsImportExecuteResponse>({
        method: "POST",
        path: "/runtime/operations/agents.sessions.import.execute",
        query: undefined,
        body: {
        "source": input["source"],
        "runId": input["runId"],
        "mode": input["mode"],
        "workspaceId": input["workspaceId"],
        "sourceEntityId": input["sourceEntityId"],
        "sourceContactId": input["sourceContactId"],
        "aixSourceId": input["aixSourceId"],
        "idempotencyKey": input["idempotencyKey"],
        "items": input["items"],
      },
        options,
      })
    },
        },
        "imports": {
          "list": async (request: AgentsSessionsImportsListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsSessionsImportsListResponse>({
        method: "POST",
        path: "/runtime/operations/agents.sessions.imports.list",
        query: undefined,
        body: {
        "workspaceId": input["workspaceId"],
        "sourceEntityId": input["sourceEntityId"],
        "aixSourceId": input["aixSourceId"],
        "sourceProvider": input["sourceProvider"],
        "limit": input["limit"],
        "cursor": input["cursor"],
      },
        options,
      })
    },
        },
        "list": async (request: AgentsSessionsListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsSessionsListResponse>({
        method: "POST",
        path: "/runtime/operations/agents.sessions.list",
        query: undefined,
        body: {
        "limit": input["limit"],
        "activeMinutes": input["activeMinutes"],
        "includeGlobal": input["includeGlobal"],
        "includeUnknown": input["includeUnknown"],
        "includeDerivedTitles": input["includeDerivedTitles"],
        "includeLastMessage": input["includeLastMessage"],
        "session_key": input["session_key"],
        "spawnedBy": input["spawnedBy"],
        "agentId": input["agentId"],
        "search": input["search"],
      },
        options,
      })
    },
        "patch": async (request: AgentsSessionsPatchRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsSessionsPatchResponse>({
        method: "POST",
        path: "/runtime/operations/agents.sessions.patch",
        query: undefined,
        body: {
        "key": input["key"],
        "agent_config_id": input["agent_config_id"],
        "execution_host_kind": input["execution_host_kind"],
        "sandbox_id": input["sandbox_id"],
        "execution_host_config_json": input["execution_host_config_json"],
        "session_key": input["session_key"],
        "thinkingLevel": input["thinkingLevel"],
        "verboseLevel": input["verboseLevel"],
        "reasoningLevel": input["reasoningLevel"],
        "responseUsage": input["responseUsage"],
        "elevatedLevel": input["elevatedLevel"],
        "execHost": input["execHost"],
        "execSecurity": input["execSecurity"],
        "execAsk": input["execAsk"],
        "execNode": input["execNode"],
        "model": input["model"],
        "spawnedBy": input["spawnedBy"],
        "sendPolicy": input["sendPolicy"],
        "groupActivation": input["groupActivation"],
      },
        options,
      })
    },
        "preview": async (request: AgentsSessionsPreviewRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsSessionsPreviewResponse>({
        method: "POST",
        path: "/runtime/operations/agents.sessions.preview",
        query: undefined,
        body: {
        "keys": input["keys"],
        "limit": input["limit"],
        "maxChars": input["maxChars"],
      },
        options,
      })
    },
        "reset": async (request: AgentsSessionsResetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsSessionsResetResponse>({
        method: "POST",
        path: "/runtime/operations/agents.sessions.reset",
        query: undefined,
        body: {
        "key": input["key"],
      },
        options,
      })
    },
        "resolve": async (request: AgentsSessionsResolveRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsSessionsResolveResponse>({
        method: "POST",
        path: "/runtime/operations/agents.sessions.resolve",
        query: undefined,
        body: {
        "key": input["key"],
        "sessionId": input["sessionId"],
        "session_key": input["session_key"],
        "agentId": input["agentId"],
        "spawnedBy": input["spawnedBy"],
        "includeGlobal": input["includeGlobal"],
        "includeUnknown": input["includeUnknown"],
      },
        options,
      })
    },
        "send": async (request: AgentsSessionsSendRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsSessionsSendResponse>({
        method: "POST",
        path: "/runtime/operations/agents.sessions.send",
        query: undefined,
        body: {
        "session_key": input["session_key"],
        "message": input["message"],
        "thinking": input["thinking"],
        "deliver": input["deliver"],
        "attachments": input["attachments"],
        "timeout_ms": input["timeout_ms"],
        "idempotency_key": input["idempotency_key"],
      },
        options,
      })
    },
        "transfer": async (request: AgentsSessionsTransferRequest, options?: RequestOptions) => {
      return http.request<AgentsSessionsTransferResponse>({
        method: "POST",
        path: "/runtime/operations/agents.sessions.transfer",
        query: undefined,
        body: request,
        options,
      })
    },
      },
      "update": async (request: AgentsUpdateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsUpdateResponse>({
        method: "POST",
        path: "/runtime/operations/agents.update",
        query: undefined,
        body: {
        "agentId": input["agentId"],
        "name": input["name"],
        "workspace": input["workspace"],
        "model": input["model"],
        "avatar": input["avatar"],
      },
        options,
      })
    },
      "wait": async (request: AgentsWaitRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AgentsWaitResponse>({
        method: "POST",
        path: "/runtime/operations/agents.wait",
        query: undefined,
        body: {
        "runId": input["runId"],
        "timeoutMs": input["timeoutMs"],
      },
        options,
      })
    },
    },
    "apps": {
      "get": async (request: AppsGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AppsGetResponse>({
        method: "POST",
        path: "/runtime/operations/apps.get",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "install": async (request: AppsInstallRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AppsInstallResponse>({
        method: "POST",
        path: "/runtime/operations/apps.install",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "list": async (request: AppsListRequest, options?: RequestOptions) => {
      return http.request<AppsListResponse>({
        method: "POST",
        path: "/runtime/operations/apps.list",
        query: undefined,
        body: request,
        options,
      })
    },
      "logs": async (request: AppsLogsRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AppsLogsResponse>({
        method: "POST",
        path: "/runtime/operations/apps.logs",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "methods": async (request: AppsMethodsRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AppsMethodsResponse>({
        method: "POST",
        path: "/runtime/operations/apps.methods",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "start": async (request: AppsStartRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AppsStartResponse>({
        method: "POST",
        path: "/runtime/operations/apps.start",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "status": async (request: AppsStatusRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AppsStatusResponse>({
        method: "POST",
        path: "/runtime/operations/apps.status",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "stop": async (request: AppsStopRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AppsStopResponse>({
        method: "POST",
        path: "/runtime/operations/apps.stop",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "uninstall": async (request: AppsUninstallRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AppsUninstallResponse>({
        method: "POST",
        path: "/runtime/operations/apps.uninstall",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
    },
    "auth": {
      "login": async (request: AuthLoginRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AuthLoginResponse>({
        method: "POST",
        path: "/runtime/operations/auth.login",
        query: undefined,
        body: {
        "username": input["username"],
        "password": input["password"],
      },
        options,
      })
    },
      "tokens": {
        "create": async (request: AuthTokensCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AuthTokensCreateResponse>({
        method: "POST",
        path: "/runtime/operations/auth.tokens.create",
        query: undefined,
        body: {
        "entityId": input["entityId"],
        "role": input["role"],
        "scopes": input["scopes"],
        "label": input["label"],
        "expiresAt": input["expiresAt"],
      },
        options,
      })
    },
        "list": async (request: AuthTokensListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AuthTokensListResponse>({
        method: "POST",
        path: "/runtime/operations/auth.tokens.list",
        query: undefined,
        body: {
        "entityId": input["entityId"],
        "includeRevoked": input["includeRevoked"],
        "includeExpired": input["includeExpired"],
        "limit": input["limit"],
        "offset": input["offset"],
      },
        options,
      })
    },
        "revoke": async (request: AuthTokensRevokeRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AuthTokensRevokeResponse>({
        method: "POST",
        path: "/runtime/operations/auth.tokens.revoke",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
        "rotate": async (request: AuthTokensRotateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AuthTokensRotateResponse>({
        method: "POST",
        path: "/runtime/operations/auth.tokens.rotate",
        query: undefined,
        body: {
        "id": input["id"],
        "role": input["role"],
        "scopes": input["scopes"],
        "label": input["label"],
        "expiresAt": input["expiresAt"],
      },
        options,
      })
    },
      },
      "users": {
        "create": async (request: AuthUsersCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AuthUsersCreateResponse>({
        method: "POST",
        path: "/runtime/operations/auth.users.create",
        query: undefined,
        body: {
        "username": input["username"],
        "password": input["password"],
        "displayName": input["displayName"],
        "relationship": input["relationship"],
        "tags": input["tags"],
        "entityId": input["entityId"],
        "isOwner": input["isOwner"],
      },
        options,
      })
    },
        "list": async (request: AuthUsersListRequest, options?: RequestOptions) => {
      return http.request<AuthUsersListResponse>({
        method: "POST",
        path: "/runtime/operations/auth.users.list",
        query: undefined,
        body: request,
        options,
      })
    },
        "setPassword": async (request: AuthUsersSetPasswordRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<AuthUsersSetPasswordResponse>({
        method: "POST",
        path: "/runtime/operations/auth.users.setPassword",
        query: undefined,
        body: {
        "entityId": input["entityId"],
        "username": input["username"],
        "password": input["password"],
      },
        options,
      })
    },
      },
    },
    "browser": {
      "request": async (request: BrowserRequestRequest, options?: RequestOptions) => {
      return http.request<BrowserRequestResponse>({
        method: "POST",
        path: "/runtime/operations/browser.request",
        query: undefined,
        body: request,
        options,
      })
    },
    },
    "channels": {
      "create": async (request: ChannelsCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ChannelsCreateResponse>({
        method: "POST",
        path: "/runtime/operations/channels.create",
        query: undefined,
        body: {
        "id": input["id"],
        "platform": input["platform"],
        "connection_id": input["connection_id"],
        "space_id": input["space_id"],
        "space_name": input["space_name"],
        "container_id": input["container_id"],
        "container_kind": input["container_kind"],
        "container_name": input["container_name"],
        "thread_id": input["thread_id"],
        "thread_name": input["thread_name"],
        "metadata": input["metadata"],
        "metadata_json": input["metadata_json"],
      },
        options,
      })
    },
      "delete": async (request: ChannelsDeleteRequest, options?: RequestOptions) => {
      return http.request<ChannelsDeleteResponse>({
        method: "POST",
        path: "/runtime/operations/channels.delete",
        query: undefined,
        body: request,
        options,
      })
    },
      "edit": async (request: ChannelsEditRequest, options?: RequestOptions) => {
      return http.request<ChannelsEditResponse>({
        method: "POST",
        path: "/runtime/operations/channels.edit",
        query: undefined,
        body: request,
        options,
      })
    },
      "get": async (request: ChannelsGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ChannelsGetResponse>({
        method: "POST",
        path: "/runtime/operations/channels.get",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "history": async (request: ChannelsHistoryRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ChannelsHistoryResponse>({
        method: "POST",
        path: "/runtime/operations/channels.history",
        query: undefined,
        body: {
        "id": input["id"],
        "channel_id": input["channel_id"],
        "limit": input["limit"],
      },
        options,
      })
    },
      "list": async (request: ChannelsListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ChannelsListResponse>({
        method: "POST",
        path: "/runtime/operations/channels.list",
        query: undefined,
        body: {
        "platform": input["platform"],
        "connection_id": input["connection_id"],
        "container_kind": input["container_kind"],
        "space_id": input["space_id"],
        "limit": input["limit"],
        "offset": input["offset"],
      },
        options,
      })
    },
      "participants": {
        "get": async (request: ChannelsParticipantsGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ChannelsParticipantsGetResponse>({
        method: "POST",
        path: "/runtime/operations/channels.participants.get",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
        "history": async (request: ChannelsParticipantsHistoryRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ChannelsParticipantsHistoryResponse>({
        method: "POST",
        path: "/runtime/operations/channels.participants.history",
        query: undefined,
        body: {
        "channel_id": input["channel_id"],
        "limit": input["limit"],
      },
        options,
      })
    },
        "list": async (request: ChannelsParticipantsListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ChannelsParticipantsListResponse>({
        method: "POST",
        path: "/runtime/operations/channels.participants.list",
        query: undefined,
        body: {
        "channel_id": input["channel_id"],
      },
        options,
      })
    },
      },
      "react": async (request: ChannelsReactRequest, options?: RequestOptions) => {
      return http.request<ChannelsReactResponse>({
        method: "POST",
        path: "/runtime/operations/channels.react",
        query: undefined,
        body: request,
        options,
      })
    },
      "resolve": async (request: ChannelsResolveRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ChannelsResolveResponse>({
        method: "POST",
        path: "/runtime/operations/channels.resolve",
        query: undefined,
        body: {
        "id": input["id"],
        "channel_id": input["channel_id"],
        "platform": input["platform"],
        "connection_id": input["connection_id"],
        "container_id": input["container_id"],
        "container_kind": input["container_kind"],
        "container_name": input["container_name"],
        "thread_id": input["thread_id"],
        "thread_name": input["thread_name"],
        "space_id": input["space_id"],
        "space_name": input["space_name"],
        "materialize": input["materialize"],
        "materialize_if_missing": input["materialize_if_missing"],
        "metadata": input["metadata"],
        "metadata_json": input["metadata_json"],
      },
        options,
      })
    },
      "search": async (request: ChannelsSearchRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ChannelsSearchResponse>({
        method: "POST",
        path: "/runtime/operations/channels.search",
        query: undefined,
        body: {
        "query": input["query"],
        "platform": input["platform"],
        "connection_id": input["connection_id"],
        "limit": input["limit"],
      },
        options,
      })
    },
      "send": async (request: ChannelsSendRequest, options?: RequestOptions) => {
      return http.request<ChannelsSendResponse>({
        method: "POST",
        path: "/runtime/operations/channels.send",
        query: undefined,
        body: request,
        options,
      })
    },
      "status": async (request: ChannelsStatusRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ChannelsStatusResponse>({
        method: "POST",
        path: "/runtime/operations/channels.status",
        query: undefined,
        body: {
        "probe": input["probe"],
        "timeoutMs": input["timeoutMs"],
      },
        options,
      })
    },
      "stream": async (request: ChannelsStreamRequest, options?: RequestOptions) => {
      return http.request<ChannelsStreamResponse>({
        method: "POST",
        path: "/runtime/operations/channels.stream",
        query: undefined,
        body: request,
        options,
      })
    },
      "update": async (request: ChannelsUpdateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ChannelsUpdateResponse>({
        method: "POST",
        path: "/runtime/operations/channels.update",
        query: undefined,
        body: {
        "id": input["id"],
        "channel_id": input["channel_id"],
        "platform": input["platform"],
        "connection_id": input["connection_id"],
        "space_id": input["space_id"],
        "space_name": input["space_name"],
        "container_id": input["container_id"],
        "container_kind": input["container_kind"],
        "container_name": input["container_name"],
        "thread_id": input["thread_id"],
        "thread_name": input["thread_name"],
        "metadata": input["metadata"],
        "metadata_json": input["metadata_json"],
      },
        options,
      })
    },
    },
    "config": {
      "apply": async (request: ConfigApplyRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ConfigApplyResponse>({
        method: "POST",
        path: "/runtime/operations/config.apply",
        query: undefined,
        body: {
        "raw": input["raw"],
        "baseHash": input["baseHash"],
        "sessionKey": input["sessionKey"],
        "note": input["note"],
        "restartDelayMs": input["restartDelayMs"],
      },
        options,
      })
    },
      "get": async (request: ConfigGetRequest, options?: RequestOptions) => {
      return http.request<ConfigGetResponse>({
        method: "POST",
        path: "/runtime/operations/config.get",
        query: undefined,
        body: request,
        options,
      })
    },
      "patch": async (request: ConfigPatchRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ConfigPatchResponse>({
        method: "POST",
        path: "/runtime/operations/config.patch",
        query: undefined,
        body: {
        "raw": input["raw"],
        "baseHash": input["baseHash"],
        "sessionKey": input["sessionKey"],
        "note": input["note"],
        "restartDelayMs": input["restartDelayMs"],
      },
        options,
      })
    },
      "schema": async (request: ConfigSchemaRequest, options?: RequestOptions) => {
      return http.request<ConfigSchemaResponse>({
        method: "POST",
        path: "/runtime/operations/config.schema",
        query: undefined,
        body: request,
        options,
      })
    },
      "set": async (request: ConfigSetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ConfigSetResponse>({
        method: "POST",
        path: "/runtime/operations/config.set",
        query: undefined,
        body: {
        "raw": input["raw"],
        "baseHash": input["baseHash"],
      },
        options,
      })
    },
    },
    "contacts": {
      "create": async (request: ContactsCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ContactsCreateResponse>({
        method: "POST",
        path: "/runtime/operations/contacts.create",
        query: undefined,
        body: {
        "entity_id": input["entity_id"],
        "platform": input["platform"],
        "contact_id": input["contact_id"],
        "origin": input["origin"],
        "space_id": input["space_id"],
        "contact_name": input["contact_name"],
        "avatar_url": input["avatar_url"],
      },
        options,
      })
    },
      "get": async (request: ContactsGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ContactsGetResponse>({
        method: "POST",
        path: "/runtime/operations/contacts.get",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "history": async (request: ContactsHistoryRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ContactsHistoryResponse>({
        method: "POST",
        path: "/runtime/operations/contacts.history",
        query: undefined,
        body: {
        "platform": input["platform"],
        "space_id": input["space_id"],
        "contact_id": input["contact_id"],
      },
        options,
      })
    },
      "import": async (request: ContactsImportRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ContactsImportResponse>({
        method: "POST",
        path: "/runtime/operations/contacts.import",
        query: undefined,
        body: {
        "contacts": input["contacts"],
      },
        options,
      })
    },
      "list": async (request: ContactsListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ContactsListResponse>({
        method: "POST",
        path: "/runtime/operations/contacts.list",
        query: undefined,
        body: {
        "entity_id": input["entity_id"],
        "platform": input["platform"],
        "origin": input["origin"],
        "limit": input["limit"],
        "offset": input["offset"],
      },
        options,
      })
    },
      "search": async (request: ContactsSearchRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ContactsSearchResponse>({
        method: "POST",
        path: "/runtime/operations/contacts.search",
        query: undefined,
        body: {
        "name": input["name"],
        "platform": input["platform"],
        "entity_id": input["entity_id"],
        "limit": input["limit"],
        "offset": input["offset"],
      },
        options,
      })
    },
      "update": async (request: ContactsUpdateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ContactsUpdateResponse>({
        method: "POST",
        path: "/runtime/operations/contacts.update",
        query: undefined,
        body: {
        "id": input["id"],
        "entity_id": input["entity_id"],
        "contact_name": input["contact_name"],
        "avatar_url": input["avatar_url"],
      },
        options,
      })
    },
    },
    "credentials": {
      "create": async (request: CredentialsCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<CredentialsCreateResponse>({
        method: "POST",
        path: "/runtime/operations/credentials.create",
        query: undefined,
        body: {
        "service": input["service"],
        "account": input["account"],
        "type": input["type"],
        "storageType": input["storageType"],
        "entityId": input["entityId"],
        "label": input["label"],
        "secret": input["secret"],
        "storagePointer": input["storagePointer"],
        "metadata": input["metadata"],
        "expiresAt": input["expiresAt"],
      },
        options,
      })
    },
      "get": async (request: CredentialsGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<CredentialsGetResponse>({
        method: "POST",
        path: "/runtime/operations/credentials.get",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "list": async (request: CredentialsListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<CredentialsListResponse>({
        method: "POST",
        path: "/runtime/operations/credentials.list",
        query: undefined,
        body: {
        "service": input["service"],
        "status": input["status"],
        "entityId": input["entityId"],
        "type": input["type"],
        "limit": input["limit"],
        "offset": input["offset"],
      },
        options,
      })
    },
      "resolve": async (request: CredentialsResolveRequest, options?: RequestOptions) => {
      return http.request<CredentialsResolveResponse>({
        method: "POST",
        path: "/runtime/operations/credentials.resolve",
        query: undefined,
        body: request,
        options,
      })
    },
      "revoke": async (request: CredentialsRevokeRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<CredentialsRevokeResponse>({
        method: "POST",
        path: "/runtime/operations/credentials.revoke",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "update": async (request: CredentialsUpdateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<CredentialsUpdateResponse>({
        method: "POST",
        path: "/runtime/operations/credentials.update",
        query: undefined,
        body: {
        "id": input["id"],
        "label": input["label"],
        "status": input["status"],
        "metadata": input["metadata"],
        "expiresAt": input["expiresAt"],
        "secret": input["secret"],
      },
        options,
      })
    },
      "vault": {
        "retrieve": async (request: CredentialsVaultRetrieveRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<CredentialsVaultRetrieveResponse>({
        method: "POST",
        path: "/runtime/operations/credentials.vault.retrieve",
        query: undefined,
        body: {
        "credentialId": input["credentialId"],
      },
        options,
      })
    },
        "store": async (request: CredentialsVaultStoreRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<CredentialsVaultStoreResponse>({
        method: "POST",
        path: "/runtime/operations/credentials.vault.store",
        query: undefined,
        body: {
        "credentialId": input["credentialId"],
        "secret": input["secret"],
      },
        options,
      })
    },
      },
    },
    "dags": {
      "create": async (request: DagsCreateRequest, options?: RequestOptions) => {
      return http.request<DagsCreateResponse>({
        method: "POST",
        path: "/runtime/operations/dags.create",
        query: undefined,
        body: request,
        options,
      })
    },
      "delete": async (request: DagsDeleteRequest, options?: RequestOptions) => {
      return http.request<DagsDeleteResponse>({
        method: "POST",
        path: "/runtime/operations/dags.delete",
        query: undefined,
        body: request,
        options,
      })
    },
      "get": async (request: DagsGetRequest, options?: RequestOptions) => {
      return http.request<DagsGetResponse>({
        method: "POST",
        path: "/runtime/operations/dags.get",
        query: undefined,
        body: request,
        options,
      })
    },
      "list": async (request: DagsListRequest, options?: RequestOptions) => {
      return http.request<DagsListResponse>({
        method: "POST",
        path: "/runtime/operations/dags.list",
        query: undefined,
        body: request,
        options,
      })
    },
      "runs": {
        "cancel": async (request: DagsRunsCancelRequest, options?: RequestOptions) => {
      return http.request<DagsRunsCancelResponse>({
        method: "POST",
        path: "/runtime/operations/dags.runs.cancel",
        query: undefined,
        body: request,
        options,
      })
    },
        "get": async (request: DagsRunsGetRequest, options?: RequestOptions) => {
      return http.request<DagsRunsGetResponse>({
        method: "POST",
        path: "/runtime/operations/dags.runs.get",
        query: undefined,
        body: request,
        options,
      })
    },
        "list": async (request: DagsRunsListRequest, options?: RequestOptions) => {
      return http.request<DagsRunsListResponse>({
        method: "POST",
        path: "/runtime/operations/dags.runs.list",
        query: undefined,
        body: request,
        options,
      })
    },
        "pause": async (request: DagsRunsPauseRequest, options?: RequestOptions) => {
      return http.request<DagsRunsPauseResponse>({
        method: "POST",
        path: "/runtime/operations/dags.runs.pause",
        query: undefined,
        body: request,
        options,
      })
    },
        "resume": async (request: DagsRunsResumeRequest, options?: RequestOptions) => {
      return http.request<DagsRunsResumeResponse>({
        method: "POST",
        path: "/runtime/operations/dags.runs.resume",
        query: undefined,
        body: request,
        options,
      })
    },
        "start": async (request: DagsRunsStartRequest, options?: RequestOptions) => {
      return http.request<DagsRunsStartResponse>({
        method: "POST",
        path: "/runtime/operations/dags.runs.start",
        query: undefined,
        body: request,
        options,
      })
    },
      },
      "update": async (request: DagsUpdateRequest, options?: RequestOptions) => {
      return http.request<DagsUpdateResponse>({
        method: "POST",
        path: "/runtime/operations/dags.update",
        query: undefined,
        body: request,
        options,
      })
    },
    },
    "entities": {
      "create": async (request: EntitiesCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<EntitiesCreateResponse>({
        method: "POST",
        path: "/runtime/operations/entities.create",
        query: undefined,
        body: {
        "name": input["name"],
        "type": input["type"],
        "is_user": input["is_user"],
        "is_agent": input["is_agent"],
        "origin": input["origin"],
        "normalized": input["normalized"],
      },
        options,
      })
    },
      "get": async (request: EntitiesGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<EntitiesGetResponse>({
        method: "POST",
        path: "/runtime/operations/entities.get",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "list": async (request: EntitiesListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<EntitiesListResponse>({
        method: "POST",
        path: "/runtime/operations/entities.list",
        query: undefined,
        body: {
        "type": input["type"],
        "tags": input["tags"],
        "is_user": input["is_user"],
        "is_agent": input["is_agent"],
        "merged": input["merged"],
        "limit": input["limit"],
        "offset": input["offset"],
      },
        options,
      })
    },
      "merge": {
        "apply": async (request: EntitiesMergeApplyRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<EntitiesMergeApplyResponse>({
        method: "POST",
        path: "/runtime/operations/entities.merge.apply",
        query: undefined,
        body: {
        "source_id": input["source_id"],
        "target_id": input["target_id"],
      },
        options,
      })
    },
        "candidates": async (request: EntitiesMergeCandidatesRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<EntitiesMergeCandidatesResponse>({
        method: "POST",
        path: "/runtime/operations/entities.merge.candidates",
        query: undefined,
        body: {
        "limit": input["limit"],
        "offset": input["offset"],
      },
        options,
      })
    },
        "propose": async (request: EntitiesMergeProposeRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<EntitiesMergeProposeResponse>({
        method: "POST",
        path: "/runtime/operations/entities.merge.propose",
        query: undefined,
        body: {
        "source_id": input["source_id"],
        "target_id": input["target_id"],
        "confidence": input["confidence"],
        "reason": input["reason"],
      },
        options,
      })
    },
        "resolve": async (request: EntitiesMergeResolveRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<EntitiesMergeResolveResponse>({
        method: "POST",
        path: "/runtime/operations/entities.merge.resolve",
        query: undefined,
        body: {
        "id": input["id"],
        "status": input["status"],
      },
        options,
      })
    },
      },
      "resolve": async (request: EntitiesResolveRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<EntitiesResolveResponse>({
        method: "POST",
        path: "/runtime/operations/entities.resolve",
        query: undefined,
        body: {
        "entity_id": input["entity_id"],
      },
        options,
      })
    },
      "tags": {
        "add": async (request: EntitiesTagsAddRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<EntitiesTagsAddResponse>({
        method: "POST",
        path: "/runtime/operations/entities.tags.add",
        query: undefined,
        body: {
        "entity_id": input["entity_id"],
        "tag": input["tag"],
      },
        options,
      })
    },
        "list": async (request: EntitiesTagsListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<EntitiesTagsListResponse>({
        method: "POST",
        path: "/runtime/operations/entities.tags.list",
        query: undefined,
        body: {
        "entity_id": input["entity_id"],
      },
        options,
      })
    },
        "remove": async (request: EntitiesTagsRemoveRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<EntitiesTagsRemoveResponse>({
        method: "POST",
        path: "/runtime/operations/entities.tags.remove",
        query: undefined,
        body: {
        "entity_id": input["entity_id"],
        "tag": input["tag"],
      },
        options,
      })
    },
      },
      "update": async (request: EntitiesUpdateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<EntitiesUpdateResponse>({
        method: "POST",
        path: "/runtime/operations/entities.update",
        query: undefined,
        body: {
        "id": input["id"],
        "name": input["name"],
        "type": input["type"],
        "normalized": input["normalized"],
        "is_user": input["is_user"],
        "is_agent": input["is_agent"],
      },
        options,
      })
    },
    },
    "events": {
      "publish": async (request: EventsPublishRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<EventsPublishResponse>({
        method: "POST",
        path: "/runtime/operations/events.publish",
        query: undefined,
        body: {
        "type": input["type"],
        "properties": input["properties"],
      },
        options,
      })
    },
      "subscribe": async (request: EventsSubscribeRequest, options?: RequestOptions) => {
      return http.request<EventsSubscribeResponse>({
        method: "POST",
        path: "/runtime/operations/events.subscribe",
        query: undefined,
        body: request,
        options,
      })
    },
      "subscriptions": {
        "create": async (request: EventsSubscriptionsCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<EventsSubscriptionsCreateResponse>({
        method: "POST",
        path: "/runtime/operations/events.subscriptions.create",
        query: undefined,
        body: {
        "job_definition_id": input["job_definition_id"],
        "event_type": input["event_type"],
        "match": input["match"],
        "match_json": input["match_json"],
        "enabled": input["enabled"],
      },
        options,
      })
    },
        "delete": async (request: EventsSubscriptionsDeleteRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<EventsSubscriptionsDeleteResponse>({
        method: "POST",
        path: "/runtime/operations/events.subscriptions.delete",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
        "get": async (request: EventsSubscriptionsGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<EventsSubscriptionsGetResponse>({
        method: "POST",
        path: "/runtime/operations/events.subscriptions.get",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
        "list": async (request: EventsSubscriptionsListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<EventsSubscriptionsListResponse>({
        method: "POST",
        path: "/runtime/operations/events.subscriptions.list",
        query: undefined,
        body: {
        "job_definition_id": input["job_definition_id"],
        "event_type": input["event_type"],
        "enabled": input["enabled"],
        "limit": input["limit"],
        "offset": input["offset"],
      },
        options,
      })
    },
        "update": async (request: EventsSubscriptionsUpdateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<EventsSubscriptionsUpdateResponse>({
        method: "POST",
        path: "/runtime/operations/events.subscriptions.update",
        query: undefined,
        body: {
        "id": input["id"],
        "job_definition_id": input["job_definition_id"],
        "event_type": input["event_type"],
        "match": input["match"],
        "match_json": input["match_json"],
        "enabled": input["enabled"],
      },
        options,
      })
    },
      },
      "unsubscribe": async (request: EventsUnsubscribeRequest, options?: RequestOptions) => {
      return http.request<EventsUnsubscribeResponse>({
        method: "POST",
        path: "/runtime/operations/events.unsubscribe",
        query: undefined,
        body: request,
        options,
      })
    },
    },
    "groups": {
      "create": async (request: GroupsCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<GroupsCreateResponse>({
        method: "POST",
        path: "/runtime/operations/groups.create",
        query: undefined,
        body: {
        "name": input["name"],
        "description": input["description"],
        "parent_group_id": input["parent_group_id"],
      },
        options,
      })
    },
      "delete": async (request: GroupsDeleteRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<GroupsDeleteResponse>({
        method: "POST",
        path: "/runtime/operations/groups.delete",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "get": async (request: GroupsGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<GroupsGetResponse>({
        method: "POST",
        path: "/runtime/operations/groups.get",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "list": async (request: GroupsListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<GroupsListResponse>({
        method: "POST",
        path: "/runtime/operations/groups.list",
        query: undefined,
        body: {
        "limit": input["limit"],
        "offset": input["offset"],
      },
        options,
      })
    },
      "members": {
        "add": async (request: GroupsMembersAddRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<GroupsMembersAddResponse>({
        method: "POST",
        path: "/runtime/operations/groups.members.add",
        query: undefined,
        body: {
        "group_id": input["group_id"],
        "entity_id": input["entity_id"],
        "role": input["role"],
      },
        options,
      })
    },
        "list": async (request: GroupsMembersListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<GroupsMembersListResponse>({
        method: "POST",
        path: "/runtime/operations/groups.members.list",
        query: undefined,
        body: {
        "group_id": input["group_id"],
      },
        options,
      })
    },
        "remove": async (request: GroupsMembersRemoveRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<GroupsMembersRemoveResponse>({
        method: "POST",
        path: "/runtime/operations/groups.members.remove",
        query: undefined,
        body: {
        "group_id": input["group_id"],
        "entity_id": input["entity_id"],
      },
        options,
      })
    },
      },
      "update": async (request: GroupsUpdateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<GroupsUpdateResponse>({
        method: "POST",
        path: "/runtime/operations/groups.update",
        query: undefined,
        body: {
        "id": input["id"],
        "name": input["name"],
        "description": input["description"],
        "parent_group_id": input["parent_group_id"],
      },
        options,
      })
    },
    },
    "jobs": {
      "cancel": async (request: JobsCancelRequest, options?: RequestOptions) => {
      return http.request<JobsCancelResponse>({
        method: "POST",
        path: "/runtime/operations/jobs.cancel",
        query: undefined,
        body: request,
        options,
      })
    },
      "create": async (request: JobsCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<JobsCreateResponse>({
        method: "POST",
        path: "/runtime/operations/jobs.create",
        query: undefined,
        body: {
        "name": input["name"],
        "script_path": input["script_path"],
        "description": input["description"],
        "config_json": input["config_json"],
        "status": input["status"],
        "timeout_ms": input["timeout_ms"],
        "workspace_id": input["workspace_id"],
        "hook_points": input["hook_points"],
        "created_by": input["created_by"],
      },
        options,
      })
    },
      "delete": async (request: JobsDeleteRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<JobsDeleteResponse>({
        method: "POST",
        path: "/runtime/operations/jobs.delete",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "get": async (request: JobsGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<JobsGetResponse>({
        method: "POST",
        path: "/runtime/operations/jobs.get",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "invoke": async (request: JobsInvokeRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<JobsInvokeResponse>({
        method: "POST",
        path: "/runtime/operations/jobs.invoke",
        query: undefined,
        body: {
        "job_id": input["job_id"],
        "input": input["input"],
        "trigger_source": input["trigger_source"],
        "max_attempts": input["max_attempts"],
        "available_at": input["available_at"],
        "delay_ms": input["delay_ms"],
        "workspace_id": input["workspace_id"],
        "idempotency_key": input["idempotency_key"],
      },
        options,
      })
    },
      "list": async (request: JobsListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<JobsListResponse>({
        method: "POST",
        path: "/runtime/operations/jobs.list",
        query: undefined,
        body: {
        "status": input["status"],
        "workspace_id": input["workspace_id"],
        "limit": input["limit"],
        "offset": input["offset"],
      },
        options,
      })
    },
      "queue": {
        "get": async (request: JobsQueueGetRequest, options?: RequestOptions) => {
      return http.request<JobsQueueGetResponse>({
        method: "POST",
        path: "/runtime/operations/jobs.queue.get",
        query: undefined,
        body: request,
        options,
      })
    },
        "list": async (request: JobsQueueListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<JobsQueueListResponse>({
        method: "POST",
        path: "/runtime/operations/jobs.queue.list",
        query: undefined,
        body: {
        "job_definition_id": input["job_definition_id"],
        "job_run_id": input["job_run_id"],
        "queue_status": input["queue_status"],
        "source_run_id": input["source_run_id"],
        "limit": input["limit"],
        "offset": input["offset"],
      },
        options,
      })
    },
      },
      "requeue": async (request: JobsRequeueRequest, options?: RequestOptions) => {
      return http.request<JobsRequeueResponse>({
        method: "POST",
        path: "/runtime/operations/jobs.requeue",
        query: undefined,
        body: request,
        options,
      })
    },
      "retry": async (request: JobsRetryRequest, options?: RequestOptions) => {
      return http.request<JobsRetryResponse>({
        method: "POST",
        path: "/runtime/operations/jobs.retry",
        query: undefined,
        body: request,
        options,
      })
    },
      "runs": {
        "get": async (request: JobsRunsGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<JobsRunsGetResponse>({
        method: "POST",
        path: "/runtime/operations/jobs.runs.get",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
        "list": async (request: JobsRunsListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<JobsRunsListResponse>({
        method: "POST",
        path: "/runtime/operations/jobs.runs.list",
        query: undefined,
        body: {
        "job_definition_id": input["job_definition_id"],
        "status": input["status"],
        "trigger_source": input["trigger_source"],
        "job_schedule_id": input["job_schedule_id"],
        "dag_run_id": input["dag_run_id"],
        "limit": input["limit"],
        "offset": input["offset"],
      },
        options,
      })
    },
      },
      "update": async (request: JobsUpdateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<JobsUpdateResponse>({
        method: "POST",
        path: "/runtime/operations/jobs.update",
        query: undefined,
        body: {
        "id": input["id"],
        "name": input["name"],
        "description": input["description"],
        "script_path": input["script_path"],
        "script_hash": input["script_hash"],
        "config_json": input["config_json"],
        "status": input["status"],
        "timeout_ms": input["timeout_ms"],
        "workspace_id": input["workspace_id"],
        "hook_points": input["hook_points"],
        "created_by": input["created_by"],
      },
        options,
      })
    },
    },
    "logs": {
      "tail": async (request: LogsTailRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<LogsTailResponse>({
        method: "POST",
        path: "/runtime/operations/logs.tail",
        query: undefined,
        body: {
        "cursor": input["cursor"],
        "limit": input["limit"],
        "maxBytes": input["maxBytes"],
      },
        options,
      })
    },
    },
    "memory": {
      "elements": {
        "consolidate": async (request: MemoryElementsConsolidateRequest, options?: RequestOptions) => {
      return http.request<MemoryElementsConsolidateResponse>({
        method: "POST",
        path: "/runtime/operations/memory.elements.consolidate",
        query: undefined,
        body: request,
        options,
      })
    },
        "create": async (request: MemoryElementsCreateRequest, options?: RequestOptions) => {
      return http.request<MemoryElementsCreateResponse>({
        method: "POST",
        path: "/runtime/operations/memory.elements.create",
        query: undefined,
        body: request,
        options,
      })
    },
        "definitions": {
          "create": async (request: MemoryElementsDefinitionsCreateRequest, options?: RequestOptions) => {
      return http.request<MemoryElementsDefinitionsCreateResponse>({
        method: "POST",
        path: "/runtime/operations/memory.elements.definitions.create",
        query: undefined,
        body: request,
        options,
      })
    },
          "get": async (request: MemoryElementsDefinitionsGetRequest, options?: RequestOptions) => {
      return http.request<MemoryElementsDefinitionsGetResponse>({
        method: "POST",
        path: "/runtime/operations/memory.elements.definitions.get",
        query: undefined,
        body: request,
        options,
      })
    },
          "list": async (request: MemoryElementsDefinitionsListRequest, options?: RequestOptions) => {
      return http.request<MemoryElementsDefinitionsListResponse>({
        method: "POST",
        path: "/runtime/operations/memory.elements.definitions.list",
        query: undefined,
        body: request,
        options,
      })
    },
        },
        "entities": {
          "link": async (request: MemoryElementsEntitiesLinkRequest, options?: RequestOptions) => {
      return http.request<MemoryElementsEntitiesLinkResponse>({
        method: "POST",
        path: "/runtime/operations/memory.elements.entities.link",
        query: undefined,
        body: request,
        options,
      })
    },
          "list": async (request: MemoryElementsEntitiesListRequest, options?: RequestOptions) => {
      return http.request<MemoryElementsEntitiesListResponse>({
        method: "POST",
        path: "/runtime/operations/memory.elements.entities.list",
        query: undefined,
        body: request,
        options,
      })
    },
        },
        "get": async (request: MemoryElementsGetRequest, options?: RequestOptions) => {
      return http.request<MemoryElementsGetResponse>({
        method: "POST",
        path: "/runtime/operations/memory.elements.get",
        query: undefined,
        body: request,
        options,
      })
    },
        "links": {
          "create": async (request: MemoryElementsLinksCreateRequest, options?: RequestOptions) => {
      return http.request<MemoryElementsLinksCreateResponse>({
        method: "POST",
        path: "/runtime/operations/memory.elements.links.create",
        query: undefined,
        body: request,
        options,
      })
    },
          "list": async (request: MemoryElementsLinksListRequest, options?: RequestOptions) => {
      return http.request<MemoryElementsLinksListResponse>({
        method: "POST",
        path: "/runtime/operations/memory.elements.links.list",
        query: undefined,
        body: request,
        options,
      })
    },
          "traverse": async (request: MemoryElementsLinksTraverseRequest, options?: RequestOptions) => {
      return http.request<MemoryElementsLinksTraverseResponse>({
        method: "POST",
        path: "/runtime/operations/memory.elements.links.traverse",
        query: undefined,
        body: request,
        options,
      })
    },
        },
        "list": async (request: MemoryElementsListRequest, options?: RequestOptions) => {
      return http.request<MemoryElementsListResponse>({
        method: "POST",
        path: "/runtime/operations/memory.elements.list",
        query: undefined,
        body: request,
        options,
      })
    },
        "resolve_head": async (request: MemoryElementsResolveHeadRequest, options?: RequestOptions) => {
      return http.request<MemoryElementsResolveHeadResponse>({
        method: "POST",
        path: "/runtime/operations/memory.elements.resolve_head",
        query: undefined,
        body: request,
        options,
      })
    },
        "search": async (request: MemoryElementsSearchRequest, options?: RequestOptions) => {
      return http.request<MemoryElementsSearchResponse>({
        method: "POST",
        path: "/runtime/operations/memory.elements.search",
        query: undefined,
        body: request,
        options,
      })
    },
        "update": async (request: MemoryElementsUpdateRequest, options?: RequestOptions) => {
      return http.request<MemoryElementsUpdateResponse>({
        method: "POST",
        path: "/runtime/operations/memory.elements.update",
        query: undefined,
        body: request,
        options,
      })
    },
      },
      "entities": {
        "confirm": async (request: MemoryEntitiesConfirmRequest, options?: RequestOptions) => {
      return http.request<MemoryEntitiesConfirmResponse>({
        method: "POST",
        path: "/runtime/operations/memory.entities.confirm",
        query: undefined,
        body: request,
        options,
      })
    },
        "create": async (request: MemoryEntitiesCreateRequest, options?: RequestOptions) => {
      return http.request<MemoryEntitiesCreateResponse>({
        method: "POST",
        path: "/runtime/operations/memory.entities.create",
        query: undefined,
        body: request,
        options,
      })
    },
        "propose_merge": async (request: MemoryEntitiesProposeMergeRequest, options?: RequestOptions) => {
      return http.request<MemoryEntitiesProposeMergeResponse>({
        method: "POST",
        path: "/runtime/operations/memory.entities.propose_merge",
        query: undefined,
        body: request,
        options,
      })
    },
      },
      "recall": async (request: MemoryRecallRequest, options?: RequestOptions) => {
      return http.request<MemoryRecallResponse>({
        method: "POST",
        path: "/runtime/operations/memory.recall",
        query: undefined,
        body: request,
        options,
      })
    },
      "review": {
        "entity": {
          "get": async (request: MemoryReviewEntityGetRequest, options?: RequestOptions) => {
      return http.request<MemoryReviewEntityGetResponse>({
        method: "POST",
        path: "/runtime/operations/memory.review.entity.get",
        query: undefined,
        body: request,
        options,
      })
    },
        },
        "episode": {
          "get": async (request: MemoryReviewEpisodeGetRequest, options?: RequestOptions) => {
      return http.request<MemoryReviewEpisodeGetResponse>({
        method: "POST",
        path: "/runtime/operations/memory.review.episode.get",
        query: undefined,
        body: request,
        options,
      })
    },
          "outputs": {
            "get": async (request: MemoryReviewEpisodeOutputsGetRequest, options?: RequestOptions) => {
      return http.request<MemoryReviewEpisodeOutputsGetResponse>({
        method: "POST",
        path: "/runtime/operations/memory.review.episode.outputs.get",
        query: undefined,
        body: request,
        options,
      })
    },
          },
        },
        "fact": {
          "get": async (request: MemoryReviewFactGetRequest, options?: RequestOptions) => {
      return http.request<MemoryReviewFactGetResponse>({
        method: "POST",
        path: "/runtime/operations/memory.review.fact.get",
        query: undefined,
        body: request,
        options,
      })
    },
        },
        "observation": {
          "get": async (request: MemoryReviewObservationGetRequest, options?: RequestOptions) => {
      return http.request<MemoryReviewObservationGetResponse>({
        method: "POST",
        path: "/runtime/operations/memory.review.observation.get",
        query: undefined,
        body: request,
        options,
      })
    },
        },
        "quality": {
          "items": {
            "list": async (request: MemoryReviewQualityItemsListRequest, options?: RequestOptions) => {
      return http.request<MemoryReviewQualityItemsListResponse>({
        method: "POST",
        path: "/runtime/operations/memory.review.quality.items.list",
        query: undefined,
        body: request,
        options,
      })
    },
          },
          "summary": async (request: MemoryReviewQualitySummaryRequest, options?: RequestOptions) => {
      return http.request<MemoryReviewQualitySummaryResponse>({
        method: "POST",
        path: "/runtime/operations/memory.review.quality.summary",
        query: undefined,
        body: request,
        options,
      })
    },
        },
        "run": {
          "episodes": {
            "list": async (request: MemoryReviewRunEpisodesListRequest, options?: RequestOptions) => {
      return http.request<MemoryReviewRunEpisodesListResponse>({
        method: "POST",
        path: "/runtime/operations/memory.review.run.episodes.list",
        query: undefined,
        body: request,
        options,
      })
    },
          },
          "get": async (request: MemoryReviewRunGetRequest, options?: RequestOptions) => {
      return http.request<MemoryReviewRunGetResponse>({
        method: "POST",
        path: "/runtime/operations/memory.review.run.get",
        query: undefined,
        body: request,
        options,
      })
    },
        },
        "runs": {
          "list": async (request: MemoryReviewRunsListRequest, options?: RequestOptions) => {
      return http.request<MemoryReviewRunsListResponse>({
        method: "POST",
        path: "/runtime/operations/memory.review.runs.list",
        query: undefined,
        body: request,
        options,
      })
    },
        },
        "search": async (request: MemoryReviewSearchRequest, options?: RequestOptions) => {
      return http.request<MemoryReviewSearchResponse>({
        method: "POST",
        path: "/runtime/operations/memory.review.search",
        query: undefined,
        body: request,
        options,
      })
    },
      },
      "sets": {
        "create": async (request: MemorySetsCreateRequest, options?: RequestOptions) => {
      return http.request<MemorySetsCreateResponse>({
        method: "POST",
        path: "/runtime/operations/memory.sets.create",
        query: undefined,
        body: request,
        options,
      })
    },
        "get": async (request: MemorySetsGetRequest, options?: RequestOptions) => {
      return http.request<MemorySetsGetResponse>({
        method: "POST",
        path: "/runtime/operations/memory.sets.get",
        query: undefined,
        body: request,
        options,
      })
    },
        "list": async (request: MemorySetsListRequest, options?: RequestOptions) => {
      return http.request<MemorySetsListResponse>({
        method: "POST",
        path: "/runtime/operations/memory.sets.list",
        query: undefined,
        body: request,
        options,
      })
    },
        "members": {
          "add": async (request: MemorySetsMembersAddRequest, options?: RequestOptions) => {
      return http.request<MemorySetsMembersAddResponse>({
        method: "POST",
        path: "/runtime/operations/memory.sets.members.add",
        query: undefined,
        body: request,
        options,
      })
    },
          "list": async (request: MemorySetsMembersListRequest, options?: RequestOptions) => {
      return http.request<MemorySetsMembersListResponse>({
        method: "POST",
        path: "/runtime/operations/memory.sets.members.list",
        query: undefined,
        body: request,
        options,
      })
    },
        },
      },
    },
    "models": {
      "catalog": {
        "get": async (request: ModelsCatalogGetRequest, options?: RequestOptions) => {
      return http.request<ModelsCatalogGetResponse>({
        method: "POST",
        path: "/runtime/operations/models.catalog.get",
        query: undefined,
        body: request,
        options,
      })
    },
        "list": async (request: ModelsCatalogListRequest, options?: RequestOptions) => {
      return http.request<ModelsCatalogListResponse>({
        method: "POST",
        path: "/runtime/operations/models.catalog.list",
        query: undefined,
        body: request,
        options,
      })
    },
      },
      "configs": {
        "create": async (request: ModelsConfigsCreateRequest, options?: RequestOptions) => {
      return http.request<ModelsConfigsCreateResponse>({
        method: "POST",
        path: "/runtime/operations/models.configs.create",
        query: undefined,
        body: request,
        options,
      })
    },
        "delete": async (request: ModelsConfigsDeleteRequest, options?: RequestOptions) => {
      return http.request<ModelsConfigsDeleteResponse>({
        method: "POST",
        path: "/runtime/operations/models.configs.delete",
        query: undefined,
        body: request,
        options,
      })
    },
        "get": async (request: ModelsConfigsGetRequest, options?: RequestOptions) => {
      return http.request<ModelsConfigsGetResponse>({
        method: "POST",
        path: "/runtime/operations/models.configs.get",
        query: undefined,
        body: request,
        options,
      })
    },
        "list": async (request: ModelsConfigsListRequest, options?: RequestOptions) => {
      return http.request<ModelsConfigsListResponse>({
        method: "POST",
        path: "/runtime/operations/models.configs.list",
        query: undefined,
        body: request,
        options,
      })
    },
        "update": async (request: ModelsConfigsUpdateRequest, options?: RequestOptions) => {
      return http.request<ModelsConfigsUpdateResponse>({
        method: "POST",
        path: "/runtime/operations/models.configs.update",
        query: undefined,
        body: request,
        options,
      })
    },
      },
      "defaults": {
        "get": async (request: ModelsDefaultsGetRequest, options?: RequestOptions) => {
      return http.request<ModelsDefaultsGetResponse>({
        method: "POST",
        path: "/runtime/operations/models.defaults.get",
        query: undefined,
        body: request,
        options,
      })
    },
        "put": async (request: ModelsDefaultsPutRequest, options?: RequestOptions) => {
      return http.request<ModelsDefaultsPutResponse>({
        method: "POST",
        path: "/runtime/operations/models.defaults.put",
        query: undefined,
        body: request,
        options,
      })
    },
      },
      "get": async (request: ModelsGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ModelsGetResponse>({
        method: "POST",
        path: "/runtime/operations/models.get",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "list": async (request: ModelsListRequest, options?: RequestOptions) => {
      return http.request<ModelsListResponse>({
        method: "POST",
        path: "/runtime/operations/models.list",
        query: undefined,
        body: request,
        options,
      })
    },
      "providers": {
        "delete": async (request: ModelsProvidersDeleteRequest, options?: RequestOptions) => {
      return http.request<ModelsProvidersDeleteResponse>({
        method: "POST",
        path: "/runtime/operations/models.providers.delete",
        query: undefined,
        body: request,
        options,
      })
    },
        "get": async (request: ModelsProvidersGetRequest, options?: RequestOptions) => {
      return http.request<ModelsProvidersGetResponse>({
        method: "POST",
        path: "/runtime/operations/models.providers.get",
        query: undefined,
        body: request,
        options,
      })
    },
        "list": async (request: ModelsProvidersListRequest, options?: RequestOptions) => {
      return http.request<ModelsProvidersListResponse>({
        method: "POST",
        path: "/runtime/operations/models.providers.list",
        query: undefined,
        body: request,
        options,
      })
    },
        "put": async (request: ModelsProvidersPutRequest, options?: RequestOptions) => {
      return http.request<ModelsProvidersPutResponse>({
        method: "POST",
        path: "/runtime/operations/models.providers.put",
        query: undefined,
        body: request,
        options,
      })
    },
        "test": async (request: ModelsProvidersTestRequest, options?: RequestOptions) => {
      return http.request<ModelsProvidersTestResponse>({
        method: "POST",
        path: "/runtime/operations/models.providers.test",
        query: undefined,
        body: request,
        options,
      })
    },
      },
    },
    "operator": {
      "packages": {
        "get": async (request: OperatorPackagesGetRequest, options?: RequestOptions) => {
      return http.request<OperatorPackagesGetResponse>({
        method: "POST",
        path: "/runtime/operations/operator.packages.get",
        query: undefined,
        body: request,
        options,
      })
    },
        "health": async (request: OperatorPackagesHealthRequest, options?: RequestOptions) => {
      return http.request<OperatorPackagesHealthResponse>({
        method: "POST",
        path: "/runtime/operations/operator.packages.health",
        query: undefined,
        body: request,
        options,
      })
    },
        "install": async (request: OperatorPackagesInstallRequest, options?: RequestOptions) => {
      return http.request<OperatorPackagesInstallResponse>({
        method: "POST",
        path: "/runtime/operations/operator.packages.install",
        query: undefined,
        body: request,
        options,
      })
    },
        "uninstall": async (request: OperatorPackagesUninstallRequest, options?: RequestOptions) => {
      return http.request<OperatorPackagesUninstallResponse>({
        method: "POST",
        path: "/runtime/operations/operator.packages.uninstall",
        query: undefined,
        body: request,
        options,
      })
    },
        "upgrade": async (request: OperatorPackagesUpgradeRequest, options?: RequestOptions) => {
      return http.request<OperatorPackagesUpgradeResponse>({
        method: "POST",
        path: "/runtime/operations/operator.packages.upgrade",
        query: undefined,
        body: request,
        options,
      })
    },
      },
    },
    "orientation": {
      "contracts": async (request: OrientationContractsRequest, options?: RequestOptions) => {
      return http.request<OrientationContractsResponse>({
        method: "POST",
        path: "/runtime/operations/orientation.contracts",
        query: undefined,
        body: request,
        options,
      })
    },
      "inventory": async (request: OrientationInventoryRequest, options?: RequestOptions) => {
      return http.request<OrientationInventoryResponse>({
        method: "POST",
        path: "/runtime/operations/orientation.inventory",
        query: undefined,
        body: request,
        options,
      })
    },
      "schemas": async (request: OrientationSchemasRequest, options?: RequestOptions) => {
      return http.request<OrientationSchemasResponse>({
        method: "POST",
        path: "/runtime/operations/orientation.schemas",
        query: undefined,
        body: request,
        options,
      })
    },
      "summary": async (request: OrientationSummaryRequest, options?: RequestOptions) => {
      return http.request<OrientationSummaryResponse>({
        method: "POST",
        path: "/runtime/operations/orientation.summary",
        query: undefined,
        body: request,
        options,
      })
    },
      "taxonomy": async (request: OrientationTaxonomyRequest, options?: RequestOptions) => {
      return http.request<OrientationTaxonomyResponse>({
        method: "POST",
        path: "/runtime/operations/orientation.taxonomy",
        query: undefined,
        body: request,
        options,
      })
    },
    },
    "productControlPlane": {
      "call": async (request: ProductControlPlaneCallRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<ProductControlPlaneCallResponse>({
        method: "POST",
        path: "/runtime/operations/productControlPlane.call",
        query: undefined,
        body: {
        "operation": input["operation"],
        "appId": input["appId"],
        "payload": input["payload"],
      },
        options,
      })
    },
    },
    "record": {
      "ingest": async (request: RecordIngestRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<RecordIngestResponse>({
        method: "POST",
        path: "/runtime/operations/record.ingest",
        query: undefined,
        body: {
        "routing": input["routing"],
        "payload": input["payload"],
      },
        options,
      })
    },
    },
    "records": {
      "get": async (request: RecordsGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<RecordsGetResponse>({
        method: "POST",
        path: "/runtime/operations/records.get",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "list": async (request: RecordsListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<RecordsListResponse>({
        method: "POST",
        path: "/runtime/operations/records.list",
        query: undefined,
        body: {
        "limit": input["limit"],
      },
        options,
      })
    },
      "search": async (request: RecordsSearchRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<RecordsSearchResponse>({
        method: "POST",
        path: "/runtime/operations/records.search",
        query: undefined,
        body: {
        "query": input["query"],
        "platform": input["platform"],
        "sender_id": input["sender_id"],
        "limit": input["limit"],
      },
        options,
      })
    },
    },
    "roles": {
      "create": async (request: RolesCreateRequest, options?: RequestOptions) => {
      return http.request<RolesCreateResponse>({
        method: "POST",
        path: "/runtime/operations/roles.create",
        query: undefined,
        body: request,
        options,
      })
    },
      "delete": async (request: RolesDeleteRequest, options?: RequestOptions) => {
      return http.request<RolesDeleteResponse>({
        method: "POST",
        path: "/runtime/operations/roles.delete",
        query: undefined,
        body: request,
        options,
      })
    },
      "get": async (request: RolesGetRequest, options?: RequestOptions) => {
      return http.request<RolesGetResponse>({
        method: "POST",
        path: "/runtime/operations/roles.get",
        query: undefined,
        body: request,
        options,
      })
    },
      "list": async (request: RolesListRequest, options?: RequestOptions) => {
      return http.request<RolesListResponse>({
        method: "POST",
        path: "/runtime/operations/roles.list",
        query: undefined,
        body: request,
        options,
      })
    },
      "update": async (request: RolesUpdateRequest, options?: RequestOptions) => {
      return http.request<RolesUpdateResponse>({
        method: "POST",
        path: "/runtime/operations/roles.update",
        query: undefined,
        body: request,
        options,
      })
    },
    },
    "runtime": {
      "health": async (request: RuntimeHealthRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<RuntimeHealthResponse>({
        method: "POST",
        path: "/runtime/operations/runtime.health",
        query: undefined,
        body: {
        "probe": input["probe"],
      },
        options,
      })
    },
    },
    "sandboxes": {
      "create": async (request: SandboxesCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SandboxesCreateResponse>({
        method: "POST",
        path: "/runtime/operations/sandboxes.create",
        query: undefined,
        body: {
        "id": input["id"],
        "backend": input["backend"],
        "profile": input["profile"],
        "image": input["image"],
        "workspace_source_path": input["workspace_source_path"],
        "mounts": input["mounts"],
        "linkage": input["linkage"],
        "config_json": input["config_json"],
      },
        options,
      })
    },
      "destroy": async (request: SandboxesDestroyRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SandboxesDestroyResponse>({
        method: "POST",
        path: "/runtime/operations/sandboxes.destroy",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "exec": async (request: SandboxesExecRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SandboxesExecResponse>({
        method: "POST",
        path: "/runtime/operations/sandboxes.exec",
        query: undefined,
        body: {
        "id": input["id"],
        "command": input["command"],
        "cwd": input["cwd"],
        "env": input["env"],
        "timeout_ms": input["timeout_ms"],
      },
        options,
      })
    },
      "fork": async (request: SandboxesForkRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SandboxesForkResponse>({
        method: "POST",
        path: "/runtime/operations/sandboxes.fork",
        query: undefined,
        body: {
        "id": input["id"],
        "new_id": input["new_id"],
        "image": input["image"],
        "profile": input["profile"],
      },
        options,
      })
    },
      "get": async (request: SandboxesGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SandboxesGetResponse>({
        method: "POST",
        path: "/runtime/operations/sandboxes.get",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "list": async (request: SandboxesListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SandboxesListResponse>({
        method: "POST",
        path: "/runtime/operations/sandboxes.list",
        query: undefined,
        body: {
        "backend": input["backend"],
        "state": input["state"],
        "limit": input["limit"],
      },
        options,
      })
    },
      "resume": async (request: SandboxesResumeRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SandboxesResumeResponse>({
        method: "POST",
        path: "/runtime/operations/sandboxes.resume",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "retain": async (request: SandboxesRetainRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SandboxesRetainResponse>({
        method: "POST",
        path: "/runtime/operations/sandboxes.retain",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
    },
    "schedules": {
      "create": async (request: SchedulesCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SchedulesCreateResponse>({
        method: "POST",
        path: "/runtime/operations/schedules.create",
        query: undefined,
        body: {
        "job_definition_id": input["job_definition_id"],
        "expression": input["expression"],
        "name": input["name"],
        "timezone": input["timezone"],
        "active_from": input["active_from"],
        "active_until": input["active_until"],
        "enabled": input["enabled"],
      },
        options,
      })
    },
      "delete": async (request: SchedulesDeleteRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SchedulesDeleteResponse>({
        method: "POST",
        path: "/runtime/operations/schedules.delete",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "get": async (request: SchedulesGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SchedulesGetResponse>({
        method: "POST",
        path: "/runtime/operations/schedules.get",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "list": async (request: SchedulesListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SchedulesListResponse>({
        method: "POST",
        path: "/runtime/operations/schedules.list",
        query: undefined,
        body: {
        "job_definition_id": input["job_definition_id"],
        "enabled": input["enabled"],
        "limit": input["limit"],
        "offset": input["offset"],
      },
        options,
      })
    },
      "trigger": async (request: SchedulesTriggerRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SchedulesTriggerResponse>({
        method: "POST",
        path: "/runtime/operations/schedules.trigger",
        query: undefined,
        body: {
        "id": input["id"],
        "mode": input["mode"],
      },
        options,
      })
    },
      "update": async (request: SchedulesUpdateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SchedulesUpdateResponse>({
        method: "POST",
        path: "/runtime/operations/schedules.update",
        query: undefined,
        body: {
        "id": input["id"],
        "name": input["name"],
        "expression": input["expression"],
        "timezone": input["timezone"],
        "active_from": input["active_from"],
        "active_until": input["active_until"],
        "enabled": input["enabled"],
        "last_run_at": input["last_run_at"],
      },
        options,
      })
    },
    },
    "search": {
      "rebuild": async (request: SearchRebuildRequest, options?: RequestOptions) => {
      return http.request<SearchRebuildResponse>({
        method: "POST",
        path: "/runtime/operations/search.rebuild",
        query: undefined,
        body: request,
        options,
      })
    },
      "status": async (request: SearchStatusRequest, options?: RequestOptions) => {
      return http.request<SearchStatusResponse>({
        method: "POST",
        path: "/runtime/operations/search.status",
        query: undefined,
        body: request,
        options,
      })
    },
    },
    "skills": {
      "list": async (request: SkillsListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SkillsListResponse>({
        method: "POST",
        path: "/runtime/operations/skills.list",
        query: undefined,
        body: {
        "agentId": input["agentId"],
      },
        options,
      })
    },
      "search": async (request: SkillsSearchRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SkillsSearchResponse>({
        method: "POST",
        path: "/runtime/operations/skills.search",
        query: undefined,
        body: {
        "query": input["query"],
        "agentId": input["agentId"],
      },
        options,
      })
    },
      "use": async (request: SkillsUseRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<SkillsUseResponse>({
        method: "POST",
        path: "/runtime/operations/skills.use",
        query: undefined,
        body: {
        "name": input["name"],
        "agentId": input["agentId"],
      },
        options,
      })
    },
    },
    "status": async (request: StatusRequest, options?: RequestOptions) => {
      return http.request<StatusResponse>({
        method: "POST",
        path: "/runtime/operations/status",
        query: undefined,
        body: request,
        options,
      })
    },
    "system-presence": async (request: SystemPresenceRequest, options?: RequestOptions) => {
      return http.request<SystemPresenceResponse>({
        method: "POST",
        path: "/runtime/operations/system-presence",
        query: undefined,
        body: request,
        options,
      })
    },
    "talk": {
      "mode": async (request: TalkModeRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<TalkModeResponse>({
        method: "POST",
        path: "/runtime/operations/talk.mode",
        query: undefined,
        body: {
        "enabled": input["enabled"],
        "phase": input["phase"],
      },
        options,
      })
    },
    },
    "tools": {
      "catalog": async (request: ToolsCatalogRequest, options?: RequestOptions) => {
      return http.request<ToolsCatalogResponse>({
        method: "POST",
        path: "/runtime/operations/tools.catalog",
        query: undefined,
        body: request,
        options,
      })
    },
      "invoke": async (request: ToolsInvokeRequest, options?: RequestOptions) => {
      return http.request<ToolsInvokeResponse>({
        method: "POST",
        path: "/runtime/operations/tools.invoke",
        query: undefined,
        body: request,
        options,
      })
    },
    },
    "update": {
      "run": async (request: UpdateRunRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<UpdateRunResponse>({
        method: "POST",
        path: "/runtime/operations/update.run",
        query: undefined,
        body: {
        "sessionKey": input["sessionKey"],
        "note": input["note"],
        "restartDelayMs": input["restartDelayMs"],
        "timeoutMs": input["timeoutMs"],
      },
        options,
      })
    },
    },
    "wizard": {
      "cancel": async (request: WizardCancelRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<WizardCancelResponse>({
        method: "POST",
        path: "/runtime/operations/wizard.cancel",
        query: undefined,
        body: {
        "sessionId": input["sessionId"],
      },
        options,
      })
    },
      "next": async (request: WizardNextRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<WizardNextResponse>({
        method: "POST",
        path: "/runtime/operations/wizard.next",
        query: undefined,
        body: {
        "sessionId": input["sessionId"],
        "answer": input["answer"],
      },
        options,
      })
    },
      "start": async (request: WizardStartRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<WizardStartResponse>({
        method: "POST",
        path: "/runtime/operations/wizard.start",
        query: undefined,
        body: {
        "mode": input["mode"],
        "workspace": input["workspace"],
      },
        options,
      })
    },
      "status": async (request: WizardStatusRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<WizardStatusResponse>({
        method: "POST",
        path: "/runtime/operations/wizard.status",
        query: undefined,
        body: {
        "sessionId": input["sessionId"],
      },
        options,
      })
    },
    },
    "workspaces": {
      "create": async (request: WorkspacesCreateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<WorkspacesCreateResponse>({
        method: "POST",
        path: "/runtime/operations/workspaces.create",
        query: undefined,
        body: {
        "name": input["name"],
        "path": input["path"],
        "template": input["template"],
      },
        options,
      })
    },
      "delete": async (request: WorkspacesDeleteRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<WorkspacesDeleteResponse>({
        method: "POST",
        path: "/runtime/operations/workspaces.delete",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "files": {
        "delete": async (request: WorkspacesFilesDeleteRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<WorkspacesFilesDeleteResponse>({
        method: "POST",
        path: "/runtime/operations/workspaces.files.delete",
        query: undefined,
        body: {
        "id": input["id"],
        "filename": input["filename"],
      },
        options,
      })
    },
        "get": async (request: WorkspacesFilesGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<WorkspacesFilesGetResponse>({
        method: "POST",
        path: "/runtime/operations/workspaces.files.get",
        query: undefined,
        body: {
        "id": input["id"],
        "filename": input["filename"],
      },
        options,
      })
    },
        "list": async (request: WorkspacesFilesListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<WorkspacesFilesListResponse>({
        method: "POST",
        path: "/runtime/operations/workspaces.files.list",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
        "set": async (request: WorkspacesFilesSetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<WorkspacesFilesSetResponse>({
        method: "POST",
        path: "/runtime/operations/workspaces.files.set",
        query: undefined,
        body: {
        "id": input["id"],
        "filename": input["filename"],
        "content": input["content"],
      },
        options,
      })
    },
      },
      "get": async (request: WorkspacesGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<WorkspacesGetResponse>({
        method: "POST",
        path: "/runtime/operations/workspaces.get",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
      "list": async (request: WorkspacesListRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<WorkspacesListResponse>({
        method: "POST",
        path: "/runtime/operations/workspaces.list",
        query: undefined,
        body: {
        "namePattern": input["namePattern"],
      },
        options,
      })
    },
      "manifest": {
        "get": async (request: WorkspacesManifestGetRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<WorkspacesManifestGetResponse>({
        method: "POST",
        path: "/runtime/operations/workspaces.manifest.get",
        query: undefined,
        body: {
        "id": input["id"],
      },
        options,
      })
    },
        "update": async (request: WorkspacesManifestUpdateRequest, options?: RequestOptions) => {
      const input = request as Record<string, unknown>;
      return http.request<WorkspacesManifestUpdateResponse>({
        method: "POST",
        path: "/runtime/operations/workspaces.manifest.update",
        query: undefined,
        body: {
        "id": input["id"],
        "manifest": input["manifest"],
      },
        options,
      })
    },
      },
    },
  };
}
