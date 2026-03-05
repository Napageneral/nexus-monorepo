package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	prlmstore "github.com/Napageneral/spike/internal/prlm/store"
	prlmtree "github.com/Napageneral/spike/internal/prlm/tree"
	"github.com/Napageneral/spike/internal/spikedb"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	switch os.Args[1] {
	case "init":
		if err := cmdInit(os.Args[2:]); err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
	case "hydrate":
		if err := cmdHydrate(os.Args[2:]); err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
	case "ask":
		if err := cmdAsk(os.Args[2:]); err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
	case "status":
		if err := cmdStatus(os.Args[2:]); err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
	case "serve":
		if err := cmdServe(os.Args[2:]); err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
	case "sync":
		if err := cmdSync(os.Args[2:]); err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
	case "mcp":
		if err := cmdMCP(os.Args[2:]); err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
	default:
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Println("spike init    [--storage-root DIR --scope PATH --tree-id ID --capacity N --max-children N]")
	fmt.Println("spike hydrate [--storage-root DIR --scope PATH --tree-id ID --model MODEL --max-parallel N --preserve-sandbox]")
	fmt.Println("spike ask     [--storage-root DIR --remote URL --scope PATH --tree-id ID --model MODEL --max-parallel N --preserve-sandbox --json] \"QUERY\"")
	fmt.Println("spike status  [--storage-root DIR --scope PATH --tree-id ID]")
	fmt.Println("spike serve   [--storage-root DIR --port N --ask-timeout DURATION --max-concurrent-asks N ...]")
	fmt.Println("spike sync    [--storage-root DIR --scope PATH --tree-id ID --max-children N]")
	fmt.Println("spike mcp     [--upstream URL --http ADDR --ask-timeout DURATION]")
}

func cmdInit(args []string) error {
	fs := flag.NewFlagSet("init", flag.ContinueOnError)
	storageRootFlag := fs.String("storage-root", defaultStorageRoot(), "Root directory for spike data (db, runtime)")
	scope := fs.String("scope", ".", "Corpus root path")
	treeID := fs.String("tree-id", "default", "Tree ID")
	capacity := fs.Int("capacity", 120000, "Root/node capacity token threshold")
	maxChildren := fs.Int("max-children", 12, "Max children per split")
	if err := fs.Parse(args); err != nil {
		return err
	}

	root, err := filepath.Abs(*scope)
	if err != nil {
		return err
	}
	storageRoot, err := filepath.Abs(*storageRootFlag)
	if err != nil {
		return err
	}

	spikeDB, err := spikedb.Open(filepath.Join(storageRoot, "spike.db"))
	if err != nil {
		return err
	}
	defer spikeDB.Close()

	store, err := prlmstore.OpenWithDB(spikeDB.DB())
	if err != nil {
		return err
	}

	// Ensure agent_indexes row exists so agent_nodes FK is satisfied.
	if err := spikeDB.UpsertAgentIndex(context.Background(), spikedb.AgentIndex{
		IndexID:    *treeID,
		SourcePath: root,
		Status:     "pending",
		ConfigID:   "default",
	}); err != nil {
		return fmt.Errorf("upsert agent index: %w", err)
	}

	oracle, err := prlmtree.NewOracleTree(store, prlmtree.OracleTreeOptions{
		MaxChildren: *maxChildren,
		RuntimeDir:  filepath.Join(storageRoot, "runtime"),
	})
	if err != nil {
		return err
	}

	_, err = oracle.Init(context.Background(), *treeID, root, *capacity)
	if err != nil {
		return err
	}

	fmt.Printf("spike init complete: tree=%s db=%s\n", *treeID, filepath.Join(storageRoot, "spike.db"))
	return nil
}

func cmdHydrate(args []string) error {
	fs := flag.NewFlagSet("hydrate", flag.ContinueOnError)
	storageRootFlag := fs.String("storage-root", defaultStorageRoot(), "Root directory for spike data (db, runtime)")
	treeID := fs.String("tree-id", "default", "Tree ID")
	llmModel := fs.String("model", "", "Optional model override for selected backend")
	preserveSandbox := fs.Bool("preserve-sandbox", false, "Preserve sandbox directory for debugging")
	maxChildren := fs.Int("max-children", 12, "Max children per split")
	maxParallel := fs.Int("max-parallel", 4, "Max parallel child execution")
	if err := fs.Parse(args); err != nil {
		return err
	}

	storageRoot, err := filepath.Abs(*storageRootFlag)
	if err != nil {
		return err
	}

	spikeDB, err := spikedb.Open(filepath.Join(storageRoot, "spike.db"))
	if err != nil {
		return err
	}
	defer spikeDB.Close()

	store, err := prlmstore.OpenWithDB(spikeDB.DB())
	if err != nil {
		return err
	}

	oracle, err := prlmtree.NewOracleTree(store, prlmtree.OracleTreeOptions{
		MaxChildren:     *maxChildren,
		MaxParallel:     *maxParallel,
		PreserveSandbox: *preserveSandbox,
		LLMModel:        *llmModel,
		RuntimeDir:      filepath.Join(storageRoot, "runtime"),
	})
	if err != nil {
		return err
	}

	report, err := oracle.Hydrate(context.Background(), *treeID)
	if err != nil {
		return err
	}
	b, _ := json.MarshalIndent(report, "", "  ")
	fmt.Println(string(b))
	return nil
}

