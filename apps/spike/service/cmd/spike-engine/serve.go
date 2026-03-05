package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/Napageneral/spike/internal/broker"
	"github.com/Napageneral/spike/internal/control"
	spikegit "github.com/Napageneral/spike/internal/git"
	prlmstore "github.com/Napageneral/spike/internal/prlm/store"
	prlmtree "github.com/Napageneral/spike/internal/prlm/tree"
	"github.com/Napageneral/spike/internal/spikedb"
)

type askRequest struct {
	TreeID string `json:"tree_id"`
	Query  string `json:"query"`
	JSON   bool   `json:"json,omitempty"`
}

type askResponse struct {
	TreeID    string   `json:"tree_id"`
	Query     string   `json:"query"`
	Content   string   `json:"content"`
	Visited   []string `json:"visited,omitempty"`
	RequestID string   `json:"request_id"`
}

type statusResponse struct {
	Trees []servedTreeStatus `json:"trees"`
}

type syncRequest struct {
	TreeID    string `json:"tree_id,omitempty"`
	Hydrate   bool   `json:"hydrate,omitempty"`
	RepoID    string `json:"repo_id,omitempty"`
	RemoteURL string `json:"remote_url,omitempty"`
	Ref       string `json:"ref,omitempty"`
}

type githubWebhookResponse struct {
	OK         bool                     `json:"ok"`
	Event      string                   `json:"event"`
	DeliveryID string                   `json:"delivery_id"`
	Duplicate  bool                     `json:"duplicate,omitempty"`
	Ignored    bool                     `json:"ignored,omitempty"`
	QueuedJobs []githubWebhookQueuedJob `json:"queued_jobs,omitempty"`
}

type githubWebhookQueuedJob struct {
	TreeID string `json:"tree_id"`
	JobID  string `json:"job_id"`
	RepoID string `json:"repo_id"`
	Ref    string `json:"ref"`
}

type githubRepositoryPayload struct {
	FullName      string `json:"full_name"`
	CloneURL      string `json:"clone_url"`
	DefaultBranch string `json:"default_branch"`
}

type githubPushPayload struct {
	Ref        string                  `json:"ref"`
	Repository githubRepositoryPayload `json:"repository"`
}

type githubPullRequestPayload struct {
	Action      string                  `json:"action"`
	Repository  githubRepositoryPayload `json:"repository"`
	PullRequest struct {
		Head struct {
			Ref  string                  `json:"ref"`
			SHA  string                  `json:"sha"`
			Repo githubRepositoryPayload `json:"repo"`
		} `json:"head"`
	} `json:"pull_request"`
}

type githubInstallationPayload struct {
	RepositoriesAdded []githubRepositoryPayload `json:"repositories_added"`
	Repositories      []githubRepositoryPayload `json:"repositories"`
}

type jobsListRequest struct {
	TreeID string `json:"tree_id,omitempty"`
	Status string `json:"status,omitempty"`
	Limit  int    `json:"limit,omitempty"`
}

type jobsGetRequest struct {
	JobID string `json:"job_id"`
}

type treeVersionsListRequest struct {
	TreeID    string `json:"tree_id,omitempty"`
	RepoID    string `json:"repo_id,omitempty"`
	RefName   string `json:"ref_name,omitempty"`
	CommitSHA string `json:"commit_sha,omitempty"`
	Status    string `json:"status,omitempty"`
	Limit     int    `json:"limit,omitempty"`
}

type repositoriesListRequest struct {
	RepoID string `json:"repo_id,omitempty"`
	Limit  int    `json:"limit,omitempty"`
}

type repoRefsListRequest struct {
	RepoID    string `json:"repo_id,omitempty"`
	RefName   string `json:"ref_name,omitempty"`
	CommitSHA string `json:"commit_sha,omitempty"`
	Limit     int    `json:"limit,omitempty"`
}

type repoRefGetRequest struct {
	RepoID  string `json:"repo_id"`
	RefName string `json:"ref_name"`
}

type repositoryGetRequest struct {
	RepoID string `json:"repo_id"`
}

type githubConnectorBindRequest struct {
	TreeID   string         `json:"tree_id,omitempty"`
	Service  string         `json:"service,omitempty"`
	Account  string         `json:"account"`
	AuthID   string         `json:"auth_id,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

type githubConnectorGetRequest struct {
	TreeID string `json:"tree_id,omitempty"`
}

type githubConnectorRemoveRequest struct {
	TreeID string `json:"tree_id,omitempty"`
}

type githubConnectorSetupRequest struct {
	TreeID                   string `json:"tree_id,omitempty"`
	Account                  string `json:"account"`
	AuthID                   string `json:"auth_id,omitempty"`
	AppID                    string `json:"app_id"`
	InstallationID           string `json:"installation_id"`
	InstallationAccountLogin string `json:"installation_account_login,omitempty"`
	APIBaseURL               string `json:"api_base_url,omitempty"`
	PrivateKeyPEM            string `json:"private_key_pem"`
}

type githubConnectorReposRequest struct {
	TreeID string `json:"tree_id,omitempty"`
}

type githubConnectorBranchesRequest struct {
	TreeID string `json:"tree_id,omitempty"`
	RepoID string `json:"repo_id"`
}

type githubConnectorCommitsRequest struct {
	TreeID string `json:"tree_id,omitempty"`
	RepoID string `json:"repo_id"`
	Ref    string `json:"ref,omitempty"`
}

type treeVersionGetRequest struct {
	ID string `json:"id"`
}

type askRequestsGetRequest struct {
	TreeID    string `json:"tree_id,omitempty"`
	RequestID string `json:"request_id"`
}

type askRequestsListRequest struct {
	TreeID        string `json:"tree_id,omitempty"`
	Status        string `json:"status,omitempty"`
	ScopeKey      string `json:"scope_key,omitempty"`
	RefName       string `json:"ref_name,omitempty"`
	CommitSHA     string `json:"commit_sha,omitempty"`
	TreeVersionID string `json:"tree_version_id,omitempty"`
	Limit         int    `json:"limit,omitempty"`
}

type askRequestsInspectRequest struct {
	TreeID    string `json:"tree_id,omitempty"`
	RequestID string `json:"request_id"`
}

type askRequestsTimelineRequest struct {
	TreeID    string `json:"tree_id,omitempty"`
	RequestID string `json:"request_id"`
	Limit     int    `json:"limit,omitempty"`
}

type askRequestRecord struct {
	RequestID     string     `json:"request_id"`
	TreeID        string     `json:"tree_id"`
	ScopeKey      string     `json:"scope_key"`
	RefName       string     `json:"ref_name"`
	CommitSHA     string     `json:"commit_sha"`
	TreeFlavor    string     `json:"tree_flavor"`
	TreeVersionID string     `json:"tree_version_id"`
	QueryText     string     `json:"query_text"`
	Status        string     `json:"status"`
	RootTurnID    string     `json:"root_turn_id"`
	AnswerPreview string     `json:"answer_preview"`
	ErrorCode     string     `json:"error_code"`
	ErrorMessage  string     `json:"error_message"`
	CreatedAt     time.Time  `json:"created_at"`
	CompletedAt   *time.Time `json:"completed_at,omitempty"`
}

type askInspectorSession struct {
	Label              string    `json:"label"`
	ThreadID           string    `json:"thread_id"`
	PersonaID          string    `json:"persona_id"`
	IsSubagent         bool      `json:"is_subagent"`
	ParentSessionLabel string    `json:"parent_session_label"`
	ParentTurnID       string    `json:"parent_turn_id"`
	SpawnToolCallID    string    `json:"spawn_tool_call_id"`
	TaskDescription    string    `json:"task_description"`
	TaskStatus         string    `json:"task_status"`
	RoutingKey         string    `json:"routing_key"`
	Origin             string    `json:"origin"`
	OriginSessionID    string    `json:"origin_session_id"`
	ScopeKey           string    `json:"scope_key"`
	RefName            string    `json:"ref_name"`
	CommitSHA          string    `json:"commit_sha"`
	TreeFlavor         string    `json:"tree_flavor"`
	TreeVersionID      string    `json:"tree_version_id"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
	Status             string    `json:"status"`
}

type askInspectorTurn struct {
	ID                  string     `json:"id"`
	ParentTurnID        string     `json:"parent_turn_id"`
	TurnType            string     `json:"turn_type"`
	Status              string     `json:"status"`
	StartedAt           time.Time  `json:"started_at"`
	CompletedAt         *time.Time `json:"completed_at,omitempty"`
	Model               string     `json:"model"`
	Provider            string     `json:"provider"`
	Role                string     `json:"role"`
	ToolsetName         string     `json:"toolset_name"`
	ToolsAvailableJSON  string     `json:"tools_available_json"`
	EffectiveConfigJSON string     `json:"effective_config_json"`
	InputTokens         int        `json:"input_tokens"`
	OutputTokens        int        `json:"output_tokens"`
	CachedInputTokens   int        `json:"cached_input_tokens"`
	CacheWriteTokens    int        `json:"cache_write_tokens"`
	ReasoningTokens     int        `json:"reasoning_tokens"`
	TotalTokens         int        `json:"total_tokens"`
	QueryMessageIDsJSON string     `json:"query_message_ids_json"`
	ResponseMessageID   string     `json:"response_message_id"`
	HasChildren         bool       `json:"has_children"`
	ToolCallCount       int        `json:"tool_call_count"`
	SourceEventID       string     `json:"source_event_id"`
	WorkspacePath       string     `json:"workspace_path"`
	ScopeKey            string     `json:"scope_key"`
	RefName             string     `json:"ref_name"`
	CommitSHA           string     `json:"commit_sha"`
	TreeFlavor          string     `json:"tree_flavor"`
	TreeVersionID       string     `json:"tree_version_id"`
}

type askInspectorMessage struct {
	ID            string    `json:"id"`
	TurnID        string    `json:"turn_id"`
	Role          string    `json:"role"`
	Content       string    `json:"content"`
	Source        string    `json:"source"`
	Sequence      int       `json:"sequence"`
	CreatedAt     time.Time `json:"created_at"`
	Thinking      string    `json:"thinking"`
	ContextJSON   string    `json:"context_json"`
	MetadataJSON  string    `json:"metadata_json"`
	ScopeKey      string    `json:"scope_key"`
	RefName       string    `json:"ref_name"`
	CommitSHA     string    `json:"commit_sha"`
	TreeFlavor    string    `json:"tree_flavor"`
	TreeVersionID string    `json:"tree_version_id"`
}

type askInspectorToolCall struct {
	ID                  string     `json:"id"`
	TurnID              string     `json:"turn_id"`
	MessageID           string     `json:"message_id"`
	ToolName            string     `json:"tool_name"`
	ToolNumber          *int       `json:"tool_number,omitempty"`
	ParamsJSON          string     `json:"params_json"`
	ResultJSON          string     `json:"result_json"`
	Error               string     `json:"error"`
	Status              string     `json:"status"`
	SpawnedSessionLabel string     `json:"spawned_session_label"`
	StartedAt           time.Time  `json:"started_at"`
	CompletedAt         *time.Time `json:"completed_at,omitempty"`
	Sequence            int        `json:"sequence"`
	ScopeKey            string     `json:"scope_key"`
	RefName             string     `json:"ref_name"`
	CommitSHA           string     `json:"commit_sha"`
	TreeFlavor          string     `json:"tree_flavor"`
	TreeVersionID       string     `json:"tree_version_id"`
}

