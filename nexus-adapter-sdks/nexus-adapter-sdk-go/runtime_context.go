package nexadapter

import (
	"encoding/json"
	"fmt"
	"os"
)

// AdapterContextEnvVar is the canonical injection mechanism for adapter runtime context.
// NEX writes an ephemeral JSON file (0600) and passes its path via this env var.
const AdapterContextEnvVar = "NEXUS_ADAPTER_CONTEXT_PATH"

// RuntimeContext is the injected configuration + resolved credential used by adapters at runtime.
//
// This is a process boundary contract (NEX -> adapter). Keep it stable.
type RuntimeContext struct {
	Version   int            `json:"version,omitempty"`
	Channel   string         `json:"channel"`
	AccountID string         `json:"account_id"`
	Config    map[string]any `json:"config"`

	// Credential is optional; adapters may run in unauthenticated mode.
	Credential *RuntimeCredential `json:"credential,omitempty"`
}

// RuntimeCredential is the resolved plaintext secret injected by NEX.
// The canonical shape is { kind, value }.
//
// For transition/back-compat, NEX may also include identifying fields (ref/service/account).
type RuntimeCredential struct {
	Kind  string `json:"kind,omitempty"` // "token", "oauth", ...
	Value string `json:"value"`

	Ref     string `json:"ref,omitempty"`
	Service string `json:"service,omitempty"`
	Account string `json:"account,omitempty"`
}

// LoadRuntimeContextFromEnv reads and parses the runtime context file pointed to by
// $NEXUS_ADAPTER_CONTEXT_PATH.
func LoadRuntimeContextFromEnv() (*RuntimeContext, error) {
	p := os.Getenv(AdapterContextEnvVar)
	if p == "" {
		return nil, fmt.Errorf("missing runtime context (expected $%s)", AdapterContextEnvVar)
	}
	return LoadRuntimeContextFile(p)
}

// LoadRuntimeContextFile reads and parses a runtime context JSON file.
func LoadRuntimeContextFile(path string) (*RuntimeContext, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read runtime context: %w", err)
	}

	var ctx RuntimeContext
	if err := json.Unmarshal(raw, &ctx); err != nil {
		return nil, fmt.Errorf("parse runtime context json: %w", err)
	}

	if ctx.Channel == "" {
		return nil, fmt.Errorf("runtime context missing channel")
	}
	if ctx.AccountID == "" {
		return nil, fmt.Errorf("runtime context missing account_id")
	}
	if ctx.Config == nil {
		ctx.Config = map[string]any{}
	}

	// Back-compat: legacy injection omitted `kind` but included `value`.
	if ctx.Credential != nil {
		if ctx.Credential.Value == "" {
			return nil, fmt.Errorf("runtime context credential missing value")
		}
		if ctx.Credential.Kind == "" {
			ctx.Credential.Kind = "token"
		}
	}

	return &ctx, nil
}

