package nexadapter

import (
	"encoding/json"
	"fmt"
	"os"
)

// AdapterContextEnvVar is the canonical injection mechanism for adapter runtime context.
// NEX writes an ephemeral JSON file (0600) and passes its path via this env var.
const AdapterContextEnvVar = "NEXUS_ADAPTER_CONTEXT_PATH"

// AdapterStateDirEnvVar points to the canonical writable state root for one adapter package.
const AdapterStateDirEnvVar = "NEXUS_ADAPTER_STATE_DIR"

// RuntimeContext is the injected configuration + resolved credential used by adapters at runtime.
//
// This is a process boundary contract (NEX -> adapter). Keep it stable.
type RuntimeContext struct {
	Version      int            `json:"version,omitempty"`
	Platform     string         `json:"platform"`
	ConnectionID string         `json:"connection_id"`
	Config       map[string]any `json:"config"`

	// Credential is optional; adapters may run in unauthenticated mode.
	Credential *RuntimeCredential `json:"credential,omitempty"`

	// Checkpoints (runtime context version 2, P-9.2) carries the adapter's durable cursors as the
	// runtime persisted them, keyed "<scope>/<key>", verbatim JSON. Nil means the runtime predates
	// checkpoints (keep any file-backed behaviour); an empty map means the runtime owns them and
	// none exists yet (cold start). Adapters hand new values back with EmitCheckpoint or a
	// "checkpoint" field in a method result; they never write a durable cursor file themselves.
	Checkpoints map[string]json.RawMessage `json:"checkpoints,omitempty"`
}

// ManagedCheckpoints reports whether the runtime owns this adapter's checkpoints (context v2).
func (ctx *RuntimeContext) ManagedCheckpoints() bool {
	return ctx != nil && ctx.Checkpoints != nil
}

// Checkpoint decodes the checkpoint stored under scope/key into out. It returns false when the
// runtime holds no value for the key (a cold start), and an error only for undecodable JSON.
func (ctx *RuntimeContext) Checkpoint(scope, key string, out any) (bool, error) {
	if ctx == nil || ctx.Checkpoints == nil {
		return false, nil
	}
	raw, ok := ctx.Checkpoints[CheckpointContextKey(scope, key)]
	if !ok || len(raw) == 0 {
		return false, nil
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return false, fmt.Errorf("decode checkpoint %s/%s: %w", scope, key, err)
	}
	return true, nil
}

// RuntimeCredential is the resolved plaintext secret injected by NEX.
// The canonical shape is { kind, value }.
//
// For transition/back-compat, NEX may also include identifying fields (ref/service/account).
type RuntimeCredential struct {
	Kind  string `json:"kind,omitempty"` // "token", "oauth", ...
	Value string `json:"value"`

	Fields map[string]string `json:"fields,omitempty"`

	Ref     string `json:"ref,omitempty"`
	Service string `json:"service,omitempty"`
	Account string `json:"account,omitempty"`
	AuthID  string `json:"auth_id,omitempty"`
	Type    string `json:"type,omitempty"`
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

	if ctx.Platform == "" {
		return nil, fmt.Errorf("runtime context missing platform")
	}
	if ctx.ConnectionID == "" {
		return nil, fmt.Errorf("runtime context missing connection_id")
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

// LoadAdapterStateDirFromEnv returns the canonical writable adapter state root.
func LoadAdapterStateDirFromEnv() (string, error) {
	p := os.Getenv(AdapterStateDirEnvVar)
	if p == "" {
		return "", fmt.Errorf("missing adapter state dir (expected $%s)", AdapterStateDirEnvVar)
	}
	return p, nil
}
