package nexsdk

import (
  "context"
  "net/http"

  generated "github.com/Napageneral/nex/artifacts/sdk/go/platform/nex-sdk-go/internal/generated"
)

type Option func(*clientOptions)

type clientOptions struct {
  headers map[string]string
  httpClient *http.Client
}

func WithHeader(key string, value string) Option {
  return func(options *clientOptions) {
    if options.headers == nil {
      options.headers = map[string]string{}
    }
    options.headers[key] = value
  }
}

func WithHTTPClient(client *http.Client) Option {
  return func(options *clientOptions) {
    options.httpClient = client
  }
}

type Client struct {
  raw *generated.APIClient
  Acl *AclClient
  Adapter *AdapterClient
  Adapters *AdaptersClient
  Agents *AgentsClient
  Apps *AppsClient
  Auth *AuthClient
  Browser *BrowserClient
  Channels *ChannelsClient
  Config *ConfigClient
  Contacts *ContactsClient
  Credentials *CredentialsClient
  Dags *DagsClient
  Entities *EntitiesClient
  Events *EventsClient
  Groups *GroupsClient
  Jobs *JobsClient
  Logs *LogsClient
  Memory *MemoryClient
  Models *ModelsClient
  Operator *OperatorClient
  Orientation *OrientationClient
  ProductControlPlane *ProductControlPlaneClient
  Record *RecordClient
  Records *RecordsClient
  Roles *RolesClient
  Runtime *RuntimeClient
  Sandboxes *SandboxesClient
  Schedules *SchedulesClient
  Search *SearchClient
  Skills *SkillsClient
  Talk *TalkClient
  Tools *ToolsClient
  Update *UpdateClient
  Wizard *WizardClient
  Workspaces *WorkspacesClient
}

type AclClient struct {
  raw *generated.APIClient
  Approval *AclApprovalClient
  Audit *AclAuditClient
  Policies *AclPoliciesClient
  Requests *AclRequestsClient
}

type AclApprovalClient struct {
  raw *generated.APIClient
}

type AclAuditClient struct {
  raw *generated.APIClient
}

type AclPoliciesClient struct {
  raw *generated.APIClient
}

type AclRequestsClient struct {
  raw *generated.APIClient
}

type AdapterClient struct {
  raw *generated.APIClient
  Connections *AdapterConnectionsClient
  Monitor *AdapterMonitorClient
  Serve *AdapterServeClient
  Setup *AdapterSetupClient
}

type AdapterConnectionsClient struct {
  raw *generated.APIClient
}

type AdapterMonitorClient struct {
  raw *generated.APIClient
}

type AdapterServeClient struct {
  raw *generated.APIClient
}

type AdapterSetupClient struct {
  raw *generated.APIClient
}

type AdaptersClient struct {
  raw *generated.APIClient
  Connections *AdaptersConnectionsClient
}

type AdaptersConnectionsClient struct {
  raw *generated.APIClient
  Credentials *AdaptersConnectionsCredentialsClient
  Custom *AdaptersConnectionsCustomClient
  Oauth *AdaptersConnectionsOauthClient
}

type AdaptersConnectionsCredentialsClient struct {
  raw *generated.APIClient
}

type AdaptersConnectionsCustomClient struct {
  raw *generated.APIClient
}

type AdaptersConnectionsOauthClient struct {
  raw *generated.APIClient
}

type AgentsClient struct {
  raw *generated.APIClient
  Conversations *AgentsConversationsClient
  Files *AgentsFilesClient
  Identity *AgentsIdentityClient
  Sessions *AgentsSessionsClient
}

type AgentsConversationsClient struct {
  raw *generated.APIClient
}

type AgentsFilesClient struct {
  raw *generated.APIClient
}

type AgentsIdentityClient struct {
  raw *generated.APIClient
}

type AgentsSessionsClient struct {
  raw *generated.APIClient
  Import *AgentsSessionsImportClient
  Imports *AgentsSessionsImportsClient
}

type AgentsSessionsImportClient struct {
  raw *generated.APIClient
}

type AgentsSessionsImportsClient struct {
  raw *generated.APIClient
}

type AppsClient struct {
  raw *generated.APIClient
}

type AuthClient struct {
  raw *generated.APIClient
  Tokens *AuthTokensClient
  Users *AuthUsersClient
}

type AuthTokensClient struct {
  raw *generated.APIClient
}

type AuthUsersClient struct {
  raw *generated.APIClient
}

type BrowserClient struct {
  raw *generated.APIClient
}

type ChannelsClient struct {
  raw *generated.APIClient
  Participants *ChannelsParticipantsClient
}

type ChannelsParticipantsClient struct {
  raw *generated.APIClient
}

type ConfigClient struct {
  raw *generated.APIClient
}

type ContactsClient struct {
  raw *generated.APIClient
}

type CredentialsClient struct {
  raw *generated.APIClient
  Vault *CredentialsVaultClient
}

type CredentialsVaultClient struct {
  raw *generated.APIClient
}

type DagsClient struct {
  raw *generated.APIClient
  Runs *DagsRunsClient
}

type DagsRunsClient struct {
  raw *generated.APIClient
}

type EntitiesClient struct {
  raw *generated.APIClient
  Merge *EntitiesMergeClient
  Tags *EntitiesTagsClient
}

type EntitiesMergeClient struct {
  raw *generated.APIClient
}

type EntitiesTagsClient struct {
  raw *generated.APIClient
}

type EventsClient struct {
  raw *generated.APIClient
  Subscriptions *EventsSubscriptionsClient
}

type EventsSubscriptionsClient struct {
  raw *generated.APIClient
}

type GroupsClient struct {
  raw *generated.APIClient
  Members *GroupsMembersClient
}

type GroupsMembersClient struct {
  raw *generated.APIClient
}

type JobsClient struct {
  raw *generated.APIClient
  Idempotency *JobsIdempotencyClient
  Lanes *JobsLanesClient
  Queue *JobsQueueClient
  Runs *JobsRunsClient
}

type JobsIdempotencyClient struct {
  raw *generated.APIClient
}

type JobsLanesClient struct {
  raw *generated.APIClient
}

type JobsQueueClient struct {
  raw *generated.APIClient
}

type JobsRunsClient struct {
  raw *generated.APIClient
}

type LogsClient struct {
  raw *generated.APIClient
}

type MemoryClient struct {
  raw *generated.APIClient
  Elements *MemoryElementsClient
  Entities *MemoryEntitiesClient
  Review *MemoryReviewClient
  Sets *MemorySetsClient
}

type MemoryElementsClient struct {
  raw *generated.APIClient
  Definitions *MemoryElementsDefinitionsClient
  Entities *MemoryElementsEntitiesClient
  Links *MemoryElementsLinksClient
}

type MemoryElementsDefinitionsClient struct {
  raw *generated.APIClient
}

type MemoryElementsEntitiesClient struct {
  raw *generated.APIClient
}

type MemoryElementsLinksClient struct {
  raw *generated.APIClient
}

type MemoryEntitiesClient struct {
  raw *generated.APIClient
}

type MemoryReviewClient struct {
  raw *generated.APIClient
  Entity *MemoryReviewEntityClient
  Episode *MemoryReviewEpisodeClient
  Fact *MemoryReviewFactClient
  Observation *MemoryReviewObservationClient
  Quality *MemoryReviewQualityClient
  Run *MemoryReviewRunClient
  Runs *MemoryReviewRunsClient
}

type MemoryReviewEntityClient struct {
  raw *generated.APIClient
}

type MemoryReviewEpisodeClient struct {
  raw *generated.APIClient
  Outputs *MemoryReviewEpisodeOutputsClient
}

type MemoryReviewEpisodeOutputsClient struct {
  raw *generated.APIClient
}

type MemoryReviewFactClient struct {
  raw *generated.APIClient
}

type MemoryReviewObservationClient struct {
  raw *generated.APIClient
}

type MemoryReviewQualityClient struct {
  raw *generated.APIClient
  Items *MemoryReviewQualityItemsClient
}

type MemoryReviewQualityItemsClient struct {
  raw *generated.APIClient
}

type MemoryReviewRunClient struct {
  raw *generated.APIClient
  Episodes *MemoryReviewRunEpisodesClient
}

type MemoryReviewRunEpisodesClient struct {
  raw *generated.APIClient
}

type MemoryReviewRunsClient struct {
  raw *generated.APIClient
}

type MemorySetsClient struct {
  raw *generated.APIClient
  Members *MemorySetsMembersClient
}

type MemorySetsMembersClient struct {
  raw *generated.APIClient
}

type ModelsClient struct {
  raw *generated.APIClient
  Catalog *ModelsCatalogClient
  Configs *ModelsConfigsClient
  Connections *ModelsConnectionsClient
  Defaults *ModelsDefaultsClient
  Providers *ModelsProvidersClient
}

type ModelsCatalogClient struct {
  raw *generated.APIClient
}

type ModelsConfigsClient struct {
  raw *generated.APIClient
}

type ModelsConnectionsClient struct {
  raw *generated.APIClient
}

type ModelsDefaultsClient struct {
  raw *generated.APIClient
}

type ModelsProvidersClient struct {
  raw *generated.APIClient
}

type OperatorClient struct {
  raw *generated.APIClient
  Packages *OperatorPackagesClient
}

type OperatorPackagesClient struct {
  raw *generated.APIClient
}

type OrientationClient struct {
  raw *generated.APIClient
}

type ProductControlPlaneClient struct {
  raw *generated.APIClient
}

type RecordClient struct {
  raw *generated.APIClient
}

type RecordsClient struct {
  raw *generated.APIClient
}

type RolesClient struct {
  raw *generated.APIClient
}

type RuntimeClient struct {
  raw *generated.APIClient
}

type SandboxesClient struct {
  raw *generated.APIClient
}

type SchedulesClient struct {
  raw *generated.APIClient
}

type SearchClient struct {
  raw *generated.APIClient
}

type SkillsClient struct {
  raw *generated.APIClient
}

type TalkClient struct {
  raw *generated.APIClient
}

type ToolsClient struct {
  raw *generated.APIClient
}

type UpdateClient struct {
  raw *generated.APIClient
}

type WizardClient struct {
  raw *generated.APIClient
}

type WorkspacesClient struct {
  raw *generated.APIClient
  Files *WorkspacesFilesClient
  Manifest *WorkspacesManifestClient
}

type WorkspacesFilesClient struct {
  raw *generated.APIClient
}

type WorkspacesManifestClient struct {
  raw *generated.APIClient
}

