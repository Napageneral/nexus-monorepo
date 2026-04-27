package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	googleAdapterStateDirEnv             = "NEXUS_ADAPTER_STATE_DIR"
	googleMonitorStateVersion            = 1
	googleHotReportLookback              = 2 * time.Hour
	googleDailyReportLookback            = 72 * time.Hour
	googleDailyReportMonitorInterval     = 30 * time.Minute
	googleAccountSnapshotMonitorInterval = 24 * time.Hour
)

type googleMonitorFamily string

const (
	googleMonitorFamilyAccountAccessSnapshot googleMonitorFamily = "account_access_snapshot"
	googleMonitorFamilyCampaignDaily         googleMonitorFamily = "campaign_daily"
	googleMonitorFamilyAdGroupDaily          googleMonitorFamily = "ad_group_daily"
	googleMonitorFamilyAdDaily               googleMonitorFamily = "ad_daily"
	googleMonitorFamilyCampaignHourly        googleMonitorFamily = "campaign_hourly"
)

type googleMonitorState struct {
	Version  int                                        `json:"version"`
	Families map[googleMonitorFamily]*googleFamilyState `json:"families,omitempty"`
	Metrics  map[googleMonitorFamily]*googleFamilyStats `json:"metrics,omitempty"`
}

type googleFamilyState struct {
	CursorAt   time.Time `json:"cursor_at,omitempty"`
	LastPollAt time.Time `json:"last_poll_at,omitempty"`
}

type googleFamilyStats struct {
	LastCycleAt     time.Time `json:"last_cycle_at,omitempty"`
	LastAttempted   int       `json:"last_attempted,omitempty"`
	LastEmitted     int       `json:"last_emitted,omitempty"`
	LastSuppressed  int       `json:"last_suppressed,omitempty"`
	TotalAttempted  int       `json:"total_attempted,omitempty"`
	TotalEmitted    int       `json:"total_emitted,omitempty"`
	TotalSuppressed int       `json:"total_suppressed,omitempty"`
}

type googleRevisionStore struct {
	path      string
	revisions map[googleMonitorFamily]map[string]string
	dirty     bool
}

type googleMonitorEmitter struct {
	state   *googleMonitorState
	store   *googleRevisionStore
	emit    nexadapter.EmitFunc
	changed bool
}

func resolveGoogleAdapterStateDir() (string, error) {
	if stateDir := strings.TrimSpace(os.Getenv(googleAdapterStateDirEnv)); stateDir != "" {
		return stateDir, nil
	}
	return "", errors.New("missing adapter state dir (expected $NEXUS_ADAPTER_STATE_DIR)")
}

func loadGoogleMonitorState(connectionID string) (*googleMonitorState, error) {
	stateDir, err := resolveGoogleAdapterStateDir()
	if err != nil {
		return nil, err
	}
	path := googleMonitorStatePath(stateDir, connectionID)
	payload, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return defaultGoogleMonitorState(), nil
		}
		return nil, fmt.Errorf("read Google Ads monitor state: %w", err)
	}
	state := defaultGoogleMonitorState()
	if err := json.Unmarshal(payload, state); err != nil {
		return defaultGoogleMonitorState(), nil
	}
	if state.Families == nil {
		state.Families = map[googleMonitorFamily]*googleFamilyState{}
	}
	if state.Metrics == nil {
		state.Metrics = map[googleMonitorFamily]*googleFamilyStats{}
	}
	return state, nil
}

func saveGoogleMonitorState(connectionID string, state *googleMonitorState) error {
	stateDir, err := resolveGoogleAdapterStateDir()
	if err != nil {
		return err
	}
	path := googleMonitorStatePath(stateDir, connectionID)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, append(payload, '\n'), 0o600); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

func defaultGoogleMonitorState() *googleMonitorState {
	return &googleMonitorState{
		Version:  googleMonitorStateVersion,
		Families: map[googleMonitorFamily]*googleFamilyState{},
		Metrics:  map[googleMonitorFamily]*googleFamilyStats{},
	}
}

func googleMonitorStatePath(stateDir string, connectionID string) string {
	return filepath.Join(stateDir, "google-ads", connectionID, "monitor-state.json")
}

func (state *googleMonitorState) family(name googleMonitorFamily) *googleFamilyState {
	if state.Families == nil {
		state.Families = map[googleMonitorFamily]*googleFamilyState{}
	}
	if familyState, ok := state.Families[name]; ok && familyState != nil {
		return familyState
	}
	familyState := &googleFamilyState{}
	state.Families[name] = familyState
	return familyState
}

func (state *googleMonitorState) metrics(name googleMonitorFamily) *googleFamilyStats {
	if state.Metrics == nil {
		state.Metrics = map[googleMonitorFamily]*googleFamilyStats{}
	}
	if metrics, ok := state.Metrics[name]; ok && metrics != nil {
		return metrics
	}
	metrics := &googleFamilyStats{}
	state.Metrics[name] = metrics
	return metrics
}

func (state *googleFamilyState) due(now time.Time, interval time.Duration) bool {
	if state.LastPollAt.IsZero() {
		return true
	}
	return !state.LastPollAt.Add(interval).After(now.UTC())
}

func (state *googleFamilyState) advance(pollTime time.Time, latest time.Time) {
	if latest.After(state.CursorAt) {
		state.CursorAt = latest.UTC()
	}
	state.LastPollAt = pollTime.UTC()
}

