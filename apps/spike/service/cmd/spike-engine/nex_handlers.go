package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Napageneral/spike/internal/broker"
	"github.com/Napageneral/spike/internal/control"
	prlmstore "github.com/Napageneral/spike/internal/prlm/store"
	prlmtree "github.com/Napageneral/spike/internal/prlm/tree"
	"github.com/Napageneral/spike/internal/spikedb"
)

// ---------------------------------------------------------------------------
// Nex operation handler implementations
//
// Each function adapts the nex payload (map[string]interface{}) into the
// existing business logic, reusing the same control-plane, oracle, broker,
// and connector methods that the HTTP handlers use.
// ---------------------------------------------------------------------------

// --- Core operations -------------------------------------------------------

func (s *oracleServer) nexAsk(p map[string]interface{}) (interface{}, error) {
	treeID := payloadStr(p, "tree_id")
	query := payloadStr(p, "query")
	if treeID == "" || query == "" {
		return nil, fmt.Errorf("tree_id and query are required")
	}

	s.mu.RLock()
	tree := s.trees[treeID]
	s.mu.RUnlock()
	if tree == nil {
		return nil, fmt.Errorf("tree not found")
	}

	ctx := context.Background()
	var cancel context.CancelFunc
	if s.askTimeout > 0 {
		ctx, cancel = context.WithTimeout(ctx, s.askTimeout)
		defer cancel()
	}

	if s.askSem != nil {
		select {
		case s.askSem <- struct{}{}:
			defer func() { <-s.askSem }()
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}

	requestID := "req-" + uuid.NewString()
	answer, err := tree.oracle.AskWithOptions(ctx, treeID, query, prlmtree.AskOptions{
		RequestID: requestID,
	})
	if err != nil {
		return nil, err
	}
	return askResponse{
		TreeID:    answer.TreeID,
		Query:     answer.Query,
		Content:   strings.TrimSpace(answer.Content),
		Visited:   answer.Visited,
		RequestID: requestID,
	}, nil
}

func (s *oracleServer) nexStatus(p map[string]interface{}) (interface{}, error) {
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
		resp.Trees = append(resp.Trees, servedTreeStatus{
			TreeID:     status.TreeID,
			RootPath:   status.RootPath,
			NodeCount:  status.NodeCount,
			CleanCount: status.CleanCount,
		})
	}
	return resp, nil
}

func (s *oracleServer) nexSync(p map[string]interface{}) (interface{}, error) {
	if s.control == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	req := syncRequest{
		TreeID:    payloadStr(p, "tree_id"),
		Hydrate:   payloadBool(p, "hydrate"),
		RepoID:    payloadStr(p, "repo_id"),
		RemoteURL: payloadStr(p, "remote_url"),
		Ref:       payloadStr(p, "ref"),
	}
	treeID, job, err := s.enqueueSyncJob(req)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ok":      true,
		"tree_id": treeID,
		"job_id":  job.ID,
		"status":  "queued",
	}, nil
}

// --- Jobs ------------------------------------------------------------------

func (s *oracleServer) nexJobsGet(p map[string]interface{}) (interface{}, error) {
	if s.control == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	jobID := payloadStr(p, "job_id")
	if jobID == "" {
		return nil, fmt.Errorf("job_id is required")
	}
	job, err := s.control.GetJob(jobID)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"job": job}, nil
}

func (s *oracleServer) nexJobsList(p map[string]interface{}) (interface{}, error) {
	if s.control == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	jobs, err := s.control.ListJobs(control.JobFilter{
		TreeID: payloadStr(p, "tree_id"),
		Status: payloadStr(p, "status"),
		Limit:  payloadInt(p, "limit", 0),
	})
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"jobs": jobs}, nil
}

// --- Repositories ----------------------------------------------------------

func (s *oracleServer) nexRepositoryGet(p map[string]interface{}) (interface{}, error) {
	if s.control == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	repoID := payloadStr(p, "repo_id")
	if repoID == "" {
		return nil, fmt.Errorf("repo_id is required")
	}
	repository, err := s.control.GetRepository(repoID)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"repository": repository}, nil
}

func (s *oracleServer) nexRepositoriesList(p map[string]interface{}) (interface{}, error) {
	if s.control == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	repositories, err := s.control.ListRepositories(control.RepositoryFilter{
		RepoID: payloadStr(p, "repo_id"),
		Limit:  payloadInt(p, "limit", 0),
	})
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"repositories": repositories}, nil
}

// --- Repo refs -------------------------------------------------------------

func (s *oracleServer) nexRepoRefGet(p map[string]interface{}) (interface{}, error) {
	if s.control == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	repoID := payloadStr(p, "repo_id")
	refName := payloadStr(p, "ref_name")
	if repoID == "" || refName == "" {
		return nil, fmt.Errorf("repo_id and ref_name are required")
	}
	repoRef, err := s.control.GetRepoRef(repoID, refName)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"repo_ref": repoRef}, nil
}