type askTimelineTurnSummary struct {
	ID            string     `json:"id"`
	ParentTurnID  string     `json:"parent_turn_id"`
	Status        string     `json:"status"`
	StartedAt     time.Time  `json:"started_at"`
	CompletedAt   *time.Time `json:"completed_at,omitempty"`
	TotalTokens   int        `json:"total_tokens"`
	ToolCallCount int        `json:"tool_call_count"`
}

type askTimelineNode struct {
	NodeID           string                  `json:"node_id"`
	Depth            int                     `json:"depth"`
	IsRoot           bool                    `json:"is_root"`
	SessionLabel     string                  `json:"session_label"`
	ThreadID         string                  `json:"thread_id"`
	SessionStatus    string                  `json:"session_status"`
	CreatedAt        time.Time               `json:"created_at"`
	UpdatedAt        time.Time               `json:"updated_at"`
	Turn             *askTimelineTurnSummary `json:"turn,omitempty"`
	MessageCount     int                     `json:"message_count"`
	ToolCallCount    int                     `json:"tool_call_count"`
	AssistantPreview string                  `json:"assistant_preview"`
}

type askTimelineSessionRow struct {
	Label     string
	ThreadID  string
	Status    string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type servedTreeStatus struct {
	TreeID     string `json:"tree_id"`
	RootPath   string `json:"root_path"`
	NodeCount  int    `json:"node_count"`
	CleanCount int    `json:"clean_count"`
}

type servedTree struct {
	treeID   string
	capacity int
	store    *prlmstore.SQLiteStore
	oracle   *prlmtree.OracleTree
	broker   *broker.Broker
}

type sessionsListRequest struct {
	TreeID        string `json:"tree_id,omitempty"`
	PersonaID     string `json:"persona_id,omitempty"`
	Status        string `json:"status,omitempty"`
	Origin        string `json:"origin,omitempty"`
	ScopeKey      string `json:"scope_key,omitempty"`
	RefName       string `json:"ref_name,omitempty"`
	CommitSHA     string `json:"commit_sha,omitempty"`
	TreeFlavor    string `json:"tree_flavor,omitempty"`
	TreeVersionID string `json:"tree_version_id,omitempty"`
	Limit         int    `json:"limit,omitempty"`
}

type sessionsResolveRequest struct {
	TreeID string `json:"tree_id,omitempty"`
	Key    string `json:"key"`
}

type sessionsPreviewRequest struct {
	TreeID   string   `json:"tree_id,omitempty"`
	Keys     []string `json:"keys"`
	Limit    int      `json:"limit,omitempty"`
	MaxChars int      `json:"max_chars,omitempty"`
}

type sessionsPatchRequest struct {
	TreeID          string  `json:"tree_id,omitempty"`
	Key             string  `json:"key"`
	PersonaID       *string `json:"persona_id,omitempty"`
	TaskDescription *string `json:"task_description,omitempty"`
	TaskStatus      *string `json:"task_status,omitempty"`
	RoutingKey      *string `json:"routing_key,omitempty"`
	Status          *string `json:"status,omitempty"`
}

type sessionsKeyRequest struct {
	TreeID string `json:"tree_id,omitempty"`
	Key    string `json:"key"`
}

type sessionsCompactRequest struct {
	TreeID       string `json:"tree_id,omitempty"`
	Key          string `json:"key"`
	Instructions string `json:"instructions,omitempty"`
}

type sessionsImportRequest struct {
	TreeID         string                      `json:"tree_id,omitempty"`
	Source         string                      `json:"source"`
	RunID          string                      `json:"runId,omitempty"`
	Mode           string                      `json:"mode"`
	PersonaID      string                      `json:"personaId,omitempty"`
	IdempotencyKey string                      `json:"idempotencyKey"`
	Items          []broker.SessionsImportItem `json:"items"`
}

type sessionsImportChunkRequest struct {
	TreeID                   string `json:"tree_id,omitempty"`
	Source                   string `json:"source"`
	RunID                    string `json:"runId,omitempty"`
	Mode                     string `json:"mode"`
	PersonaID                string `json:"personaId,omitempty"`
	IdempotencyKey           string `json:"idempotencyKey"`
	UploadID                 string `json:"uploadId"`
	ChunkIndex               int    `json:"chunkIndex"`
	ChunkTotal               int    `json:"chunkTotal"`
	Encoding                 string `json:"encoding"`
	Data                     string `json:"data"`
	SourceProvider           string `json:"sourceProvider"`
	SourceSessionID          string `json:"sourceSessionId"`
	SourceSessionFingerprint string `json:"sourceSessionFingerprint"`
}

type oracleServer struct {
	mu                  sync.RWMutex
	trees               map[string]*servedTree
	askTimeout          time.Duration
	askSem              chan struct{}
	spikeStore          *spikedb.Store
	control             *control.Store
	gitAdapter          *spikegit.Adapter
	authToken           string
	githubWebhookSecret string
	connectorStateDir   string
	githubAppSlug       string
	githubAppID         int64
	githubAppPrivateKey string
	githubAppAPIBaseURL string
	githubInstallSecret string
	uiDir               string

	syncJobs       chan syncJobTask
	syncCancel     context.CancelFunc
	syncWorkerDone sync.WaitGroup
	rateLimiter    *requestRateLimiter
	trustedProxies []*net.IPNet

	allowUnauthenticatedStatus bool
}

type oracleServerOptions struct {
	AskTimeout          time.Duration
	MaxConcurrentAsks   int
	ControlDB           string
	GitMirrorsDir       string
	GitWorktreesDir     string
	AuthToken           string
	AllowUnauthStatus   bool
	RateLimitRPS        float64
	RateLimitBurst      int
	TrustedProxies      string
	GitHubWebhookSecret string
	GitHubAppSlug       string
	GitHubAppID         string
	GitHubAppPrivateKey string
	GitHubAppAPIBaseURL string
	ConnectorStateDir   string
	UIDir               string
}

type syncJobTask struct {
	JobID     string
	TreeID    string
	Hydrate   bool
	RepoID    string
	RemoteURL string
	Ref       string
}

type requestRateLimiter struct {
	mu      sync.Mutex
	rate    float64
	burst   float64
	buckets map[string]rateLimitBucket
}

type rateLimitBucket struct {
	tokens   float64
	last     time.Time
	lastSeen time.Time
}

var (
	errServeTreeNotFound    = errors.New("tree not found")
	errServeTreeRequired    = errors.New("tree_id is required when multiple trees are served")
	errSyncQueueUnavailable = errors.New("sync queue is unavailable")
	errSyncQueueFull        = errors.New("sync queue is full")
)

func (o oracleServerOptions) normalized() oracleServerOptions {
	if o.AskTimeout <= 0 {
		o.AskTimeout = 120 * time.Minute
	}
	if o.RateLimitRPS < 0 {
		o.RateLimitRPS = 0
	}
	if o.RateLimitBurst < 0 {
		o.RateLimitBurst = 0
	}
	return o
}

func newOracleServer(storageRoot string, opts ...oracleServerOptions) (*oracleServer, error) {
	options := oracleServerOptions{}
	if len(opts) > 0 {
		options = opts[0]
	}
	options = options.normalized()

	// Open unified spike.db — all tables, default config seeded.
	spikeDBPath := resolveSpikeDBPath(storageRoot, options.ControlDB)
	store, err := spikedb.Open(spikeDBPath)
	if err != nil {
		return nil, fmt.Errorf("open spike.db: %w", err)
	}

	// Control store shares the same DB connection.
	controlStore, err := control.OpenWithDB(store.DB())
	if err != nil {
		_ = store.Close()
		return nil, err
	}
	gitMirrorsDir, gitWorktreesDir, err := resolveGitStorageRoots(storageRoot, options.GitMirrorsDir, options.GitWorktreesDir)
	if err != nil {
		_ = store.Close()
		return nil, err
	}
	gitAdapter, err := spikegit.NewAdapter(spikegit.AdapterOptions{
		MirrorsRoot:   gitMirrorsDir,
		WorktreesRoot: gitWorktreesDir,
	})
	if err != nil {
		_ = store.Close()
		return nil, err
	}
	trustedProxies, err := parseTrustedProxyList(options.TrustedProxies)
	if err != nil {
		_ = store.Close()
		return nil, err
	}
	githubAppSlug := strings.TrimSpace(options.GitHubAppSlug)
	githubAppIDRaw := strings.TrimSpace(options.GitHubAppID)
	githubAppPrivateKey := normalizePrivateKeyPEM(options.GitHubAppPrivateKey)
	githubAppAPIBaseURL := normalizeGitHubAPIBaseURL(options.GitHubAppAPIBaseURL)
	var githubAppID int64
	if githubAppIDRaw != "" {
		githubAppID, err = parsePositiveInt64Secret(githubAppIDRaw)
		if err != nil {
			_ = store.Close()
			return nil, fmt.Errorf("invalid github app id: %w", err)
		}
	}
	if githubAppPrivateKey != "" {
		if _, err := parseRSAPrivateKeyPEM(githubAppPrivateKey); err != nil {
			_ = store.Close()
			return nil, fmt.Errorf("invalid github app private key: %w", err)
		}
	}
	if githubAppSlug != "" || githubAppIDRaw != "" || githubAppPrivateKey != "" {
		if githubAppSlug == "" || githubAppID <= 0 || githubAppPrivateKey == "" {
			_ = store.Close()
			return nil, fmt.Errorf("incomplete github app configuration: slug, id, and private key are all required")
		}
	}
	githubInstallSecret := strings.TrimSpace(options.AuthToken)
	if githubAppPrivateKey != "" {
		sum := sha256.Sum256([]byte(githubAppPrivateKey + "|" + githubAppIDRaw + "|" + githubInstallSecret))
		githubInstallSecret = hex.EncodeToString(sum[:])
	}
	connectorStateDir, err := resolveConnectorStateDir(storageRoot, options.ConnectorStateDir)
	if err != nil {
		_ = store.Close()
		return nil, err
	}

	s := &oracleServer{
		trees:                      make(map[string]*servedTree),
		askTimeout:                 options.AskTimeout,
		spikeStore:                 store,
		control:                    controlStore,
		gitAdapter:                 gitAdapter,
		syncJobs:                   make(chan syncJobTask, 128),
		authToken:                  strings.TrimSpace(options.AuthToken),
		githubWebhookSecret:        strings.TrimSpace(options.GitHubWebhookSecret),
		connectorStateDir:          connectorStateDir,
		githubAppSlug:              githubAppSlug,
		githubAppID:                githubAppID,
		githubAppPrivateKey:        githubAppPrivateKey,
		githubAppAPIBaseURL:        githubAppAPIBaseURL,
		githubInstallSecret:        strings.TrimSpace(githubInstallSecret),
		uiDir:                      options.UIDir,
		trustedProxies:             trustedProxies,
		allowUnauthenticatedStatus: options.AllowUnauthStatus,
	}
	s.rateLimiter = newRequestRateLimiter(options.RateLimitRPS, options.RateLimitBurst)
	if options.MaxConcurrentAsks > 0 {
		s.askSem = make(chan struct{}, options.MaxConcurrentAsks)
	}

	// Load indexes from spike.db. A shared PRLM store uses the unified DB.
	sharedPRLMStore, err := prlmstore.OpenWithDB(store.DB())
	if err != nil {
		_ = store.Close()
		return nil, fmt.Errorf("init shared prlm store: %w", err)
	}
	treeIDs, err := sharedPRLMStore.ListTreeIDs(context.Background())
	if err != nil {
		_ = store.Close()
		return nil, fmt.Errorf("list indexes: %w", err)
	}
	runtimeDir := filepath.Join(storageRoot, "runtime")
	for _, treeID := range treeIDs {
		oracle, err := prlmtree.NewOracleTree(sharedPRLMStore, prlmtree.OracleTreeOptions{
			RuntimeDir: runtimeDir,
		})
		if err != nil {
			fmt.Fprintf(os.Stderr, "warn: skip index %s: oracle init: %v\n", treeID, err)
			continue
		}
		runtimeBroker := (*broker.Broker)(nil)
		if _, err := oracle.Status(context.Background(), treeID); err != nil {
			if !errors.Is(err, prlmtree.ErrTreeNotFound) {
				fmt.Fprintf(os.Stderr, "warn: skip index %s: status: %v\n", treeID, err)
				continue
			}
		} else {
			runtimeBroker, err = oracle.BrokerForTree(context.Background(), treeID)
			if err != nil {
				fmt.Fprintf(os.Stderr, "warn: skip index %s: broker: %v\n", treeID, err)
				continue
			}
		}
		// Read capacity from default config.
		cfg, _ := store.GetDefaultConfig(context.Background())
		cap := 120000
		if cfg != nil && cfg.Capacity > 0 {
			cap = cfg.Capacity
		}
		s.trees[treeID] = &servedTree{
			treeID:   treeID,
			capacity: cap,
			store:    sharedPRLMStore,
			oracle:   oracle,
			broker:   runtimeBroker,
		}
	}
	if len(s.trees) > 0 {
		fmt.Printf("spike loaded %d index(es) from spike.db\n", len(s.trees))
	}

	s.startSyncWorker()
	return s, nil
}

func (s *oracleServer) close() {
	var (
		syncJobs chan syncJobTask
		cancel   context.CancelFunc
	)
	s.mu.Lock()
	syncJobs = s.syncJobs
	s.syncJobs = nil
	cancel = s.syncCancel
	s.syncCancel = nil
	s.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	s.syncWorkerDone.Wait()

	var (
		trees      map[string]*servedTree
		spikeStore *spikedb.Store
	)
	s.mu.Lock()
	trees = s.trees
	s.trees = nil
	spikeStore = s.spikeStore
	s.spikeStore = nil
	s.control = nil // shared DB, closed by spikeStore
	s.mu.Unlock()

	for _, tree := range trees {
		if tree != nil && tree.store != nil {
			_ = tree.store.Close()
		}
	}
	if spikeStore != nil {
		_ = spikeStore.Close()
	}
	_ = syncJobs // channel is left open intentionally; worker exits on cancel.
}

func (s *oracleServer) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleRoot)

	// Nex service protocol endpoints
	mux.HandleFunc("/health", s.handleNexHealth)
	mux.HandleFunc("/operations/", s.handleNexOperation)

	mux.HandleFunc("/api/apps", s.handleApps)
	mux.HandleFunc("/ask", s.handleAsk)
	mux.HandleFunc("/status", s.handleStatus)
	mux.HandleFunc("/github/webhook", s.handleGitHubWebhook)
	mux.HandleFunc("/sync", s.handleSync)
	mux.HandleFunc("/jobs/get", s.handleJobsGet)
	mux.HandleFunc("/jobs/list", s.handleJobsList)
	mux.HandleFunc("/repositories/get", s.handleRepositoryGet)
	mux.HandleFunc("/repositories/list", s.handleRepositoriesList)
	mux.HandleFunc("/repo_refs/get", s.handleRepoRefGet)
	mux.HandleFunc("/repo_refs/list", s.handleRepoRefsList)
	mux.HandleFunc("/mirrors/list", s.handleMirrorsList)
	mux.HandleFunc("/worktrees/list", s.handleWorktreesList)
	mux.HandleFunc("/indexes/create", s.handleIndexesCreate)
	mux.HandleFunc("/indexes/list", s.handleIndexesList)
	mux.HandleFunc("/indexes/get", s.handleIndexesGet)
	mux.HandleFunc("/indexes/delete", s.handleIndexesDelete)
	mux.HandleFunc("/indexes/status", s.handleIndexesStatus)
	mux.HandleFunc("/config/defaults", s.handleConfigDefaults)
	mux.HandleFunc("/config/get", s.handleConfigGet)
	mux.HandleFunc("/config/update", s.handleConfigUpdate)
	mux.HandleFunc("/github/installations/list", s.handleGitHubInstallationsList)
	mux.HandleFunc("/github/installations/get", s.handleGitHubInstallationsGet)
	mux.HandleFunc("/connectors/github/install/start", s.handleGitHubConnectorInstallStart)
	mux.HandleFunc("/connectors/github/install/callback", s.handleGitHubConnectorInstallCallback)
	mux.HandleFunc("/connectors/github/repos", s.handleGitHubConnectorRepos)
	mux.HandleFunc("/connectors/github/branches", s.handleGitHubConnectorBranches)
	mux.HandleFunc("/connectors/github/commits", s.handleGitHubConnectorCommits)
	mux.HandleFunc("/connectors/github/remove", s.handleGitHubConnectorRemove)
	mux.HandleFunc("/connectors/github/setup", s.handleGitHubConnectorSetup)
	mux.HandleFunc("/app", s.handleRuntimeApp)
	mux.HandleFunc("/app/", s.handleRuntimeApp)
	mux.HandleFunc("/tree_versions/get", s.handleTreeVersionGet)
	mux.HandleFunc("/tree_versions/list", s.handleTreeVersionsList)
	mux.HandleFunc("/ask_requests/get", s.handleAskRequestsGet)
	mux.HandleFunc("/ask_requests/list", s.handleAskRequestsList)
	mux.HandleFunc("/ask_requests/inspect", s.handleAskRequestsInspect)
	mux.HandleFunc("/ask_requests/timeline", s.handleAskRequestsTimeline)
	mux.HandleFunc("/control", s.handleControlRoot)
	mux.HandleFunc("/control/ask-inspector", s.handleControlAskInspector)
	mux.HandleFunc("/sessions/list", s.handleSessionsList)
	mux.HandleFunc("/sessions/resolve", s.handleSessionsResolve)
	mux.HandleFunc("/sessions/preview", s.handleSessionsPreview)
	mux.HandleFunc("/sessions/patch", s.handleSessionsPatch)
	mux.HandleFunc("/sessions/reset", s.handleSessionsReset)
	mux.HandleFunc("/sessions/delete", s.handleSessionsDelete)
	mux.HandleFunc("/sessions/compact", s.handleSessionsCompact)
	mux.HandleFunc("/sessions/import", s.handleSessionsImport)
	mux.HandleFunc("/sessions/import.chunk", s.handleSessionsImportChunk)
	return s.withFrontDoorSecurity(mux)
}

