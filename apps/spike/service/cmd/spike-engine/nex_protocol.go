package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// ---------------------------------------------------------------------------
// Nex Service Protocol — operation dispatch shim
//
// The nex runtime dispatches operations to service binaries via HTTP:
//   GET  /health                    → { "status": "ok" }
//   POST /operations/{methodName}   → OperationRequest → OperationResponse
//
// This file adds nex protocol support to the spike engine by wrapping the
// existing handler functions (which already process JSON payloads) in the
// nex envelope format.
// ---------------------------------------------------------------------------

// OperationRequest is the standard envelope the nex runtime sends.
type OperationRequest struct {
	Operation string                 `json:"operation"`
	Payload   map[string]interface{} `json:"payload"`
	User      *OperationUser         `json:"user,omitempty"`
	Account   *OperationAccount      `json:"account,omitempty"`
	RequestID string                 `json:"requestId"`
}

// OperationUser is the caller identity from the nex runtime.
type OperationUser struct {
	UserID      string `json:"userId"`
	Email       string `json:"email,omitempty"`
	DisplayName string `json:"displayName,omitempty"`
	Role        string `json:"role,omitempty"`
	AccountID   string `json:"accountId,omitempty"`
}

// OperationAccount is the account context from the nex runtime.
type OperationAccount struct {
	AccountID   string `json:"accountId"`
	DisplayName string `json:"displayName,omitempty"`
}

// OperationResponse is the standard envelope returned to the nex runtime.
type OperationResponse struct {
	Result interface{}     `json:"result,omitempty"`
	Error  *OperationError `json:"error,omitempty"`
}

// OperationError is the error shape expected by the nex runtime.
type OperationError struct {
	Code    string      `json:"code"`
	Message string      `json:"message"`
	Details interface{} `json:"details,omitempty"`
}

// nexOperationHandler is a function that takes the operation payload and
// returns a result or error. Each handler adapts the existing serve.go
// handler logic to work with the nex envelope.
type nexOperationHandler func(payload map[string]interface{}) (interface{}, error)

// buildNexOperationHandlers returns the full routing table mapping
// spike.* method names to handler functions.
func (s *oracleServer) buildNexOperationHandlers() map[string]nexOperationHandler {
	return map[string]nexOperationHandler{
		// Core
		"spike.ask":    s.nexAsk,
		"spike.status": s.nexStatus,
		"spike.sync":   s.nexSync,

		// Jobs
		"spike.jobs.get":  s.nexJobsGet,
		"spike.jobs.list": s.nexJobsList,

		// Repositories
		"spike.repositories.get":  s.nexRepositoryGet,
		"spike.repositories.list": s.nexRepositoriesList,

		// Repo refs
		"spike.repo-refs.get":  s.nexRepoRefGet,
		"spike.repo-refs.list": s.nexRepoRefsList,

		// Tree versions
		"spike.tree-versions.get":  s.nexTreeVersionGet,
		"spike.tree-versions.list": s.nexTreeVersionsList,

		// Ask requests
		"spike.ask-requests.get":      s.nexAskRequestsGet,
		"spike.ask-requests.list":     s.nexAskRequestsList,
		"spike.ask-requests.inspect":  s.nexAskRequestsInspect,
		"spike.ask-requests.timeline": s.nexAskRequestsTimeline,

		// Sessions
		"spike.sessions.list":         s.nexSessionsList,
		"spike.sessions.resolve":      s.nexSessionsResolve,
		"spike.sessions.preview":      s.nexSessionsPreview,
		"spike.sessions.patch":        s.nexSessionsPatch,
		"spike.sessions.reset":        s.nexSessionsReset,
		"spike.sessions.delete":       s.nexSessionsDelete,
		"spike.sessions.compact":      s.nexSessionsCompact,
		"spike.sessions.import":       s.nexSessionsImport,
		"spike.sessions.import-chunk": s.nexSessionsImportChunk,

		// Mirrors & Worktrees
		"spike.mirrors.list":   s.nexMirrorsList,
		"spike.worktrees.list": s.nexWorktreesList,

		// Indexes
		"spike.indexes.create": s.nexIndexesCreate,
		"spike.indexes.list":   s.nexIndexesList,
		"spike.indexes.get":    s.nexIndexesGet,
		"spike.indexes.delete": s.nexIndexesDelete,
		"spike.indexes.status": s.nexIndexesStatus,

		// Code intelligence
		"spike.code-intel.index.build":       s.nexCodeIntelIndexBuild,
		"spike.code-intel.index.status":      s.nexCodeIntelIndexStatus,
		"spike.code-intel.source.file":       s.nexCodeIntelSourceFile,
		"spike.code-intel.source.chunk":      s.nexCodeIntelSourceChunk,
		"spike.code-intel.source.context":    s.nexCodeIntelSourceContext,
		"spike.code-intel.symbol.resolve":    s.nexCodeIntelSymbolResolve,
		"spike.code-intel.symbol.references": s.nexCodeIntelSymbolReferences,
		"spike.code-intel.graph.callers":     s.nexCodeIntelGraphCallers,
		"spike.code-intel.graph.callees":     s.nexCodeIntelGraphCallees,
		"spike.code-intel.graph.imports":     s.nexCodeIntelGraphImports,
		"spike.code-intel.graph.importers":   s.nexCodeIntelGraphImporters,
		"spike.code-intel.search.semantic":   s.nexCodeIntelSearchSemantic,
		"spike.code-intel.context.pack":      s.nexCodeIntelContextPack,
		"spike.code-intel.tests.impact":      s.nexCodeIntelTestsImpact,
		"spike.guides.build":                 s.nexGuidesBuild,

		// Config
		"spike.config.defaults": s.nexConfigDefaults,
		"spike.config.get":      s.nexConfigGet,
		"spike.config.update":   s.nexConfigUpdate,

		// GitHub installations
		"spike.github.installations.list":       s.nexGitHubInstallationsList,
		"spike.github.installations.get":        s.nexGitHubInstallationsGet,
		"spike.connectors.github.install.start": s.nexGitHubConnectorInstallStart,
		"spike.connectors.github.repos":         s.nexGitHubConnectorRepos,
		"spike.connectors.github.branches":      s.nexGitHubConnectorBranches,
		"spike.connectors.github.commits":       s.nexGitHubConnectorCommits,
		"spike.connectors.github.remove":        s.nexGitHubConnectorRemove,
		"spike.connectors.github.setup":         s.nexGitHubConnectorSetup,

		// Webhooks
		"spike.github.webhook": s.nexGitHubWebhook,
	}
}