func (s *oracleServer) nexRepoRefsList(p map[string]interface{}) (interface{}, error) {
	if s.control == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	repoRefs, err := s.control.ListRepoRefs(control.RepoRefFilter{
		RepoID:    payloadStr(p, "repo_id"),
		RefName:   payloadStr(p, "ref_name"),
		CommitSHA: payloadStr(p, "commit_sha"),
		Limit:     payloadInt(p, "limit", 0),
	})
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"repo_refs": repoRefs}, nil
}

// --- Tree versions ---------------------------------------------------------

func (s *oracleServer) nexTreeVersionGet(p map[string]interface{}) (interface{}, error) {
	if s.control == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	id := payloadStr(p, "id")
	if id == "" {
		return nil, fmt.Errorf("id is required")
	}
	treeVersion, err := s.control.GetTreeVersion(id)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"tree_version": treeVersion}, nil
}

func (s *oracleServer) nexTreeVersionsList(p map[string]interface{}) (interface{}, error) {
	if s.control == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	treeVersions, err := s.control.ListTreeVersions(control.TreeVersionFilter{
		TreeID:    payloadStr(p, "tree_id"),
		RepoID:    payloadStr(p, "repo_id"),
		RefName:   payloadStr(p, "ref_name"),
		CommitSHA: payloadStr(p, "commit_sha"),
		Status:    payloadStr(p, "status"),
		Limit:     payloadInt(p, "limit", 0),
	})
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"tree_versions": treeVersions}, nil
}

// --- Ask requests ----------------------------------------------------------

func (s *oracleServer) nexAskRequestsGet(p map[string]interface{}) (interface{}, error) {
	treeID := payloadStr(p, "tree_id")
	requestID := payloadStr(p, "request_id")
	if requestID == "" {
		return nil, fmt.Errorf("request_id is required")
	}
	row, err := s.getAskRequest(treeID, requestID)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"ask_request": row}, nil
}

func (s *oracleServer) nexAskRequestsList(p map[string]interface{}) (interface{}, error) {
	req := askRequestsListRequest{
		TreeID:        payloadStr(p, "tree_id"),
		Status:        payloadStr(p, "status"),
		ScopeKey:      payloadStr(p, "scope_key"),
		RefName:       payloadStr(p, "ref_name"),
		CommitSHA:     payloadStr(p, "commit_sha"),
		TreeVersionID: payloadStr(p, "tree_version_id"),
		Limit:         payloadInt(p, "limit", 0),
	}
	rows, err := s.listAskRequests(req)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"ask_requests": rows}, nil
}

func (s *oracleServer) nexAskRequestsInspect(p map[string]interface{}) (interface{}, error) {
	treeID := payloadStr(p, "tree_id")
	requestID := payloadStr(p, "request_id")
	if requestID == "" {
		return nil, fmt.Errorf("request_id is required")
	}
	askRow, err := s.getAskRequest(treeID, requestID)
	if err != nil {
		return nil, err
	}
	rootTurn, rootMessages, rootToolCalls, rootSession, err := s.inspectAskRoot(treeID, askRow.RootTurnID)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ask_request":     askRow,
		"root_turn":       rootTurn,
		"root_messages":   rootMessages,
		"root_tool_calls": rootToolCalls,
		"root_session":    rootSession,
	}, nil
}

func (s *oracleServer) nexAskRequestsTimeline(p map[string]interface{}) (interface{}, error) {
	treeID := payloadStr(p, "tree_id")
	requestID := payloadStr(p, "request_id")
	limit := payloadInt(p, "limit", 0)
	if requestID == "" {
		return nil, fmt.Errorf("request_id is required")
	}
	askRow, err := s.getAskRequest(treeID, requestID)
	if err != nil {
		return nil, err
	}
	requestToken := sanitizeAskRequestToken(requestID)
	if requestToken == "" {
		return nil, fmt.Errorf("request_id is required")
	}
	nodes, err := s.buildAskTimeline(treeID, askRow, requestToken, limit)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ask_request":    askRow,
		"request_token":  requestToken,
		"timeline_nodes": nodes,
	}, nil
}

// --- Sessions --------------------------------------------------------------

func (s *oracleServer) nexSessionsList(p map[string]interface{}) (interface{}, error) {
	treeID := payloadStr(p, "tree_id")
	br, err := s.resolveTreeBroker(treeID)
	if err != nil {
		return nil, err
	}
	sessions, err := br.ListSessions(broker.SessionFilter{
		PersonaID:     payloadStr(p, "persona_id"),
		Status:        payloadStr(p, "status"),
		Origin:        payloadStr(p, "origin"),
		ScopeKey:      payloadStr(p, "scope_key"),
		RefName:       payloadStr(p, "ref_name"),
		CommitSHA:     payloadStr(p, "commit_sha"),
		TreeFlavor:    payloadStr(p, "tree_flavor"),
		TreeVersionID: payloadStr(p, "tree_version_id"),
		Limit:         payloadInt(p, "limit", 0),
	})
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"sessions": sessions}, nil
}