func (s *oracleServer) withFrontDoorSecurity(next http.Handler) http.Handler {
	if next == nil {
		next = http.NotFoundHandler()
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s == nil {
			next.ServeHTTP(w, r)
			return
		}
		if !s.authorizeRequest(w, r) {
			return
		}
		if !s.allowByRateLimit(w, r) {
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *oracleServer) authorizeRequest(w http.ResponseWriter, r *http.Request) bool {
	if isGitHubWebhookPath(r) {
		return true
	}
	configured := strings.TrimSpace(s.authToken)
	if configured == "" {
		return true
	}
	if s.allowUnauthenticatedStatus && isStatusProbe(r) {
		return true
	}
	presented := authTokenFromRequest(r)
	if secureTokenEqual(configured, presented) {
		return true
	}
	w.Header().Set("WWW-Authenticate", `Bearer realm="spike"`)
	http.Error(w, "unauthorized", http.StatusUnauthorized)
	return false
}

func isGitHubWebhookPath(r *http.Request) bool {
	if r == nil {
		return false
	}
	return strings.TrimSpace(r.URL.Path) == "/github/webhook"
}

func (s *oracleServer) allowByRateLimit(w http.ResponseWriter, r *http.Request) bool {
	if s == nil || s.rateLimiter == nil {
		return true
	}
	key := s.rateLimitKey(r)
	if s.rateLimiter.Allow(key, time.Now().UTC()) {
		return true
	}
	http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
	return false
}

func (s *oracleServer) rateLimitKey(r *http.Request) string {
	if r == nil {
		return "ip:unknown"
	}
	if token := authTokenFromRequest(r); strings.TrimSpace(token) != "" {
		return "token:" + tokenHash(token)
	}
	return "ip:" + s.requestClientIP(r)
}

func (s *oracleServer) requestClientIP(r *http.Request) string {
	if r == nil {
		return "unknown"
	}
	remote := parseRemoteIP(r.RemoteAddr)
	if remote == nil {
		return "unknown"
	}
	if s.isTrustedProxy(remote) {
		if forwarded := firstForwardedIP(r.Header.Get("X-Forwarded-For")); forwarded != nil {
			return forwarded.String()
		}
		if realIP := net.ParseIP(strings.TrimSpace(r.Header.Get("X-Real-IP"))); realIP != nil {
			return realIP.String()
		}
	}
	return remote.String()
}

func (s *oracleServer) isTrustedProxy(ip net.IP) bool {
	if ip == nil || s == nil || len(s.trustedProxies) == 0 {
		return false
	}
	for _, n := range s.trustedProxies {
		if n != nil && n.Contains(ip) {
			return true
		}
	}
	return false
}

func isStatusProbe(r *http.Request) bool {
	if r == nil {
		return false
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return false
	}
	return strings.TrimSpace(r.URL.Path) == "/status"
}

func authTokenFromRequest(r *http.Request) string {
	if r == nil {
		return ""
	}
	if token := parseBearerToken(r.Header.Get("Authorization")); token != "" {
		return token
	}
	// Browser convenience path for initial control-page bootstrap.
	if (r.Method == http.MethodGet || r.Method == http.MethodHead) && isControlPagePath(strings.TrimSpace(r.URL.Path)) {
		if q := strings.TrimSpace(r.URL.Query().Get("auth_token")); q != "" {
			return q
		}
	}
	return ""
}

func parseBearerToken(header string) string {
	header = strings.TrimSpace(header)
	if header == "" {
		return ""
	}
	const prefix = "Bearer "
	if len(header) < len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return ""
	}
	return strings.TrimSpace(header[len(prefix):])
}

func isControlPagePath(path string) bool {
	switch path {
	case "/control", "/control/ask-inspector":
		return true
	default:
		return false
	}
}

func secureTokenEqual(expected string, actual string) bool {
	expected = strings.TrimSpace(expected)
	actual = strings.TrimSpace(actual)
	if expected == "" || actual == "" {
		return false
	}
	if len(expected) != len(actual) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(expected), []byte(actual)) == 1
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(token)))
	return fmt.Sprintf("%x", sum[:8])
}

func parseRemoteIP(remoteAddr string) net.IP {
	remoteAddr = strings.TrimSpace(remoteAddr)
	if remoteAddr == "" {
		return nil
	}
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return net.ParseIP(remoteAddr)
	}
	return net.ParseIP(host)
}

