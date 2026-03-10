package main

import (
	"encoding/json"
	"net/http"
	"time"
)

type adapterInboundRecord struct {
	Operation string                `json:"operation"`
	Routing   adapterInboundRouting `json:"routing"`
	Payload   adapterInboundPayload `json:"payload"`
}

type adapterInboundRouting struct {
	Adapter       string         `json:"adapter,omitempty"`
	Platform      string         `json:"platform"`
	ConnectionID  string         `json:"connection_id"`
	SenderID      string         `json:"sender_id"`
	SenderName    string         `json:"sender_name,omitempty"`
	ReceiverID    string         `json:"receiver_id,omitempty"`
	ReceiverName  string         `json:"receiver_name,omitempty"`
	SpaceID       string         `json:"space_id,omitempty"`
	SpaceName     string         `json:"space_name,omitempty"`
	ContainerID   string         `json:"container_id"`
	ContainerKind string         `json:"container_kind"`
	ContainerName string         `json:"container_name,omitempty"`
	ThreadID      string         `json:"thread_id,omitempty"`
	ThreadName    string         `json:"thread_name,omitempty"`
	ReplyToID     string         `json:"reply_to_id,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}

type adapterInboundPayload struct {
	ExternalRecordID string              `json:"external_record_id"`
	Timestamp        int64               `json:"timestamp"`
	Content          string              `json:"content"`
	ContentType      string              `json:"content_type"`
	Attachments      []adapterAttachment `json:"attachments,omitempty"`
	Recipients       []string            `json:"recipients,omitempty"`
	Metadata         map[string]any      `json:"metadata,omitempty"`
}

type adapterAttachment struct {
	ID          string         `json:"id"`
	Filename    string         `json:"filename,omitempty"`
	ContentType string         `json:"content_type"`
	SizeBytes   int64          `json:"size_bytes,omitempty"`
	URL         string         `json:"url,omitempty"`
	Path        string         `json:"path,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

type jiraRuntimeContext struct {
	Version      int                `json:"version,omitempty"`
	Platform     string             `json:"platform"`
	ConnectionID string             `json:"connection_id"`
	Config       map[string]any     `json:"config"`
	Credential   *jiraCredentialRef `json:"credential,omitempty"`
}

type jiraCredentialRef struct {
	Kind   string            `json:"kind,omitempty"`
	Value  string            `json:"value"`
	Fields map[string]string `json:"fields,omitempty"`
	AuthID string            `json:"auth_id,omitempty"`
	Type   string            `json:"type,omitempty"`
}

type jiraConnectionConfig struct {
	ConnectionID string
	Projects     []string
	PollInterval time.Duration
	Watermarks   map[string]time.Time
}

type jiraTenantInfo struct {
	CloudID string `json:"cloudId"`
}

type jiraUser struct {
	AccountID    string `json:"accountId"`
	DisplayName  string `json:"displayName"`
	EmailAddress string `json:"emailAddress,omitempty"`
	TimeZone     string `json:"timeZone,omitempty"`
}

type jiraProject struct {
	ID   string `json:"id"`
	Key  string `json:"key"`
	Name string `json:"name"`
}

type jiraProjectSearchResponse struct {
	StartAt    int           `json:"startAt"`
	MaxResults int           `json:"maxResults"`
	Total      int           `json:"total"`
	IsLast     bool          `json:"isLast"`
	Values     []jiraProject `json:"values"`
}

type jiraSearchResponse struct {
	IsLast        bool        `json:"isLast"`
	NextPageToken string      `json:"nextPageToken"`
	Issues        []jiraIssue `json:"issues"`
}

type jiraIssue struct {
	ID        string         `json:"id"`
	Key       string         `json:"key"`
	Self      string         `json:"self"`
	Fields    jiraFields     `json:"fields"`
	Changelog *jiraChangelog `json:"changelog,omitempty"`
}

type jiraFields struct {
	Summary     string           `json:"summary"`
	Description json.RawMessage  `json:"description"`
	Status      *jiraNamedField  `json:"status,omitempty"`
	Assignee    *jiraUser        `json:"assignee,omitempty"`
	Reporter    *jiraUser        `json:"reporter,omitempty"`
	Priority    *jiraNamedField  `json:"priority,omitempty"`
	Labels      []string         `json:"labels,omitempty"`
	IssueType   *jiraNamedField  `json:"issuetype,omitempty"`
	Project     jiraProject      `json:"project"`
	Created     string           `json:"created"`
	Updated     string           `json:"updated"`
	Resolution  *jiraNamedField  `json:"resolution,omitempty"`
	Components  []jiraNamedField `json:"components,omitempty"`
	Parent      *jiraIssueParent `json:"parent,omitempty"`
	Comment     jiraCommentPage  `json:"comment"`
	Sprint      any              `json:"customfield_10020,omitempty"`
	EpicLink    any              `json:"customfield_10028,omitempty"`
}

type jiraIssueParent struct {
	ID     string          `json:"id"`
	Key    string          `json:"key"`
	Fields jiraParentField `json:"fields"`
}

type jiraParentField struct {
	Summary   string          `json:"summary"`
	Status    *jiraNamedField `json:"status,omitempty"`
	Priority  *jiraNamedField `json:"priority,omitempty"`
	IssueType *jiraNamedField `json:"issuetype,omitempty"`
}

type jiraNamedField struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Key  string `json:"key,omitempty"`
}