type AclApprovalRequestResponse = generated.AclApprovalRequest200Response
type AclAuditGetResponse = generated.AclAuditGet200Response
type AclAuditListResponse = generated.AclAuditGet200Response
type AclAuditStatsResponse = generated.AclAuditGet200Response
type AclEvaluateResponse = generated.AclAuditGet200Response
type AclPoliciesCreateResponse = generated.AclAuditGet200Response
type AclPoliciesDeleteResponse = generated.AclAuditGet200Response
type AclPoliciesDisableResponse = generated.AclAuditGet200Response
type AclPoliciesEnableResponse = generated.AclAuditGet200Response
type AclPoliciesGetResponse = generated.AclAuditGet200Response
type AclPoliciesListResponse = generated.AclAuditGet200Response
type AclPoliciesUpdateResponse = generated.AclAuditGet200Response
type AclRequestsApproveResponse = generated.AclRequestsApprove200Response
type AclRequestsDenyResponse = generated.AclRequestsDeny200Response
type AclRequestsListResponse = generated.AclRequestsList200Response
type AclRequestsShowResponse = generated.AclRequestsShow200Response
type AdapterConnectionsListResponse = generated.AclAuditGet200Response
type AdapterHealthResponse = generated.AclAuditGet200Response
type AdapterInfoResponse = generated.AclAuditGet200Response
type AdapterMonitorStartResponse = generated.AclAuditGet200Response
type AdapterMonitorStopResponse = generated.AclAuditGet200Response
type AdapterServeStartResponse = generated.AclAuditGet200Response
type AdapterSetupCancelResponse = generated.AclAuditGet200Response
type AdapterSetupStartResponse = generated.AclAuditGet200Response
type AdapterSetupStatusResponse = generated.AclAuditGet200Response
type AdapterSetupSubmitResponse = generated.AclAuditGet200Response
type AdaptersConnectionsBackfillResponse = generated.AdaptersConnectionsBackfill200Response
type AdaptersConnectionsCreateResponse = generated.AclAuditGet200Response
type AdaptersConnectionsCredentialsGetResponse = generated.AdaptersConnectionsCredentialsGet200Response
type AdaptersConnectionsCustomCancelResponse = generated.AclAuditGet200Response
type AdaptersConnectionsCustomStartResponse = generated.AclAuditGet200Response
type AdaptersConnectionsCustomStatusResponse = generated.AclAuditGet200Response
type AdaptersConnectionsCustomSubmitResponse = generated.AclAuditGet200Response
type AdaptersConnectionsDisconnectResponse = generated.AclAuditGet200Response
type AdaptersConnectionsGetResponse = generated.AclAuditGet200Response
type AdaptersConnectionsListResponse = generated.AdaptersConnectionsList200Response
type AdaptersConnectionsOauthCompleteResponse = generated.AclAuditGet200Response
type AdaptersConnectionsOauthStartResponse = generated.AdaptersConnectionsOauthStart200Response
type AdaptersConnectionsStatusResponse = generated.AdaptersConnectionsStatus200Response
type AdaptersConnectionsTestResponse = generated.AclAuditGet200Response
type AdaptersConnectionsUpdateResponse = generated.AclAuditGet200Response
type AdaptersConnectionsUploadResponse = generated.AclAuditGet200Response
type AdaptersMethodsResponse = generated.AclAuditGet200Response
type AgentsConversationsAbortResponse = generated.AclAuditGet200Response
type AgentsConversationsGetResponse = generated.AclAuditGet200Response
type AgentsConversationsHistoryResponse = generated.AclAuditGet200Response
type AgentsConversationsListResponse = generated.AclAuditGet200Response
type AgentsConversationsSearchResponse = generated.AclAuditGet200Response
type AgentsConversationsSendResponse = generated.AclAuditGet200Response
type AgentsCreateResponse = generated.AgentsCreate200Response
type AgentsDeleteResponse = generated.AgentsDelete200Response
type AgentsFilesGetResponse = generated.AgentsFilesGet200Response
type AgentsFilesListResponse = generated.AgentsFilesList200Response
type AgentsFilesSetResponse = generated.AgentsFilesSet200Response
type AgentsIdentityGetResponse = generated.AgentsIdentityGet200Response
type AgentsListResponse = generated.AgentsList200Response
type AgentsSessionsArchiveResponse = generated.AclAuditGet200Response
type AgentsSessionsCompactResponse = generated.AclAuditGet200Response
type AgentsSessionsCreateResponse = generated.AclAuditGet200Response
type AgentsSessionsForkResponse = generated.AclAuditGet200Response
type AgentsSessionsGetResponse = generated.AclAuditGet200Response
type AgentsSessionsHistoryResponse = generated.AclAuditGet200Response
type AgentsSessionsImportChunkResponse = generated.AclAuditGet200Response
type AgentsSessionsImportExecuteResponse = generated.AclAuditGet200Response
type AgentsSessionsImportsListResponse = generated.AgentsSessionsImportsList200Response
type AgentsSessionsListResponse = generated.AgentsSessionsList200Response
type AgentsSessionsPatchResponse = generated.AclAuditGet200Response
type AgentsSessionsPreviewResponse = generated.AgentsSessionsPreview200Response
type AgentsSessionsResetResponse = generated.AclAuditGet200Response
type AgentsSessionsResolveResponse = generated.AgentsSessionsResolve200Response
type AgentsSessionsSendResponse = generated.AclAuditGet200Response
type AgentsSessionsTransferResponse = generated.AclAuditGet200Response
type AgentsUpdateResponse = generated.AgentsDelete200Response
type AgentsWaitResponse = generated.AclAuditGet200Response
type AppsGetResponse = generated.AppsGet200Response
type AppsInstallResponse = generated.AclAuditGet200Response
type AppsListResponse = generated.AppsList200Response
type AppsLogsResponse = generated.AclAuditGet200Response
type AppsMethodsResponse = generated.AppsMethods200Response
type AppsStartResponse = generated.AclAuditGet200Response
type AppsStatusResponse = generated.AppsStatus200Response
type AppsStopResponse = generated.AclAuditGet200Response
type AppsUninstallResponse = generated.AclAuditGet200Response
type AuthLoginResponse = generated.AuthLogin200Response
type AuthTokensCreateResponse = generated.AuthTokensCreate200Response
type AuthTokensListResponse = generated.AuthTokensList200Response
type AuthTokensRevokeResponse = generated.AuthTokensRevoke200Response
type AuthTokensRotateResponse = generated.AuthTokensRotate200Response
type AuthUsersCreateResponse = generated.AuthUsersCreate200Response
type AuthUsersListResponse = generated.AuthUsersList200Response
type AuthUsersSetPasswordResponse = generated.AuthUsersSetPassword200Response
type BrowserRequestResponse = generated.AclAuditGet200Response
type ChannelsCreateResponse = generated.ChannelsCreate200Response
type ChannelsGetResponse = generated.ChannelsCreate200Response
type ChannelsHistoryResponse = generated.ChannelsHistory200Response
type ChannelsListResponse = generated.ChannelsList200Response
type ChannelsParticipantsGetResponse = generated.ChannelsParticipantsGet200Response
type ChannelsParticipantsHistoryResponse = generated.ChannelsParticipantsHistory200Response
type ChannelsParticipantsListResponse = generated.ChannelsParticipantsList200Response
type ChannelsResolveResponse = generated.ChannelsResolve200Response
type ChannelsSearchResponse = generated.ChannelsSearch200Response
type ChannelsStatusResponse = generated.ChannelsStatus200Response
type ChannelsUpdateResponse = generated.ChannelsUpdate200Response
type ConfigApplyResponse = generated.ConfigApply200Response
type ConfigGetResponse = generated.ConfigGet200Response
type ConfigPatchResponse = generated.ConfigApply200Response
type ConfigSchemaResponse = generated.ConfigSchema200Response
type ConfigSetResponse = generated.ConfigApply200Response
type ContactsCreateResponse = generated.ContactsCreate200Response
type ContactsGetResponse = generated.ContactsGet200Response
type ContactsHistoryResponse = generated.ContactsHistory200Response
type ContactsImportResponse = generated.ContactsImport200Response
type ContactsListResponse = generated.ContactsList200Response
type ContactsSearchResponse = generated.ContactsList200Response
type ContactsUpdateResponse = generated.ContactsCreate200Response
type CredentialsCreateResponse = generated.CredentialsCreate200Response
type CredentialsGetResponse = generated.CredentialsGet200Response
type CredentialsListResponse = generated.CredentialsList200Response
type CredentialsResolveResponse = generated.CredentialsResolve200Response
type CredentialsRevokeResponse = generated.CredentialsRevoke200Response
type CredentialsUpdateResponse = generated.CredentialsCreate200Response
type CredentialsVaultRetrieveResponse = generated.CredentialsVaultRetrieve200Response
type CredentialsVaultStoreResponse = generated.CredentialsVaultStore200Response
type DagsCreateResponse = generated.AclAuditGet200Response
type DagsDeleteResponse = generated.AclAuditGet200Response
type DagsGetResponse = generated.AclAuditGet200Response
type DagsListResponse = generated.AclAuditGet200Response
type DagsRunsCancelResponse = generated.AclAuditGet200Response
type DagsRunsGetResponse = generated.AclAuditGet200Response
type DagsRunsListResponse = generated.AclAuditGet200Response
type DagsRunsPauseResponse = generated.AclAuditGet200Response
type DagsRunsResumeResponse = generated.AclAuditGet200Response
type DagsRunsStartResponse = generated.AclAuditGet200Response
type DagsUpdateResponse = generated.AclAuditGet200Response
type EntitiesCreateResponse = generated.EntitiesCreate200Response
type EntitiesGetResponse = generated.EntitiesGet200Response
type EntitiesListResponse = generated.EntitiesList200Response
type EntitiesMergeApplyResponse = generated.EntitiesMergeApply200Response
type EntitiesMergeCandidatesResponse = generated.EntitiesMergeCandidates200Response
type EntitiesMergeProposeResponse = generated.EntitiesMergePropose200Response
type EntitiesMergeResolveResponse = generated.EntitiesMergeResolve200Response
type EntitiesResolveResponse = generated.EntitiesResolve200Response
type EntitiesTagsAddResponse = generated.EntitiesTagsAdd200Response
type EntitiesTagsListResponse = generated.EntitiesTagsList200Response
type EntitiesTagsRemoveResponse = generated.EntitiesTagsRemove200Response
type EntitiesUpdateResponse = generated.EntitiesCreate200Response
type EventsPublishResponse = generated.EventsPublish200Response
type EventsSubscribeResponse = generated.AclAuditGet200Response
type EventsSubscriptionsCreateResponse = generated.EventsSubscriptionsCreate200Response
type EventsSubscriptionsDeleteResponse = generated.EventsSubscriptionsDelete200Response
type EventsSubscriptionsGetResponse = generated.EventsSubscriptionsCreate200Response
type EventsSubscriptionsListResponse = generated.EventsSubscriptionsList200Response
type EventsSubscriptionsUpdateResponse = generated.EventsSubscriptionsCreate200Response
type EventsUnsubscribeResponse = generated.EventsUnsubscribe200Response
type GroupsCreateResponse = generated.GroupsCreate200Response
type GroupsDeleteResponse = generated.GroupsDelete200Response
type GroupsGetResponse = generated.GroupsGet200Response
type GroupsListResponse = generated.GroupsList200Response
type GroupsMembersAddResponse = generated.GroupsMembersAdd200Response
type GroupsMembersListResponse = generated.GroupsMembersList200Response
type GroupsMembersRemoveResponse = generated.GroupsMembersAdd200Response
type GroupsUpdateResponse = generated.GroupsCreate200Response
type JobsCancelResponse = generated.JobsCancel200Response
type JobsCreateResponse = generated.JobsCreate200Response
type JobsDeleteResponse = generated.JobsDelete200Response
type JobsGetResponse = generated.JobsGet200Response
type JobsIdempotencyListResponse = generated.JobsIdempotencyList200Response
type JobsInvokeResponse = generated.JobsInvoke200Response
type JobsLanesListResponse = generated.JobsLanesList200Response
type JobsListResponse = generated.JobsList200Response
type JobsQueueGetResponse = generated.JobsQueueGet200Response
type JobsQueueListResponse = generated.JobsQueueList200Response
type JobsRequeueResponse = generated.JobsRequeue200Response
type JobsRetryResponse = generated.JobsRetry200Response
type JobsRunsGetResponse = generated.JobsRunsGet200Response
type JobsRunsListResponse = generated.JobsRunsList200Response
type JobsStatusResponse = generated.JobsStatus200Response
type JobsUpdateResponse = generated.JobsCreate200Response
type LogsTailResponse = generated.LogsTail200Response
type MemoryElementsConsolidateResponse = generated.AclAuditGet200Response
type MemoryElementsCreateResponse = generated.AclAuditGet200Response
type MemoryElementsDefinitionsCreateResponse = generated.AclAuditGet200Response
type MemoryElementsDefinitionsGetResponse = generated.AclAuditGet200Response
type MemoryElementsDefinitionsListResponse = generated.AclAuditGet200Response
type MemoryElementsEntitiesLinkResponse = generated.AclAuditGet200Response
type MemoryElementsEntitiesListResponse = generated.AclAuditGet200Response
type MemoryElementsGetResponse = generated.AclAuditGet200Response
type MemoryElementsLinksCreateResponse = generated.AclAuditGet200Response
type MemoryElementsLinksListResponse = generated.AclAuditGet200Response
type MemoryElementsLinksTraverseResponse = generated.AclAuditGet200Response
type MemoryElementsListResponse = generated.AclAuditGet200Response
type MemoryElementsResolveHeadResponse = generated.AclAuditGet200Response
type MemoryElementsSearchResponse = generated.AclAuditGet200Response
type MemoryElementsUpdateResponse = generated.AclAuditGet200Response
type MemoryEntitiesConfirmResponse = generated.AclAuditGet200Response
type MemoryEntitiesCreateResponse = generated.AclAuditGet200Response
type MemoryEntitiesProposeMergeResponse = generated.AclAuditGet200Response
type MemoryRecallResponse = generated.AclAuditGet200Response
type MemoryReviewEntityGetResponse = generated.AclAuditGet200Response
type MemoryReviewEpisodeGetResponse = generated.AclAuditGet200Response
type MemoryReviewEpisodeOutputsGetResponse = generated.AclAuditGet200Response
type MemoryReviewFactGetResponse = generated.AclAuditGet200Response
type MemoryReviewObservationGetResponse = generated.AclAuditGet200Response
type MemoryReviewQualityItemsListResponse = generated.AclAuditGet200Response
type MemoryReviewQualitySummaryResponse = generated.AclAuditGet200Response
type MemoryReviewRunEpisodesListResponse = generated.AclAuditGet200Response
type MemoryReviewRunGetResponse = generated.AclAuditGet200Response
type MemoryReviewRunsListResponse = generated.AclAuditGet200Response
type MemoryReviewSearchResponse = generated.AclAuditGet200Response
type MemorySetsCreateResponse = generated.AclAuditGet200Response
type MemorySetsGetResponse = generated.AclAuditGet200Response
type MemorySetsListResponse = generated.AclAuditGet200Response
type MemorySetsMembersAddResponse = generated.AclAuditGet200Response
type MemorySetsMembersListResponse = generated.AclAuditGet200Response
type ModelsCatalogGetResponse = generated.AclAuditGet200Response
type ModelsCatalogListResponse = generated.AclAuditGet200Response
type ModelsConfigsCreateResponse = generated.AclAuditGet200Response
type ModelsConfigsDeleteResponse = generated.AclAuditGet200Response
type ModelsConfigsGetResponse = generated.AclAuditGet200Response
type ModelsConfigsListResponse = generated.AclAuditGet200Response
type ModelsConfigsUpdateResponse = generated.AclAuditGet200Response
type ModelsConnectionsCreateResponse = generated.AclAuditGet200Response
type ModelsConnectionsDisconnectResponse = generated.AclAuditGet200Response
type ModelsConnectionsGetResponse = generated.AclAuditGet200Response
type ModelsConnectionsListResponse = generated.AclAuditGet200Response
type ModelsConnectionsStatusResponse = generated.AclAuditGet200Response
type ModelsConnectionsTestResponse = generated.AclAuditGet200Response
type ModelsConnectionsUpdateResponse = generated.AclAuditGet200Response
type ModelsDefaultsGetResponse = generated.AclAuditGet200Response
type ModelsDefaultsPutResponse = generated.AclAuditGet200Response
type ModelsGetResponse = generated.ModelsGet200Response
type ModelsListResponse = generated.ModelsList200Response
type ModelsProvidersDeleteResponse = generated.AclAuditGet200Response
type ModelsProvidersGetResponse = generated.AclAuditGet200Response
type ModelsProvidersListResponse = generated.AclAuditGet200Response
type ModelsProvidersPutResponse = generated.AclAuditGet200Response
type ModelsProvidersTestResponse = generated.AclAuditGet200Response
type OperatorPackagesGetResponse = generated.AclAuditGet200Response
type OperatorPackagesHealthResponse = generated.AclAuditGet200Response
type OperatorPackagesInstallResponse = generated.AclAuditGet200Response
type OperatorPackagesUninstallResponse = generated.AclAuditGet200Response
type OperatorPackagesUpgradeResponse = generated.AclAuditGet200Response
type OrientationContractsResponse = generated.AclAuditGet200Response
type OrientationInventoryResponse = generated.AclAuditGet200Response
type OrientationSchemasResponse = generated.AclAuditGet200Response
type OrientationSummaryResponse = generated.AclAuditGet200Response
type OrientationTaxonomyResponse = generated.AclAuditGet200Response
type ProductControlPlaneCallResponse = generated.ProductControlPlaneCall200Response
type RecordIngestResponse = generated.AclAuditGet200Response
type RecordsGetResponse = generated.RecordsGet200Response
type RecordsListResponse = generated.RecordsList200Response
type RecordsSearchResponse = generated.RecordsList200Response
type RolesCreateResponse = generated.AclAuditGet200Response
type RolesDeleteResponse = generated.AclAuditGet200Response
type RolesGetResponse = generated.AclAuditGet200Response
type RolesListResponse = generated.AclAuditGet200Response
type RolesUpdateResponse = generated.AclAuditGet200Response
type RuntimeHealthResponse = generated.RuntimeHealth200Response
type SandboxesCreateResponse = generated.SandboxesCreate200Response
type SandboxesDestroyResponse = generated.SandboxesCreate200Response
type SandboxesExecResponse = generated.SandboxesExec200Response
type SandboxesForkResponse = generated.SandboxesCreate200Response
type SandboxesGetResponse = generated.SandboxesCreate200Response
type SandboxesListResponse = generated.SandboxesList200Response
type SandboxesResumeResponse = generated.SandboxesCreate200Response
type SandboxesRetainResponse = generated.SandboxesCreate200Response
type SchedulesCreateResponse = generated.SchedulesCreate200Response
type SchedulesDeleteResponse = generated.JobsDelete200Response
type SchedulesGetResponse = generated.SchedulesGet200Response
type SchedulesListResponse = generated.SchedulesList200Response
type SchedulesTriggerResponse = generated.SchedulesTrigger200Response
type SchedulesUpdateResponse = generated.SchedulesCreate200Response
type SearchRebuildResponse = generated.AclAuditGet200Response
type SearchStatusResponse = generated.AclAuditGet200Response
type SkillsListResponse = generated.SkillsList200Response
type SkillsSearchResponse = generated.SkillsSearch200Response
type SkillsUseResponse = generated.SkillsUse200Response
type StatusResponse = generated.AclAuditGet200Response
type SystemPresenceResponse = generated.AclAuditGet200Response
type TalkModeResponse = generated.TalkMode200Response
type ToolsCatalogResponse = generated.AclAuditGet200Response
type ToolsInvokeResponse = generated.AclAuditGet200Response
type UpdateRunResponse = generated.AclAuditGet200Response
type WizardCancelResponse = generated.WizardCancel200Response
type WizardNextResponse = generated.WizardNext200Response
type WizardStartResponse = generated.WizardStart200Response
type WizardStatusResponse = generated.WizardStatus200Response
type WorkspacesCreateResponse = generated.WorkspacesCreate200Response
type WorkspacesDeleteResponse = generated.WorkspacesDelete200Response
type WorkspacesFilesDeleteResponse = generated.WorkspacesFilesDelete200Response
type WorkspacesFilesGetResponse = generated.WorkspacesFilesGet200Response
type WorkspacesFilesListResponse = generated.WorkspacesFilesList200Response
type WorkspacesFilesSetResponse = generated.WorkspacesFilesSet200Response
type WorkspacesGetResponse = generated.WorkspacesGet200Response
type WorkspacesListResponse = generated.WorkspacesList200Response
type WorkspacesManifestGetResponse = generated.WorkspacesManifestGet200Response
type WorkspacesManifestUpdateResponse = generated.WorkspacesManifestGet200Response

type AclApprovalRequestRequest = generated.AclApprovalRequestRequest

type AclAuditGetRequest = map[string]interface{}

type AclAuditListRequest = map[string]interface{}

type AclAuditStatsRequest = map[string]interface{}

type AclEvaluateRequest = map[string]interface{}

type AclPoliciesCreateRequest = map[string]interface{}

type AclPoliciesDeleteRequest = map[string]interface{}

type AclPoliciesDisableRequest = map[string]interface{}

type AclPoliciesEnableRequest = map[string]interface{}

type AclPoliciesGetRequest = map[string]interface{}

type AclPoliciesListRequest = map[string]interface{}

type AclPoliciesUpdateRequest = map[string]interface{}

type AclRequestsApproveRequest = generated.AclRequestsApproveRequest

type AclRequestsDenyRequest = generated.AclRequestsDenyRequest

type AclRequestsListRequest = generated.AclRequestsListRequest

type AclRequestsShowRequest = generated.AppsInstallAliasApiAppsInstallRequest

type AdapterConnectionsListRequest = map[string]interface{}

type AdapterHealthRequest = map[string]interface{}

type AdapterInfoRequest = map[string]interface{}

type AdapterMonitorStartRequest = map[string]interface{}

type AdapterMonitorStopRequest = map[string]interface{}

type AdapterServeStartRequest = map[string]interface{}

type AdapterSetupCancelRequest = map[string]interface{}

type AdapterSetupStartRequest = map[string]interface{}

type AdapterSetupStatusRequest = map[string]interface{}

type AdapterSetupSubmitRequest = map[string]interface{}

type AdaptersConnectionsBackfillRequest = generated.AdaptersConnectionsBackfillRequest

type AdaptersConnectionsCreateRequest = generated.AdaptersConnectionsCreateRequest

type AdaptersConnectionsCredentialsGetRequest = generated.AdaptersConnectionsCredentialsGetRequest

type AdaptersConnectionsCustomCancelRequest = generated.AdaptersConnectionsCustomCancelRequest

type AdaptersConnectionsCustomStartRequest = generated.AdaptersConnectionsCustomStartRequest

type AdaptersConnectionsCustomStatusRequest = generated.AdaptersConnectionsCustomCancelRequest

type AdaptersConnectionsCustomSubmitRequest = generated.AdaptersConnectionsCustomSubmitRequest

type AdaptersConnectionsDisconnectRequest = generated.AdaptersConnectionsDisconnectRequest

type AdaptersConnectionsGetRequest = map[string]interface{}

type AdaptersConnectionsListRequest = map[string]interface{}

type AdaptersConnectionsOauthCompleteRequest = generated.AdaptersConnectionsOauthCompleteRequest

type AdaptersConnectionsOauthStartRequest = generated.AdaptersConnectionsOauthStartRequest

type AdaptersConnectionsStatusRequest = generated.AdaptersConnectionsDisconnectRequest

type AdaptersConnectionsTestRequest = generated.AdaptersConnectionsDisconnectRequest

type AdaptersConnectionsUpdateRequest = generated.AdaptersConnectionsUpdateRequest

type AdaptersConnectionsUploadRequest = generated.AdaptersConnectionsUploadRequest

type AdaptersMethodsRequest = map[string]interface{}

type AgentsConversationsAbortRequest = map[string]interface{}

type AgentsConversationsGetRequest = map[string]interface{}