func firstForwardedIP(header string) net.IP {
	header = strings.TrimSpace(header)
	if header == "" {
		return nil
	}
	parts := strings.Split(header, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if ip := net.ParseIP(part); ip != nil {
			return ip
		}
	}
	return nil
}

func parseTrustedProxyList(raw string) ([]*net.IPNet, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	parts := strings.Split(raw, ",")
	out := make([]*net.IPNet, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if strings.Contains(part, "/") {
			_, n, err := net.ParseCIDR(part)
			if err != nil {
				return nil, fmt.Errorf("invalid trusted proxy cidr %q: %w", part, err)
			}
			out = append(out, n)
			continue
		}
		ip := net.ParseIP(part)
		if ip == nil {
			return nil, fmt.Errorf("invalid trusted proxy ip %q", part)
		}
		bits := 32
		if ip.To4() == nil {
			bits = 128
		}
		out = append(out, &net.IPNet{IP: ip, Mask: net.CIDRMask(bits, bits)})
	}
	return out, nil
}

func newRequestRateLimiter(rate float64, burst int) *requestRateLimiter {
	if rate <= 0 || burst <= 0 {
		return nil
	}
	return &requestRateLimiter{
		rate:    rate,
		burst:   float64(burst),
		buckets: map[string]rateLimitBucket{},
	}
}

func (l *requestRateLimiter) Allow(key string, now time.Time) bool {
	if l == nil {
		return true
	}
	key = strings.TrimSpace(key)
	if key == "" {
		key = "ip:unknown"
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	bucket, ok := l.buckets[key]
	if !ok {
		bucket = rateLimitBucket{
			tokens:   l.burst,
			last:     now,
			lastSeen: now,
		}
	} else {
		elapsed := now.Sub(bucket.last).Seconds()
		if elapsed > 0 {
			bucket.tokens = math.Min(l.burst, bucket.tokens+(elapsed*l.rate))
			bucket.last = now
		}
		bucket.lastSeen = now
	}

	if bucket.tokens < 1 {
		l.buckets[key] = bucket
		l.cleanup(now)
		return false
	}
	bucket.tokens -= 1
	l.buckets[key] = bucket
	l.cleanup(now)
	return true
}

func (l *requestRateLimiter) cleanup(now time.Time) {
	if len(l.buckets) <= 4096 {
		return
	}
	const ttl = 10 * time.Minute
	for k, bucket := range l.buckets {
		if now.Sub(bucket.lastSeen) > ttl {
			delete(l.buckets, k)
		}
	}
}

func (s *oracleServer) startSyncWorker() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.syncCancel != nil {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	s.syncCancel = cancel
	s.syncWorkerDone.Add(1)
	go s.runSyncWorker(ctx)
}

func (s *oracleServer) runSyncWorker(ctx context.Context) {
	defer s.syncWorkerDone.Done()
	for {
		select {
		case <-ctx.Done():
			return
		case task, ok := <-s.syncJobs:
			if !ok {
				return
			}
			s.processSyncTask(ctx, task)
		}
	}
}

func (s *oracleServer) processSyncTask(ctx context.Context, task syncJobTask) {
	if s == nil || s.control == nil {
		return
	}
	_ = s.control.StartJob(task.JobID)
	treeID, entry, err := s.resolveServedTreeWithID(task.TreeID)
	if err != nil {
		_ = s.control.FailJob(task.JobID, err.Error())
		return
	}
	if entry == nil || entry.oracle == nil {
		_ = s.control.FailJob(task.JobID, "oracle runtime is not available for served tree")
		return
	}

	runCtx := ctx
	var cancel context.CancelFunc
	runCtx, cancel = context.WithTimeout(runCtx, 120*time.Minute)
	defer cancel()
	result := map[string]any{}
	var treeVersion *control.TreeVersion
	failJob := func(runErr error) {
		if runErr == nil {
			return
		}
		msg := strings.TrimSpace(runErr.Error())
		if msg == "" {
			msg = "sync job failed"
		}
		if treeVersion != nil {
			_ = s.control.SetTreeVersionStatus(treeVersion.ID, "failed", msg)
		}
		_ = s.control.FailJob(task.JobID, msg)
	}

	remoteURLInput := strings.TrimSpace(task.RemoteURL)
	repoID := strings.TrimSpace(task.RepoID)
	if remoteURLInput != "" || repoID != "" {
		if s.gitAdapter == nil {
			_ = s.control.FailJob(task.JobID, "git adapter is not configured")
			return
		}
		ref := strings.TrimSpace(task.Ref)
		if repoID == "" {
			repoID = treeID
		}

		remoteURLForClone := remoteURLInput
		remoteURLPublic := remoteURLInput
		connectorSource := ""
		if strings.TrimSpace(task.RepoID) != "" {
			binding, bindingErr := s.control.GetGitHubConnectorBinding(treeID)
			if bindingErr == nil && binding != nil {
				resolvedClone, resolvedPublic, resolvedRepoID, resolvedRef, resolveErr := s.resolveBoundGitHubRemote(
					runCtx,
					treeID,
					repoID,
					ref,
				)
				if resolveErr != nil {
					failJob(resolveErr)
					return
				}
				remoteURLForClone = resolvedClone
				remoteURLPublic = resolvedPublic
				repoID = resolvedRepoID
				ref = resolvedRef
				connectorSource = "github"
				result["connector"] = map[string]any{
					"service": binding.Service,
					"account": binding.Account,
					"auth_id": binding.AuthID,
				}
			} else if bindingErr != nil && !errors.Is(bindingErr, sql.ErrNoRows) {
				failJob(bindingErr)
				return
			}
		}
		if strings.TrimSpace(remoteURLForClone) == "" {
			failJob(fmt.Errorf("remote_url is required when no github connector binding is available for repo_id %q", repoID))
			return
		}
		if ref == "" {
			ref = "HEAD"
		}

		mirrorState, err := s.gitAdapter.EnsureMirror(runCtx, remoteURLForClone)
		if err != nil {
			failJob(err)
			return
		}
		// Track mirror in spike.db (non-blocking on error).
		mirrorID := spikedb.MirrorID(remoteURLForClone)
		nowUnix := time.Now().Unix()
		if s.spikeStore != nil {
			if dbErr := s.spikeStore.UpsertMirror(runCtx, spikedb.Mirror{
				MirrorID:    mirrorID,
				RemoteURL:   remoteURLForClone,
				MirrorPath:  mirrorState.Path,
				Status:      "ready",
				LastFetched: &nowUnix,
			}); dbErr != nil {
				fmt.Fprintf(os.Stderr, "warn: track mirror: %v\n", dbErr)
			}
		}

		commitSHA, err := s.gitAdapter.ResolveCommit(runCtx, mirrorState.Path, ref)
		if err != nil {
			failJob(err)
			return
		}
		worktreeState, err := s.gitAdapter.EnsurePinnedWorktree(runCtx, repoID, mirrorState.Path, commitSHA)
		if err != nil {
			failJob(err)
			return
		}
		// Track worktree in spike.db (non-blocking on error).
		worktreeID := repoID + ":" + commitSHA
		if s.spikeStore != nil {
			if dbErr := s.spikeStore.UpsertWorktree(runCtx, spikedb.Worktree{
				WorktreeID:   worktreeID,
				RepoID:       repoID,
				RefName:      ref,
				CommitSHA:    commitSHA,
				WorktreePath: worktreeState.Path,
				Status:       "ready",
			}); dbErr != nil {
				fmt.Fprintf(os.Stderr, "warn: track worktree: %v\n", dbErr)
			}
			// Increment mirror ref_count if worktree was newly created.
			if worktreeState.Created {
				if dbErr := s.spikeStore.IncrementMirrorRefCount(runCtx, mirrorID, 1); dbErr != nil {
					fmt.Fprintf(os.Stderr, "warn: increment mirror ref_count: %v\n", dbErr)
				}
			}
		}
		if _, err := s.control.UpsertRepository(repoID, remoteURLPublic); err != nil {
			failJob(err)
			return
		}
		if _, err := s.control.UpsertRepoRef(repoID, ref, commitSHA); err != nil {
			failJob(err)
			return
		}

		treeReinitialized := false
		needsTreeInit := false
		status, err := entry.oracle.Status(runCtx, treeID)
		if err != nil {
			if errors.Is(err, prlmtree.ErrTreeNotFound) {
				needsTreeInit = true
			} else {
				failJob(err)
				return
			}
		} else if !samePath(status.RootPath, worktreeState.Path) {
			needsTreeInit = true
		}
		if needsTreeInit {
			capacity := 120000
			if entry.capacity > 0 {
				capacity = entry.capacity
			}
			if _, err := entry.oracle.Init(runCtx, treeID, worktreeState.Path, capacity); err != nil {
				failJob(err)
				return
			}
			treeReinitialized = true
		}
		treeVersionStatus := "syncing"
		if task.Hydrate {
			treeVersionStatus = "hydrating"
		}
		treeVersion, err = s.control.EnsureTreeVersion(control.TreeVersionInput{
			TreeID:    treeID,
			RepoID:    repoID,
			RefName:   ref,
			CommitSHA: commitSHA,
			RootPath:  worktreeState.Path,
			Status:    treeVersionStatus,
		})
		if err != nil {
			failJob(err)
			return
		}

		remoteSource := "request"
		if connectorSource != "" {
			remoteSource = connectorSource
		}
		result["git"] = map[string]any{
			"remote_url":         remoteURLPublic,
			"remote_source":      remoteSource,
			"ref":                ref,
			"repo_id":            repoID,
			"commit_sha":         commitSHA,
			"mirror_path":        mirrorState.Path,
			"mirror_created":     mirrorState.Created,
			"worktree_path":      worktreeState.Path,
			"worktree_created":   worktreeState.Created,
			"tree_reinitialized": treeReinitialized,
		}
		result["tree_version"] = map[string]any{
			"id":         treeVersion.ID,
			"tree_id":    treeVersion.TreeID,
			"repo_id":    treeVersion.RepoID,
			"ref_name":   treeVersion.RefName,
			"commit_sha": treeVersion.CommitSHA,
			"root_path":  treeVersion.RootPath,
			"status":     treeVersion.Status,
		}
	}

	syncReport, err := entry.oracle.Sync(runCtx, treeID)
	if err != nil {
		failJob(err)
		return
	}
	var hydrateReport *prlmtree.HydrateReport
	if task.Hydrate {
		hydrateReport, err = entry.oracle.Hydrate(runCtx, treeID)
		if err != nil {
			failJob(err)
			return
		}
	}
	if treeVersion != nil {
		finalStatus := "synced"
		if task.Hydrate {
			finalStatus = "hydrated"
		}
		if err := s.control.SetTreeVersionStatus(treeVersion.ID, finalStatus, ""); err != nil {
			failJob(err)
			return
		}
		result["tree_version"] = map[string]any{
			"id":         treeVersion.ID,
			"tree_id":    treeVersion.TreeID,
			"repo_id":    treeVersion.RepoID,
			"ref_name":   treeVersion.RefName,
			"commit_sha": treeVersion.CommitSHA,
			"root_path":  treeVersion.RootPath,
			"status":     finalStatus,
		}
	}

	result["sync_report"] = syncReport
	if hydrateReport != nil {
		result["hydrate_report"] = hydrateReport
	}
	_ = s.control.CompleteJob(task.JobID, result)
}

func (s *oracleServer) handleAsk(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req askRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	req.TreeID = strings.TrimSpace(req.TreeID)
	req.Query = strings.TrimSpace(req.Query)
	if req.TreeID == "" || req.Query == "" {
		http.Error(w, "tree_id and query are required", http.StatusBadRequest)
		return
	}

	s.mu.RLock()
	tree := s.trees[req.TreeID]
	s.mu.RUnlock()
	if tree == nil {
		http.Error(w, "tree not found", http.StatusNotFound)
		return
	}

	ctx := r.Context()
	cancel := func() {}
	if s.askTimeout > 0 {
		ctx, cancel = context.WithTimeout(ctx, s.askTimeout)
	}
	defer cancel()

	if s.askSem != nil {
		select {
		case s.askSem <- struct{}{}:
			defer func() { <-s.askSem }()
		case <-ctx.Done():
			writeAskError(w, ctx.Err())
			return
		}
	}

	requestID := "req-" + uuid.NewString()
	answer, err := tree.oracle.AskWithOptions(ctx, req.TreeID, req.Query, prlmtree.AskOptions{
		RequestID: requestID,
	})
	if err != nil {
		writeAskError(w, err)
		return
	}
	resp := askResponse{
		TreeID:    answer.TreeID,
		Query:     answer.Query,
		Content:   strings.TrimSpace(answer.Content),
		Visited:   answer.Visited,
		RequestID: requestID,
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *oracleServer) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	s.mu.RLock()
	entries := make([]*servedTree, 0, len(s.trees))
	for _, entry := range s.trees {
		entries = append(entries, entry)
	}
	s.mu.RUnlock()

	resp := statusResponse{Trees: make([]servedTreeStatus, 0, len(entries))}
	for _, entry := range entries {
		if entry == nil || entry.oracle == nil {
			continue
		}
		status, err := entry.oracle.Status(context.Background(), entry.treeID)
		if err != nil {
			continue
		}
		row := servedTreeStatus{
			TreeID:     status.TreeID,
			RootPath:   status.RootPath,
			NodeCount:  status.NodeCount,
			CleanCount: status.CleanCount,
		}
		resp.Trees = append(resp.Trees, row)
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *oracleServer) handleSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.control == nil {
		http.Error(w, "control store is not configured", http.StatusInternalServerError)
		return
	}
	var req syncRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	treeID, job, err := s.enqueueSyncJob(req)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{
		"ok":      true,
		"tree_id": treeID,
		"job_id":  job.ID,
		"status":  "queued",
	})
}

