package nexadapter

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// CheckpointLineKind is the discriminator of the checkpoint stdout line: {"nex":"checkpoint",...}.
const CheckpointLineKind = "checkpoint"

var checkpointScopePattern = regexp.MustCompile(`^[a-z][a-z0-9-]{0,63}$`)

// Checkpoint is one durable cursor an adapter hands back to the runtime (P-9.2). On monitor and
// backfill stdout it is emitted as a line after the records it completes; in a method result it
// rides the "checkpoint" field (one Checkpoint or a slice). The runtime persists it as an
// epoch-fenced row and injects it back through RuntimeContext.Checkpoints.
type Checkpoint struct {
	Nex   string `json:"nex"`
	Scope string `json:"scope"`
	Key   string `json:"key"`
	Value any    `json:"value"`
	// ExpectedVersion is an optional same-epoch compare-and-set; the runtime fills it from the
	// version it injected when nil.
	ExpectedVersion *int64 `json:"expected_version,omitempty"`
}

// NewCheckpoint builds a checkpoint line for scope/key carrying value.
func NewCheckpoint(scope, key string, value any) Checkpoint {
	return Checkpoint{Nex: CheckpointLineKind, Scope: scope, Key: key, Value: value}
}

// CheckpointContextKey is the RuntimeContext.Checkpoints key for scope/key.
func CheckpointContextKey(scope, key string) string {
	return scope + "/" + key
}

// Validate applies the runtime's rules: a lowercase scope token, a printable key of at most 256
// characters, a JSON value.
func (c Checkpoint) Validate() error {
	if c.Nex != CheckpointLineKind {
		return fmt.Errorf("checkpoint nex must be %q", CheckpointLineKind)
	}
	if !checkpointScopePattern.MatchString(c.Scope) {
		return fmt.Errorf("checkpoint scope must be a lowercase token: %q", c.Scope)
	}
	if c.Key == "" || len(c.Key) > 256 || strings.ContainsFunc(c.Key, func(r rune) bool { return r < 0x20 || r == 0x7f }) {
		return fmt.Errorf("checkpoint key must be a printable string of at most 256 characters")
	}
	if _, err := json.Marshal(c.Value); err != nil {
		return fmt.Errorf("checkpoint value must be JSON: %w", err)
	}
	return nil
}

// EmitCheckpoint validates and writes the checkpoint through the monitor's emit function, so it
// takes its place on stdout behind the records already emitted.
func EmitCheckpoint(emit EmitFunc, checkpoint Checkpoint) error {
	if err := checkpoint.Validate(); err != nil {
		return err
	}
	emit(checkpoint)
	return nil
}

// WithCheckpoint returns result as a map carrying the "checkpoint" field the runtime persists
// before answering the caller. result must marshal to a JSON object.
func WithCheckpoint(result any, checkpoints ...Checkpoint) (map[string]any, error) {
	encoded, err := json.Marshal(result)
	if err != nil {
		return nil, fmt.Errorf("encode method result: %w", err)
	}
	var object map[string]any
	if err := json.Unmarshal(encoded, &object); err != nil {
		return nil, fmt.Errorf("method result must be a JSON object to carry a checkpoint: %w", err)
	}
	if object == nil {
		object = map[string]any{}
	}
	for _, checkpoint := range checkpoints {
		if err := checkpoint.Validate(); err != nil {
			return nil, err
		}
	}
	if len(checkpoints) > 0 {
		object["checkpoint"] = checkpoints
	}
	return object, nil
}