type AgentsConversationsHistoryRequest = map[string]interface{}

type AgentsConversationsListRequest = map[string]interface{}

type AgentsConversationsSearchRequest = map[string]interface{}

type AgentsConversationsSendRequest = map[string]interface{}

type AgentsCreateRequest = generated.AgentsCreateRequest

type AgentsDeleteRequest = generated.AgentsDeleteRequest

type AgentsFilesGetRequest = generated.AgentsFilesGetRequest

type AgentsFilesListRequest = generated.AgentsFilesListRequest

type AgentsFilesSetRequest = generated.AgentsFilesSetRequest

type AgentsIdentityGetRequest = generated.AgentsIdentityGetRequest

type AgentsListRequest = map[string]interface{}

type AgentsSessionsArchiveRequest = generated.AgentsSessionsArchiveRequest

type AgentsSessionsCompactRequest = generated.AgentsSessionsCompactRequest

type AgentsSessionsCreateRequest = map[string]interface{}

type AgentsSessionsForkRequest = map[string]interface{}

type AgentsSessionsGetRequest = map[string]interface{}

type AgentsSessionsHistoryRequest = map[string]interface{}

type AgentsSessionsImportChunkRequest = generated.AgentsSessionsImportChunkRequest

type AgentsSessionsImportExecuteRequest = generated.AgentsSessionsImportExecuteRequest

type AgentsSessionsImportsListRequest = generated.AgentsSessionsImportsListRequest

type AgentsSessionsListRequest = generated.AgentsSessionsListRequest

type AgentsSessionsPatchRequest = generated.AgentsSessionsPatchRequest

type AgentsSessionsPreviewRequest = generated.AgentsSessionsPreviewRequest

type AgentsSessionsResetRequest = generated.AgentsSessionsResetRequest

type AgentsSessionsResolveRequest = generated.AgentsSessionsResolveRequest

type AgentsSessionsSendRequest = generated.AgentsSessionsSendRequest

type AgentsSessionsTransferRequest = map[string]interface{}

type AgentsUpdateRequest = generated.AgentsUpdateRequest

type AgentsWaitRequest = generated.AgentsWaitRequest

type AppsGetRequest = generated.AppsInstallAliasApiAppsInstallRequest

type AppsInstallRequest = generated.AppsInstallAliasApiAppsInstallRequest

type AppsListRequest = map[string]interface{}

type AppsLogsRequest = generated.AppsInstallAliasApiAppsInstallRequest

type AppsMethodsRequest = generated.AppsInstallAliasApiAppsInstallRequest

type AppsStartRequest = generated.AppsInstallAliasApiAppsInstallRequest

type AppsStatusRequest = generated.AppsInstallAliasApiAppsInstallRequest

type AppsStopRequest = generated.AppsInstallAliasApiAppsInstallRequest

type AppsUninstallRequest = generated.AppsInstallAliasApiAppsInstallRequest

type AuthLoginRequest = generated.AuthLoginAliasApiAuthLoginRequest

type AuthTokensCreateRequest = generated.AuthTokensCreateRequest

type AuthTokensListRequest = generated.AuthTokensListRequest

type AuthTokensRevokeRequest = generated.AppsInstallAliasApiAppsInstallRequest

type AuthTokensRotateRequest = generated.AuthTokensRotateRequest

type AuthUsersCreateRequest = generated.AuthUsersCreateRequest

type AuthUsersListRequest = map[string]interface{}

type AuthUsersSetPasswordRequest = generated.AuthUsersSetPasswordRequest

type BrowserRequestRequest = map[string]interface{}

type ChannelsCreateRequest = generated.ChannelsCreateRequest

type ChannelsGetRequest = generated.AppsInstallAliasApiAppsInstallRequest

type ChannelsHistoryRequest = generated.ChannelsHistoryRequest

type ChannelsListRequest = generated.ChannelsListRequest

type ChannelsParticipantsGetRequest = generated.AppsInstallAliasApiAppsInstallRequest

type ChannelsParticipantsHistoryRequest = generated.ChannelsParticipantsHistoryRequest

type ChannelsParticipantsListRequest = generated.ChannelsParticipantsListRequest

type ChannelsResolveRequest = generated.ChannelsResolveRequest

type ChannelsSearchRequest = generated.ChannelsSearchRequest

type ChannelsStatusRequest = generated.ChannelsStatusRequest

type ChannelsUpdateRequest = generated.ChannelsUpdateRequest

type ConfigApplyRequest = generated.ConfigApplyRequest

type ConfigGetRequest = map[string]interface{}

type ConfigPatchRequest = generated.ConfigApplyRequest

type ConfigSchemaRequest = map[string]interface{}

type ConfigSetRequest = generated.ConfigSetRequest

type ContactsCreateRequest = generated.ContactsCreateRequest

type ContactsGetRequest = generated.AppsInstallAliasApiAppsInstallRequest

type ContactsHistoryRequest = generated.ContactsHistoryRequest

type ContactsImportRequest = generated.ContactsImportRequest

type ContactsListRequest = generated.ContactsListRequest

type ContactsSearchRequest = generated.ContactsSearchRequest

type ContactsUpdateRequest = generated.ContactsUpdateRequest

type CredentialsCreateRequest = generated.CredentialsCreateRequest

type CredentialsGetRequest = generated.AppsInstallAliasApiAppsInstallRequest

type CredentialsListRequest = generated.CredentialsListRequest

type CredentialsResolveRequest = generated.CredentialsResolveRequest

type CredentialsRevokeRequest = generated.AppsInstallAliasApiAppsInstallRequest

type CredentialsUpdateRequest = generated.CredentialsUpdateRequest

type CredentialsVaultRetrieveRequest = generated.CredentialsVaultRetrieveRequest

type CredentialsVaultStoreRequest = generated.CredentialsVaultStoreRequest

type DagsCreateRequest = map[string]interface{}

type DagsDeleteRequest = map[string]interface{}

type DagsGetRequest = map[string]interface{}

type DagsListRequest = map[string]interface{}

type DagsRunsCancelRequest = map[string]interface{}

type DagsRunsGetRequest = map[string]interface{}

type DagsRunsListRequest = map[string]interface{}

type DagsRunsPauseRequest = map[string]interface{}

type DagsRunsResumeRequest = map[string]interface{}

type DagsRunsStartRequest = map[string]interface{}

type DagsUpdateRequest = map[string]interface{}

type EntitiesCreateRequest = generated.EntitiesCreateRequest

type EntitiesGetRequest = generated.AppsInstallAliasApiAppsInstallRequest

type EntitiesListRequest = generated.EntitiesListRequest

type EntitiesMergeApplyRequest = generated.EntitiesMergeApplyRequest

type EntitiesMergeCandidatesRequest = generated.EntitiesMergeCandidatesRequest

type EntitiesMergeProposeRequest = generated.EntitiesMergeProposeRequest

type EntitiesMergeResolveRequest = generated.EntitiesMergeResolveRequest

type EntitiesResolveRequest = generated.EntitiesResolveRequest

type EntitiesTagsAddRequest = generated.EntitiesTagsAddRequest

type EntitiesTagsListRequest = generated.EntitiesResolveRequest

type EntitiesTagsRemoveRequest = generated.EntitiesTagsAddRequest

type EntitiesUpdateRequest = generated.EntitiesUpdateRequest

type EventsPublishRequest = generated.EventsPublishRequest

type EventsSubscribeRequest = map[string]interface{}

type EventsSubscriptionsCreateRequest = generated.EventsSubscriptionsCreateRequest

type EventsSubscriptionsDeleteRequest = generated.AppsInstallAliasApiAppsInstallRequest

type EventsSubscriptionsGetRequest = generated.AppsInstallAliasApiAppsInstallRequest

type EventsSubscriptionsListRequest = generated.EventsSubscriptionsListRequest

type EventsSubscriptionsUpdateRequest = generated.EventsSubscriptionsUpdateRequest

type EventsUnsubscribeRequest = map[string]interface{}

type GroupsCreateRequest = generated.GroupsCreateRequest

type GroupsDeleteRequest = generated.AppsInstallAliasApiAppsInstallRequest

type GroupsGetRequest = generated.AppsInstallAliasApiAppsInstallRequest

type GroupsListRequest = generated.EntitiesMergeCandidatesRequest

type GroupsMembersAddRequest = generated.GroupsMembersAddRequest

type GroupsMembersListRequest = generated.GroupsMembersListRequest

type GroupsMembersRemoveRequest = generated.GroupsMembersRemoveRequest

type GroupsUpdateRequest = generated.GroupsUpdateRequest

type JobsCancelRequest = generated.JobsCancelRequest

type JobsCreateRequest = generated.JobsCreateRequest

type JobsDeleteRequest = generated.AppsInstallAliasApiAppsInstallRequest

type JobsGetRequest = generated.AppsInstallAliasApiAppsInstallRequest

type JobsIdempotencyListRequest = generated.JobsIdempotencyListRequest

type JobsInvokeRequest = generated.JobsInvokeRequest

type JobsLanesListRequest = generated.JobsLanesListRequest

type JobsListRequest = generated.JobsListRequest

type JobsQueueGetRequest = generated.JobsQueueGetRequest

type JobsQueueListRequest = generated.JobsQueueListRequest

type JobsRequeueRequest = generated.JobsCancelRequest

type JobsRetryRequest = generated.JobsCancelRequest

type JobsRunsGetRequest = generated.AppsInstallAliasApiAppsInstallRequest

type JobsRunsListRequest = generated.JobsRunsListRequest

type JobsStatusRequest = map[string]interface{}

type JobsUpdateRequest = generated.JobsUpdateRequest

type LogsTailRequest = generated.LogsTailRequest

type MemoryElementsConsolidateRequest = map[string]interface{}

type MemoryElementsCreateRequest = map[string]interface{}

type MemoryElementsDefinitionsCreateRequest = map[string]interface{}

type MemoryElementsDefinitionsGetRequest = map[string]interface{}

type MemoryElementsDefinitionsListRequest = map[string]interface{}

type MemoryElementsEntitiesLinkRequest = map[string]interface{}

type MemoryElementsEntitiesListRequest = map[string]interface{}

type MemoryElementsGetRequest = map[string]interface{}

type MemoryElementsLinksCreateRequest = map[string]interface{}

type MemoryElementsLinksListRequest = map[string]interface{}

type MemoryElementsLinksTraverseRequest = map[string]interface{}

type MemoryElementsListRequest = map[string]interface{}

type MemoryElementsResolveHeadRequest = map[string]interface{}

type MemoryElementsSearchRequest = map[string]interface{}

type MemoryElementsUpdateRequest = map[string]interface{}

type MemoryEntitiesConfirmRequest = map[string]interface{}

type MemoryEntitiesCreateRequest = map[string]interface{}

type MemoryEntitiesProposeMergeRequest = map[string]interface{}

type MemoryRecallRequest = map[string]interface{}

type MemoryReviewEntityGetRequest = map[string]interface{}

type MemoryReviewEpisodeGetRequest = map[string]interface{}

type MemoryReviewEpisodeOutputsGetRequest = map[string]interface{}

type MemoryReviewFactGetRequest = map[string]interface{}

type MemoryReviewObservationGetRequest = map[string]interface{}

type MemoryReviewQualityItemsListRequest = map[string]interface{}

type MemoryReviewQualitySummaryRequest = map[string]interface{}

type MemoryReviewRunEpisodesListRequest = map[string]interface{}

type MemoryReviewRunGetRequest = map[string]interface{}

type MemoryReviewRunsListRequest = map[string]interface{}

type MemoryReviewSearchRequest = map[string]interface{}

type MemorySetsCreateRequest = map[string]interface{}

type MemorySetsGetRequest = map[string]interface{}

type MemorySetsListRequest = map[string]interface{}

type MemorySetsMembersAddRequest = map[string]interface{}

type MemorySetsMembersListRequest = map[string]interface{}

type ModelsCatalogGetRequest = map[string]interface{}

type ModelsCatalogListRequest = map[string]interface{}

type ModelsConfigsCreateRequest = map[string]interface{}

type ModelsConfigsDeleteRequest = map[string]interface{}

type ModelsConfigsGetRequest = map[string]interface{}

type ModelsConfigsListRequest = map[string]interface{}

type ModelsConfigsUpdateRequest = map[string]interface{}

type ModelsConnectionsCreateRequest = map[string]interface{}

type ModelsConnectionsDisconnectRequest = map[string]interface{}

type ModelsConnectionsGetRequest = map[string]interface{}

type ModelsConnectionsListRequest = map[string]interface{}

type ModelsConnectionsStatusRequest = map[string]interface{}

type ModelsConnectionsTestRequest = map[string]interface{}

type ModelsConnectionsUpdateRequest = map[string]interface{}

type ModelsDefaultsGetRequest = map[string]interface{}

type ModelsDefaultsPutRequest = map[string]interface{}

type ModelsGetRequest = generated.AppsInstallAliasApiAppsInstallRequest

type ModelsListRequest = map[string]interface{}

type ModelsProvidersDeleteRequest = map[string]interface{}

type ModelsProvidersGetRequest = map[string]interface{}

type ModelsProvidersListRequest = map[string]interface{}

type ModelsProvidersPutRequest = map[string]interface{}

type ModelsProvidersTestRequest = map[string]interface{}

type OperatorPackagesGetRequest = map[string]interface{}

type OperatorPackagesHealthRequest = map[string]interface{}

type OperatorPackagesInstallRequest = map[string]interface{}

type OperatorPackagesUninstallRequest = map[string]interface{}

type OperatorPackagesUpgradeRequest = map[string]interface{}

type OrientationContractsRequest = map[string]interface{}

type OrientationInventoryRequest = map[string]interface{}

type OrientationSchemasRequest = map[string]interface{}

type OrientationSummaryRequest = map[string]interface{}

type OrientationTaxonomyRequest = map[string]interface{}

type ProductControlPlaneCallRequest = generated.ProductControlPlaneCallRequest

type RecordIngestRequest = generated.RecordIngestRequest

type RecordsGetRequest = generated.AppsInstallAliasApiAppsInstallRequest

type RecordsListRequest = generated.RecordsListRequest

type RecordsSearchRequest = generated.RecordsSearchRequest

type RolesCreateRequest = map[string]interface{}

type RolesDeleteRequest = map[string]interface{}

type RolesGetRequest = map[string]interface{}

type RolesListRequest = map[string]interface{}

type RolesUpdateRequest = map[string]interface{}

type RuntimeHealthRequest = generated.RuntimeHealthRequest

type SandboxesCreateRequest = generated.SandboxesCreateRequest

type SandboxesDestroyRequest = generated.AppsInstallAliasApiAppsInstallRequest

type SandboxesExecRequest = generated.SandboxesExecRequest

type SandboxesForkRequest = generated.SandboxesForkRequest

type SandboxesGetRequest = generated.AppsInstallAliasApiAppsInstallRequest

type SandboxesListRequest = generated.SandboxesListRequest

type SandboxesResumeRequest = generated.AppsInstallAliasApiAppsInstallRequest

type SandboxesRetainRequest = generated.AppsInstallAliasApiAppsInstallRequest

type SchedulesCreateRequest = generated.SchedulesCreateRequest

type SchedulesDeleteRequest = generated.AppsInstallAliasApiAppsInstallRequest

type SchedulesGetRequest = generated.AppsInstallAliasApiAppsInstallRequest

type SchedulesListRequest = generated.SchedulesListRequest

type SchedulesTriggerRequest = generated.SchedulesTriggerRequest

type SchedulesUpdateRequest = generated.SchedulesUpdateRequest

type SearchRebuildRequest = map[string]interface{}

type SearchStatusRequest = map[string]interface{}

type SkillsListRequest = generated.SkillsListRequest

type SkillsSearchRequest = generated.SkillsSearchRequest

type SkillsUseRequest = generated.SkillsUseRequest

type StatusRequest = map[string]interface{}

type SystemPresenceRequest = map[string]interface{}

type TalkModeRequest = generated.TalkModeRequest

type ToolsCatalogRequest = map[string]interface{}

type ToolsInvokeRequest = map[string]interface{}

type UpdateRunRequest = generated.UpdateRunRequest

type WizardCancelRequest = generated.AgentsSessionsResetRequest

type WizardNextRequest = generated.WizardNextRequest

type WizardStartRequest = generated.WizardStartRequest

type WizardStatusRequest = generated.AgentsSessionsResetRequest

type WorkspacesCreateRequest = generated.WorkspacesCreateRequest

type WorkspacesDeleteRequest = generated.AppsInstallAliasApiAppsInstallRequest

type WorkspacesFilesDeleteRequest = generated.WorkspacesFilesDeleteRequest

type WorkspacesFilesGetRequest = generated.WorkspacesFilesDeleteRequest

type WorkspacesFilesListRequest = generated.AppsInstallAliasApiAppsInstallRequest

type WorkspacesFilesSetRequest = generated.WorkspacesFilesSetRequest

type WorkspacesGetRequest = generated.AppsInstallAliasApiAppsInstallRequest

type WorkspacesListRequest = generated.WorkspacesListRequest

type WorkspacesManifestGetRequest = generated.AppsInstallAliasApiAppsInstallRequest

type WorkspacesManifestUpdateRequest = generated.WorkspacesManifestUpdateRequest