func (s *oracleServer) enqueueSyncJob(req syncRequest) (string, *control.Job, error) {
	if s == nil || s.control == nil {
		return "", nil, fmt.Errorf("control store is not configured")
	}
	treeID, entry, err := s.resolveServedTreeWithID(req.TreeID)
	if err != nil {
		return "", nil, err
	}
	if entry.oracle == nil {
		return "", nil, fmt.Errorf("oracle runtime is not available for served tree")
	}
	job, err := s.control.CreateJob(treeID, "sync", req)
	if err != nil {
		return "", nil, err
	}
	s.mu.RLock()
	syncQueue := s.syncJobs
	s.mu.RUnlock()
	if syncQueue == nil {
		_ = s.control.FailJob(job.ID, errSyncQueueUnavailable.Error())
		return "", nil, errSyncQueueUnavailable
	}
	task := syncJobTask{
		JobID:     job.ID,
		TreeID:    treeID,
		Hydrate:   req.Hydrate,
		RepoID:    strings.TrimSpace(req.RepoID),
		RemoteURL: strings.TrimSpace(req.RemoteURL),
		Ref:       strings.TrimSpace(req.Ref),
	}
	select {
	case syncQueue <- task:
		return treeID, job, nil
	default:
		_ = s.control.FailJob(job.ID, errSyncQueueFull.Error())
		return "", nil, errSyncQueueFull
	}
}

func (s *oracleServer) handleGitHubInstallationsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.spikeStore == nil {
		http.Error(w, "spike store is not configured", http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	installations, err := s.spikeStore.ListGitHubInstallations(ctx)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":            true,
		"installations": installations,
	})
}

func (s *oracleServer) handleGitHubInstallationsGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.spikeStore == nil {
		http.Error(w, "spike store is not configured", http.StatusInternalServerError)
		return
	}

	var req struct {
		InstallationID int64 `json:"installation_id"`
	}
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.InstallationID <= 0 {
		http.Error(w, "installation_id is required", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	installation, err := s.spikeStore.GetGitHubInstallation(ctx, req.InstallationID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"installation": installation,
	})
}

func (s *oracleServer) handleGitHubConnectorRemove(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.control == nil {
		http.Error(w, "control store is not configured", http.StatusInternalServerError)
		return
	}

	var req githubConnectorRemoveRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	treeID, _, err := s.resolveServedTreeWithID(req.TreeID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	if err := s.control.RemoveGitHubConnectorBinding(treeID); err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"tree_id": treeID,
		"removed": true,
	})
}

func (s *oracleServer) handleGitHubWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s == nil || s.control == nil {
		http.Error(w, "control store is not configured", http.StatusInternalServerError)
		return
	}
	secret := strings.TrimSpace(s.githubWebhookSecret)
	if secret == "" {
		http.Error(w, "github webhook secret is not configured", http.StatusServiceUnavailable)
		return
	}

	event := strings.TrimSpace(r.Header.Get("X-GitHub-Event"))
	deliveryID := strings.TrimSpace(r.Header.Get("X-GitHub-Delivery"))
	signature := strings.TrimSpace(r.Header.Get("X-Hub-Signature-256"))
	if event == "" || deliveryID == "" {
		http.Error(w, "missing github webhook headers", http.StatusBadRequest)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed reading webhook body", http.StatusBadRequest)
		return
	}
	if !verifyGitHubWebhookSignature(secret, body, signature) {
		http.Error(w, "invalid github webhook signature", http.StatusUnauthorized)
		return
	}

	treeHint := strings.TrimSpace(r.URL.Query().Get("tree_id"))
	if treeHint == "" {
		treeHint = strings.TrimSpace(r.Header.Get("X-Spike-Tree-ID"))
	}
	treeID, _, err := s.resolveServedTreeWithID(treeHint)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}

	payloadHash := sha256.Sum256(body)
	delivery, created, err := s.control.UpsertWebhookDeliveryReceived(deliveryID, event, treeID, fmt.Sprintf("%x", payloadHash[:]))
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	if !created {
		writeJSON(w, http.StatusAccepted, map[string]any{
			"ok":          true,
			"event":       event,
			"delivery_id": deliveryID,
			"duplicate":   true,
			"delivery":    delivery,
		})
		return
	}

	syncRequests, ignored, mapErr := mapGitHubWebhookSyncRequests(event, treeID, body)
	if mapErr != nil {
		_ = s.control.UpdateWebhookDelivery(deliveryID, "failed", "[]", mapErr.Error())
		writeControlPlaneError(w, mapErr)
		return
	}
	if ignored || len(syncRequests) == 0 {
		_ = s.control.UpdateWebhookDelivery(deliveryID, "ignored", "[]", "")
		writeJSON(w, http.StatusAccepted, githubWebhookResponse{
			OK:         true,
			Event:      event,
			DeliveryID: deliveryID,
			Ignored:    true,
		})
		return
	}

	queued := make([]githubWebhookQueuedJob, 0, len(syncRequests))
	jobIDs := make([]string, 0, len(syncRequests))
	for _, req := range syncRequests {
		queuedTreeID, job, enqueueErr := s.enqueueSyncJob(req)
		if enqueueErr != nil {
			_ = s.control.UpdateWebhookDelivery(deliveryID, "failed", marshalJSONOr(jobIDs, "[]"), enqueueErr.Error())
			writeControlPlaneError(w, enqueueErr)
			return
		}
		jobIDs = append(jobIDs, job.ID)
		queued = append(queued, githubWebhookQueuedJob{
			TreeID: queuedTreeID,
			JobID:  job.ID,
			RepoID: strings.TrimSpace(req.RepoID),
			Ref:    strings.TrimSpace(req.Ref),
		})
	}
	_ = s.control.UpdateWebhookDelivery(deliveryID, "queued", marshalJSONOr(jobIDs, "[]"), "")
	writeJSON(w, http.StatusAccepted, githubWebhookResponse{
		OK:         true,
		Event:      event,
		DeliveryID: deliveryID,
		QueuedJobs: queued,
	})
}

func marshalJSONOr(v any, fallback string) string {
	raw, err := json.Marshal(v)
	if err != nil {
		return fallback
	}
	out := strings.TrimSpace(string(raw))
	if out == "" {
		return fallback
	}
	return out
}

func verifyGitHubWebhookSignature(secret string, body []byte, header string) bool {
	secret = strings.TrimSpace(secret)
	header = strings.TrimSpace(header)
	if secret == "" || header == "" {
		return false
	}
	const prefix = "sha256="
	if !strings.HasPrefix(strings.ToLower(header), prefix) {
		return false
	}
	givenHex := strings.TrimSpace(header[len(prefix):])
	given, err := hex.DecodeString(givenHex)
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	expected := mac.Sum(nil)
	return hmac.Equal(expected, given)
}

func mapGitHubWebhookSyncRequests(event string, treeID string, body []byte) ([]syncRequest, bool, error) {
	event = strings.TrimSpace(strings.ToLower(event))
	treeID = strings.TrimSpace(treeID)
	if treeID == "" {
		return nil, false, fmt.Errorf("tree_id is required")
	}
	switch event {
	case "push":
		var payload githubPushPayload
		if err := json.Unmarshal(body, &payload); err != nil {
			return nil, false, fmt.Errorf("decode push payload: %w", err)
		}
		req, ok := makeSyncRequestFromRepo(treeID, payload.Repository, payload.Ref)
		if !ok {
			return nil, false, fmt.Errorf("push payload missing repository identity")
		}
		return []syncRequest{req}, false, nil

	case "pull_request":
		var payload githubPullRequestPayload
		if err := json.Unmarshal(body, &payload); err != nil {
			return nil, false, fmt.Errorf("decode pull_request payload: %w", err)
		}
		action := strings.TrimSpace(strings.ToLower(payload.Action))
		if action != "opened" && action != "synchronize" && action != "reopened" {
			return nil, true, nil
		}
		repo := payload.PullRequest.Head.Repo
		if strings.TrimSpace(repo.FullName) == "" {
			repo = payload.Repository
		}
		req, ok := makeSyncRequestFromRepo(treeID, repo, normalizeGitRef(payload.PullRequest.Head.Ref))
		if !ok {
			return nil, false, fmt.Errorf("pull_request payload missing repository identity")
		}
		return []syncRequest{req}, false, nil

	case "installation.created":
		var payload githubInstallationPayload
		if err := json.Unmarshal(body, &payload); err != nil {
			return nil, false, fmt.Errorf("decode installation.created payload: %w", err)
		}
		return mapInstallationReposToSync(treeID, payload.Repositories), false, nil

	case "installation_repositories":
		var payload githubInstallationPayload
		if err := json.Unmarshal(body, &payload); err != nil {
			return nil, false, fmt.Errorf("decode installation_repositories payload: %w", err)
		}
		return mapInstallationReposToSync(treeID, payload.RepositoriesAdded), false, nil

	default:
		return nil, true, nil
	}
}