// handleNexHealth handles GET /health for the nex service protocol.
func (s *oracleServer) handleNexHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
	})
}

// handleNexOperation handles POST /operations/{methodName} for the nex
// service protocol. It unwraps the OperationRequest, dispatches to the
// appropriate handler, and wraps the result in an OperationResponse.
func (s *oracleServer) handleNexOperation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract method name from path: /operations/spike.ask → spike.ask
	methodName := strings.TrimPrefix(r.URL.Path, "/operations/")
	if methodName == "" || methodName == r.URL.Path {
		writeNexError(w, "BAD_REQUEST", "missing operation name in path")
		return
	}

	// Parse request body
	var opReq OperationRequest
	if err := json.NewDecoder(r.Body).Decode(&opReq); err != nil {
		writeNexError(w, "BAD_REQUEST", fmt.Sprintf("invalid JSON body: %v", err))
		return
	}

	// Use payload from envelope, default to empty map
	payload := opReq.Payload
	if payload == nil {
		payload = map[string]interface{}{}
	}

	// Look up handler
	handlers := s.buildNexOperationHandlers()
	handler, ok := handlers[methodName]
	if !ok {
		writeNexError(w, "NOT_FOUND", fmt.Sprintf("unknown operation: %s", methodName))
		return
	}

	// Execute handler
	result, err := handler(payload)
	if err != nil {
		writeNexError(w, "INTERNAL_ERROR", err.Error())
		return
	}

	// Return success
	writeJSON(w, http.StatusOK, OperationResponse{Result: result})
}

func writeNexError(w http.ResponseWriter, code string, message string) {
	writeJSON(w, http.StatusOK, OperationResponse{
		Error: &OperationError{
			Code:    code,
			Message: message,
		},
	})
}

// ---------------------------------------------------------------------------
// Payload helpers — extract typed values from map[string]interface{}
// ---------------------------------------------------------------------------

func payloadStr(p map[string]interface{}, key string) string {
	v, ok := p[key]
	if !ok {
		return ""
	}
	s, ok := v.(string)
	if !ok {
		return fmt.Sprintf("%v", v)
	}
	return s
}

func payloadInt(p map[string]interface{}, key string, defaultVal int) int {
	v, ok := p[key]
	if !ok {
		return defaultVal
	}
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case json.Number:
		i, err := n.Int64()
		if err != nil {
			return defaultVal
		}
		return int(i)
	default:
		return defaultVal
	}
}

func payloadInt64(p map[string]interface{}, key string, defaultVal int64) int64 {
	v, ok := p[key]
	if !ok {
		return defaultVal
	}
	switch n := v.(type) {
	case float64:
		return int64(n)
	case int:
		return int64(n)
	case int64:
		return n
	case json.Number:
		i, err := n.Int64()
		if err != nil {
			return defaultVal
		}
		return i
	default:
		return defaultVal
	}
}

func payloadBool(p map[string]interface{}, key string) bool {
	v, ok := p[key]
	if !ok {
		return false
	}
	b, ok := v.(bool)
	if !ok {
		return false
	}
	return b
}

func payloadMap(p map[string]interface{}, key string) map[string]interface{} {
	v, ok := p[key]
	if !ok {
		return nil
	}
	m, ok := v.(map[string]interface{})
	if !ok {
		return nil
	}
	return m
}

func payloadStrPtr(p map[string]interface{}, key string) *string {
	v, ok := p[key]
	if !ok {
		return nil
	}
	s, ok := v.(string)
	if !ok {
		return nil
	}
	return &s
}