func NewClient(baseURL string, opts ...Option) *Client {
  cfg := generated.NewConfiguration()
  cfg.Servers = generated.ServerConfigurations{{URL: baseURL}}
  options := &clientOptions{}
  for _, opt := range opts {
    opt(options)
  }
  if options.httpClient != nil {
    cfg.HTTPClient = options.httpClient
  }
  if len(options.headers) > 0 {
    cfg.DefaultHeader = options.headers
  }
  raw := generated.NewAPIClient(cfg)
  client := &Client{raw: raw}
  client.Acl = newAclClient(raw)
  client.Adapter = newAdapterClient(raw)
  client.Adapters = newAdaptersClient(raw)
  client.Agents = newAgentsClient(raw)
  client.Apps = newAppsClient(raw)
  client.Auth = newAuthClient(raw)
  client.Browser = newBrowserClient(raw)
  client.Channels = newChannelsClient(raw)
  client.Config = newConfigClient(raw)
  client.Contacts = newContactsClient(raw)
  client.Credentials = newCredentialsClient(raw)
  client.Dags = newDagsClient(raw)
  client.Entities = newEntitiesClient(raw)
  client.Events = newEventsClient(raw)
  client.Groups = newGroupsClient(raw)
  client.Jobs = newJobsClient(raw)
  client.Logs = newLogsClient(raw)
  client.Memory = newMemoryClient(raw)
  client.Models = newModelsClient(raw)
  client.Operator = newOperatorClient(raw)
  client.Orientation = newOrientationClient(raw)
  client.ProductControlPlane = newProductControlPlaneClient(raw)
  client.Record = newRecordClient(raw)
  client.Records = newRecordsClient(raw)
  client.Roles = newRolesClient(raw)
  client.Runtime = newRuntimeClient(raw)
  client.Sandboxes = newSandboxesClient(raw)
  client.Schedules = newSchedulesClient(raw)
  client.Search = newSearchClient(raw)
  client.Skills = newSkillsClient(raw)
  client.Talk = newTalkClient(raw)
  client.Tools = newToolsClient(raw)
  client.Update = newUpdateClient(raw)
  client.Wizard = newWizardClient(raw)
  client.Workspaces = newWorkspacesClient(raw)
  return client
}

func newAclClient(raw *generated.APIClient) *AclClient {
  client := &AclClient{raw: raw}
  client.Approval = newAclApprovalClient(raw)
  client.Audit = newAclAuditClient(raw)
  client.Policies = newAclPoliciesClient(raw)
  client.Requests = newAclRequestsClient(raw)
  return client
}

func newAclApprovalClient(raw *generated.APIClient) *AclApprovalClient {
  client := &AclApprovalClient{raw: raw}
  return client
}

func newAclAuditClient(raw *generated.APIClient) *AclAuditClient {
  client := &AclAuditClient{raw: raw}
  return client
}

func newAclPoliciesClient(raw *generated.APIClient) *AclPoliciesClient {
  client := &AclPoliciesClient{raw: raw}
  return client
}

func newAclRequestsClient(raw *generated.APIClient) *AclRequestsClient {
  client := &AclRequestsClient{raw: raw}
  return client
}

func newAdapterClient(raw *generated.APIClient) *AdapterClient {
  client := &AdapterClient{raw: raw}
  client.Connections = newAdapterConnectionsClient(raw)
  client.Monitor = newAdapterMonitorClient(raw)
  client.Serve = newAdapterServeClient(raw)
  client.Setup = newAdapterSetupClient(raw)
  return client
}

func newAdapterConnectionsClient(raw *generated.APIClient) *AdapterConnectionsClient {
  client := &AdapterConnectionsClient{raw: raw}
  return client
}

func newAdapterMonitorClient(raw *generated.APIClient) *AdapterMonitorClient {
  client := &AdapterMonitorClient{raw: raw}
  return client
}

func newAdapterServeClient(raw *generated.APIClient) *AdapterServeClient {
  client := &AdapterServeClient{raw: raw}
  return client
}

func newAdapterSetupClient(raw *generated.APIClient) *AdapterSetupClient {
  client := &AdapterSetupClient{raw: raw}
  return client
}

func newAdaptersClient(raw *generated.APIClient) *AdaptersClient {
  client := &AdaptersClient{raw: raw}
  client.Connections = newAdaptersConnectionsClient(raw)
  return client
}

func newAdaptersConnectionsClient(raw *generated.APIClient) *AdaptersConnectionsClient {
  client := &AdaptersConnectionsClient{raw: raw}
  client.Credentials = newAdaptersConnectionsCredentialsClient(raw)
  client.Custom = newAdaptersConnectionsCustomClient(raw)
  client.Oauth = newAdaptersConnectionsOauthClient(raw)
  return client
}

func newAdaptersConnectionsCredentialsClient(raw *generated.APIClient) *AdaptersConnectionsCredentialsClient {
  client := &AdaptersConnectionsCredentialsClient{raw: raw}
  return client
}

func newAdaptersConnectionsCustomClient(raw *generated.APIClient) *AdaptersConnectionsCustomClient {
  client := &AdaptersConnectionsCustomClient{raw: raw}
  return client
}

func newAdaptersConnectionsOauthClient(raw *generated.APIClient) *AdaptersConnectionsOauthClient {
  client := &AdaptersConnectionsOauthClient{raw: raw}
  return client
}

func newAgentsClient(raw *generated.APIClient) *AgentsClient {
  client := &AgentsClient{raw: raw}
  client.Conversations = newAgentsConversationsClient(raw)
  client.Files = newAgentsFilesClient(raw)
  client.Identity = newAgentsIdentityClient(raw)
  client.Sessions = newAgentsSessionsClient(raw)
  return client
}

func newAgentsConversationsClient(raw *generated.APIClient) *AgentsConversationsClient {
  client := &AgentsConversationsClient{raw: raw}
  return client
}

func newAgentsFilesClient(raw *generated.APIClient) *AgentsFilesClient {
  client := &AgentsFilesClient{raw: raw}
  return client
}

func newAgentsIdentityClient(raw *generated.APIClient) *AgentsIdentityClient {
  client := &AgentsIdentityClient{raw: raw}
  return client
}

func newAgentsSessionsClient(raw *generated.APIClient) *AgentsSessionsClient {
  client := &AgentsSessionsClient{raw: raw}
  client.Import = newAgentsSessionsImportClient(raw)
  client.Imports = newAgentsSessionsImportsClient(raw)
  return client
}

func newAgentsSessionsImportClient(raw *generated.APIClient) *AgentsSessionsImportClient {
  client := &AgentsSessionsImportClient{raw: raw}
  return client
}

func newAgentsSessionsImportsClient(raw *generated.APIClient) *AgentsSessionsImportsClient {
  client := &AgentsSessionsImportsClient{raw: raw}
  return client
}

func newAppsClient(raw *generated.APIClient) *AppsClient {
  client := &AppsClient{raw: raw}
  return client
}

func newAuthClient(raw *generated.APIClient) *AuthClient {
  client := &AuthClient{raw: raw}
  client.Tokens = newAuthTokensClient(raw)
  client.Users = newAuthUsersClient(raw)
  return client
}

func newAuthTokensClient(raw *generated.APIClient) *AuthTokensClient {
  client := &AuthTokensClient{raw: raw}
  return client
}

func newAuthUsersClient(raw *generated.APIClient) *AuthUsersClient {
  client := &AuthUsersClient{raw: raw}
  return client
}

func newBrowserClient(raw *generated.APIClient) *BrowserClient {
  client := &BrowserClient{raw: raw}
  return client
}

func newChannelsClient(raw *generated.APIClient) *ChannelsClient {
  client := &ChannelsClient{raw: raw}
  client.Participants = newChannelsParticipantsClient(raw)
  return client
}

func newChannelsParticipantsClient(raw *generated.APIClient) *ChannelsParticipantsClient {
  client := &ChannelsParticipantsClient{raw: raw}
  return client
}

func newConfigClient(raw *generated.APIClient) *ConfigClient {
  client := &ConfigClient{raw: raw}
  return client
}

func newContactsClient(raw *generated.APIClient) *ContactsClient {
  client := &ContactsClient{raw: raw}
  return client
}

func newCredentialsClient(raw *generated.APIClient) *CredentialsClient {
  client := &CredentialsClient{raw: raw}
  client.Vault = newCredentialsVaultClient(raw)
  return client
}

func newCredentialsVaultClient(raw *generated.APIClient) *CredentialsVaultClient {
  client := &CredentialsVaultClient{raw: raw}
  return client
}

func newDagsClient(raw *generated.APIClient) *DagsClient {
  client := &DagsClient{raw: raw}
  client.Runs = newDagsRunsClient(raw)
  return client
}

func newDagsRunsClient(raw *generated.APIClient) *DagsRunsClient {
  client := &DagsRunsClient{raw: raw}
  return client
}

func newEntitiesClient(raw *generated.APIClient) *EntitiesClient {
  client := &EntitiesClient{raw: raw}
  client.Merge = newEntitiesMergeClient(raw)
  client.Tags = newEntitiesTagsClient(raw)
  return client
}

func newEntitiesMergeClient(raw *generated.APIClient) *EntitiesMergeClient {
  client := &EntitiesMergeClient{raw: raw}
  return client
}

func newEntitiesTagsClient(raw *generated.APIClient) *EntitiesTagsClient {
  client := &EntitiesTagsClient{raw: raw}
  return client
}

func newEventsClient(raw *generated.APIClient) *EventsClient {
  client := &EventsClient{raw: raw}
  client.Subscriptions = newEventsSubscriptionsClient(raw)
  return client
}

func newEventsSubscriptionsClient(raw *generated.APIClient) *EventsSubscriptionsClient {
  client := &EventsSubscriptionsClient{raw: raw}
  return client
}

func newGroupsClient(raw *generated.APIClient) *GroupsClient {
  client := &GroupsClient{raw: raw}
  client.Members = newGroupsMembersClient(raw)
  return client
}

func newGroupsMembersClient(raw *generated.APIClient) *GroupsMembersClient {
  client := &GroupsMembersClient{raw: raw}
  return client
}

func newJobsClient(raw *generated.APIClient) *JobsClient {
  client := &JobsClient{raw: raw}
  client.Idempotency = newJobsIdempotencyClient(raw)
  client.Lanes = newJobsLanesClient(raw)
  client.Queue = newJobsQueueClient(raw)
  client.Runs = newJobsRunsClient(raw)
  return client
}

func newJobsIdempotencyClient(raw *generated.APIClient) *JobsIdempotencyClient {
  client := &JobsIdempotencyClient{raw: raw}
  return client
}

func newJobsLanesClient(raw *generated.APIClient) *JobsLanesClient {
  client := &JobsLanesClient{raw: raw}
  return client
}

func newJobsQueueClient(raw *generated.APIClient) *JobsQueueClient {
  client := &JobsQueueClient{raw: raw}
  return client
}

func newJobsRunsClient(raw *generated.APIClient) *JobsRunsClient {
  client := &JobsRunsClient{raw: raw}
  return client
}

func newLogsClient(raw *generated.APIClient) *LogsClient {
  client := &LogsClient{raw: raw}
  return client
}

func newMemoryClient(raw *generated.APIClient) *MemoryClient {
  client := &MemoryClient{raw: raw}
  client.Elements = newMemoryElementsClient(raw)
  client.Entities = newMemoryEntitiesClient(raw)
  client.Review = newMemoryReviewClient(raw)
  client.Sets = newMemorySetsClient(raw)
  return client
}

func newMemoryElementsClient(raw *generated.APIClient) *MemoryElementsClient {
  client := &MemoryElementsClient{raw: raw}
  client.Definitions = newMemoryElementsDefinitionsClient(raw)
  client.Entities = newMemoryElementsEntitiesClient(raw)
  client.Links = newMemoryElementsLinksClient(raw)
  return client
}

func newMemoryElementsDefinitionsClient(raw *generated.APIClient) *MemoryElementsDefinitionsClient {
  client := &MemoryElementsDefinitionsClient{raw: raw}
  return client
}

func newMemoryElementsEntitiesClient(raw *generated.APIClient) *MemoryElementsEntitiesClient {
  client := &MemoryElementsEntitiesClient{raw: raw}
  return client
}

func newMemoryElementsLinksClient(raw *generated.APIClient) *MemoryElementsLinksClient {
  client := &MemoryElementsLinksClient{raw: raw}
  return client
}

func newMemoryEntitiesClient(raw *generated.APIClient) *MemoryEntitiesClient {
  client := &MemoryEntitiesClient{raw: raw}
  return client
}

func newMemoryReviewClient(raw *generated.APIClient) *MemoryReviewClient {
  client := &MemoryReviewClient{raw: raw}
  client.Entity = newMemoryReviewEntityClient(raw)
  client.Episode = newMemoryReviewEpisodeClient(raw)
  client.Fact = newMemoryReviewFactClient(raw)
  client.Observation = newMemoryReviewObservationClient(raw)
  client.Quality = newMemoryReviewQualityClient(raw)
  client.Run = newMemoryReviewRunClient(raw)
  client.Runs = newMemoryReviewRunsClient(raw)
  return client
}

func newMemoryReviewEntityClient(raw *generated.APIClient) *MemoryReviewEntityClient {
  client := &MemoryReviewEntityClient{raw: raw}
  return client
}

func newMemoryReviewEpisodeClient(raw *generated.APIClient) *MemoryReviewEpisodeClient {
  client := &MemoryReviewEpisodeClient{raw: raw}
  client.Outputs = newMemoryReviewEpisodeOutputsClient(raw)
  return client
}

func newMemoryReviewEpisodeOutputsClient(raw *generated.APIClient) *MemoryReviewEpisodeOutputsClient {
  client := &MemoryReviewEpisodeOutputsClient{raw: raw}
  return client
}

func newMemoryReviewFactClient(raw *generated.APIClient) *MemoryReviewFactClient {
  client := &MemoryReviewFactClient{raw: raw}
  return client
}

func newMemoryReviewObservationClient(raw *generated.APIClient) *MemoryReviewObservationClient {
  client := &MemoryReviewObservationClient{raw: raw}
  return client
}

func newMemoryReviewQualityClient(raw *generated.APIClient) *MemoryReviewQualityClient {
  client := &MemoryReviewQualityClient{raw: raw}
  client.Items = newMemoryReviewQualityItemsClient(raw)
  return client
}

func newMemoryReviewQualityItemsClient(raw *generated.APIClient) *MemoryReviewQualityItemsClient {
  client := &MemoryReviewQualityItemsClient{raw: raw}
  return client
}

func newMemoryReviewRunClient(raw *generated.APIClient) *MemoryReviewRunClient {
  client := &MemoryReviewRunClient{raw: raw}
  client.Episodes = newMemoryReviewRunEpisodesClient(raw)
  return client
}

func newMemoryReviewRunEpisodesClient(raw *generated.APIClient) *MemoryReviewRunEpisodesClient {
  client := &MemoryReviewRunEpisodesClient{raw: raw}
  return client
}

func newMemoryReviewRunsClient(raw *generated.APIClient) *MemoryReviewRunsClient {
  client := &MemoryReviewRunsClient{raw: raw}
  return client
}

func newMemorySetsClient(raw *generated.APIClient) *MemorySetsClient {
  client := &MemorySetsClient{raw: raw}
  client.Members = newMemorySetsMembersClient(raw)
  return client
}

func newMemorySetsMembersClient(raw *generated.APIClient) *MemorySetsMembersClient {
  client := &MemorySetsMembersClient{raw: raw}
  return client
}

func newModelsClient(raw *generated.APIClient) *ModelsClient {
  client := &ModelsClient{raw: raw}
  client.Catalog = newModelsCatalogClient(raw)
  client.Configs = newModelsConfigsClient(raw)
  client.Connections = newModelsConnectionsClient(raw)
  client.Defaults = newModelsDefaultsClient(raw)
  client.Providers = newModelsProvidersClient(raw)
  return client
}

func newModelsCatalogClient(raw *generated.APIClient) *ModelsCatalogClient {
  client := &ModelsCatalogClient{raw: raw}
  return client
}

func newModelsConfigsClient(raw *generated.APIClient) *ModelsConfigsClient {
  client := &ModelsConfigsClient{raw: raw}
  return client
}

func newModelsConnectionsClient(raw *generated.APIClient) *ModelsConnectionsClient {
  client := &ModelsConnectionsClient{raw: raw}
  return client
}

func newModelsDefaultsClient(raw *generated.APIClient) *ModelsDefaultsClient {
  client := &ModelsDefaultsClient{raw: raw}
  return client
}

func newModelsProvidersClient(raw *generated.APIClient) *ModelsProvidersClient {
  client := &ModelsProvidersClient{raw: raw}
  return client
}

func newOperatorClient(raw *generated.APIClient) *OperatorClient {
  client := &OperatorClient{raw: raw}
  client.Packages = newOperatorPackagesClient(raw)
  return client
}

func newOperatorPackagesClient(raw *generated.APIClient) *OperatorPackagesClient {
  client := &OperatorPackagesClient{raw: raw}
  return client
}

func newOrientationClient(raw *generated.APIClient) *OrientationClient {
  client := &OrientationClient{raw: raw}
  return client
}

func newProductControlPlaneClient(raw *generated.APIClient) *ProductControlPlaneClient {
  client := &ProductControlPlaneClient{raw: raw}
  return client
}