func mapInstallationReposToSync(treeID string, repos []githubRepositoryPayload) []syncRequest {
	out := make([]syncRequest, 0, len(repos))
	for _, repo := range repos {
		ref := normalizeGitRef(repo.DefaultBranch)
		req, ok := makeSyncRequestFromRepo(treeID, repo, ref)
		if !ok {
			continue
		}
		out = append(out, req)
	}
	return out
}

func makeSyncRequestFromRepo(treeID string, repo githubRepositoryPayload, ref string) (syncRequest, bool) {
	treeID = strings.TrimSpace(treeID)
	repoID := strings.TrimSpace(strings.ToLower(repo.FullName))
	remoteURL := strings.TrimSpace(repo.CloneURL)
	ref = normalizeGitRef(ref)
	if treeID == "" || repoID == "" || remoteURL == "" || ref == "" {
		return syncRequest{}, false
	}
	return syncRequest{
		TreeID:    treeID,
		RepoID:    repoID,
		RemoteURL: remoteURL,
		Ref:       ref,
		Hydrate:   false,
	}, true
}

func normalizeGitRef(ref string) string {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return ""
	}
	if strings.HasPrefix(ref, "refs/") {
		return ref
	}
	return "refs/heads/" + strings.TrimPrefix(ref, "heads/")
}

func (s *oracleServer) handleJobsGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.control == nil {
		http.Error(w, "control store is not configured", http.StatusInternalServerError)
		return
	}
	var req jobsGetRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	job, err := s.control.GetJob(strings.TrimSpace(req.JobID))
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"job": job,
	})
}

func (s *oracleServer) handleJobsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.control == nil {
		http.Error(w, "control store is not configured", http.StatusInternalServerError)
		return
	}
	var req jobsListRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	jobs, err := s.control.ListJobs(control.JobFilter{
		TreeID: strings.TrimSpace(req.TreeID),
		Status: strings.TrimSpace(req.Status),
		Limit:  req.Limit,
	})
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"jobs": jobs,
	})
}

func (s *oracleServer) handleTreeVersionsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.control == nil {
		http.Error(w, "control store is not configured", http.StatusInternalServerError)
		return
	}
	var req treeVersionsListRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	treeVersions, err := s.control.ListTreeVersions(control.TreeVersionFilter{
		TreeID:    strings.TrimSpace(req.TreeID),
		RepoID:    strings.TrimSpace(req.RepoID),
		RefName:   strings.TrimSpace(req.RefName),
		CommitSHA: strings.TrimSpace(req.CommitSHA),
		Status:    strings.TrimSpace(req.Status),
		Limit:     req.Limit,
	})
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"tree_versions": treeVersions,
	})
}

func (s *oracleServer) handleRepositoryGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.control == nil {
		http.Error(w, "control store is not configured", http.StatusInternalServerError)
		return
	}
	var req repositoryGetRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	repository, err := s.control.GetRepository(strings.TrimSpace(req.RepoID))
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"repository": repository,
	})
}

func (s *oracleServer) handleRepositoriesList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.control == nil {
		http.Error(w, "control store is not configured", http.StatusInternalServerError)
		return
	}
	var req repositoriesListRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	repositories, err := s.control.ListRepositories(control.RepositoryFilter{
		RepoID: strings.TrimSpace(req.RepoID),
		Limit:  req.Limit,
	})
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"repositories": repositories,
	})
}

func (s *oracleServer) handleMirrorsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.spikeStore == nil {
		http.Error(w, "spike store is not configured", http.StatusInternalServerError)
		return
	}
	mirrors, err := s.spikeStore.ListMirrors(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"mirrors": mirrors})
}

func (s *oracleServer) handleWorktreesList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.spikeStore == nil {
		http.Error(w, "spike store is not configured", http.StatusInternalServerError)
		return
	}
	worktrees, err := s.spikeStore.ListWorktrees(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"worktrees": worktrees})
}

func (s *oracleServer) handleIndexesCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var payload map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	result, err := s.nexIndexesCreate(payload)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *oracleServer) handleIndexesList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var payload map[string]interface{}
	if r.Method == http.MethodPost {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	} else {
		payload = map[string]interface{}{}
	}
	result, err := s.nexIndexesList(payload)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *oracleServer) handleIndexesGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var payload map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	result, err := s.nexIndexesGet(payload)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *oracleServer) handleIndexesDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var payload map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	result, err := s.nexIndexesDelete(payload)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *oracleServer) handleIndexesStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var payload map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	result, err := s.nexIndexesStatus(payload)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *oracleServer) handleConfigDefaults(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var payload map[string]interface{}
	if r.Method == http.MethodPost {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	} else {
		payload = map[string]interface{}{}
	}
	result, err := s.nexConfigDefaults(payload)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *oracleServer) handleConfigGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var payload map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	result, err := s.nexConfigGet(payload)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *oracleServer) handleConfigUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var payload map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	result, err := s.nexConfigUpdate(payload)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *oracleServer) handleRepoRefsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.control == nil {
		http.Error(w, "control store is not configured", http.StatusInternalServerError)
		return
	}
	var req repoRefsListRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	repoRefs, err := s.control.ListRepoRefs(control.RepoRefFilter{
		RepoID:    strings.TrimSpace(req.RepoID),
		RefName:   strings.TrimSpace(req.RefName),
		CommitSHA: strings.TrimSpace(req.CommitSHA),
		Limit:     req.Limit,
	})
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"repo_refs": repoRefs,
	})
}

func (s *oracleServer) handleRepoRefGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.control == nil {
		http.Error(w, "control store is not configured", http.StatusInternalServerError)
		return
	}
	var req repoRefGetRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	repoRef, err := s.control.GetRepoRef(strings.TrimSpace(req.RepoID), strings.TrimSpace(req.RefName))
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"repo_ref": repoRef,
	})
}

func (s *oracleServer) handleTreeVersionGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.control == nil {
		http.Error(w, "control store is not configured", http.StatusInternalServerError)
		return
	}
	var req treeVersionGetRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	treeVersion, err := s.control.GetTreeVersion(strings.TrimSpace(req.ID))
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"tree_version": treeVersion,
	})
}

func (s *oracleServer) handleAskRequestsGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req askRequestsGetRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	row, err := s.getAskRequest(req.TreeID, req.RequestID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ask_request": row,
	})
}

func (s *oracleServer) handleAskRequestsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req askRequestsListRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	rows, err := s.listAskRequests(req)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ask_requests": rows,
	})
}

func (s *oracleServer) handleAskRequestsInspect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req askRequestsInspectRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	askRow, err := s.getAskRequest(req.TreeID, req.RequestID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	rootTurn, rootMessages, rootToolCalls, rootSession, err := s.inspectAskRoot(req.TreeID, askRow.RootTurnID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ask_request":     askRow,
		"root_turn":       rootTurn,
		"root_messages":   rootMessages,
		"root_tool_calls": rootToolCalls,
		"root_session":    rootSession,
	})
}

func (s *oracleServer) handleAskRequestsTimeline(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req askRequestsTimelineRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	askRow, err := s.getAskRequest(req.TreeID, req.RequestID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	requestToken := sanitizeAskRequestToken(req.RequestID)
	if requestToken == "" {
		writeControlPlaneError(w, fmt.Errorf("request_id is required"))
		return
	}
	nodes, err := s.buildAskTimeline(req.TreeID, askRow, requestToken, req.Limit)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ask_request":    askRow,
		"request_token":  requestToken,
		"timeline_nodes": nodes,
	})
}

func (s *oracleServer) handleSessionsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req sessionsListRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	br, err := s.resolveTreeBroker(req.TreeID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	sessions, err := br.ListSessions(broker.SessionFilter{
		PersonaID:     strings.TrimSpace(req.PersonaID),
		Status:        strings.TrimSpace(req.Status),
		Origin:        strings.TrimSpace(req.Origin),
		ScopeKey:      strings.TrimSpace(req.ScopeKey),
		RefName:       strings.TrimSpace(req.RefName),
		CommitSHA:     strings.TrimSpace(req.CommitSHA),
		TreeFlavor:    strings.TrimSpace(req.TreeFlavor),
		TreeVersionID: strings.TrimSpace(req.TreeVersionID),
		Limit:         req.Limit,
	})
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": sessions})
}

func (s *oracleServer) handleSessionsResolve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req sessionsResolveRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	br, err := s.resolveTreeBroker(req.TreeID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	label, err := br.ResolveSessionLabel(req.Key)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":  true,
		"key": label,
	})
}

func (s *oracleServer) handleSessionsPreview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req sessionsPreviewRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	br, err := s.resolveTreeBroker(req.TreeID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	previews, err := br.PreviewSessions(req.Keys, req.Limit, req.MaxChars)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"previews": previews})
}

func (s *oracleServer) handleSessionsPatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req sessionsPatchRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	br, err := s.resolveTreeBroker(req.TreeID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	label, err := br.PatchSession(req.Key, broker.SessionPatch{
		PersonaID:       req.PersonaID,
		TaskDescription: req.TaskDescription,
		TaskStatus:      req.TaskStatus,
		RoutingKey:      req.RoutingKey,
		Status:          req.Status,
	})
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":   true,
		"path": "agents-ledger",
		"key":  label,
		"entry": map[string]any{
			"sessionId": label,
			"updatedAt": time.Now().UnixMilli(),
		},
	})
}

func (s *oracleServer) handleSessionsReset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req sessionsKeyRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	br, err := s.resolveTreeBroker(req.TreeID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	label, err := br.ResetSession(req.Key)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":  true,
		"key": label,
		"entry": map[string]any{
			"sessionId": label,
			"updatedAt": time.Now().UnixMilli(),
		},
	})
}

func (s *oracleServer) handleSessionsDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req sessionsKeyRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	br, err := s.resolveTreeBroker(req.TreeID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	label, err := br.DeleteSession(req.Key)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"key":      label,
		"deleted":  true,
		"archived": []any{},
	})
}

func (s *oracleServer) handleSessionsCompact(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req sessionsCompactRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	br, err := s.resolveTreeBroker(req.TreeID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	label, compact, err := br.CompactSession(r.Context(), req.Key, req.Instructions)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"key":        label,
		"compacted":  true,
		"compaction": compact,
	})
}

func (s *oracleServer) handleSessionsImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req sessionsImportRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	br, err := s.resolveTreeBroker(req.TreeID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	if len(req.Items) == 0 {
		writeControlPlaneError(w, fmt.Errorf("items required"))
		return
	}
	importResp, err := br.RunSessionsImport(broker.SessionsImportRequest{
		Source:         strings.TrimSpace(req.Source),
		RunID:          strings.TrimSpace(req.RunID),
		Mode:           strings.TrimSpace(req.Mode),
		PersonaID:      strings.TrimSpace(req.PersonaID),
		IdempotencyKey: strings.TrimSpace(req.IdempotencyKey),
		Items:          req.Items,
	}, broker.SessionsImportOptions{
		PersonaID: strings.TrimSpace(req.PersonaID),
	})
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       importResp.OK,
		"runId":    importResp.RunID,
		"imported": importResp.Imported,
		"upserted": importResp.Upserted,
		"skipped":  importResp.Skipped,
		"failed":   importResp.Failed,
		"results":  importResp.Results,
	})
}