func cmdStatus(args []string) error {
	fs := flag.NewFlagSet("status", flag.ContinueOnError)
	storageRootFlag := fs.String("storage-root", defaultStorageRoot(), "Root directory for spike data (db, runtime)")
	treeID := fs.String("tree-id", "default", "Tree ID")
	if err := fs.Parse(args); err != nil {
		return err
	}

	storageRoot, err := filepath.Abs(*storageRootFlag)
	if err != nil {
		return err
	}

	spikeDB, err := spikedb.Open(filepath.Join(storageRoot, "spike.db"))
	if err != nil {
		return err
	}
	defer spikeDB.Close()

	store, err := prlmstore.OpenWithDB(spikeDB.DB())
	if err != nil {
		return err
	}
	oracle, err := prlmtree.NewOracleTree(store, prlmtree.OracleTreeOptions{
		RuntimeDir: filepath.Join(storageRoot, "runtime"),
	})
	if err != nil {
		return err
	}

	status, err := oracle.Status(context.Background(), *treeID)
	if err != nil {
		return err
	}
	b, _ := json.MarshalIndent(status, "", "  ")
	fmt.Println(string(b))
	return nil
}

func cmdSync(args []string) error {
	fs := flag.NewFlagSet("sync", flag.ContinueOnError)
	storageRootFlag := fs.String("storage-root", defaultStorageRoot(), "Root directory for spike data (db, runtime)")
	treeID := fs.String("tree-id", "default", "Tree ID")
	maxChildren := fs.Int("max-children", 12, "Max children per split")
	maxParallel := fs.Int("max-parallel", 4, "Max parallel child execution")
	if err := fs.Parse(args); err != nil {
		return err
	}

	storageRoot, err := filepath.Abs(*storageRootFlag)
	if err != nil {
		return err
	}

	spikeDB, err := spikedb.Open(filepath.Join(storageRoot, "spike.db"))
	if err != nil {
		return err
	}
	defer spikeDB.Close()

	store, err := prlmstore.OpenWithDB(spikeDB.DB())
	if err != nil {
		return err
	}

	oracle, err := prlmtree.NewOracleTree(store, prlmtree.OracleTreeOptions{
		MaxChildren: *maxChildren,
		MaxParallel: *maxParallel,
		RuntimeDir:  filepath.Join(storageRoot, "runtime"),
	})
	if err != nil {
		return err
	}

	report, err := oracle.Sync(context.Background(), *treeID)
	if err != nil {
		return err
	}
	b, _ := json.MarshalIndent(report, "", "  ")
	fmt.Println(string(b))
	return nil
}