func (s *oracleServer) nexSessionsResolve(p map[string]interface{}) (interface{}, error) {
	treeID := payloadStr(p, "tree_id")
	key := payloadStr(p, "key")
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}
	br, err := s.resolveTreeBroker(treeID)
	if err != nil {
		return nil, err
	}
	label, err := br.ResolveSessionLabel(key)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ok":  true,
		"key": label,
	}, nil
}

func (s *oracleServer) nexSessionsPreview(p map[string]interface{}) (interface{}, error) {
	treeID := payloadStr(p, "tree_id")
	keys := payloadStringSlice(p, "keys")
	limit := payloadInt(p, "limit", 0)
	maxChars := payloadInt(p, "max_chars", 0)
	br, err := s.resolveTreeBroker(treeID)
	if err != nil {
		return nil, err
	}
	previews, err := br.PreviewSessions(keys, limit, maxChars)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"previews": previews}, nil
}

func (s *oracleServer) nexSessionsPatch(p map[string]interface{}) (interface{}, error) {
	treeID := payloadStr(p, "tree_id")
	key := payloadStr(p, "key")
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}
	br, err := s.resolveTreeBroker(treeID)
	if err != nil {
		return nil, err
	}
	label, err := br.PatchSession(key, broker.SessionPatch{
		PersonaID:       payloadStrPtr(p, "persona_id"),
		TaskDescription: payloadStrPtr(p, "task_description"),
		TaskStatus:      payloadStrPtr(p, "task_status"),
		RoutingKey:      payloadStrPtr(p, "routing_key"),
		Status:          payloadStrPtr(p, "status"),
	})
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ok":   true,
		"path": "agents-ledger",
		"key":  label,
		"entry": map[string]interface{}{
			"sessionId": label,
			"updatedAt": time.Now().UnixMilli(),
		},
	}, nil
}

func (s *oracleServer) nexSessionsReset(p map[string]interface{}) (interface{}, error) {
	treeID := payloadStr(p, "tree_id")
	key := payloadStr(p, "key")
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}
	br, err := s.resolveTreeBroker(treeID)
	if err != nil {
		return nil, err
	}
	label, err := br.ResetSession(key)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ok":  true,
		"key": label,
		"entry": map[string]interface{}{
			"sessionId": label,
			"updatedAt": time.Now().UnixMilli(),
		},
	}, nil
}

func (s *oracleServer) nexSessionsDelete(p map[string]interface{}) (interface{}, error) {
	treeID := payloadStr(p, "tree_id")
	key := payloadStr(p, "key")
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}
	br, err := s.resolveTreeBroker(treeID)
	if err != nil {
		return nil, err
	}
	label, err := br.DeleteSession(key)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ok":       true,
		"key":      label,
		"deleted":  true,
		"archived": []interface{}{},
	}, nil
}

func (s *oracleServer) nexSessionsCompact(p map[string]interface{}) (interface{}, error) {
	treeID := payloadStr(p, "tree_id")
	key := payloadStr(p, "key")
	instructions := payloadStr(p, "instructions")
	if key == "" {
		return nil, fmt.Errorf("key is required")
	}
	br, err := s.resolveTreeBroker(treeID)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	label, compact, err := br.CompactSession(ctx, key, instructions)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ok":         true,
		"key":        label,
		"compacted":  true,
		"compaction": compact,
	}, nil
}

func (s *oracleServer) nexSessionsImport(p map[string]interface{}) (interface{}, error) {
	treeID := payloadStr(p, "tree_id")
	br, err := s.resolveTreeBroker(treeID)
	if err != nil {
		return nil, err
	}
	items, err := payloadImportItems(p, "items")
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, fmt.Errorf("items required")
	}
	personaID := payloadStr(p, "personaId")
	importResp, err := br.RunSessionsImport(broker.SessionsImportRequest{
		Source:         payloadStr(p, "source"),
		RunID:          payloadStr(p, "runId"),
		Mode:           payloadStr(p, "mode"),
		PersonaID:      personaID,
		IdempotencyKey: payloadStr(p, "idempotencyKey"),
		Items:          items,
	}, broker.SessionsImportOptions{
		PersonaID: personaID,
	})
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ok":       importResp.OK,
		"runId":    importResp.RunID,
		"imported": importResp.Imported,
		"upserted": importResp.Upserted,
		"skipped":  importResp.Skipped,
		"failed":   importResp.Failed,
		"results":  importResp.Results,
	}, nil
}