type jiraChangelog struct {
	Histories []jiraHistory `json:"histories"`
}

type jiraHistory struct {
	ID      string           `json:"id"`
	Author  *jiraUser        `json:"author,omitempty"`
	Created string           `json:"created"`
	Items   []jiraChangeItem `json:"items"`
}

type jiraChangeItem struct {
	Field      string `json:"field"`
	FromString string `json:"fromString"`
	ToString   string `json:"toString"`
}

type jiraCommentPage struct {
	StartAt    int           `json:"startAt"`
	MaxResults int           `json:"maxResults"`
	Total      int           `json:"total"`
	Comments   []jiraComment `json:"comments"`
}

type jiraComment struct {
	ID           string          `json:"id"`
	Author       *jiraUser       `json:"author,omitempty"`
	UpdateAuthor *jiraUser       `json:"updateAuthor,omitempty"`
	Body         json.RawMessage `json:"body"`
	Created      string          `json:"created"`
	Updated      string          `json:"updated"`
}

type jiraTransitionsResponse struct {
	Transitions []jiraTransition `json:"transitions"`
}

type jiraTransition struct {
	ID   string          `json:"id"`
	Name string          `json:"name"`
	To   *jiraNamedField `json:"to,omitempty"`
}

type jiraCreateIssueResponse struct {
	ID  string `json:"id"`
	Key string `json:"key"`
}

type jiraCreateCommentResponse struct {
	ID string `json:"id"`
}

type jiraAPIErrorResponse struct {
	ErrorMessages []string          `json:"errorMessages"`
	Errors        map[string]string `json:"errors"`
}

type jiraAPIError struct {
	StatusCode int
	Message    string
	Headers    http.Header
}

func (e *jiraAPIError) Error() string {
	return e.Message
}

type deliveryAction struct {
	Action            string   `json:"action"`
	IssueType         string   `json:"issuetype,omitempty"`
	Summary           string   `json:"summary,omitempty"`
	Description       string   `json:"description,omitempty"`
	AssigneeAccountID string   `json:"assignee_account_id,omitempty"`
	Labels            []string `json:"labels,omitempty"`
	Body              string   `json:"body,omitempty"`
	TargetStatus      string   `json:"target_status,omitempty"`
	Comment           string   `json:"comment,omitempty"`
}

type projectSyncStats struct {
	Project         string
	Pages           int
	Issues          int
	Comments        int
	ChangelogItems  int
	LastUpdatedTime time.Time
}
