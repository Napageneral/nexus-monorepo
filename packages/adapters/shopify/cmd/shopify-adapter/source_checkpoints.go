package main

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"sync"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

// Runtime-owned source checkpoints (Nex P-9.2, runtime context version 2). When the runtime
// injects `checkpoints`, the per-family cursor state no longer lives in
// source-observation/<connection>/state.json: every shopify.source.* invocation (one process each)
// seeds its state from the "source/<family>" rows, mutates it in memory under
// withLockedSourceState, and returns the families it changed as the result's `checkpoint` field,
// which the runtime persists (epoch-fenced) before it answers the caller. Without an injected
// checkpoints field (an older runtime) the file and its flock stay. The request governor is a
// pacing cache and stays a local file either way.
const shopifySourceCheckpointScope = "source"

type managedSourceState struct {
	mu           sync.Mutex
	connectionID string
	state        *shopifySourceState
	seeded       map[string]string // family -> canonical JSON as injected
}

var managedSourceStates = struct {
	mu           sync.Mutex
	byConnection map[string]*managedSourceState
}{byConnection: map[string]*managedSourceState{}}

// enableManagedSourceState seeds the in-memory source state for connectionID from the runtime's
// checkpoints. Returns whether the runtime owns them.
func enableManagedSourceState(connectionID string, runtimeCtx *nexadapter.RuntimeContext) (bool, error) {
	connectionID = strings.TrimSpace(connectionID)
	if connectionID == "" || !runtimeCtx.ManagedCheckpoints() {
		return false, nil
	}
	state := &shopifySourceState{Version: shopifySourceStateVersion, Families: map[string]shopifySourceFamilyState{}}
	seeded := map[string]string{}
	prefix := shopifySourceCheckpointScope + "/"
	for contextKey, raw := range runtimeCtx.Checkpoints {
		if !strings.HasPrefix(contextKey, prefix) {
			continue
		}
		family := strings.TrimPrefix(contextKey, prefix)
		if _, err := sourceFamilySpec(family); err != nil {
			continue
		}
		var familyState shopifySourceFamilyState
		if err := json.Unmarshal(raw, &familyState); err != nil {
			return true, fmt.Errorf("decode Shopify source checkpoint %s: %w", family, err)
		}
		state.Families[family] = familyState
		encoded, _ := json.Marshal(familyState)
		seeded[family] = string(encoded)
	}
	managedSourceStates.mu.Lock()
	defer managedSourceStates.mu.Unlock()
	managedSourceStates.byConnection[connectionID] = &managedSourceState{connectionID: connectionID, state: state, seeded: seeded}
	return true, nil
}

func managedSourceStateFor(connectionID string) *managedSourceState {
	managedSourceStates.mu.Lock()
	defer managedSourceStates.mu.Unlock()
	return managedSourceStates.byConnection[strings.TrimSpace(connectionID)]
}

// disableManagedSourceState forgets the connection's in-memory state (tests).
func disableManagedSourceState(connectionID string) {
	managedSourceStates.mu.Lock()
	defer managedSourceStates.mu.Unlock()
	delete(managedSourceStates.byConnection, strings.TrimSpace(connectionID))
}

func (m *managedSourceState) with(fn func(*shopifySourceState) error) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return fn(m.state)
}

// changedCheckpoints returns one checkpoint per family whose state differs from what the runtime
// injected (or that did not exist), in a stable order.
func (m *managedSourceState) changedCheckpoints() []nexadapter.Checkpoint {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []nexadapter.Checkpoint
	for _, family := range shopifySourceFamilyValues {
		familyState, ok := m.state.Families[family]
		if !ok {
			continue
		}
		encoded, err := json.Marshal(familyState)
		if err != nil {
			continue
		}
		seeded, present := m.seeded[family]
		if present && seeded == string(encoded) {
			continue
		}
		if !present && reflect.DeepEqual(familyState, shopifySourceFamilyState{}) {
			continue
		}
		out = append(out, nexadapter.NewCheckpoint(shopifySourceCheckpointScope, family, familyState))
	}
	return out
}

// withSourceCheckpoints attaches the changed families to a shopify.source.* result when the
// runtime owns the checkpoints; otherwise the result passes through untouched.
func withSourceCheckpoints(connectionID string, result any) (any, error) {
	managed := managedSourceStateFor(connectionID)
	if managed == nil {
		return result, nil
	}
	checkpoints := managed.changedCheckpoints()
	if len(checkpoints) == 0 {
		return result, nil
	}
	return nexadapter.WithCheckpoint(result, checkpoints...)
}