func cmdAsk(args []string) error {
	fs := flag.NewFlagSet("ask", flag.ContinueOnError)
	storageRootFlag := fs.String("storage-root", defaultStorageRoot(), "Root directory for spike data (db, runtime)")
	remoteURL := fs.String("remote", "", "Remote oracle server base URL (e.g. http://oracle:7422)")
	treeID := fs.String("tree-id", "default", "Tree ID")
	llmModel := fs.String("model", "", "Optional model override for selected backend")
	jsonOut := fs.Bool("json", false, "Emit structured JSON output")
	preserveSandbox := fs.Bool("preserve-sandbox", false, "Preserve sandbox directory for debugging")
	maxChildren := fs.Int("max-children", 12, "Max children per split")
	maxParallel := fs.Int("max-parallel", 4, "Max parallel child execution")
	if err := fs.Parse(args); err != nil {
		return err
	}
	query := strings.TrimSpace(strings.Join(fs.Args(), " "))
	if query == "" {
		return fmt.Errorf("query is required")
	}
	if strings.TrimSpace(*remoteURL) != "" {
		req := askRequest{
			TreeID: *treeID,
			Query:  query,
			JSON:   *jsonOut,
		}
		body, err := json.Marshal(req)
		if err != nil {
			return err
		}
		url := strings.TrimRight(strings.TrimSpace(*remoteURL), "/") + "/ask"
		httpReq, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			return err
		}
		httpReq.Header.Set("Content-Type", "application/json")
		client := &http.Client{Timeout: 120 * time.Minute}
		resp, err := client.Do(httpReq)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			raw, _ := io.ReadAll(resp.Body)
			return fmt.Errorf("remote ask failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(raw)))
		}
		var remoteResp askResponse
		if err := json.NewDecoder(resp.Body).Decode(&remoteResp); err != nil {
			return err
		}
		if *jsonOut {
			b, err := json.Marshal(remoteResp)
			if err != nil {
				return err
			}
			fmt.Println(string(b))
			return nil
		}
		fmt.Println(strings.TrimSpace(remoteResp.Content))
		return nil
	}

	storageRoot, err := filepath.Abs(*storageRootFlag)
	if err != nil {
		return err
	}

	spikeDB, err := spikedb.Open(filepath.Join(storageRoot, "spike.db"))
	if err != nil {
		return err
	}
	defer spikeDB.Close()

	store, err := prlmstore.OpenWithDB(spikeDB.DB())
	if err != nil {
		return err
	}

	oracle, err := prlmtree.NewOracleTree(store, prlmtree.OracleTreeOptions{
		MaxChildren:     *maxChildren,
		MaxParallel:     *maxParallel,
		PreserveSandbox: *preserveSandbox,
		LLMModel:        *llmModel,
		RuntimeDir:      filepath.Join(storageRoot, "runtime"),
	})
	if err != nil {
		return err
	}

	answer, err := oracle.Ask(context.Background(), *treeID, query)
	if err != nil {
		return err
	}
	if *jsonOut {
		payload := struct {
			TreeID  string   `json:"tree_id"`
			Query   string   `json:"query"`
			Content string   `json:"content"`
			Visited []string `json:"visited,omitempty"`
		}{
			TreeID:  answer.TreeID,
			Query:   answer.Query,
			Content: strings.TrimSpace(answer.Content),
			Visited: answer.Visited,
		}
		b, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		fmt.Println(string(b))
		return nil
	}
	fmt.Println(strings.TrimSpace(answer.Content))
	return nil
}