func (s *oracleServer) nexSessionsImportChunk(p map[string]interface{}) (interface{}, error) {
	treeID := payloadStr(p, "tree_id")
	br, err := s.resolveTreeBroker(treeID)
	if err != nil {
		return nil, err
	}
	personaID := payloadStr(p, "personaId")
	chunkResp, err := br.RunSessionsImportChunk(broker.SessionsImportChunkRequest{
		Source:                   payloadStr(p, "source"),
		RunID:                    payloadStr(p, "runId"),
		Mode:                     payloadStr(p, "mode"),
		PersonaID:                personaID,
		IdempotencyKey:           payloadStr(p, "idempotencyKey"),
		UploadID:                 payloadStr(p, "uploadId"),
		ChunkIndex:               payloadInt(p, "chunkIndex", 0),
		ChunkTotal:               payloadInt(p, "chunkTotal", 0),
		Encoding:                 payloadStr(p, "encoding"),
		Data:                     payloadStr(p, "data"),
		SourceProvider:           payloadStr(p, "sourceProvider"),
		SourceSessionID:          payloadStr(p, "sourceSessionId"),
		SourceSessionFingerprint: payloadStr(p, "sourceSessionFingerprint"),
	}, broker.SessionsImportOptions{
		PersonaID: personaID,
	})
	if err != nil {
		return nil, err
	}

	resp := map[string]interface{}{
		"ok":       true,
		"runId":    chunkResp.RunID,
		"uploadId": chunkResp.UploadID,
		"status":   chunkResp.Status,
		"received": chunkResp.Received,
		"total":    chunkResp.Total,
	}
	if chunkResp.Import != nil {
		resp["import"] = map[string]interface{}{
			"ok":       chunkResp.Import.OK,
			"runId":    chunkResp.Import.RunID,
			"imported": chunkResp.Import.Imported,
			"upserted": chunkResp.Import.Upserted,
			"skipped":  chunkResp.Import.Skipped,
			"failed":   chunkResp.Import.Failed,
			"results":  chunkResp.Import.Results,
		}
	}
	return resp, nil
}

// --- Mirrors ---------------------------------------------------------------

func (s *oracleServer) nexMirrorsList(p map[string]interface{}) (interface{}, error) {
	if s.spikeStore == nil {
		return nil, fmt.Errorf("spike store is not configured")
	}
	mirrors, err := s.spikeStore.ListMirrors(context.Background())
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"mirrors": mirrors}, nil
}

// --- Worktrees -------------------------------------------------------------

func (s *oracleServer) nexWorktreesList(p map[string]interface{}) (interface{}, error) {
	if s.spikeStore == nil {
		return nil, fmt.Errorf("spike store is not configured")
	}
	worktrees, err := s.spikeStore.ListWorktrees(context.Background())
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"worktrees": worktrees}, nil
}

// --- GitHub connector operations -------------------------------------------

