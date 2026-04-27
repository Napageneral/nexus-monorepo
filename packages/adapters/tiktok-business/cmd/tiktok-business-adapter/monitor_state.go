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
	tiktokBusinessAdapterStateDirEnv         = "NEXUS_ADAPTER_STATE_DIR"
	tiktokBusinessMonitorStateVersion        = 1
	tiktokBusinessHotReportLookback          = 2 * time.Hour
	tiktokBusinessDailyReportLookback        = 72 * time.Hour
	tiktokBusinessSnapshotMonitorInterval    = 30 * time.Minute
	tiktokBusinessDailyReportMonitorInterval = 30 * time.Minute
)

type tiktokBusinessMonitorFamily string

const (
	tiktokBusinessMonitorFamilyCampaignSnapshot tiktokBusinessMonitorFamily = "campaign_snapshot"
	tiktokBusinessMonitorFamilyAdGroupSnapshot  tiktokBusinessMonitorFamily = "adgroup_snapshot"
	tiktokBusinessMonitorFamilyAdSnapshot       tiktokBusinessMonitorFamily = "ad_snapshot"
	tiktokBusinessMonitorFamilyCampaignDaily    tiktokBusinessMonitorFamily = "campaign_daily"
	tiktokBusinessMonitorFamilyAdGroupDaily     tiktokBusinessMonitorFamily = "adgroup_daily"
	tiktokBusinessMonitorFamilyAdDaily          tiktokBusinessMonitorFamily = "ad_daily"
	tiktokBusinessMonitorFamilyAdvertiserHourly tiktokBusinessMonitorFamily = "advertiser_hourly"
)

type tiktokBusinessMonitorState struct {
	Version  int                                                        `json:"version"`
	Families map[tiktokBusinessMonitorFamily]*tiktokBusinessFamilyState `json:"families,omitempty"`
	Metrics  map[tiktokBusinessMonitorFamily]*tiktokBusinessFamilyStats `json:"metrics,omitempty"`
}

type tiktokBusinessFamilyState struct {
	CursorAt   time.Time `json:"cursor_at,omitempty"`
	LastPollAt time.Time `json:"last_poll_at,omitempty"`
}

type tiktokBusinessFamilyStats struct {
	LastCycleAt     time.Time `json:"last_cycle_at,omitempty"`
	LastAttempted   int       `json:"last_attempted,omitempty"`
	LastEmitted     int       `json:"last_emitted,omitempty"`
	LastSuppressed  int       `json:"last_suppressed,omitempty"`
	TotalAttempted  int       `json:"total_attempted,omitempty"`
	TotalEmitted    int       `json:"total_emitted,omitempty"`
	TotalSuppressed int       `json:"total_suppressed,omitempty"`
}

type tiktokBusinessRevisionStore struct {
	path      string
	revisions map[tiktokBusinessMonitorFamily]map[string]string
	dirty     bool
}

type tiktokBusinessMonitorEmitter struct {
	state    *tiktokBusinessMonitorState
	store    *tiktokBusinessRevisionStore
	pollTime time.Time
	emit     nexadapter.EmitFunc
	err      error
	changed  bool
}

func resolveTikTokBusinessAdapterStateDir() (string, error) {
	if stateDir := strings.TrimSpace(os.Getenv(tiktokBusinessAdapterStateDirEnv)); stateDir != "" {
		return stateDir, nil
	}
	return "", errors.New("missing adapter state dir (expected $NEXUS_ADAPTER_STATE_DIR)")
}

func loadTikTokBusinessMonitorState(connectionID string) (*tiktokBusinessMonitorState, error) {
	stateDir, err := resolveTikTokBusinessAdapterStateDir()
	if err != nil {
		return nil, err
	}
	path := tiktokBusinessMonitorStatePath(stateDir, connectionID)
	payload, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return defaultTikTokBusinessMonitorState(), nil
		}
		return nil, fmt.Errorf("read TikTok Business monitor state: %w", err)
	}
	state := defaultTikTokBusinessMonitorState()
	if err := json.Unmarshal(payload, state); err != nil {
		return defaultTikTokBusinessMonitorState(), nil
	}
	if state.Families == nil {
		state.Families = map[tiktokBusinessMonitorFamily]*tiktokBusinessFamilyState{}
	}
	if state.Metrics == nil {
		state.Metrics = map[tiktokBusinessMonitorFamily]*tiktokBusinessFamilyStats{}
	}
	return state, nil
}

