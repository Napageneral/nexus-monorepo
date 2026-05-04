package main

import nexadapter "github.com/nexus-project/adapter-sdk-go"

func main() {
	adapter := newGitAdapter()
	nexadapter.Run(nexadapter.DefineAdapter(adapterConfig(adapter)))
}

func adapterConfig(adapter *GitAdapter) nexadapter.DefineAdapterConfig[struct{}] {
	connectionRequired := true
	mutatesRemote := true

	return nexadapter.DefineAdapterConfig[struct{}]{
		Platform:          platformID,
		Name:              adapterName,
		Version:           adapterVersion,
		CredentialService: platformID,
		MultiAccount:      true,
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					ID:      "gitlab_api_key",
					Type:    "custom_flow",
					Label:   "GitLab API Key",
					Icon:    "git",
					Service: platformID,
					Fields:  gitAuthFields(),
				},
			},
		},
		Capabilities: nexadapter.ChannelCapabilities{
			TextLimit:          0,
			SupportsMarkdown:   true,
			MarkdownFlavor:     "standard",
			SupportsThreads:    true,
			SupportsCodeBlocks: true,
			SupportsTables:     false,
			SupportsEmbeds:     false,
			SupportsReactions:  false,
			SupportsPolls:      false,
			SupportsButtons:    false,
			SupportsEdit:       false,
			SupportsDelete:     false,
			SupportsMedia:      false,
			SupportsVoiceNotes: false,
		},
		Projection: &nexadapter.AdapterProjection{
			Platform: "git",
			Families: []nexadapter.AdapterProjectionFamily{
				{Name: "repository", Description: "Normalized forge repository container records."},
				{Name: "pull_request", Description: "Normalized forge review-request thread records."},
				{Name: "review_comment", Description: "Normalized forge review-comment records."},
			},
			Backfill: &nexadapter.AdapterProjectionSync{
				Supported: true,
				Strategy:  "poll",
				Cursor:    "updated_at",
			},
			Monitor: &nexadapter.AdapterProjectionSync{
				Supported: true,
				Strategy:  "poll",
				Cursor:    "updated_at",
			},
			Routing: &nexadapter.AdapterProjectionRouting{
				Container:        "repository",
				Thread:           "pull_request",
				ThreadsSupported: true,
			},
			RecordIDs: &nexadapter.AdapterProjectionRecordIDs{
				Record:    "git:gitlab:<family>:<resource-id>",
				Container: "git:gitlab:repository:<namespace>/<project>",
				Thread:    "git:gitlab:pull_request:<namespace>/<project>/<number>",
			},
			Normalization: &nexadapter.AdapterProjectionNormalize{
				Content:     "provider_to_forge_projection",
				Attachments: true,
			},
		},
		Connection: nexadapter.ConnectionHandlers[struct{}]{
			Connections: func(ctx nexadapter.AdapterContext[struct{}]) ([]nexadapter.AdapterConnectionIdentity, error) {
				return adapter.ListConnections(ctx.Context)
			},
			Health: func(ctx nexadapter.AdapterContext[struct{}]) (*nexadapter.AdapterHealth, error) {
				return adapter.Health(ctx.Context, ctx.ConnectionID)
			},
		},
		Ingest: nexadapter.IngestHandlers[struct{}]{
			Monitor: func(ctx nexadapter.AdapterContext[struct{}], emit nexadapter.EmitFunc) error {
				return adapter.Monitor(ctx.Context, ctx.ConnectionID, emit)
			},
			Backfill: func(ctx nexadapter.AdapterContext[struct{}], window nexadapter.BackfillWindow, emit nexadapter.EmitFunc) error {
				return adapter.BackfillWindow(ctx.Context, ctx.ConnectionID, window, emit)
			},
		},
		Setup: nexadapter.SetupHandlers[struct{}]{
			Start: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
				return adapter.SetupStart(ctx.Context, req)
			},
			Submit: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
				return adapter.SetupSubmit(ctx.Context, req)
			},
			Status: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
				return adapter.SetupStatus(ctx.Context, req)
			},
			Cancel: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
				return adapter.SetupCancel(ctx.Context, req)
			},
		},
		Methods: map[string]nexadapter.DeclaredMethod[struct{}]{
			"gitlab.branches.create": nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
				Description: "Create a branch in the target repository.",
				Action:      "write",
				Params: map[string]any{
					"type":                 "object",
					"additionalProperties": false,
					"properties": map[string]any{
						"target":      map[string]any{"type": "object"},
						"branch_name": map[string]any{"type": "string"},
						"from_ref":    map[string]any{"type": "string"},
					},
					"required": []string{"target", "branch_name"},
				},
				Response: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"success":     map[string]any{"type": "boolean"},
						"message_ids": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
						"chunks_sent": map[string]any{"type": "integer"},
						"total_chars": map[string]any{"type": "integer"},
					},
				},
				ConnectionRequired: &connectionRequired,
				MutatesRemote:      &mutatesRemote,
				Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
					return adapter.CreateBranchMethod(ctx.Context, req)
				},
			}),
			"gitlab.pull_requests.create": nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
				Description: "Create a pull request in the target repository.",
				Action:      "write",
				Params: map[string]any{
					"type":                 "object",
					"additionalProperties": false,
					"properties": map[string]any{
						"target":        map[string]any{"type": "object"},
						"title":         map[string]any{"type": "string"},
						"description":   map[string]any{"type": "string"},
						"source_branch": map[string]any{"type": "string"},
						"target_branch": map[string]any{"type": "string"},
						"reviewers":     map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
					},
					"required": []string{"target", "title", "source_branch", "target_branch"},
				},
				Response: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"success":     map[string]any{"type": "boolean"},
						"message_ids": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
						"chunks_sent": map[string]any{"type": "integer"},
						"total_chars": map[string]any{"type": "integer"},
					},
				},
				ConnectionRequired: &connectionRequired,
				MutatesRemote:      &mutatesRemote,
				Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
					return adapter.CreatePullRequestMethod(ctx.Context, req)
				},
			}),
			"gitlab.pull_requests.comments.create": nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
				Description: "Create a pull request comment on the target PR thread.",
				Action:      "write",
				Params: map[string]any{
					"type":                 "object",
					"additionalProperties": false,
					"properties": map[string]any{
						"target": map[string]any{"type": "object"},
						"body":   map[string]any{"type": "string"},
					},
					"required": []string{"target", "body"},
				},
				Response: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"success":     map[string]any{"type": "boolean"},
						"message_ids": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
						"chunks_sent": map[string]any{"type": "integer"},
						"total_chars": map[string]any{"type": "integer"},
					},
				},
				ConnectionRequired: &connectionRequired,
				MutatesRemote:      &mutatesRemote,
				Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
					return adapter.CreatePullRequestCommentMethod(ctx.Context, req)
				},
			}),
			"gitlab.pull_requests.merge": nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
				Description: "Merge the target pull request thread.",
				Action:      "write",
				Params: map[string]any{
					"type":                 "object",
					"additionalProperties": false,
					"properties": map[string]any{
						"target":   map[string]any{"type": "object"},
						"strategy": map[string]any{"type": "string"},
					},
					"required": []string{"target"},
				},
				Response: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"success":     map[string]any{"type": "boolean"},
						"message_ids": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
						"chunks_sent": map[string]any{"type": "integer"},
						"total_chars": map[string]any{"type": "integer"},
					},
				},
				ConnectionRequired: &connectionRequired,
				MutatesRemote:      &mutatesRemote,
				Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
					return adapter.MergePullRequestMethod(ctx.Context, req)
				},
			}),
		},
	}
}
