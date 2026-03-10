package tree

import (
	"context"
	"fmt"
	"strings"

	"github.com/Napageneral/spike/internal/broker"
)

// PromptExecutor is the execution substrate used by the Spike DAG.
// The broker-backed implementation is temporary scaffolding until the Nex
// execution caller path is ready for the hard cutover.
type PromptExecutor interface {
	PrepareNode(ctx context.Context, req NodeExecutionScope) error
	ExecutePrompt(ctx context.Context, req PromptExecutionRequest) (*PromptExecutionResult, error)
}

type NodeExecutionScope struct {
	AgentID  string
	ScopeAbs string
}

type PromptExecutionRequest struct {
	RequestID    string
	NodeID       string
	Phase        AskPhase
	Attempt      int
	Origin       string
	Prompt       string
	SystemPrompt string
	WorkDir      string
}

type PromptExecutionResult struct {
	Backend    string
	SessionKey string
	RunID      string
	Content    string
}

type brokerPromptExecutor struct {
	broker              *broker.Broker
	sessionDir          string
	provider            string
	model               string
	thinkingLevel       string
	scopeKey            string
	refName             string
	commitSHA           string
	treeFlavor          string
	treeVersionID       string
	sessionLabelBuilder func(nodeID string) string
}

func newBrokerPromptExecutor(br *broker.Broker, cfg brokerPromptExecutor) PromptExecutor {
	if br == nil {
		return nil
	}
	cfg.broker = br
	return &cfg
}

func (e *brokerPromptExecutor) PrepareNode(_ context.Context, req NodeExecutionScope) error {
	if e == nil || e.broker == nil {
		return fmt.Errorf("execution runtime is not configured")
	}
	_, err := e.broker.RegisterOrUpdateAgent(
		strings.TrimSpace(req.AgentID),
		broker.RoleLeafMapper,
		strings.TrimSpace(req.ScopeAbs),
	)
	return err
}

func (e *brokerPromptExecutor) ExecutePrompt(ctx context.Context, req PromptExecutionRequest) (*PromptExecutionResult, error) {
	if e == nil || e.broker == nil {
		return nil, fmt.Errorf("execution runtime is not configured")
	}
	if e.sessionLabelBuilder == nil {
		return nil, fmt.Errorf("session label builder is not configured")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	sessionLabel := e.sessionLabelBuilder(req.NodeID)
	if _, err := e.broker.CreateSession(sessionLabel, broker.SessionOptions{
		PersonaID:     "oracle",
		Origin:        strings.TrimSpace(req.Origin),
		WorkDir:       strings.TrimSpace(req.WorkDir),
		Provider:      strings.TrimSpace(e.provider),
		Model:         strings.TrimSpace(e.model),
		SystemPrompt:  strings.TrimSpace(req.SystemPrompt),
		SessionDir:    strings.TrimSpace(e.sessionDir),
		ThinkLevel:    strings.TrimSpace(e.thinkingLevel),
		ScopeKey:      strings.TrimSpace(e.scopeKey),
		RefName:       strings.TrimSpace(e.refName),
		CommitSHA:     strings.TrimSpace(e.commitSHA),
		TreeFlavor:    strings.TrimSpace(e.treeFlavor),
		TreeVersionID: strings.TrimSpace(e.treeVersionID),
	}); err != nil {
		return nil, err
	}

	result, err := e.broker.Execute(ctx, sessionLabel, strings.TrimSpace(req.Prompt))
	if err != nil {
		return &PromptExecutionResult{
			Backend:    "broker",
			SessionKey: sessionLabel,
		}, err
	}
	if result == nil {
		_ = e.broker.StopSession(sessionLabel)
		return &PromptExecutionResult{
			Backend:    "broker",
			SessionKey: sessionLabel,
		}, nil
	}
	out := strings.TrimSpace(result.Content)
	_ = e.broker.StopSession(sessionLabel)
	return &PromptExecutionResult{
		Backend:    "broker",
		SessionKey: sessionLabel,
		Content:    out,
	}, nil
}