func saveTikTokBusinessMonitorState(connectionID string, state *tiktokBusinessMonitorState) error {
	stateDir, err := resolveTikTokBusinessAdapterStateDir()
	if err != nil {
		return err
	}
	path := tiktokBusinessMonitorStatePath(stateDir, connectionID)
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

func defaultTikTokBusinessMonitorState() *tiktokBusinessMonitorState {
	return &tiktokBusinessMonitorState{
		Version:  tiktokBusinessMonitorStateVersion,
		Families: map[tiktokBusinessMonitorFamily]*tiktokBusinessFamilyState{},
		Metrics:  map[tiktokBusinessMonitorFamily]*tiktokBusinessFamilyStats{},
	}
}

func tiktokBusinessMonitorStatePath(stateDir string, connectionID string) string {
	return filepath.Join(stateDir, "tiktok-business", connectionID, "monitor-state.json")
}

func (state *tiktokBusinessMonitorState) family(name tiktokBusinessMonitorFamily) *tiktokBusinessFamilyState {
	if state.Families == nil {
		state.Families = map[tiktokBusinessMonitorFamily]*tiktokBusinessFamilyState{}
	}
	if familyState, ok := state.Families[name]; ok && familyState != nil {
		return familyState
	}
	familyState := &tiktokBusinessFamilyState{}
	state.Families[name] = familyState
	return familyState
}

func (state *tiktokBusinessMonitorState) metrics(name tiktokBusinessMonitorFamily) *tiktokBusinessFamilyStats {
	if state.Metrics == nil {
		state.Metrics = map[tiktokBusinessMonitorFamily]*tiktokBusinessFamilyStats{}
	}
	if metrics, ok := state.Metrics[name]; ok && metrics != nil {
		return metrics
	}
	metrics := &tiktokBusinessFamilyStats{}
	state.Metrics[name] = metrics
	return metrics
}

func (state *tiktokBusinessFamilyState) due(now time.Time, interval time.Duration) bool {
	if state.LastPollAt.IsZero() {
		return true
	}
	return !state.LastPollAt.Add(interval).After(now.UTC())
}

func (state *tiktokBusinessFamilyState) advance(pollTime time.Time, latest time.Time) {
	if latest.After(state.CursorAt) {
		state.CursorAt = latest.UTC()
	}
	state.LastPollAt = pollTime.UTC()
}

func (metrics *tiktokBusinessFamilyStats) beginCycle(pollTime time.Time) {
	metrics.LastCycleAt = pollTime.UTC()
	metrics.LastAttempted = 0
	metrics.LastEmitted = 0
	metrics.LastSuppressed = 0
}

func loadTikTokBusinessRevisionStore(connectionID string) (*tiktokBusinessRevisionStore, error) {
	stateDir, err := resolveTikTokBusinessAdapterStateDir()
	if err != nil {
		return nil, err
	}
	path := filepath.Join(stateDir, "tiktok-business", connectionID, "monitor-revisions.json")
	store := &tiktokBusinessRevisionStore{
		path:      path,
		revisions: map[tiktokBusinessMonitorFamily]map[string]string{},
	}
	payload, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return store, nil
		}
		return nil, fmt.Errorf("read TikTok Business monitor revisions: %w", err)
	}
	if err := json.Unmarshal(payload, &store.revisions); err != nil {
		return &tiktokBusinessRevisionStore{
			path:      path,
			revisions: map[tiktokBusinessMonitorFamily]map[string]string{},
		}, nil
	}
	if store.revisions == nil {
		store.revisions = map[tiktokBusinessMonitorFamily]map[string]string{}
	}
	return store, nil
}

func (store *tiktokBusinessRevisionStore) IsDuplicateRevision(family tiktokBusinessMonitorFamily, logicalRowID string, revisionHash string) bool {
	if store == nil {
		return false
	}
	familyRevisions := store.revisions[family]
	if familyRevisions == nil {
		return false
	}
	return strings.TrimSpace(familyRevisions[strings.TrimSpace(logicalRowID)]) == strings.TrimSpace(revisionHash)
}

func (store *tiktokBusinessRevisionStore) PutRevision(family tiktokBusinessMonitorFamily, logicalRowID string, revisionHash string) {
	if store == nil {
		return
	}
	if store.revisions == nil {
		store.revisions = map[tiktokBusinessMonitorFamily]map[string]string{}
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

func (store *tiktokBusinessRevisionStore) SaveIfDirty() error {
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

func newTikTokBusinessMonitorEmitter(state *tiktokBusinessMonitorState, store *tiktokBusinessRevisionStore, pollTime time.Time, emit nexadapter.EmitFunc) *tiktokBusinessMonitorEmitter {
	return &tiktokBusinessMonitorEmitter{
		state:    state,
		store:    store,
		pollTime: pollTime.UTC(),
		emit:     emit,
	}
}

func (emitter *tiktokBusinessMonitorEmitter) Emit(record any) {
	if emitter.err != nil {
		return
	}
	inbound, ok := record.(nexadapter.AdapterInboundRecord)
	if !ok {
		emitter.emit(record)
		return
	}

	family, logicalRowID, revisionHash := tiktokBusinessMonitorRecordKeys(inbound)
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

func (emitter *tiktokBusinessMonitorEmitter) Err() error {
	return emitter.err
}

func (emitter *tiktokBusinessMonitorEmitter) StateChanged() bool {
	return emitter.changed
}

func tiktokBusinessMonitorRecordKeys(record nexadapter.AdapterInboundRecord) (tiktokBusinessMonitorFamily, string, string) {
	metadata := record.Payload.Metadata
	if metadata == nil {
		return "", "", ""
	}
	family := tiktokBusinessMonitorFamily(metadataString(metadata, "family"))
	logicalRowID := metadataString(metadata, "logical_row_id")
	revisionHash := metadataString(metadata, "revision_hash")
	return family, logicalRowID, revisionHash
}

func logTikTokBusinessMonitorMetrics(state *tiktokBusinessMonitorState, pollTime time.Time) {
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
		metrics := state.metrics(tiktokBusinessMonitorFamily(familyName))
		nexadapter.LogInfo("tiktok business monitor metrics family=%s attempted=%d emitted=%d suppressed=%d", familyName, metrics.LastAttempted, metrics.LastEmitted, metrics.LastSuppressed)
	}
}

func metadataString(metadata map[string]any, key string) string {
	value, ok := metadata[key]
	if !ok {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func maxTime(left time.Time, right time.Time) time.Time {
	if right.After(left) {
		return right
	}
	return left
}