func (s *oracleServer) handleSessionsImportChunk(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req sessionsImportChunkRequest
	if err := decodeJSONBody(r, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	br, err := s.resolveTreeBroker(req.TreeID)
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}

	personaID := strings.TrimSpace(req.PersonaID)
	chunkResp, err := br.RunSessionsImportChunk(broker.SessionsImportChunkRequest{
		Source:                   strings.TrimSpace(req.Source),
		RunID:                    strings.TrimSpace(req.RunID),
		Mode:                     strings.TrimSpace(req.Mode),
		PersonaID:                personaID,
		IdempotencyKey:           strings.TrimSpace(req.IdempotencyKey),
		UploadID:                 strings.TrimSpace(req.UploadID),
		ChunkIndex:               req.ChunkIndex,
		ChunkTotal:               req.ChunkTotal,
		Encoding:                 strings.TrimSpace(req.Encoding),
		Data:                     strings.TrimSpace(req.Data),
		SourceProvider:           strings.TrimSpace(req.SourceProvider),
		SourceSessionID:          strings.TrimSpace(req.SourceSessionID),
		SourceSessionFingerprint: strings.TrimSpace(req.SourceSessionFingerprint),
	}, broker.SessionsImportOptions{
		PersonaID: personaID,
	})
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}

	resp := map[string]any{
		"ok":       true,
		"runId":    chunkResp.RunID,
		"uploadId": chunkResp.UploadID,
		"status":   chunkResp.Status,
		"received": chunkResp.Received,
		"total":    chunkResp.Total,
	}
	if chunkResp.Import != nil {
		resp["import"] = map[string]any{
			"ok":       chunkResp.Import.OK,
			"runId":    chunkResp.Import.RunID,
			"imported": chunkResp.Import.Imported,
			"upserted": chunkResp.Import.Upserted,
			"skipped":  chunkResp.Import.Skipped,
			"failed":   chunkResp.Import.Failed,
			"results":  chunkResp.Import.Results,
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *oracleServer) resolveServedTree(treeID string) (*servedTree, error) {
	_, entry, err := s.resolveServedTreeWithID(treeID)
	return entry, err
}

func (s *oracleServer) resolveServedTreeWithID(treeID string) (string, *servedTree, error) {
	treeID = strings.TrimSpace(treeID)

	s.mu.RLock()
	defer s.mu.RUnlock()

	if treeID != "" {
		entry := s.trees[treeID]
		if entry == nil {
			return "", nil, errServeTreeNotFound
		}
		return treeID, entry, nil
	}

	if len(s.trees) == 1 {
		for id, entry := range s.trees {
			if entry != nil {
				return id, entry, nil
			}
		}
	}
	if len(s.trees) == 0 {
		return "", nil, errServeTreeNotFound
	}
	return "", nil, errServeTreeRequired
}

func (s *oracleServer) resolveTreeBroker(treeID string) (*broker.Broker, error) {
	resolvedTreeID, entry, err := s.resolveServedTreeWithID(treeID)
	if err != nil {
		return nil, err
	}
	if entry == nil {
		return nil, fmt.Errorf("served tree runtime is not available")
	}
	if entry.broker != nil {
		return entry.broker, nil
	}
	if entry.oracle == nil {
		return nil, fmt.Errorf("broker runtime is not available for served tree")
	}
	runtimeBroker, err := entry.oracle.BrokerForTree(context.Background(), resolvedTreeID)
	if err != nil {
		if errors.Is(err, prlmtree.ErrTreeNotFound) {
			return nil, fmt.Errorf("tree %s is not initialized yet; run /sync with git binding first", resolvedTreeID)
		}
		return nil, err
	}

	s.mu.Lock()
	if existing := s.trees[resolvedTreeID]; existing != nil {
		if existing.broker == nil {
			existing.broker = runtimeBroker
		} else {
			runtimeBroker = existing.broker
		}
	}
	s.mu.Unlock()
	return runtimeBroker, nil
}

func (s *oracleServer) resolveTreeStoreDB(treeID string) (*sql.DB, error) {
	entry, err := s.resolveServedTree(treeID)
	if err != nil {
		return nil, err
	}
	if entry == nil || entry.store == nil || entry.store.DB() == nil {
		return nil, fmt.Errorf("runtime store is not available for served tree")
	}
	return entry.store.DB(), nil
}

func (s *oracleServer) getAskRequest(treeID string, requestID string) (*askRequestRecord, error) {
	db, err := s.resolveTreeStoreDB(strings.TrimSpace(treeID))
	if err != nil {
		return nil, err
	}
	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return nil, fmt.Errorf("request_id is required")
	}
	row := db.QueryRow(`
		SELECT request_id, tree_id, scope_key, ref_name, commit_sha, tree_flavor, tree_version_id,
		       query_text, status, root_turn_id, answer_preview, error_code, error_message,
		       created_at, completed_at
		FROM ask_requests
		WHERE request_id = ?
	`, requestID)
	return scanAskRequestRecord(row)
}

func (s *oracleServer) listAskRequests(req askRequestsListRequest) ([]*askRequestRecord, error) {
	db, err := s.resolveTreeStoreDB(strings.TrimSpace(req.TreeID))
	if err != nil {
		return nil, err
	}
	where := make([]string, 0, 5)
	args := make([]any, 0, 6)
	if v := strings.TrimSpace(strings.ToLower(req.Status)); v != "" {
		where = append(where, "status = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(req.ScopeKey); v != "" {
		where = append(where, "scope_key = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(req.RefName); v != "" {
		where = append(where, "ref_name = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(strings.ToLower(req.CommitSHA)); v != "" {
		where = append(where, "commit_sha = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(req.TreeVersionID); v != "" {
		where = append(where, "tree_version_id = ?")
		args = append(args, v)
	}
	q := `
		SELECT request_id, tree_id, scope_key, ref_name, commit_sha, tree_flavor, tree_version_id,
		       query_text, status, root_turn_id, answer_preview, error_code, error_message,
		       created_at, completed_at
		FROM ask_requests
	`
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	q += " ORDER BY created_at DESC LIMIT ?"
	limit := req.Limit
	if limit <= 0 {
		limit = 50
	}
	args = append(args, limit)
	rows, err := db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]*askRequestRecord, 0)
	for rows.Next() {
		row, scanErr := scanAskRequestRecord(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *oracleServer) inspectAskRoot(treeID string, rootTurnID string) (*askInspectorTurn, []askInspectorMessage, []askInspectorToolCall, *askInspectorSession, error) {
	rootTurnID = strings.TrimSpace(rootTurnID)
	if rootTurnID == "" {
		return nil, []askInspectorMessage{}, []askInspectorToolCall{}, nil, nil
	}
	br, err := s.resolveTreeBroker(strings.TrimSpace(treeID))
	if err != nil {
		return nil, nil, nil, nil, err
	}

	var (
		turn     *askInspectorTurn
		messages = make([]askInspectorMessage, 0)
		calls    = make([]askInspectorToolCall, 0)
		session  *askInspectorSession
	)

	ledgerTurn, ledgerMessages, ledgerCalls, err := br.GetTurnDetails(rootTurnID)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			return nil, nil, nil, nil, err
		}
	} else {
		turn = toAskInspectorTurn(ledgerTurn)
		for _, msg := range ledgerMessages {
			if msg == nil {
				continue
			}
			messages = append(messages, toAskInspectorMessage(msg))
		}
		for _, call := range ledgerCalls {
			if call == nil {
				continue
			}
			calls = append(calls, toAskInspectorToolCall(call))
		}
	}

	label, err := br.ResolveSessionLabel(rootTurnID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return turn, messages, calls, nil, nil
		}
		return nil, nil, nil, nil, err
	}
	ledgerSession, err := br.GetSession(label)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return turn, messages, calls, nil, nil
		}
		return nil, nil, nil, nil, err
	}
	session = toAskInspectorSession(ledgerSession)
	return turn, messages, calls, session, nil
}

func (s *oracleServer) buildAskTimeline(treeID string, askRow *askRequestRecord, requestToken string, limit int) ([]askTimelineNode, error) {
	sessions, err := s.listAskTimelineSessions(treeID, askRow, requestToken, limit)
	if err != nil {
		return nil, err
	}
	br, err := s.resolveTreeBroker(strings.TrimSpace(treeID))
	if err != nil {
		return nil, err
	}

	nodes := make([]askTimelineNode, 0, len(sessions))
	for _, session := range sessions {
		nodeID := askTimelineNodeIDFromLabel(session.Label)
		node := askTimelineNode{
			NodeID:        nodeID,
			Depth:         askTimelineDepth(nodeID),
			IsRoot:        strings.TrimSpace(session.ThreadID) != "" && strings.TrimSpace(session.ThreadID) == strings.TrimSpace(askRow.RootTurnID),
			SessionLabel:  session.Label,
			ThreadID:      session.ThreadID,
			SessionStatus: session.Status,
			CreatedAt:     session.CreatedAt,
			UpdatedAt:     session.UpdatedAt,
		}
		turnID := strings.TrimSpace(session.ThreadID)
		if turnID != "" {
			turn, messages, calls, err := br.GetTurnDetails(turnID)
			if err != nil {
				if !errors.Is(err, sql.ErrNoRows) {
					return nil, err
				}
			} else {
				node.Turn = &askTimelineTurnSummary{
					ID:            turn.ID,
					ParentTurnID:  turn.ParentTurnID,
					Status:        turn.Status,
					StartedAt:     turn.StartedAt,
					CompletedAt:   turn.CompletedAt,
					TotalTokens:   turn.TotalTokens,
					ToolCallCount: turn.ToolCallCount,
				}
				node.MessageCount = len(messages)
				node.ToolCallCount = len(calls)
				node.AssistantPreview = summarizeAssistantPreview(messages)
			}
		}
		nodes = append(nodes, node)
	}
	sort.Slice(nodes, func(i, j int) bool {
		if nodes[i].Depth != nodes[j].Depth {
			return nodes[i].Depth < nodes[j].Depth
		}
		if nodes[i].NodeID != nodes[j].NodeID {
			return nodes[i].NodeID < nodes[j].NodeID
		}
		return nodes[i].UpdatedAt.Before(nodes[j].UpdatedAt)
	})
	return nodes, nil
}