func (metrics *googleFamilyStats) beginCycle(pollTime time.Time) {
	metrics.LastCycleAt = pollTime.UTC()
	metrics.LastAttempted = 0
	metrics.LastEmitted = 0
	metrics.LastSuppressed = 0
}

func loadGoogleRevisionStore(connectionID string) (*googleRevisionStore, error) {
	stateDir, err := resolveGoogleAdapterStateDir()
	if err != nil {
		return nil, err
	}
	path := filepath.Join(stateDir, "google-ads", connectionID, "monitor-revisions.json")
	store := &googleRevisionStore{
		path:      path,
		revisions: map[googleMonitorFamily]map[string]string{},
	}
	payload, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return store, nil
		}
		return nil, fmt.Errorf("read Google Ads monitor revisions: %w", err)
	}
	if err := json.Unmarshal(payload, &store.revisions); err != nil {
		return &googleRevisionStore{
			path:      path,
			revisions: map[googleMonitorFamily]map[string]string{},
		}, nil
	}
	if store.revisions == nil {
		store.revisions = map[googleMonitorFamily]map[string]string{}
	}
	return store, nil
}

func (store *googleRevisionStore) IsDuplicateRevision(family googleMonitorFamily, logicalRowID string, revisionHash string) bool {
	if store == nil {
		return false
	}
	familyRevisions := store.revisions[family]
	if familyRevisions == nil {
		return false
	}
	return strings.TrimSpace(familyRevisions[strings.TrimSpace(logicalRowID)]) == strings.TrimSpace(revisionHash)
}

func (store *googleRevisionStore) PutRevision(family googleMonitorFamily, logicalRowID string, revisionHash string) {
	if store == nil {
		return
	}
	if store.revisions == nil {
		store.revisions = map[googleMonitorFamily]map[string]string{}
	}
	familyRevisions := store.revisions[family]
	if familyRevisions == nil {
		familyRevisions = map[string]string{}
		store.revisions[family] = familyRevisions
	}
	key := strings.TrimSpace(logicalRowID)
	value := strings.TrimSpace(revisionHash)
	if familyRevisions[key] == value {
		return
	}
	familyRevisions[key] = value
	store.dirty = true
}

func (store *googleRevisionStore) SaveIfDirty() error {
	if store == nil || !store.dirty {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(store.path), 0o700); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(store.revisions, "", "  ")
	if err != nil {
		return err
	}
	tmpPath := store.path + ".tmp"
	if err := os.WriteFile(tmpPath, append(payload, '\n'), 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, store.path); err != nil {
		return err
	}
	store.dirty = false
	return nil
}

func newGoogleMonitorEmitter(state *googleMonitorState, store *googleRevisionStore, emit nexadapter.EmitFunc) *googleMonitorEmitter {
	return &googleMonitorEmitter{
		state: state,
		store: store,
		emit:  emit,
	}
}

func (emitter *googleMonitorEmitter) Emit(record any) {
	inbound, ok := record.(nexadapter.AdapterInboundRecord)
	if !ok {
		emitter.emit(record)
		return
	}

	family, logicalRowID, revisionHash := googleMonitorRecordKeys(inbound)
	if family == "" || logicalRowID == "" || revisionHash == "" {
		emitter.emit(inbound)
		return
	}

	metrics := emitter.state.metrics(family)
	metrics.LastAttempted++
	metrics.TotalAttempted++

	if emitter.store.IsDuplicateRevision(family, logicalRowID, revisionHash) {
		metrics.LastSuppressed++
		metrics.TotalSuppressed++
		emitter.changed = true
		return
	}

	emitter.emit(inbound)
	emitter.store.PutRevision(family, logicalRowID, revisionHash)
	metrics.LastEmitted++
	metrics.TotalEmitted++
	emitter.changed = true
}

func (emitter *googleMonitorEmitter) StateChanged() bool {
	return emitter.changed
}

func googleMonitorRecordKeys(record nexadapter.AdapterInboundRecord) (googleMonitorFamily, string, string) {
	metadata := record.Payload.Metadata
	if metadata == nil {
		return "", "", ""
	}
	family := googleMonitorFamily(googleMetadataString(metadata, "family"))
	logicalRowID := googleMetadataString(metadata, "logical_row_id")
	revisionHash := googleMetadataString(metadata, "revision_hash")
	return family, logicalRowID, revisionHash
}

func logGoogleMonitorMetrics(state *googleMonitorState, pollTime time.Time) {
	if state == nil {
		return
	}
	families := make([]string, 0, len(state.Metrics))
	for family, metrics := range state.Metrics {
		if metrics == nil || !metrics.LastCycleAt.Equal(pollTime.UTC()) || metrics.LastAttempted == 0 {
			continue
		}
		families = append(families, string(family))
	}
	sort.Strings(families)
	for _, familyName := range families {
		metrics := state.metrics(googleMonitorFamily(familyName))
		nexadapter.LogInfo("google ads monitor metrics family=%s attempted=%d emitted=%d suppressed=%d", familyName, metrics.LastAttempted, metrics.LastEmitted, metrics.LastSuppressed)
	}
}

func googleMetadataString(metadata map[string]any, key string) string {
	value, ok := metadata[key]
	if !ok {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}