func (s *oracleServer) nexGitHubInstallationsList(p map[string]interface{}) (interface{}, error) {
	if s.spikeStore == nil {
		return nil, fmt.Errorf("spike store is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	installations, err := s.spikeStore.ListGitHubInstallations(ctx)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ok":            true,
		"installations": installations,
	}, nil
}

func (s *oracleServer) nexGitHubInstallationsGet(p map[string]interface{}) (interface{}, error) {
	if s.spikeStore == nil {
		return nil, fmt.Errorf("spike store is not configured")
	}
	installationID := payloadInt64(p, "installation_id", 0)
	if installationID <= 0 {
		return nil, fmt.Errorf("installation_id is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	installation, err := s.spikeStore.GetGitHubInstallation(ctx, installationID)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ok":           true,
		"installation": installation,
	}, nil
}

func (s *oracleServer) nexGitHubConnectorInstallStart(p map[string]interface{}) (interface{}, error) {
	if !s.githubAppReady() {
		return nil, fmt.Errorf("github app is not configured")
	}
	nonce, err := randomStateNonce()
	if err != nil {
		return nil, err
	}
	state, err := encodeGitHubInstallState(githubInstallStatePayload{
		IssuedAt: time.Now().UTC().Unix(),
		Nonce:    nonce,
	}, s.githubInstallSecret)
	if err != nil {
		return nil, err
	}
	installURL := fmt.Sprintf(
		"https://github.com/apps/%s/installations/new?state=%s",
		strings.TrimSpace(s.githubAppSlug),
		state,
	)
	return map[string]interface{}{
		"ok":          true,
		"install_url": installURL,
	}, nil
}

func (s *oracleServer) nexGitHubConnectorInstallCallback(p map[string]interface{}) (interface{}, error) {
	if !s.githubAppReady() {
		return nil, fmt.Errorf("github app is not configured")
	}
	rawState := payloadStr(p, "state")
	installationIDStr := payloadStr(p, "installation_id")

	_, err := decodeGitHubInstallState(rawState, s.githubInstallSecret, 20*time.Minute, time.Now().UTC())
	if err != nil {
		return nil, fmt.Errorf("invalid state: %w", err)
	}
	installationID, err := parsePositiveInt64Secret(installationIDStr)
	if err != nil {
		return nil, fmt.Errorf("invalid installation_id: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	appJWT, err := buildGitHubAppJWT(s.githubAppID, s.githubAppPrivateKey, time.Now().UTC())
	if err != nil {
		return nil, fmt.Errorf("app jwt failed: %w", err)
	}
	metadata, err := fetchGitHubInstallationMetadata(ctx, s.configuredGitHubAPIBaseURL(), appJWT, installationID)
	if err != nil {
		return nil, fmt.Errorf("installation lookup failed: %w", err)
	}
	_, err = s.upsertGitHubInstallation(installationID, metadata, githubConnectorSecret{
		Service:                  "github",
		Account:                  fmt.Sprintf("installation-%d", installationID),
		AuthID:                   "custom",
		AppID:                    s.githubAppID,
		InstallationID:           installationID,
		PrivateKeyPEM:            s.githubAppPrivateKey,
		APIBaseURL:               s.configuredGitHubAPIBaseURL(),
		InstallationAccountLogin: strings.TrimSpace(metadata.Account.Login),
	})
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ok":              true,
		"installation_id": installationID,
	}, nil
}

func (s *oracleServer) nexGitHubConnectorRepos(p map[string]interface{}) (interface{}, error) {
	installationID := payloadInt64(p, "installation_id", 0)
	if installationID <= 0 {
		return nil, fmt.Errorf("installation_id is required")
	}

	secret, err := s.resolveGitHubInstallationSecret(installationID)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	token, err := mintGitHubInstallationToken(ctx, secret)
	if err != nil {
		return nil, fmt.Errorf("mint github installation token failed: %w", err)
	}
	repos, err := listGitHubInstallationRepositories(ctx, secret.APIBaseURL, token.Token, 100)
	if err != nil {
		return nil, err
	}
	items := make([]map[string]interface{}, 0, len(repos))
	for _, repo := range repos {
		repoID := strings.ToLower(strings.TrimSpace(repo.FullName))
		if repoID == "" {
			continue
		}
		items = append(items, map[string]interface{}{
			"repo_id":         repoID,
			"full_name":       strings.TrimSpace(repo.FullName),
			"clone_url":       strings.TrimSpace(repo.CloneURL),
			"default_branch":  strings.TrimSpace(repo.DefaultBranch),
			"installation_id": secret.InstallationID,
		})
	}
	return map[string]interface{}{
		"ok":              true,
		"installation_id": installationID,
		"items":           items,
	}, nil
}

func (s *oracleServer) nexGitHubConnectorBranches(p map[string]interface{}) (interface{}, error) {
	repoID := payloadStr(p, "repo_id")
	if repoID == "" {
		return nil, fmt.Errorf("repo_id is required")
	}
	installationID := payloadInt64(p, "installation_id", 0)
	if installationID <= 0 {
		return nil, fmt.Errorf("installation_id is required")
	}

	secret, err := s.resolveGitHubInstallationSecret(installationID)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	token, err := mintGitHubInstallationToken(ctx, secret)
	if err != nil {
		return nil, fmt.Errorf("mint github installation token failed: %w", err)
	}
	defaultBranch := ""
	if repoMeta, metaErr := fetchGitHubRepositoryMetadata(ctx, secret.APIBaseURL, token.Token, repoID); metaErr == nil {
		defaultBranch = strings.TrimSpace(repoMeta.DefaultBranch)
	}
	branches, err := listGitHubBranches(ctx, secret.APIBaseURL, token.Token, repoID, 100)
	if err != nil {
		return nil, err
	}
	items := make([]map[string]interface{}, 0, len(branches))
	for _, branch := range branches {
		name := strings.TrimSpace(branch.Name)
		if name == "" {
			continue
		}
		items = append(items, map[string]interface{}{
			"name":       name,
			"commit_sha": strings.TrimSpace(branch.Commit.SHA),
			"is_default": strings.EqualFold(name, defaultBranch),
		})
	}
	return map[string]interface{}{
		"ok":              true,
		"installation_id": installationID,
		"repo_id":         strings.ToLower(repoID),
		"items":           items,
	}, nil
}

func (s *oracleServer) nexGitHubConnectorCommits(p map[string]interface{}) (interface{}, error) {
	repoID := payloadStr(p, "repo_id")
	if repoID == "" {
		return nil, fmt.Errorf("repo_id is required")
	}
	installationID := payloadInt64(p, "installation_id", 0)
	if installationID <= 0 {
		return nil, fmt.Errorf("installation_id is required")
	}

	secret, err := s.resolveGitHubInstallationSecret(installationID)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	token, err := mintGitHubInstallationToken(ctx, secret)
	if err != nil {
		return nil, fmt.Errorf("mint github installation token failed: %w", err)
	}
	ref := payloadStr(p, "ref")
	commits, err := listGitHubCommits(ctx, secret.APIBaseURL, token.Token, repoID, ref, 50)
	if err != nil {
		return nil, err
	}
	items := make([]map[string]interface{}, 0, len(commits))
	for _, commit := range commits {
		sha := strings.TrimSpace(commit.SHA)
		if sha == "" {
			continue
		}
		message := strings.TrimSpace(commit.Commit.Message)
		if idx := strings.Index(message, "\n"); idx >= 0 {
			message = strings.TrimSpace(message[:idx])
		}
		items = append(items, map[string]interface{}{
			"sha":         sha,
			"message":     message,
			"authored_at": strings.TrimSpace(commit.Commit.Author.Date),
			"html_url":    strings.TrimSpace(commit.HTMLURL),
		})
	}
	return map[string]interface{}{
		"ok":              true,
		"installation_id": installationID,
		"repo_id":         strings.ToLower(repoID),
		"ref":             ref,
		"items":           items,
	}, nil
}

func (s *oracleServer) nexGitHubConnectorRemove(p map[string]interface{}) (interface{}, error) {
	if s.spikeStore == nil {
		return nil, fmt.Errorf("spike store is not configured")
	}
	installationID := payloadInt64(p, "installation_id", 0)
	if installationID <= 0 {
		return nil, fmt.Errorf("installation_id is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := s.spikeStore.DeleteGitHubInstallation(ctx, installationID); err != nil {
		return nil, err
	}

	// Also delete the secret file
	secretPath := filepath.Join(
		s.connectorStateDir,
		"credentials",
		"github",
		"installations",
		strconv.FormatInt(installationID, 10),
		"secret.json",
	)
	_ = os.Remove(secretPath) // Ignore error, file may not exist

	return map[string]interface{}{
		"ok":              true,
		"installation_id": installationID,
		"removed":         true,
	}, nil
}

func (s *oracleServer) nexGitHubConnectorSetup(p map[string]interface{}) (interface{}, error) {
	if s == nil || s.spikeStore == nil {
		return nil, fmt.Errorf("spike store is not configured")
	}
	installationID, err := parsePositiveInt64Secret(payloadStr(p, "installation_id"))
	if err != nil {
		return nil, fmt.Errorf("installation_id must be a positive integer")
	}
	appID, err := parsePositiveInt64Secret(payloadStr(p, "app_id"))
	if err != nil {
		return nil, fmt.Errorf("app_id must be a positive integer")
	}
	privateKeyPEM := normalizePrivateKeyPEM(payloadStr(p, "private_key_pem"))
	if privateKeyPEM == "" {
		return nil, fmt.Errorf("private_key_pem is required")
	}
	if _, err := parseRSAPrivateKeyPEM(privateKeyPEM); err != nil {
		return nil, fmt.Errorf("private_key_pem is invalid: %w", err)
	}
	apiBaseURL := normalizeGitHubAPIBaseURL(payloadStr(p, "api_base_url"))

	secretPath, err := s.upsertGitHubInstallation(installationID, githubInstallationMetadata{
		ID: installationID,
		Account: struct {
			Login string `json:"login"`
		}{
			Login: strings.TrimSpace(payloadStr(p, "installation_account_login")),
		},
	}, githubConnectorSecret{
		Service:                  "github",
		Account:                  fmt.Sprintf("installation-%d", installationID),
		AuthID:                   "custom",
		AppID:                    appID,
		InstallationID:           installationID,
		PrivateKeyPEM:            privateKeyPEM,
		APIBaseURL:               apiBaseURL,
		InstallationAccountLogin: payloadStr(p, "installation_account_login"),
	})
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"ok": true,
		"installation": map[string]interface{}{
			"installation_id": installationID,
			"app_id":          fmt.Sprintf("%d", appID),
			"secret_path":     secretPath,
		},
	}, nil
}

// --- Webhook ---------------------------------------------------------------

func (s *oracleServer) nexGitHubWebhook(p map[string]interface{}) (interface{}, error) {
	if s == nil || s.control == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	// The GitHub webhook handler is special: it requires the raw HTTP request
	// for signature verification and headers. When called through nex, the
	// runtime forwards the raw body + headers in the payload.
	event := payloadStr(p, "event")
	deliveryID := payloadStr(p, "delivery_id")
	signature := payloadStr(p, "signature")
	body := payloadStr(p, "body")
	treeHint := payloadStr(p, "tree_id")

	if event == "" || deliveryID == "" {
		return nil, fmt.Errorf("event and delivery_id are required")
	}

	secret := strings.TrimSpace(s.githubWebhookSecret)
	if secret == "" {
		return nil, fmt.Errorf("github webhook secret is not configured")
	}
	if !verifyGitHubWebhookSignature(secret, []byte(body), signature) {
		return nil, fmt.Errorf("invalid github webhook signature")
	}

	treeID, _, err := s.resolveServedTreeWithID(treeHint)
	if err != nil {
		return nil, err
	}

	bodyBytes := []byte(body)
	hash := sha256.Sum256(bodyBytes)
	payloadHash := fmt.Sprintf("%x", hash[:])
	delivery, created, err := s.control.UpsertWebhookDeliveryReceived(deliveryID, event, treeID, payloadHash)
	if err != nil {
		return nil, err
	}
	if !created {
		return map[string]interface{}{
			"ok":          true,
			"event":       event,
			"delivery_id": deliveryID,
			"duplicate":   true,
			"delivery":    delivery,
		}, nil
	}

	syncRequests, ignored, mapErr := mapGitHubWebhookSyncRequests(event, treeID, bodyBytes)
	if mapErr != nil {
		_ = s.control.UpdateWebhookDelivery(deliveryID, "failed", "[]", mapErr.Error())
		return nil, mapErr
	}
	if ignored || len(syncRequests) == 0 {
		_ = s.control.UpdateWebhookDelivery(deliveryID, "ignored", "[]", "")
		return map[string]interface{}{
			"ok":          true,
			"event":       event,
			"delivery_id": deliveryID,
			"ignored":     true,
		}, nil
	}

	queued := make([]map[string]interface{}, 0, len(syncRequests))
	jobIDs := make([]string, 0, len(syncRequests))
	for _, req := range syncRequests {
		queuedTreeID, job, enqueueErr := s.enqueueSyncJob(req)
		if enqueueErr != nil {
			_ = s.control.UpdateWebhookDelivery(deliveryID, "failed", marshalJSONOr(jobIDs, "[]"), enqueueErr.Error())
			return nil, enqueueErr
		}
		jobIDs = append(jobIDs, job.ID)
		queued = append(queued, map[string]interface{}{
			"tree_id": queuedTreeID,
			"job_id":  job.ID,
			"repo_id": strings.TrimSpace(req.RepoID),
			"ref":     strings.TrimSpace(req.Ref),
		})
	}
	_ = s.control.UpdateWebhookDelivery(deliveryID, "queued", marshalJSONOr(jobIDs, "[]"), "")
	return map[string]interface{}{
		"ok":          true,
		"event":       event,
		"delivery_id": deliveryID,
		"queued_jobs": queued,
	}, nil
}

// --- Index management ------------------------------------------------------

func (s *oracleServer) nexIndexesCreate(p map[string]interface{}) (interface{}, error) {
	if s.spikeStore == nil {
		return nil, fmt.Errorf("spike store is not configured")
	}

	repoURL := payloadStr(p, "repo_url")
	if repoURL == "" {
		repoURL = payloadStr(p, "remote_url")
	}
	if repoURL == "" {
		return nil, fmt.Errorf("repo_url is required")
	}
	ref := payloadStr(p, "ref")
	if ref == "" {
		ref = "HEAD"
	}
	displayName := payloadStr(p, "display_name")
	configID := payloadStr(p, "config_id")
	if configID == "" {
		configID = "default"
	}

	// Generate index ID
	indexID := "idx-" + uuid.NewString()[:8]

	ctx := context.Background()

	// Create agent_indexes row
	if err := s.spikeStore.UpsertAgentIndex(ctx, spikedb.AgentIndex{
		IndexID:     indexID,
		DisplayName: displayName,
		ConfigID:    configID,
		Status:      "pending",
	}); err != nil {
		return nil, fmt.Errorf("create agent index: %w", err)
	}

	// Read capacity from config
	cfg, _ := s.spikeStore.GetConfig(ctx, configID)
	capacity := 120000
	if cfg != nil && cfg.Capacity > 0 {
		capacity = cfg.Capacity
	}

	// Create in-memory servedTree using the shared PRLM store
	// Get the shared PRLM store from an existing tree or create one
	var sharedStore *prlmstore.SQLiteStore
	s.mu.RLock()
	for _, t := range s.trees {
		if t != nil && t.store != nil {
			sharedStore = t.store
			break
		}
	}
	s.mu.RUnlock()

	if sharedStore == nil {
		// Create from the shared DB
		var err error
		sharedStore, err = prlmstore.OpenWithDB(s.spikeStore.DB())
		if err != nil {
			return nil, fmt.Errorf("init shared prlm store: %w", err)
		}
	}

	runtimeDir := "" // Will be set during sync
	oracle, err := prlmtree.NewOracleTree(sharedStore, prlmtree.OracleTreeOptions{
		RuntimeDir: runtimeDir,
	})
	if err != nil {
		return nil, fmt.Errorf("create oracle tree: %w", err)
	}

	newTree := &servedTree{
		treeID:   indexID,
		capacity: capacity,
		store:    sharedStore,
		oracle:   oracle,
		broker:   nil, // Will be created during sync
	}

	s.mu.Lock()
	s.trees[indexID] = newTree
	s.mu.Unlock()

	// Enqueue sync+hydrate job
	// Derive repoID from URL
	repoID := repoURL
	if strings.Contains(repoID, "/") {
		parts := strings.Split(strings.TrimSuffix(repoID, ".git"), "/")
		if len(parts) >= 2 {
			repoID = strings.ToLower(parts[len(parts)-2] + "/" + parts[len(parts)-1])
		}
	}

	_, job, err := s.enqueueSyncJob(syncRequest{
		TreeID:    indexID,
		Hydrate:   true,
		RepoID:    repoID,
		RemoteURL: repoURL,
		Ref:       ref,
	})
	if err != nil {
		// Clean up
		s.mu.Lock()
		delete(s.trees, indexID)
		s.mu.Unlock()
		_ = s.spikeStore.UpdateAgentIndexStatus(ctx, indexID, "error", err.Error())
		return nil, fmt.Errorf("enqueue sync job: %w", err)
	}

	return map[string]interface{}{
		"ok":       true,
		"index_id": indexID,
		"status":   "pending",
		"job_id":   job.ID,
	}, nil
}

func (s *oracleServer) nexIndexesList(p map[string]interface{}) (interface{}, error) {
	if s.spikeStore == nil {
		return nil, fmt.Errorf("spike store is not configured")
	}
	indexes, err := s.spikeStore.ListAgentIndexes(context.Background())
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"indexes": indexes}, nil
}

func (s *oracleServer) nexIndexesGet(p map[string]interface{}) (interface{}, error) {
	if s.spikeStore == nil {
		return nil, fmt.Errorf("spike store is not configured")
	}
	indexID := payloadStr(p, "index_id")
	if indexID == "" {
		return nil, fmt.Errorf("index_id is required")
	}
	idx, err := s.spikeStore.GetAgentIndex(context.Background(), indexID)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"index": idx}, nil
}

func (s *oracleServer) nexIndexesDelete(p map[string]interface{}) (interface{}, error) {
	if s.spikeStore == nil {
		return nil, fmt.Errorf("spike store is not configured")
	}
	indexID := payloadStr(p, "index_id")
	if indexID == "" {
		return nil, fmt.Errorf("index_id is required")
	}
	// Remove from in-memory map
	s.mu.Lock()
	delete(s.trees, indexID)
	s.mu.Unlock()
	// Delete from DB (cascade)
	if err := s.spikeStore.DeleteAgentIndex(context.Background(), indexID); err != nil {
		return nil, err
	}
	return map[string]interface{}{"ok": true, "deleted": true, "index_id": indexID}, nil
}

func (s *oracleServer) nexIndexesStatus(p map[string]interface{}) (interface{}, error) {
	if s.spikeStore == nil {
		return nil, fmt.Errorf("spike store is not configured")
	}
	indexID := payloadStr(p, "index_id")
	if indexID == "" {
		return nil, fmt.Errorf("index_id is required")
	}
	idx, err := s.spikeStore.GetAgentIndex(context.Background(), indexID)
	if err != nil {
		return nil, err
	}
	// Also try to get live oracle status
	s.mu.RLock()
	tree := s.trees[indexID]
	s.mu.RUnlock()
	progressPct := 0
	if tree != nil && tree.oracle != nil {
		if status, err := tree.oracle.Status(context.Background(), indexID); err == nil {
			if status.NodeCount > 0 {
				progressPct = (status.CleanCount * 100) / status.NodeCount
			}
		}
	}
	return map[string]interface{}{
		"index_id":     idx.IndexID,
		"status":       idx.Status,
		"node_count":   idx.NodeCount,
		"clean_count":  idx.CleanCount,
		"total_tokens": idx.TotalTokens,
		"total_files":  idx.TotalFiles,
		"last_error":   idx.LastError,
		"progress_pct": progressPct,
	}, nil
}

func (s *oracleServer) nexConfigDefaults(p map[string]interface{}) (interface{}, error) {
	if s.spikeStore == nil {
		return nil, fmt.Errorf("spike store is not configured")
	}
	cfg, err := s.spikeStore.GetDefaultConfig(context.Background())
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"config": cfg}, nil
}