func cmdServe(args []string) error {
	defaultAuthToken := strings.TrimSpace(os.Getenv("SPIKE_AUTH_TOKEN"))
	defaultAllowUnauthStatus := envBoolOr("SPIKE_ALLOW_UNAUTH_STATUS", true)
	defaultRateLimitRPS := envFloatOr("SPIKE_RATE_LIMIT_RPS", 30)
	defaultRateLimitBurst := envIntOr("SPIKE_RATE_LIMIT_BURST", 60)
	defaultTrustedProxies := strings.TrimSpace(os.Getenv("SPIKE_TRUSTED_PROXIES"))
	defaultWebhookSecret := strings.TrimSpace(os.Getenv("SPIKE_GITHUB_WEBHOOK_SECRET"))
	defaultGitHubAppSlug := strings.TrimSpace(os.Getenv("SPIKE_GITHUB_APP_SLUG"))
	defaultGitHubAppID := strings.TrimSpace(os.Getenv("SPIKE_GITHUB_APP_ID"))
	defaultGitHubAppPrivateKey := normalizePrivateKeyPEM(os.Getenv("SPIKE_GITHUB_APP_PRIVATE_KEY"))
	defaultGitHubAPIBaseURL := strings.TrimSpace(os.Getenv("SPIKE_GITHUB_API_BASE_URL"))
	defaultNexStateDir := strings.TrimSpace(os.Getenv("NEXUS_STATE_DIR"))

	// Auto-detect nex service mode: if NEX_SERVICE_PORT is set, override
	// the default listen port so the nex runtime can reach us.
	defaultPort := 7422
	if nexPort := strings.TrimSpace(os.Getenv("NEX_SERVICE_PORT")); nexPort != "" {
		if p, err := strconv.Atoi(nexPort); err == nil && p > 0 {
			defaultPort = p
		}
	}

	// Resolve storage root: flag -> NEX_APP_DATA_DIR -> NEXUS_STATE_DIR -> ./data/
	defaultStorageRoot := "./data/"
	if dir := strings.TrimSpace(os.Getenv("NEX_APP_DATA_DIR")); dir != "" {
		defaultStorageRoot = dir
	} else if dir := strings.TrimSpace(os.Getenv("NEXUS_STATE_DIR")); dir != "" {
		defaultStorageRoot = dir
	}

	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	storageRoot := fs.String("storage-root", defaultStorageRoot, "Root directory for all spike data (db, git, indexes)")
	controlDB := fs.String("control-db", "", "Control-plane SQLite DB for jobs (absolute or relative to --storage-root)")
	gitMirrorsDir := fs.String("git-mirrors-dir", "", "Git mirrors root (absolute or relative to --storage-root); default: git/mirrors")
	gitWorktreesDir := fs.String("git-worktrees-dir", "", "Pinned worktrees root (absolute or relative to --storage-root); default: git/worktrees")
	nexStateDir := fs.String("nex-state-dir", defaultNexStateDir, "Nex state root containing connector credentials (absolute or relative to --storage-root)")
	port := fs.Int("port", defaultPort, "HTTP listen port")
	askTimeout := fs.Duration("ask-timeout", 120*time.Minute, "Max duration per /ask request (e.g. 120m)")
	maxConcurrentAsks := fs.Int("max-concurrent-asks", 0, "Max concurrent /ask requests (0 = unlimited)")
	authToken := fs.String("auth-token", defaultAuthToken, "Bearer token required for API access when non-empty")
	allowUnauthStatus := fs.Bool("allow-unauth-status", defaultAllowUnauthStatus, "Allow unauthenticated GET/HEAD /status when auth is enabled")
	rateLimitRPS := fs.Float64("rate-limit-rps", defaultRateLimitRPS, "Per-client request rate limit in requests/sec (<=0 disables)")
	rateLimitBurst := fs.Int("rate-limit-burst", defaultRateLimitBurst, "Per-client burst capacity (<=0 disables)")
	trustedProxies := fs.String("trusted-proxies", defaultTrustedProxies, "Comma-separated trusted proxy CIDRs/IPs for forwarded client IP handling")
	githubWebhookSecret := fs.String("github-webhook-secret", defaultWebhookSecret, "GitHub webhook secret for validating X-Hub-Signature-256")
	githubAppSlug := fs.String("github-app-slug", defaultGitHubAppSlug, "GitHub App slug used for install redirect flow")
	githubAppID := fs.String("github-app-id", defaultGitHubAppID, "GitHub App numeric ID used for installation token minting")
	githubAppPrivateKey := fs.String("github-app-private-key", defaultGitHubAppPrivateKey, "GitHub App private key PEM")
	githubAPIBaseURL := fs.String("github-api-base-url", defaultGitHubAPIBaseURL, "GitHub API base URL override (default https://api.github.com)")
	uiDir := fs.String("ui-dir", "", "UI directory containing built HTML files (default: auto-detect from binary location)")
	if err := fs.Parse(args); err != nil {
		return err
	}

	// Auto-detect UI directory if not explicitly provided.
	resolvedUIDir := strings.TrimSpace(*uiDir)
	if resolvedUIDir == "" {
		resolvedUIDir = resolveUIDir()
	}
	if resolvedUIDir != "" {
		fmt.Printf("spike UI directory: %s\n", resolvedUIDir)
	} else {
		fmt.Println("spike UI directory: not found (UI will be unavailable in standalone mode)")
	}

	server, err := newOracleServer(*storageRoot, oracleServerOptions{
		AskTimeout:          *askTimeout,
		MaxConcurrentAsks:   *maxConcurrentAsks,
		ControlDB:           *controlDB,
		GitMirrorsDir:       *gitMirrorsDir,
		GitWorktreesDir:     *gitWorktreesDir,
		AuthToken:           strings.TrimSpace(*authToken),
		AllowUnauthStatus:   *allowUnauthStatus,
		RateLimitRPS:        *rateLimitRPS,
		RateLimitBurst:      *rateLimitBurst,
		TrustedProxies:      strings.TrimSpace(*trustedProxies),
		GitHubWebhookSecret: strings.TrimSpace(*githubWebhookSecret),
		GitHubAppSlug:       strings.TrimSpace(*githubAppSlug),
		GitHubAppID:         strings.TrimSpace(*githubAppID),
		GitHubAppPrivateKey: normalizePrivateKeyPEM(*githubAppPrivateKey),
		GitHubAppAPIBaseURL: strings.TrimSpace(*githubAPIBaseURL),
		ConnectorStateDir:   strings.TrimSpace(*nexStateDir),
		UIDir:               resolvedUIDir,
	})
	if err != nil {
		return err
	}
	defer server.close()

	addr := fmt.Sprintf(":%d", *port)
	fmt.Printf("spike server listening on %s\n", addr)
	return http.ListenAndServe(addr, server.handler())
}

// defaultStorageRoot resolves the storage root: NEX_APP_DATA_DIR -> NEXUS_STATE_DIR -> ./data/
func defaultStorageRoot() string {
	if dir := strings.TrimSpace(os.Getenv("NEX_APP_DATA_DIR")); dir != "" {
		return dir
	}
	if dir := strings.TrimSpace(os.Getenv("NEXUS_STATE_DIR")); dir != "" {
		return dir
	}
	return "./data/"
}

func envBoolOr(key string, fallback bool) bool {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(raw)
	if err != nil {
		return fallback
	}
	return parsed
}

func envFloatOr(key string, fallback float64) float64 {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

func envIntOr(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return parsed
}