func newRecordClient(raw *generated.APIClient) *RecordClient {
  client := &RecordClient{raw: raw}
  return client
}

func newRecordsClient(raw *generated.APIClient) *RecordsClient {
  client := &RecordsClient{raw: raw}
  return client
}

func newRolesClient(raw *generated.APIClient) *RolesClient {
  client := &RolesClient{raw: raw}
  return client
}

func newRuntimeClient(raw *generated.APIClient) *RuntimeClient {
  client := &RuntimeClient{raw: raw}
  return client
}

func newSandboxesClient(raw *generated.APIClient) *SandboxesClient {
  client := &SandboxesClient{raw: raw}
  return client
}

func newSchedulesClient(raw *generated.APIClient) *SchedulesClient {
  client := &SchedulesClient{raw: raw}
  return client
}

func newSearchClient(raw *generated.APIClient) *SearchClient {
  client := &SearchClient{raw: raw}
  return client
}

func newSkillsClient(raw *generated.APIClient) *SkillsClient {
  client := &SkillsClient{raw: raw}
  return client
}

func newTalkClient(raw *generated.APIClient) *TalkClient {
  client := &TalkClient{raw: raw}
  return client
}

func newToolsClient(raw *generated.APIClient) *ToolsClient {
  client := &ToolsClient{raw: raw}
  return client
}

func newUpdateClient(raw *generated.APIClient) *UpdateClient {
  client := &UpdateClient{raw: raw}
  return client
}

func newWizardClient(raw *generated.APIClient) *WizardClient {
  client := &WizardClient{raw: raw}
  return client
}

func newWorkspacesClient(raw *generated.APIClient) *WorkspacesClient {
  client := &WorkspacesClient{raw: raw}
  client.Files = newWorkspacesFilesClient(raw)
  client.Manifest = newWorkspacesManifestClient(raw)
  return client
}

func newWorkspacesFilesClient(raw *generated.APIClient) *WorkspacesFilesClient {
  client := &WorkspacesFilesClient{raw: raw}
  return client
}

func newWorkspacesManifestClient(raw *generated.APIClient) *WorkspacesManifestClient {
  client := &WorkspacesManifestClient{raw: raw}
  return client
}