func (s *oracleServer) listAskTimelineSessions(treeID string, askRow *askRequestRecord, requestToken string, limit int) ([]askTimelineSessionRow, error) {
	db, err := s.resolveTreeStoreDB(strings.TrimSpace(treeID))
	if err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 256
	}
	if limit > 2000 {
		limit = 2000
	}

	where := []string{"origin = 'ask'"}
	args := make([]any, 0, 5)
	treeVersionID := ""
	scopeKey := ""
	if askRow != nil {
		treeVersionID = strings.TrimSpace(askRow.TreeVersionID)
		scopeKey = strings.TrimSpace(askRow.ScopeKey)
	}
	if treeVersionID != "" {
		where = append(where, "label LIKE ?")
		args = append(args, treeVersionID+":%:stateless:"+requestToken+":%")
	} else {
		where = append(where, "label LIKE ?")
		args = append(args, "%:stateless:"+requestToken+":%")
	}
	if scopeKey != "" {
		where = append(where, "scope_key = ?")
		args = append(args, scopeKey)
	}

	query := `
		SELECT label, thread_id, status, created_at, updated_at
		FROM sessions
		WHERE ` + strings.Join(where, " AND ") + `
		ORDER BY updated_at ASC
		LIMIT ?
	`
	args = append(args, limit)
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]askTimelineSessionRow, 0)
	for rows.Next() {
		var (
			row         askTimelineSessionRow
			threadID    sql.NullString
			createdAtMS int64
			updatedAtMS int64
		)
		if err := rows.Scan(&row.Label, &threadID, &row.Status, &createdAtMS, &updatedAtMS); err != nil {
			return nil, err
		}
		if threadID.Valid {
			row.ThreadID = strings.TrimSpace(threadID.String)
		}
		row.CreatedAt = fromUnixMilli(createdAtMS)
		row.UpdatedAt = fromUnixMilli(updatedAtMS)
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func sanitizeAskRequestToken(raw string) string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		return ""
	}
	var b strings.Builder
	lastDash := false
	for _, r := range raw {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if r == '-' || r == '_' {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func askTimelineNodeIDFromLabel(label string) string {
	parts := strings.Split(strings.TrimSpace(label), ":")
	if len(parts) < 2 {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func askTimelineDepth(nodeID string) int {
	nodeID = strings.TrimSpace(nodeID)
	if nodeID == "" {
		return 0
	}
	parts := strings.Split(nodeID, ".")
	if len(parts) <= 1 {
		return 0
	}
	return len(parts) - 1
}

func summarizeAssistantPreview(messages []*broker.LedgerMessage) string {
	for _, msg := range messages {
		if msg == nil {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(msg.Role), "assistant") {
			content := strings.TrimSpace(msg.Content)
			if content != "" {
				return truncateTimelinePreview(content, 240)
			}
		}
	}
	for _, msg := range messages {
		if msg == nil {
			continue
		}
		content := strings.TrimSpace(msg.Content)
		if content != "" {
			return truncateTimelinePreview(content, 240)
		}
	}
	return ""
}

func truncateTimelinePreview(content string, maxChars int) string {
	content = strings.TrimSpace(content)
	if content == "" {
		return ""
	}
	if maxChars <= 0 {
		return content
	}
	runes := []rune(content)
	if len(runes) <= maxChars {
		return content
	}
	if maxChars <= 3 {
		return string(runes[:maxChars])
	}
	return strings.TrimSpace(string(runes[:maxChars-3])) + "..."
}

func scanAskRequestRecord(scanner interface{ Scan(dest ...any) error }) (*askRequestRecord, error) {
	var (
		row           askRequestRecord
		createdAtMS   int64
		completedAtMS sql.NullInt64
	)
	if err := scanner.Scan(
		&row.RequestID,
		&row.TreeID,
		&row.ScopeKey,
		&row.RefName,
		&row.CommitSHA,
		&row.TreeFlavor,
		&row.TreeVersionID,
		&row.QueryText,
		&row.Status,
		&row.RootTurnID,
		&row.AnswerPreview,
		&row.ErrorCode,
		&row.ErrorMessage,
		&createdAtMS,
		&completedAtMS,
	); err != nil {
		return nil, err
	}
	row.CreatedAt = fromUnixMilli(createdAtMS)
	if completedAtMS.Valid {
		completed := fromUnixMilli(completedAtMS.Int64)
		row.CompletedAt = &completed
	}
	return &row, nil
}

func fromUnixMilli(ms int64) time.Time {
	if ms <= 0 {
		return time.Time{}
	}
	return time.UnixMilli(ms).UTC()
}

func toAskInspectorSession(s *broker.LedgerSession) *askInspectorSession {
	if s == nil {
		return nil
	}
	return &askInspectorSession{
		Label:              s.Label,
		ThreadID:           s.ThreadID,
		PersonaID:          s.PersonaID,
		IsSubagent:         s.IsSubagent,
		ParentSessionLabel: s.ParentSessionLabel,
		ParentTurnID:       s.ParentTurnID,
		SpawnToolCallID:    s.SpawnToolCallID,
		TaskDescription:    s.TaskDescription,
		TaskStatus:         s.TaskStatus,
		RoutingKey:         s.RoutingKey,
		Origin:             s.Origin,
		OriginSessionID:    s.OriginSessionID,
		ScopeKey:           s.ScopeKey,
		RefName:            s.RefName,
		CommitSHA:          s.CommitSHA,
		TreeFlavor:         s.TreeFlavor,
		TreeVersionID:      s.TreeVersionID,
		CreatedAt:          s.CreatedAt,
		UpdatedAt:          s.UpdatedAt,
		Status:             s.Status,
	}
}

func toAskInspectorTurn(t *broker.LedgerTurn) *askInspectorTurn {
	if t == nil {
		return nil
	}
	return &askInspectorTurn{
		ID:                  t.ID,
		ParentTurnID:        t.ParentTurnID,
		TurnType:            t.TurnType,
		Status:              t.Status,
		StartedAt:           t.StartedAt,
		CompletedAt:         t.CompletedAt,
		Model:               t.Model,
		Provider:            t.Provider,
		Role:                t.Role,
		ToolsetName:         t.ToolsetName,
		ToolsAvailableJSON:  t.ToolsAvailableJSON,
		EffectiveConfigJSON: t.EffectiveConfigJSON,
		InputTokens:         t.InputTokens,
		OutputTokens:        t.OutputTokens,
		CachedInputTokens:   t.CachedInputTokens,
		CacheWriteTokens:    t.CacheWriteTokens,
		ReasoningTokens:     t.ReasoningTokens,
		TotalTokens:         t.TotalTokens,
		QueryMessageIDsJSON: t.QueryMessageIDsJSON,
		ResponseMessageID:   t.ResponseMessageID,
		HasChildren:         t.HasChildren,
		ToolCallCount:       t.ToolCallCount,
		SourceEventID:       t.SourceEventID,
		WorkspacePath:       t.WorkspacePath,
		ScopeKey:            t.ScopeKey,
		RefName:             t.RefName,
		CommitSHA:           t.CommitSHA,
		TreeFlavor:          t.TreeFlavor,
		TreeVersionID:       t.TreeVersionID,
	}
}

func toAskInspectorMessage(m *broker.LedgerMessage) askInspectorMessage {
	return askInspectorMessage{
		ID:            m.ID,
		TurnID:        m.TurnID,
		Role:          m.Role,
		Content:       m.Content,
		Source:        m.Source,
		Sequence:      m.Sequence,
		CreatedAt:     m.CreatedAt,
		Thinking:      m.Thinking,
		ContextJSON:   m.ContextJSON,
		MetadataJSON:  m.MetadataJSON,
		ScopeKey:      m.ScopeKey,
		RefName:       m.RefName,
		CommitSHA:     m.CommitSHA,
		TreeFlavor:    m.TreeFlavor,
		TreeVersionID: m.TreeVersionID,
	}
}

func toAskInspectorToolCall(c *broker.LedgerToolCall) askInspectorToolCall {
	return askInspectorToolCall{
		ID:                  c.ID,
		TurnID:              c.TurnID,
		MessageID:           c.MessageID,
		ToolName:            c.ToolName,
		ToolNumber:          c.ToolNumber,
		ParamsJSON:          c.ParamsJSON,
		ResultJSON:          c.ResultJSON,
		Error:               c.Error,
		Status:              c.Status,
		SpawnedSessionLabel: c.SpawnedSessionLabel,
		StartedAt:           c.StartedAt,
		CompletedAt:         c.CompletedAt,
		Sequence:            c.Sequence,
		ScopeKey:            c.ScopeKey,
		RefName:             c.RefName,
		CommitSHA:           c.CommitSHA,
		TreeFlavor:          c.TreeFlavor,
		TreeVersionID:       c.TreeVersionID,
	}
}

func resolveSpikeDBPath(storageRoot string, override string) string {
	override = strings.TrimSpace(override)
	if override != "" && filepath.IsAbs(override) {
		return override
	}
	base := strings.TrimSpace(storageRoot)
	if base == "" {
		base = "."
	}
	if override != "" {
		return filepath.Join(base, override)
	}
	return filepath.Join(base, "spike.db")
}

func resolveGitStorageRoots(storageRoot string, mirrorsDir string, worktreesDir string) (string, string, error) {
	base := strings.TrimSpace(storageRoot)
	if base == "" {
		base = "."
	}
	var err error
	base, err = filepath.Abs(base)
	if err != nil {
		return "", "", err
	}
	mirrorsDir = strings.TrimSpace(mirrorsDir)
	if mirrorsDir == "" {
		mirrorsDir = filepath.Join(base, "git", "mirrors")
	} else if !filepath.IsAbs(mirrorsDir) {
		mirrorsDir = filepath.Join(base, mirrorsDir)
	}
	worktreesDir = strings.TrimSpace(worktreesDir)
	if worktreesDir == "" {
		worktreesDir = filepath.Join(base, "git", "worktrees")
	} else if !filepath.IsAbs(worktreesDir) {
		worktreesDir = filepath.Join(base, worktreesDir)
	}
	mirrorsAbs, err := filepath.Abs(mirrorsDir)
	if err != nil {
		return "", "", err
	}
	worktreesAbs, err := filepath.Abs(worktreesDir)
	if err != nil {
		return "", "", err
	}
	return mirrorsAbs, worktreesAbs, nil
}

func samePath(a string, b string) bool {
	a = strings.TrimSpace(a)
	b = strings.TrimSpace(b)
	if a == "" || b == "" {
		return false
	}
	aa, err := filepath.Abs(a)
	if err == nil {
		a = aa
	}
	bb, err := filepath.Abs(b)
	if err == nil {
		b = bb
	}
	return filepath.Clean(a) == filepath.Clean(b)
}

func decodeJSONBody(r *http.Request, target any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(target); err != nil {
		if errors.Is(err, io.EOF) {
			return nil
		}
		return err
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeControlPlaneError(w http.ResponseWriter, err error) {
	if err == nil {
		http.Error(w, "session operation failed", http.StatusInternalServerError)
		return
	}
	msg := strings.TrimSpace(err.Error())
	switch {
	case errors.Is(err, context.Canceled):
		http.Error(w, "request canceled", http.StatusRequestTimeout)
	case errors.Is(err, context.DeadlineExceeded):
		http.Error(w, "request deadline exceeded", http.StatusGatewayTimeout)
	case errors.Is(err, errSyncQueueUnavailable), errors.Is(err, errSyncQueueFull):
		http.Error(w, msg, http.StatusServiceUnavailable)
	case errors.Is(err, sql.ErrNoRows), errors.Is(err, errServeTreeNotFound):
		http.Error(w, msg, http.StatusNotFound)
	case errors.Is(err, errServeTreeRequired):
		http.Error(w, msg, http.StatusBadRequest)
	case strings.Contains(msg, "required"),
		strings.Contains(msg, "must be"),
		strings.HasPrefix(msg, "chunk_"),
		strings.HasPrefix(msg, "idempotency_key_"),
		strings.HasPrefix(msg, "source_"),
		strings.HasPrefix(msg, "mode_"):
		http.Error(w, msg, http.StatusBadRequest)
	default:
		http.Error(w, msg, http.StatusInternalServerError)
	}
}

func writeAskError(w http.ResponseWriter, err error) {
	if err == nil {
		http.Error(w, "ask failed", http.StatusInternalServerError)
		return
	}
	switch {
	case errors.Is(err, context.Canceled):
		http.Error(w, "ask canceled", http.StatusRequestTimeout)
	case errors.Is(err, context.DeadlineExceeded):
		http.Error(w, "ask deadline exceeded", http.StatusGatewayTimeout)
	default:
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