func (s *oracleServer) nexConfigGet(p map[string]interface{}) (interface{}, error) {
	if s.spikeStore == nil {
		return nil, fmt.Errorf("spike store is not configured")
	}
	configID := payloadStr(p, "config_id")
	if configID == "" {
		configID = "default"
	}
	cfg, err := s.spikeStore.GetConfig(context.Background(), configID)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"config": cfg}, nil
}

func (s *oracleServer) nexConfigUpdate(p map[string]interface{}) (interface{}, error) {
	if s.spikeStore == nil {
		return nil, fmt.Errorf("spike store is not configured")
	}
	configID := payloadStr(p, "config_id")
	if configID == "" {
		return nil, fmt.Errorf("config_id is required")
	}
	ctx := context.Background()
	// Get existing config
	existing, err := s.spikeStore.GetConfig(ctx, configID)
	if err != nil {
		return nil, err
	}
	// Apply updates
	if v := payloadInt(p, "capacity", 0); v > 0 {
		existing.Capacity = v
	}
	if v := payloadInt(p, "max_children", 0); v > 0 {
		existing.MaxChildren = v
	}
	if v := payloadInt(p, "max_parallel", 0); v > 0 {
		existing.MaxParallel = v
	}
	if v := payloadStr(p, "display_name"); v != "" {
		existing.DisplayName = v
	}
	if err := s.spikeStore.UpsertConfig(ctx, *existing); err != nil {
		return nil, err
	}
	return map[string]interface{}{"ok": true, "config": existing}, nil
}

// ---------------------------------------------------------------------------
// Additional payload helpers
// ---------------------------------------------------------------------------

func payloadStringSlice(p map[string]interface{}, key string) []string {
	v, ok := p[key]
	if !ok {
		return nil
	}
	switch slice := v.(type) {
	case []interface{}:
		out := make([]string, 0, len(slice))
		for _, item := range slice {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	case []string:
		return slice
	default:
		return nil
	}
}

func payloadImportItems(p map[string]interface{}, key string) ([]broker.SessionsImportItem, error) {
	v, ok := p[key]
	if !ok {
		return nil, nil
	}
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, fmt.Errorf("invalid items payload: %w", err)
	}
	var items []broker.SessionsImportItem
	if err := json.Unmarshal(raw, &items); err != nil {
		return nil, fmt.Errorf("invalid items payload: %w", err)
	}
	return items, nil
}