func (client *Client) Status(ctx context.Context, request StatusRequest) (*StatusResponse, error) {
  builder := client.raw.RuntimeAPI.Status(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (client *Client) SystemPresence(ctx context.Context, request SystemPresenceRequest) (*SystemPresenceResponse, error) {
  builder := client.raw.RuntimeAPI.SystemPresence(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AclClient) Evaluate(ctx context.Context, request AclEvaluateRequest) (*AclEvaluateResponse, error) {
  builder := a.raw.ACLAPI.AclEvaluate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AclApprovalClient) Request(ctx context.Context, request AclApprovalRequestRequest) (*AclApprovalRequestResponse, error) {
  builder := a.raw.ACLAPI.AclApprovalRequest(ctx)
  builder = builder.AclApprovalRequestRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AclAuditClient) Get(ctx context.Context, request AclAuditGetRequest) (*AclAuditGetResponse, error) {
  builder := a.raw.ACLAPI.AclAuditGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AclAuditClient) List(ctx context.Context, request AclAuditListRequest) (*AclAuditListResponse, error) {
  builder := a.raw.ACLAPI.AclAuditList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AclAuditClient) Stats(ctx context.Context, request AclAuditStatsRequest) (*AclAuditStatsResponse, error) {
  builder := a.raw.ACLAPI.AclAuditStats(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AclPoliciesClient) Create(ctx context.Context, request AclPoliciesCreateRequest) (*AclPoliciesCreateResponse, error) {
  builder := a.raw.ACLAPI.AclPoliciesCreate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AclPoliciesClient) Delete(ctx context.Context, request AclPoliciesDeleteRequest) (*AclPoliciesDeleteResponse, error) {
  builder := a.raw.ACLAPI.AclPoliciesDelete(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AclPoliciesClient) Disable(ctx context.Context, request AclPoliciesDisableRequest) (*AclPoliciesDisableResponse, error) {
  builder := a.raw.ACLAPI.AclPoliciesDisable(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AclPoliciesClient) Enable(ctx context.Context, request AclPoliciesEnableRequest) (*AclPoliciesEnableResponse, error) {
  builder := a.raw.ACLAPI.AclPoliciesEnable(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AclPoliciesClient) Get(ctx context.Context, request AclPoliciesGetRequest) (*AclPoliciesGetResponse, error) {
  builder := a.raw.ACLAPI.AclPoliciesGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AclPoliciesClient) List(ctx context.Context, request AclPoliciesListRequest) (*AclPoliciesListResponse, error) {
  builder := a.raw.ACLAPI.AclPoliciesList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AclPoliciesClient) Update(ctx context.Context, request AclPoliciesUpdateRequest) (*AclPoliciesUpdateResponse, error) {
  builder := a.raw.ACLAPI.AclPoliciesUpdate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AclRequestsClient) Approve(ctx context.Context, request AclRequestsApproveRequest) (*AclRequestsApproveResponse, error) {
  builder := a.raw.ACLAPI.AclRequestsApprove(ctx)
  builder = builder.AclRequestsApproveRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AclRequestsClient) Deny(ctx context.Context, request AclRequestsDenyRequest) (*AclRequestsDenyResponse, error) {
  builder := a.raw.ACLAPI.AclRequestsDeny(ctx)
  builder = builder.AclRequestsDenyRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AclRequestsClient) List(ctx context.Context, request AclRequestsListRequest) (*AclRequestsListResponse, error) {
  builder := a.raw.ACLAPI.AclRequestsList(ctx)
  builder = builder.AclRequestsListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AclRequestsClient) Show(ctx context.Context, request AclRequestsShowRequest) (*AclRequestsShowResponse, error) {
  builder := a.raw.ACLAPI.AclRequestsShow(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdapterClient) Health(ctx context.Context, request AdapterHealthRequest) (*AdapterHealthResponse, error) {
  builder := a.raw.AdaptersAPI.AdapterHealth(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdapterClient) Info(ctx context.Context, request AdapterInfoRequest) (*AdapterInfoResponse, error) {
  builder := a.raw.AdaptersAPI.AdapterInfo(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdapterConnectionsClient) List(ctx context.Context, request AdapterConnectionsListRequest) (*AdapterConnectionsListResponse, error) {
  builder := a.raw.AdaptersAPI.AdapterConnectionsList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdapterMonitorClient) Start(ctx context.Context, request AdapterMonitorStartRequest) (*AdapterMonitorStartResponse, error) {
  builder := a.raw.AdaptersAPI.AdapterMonitorStart(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdapterMonitorClient) Stop(ctx context.Context, request AdapterMonitorStopRequest) (*AdapterMonitorStopResponse, error) {
  builder := a.raw.AdaptersAPI.AdapterMonitorStop(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdapterServeClient) Start(ctx context.Context, request AdapterServeStartRequest) (*AdapterServeStartResponse, error) {
  builder := a.raw.AdaptersAPI.AdapterServeStart(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdapterSetupClient) Cancel(ctx context.Context, request AdapterSetupCancelRequest) (*AdapterSetupCancelResponse, error) {
  builder := a.raw.AdaptersAPI.AdapterSetupCancel(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdapterSetupClient) Start(ctx context.Context, request AdapterSetupStartRequest) (*AdapterSetupStartResponse, error) {
  builder := a.raw.AdaptersAPI.AdapterSetupStart(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdapterSetupClient) Status(ctx context.Context, request AdapterSetupStatusRequest) (*AdapterSetupStatusResponse, error) {
  builder := a.raw.AdaptersAPI.AdapterSetupStatus(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdapterSetupClient) Submit(ctx context.Context, request AdapterSetupSubmitRequest) (*AdapterSetupSubmitResponse, error) {
  builder := a.raw.AdaptersAPI.AdapterSetupSubmit(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdaptersClient) Methods(ctx context.Context, request AdaptersMethodsRequest) (*AdaptersMethodsResponse, error) {
  builder := a.raw.AdaptersAPI.AdaptersMethods(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdaptersConnectionsClient) Backfill(ctx context.Context, request AdaptersConnectionsBackfillRequest) (*AdaptersConnectionsBackfillResponse, error) {
  builder := a.raw.AdaptersAPI.AdaptersConnectionsBackfill(ctx)
  builder = builder.AdaptersConnectionsBackfillRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdaptersConnectionsClient) Create(ctx context.Context, request AdaptersConnectionsCreateRequest) (*AdaptersConnectionsCreateResponse, error) {
  builder := a.raw.AdaptersAPI.AdaptersConnectionsCreate(ctx)
  builder = builder.AdaptersConnectionsCreateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdaptersConnectionsClient) Disconnect(ctx context.Context, request AdaptersConnectionsDisconnectRequest) (*AdaptersConnectionsDisconnectResponse, error) {
  builder := a.raw.AdaptersAPI.AdaptersConnectionsDisconnect(ctx)
  builder = builder.AdaptersConnectionsDisconnectRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdaptersConnectionsClient) Get(ctx context.Context, request AdaptersConnectionsGetRequest) (*AdaptersConnectionsGetResponse, error) {
  builder := a.raw.AdaptersAPI.AdaptersConnectionsGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdaptersConnectionsClient) List(ctx context.Context, request AdaptersConnectionsListRequest) (*AdaptersConnectionsListResponse, error) {
  builder := a.raw.AdaptersAPI.AdaptersConnectionsList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdaptersConnectionsClient) Status(ctx context.Context, request AdaptersConnectionsStatusRequest) (*AdaptersConnectionsStatusResponse, error) {
  builder := a.raw.AdaptersAPI.AdaptersConnectionsStatus(ctx)
  builder = builder.AdaptersConnectionsDisconnectRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdaptersConnectionsClient) Test(ctx context.Context, request AdaptersConnectionsTestRequest) (*AdaptersConnectionsTestResponse, error) {
  builder := a.raw.AdaptersAPI.AdaptersConnectionsTest(ctx)
  builder = builder.AdaptersConnectionsDisconnectRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdaptersConnectionsClient) Update(ctx context.Context, request AdaptersConnectionsUpdateRequest) (*AdaptersConnectionsUpdateResponse, error) {
  builder := a.raw.AdaptersAPI.AdaptersConnectionsUpdate(ctx)
  builder = builder.AdaptersConnectionsUpdateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdaptersConnectionsClient) Upload(ctx context.Context, request AdaptersConnectionsUploadRequest) (*AdaptersConnectionsUploadResponse, error) {
  builder := a.raw.AdaptersAPI.AdaptersConnectionsUpload(ctx)
  builder = builder.AdaptersConnectionsUploadRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdaptersConnectionsCredentialsClient) Get(ctx context.Context, request AdaptersConnectionsCredentialsGetRequest) (*AdaptersConnectionsCredentialsGetResponse, error) {
  builder := a.raw.AdaptersAPI.AdaptersConnectionsCredentialsGet(ctx)
  builder = builder.AdaptersConnectionsCredentialsGetRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdaptersConnectionsCustomClient) Cancel(ctx context.Context, request AdaptersConnectionsCustomCancelRequest) (*AdaptersConnectionsCustomCancelResponse, error) {
  builder := a.raw.AdaptersAPI.AdaptersConnectionsCustomCancel(ctx)
  builder = builder.AdaptersConnectionsCustomCancelRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdaptersConnectionsCustomClient) Start(ctx context.Context, request AdaptersConnectionsCustomStartRequest) (*AdaptersConnectionsCustomStartResponse, error) {
  builder := a.raw.AdaptersAPI.AdaptersConnectionsCustomStart(ctx)
  builder = builder.AdaptersConnectionsCustomStartRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdaptersConnectionsCustomClient) Status(ctx context.Context, request AdaptersConnectionsCustomStatusRequest) (*AdaptersConnectionsCustomStatusResponse, error) {
  builder := a.raw.AdaptersAPI.AdaptersConnectionsCustomStatus(ctx)
  builder = builder.AdaptersConnectionsCustomCancelRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdaptersConnectionsCustomClient) Submit(ctx context.Context, request AdaptersConnectionsCustomSubmitRequest) (*AdaptersConnectionsCustomSubmitResponse, error) {
  builder := a.raw.AdaptersAPI.AdaptersConnectionsCustomSubmit(ctx)
  builder = builder.AdaptersConnectionsCustomSubmitRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdaptersConnectionsOauthClient) Complete(ctx context.Context, request AdaptersConnectionsOauthCompleteRequest) (*AdaptersConnectionsOauthCompleteResponse, error) {
  builder := a.raw.AdaptersAPI.AdaptersConnectionsOauthComplete(ctx)
  builder = builder.AdaptersConnectionsOauthCompleteRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AdaptersConnectionsOauthClient) Start(ctx context.Context, request AdaptersConnectionsOauthStartRequest) (*AdaptersConnectionsOauthStartResponse, error) {
  builder := a.raw.AdaptersAPI.AdaptersConnectionsOauthStart(ctx)
  builder = builder.AdaptersConnectionsOauthStartRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsClient) Create(ctx context.Context, request AgentsCreateRequest) (*AgentsCreateResponse, error) {
  builder := a.raw.AgentsAPI.AgentsCreate(ctx)
  builder = builder.AgentsCreateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsClient) Delete(ctx context.Context, request AgentsDeleteRequest) (*AgentsDeleteResponse, error) {
  builder := a.raw.AgentsAPI.AgentsDelete(ctx)
  builder = builder.AgentsDeleteRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsClient) List(ctx context.Context, request AgentsListRequest) (*AgentsListResponse, error) {
  builder := a.raw.AgentsAPI.AgentsList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsClient) Update(ctx context.Context, request AgentsUpdateRequest) (*AgentsUpdateResponse, error) {
  builder := a.raw.AgentsAPI.AgentsUpdate(ctx)
  builder = builder.AgentsUpdateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsClient) Wait(ctx context.Context, request AgentsWaitRequest) (*AgentsWaitResponse, error) {
  builder := a.raw.AgentsAPI.AgentsWait(ctx)
  builder = builder.AgentsWaitRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsConversationsClient) Abort(ctx context.Context, request AgentsConversationsAbortRequest) (*AgentsConversationsAbortResponse, error) {
  builder := a.raw.AgentsAPI.AgentsConversationsAbort(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsConversationsClient) Get(ctx context.Context, request AgentsConversationsGetRequest) (*AgentsConversationsGetResponse, error) {
  builder := a.raw.AgentsAPI.AgentsConversationsGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsConversationsClient) History(ctx context.Context, request AgentsConversationsHistoryRequest) (*AgentsConversationsHistoryResponse, error) {
  builder := a.raw.AgentsAPI.AgentsConversationsHistory(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsConversationsClient) List(ctx context.Context, request AgentsConversationsListRequest) (*AgentsConversationsListResponse, error) {
  builder := a.raw.AgentsAPI.AgentsConversationsList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsConversationsClient) Search(ctx context.Context, request AgentsConversationsSearchRequest) (*AgentsConversationsSearchResponse, error) {
  builder := a.raw.AgentsAPI.AgentsConversationsSearch(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsConversationsClient) Send(ctx context.Context, request AgentsConversationsSendRequest) (*AgentsConversationsSendResponse, error) {
  builder := a.raw.AgentsAPI.AgentsConversationsSend(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsFilesClient) Get(ctx context.Context, request AgentsFilesGetRequest) (*AgentsFilesGetResponse, error) {
  builder := a.raw.AgentsAPI.AgentsFilesGet(ctx)
  builder = builder.AgentsFilesGetRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsFilesClient) List(ctx context.Context, request AgentsFilesListRequest) (*AgentsFilesListResponse, error) {
  builder := a.raw.AgentsAPI.AgentsFilesList(ctx)
  builder = builder.AgentsFilesListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsFilesClient) Set(ctx context.Context, request AgentsFilesSetRequest) (*AgentsFilesSetResponse, error) {
  builder := a.raw.AgentsAPI.AgentsFilesSet(ctx)
  builder = builder.AgentsFilesSetRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsIdentityClient) Get(ctx context.Context, request AgentsIdentityGetRequest) (*AgentsIdentityGetResponse, error) {
  builder := a.raw.AgentsAPI.AgentsIdentityGet(ctx)
  builder = builder.AgentsIdentityGetRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsSessionsClient) Archive(ctx context.Context, request AgentsSessionsArchiveRequest) (*AgentsSessionsArchiveResponse, error) {
  builder := a.raw.AgentsAPI.AgentsSessionsArchive(ctx)
  builder = builder.AgentsSessionsArchiveRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsSessionsClient) Compact(ctx context.Context, request AgentsSessionsCompactRequest) (*AgentsSessionsCompactResponse, error) {
  builder := a.raw.AgentsAPI.AgentsSessionsCompact(ctx)
  builder = builder.AgentsSessionsCompactRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsSessionsClient) Create(ctx context.Context, request AgentsSessionsCreateRequest) (*AgentsSessionsCreateResponse, error) {
  builder := a.raw.AgentsAPI.AgentsSessionsCreate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsSessionsClient) Fork(ctx context.Context, request AgentsSessionsForkRequest) (*AgentsSessionsForkResponse, error) {
  builder := a.raw.AgentsAPI.AgentsSessionsFork(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsSessionsClient) Get(ctx context.Context, request AgentsSessionsGetRequest) (*AgentsSessionsGetResponse, error) {
  builder := a.raw.AgentsAPI.AgentsSessionsGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsSessionsClient) History(ctx context.Context, request AgentsSessionsHistoryRequest) (*AgentsSessionsHistoryResponse, error) {
  builder := a.raw.AgentsAPI.AgentsSessionsHistory(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsSessionsClient) List(ctx context.Context, request AgentsSessionsListRequest) (*AgentsSessionsListResponse, error) {
  builder := a.raw.AgentsAPI.AgentsSessionsList(ctx)
  builder = builder.AgentsSessionsListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsSessionsClient) Patch(ctx context.Context, request AgentsSessionsPatchRequest) (*AgentsSessionsPatchResponse, error) {
  builder := a.raw.AgentsAPI.AgentsSessionsPatch(ctx)
  builder = builder.AgentsSessionsPatchRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsSessionsClient) Preview(ctx context.Context, request AgentsSessionsPreviewRequest) (*AgentsSessionsPreviewResponse, error) {
  builder := a.raw.AgentsAPI.AgentsSessionsPreview(ctx)
  builder = builder.AgentsSessionsPreviewRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsSessionsClient) Reset(ctx context.Context, request AgentsSessionsResetRequest) (*AgentsSessionsResetResponse, error) {
  builder := a.raw.AgentsAPI.AgentsSessionsReset(ctx)
  builder = builder.AgentsSessionsResetRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsSessionsClient) Resolve(ctx context.Context, request AgentsSessionsResolveRequest) (*AgentsSessionsResolveResponse, error) {
  builder := a.raw.AgentsAPI.AgentsSessionsResolve(ctx)
  builder = builder.AgentsSessionsResolveRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsSessionsClient) Send(ctx context.Context, request AgentsSessionsSendRequest) (*AgentsSessionsSendResponse, error) {
  builder := a.raw.AgentsAPI.AgentsSessionsSend(ctx)
  builder = builder.AgentsSessionsSendRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsSessionsClient) Transfer(ctx context.Context, request AgentsSessionsTransferRequest) (*AgentsSessionsTransferResponse, error) {
  builder := a.raw.AgentsAPI.AgentsSessionsTransfer(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsSessionsImportClient) Chunk(ctx context.Context, request AgentsSessionsImportChunkRequest) (*AgentsSessionsImportChunkResponse, error) {
  builder := a.raw.AgentsAPI.AgentsSessionsImportChunk(ctx)
  builder = builder.AgentsSessionsImportChunkRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsSessionsImportClient) Execute(ctx context.Context, request AgentsSessionsImportExecuteRequest) (*AgentsSessionsImportExecuteResponse, error) {
  builder := a.raw.AgentsAPI.AgentsSessionsImportExecute(ctx)
  builder = builder.AgentsSessionsImportExecuteRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AgentsSessionsImportsClient) List(ctx context.Context, request AgentsSessionsImportsListRequest) (*AgentsSessionsImportsListResponse, error) {
  builder := a.raw.AgentsAPI.AgentsSessionsImportsList(ctx)
  builder = builder.AgentsSessionsImportsListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AppsClient) Get(ctx context.Context, request AppsGetRequest) (*AppsGetResponse, error) {
  builder := a.raw.AppsAPI.AppsGet(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AppsClient) Install(ctx context.Context, request AppsInstallRequest) (*AppsInstallResponse, error) {
  builder := a.raw.AppsAPI.AppsInstall(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AppsClient) List(ctx context.Context, request AppsListRequest) (*AppsListResponse, error) {
  builder := a.raw.AppsAPI.AppsList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AppsClient) Logs(ctx context.Context, request AppsLogsRequest) (*AppsLogsResponse, error) {
  builder := a.raw.AppsAPI.AppsLogs(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AppsClient) Methods(ctx context.Context, request AppsMethodsRequest) (*AppsMethodsResponse, error) {
  builder := a.raw.AppsAPI.AppsMethods(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AppsClient) Start(ctx context.Context, request AppsStartRequest) (*AppsStartResponse, error) {
  builder := a.raw.AppsAPI.AppsStart(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AppsClient) Status(ctx context.Context, request AppsStatusRequest) (*AppsStatusResponse, error) {
  builder := a.raw.AppsAPI.AppsStatus(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AppsClient) Stop(ctx context.Context, request AppsStopRequest) (*AppsStopResponse, error) {
  builder := a.raw.AppsAPI.AppsStop(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AppsClient) Uninstall(ctx context.Context, request AppsUninstallRequest) (*AppsUninstallResponse, error) {
  builder := a.raw.AppsAPI.AppsUninstall(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AuthClient) Login(ctx context.Context, request AuthLoginRequest) (*AuthLoginResponse, error) {
  builder := a.raw.AuthAPI.AuthLogin(ctx)
  builder = builder.AuthLoginAliasApiAuthLoginRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AuthTokensClient) Create(ctx context.Context, request AuthTokensCreateRequest) (*AuthTokensCreateResponse, error) {
  builder := a.raw.AuthAPI.AuthTokensCreate(ctx)
  builder = builder.AuthTokensCreateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AuthTokensClient) List(ctx context.Context, request AuthTokensListRequest) (*AuthTokensListResponse, error) {
  builder := a.raw.AuthAPI.AuthTokensList(ctx)
  builder = builder.AuthTokensListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AuthTokensClient) Revoke(ctx context.Context, request AuthTokensRevokeRequest) (*AuthTokensRevokeResponse, error) {
  builder := a.raw.AuthAPI.AuthTokensRevoke(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AuthTokensClient) Rotate(ctx context.Context, request AuthTokensRotateRequest) (*AuthTokensRotateResponse, error) {
  builder := a.raw.AuthAPI.AuthTokensRotate(ctx)
  builder = builder.AuthTokensRotateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AuthUsersClient) Create(ctx context.Context, request AuthUsersCreateRequest) (*AuthUsersCreateResponse, error) {
  builder := a.raw.AuthAPI.AuthUsersCreate(ctx)
  builder = builder.AuthUsersCreateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AuthUsersClient) List(ctx context.Context, request AuthUsersListRequest) (*AuthUsersListResponse, error) {
  builder := a.raw.AuthAPI.AuthUsersList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (a *AuthUsersClient) SetPassword(ctx context.Context, request AuthUsersSetPasswordRequest) (*AuthUsersSetPasswordResponse, error) {
  builder := a.raw.AuthAPI.AuthUsersSetPassword(ctx)
  builder = builder.AuthUsersSetPasswordRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (b *BrowserClient) Request(ctx context.Context, request BrowserRequestRequest) (*BrowserRequestResponse, error) {
  builder := b.raw.RuntimeAPI.BrowserRequest(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ChannelsClient) Create(ctx context.Context, request ChannelsCreateRequest) (*ChannelsCreateResponse, error) {
  builder := c.raw.ChannelsAPI.ChannelsCreate(ctx)
  builder = builder.ChannelsCreateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ChannelsClient) Get(ctx context.Context, request ChannelsGetRequest) (*ChannelsGetResponse, error) {
  builder := c.raw.ChannelsAPI.ChannelsGet(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ChannelsClient) History(ctx context.Context, request ChannelsHistoryRequest) (*ChannelsHistoryResponse, error) {
  builder := c.raw.ChannelsAPI.ChannelsHistory(ctx)
  builder = builder.ChannelsHistoryRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ChannelsClient) List(ctx context.Context, request ChannelsListRequest) (*ChannelsListResponse, error) {
  builder := c.raw.ChannelsAPI.ChannelsList(ctx)
  builder = builder.ChannelsListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ChannelsClient) Resolve(ctx context.Context, request ChannelsResolveRequest) (*ChannelsResolveResponse, error) {
  builder := c.raw.ChannelsAPI.ChannelsResolve(ctx)
  builder = builder.ChannelsResolveRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ChannelsClient) Search(ctx context.Context, request ChannelsSearchRequest) (*ChannelsSearchResponse, error) {
  builder := c.raw.ChannelsAPI.ChannelsSearch(ctx)
  builder = builder.ChannelsSearchRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ChannelsClient) Status(ctx context.Context, request ChannelsStatusRequest) (*ChannelsStatusResponse, error) {
  builder := c.raw.ChannelsAPI.ChannelsStatus(ctx)
  builder = builder.ChannelsStatusRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ChannelsClient) Update(ctx context.Context, request ChannelsUpdateRequest) (*ChannelsUpdateResponse, error) {
  builder := c.raw.ChannelsAPI.ChannelsUpdate(ctx)
  builder = builder.ChannelsUpdateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ChannelsParticipantsClient) Get(ctx context.Context, request ChannelsParticipantsGetRequest) (*ChannelsParticipantsGetResponse, error) {
  builder := c.raw.ChannelsAPI.ChannelsParticipantsGet(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ChannelsParticipantsClient) History(ctx context.Context, request ChannelsParticipantsHistoryRequest) (*ChannelsParticipantsHistoryResponse, error) {
  builder := c.raw.ChannelsAPI.ChannelsParticipantsHistory(ctx)
  builder = builder.ChannelsParticipantsHistoryRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ChannelsParticipantsClient) List(ctx context.Context, request ChannelsParticipantsListRequest) (*ChannelsParticipantsListResponse, error) {
  builder := c.raw.ChannelsAPI.ChannelsParticipantsList(ctx)
  builder = builder.ChannelsParticipantsListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ConfigClient) Apply(ctx context.Context, request ConfigApplyRequest) (*ConfigApplyResponse, error) {
  builder := c.raw.ConfigAPI.ConfigApply(ctx)
  builder = builder.ConfigApplyRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ConfigClient) Get(ctx context.Context, request ConfigGetRequest) (*ConfigGetResponse, error) {
  builder := c.raw.ConfigAPI.ConfigGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ConfigClient) Patch(ctx context.Context, request ConfigPatchRequest) (*ConfigPatchResponse, error) {
  builder := c.raw.ConfigAPI.ConfigPatch(ctx)
  builder = builder.ConfigApplyRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ConfigClient) Schema(ctx context.Context, request ConfigSchemaRequest) (*ConfigSchemaResponse, error) {
  builder := c.raw.ConfigAPI.ConfigSchema(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ConfigClient) Set(ctx context.Context, request ConfigSetRequest) (*ConfigSetResponse, error) {
  builder := c.raw.ConfigAPI.ConfigSet(ctx)
  builder = builder.ConfigSetRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ContactsClient) Create(ctx context.Context, request ContactsCreateRequest) (*ContactsCreateResponse, error) {
  builder := c.raw.ContactsAPI.ContactsCreate(ctx)
  builder = builder.ContactsCreateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ContactsClient) Get(ctx context.Context, request ContactsGetRequest) (*ContactsGetResponse, error) {
  builder := c.raw.ContactsAPI.ContactsGet(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ContactsClient) History(ctx context.Context, request ContactsHistoryRequest) (*ContactsHistoryResponse, error) {
  builder := c.raw.ContactsAPI.ContactsHistory(ctx)
  builder = builder.ContactsHistoryRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ContactsClient) Import(ctx context.Context, request ContactsImportRequest) (*ContactsImportResponse, error) {
  builder := c.raw.ContactsAPI.ContactsImport(ctx)
  builder = builder.ContactsImportRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ContactsClient) List(ctx context.Context, request ContactsListRequest) (*ContactsListResponse, error) {
  builder := c.raw.ContactsAPI.ContactsList(ctx)
  builder = builder.ContactsListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ContactsClient) Search(ctx context.Context, request ContactsSearchRequest) (*ContactsSearchResponse, error) {
  builder := c.raw.ContactsAPI.ContactsSearch(ctx)
  builder = builder.ContactsSearchRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *ContactsClient) Update(ctx context.Context, request ContactsUpdateRequest) (*ContactsUpdateResponse, error) {
  builder := c.raw.ContactsAPI.ContactsUpdate(ctx)
  builder = builder.ContactsUpdateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *CredentialsClient) Create(ctx context.Context, request CredentialsCreateRequest) (*CredentialsCreateResponse, error) {
  builder := c.raw.CredentialsAPI.CredentialsCreate(ctx)
  builder = builder.CredentialsCreateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *CredentialsClient) Get(ctx context.Context, request CredentialsGetRequest) (*CredentialsGetResponse, error) {
  builder := c.raw.CredentialsAPI.CredentialsGet(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *CredentialsClient) List(ctx context.Context, request CredentialsListRequest) (*CredentialsListResponse, error) {
  builder := c.raw.CredentialsAPI.CredentialsList(ctx)
  builder = builder.CredentialsListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *CredentialsClient) Resolve(ctx context.Context, request CredentialsResolveRequest) (*CredentialsResolveResponse, error) {
  builder := c.raw.CredentialsAPI.CredentialsResolve(ctx)
  builder = builder.CredentialsResolveRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *CredentialsClient) Revoke(ctx context.Context, request CredentialsRevokeRequest) (*CredentialsRevokeResponse, error) {
  builder := c.raw.CredentialsAPI.CredentialsRevoke(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *CredentialsClient) Update(ctx context.Context, request CredentialsUpdateRequest) (*CredentialsUpdateResponse, error) {
  builder := c.raw.CredentialsAPI.CredentialsUpdate(ctx)
  builder = builder.CredentialsUpdateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *CredentialsVaultClient) Retrieve(ctx context.Context, request CredentialsVaultRetrieveRequest) (*CredentialsVaultRetrieveResponse, error) {
  builder := c.raw.CredentialsAPI.CredentialsVaultRetrieve(ctx)
  builder = builder.CredentialsVaultRetrieveRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (c *CredentialsVaultClient) Store(ctx context.Context, request CredentialsVaultStoreRequest) (*CredentialsVaultStoreResponse, error) {
  builder := c.raw.CredentialsAPI.CredentialsVaultStore(ctx)
  builder = builder.CredentialsVaultStoreRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (d *DagsClient) Create(ctx context.Context, request DagsCreateRequest) (*DagsCreateResponse, error) {
  builder := d.raw.DAGsAPI.DagsCreate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (d *DagsClient) Delete(ctx context.Context, request DagsDeleteRequest) (*DagsDeleteResponse, error) {
  builder := d.raw.DAGsAPI.DagsDelete(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (d *DagsClient) Get(ctx context.Context, request DagsGetRequest) (*DagsGetResponse, error) {
  builder := d.raw.DAGsAPI.DagsGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (d *DagsClient) List(ctx context.Context, request DagsListRequest) (*DagsListResponse, error) {
  builder := d.raw.DAGsAPI.DagsList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (d *DagsClient) Update(ctx context.Context, request DagsUpdateRequest) (*DagsUpdateResponse, error) {
  builder := d.raw.DAGsAPI.DagsUpdate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (d *DagsRunsClient) Cancel(ctx context.Context, request DagsRunsCancelRequest) (*DagsRunsCancelResponse, error) {
  builder := d.raw.DAGsAPI.DagsRunsCancel(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (d *DagsRunsClient) Get(ctx context.Context, request DagsRunsGetRequest) (*DagsRunsGetResponse, error) {
  builder := d.raw.DAGsAPI.DagsRunsGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (d *DagsRunsClient) List(ctx context.Context, request DagsRunsListRequest) (*DagsRunsListResponse, error) {
  builder := d.raw.DAGsAPI.DagsRunsList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (d *DagsRunsClient) Pause(ctx context.Context, request DagsRunsPauseRequest) (*DagsRunsPauseResponse, error) {
  builder := d.raw.DAGsAPI.DagsRunsPause(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (d *DagsRunsClient) Resume(ctx context.Context, request DagsRunsResumeRequest) (*DagsRunsResumeResponse, error) {
  builder := d.raw.DAGsAPI.DagsRunsResume(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (d *DagsRunsClient) Start(ctx context.Context, request DagsRunsStartRequest) (*DagsRunsStartResponse, error) {
  builder := d.raw.DAGsAPI.DagsRunsStart(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EntitiesClient) Create(ctx context.Context, request EntitiesCreateRequest) (*EntitiesCreateResponse, error) {
  builder := e.raw.EntitiesAPI.EntitiesCreate(ctx)
  builder = builder.EntitiesCreateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EntitiesClient) Get(ctx context.Context, request EntitiesGetRequest) (*EntitiesGetResponse, error) {
  builder := e.raw.EntitiesAPI.EntitiesGet(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EntitiesClient) List(ctx context.Context, request EntitiesListRequest) (*EntitiesListResponse, error) {
  builder := e.raw.EntitiesAPI.EntitiesList(ctx)
  builder = builder.EntitiesListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EntitiesClient) Resolve(ctx context.Context, request EntitiesResolveRequest) (*EntitiesResolveResponse, error) {
  builder := e.raw.EntitiesAPI.EntitiesResolve(ctx)
  builder = builder.EntitiesResolveRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EntitiesClient) Update(ctx context.Context, request EntitiesUpdateRequest) (*EntitiesUpdateResponse, error) {
  builder := e.raw.EntitiesAPI.EntitiesUpdate(ctx)
  builder = builder.EntitiesUpdateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EntitiesMergeClient) Apply(ctx context.Context, request EntitiesMergeApplyRequest) (*EntitiesMergeApplyResponse, error) {
  builder := e.raw.EntitiesAPI.EntitiesMergeApply(ctx)
  builder = builder.EntitiesMergeApplyRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EntitiesMergeClient) Candidates(ctx context.Context, request EntitiesMergeCandidatesRequest) (*EntitiesMergeCandidatesResponse, error) {
  builder := e.raw.EntitiesAPI.EntitiesMergeCandidates(ctx)
  builder = builder.EntitiesMergeCandidatesRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EntitiesMergeClient) Propose(ctx context.Context, request EntitiesMergeProposeRequest) (*EntitiesMergeProposeResponse, error) {
  builder := e.raw.EntitiesAPI.EntitiesMergePropose(ctx)
  builder = builder.EntitiesMergeProposeRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EntitiesMergeClient) Resolve(ctx context.Context, request EntitiesMergeResolveRequest) (*EntitiesMergeResolveResponse, error) {
  builder := e.raw.EntitiesAPI.EntitiesMergeResolve(ctx)
  builder = builder.EntitiesMergeResolveRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EntitiesTagsClient) Add(ctx context.Context, request EntitiesTagsAddRequest) (*EntitiesTagsAddResponse, error) {
  builder := e.raw.EntitiesAPI.EntitiesTagsAdd(ctx)
  builder = builder.EntitiesTagsAddRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EntitiesTagsClient) List(ctx context.Context, request EntitiesTagsListRequest) (*EntitiesTagsListResponse, error) {
  builder := e.raw.EntitiesAPI.EntitiesTagsList(ctx)
  builder = builder.EntitiesResolveRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EntitiesTagsClient) Remove(ctx context.Context, request EntitiesTagsRemoveRequest) (*EntitiesTagsRemoveResponse, error) {
  builder := e.raw.EntitiesAPI.EntitiesTagsRemove(ctx)
  builder = builder.EntitiesTagsAddRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EventsClient) Publish(ctx context.Context, request EventsPublishRequest) (*EventsPublishResponse, error) {
  builder := e.raw.EventsAPI.EventsPublish(ctx)
  builder = builder.EventsPublishRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EventsClient) Subscribe(ctx context.Context, request EventsSubscribeRequest) (*EventsSubscribeResponse, error) {
  builder := e.raw.EventsAPI.EventsSubscribe(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EventsClient) Unsubscribe(ctx context.Context, request EventsUnsubscribeRequest) (*EventsUnsubscribeResponse, error) {
  builder := e.raw.EventsAPI.EventsUnsubscribe(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EventsSubscriptionsClient) Create(ctx context.Context, request EventsSubscriptionsCreateRequest) (*EventsSubscriptionsCreateResponse, error) {
  builder := e.raw.EventsAPI.EventsSubscriptionsCreate(ctx)
  builder = builder.EventsSubscriptionsCreateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EventsSubscriptionsClient) Delete(ctx context.Context, request EventsSubscriptionsDeleteRequest) (*EventsSubscriptionsDeleteResponse, error) {
  builder := e.raw.EventsAPI.EventsSubscriptionsDelete(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EventsSubscriptionsClient) Get(ctx context.Context, request EventsSubscriptionsGetRequest) (*EventsSubscriptionsGetResponse, error) {
  builder := e.raw.EventsAPI.EventsSubscriptionsGet(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EventsSubscriptionsClient) List(ctx context.Context, request EventsSubscriptionsListRequest) (*EventsSubscriptionsListResponse, error) {
  builder := e.raw.EventsAPI.EventsSubscriptionsList(ctx)
  builder = builder.EventsSubscriptionsListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (e *EventsSubscriptionsClient) Update(ctx context.Context, request EventsSubscriptionsUpdateRequest) (*EventsSubscriptionsUpdateResponse, error) {
  builder := e.raw.EventsAPI.EventsSubscriptionsUpdate(ctx)
  builder = builder.EventsSubscriptionsUpdateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (g *GroupsClient) Create(ctx context.Context, request GroupsCreateRequest) (*GroupsCreateResponse, error) {
  builder := g.raw.GroupsAPI.GroupsCreate(ctx)
  builder = builder.GroupsCreateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (g *GroupsClient) Delete(ctx context.Context, request GroupsDeleteRequest) (*GroupsDeleteResponse, error) {
  builder := g.raw.GroupsAPI.GroupsDelete(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (g *GroupsClient) Get(ctx context.Context, request GroupsGetRequest) (*GroupsGetResponse, error) {
  builder := g.raw.GroupsAPI.GroupsGet(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (g *GroupsClient) List(ctx context.Context, request GroupsListRequest) (*GroupsListResponse, error) {
  builder := g.raw.GroupsAPI.GroupsList(ctx)
  builder = builder.EntitiesMergeCandidatesRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (g *GroupsClient) Update(ctx context.Context, request GroupsUpdateRequest) (*GroupsUpdateResponse, error) {
  builder := g.raw.GroupsAPI.GroupsUpdate(ctx)
  builder = builder.GroupsUpdateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (g *GroupsMembersClient) Add(ctx context.Context, request GroupsMembersAddRequest) (*GroupsMembersAddResponse, error) {
  builder := g.raw.GroupsAPI.GroupsMembersAdd(ctx)
  builder = builder.GroupsMembersAddRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (g *GroupsMembersClient) List(ctx context.Context, request GroupsMembersListRequest) (*GroupsMembersListResponse, error) {
  builder := g.raw.GroupsAPI.GroupsMembersList(ctx)
  builder = builder.GroupsMembersListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (g *GroupsMembersClient) Remove(ctx context.Context, request GroupsMembersRemoveRequest) (*GroupsMembersRemoveResponse, error) {
  builder := g.raw.GroupsAPI.GroupsMembersRemove(ctx)
  builder = builder.GroupsMembersRemoveRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (j *JobsClient) Cancel(ctx context.Context, request JobsCancelRequest) (*JobsCancelResponse, error) {
  builder := j.raw.JobsAPI.JobsCancel(ctx)
  builder = builder.JobsCancelRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (j *JobsClient) Create(ctx context.Context, request JobsCreateRequest) (*JobsCreateResponse, error) {
  builder := j.raw.JobsAPI.JobsCreate(ctx)
  builder = builder.JobsCreateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (j *JobsClient) Delete(ctx context.Context, request JobsDeleteRequest) (*JobsDeleteResponse, error) {
  builder := j.raw.JobsAPI.JobsDelete(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (j *JobsClient) Get(ctx context.Context, request JobsGetRequest) (*JobsGetResponse, error) {
  builder := j.raw.JobsAPI.JobsGet(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (j *JobsClient) Invoke(ctx context.Context, request JobsInvokeRequest) (*JobsInvokeResponse, error) {
  builder := j.raw.JobsAPI.JobsInvoke(ctx)
  builder = builder.JobsInvokeRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (j *JobsClient) List(ctx context.Context, request JobsListRequest) (*JobsListResponse, error) {
  builder := j.raw.JobsAPI.JobsList(ctx)
  builder = builder.JobsListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (j *JobsClient) Requeue(ctx context.Context, request JobsRequeueRequest) (*JobsRequeueResponse, error) {
  builder := j.raw.JobsAPI.JobsRequeue(ctx)
  builder = builder.JobsCancelRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (j *JobsClient) Retry(ctx context.Context, request JobsRetryRequest) (*JobsRetryResponse, error) {
  builder := j.raw.JobsAPI.JobsRetry(ctx)
  builder = builder.JobsCancelRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (j *JobsClient) Status(ctx context.Context, request JobsStatusRequest) (*JobsStatusResponse, error) {
  builder := j.raw.JobsAPI.JobsStatus(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (j *JobsClient) Update(ctx context.Context, request JobsUpdateRequest) (*JobsUpdateResponse, error) {
  builder := j.raw.JobsAPI.JobsUpdate(ctx)
  builder = builder.JobsUpdateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (j *JobsIdempotencyClient) List(ctx context.Context, request JobsIdempotencyListRequest) (*JobsIdempotencyListResponse, error) {
  builder := j.raw.JobsAPI.JobsIdempotencyList(ctx)
  builder = builder.JobsIdempotencyListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (j *JobsLanesClient) List(ctx context.Context, request JobsLanesListRequest) (*JobsLanesListResponse, error) {
  builder := j.raw.JobsAPI.JobsLanesList(ctx)
  builder = builder.JobsLanesListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (j *JobsQueueClient) Get(ctx context.Context, request JobsQueueGetRequest) (*JobsQueueGetResponse, error) {
  builder := j.raw.JobsAPI.JobsQueueGet(ctx)
  builder = builder.JobsQueueGetRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (j *JobsQueueClient) List(ctx context.Context, request JobsQueueListRequest) (*JobsQueueListResponse, error) {
  builder := j.raw.JobsAPI.JobsQueueList(ctx)
  builder = builder.JobsQueueListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (j *JobsRunsClient) Get(ctx context.Context, request JobsRunsGetRequest) (*JobsRunsGetResponse, error) {
  builder := j.raw.JobsAPI.JobsRunsGet(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (j *JobsRunsClient) List(ctx context.Context, request JobsRunsListRequest) (*JobsRunsListResponse, error) {
  builder := j.raw.JobsAPI.JobsRunsList(ctx)
  builder = builder.JobsRunsListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (l *LogsClient) Tail(ctx context.Context, request LogsTailRequest) (*LogsTailResponse, error) {
  builder := l.raw.RuntimeAPI.LogsTail(ctx)
  builder = builder.LogsTailRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryClient) Recall(ctx context.Context, request MemoryRecallRequest) (*MemoryRecallResponse, error) {
  builder := m.raw.MemoryAPI.MemoryRecall(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryElementsClient) Consolidate(ctx context.Context, request MemoryElementsConsolidateRequest) (*MemoryElementsConsolidateResponse, error) {
  builder := m.raw.MemoryAPI.MemoryElementsConsolidate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryElementsClient) Create(ctx context.Context, request MemoryElementsCreateRequest) (*MemoryElementsCreateResponse, error) {
  builder := m.raw.MemoryAPI.MemoryElementsCreate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryElementsClient) Get(ctx context.Context, request MemoryElementsGetRequest) (*MemoryElementsGetResponse, error) {
  builder := m.raw.MemoryAPI.MemoryElementsGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryElementsClient) List(ctx context.Context, request MemoryElementsListRequest) (*MemoryElementsListResponse, error) {
  builder := m.raw.MemoryAPI.MemoryElementsList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryElementsClient) ResolveHead(ctx context.Context, request MemoryElementsResolveHeadRequest) (*MemoryElementsResolveHeadResponse, error) {
  builder := m.raw.MemoryAPI.MemoryElementsResolveHead(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryElementsClient) Search(ctx context.Context, request MemoryElementsSearchRequest) (*MemoryElementsSearchResponse, error) {
  builder := m.raw.MemoryAPI.MemoryElementsSearch(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryElementsClient) Update(ctx context.Context, request MemoryElementsUpdateRequest) (*MemoryElementsUpdateResponse, error) {
  builder := m.raw.MemoryAPI.MemoryElementsUpdate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryElementsDefinitionsClient) Create(ctx context.Context, request MemoryElementsDefinitionsCreateRequest) (*MemoryElementsDefinitionsCreateResponse, error) {
  builder := m.raw.MemoryAPI.MemoryElementsDefinitionsCreate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryElementsDefinitionsClient) Get(ctx context.Context, request MemoryElementsDefinitionsGetRequest) (*MemoryElementsDefinitionsGetResponse, error) {
  builder := m.raw.MemoryAPI.MemoryElementsDefinitionsGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryElementsDefinitionsClient) List(ctx context.Context, request MemoryElementsDefinitionsListRequest) (*MemoryElementsDefinitionsListResponse, error) {
  builder := m.raw.MemoryAPI.MemoryElementsDefinitionsList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryElementsEntitiesClient) Link(ctx context.Context, request MemoryElementsEntitiesLinkRequest) (*MemoryElementsEntitiesLinkResponse, error) {
  builder := m.raw.MemoryAPI.MemoryElementsEntitiesLink(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryElementsEntitiesClient) List(ctx context.Context, request MemoryElementsEntitiesListRequest) (*MemoryElementsEntitiesListResponse, error) {
  builder := m.raw.MemoryAPI.MemoryElementsEntitiesList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryElementsLinksClient) Create(ctx context.Context, request MemoryElementsLinksCreateRequest) (*MemoryElementsLinksCreateResponse, error) {
  builder := m.raw.MemoryAPI.MemoryElementsLinksCreate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryElementsLinksClient) List(ctx context.Context, request MemoryElementsLinksListRequest) (*MemoryElementsLinksListResponse, error) {
  builder := m.raw.MemoryAPI.MemoryElementsLinksList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryElementsLinksClient) Traverse(ctx context.Context, request MemoryElementsLinksTraverseRequest) (*MemoryElementsLinksTraverseResponse, error) {
  builder := m.raw.MemoryAPI.MemoryElementsLinksTraverse(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryEntitiesClient) Confirm(ctx context.Context, request MemoryEntitiesConfirmRequest) (*MemoryEntitiesConfirmResponse, error) {
  builder := m.raw.MemoryAPI.MemoryEntitiesConfirm(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryEntitiesClient) Create(ctx context.Context, request MemoryEntitiesCreateRequest) (*MemoryEntitiesCreateResponse, error) {
  builder := m.raw.MemoryAPI.MemoryEntitiesCreate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryEntitiesClient) ProposeMerge(ctx context.Context, request MemoryEntitiesProposeMergeRequest) (*MemoryEntitiesProposeMergeResponse, error) {
  builder := m.raw.MemoryAPI.MemoryEntitiesProposeMerge(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryReviewClient) Search(ctx context.Context, request MemoryReviewSearchRequest) (*MemoryReviewSearchResponse, error) {
  builder := m.raw.MemoryAPI.MemoryReviewSearch(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryReviewEntityClient) Get(ctx context.Context, request MemoryReviewEntityGetRequest) (*MemoryReviewEntityGetResponse, error) {
  builder := m.raw.MemoryAPI.MemoryReviewEntityGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryReviewEpisodeClient) Get(ctx context.Context, request MemoryReviewEpisodeGetRequest) (*MemoryReviewEpisodeGetResponse, error) {
  builder := m.raw.MemoryAPI.MemoryReviewEpisodeGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryReviewEpisodeOutputsClient) Get(ctx context.Context, request MemoryReviewEpisodeOutputsGetRequest) (*MemoryReviewEpisodeOutputsGetResponse, error) {
  builder := m.raw.MemoryAPI.MemoryReviewEpisodeOutputsGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryReviewFactClient) Get(ctx context.Context, request MemoryReviewFactGetRequest) (*MemoryReviewFactGetResponse, error) {
  builder := m.raw.MemoryAPI.MemoryReviewFactGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryReviewObservationClient) Get(ctx context.Context, request MemoryReviewObservationGetRequest) (*MemoryReviewObservationGetResponse, error) {
  builder := m.raw.MemoryAPI.MemoryReviewObservationGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryReviewQualityClient) Summary(ctx context.Context, request MemoryReviewQualitySummaryRequest) (*MemoryReviewQualitySummaryResponse, error) {
  builder := m.raw.MemoryAPI.MemoryReviewQualitySummary(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryReviewQualityItemsClient) List(ctx context.Context, request MemoryReviewQualityItemsListRequest) (*MemoryReviewQualityItemsListResponse, error) {
  builder := m.raw.MemoryAPI.MemoryReviewQualityItemsList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryReviewRunClient) Get(ctx context.Context, request MemoryReviewRunGetRequest) (*MemoryReviewRunGetResponse, error) {
  builder := m.raw.MemoryAPI.MemoryReviewRunGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryReviewRunEpisodesClient) List(ctx context.Context, request MemoryReviewRunEpisodesListRequest) (*MemoryReviewRunEpisodesListResponse, error) {
  builder := m.raw.MemoryAPI.MemoryReviewRunEpisodesList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemoryReviewRunsClient) List(ctx context.Context, request MemoryReviewRunsListRequest) (*MemoryReviewRunsListResponse, error) {
  builder := m.raw.MemoryAPI.MemoryReviewRunsList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemorySetsClient) Create(ctx context.Context, request MemorySetsCreateRequest) (*MemorySetsCreateResponse, error) {
  builder := m.raw.MemoryAPI.MemorySetsCreate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemorySetsClient) Get(ctx context.Context, request MemorySetsGetRequest) (*MemorySetsGetResponse, error) {
  builder := m.raw.MemoryAPI.MemorySetsGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemorySetsClient) List(ctx context.Context, request MemorySetsListRequest) (*MemorySetsListResponse, error) {
  builder := m.raw.MemoryAPI.MemorySetsList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemorySetsMembersClient) Add(ctx context.Context, request MemorySetsMembersAddRequest) (*MemorySetsMembersAddResponse, error) {
  builder := m.raw.MemoryAPI.MemorySetsMembersAdd(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *MemorySetsMembersClient) List(ctx context.Context, request MemorySetsMembersListRequest) (*MemorySetsMembersListResponse, error) {
  builder := m.raw.MemoryAPI.MemorySetsMembersList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsClient) Get(ctx context.Context, request ModelsGetRequest) (*ModelsGetResponse, error) {
  builder := m.raw.ModelsAPI.ModelsGet(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsClient) List(ctx context.Context, request ModelsListRequest) (*ModelsListResponse, error) {
  builder := m.raw.ModelsAPI.ModelsList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsCatalogClient) Get(ctx context.Context, request ModelsCatalogGetRequest) (*ModelsCatalogGetResponse, error) {
  builder := m.raw.ModelsAPI.ModelsCatalogGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsCatalogClient) List(ctx context.Context, request ModelsCatalogListRequest) (*ModelsCatalogListResponse, error) {
  builder := m.raw.ModelsAPI.ModelsCatalogList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsConfigsClient) Create(ctx context.Context, request ModelsConfigsCreateRequest) (*ModelsConfigsCreateResponse, error) {
  builder := m.raw.ModelsAPI.ModelsConfigsCreate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsConfigsClient) Delete(ctx context.Context, request ModelsConfigsDeleteRequest) (*ModelsConfigsDeleteResponse, error) {
  builder := m.raw.ModelsAPI.ModelsConfigsDelete(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsConfigsClient) Get(ctx context.Context, request ModelsConfigsGetRequest) (*ModelsConfigsGetResponse, error) {
  builder := m.raw.ModelsAPI.ModelsConfigsGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsConfigsClient) List(ctx context.Context, request ModelsConfigsListRequest) (*ModelsConfigsListResponse, error) {
  builder := m.raw.ModelsAPI.ModelsConfigsList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsConfigsClient) Update(ctx context.Context, request ModelsConfigsUpdateRequest) (*ModelsConfigsUpdateResponse, error) {
  builder := m.raw.ModelsAPI.ModelsConfigsUpdate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsConnectionsClient) Create(ctx context.Context, request ModelsConnectionsCreateRequest) (*ModelsConnectionsCreateResponse, error) {
  builder := m.raw.ModelsAPI.ModelsConnectionsCreate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsConnectionsClient) Disconnect(ctx context.Context, request ModelsConnectionsDisconnectRequest) (*ModelsConnectionsDisconnectResponse, error) {
  builder := m.raw.ModelsAPI.ModelsConnectionsDisconnect(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsConnectionsClient) Get(ctx context.Context, request ModelsConnectionsGetRequest) (*ModelsConnectionsGetResponse, error) {
  builder := m.raw.ModelsAPI.ModelsConnectionsGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsConnectionsClient) List(ctx context.Context, request ModelsConnectionsListRequest) (*ModelsConnectionsListResponse, error) {
  builder := m.raw.ModelsAPI.ModelsConnectionsList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsConnectionsClient) Status(ctx context.Context, request ModelsConnectionsStatusRequest) (*ModelsConnectionsStatusResponse, error) {
  builder := m.raw.ModelsAPI.ModelsConnectionsStatus(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsConnectionsClient) Test(ctx context.Context, request ModelsConnectionsTestRequest) (*ModelsConnectionsTestResponse, error) {
  builder := m.raw.ModelsAPI.ModelsConnectionsTest(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsConnectionsClient) Update(ctx context.Context, request ModelsConnectionsUpdateRequest) (*ModelsConnectionsUpdateResponse, error) {
  builder := m.raw.ModelsAPI.ModelsConnectionsUpdate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsDefaultsClient) Get(ctx context.Context, request ModelsDefaultsGetRequest) (*ModelsDefaultsGetResponse, error) {
  builder := m.raw.ModelsAPI.ModelsDefaultsGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsDefaultsClient) Put(ctx context.Context, request ModelsDefaultsPutRequest) (*ModelsDefaultsPutResponse, error) {
  builder := m.raw.ModelsAPI.ModelsDefaultsPut(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsProvidersClient) Delete(ctx context.Context, request ModelsProvidersDeleteRequest) (*ModelsProvidersDeleteResponse, error) {
  builder := m.raw.ModelsAPI.ModelsProvidersDelete(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsProvidersClient) Get(ctx context.Context, request ModelsProvidersGetRequest) (*ModelsProvidersGetResponse, error) {
  builder := m.raw.ModelsAPI.ModelsProvidersGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsProvidersClient) List(ctx context.Context, request ModelsProvidersListRequest) (*ModelsProvidersListResponse, error) {
  builder := m.raw.ModelsAPI.ModelsProvidersList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsProvidersClient) Put(ctx context.Context, request ModelsProvidersPutRequest) (*ModelsProvidersPutResponse, error) {
  builder := m.raw.ModelsAPI.ModelsProvidersPut(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (m *ModelsProvidersClient) Test(ctx context.Context, request ModelsProvidersTestRequest) (*ModelsProvidersTestResponse, error) {
  builder := m.raw.ModelsAPI.ModelsProvidersTest(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (o *OperatorPackagesClient) Get(ctx context.Context, request OperatorPackagesGetRequest) (*OperatorPackagesGetResponse, error) {
  builder := o.raw.RuntimeAPI.OperatorPackagesGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (o *OperatorPackagesClient) Health(ctx context.Context, request OperatorPackagesHealthRequest) (*OperatorPackagesHealthResponse, error) {
  builder := o.raw.RuntimeAPI.OperatorPackagesHealth(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (o *OperatorPackagesClient) Install(ctx context.Context, request OperatorPackagesInstallRequest) (*OperatorPackagesInstallResponse, error) {
  builder := o.raw.RuntimeAPI.OperatorPackagesInstall(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (o *OperatorPackagesClient) Uninstall(ctx context.Context, request OperatorPackagesUninstallRequest) (*OperatorPackagesUninstallResponse, error) {
  builder := o.raw.RuntimeAPI.OperatorPackagesUninstall(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (o *OperatorPackagesClient) Upgrade(ctx context.Context, request OperatorPackagesUpgradeRequest) (*OperatorPackagesUpgradeResponse, error) {
  builder := o.raw.RuntimeAPI.OperatorPackagesUpgrade(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (o *OrientationClient) Contracts(ctx context.Context, request OrientationContractsRequest) (*OrientationContractsResponse, error) {
  builder := o.raw.RuntimeAPI.OrientationContracts(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (o *OrientationClient) Inventory(ctx context.Context, request OrientationInventoryRequest) (*OrientationInventoryResponse, error) {
  builder := o.raw.RuntimeAPI.OrientationInventory(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (o *OrientationClient) Schemas(ctx context.Context, request OrientationSchemasRequest) (*OrientationSchemasResponse, error) {
  builder := o.raw.RuntimeAPI.OrientationSchemas(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (o *OrientationClient) Summary(ctx context.Context, request OrientationSummaryRequest) (*OrientationSummaryResponse, error) {
  builder := o.raw.RuntimeAPI.OrientationSummary(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (o *OrientationClient) Taxonomy(ctx context.Context, request OrientationTaxonomyRequest) (*OrientationTaxonomyResponse, error) {
  builder := o.raw.RuntimeAPI.OrientationTaxonomy(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (p *ProductControlPlaneClient) Call(ctx context.Context, request ProductControlPlaneCallRequest) (*ProductControlPlaneCallResponse, error) {
  builder := p.raw.ProductControlPlaneAPI.ProductControlPlaneCall(ctx)
  builder = builder.ProductControlPlaneCallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (r *RecordClient) Ingest(ctx context.Context, request RecordIngestRequest) (*RecordIngestResponse, error) {
  builder := r.raw.RecordsAPI.RecordIngest(ctx)
  builder = builder.RecordIngestRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (r *RecordsClient) Get(ctx context.Context, request RecordsGetRequest) (*RecordsGetResponse, error) {
  builder := r.raw.RecordsAPI.RecordsGet(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (r *RecordsClient) List(ctx context.Context, request RecordsListRequest) (*RecordsListResponse, error) {
  builder := r.raw.RecordsAPI.RecordsList(ctx)
  builder = builder.RecordsListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (r *RecordsClient) Search(ctx context.Context, request RecordsSearchRequest) (*RecordsSearchResponse, error) {
  builder := r.raw.RecordsAPI.RecordsSearch(ctx)
  builder = builder.RecordsSearchRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (r *RolesClient) Create(ctx context.Context, request RolesCreateRequest) (*RolesCreateResponse, error) {
  builder := r.raw.RuntimeAPI.RolesCreate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (r *RolesClient) Delete(ctx context.Context, request RolesDeleteRequest) (*RolesDeleteResponse, error) {
  builder := r.raw.RuntimeAPI.RolesDelete(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (r *RolesClient) Get(ctx context.Context, request RolesGetRequest) (*RolesGetResponse, error) {
  builder := r.raw.RuntimeAPI.RolesGet(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (r *RolesClient) List(ctx context.Context, request RolesListRequest) (*RolesListResponse, error) {
  builder := r.raw.RuntimeAPI.RolesList(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (r *RolesClient) Update(ctx context.Context, request RolesUpdateRequest) (*RolesUpdateResponse, error) {
  builder := r.raw.RuntimeAPI.RolesUpdate(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (r *RuntimeClient) Health(ctx context.Context, request RuntimeHealthRequest) (*RuntimeHealthResponse, error) {
  builder := r.raw.RuntimeAPI.RuntimeHealth(ctx)
  builder = builder.RuntimeHealthRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SandboxesClient) Create(ctx context.Context, request SandboxesCreateRequest) (*SandboxesCreateResponse, error) {
  builder := s.raw.RuntimeAPI.SandboxesCreate(ctx)
  builder = builder.SandboxesCreateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SandboxesClient) Destroy(ctx context.Context, request SandboxesDestroyRequest) (*SandboxesDestroyResponse, error) {
  builder := s.raw.RuntimeAPI.SandboxesDestroy(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SandboxesClient) Exec(ctx context.Context, request SandboxesExecRequest) (*SandboxesExecResponse, error) {
  builder := s.raw.RuntimeAPI.SandboxesExec(ctx)
  builder = builder.SandboxesExecRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SandboxesClient) Fork(ctx context.Context, request SandboxesForkRequest) (*SandboxesForkResponse, error) {
  builder := s.raw.RuntimeAPI.SandboxesFork(ctx)
  builder = builder.SandboxesForkRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SandboxesClient) Get(ctx context.Context, request SandboxesGetRequest) (*SandboxesGetResponse, error) {
  builder := s.raw.RuntimeAPI.SandboxesGet(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SandboxesClient) List(ctx context.Context, request SandboxesListRequest) (*SandboxesListResponse, error) {
  builder := s.raw.RuntimeAPI.SandboxesList(ctx)
  builder = builder.SandboxesListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SandboxesClient) Resume(ctx context.Context, request SandboxesResumeRequest) (*SandboxesResumeResponse, error) {
  builder := s.raw.RuntimeAPI.SandboxesResume(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SandboxesClient) Retain(ctx context.Context, request SandboxesRetainRequest) (*SandboxesRetainResponse, error) {
  builder := s.raw.RuntimeAPI.SandboxesRetain(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SchedulesClient) Create(ctx context.Context, request SchedulesCreateRequest) (*SchedulesCreateResponse, error) {
  builder := s.raw.SchedulesAPI.SchedulesCreate(ctx)
  builder = builder.SchedulesCreateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SchedulesClient) Delete(ctx context.Context, request SchedulesDeleteRequest) (*SchedulesDeleteResponse, error) {
  builder := s.raw.SchedulesAPI.SchedulesDelete(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SchedulesClient) Get(ctx context.Context, request SchedulesGetRequest) (*SchedulesGetResponse, error) {
  builder := s.raw.SchedulesAPI.SchedulesGet(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SchedulesClient) List(ctx context.Context, request SchedulesListRequest) (*SchedulesListResponse, error) {
  builder := s.raw.SchedulesAPI.SchedulesList(ctx)
  builder = builder.SchedulesListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SchedulesClient) Trigger(ctx context.Context, request SchedulesTriggerRequest) (*SchedulesTriggerResponse, error) {
  builder := s.raw.SchedulesAPI.SchedulesTrigger(ctx)
  builder = builder.SchedulesTriggerRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SchedulesClient) Update(ctx context.Context, request SchedulesUpdateRequest) (*SchedulesUpdateResponse, error) {
  builder := s.raw.SchedulesAPI.SchedulesUpdate(ctx)
  builder = builder.SchedulesUpdateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SearchClient) Rebuild(ctx context.Context, request SearchRebuildRequest) (*SearchRebuildResponse, error) {
  builder := s.raw.RuntimeAPI.SearchRebuild(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SearchClient) Status(ctx context.Context, request SearchStatusRequest) (*SearchStatusResponse, error) {
  builder := s.raw.RuntimeAPI.SearchStatus(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SkillsClient) List(ctx context.Context, request SkillsListRequest) (*SkillsListResponse, error) {
  builder := s.raw.SkillsAPI.SkillsList(ctx)
  builder = builder.SkillsListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SkillsClient) Search(ctx context.Context, request SkillsSearchRequest) (*SkillsSearchResponse, error) {
  builder := s.raw.SkillsAPI.SkillsSearch(ctx)
  builder = builder.SkillsSearchRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (s *SkillsClient) Use(ctx context.Context, request SkillsUseRequest) (*SkillsUseResponse, error) {
  builder := s.raw.SkillsAPI.SkillsUse(ctx)
  builder = builder.SkillsUseRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (t *TalkClient) Mode(ctx context.Context, request TalkModeRequest) (*TalkModeResponse, error) {
  builder := t.raw.TalkAPI.TalkMode(ctx)
  builder = builder.TalkModeRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (t *ToolsClient) Catalog(ctx context.Context, request ToolsCatalogRequest) (*ToolsCatalogResponse, error) {
  builder := t.raw.ToolsAPI.ToolsCatalog(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (t *ToolsClient) Invoke(ctx context.Context, request ToolsInvokeRequest) (*ToolsInvokeResponse, error) {
  builder := t.raw.ToolsAPI.ToolsInvoke(ctx)
  builder = builder.RequestBody(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (u *UpdateClient) Run(ctx context.Context, request UpdateRunRequest) (*UpdateRunResponse, error) {
  builder := u.raw.RuntimeAPI.UpdateRun(ctx)
  builder = builder.UpdateRunRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (w *WizardClient) Cancel(ctx context.Context, request WizardCancelRequest) (*WizardCancelResponse, error) {
  builder := w.raw.WizardAPI.WizardCancel(ctx)
  builder = builder.AgentsSessionsResetRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (w *WizardClient) Next(ctx context.Context, request WizardNextRequest) (*WizardNextResponse, error) {
  builder := w.raw.WizardAPI.WizardNext(ctx)
  builder = builder.WizardNextRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (w *WizardClient) Start(ctx context.Context, request WizardStartRequest) (*WizardStartResponse, error) {
  builder := w.raw.WizardAPI.WizardStart(ctx)
  builder = builder.WizardStartRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (w *WizardClient) Status(ctx context.Context, request WizardStatusRequest) (*WizardStatusResponse, error) {
  builder := w.raw.WizardAPI.WizardStatus(ctx)
  builder = builder.AgentsSessionsResetRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (w *WorkspacesClient) Create(ctx context.Context, request WorkspacesCreateRequest) (*WorkspacesCreateResponse, error) {
  builder := w.raw.WorkspacesAPI.WorkspacesCreate(ctx)
  builder = builder.WorkspacesCreateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (w *WorkspacesClient) Delete(ctx context.Context, request WorkspacesDeleteRequest) (*WorkspacesDeleteResponse, error) {
  builder := w.raw.WorkspacesAPI.WorkspacesDelete(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (w *WorkspacesClient) Get(ctx context.Context, request WorkspacesGetRequest) (*WorkspacesGetResponse, error) {
  builder := w.raw.WorkspacesAPI.WorkspacesGet(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (w *WorkspacesClient) List(ctx context.Context, request WorkspacesListRequest) (*WorkspacesListResponse, error) {
  builder := w.raw.WorkspacesAPI.WorkspacesList(ctx)
  builder = builder.WorkspacesListRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (w *WorkspacesFilesClient) Delete(ctx context.Context, request WorkspacesFilesDeleteRequest) (*WorkspacesFilesDeleteResponse, error) {
  builder := w.raw.WorkspacesAPI.WorkspacesFilesDelete(ctx)
  builder = builder.WorkspacesFilesDeleteRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (w *WorkspacesFilesClient) Get(ctx context.Context, request WorkspacesFilesGetRequest) (*WorkspacesFilesGetResponse, error) {
  builder := w.raw.WorkspacesAPI.WorkspacesFilesGet(ctx)
  builder = builder.WorkspacesFilesDeleteRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (w *WorkspacesFilesClient) List(ctx context.Context, request WorkspacesFilesListRequest) (*WorkspacesFilesListResponse, error) {
  builder := w.raw.WorkspacesAPI.WorkspacesFilesList(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (w *WorkspacesFilesClient) Set(ctx context.Context, request WorkspacesFilesSetRequest) (*WorkspacesFilesSetResponse, error) {
  builder := w.raw.WorkspacesAPI.WorkspacesFilesSet(ctx)
  builder = builder.WorkspacesFilesSetRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (w *WorkspacesManifestClient) Get(ctx context.Context, request WorkspacesManifestGetRequest) (*WorkspacesManifestGetResponse, error) {
  builder := w.raw.WorkspacesAPI.WorkspacesManifestGet(ctx)
  builder = builder.AppsInstallAliasApiAppsInstallRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}

func (w *WorkspacesManifestClient) Update(ctx context.Context, request WorkspacesManifestUpdateRequest) (*WorkspacesManifestUpdateResponse, error) {
  builder := w.raw.WorkspacesAPI.WorkspacesManifestUpdate(ctx)
  builder = builder.WorkspacesManifestUpdateRequest(request)
  response, _, err := builder.Execute()
  if err != nil {
    return nil, err
  }
  return response, nil
}
