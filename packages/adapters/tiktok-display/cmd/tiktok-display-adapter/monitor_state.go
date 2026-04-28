package main

import (
	"context"
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
	tiktokDisplayAdapterStateDirEnv    = "NEXUS_ADAPTER_STATE_DIR"
	tiktokDisplayMonitorStateVersion   = 1
	tiktokDisplayProfilePollInterval   = 10 * time.Minute
	tiktokDisplayDiscoveryPollInterval = 10 * time.Minute
	tiktokDisplayDiscoveryOverlap      = 6 * time.Hour
	tiktokDisplayHotRefreshInterval    = 10 * time.Minute
	tiktokDisplayWarmRefreshInterval   = 1 * time.Hour
	tiktokDisplayColdRefreshInterval   = 24 * time.Hour
	tiktokDisplayHotVideoAge           = 48 * time.Hour
	tiktokDisplayWarmVideoAge          = 14 * 24 * time.Hour
	tiktokDisplaySlowReconcileInterval = 24 * time.Hour
	tiktokDisplaySlowReconcileWindow   = 30 * 24 * time.Hour
	tiktokDisplayVideoRefreshTierHot   = "hot"
	tiktokDisplayVideoRefreshTierWarm  = "warm"
	tiktokDisplayVideoRefreshTierCold  = "cold"
)

type tiktokDisplayMonitorLane string

const (
	tiktokDisplayMonitorLaneBackfill      tiktokDisplayMonitorLane = "backfill"
	tiktokDisplayMonitorLaneProfile       tiktokDisplayMonitorLane = "profile_snapshot"
	tiktokDisplayMonitorLaneDiscovery     tiktokDisplayMonitorLane = "video_discovery"
	tiktokDisplayMonitorLaneActiveRefresh tiktokDisplayMonitorLane = "video_active_refresh"
	tiktokDisplayMonitorLaneReconcile     tiktokDisplayMonitorLane = "video_slow_reconcile"
)

type tiktokDisplayMonitorState struct {
	Version   int                                              `json:"version"`
	Profile   tiktokDisplayProfileMonitorState                 `json:"profile,omitempty"`
	Discovery tiktokDisplayDiscoveryMonitorState               `json:"discovery,omitempty"`
	Active    tiktokDisplayActiveRefreshMonitorState           `json:"active_refresh,omitempty"`
	Reconcile tiktokDisplayReconcileMonitorState               `json:"reconcile,omitempty"`
	Backfill  tiktokDisplayBackfillMonitorState                `json:"backfill,omitempty"`
	Videos    map[string]*tiktokDisplayVideoMonitorState       `json:"videos,omitempty"`
	Metrics   map[tiktokDisplayMonitorLane]*tiktokDisplayStats `json:"metrics,omitempty"`
}

type tiktokDisplayProfileMonitorState struct {
	LastRevisionHash string    `json:"last_revision_hash,omitempty"`
	LastObservedAt   time.Time `json:"last_observed_at,omitempty"`
	LastEmittedAt    time.Time `json:"last_emitted_at,omitempty"`
	LastPollAt       time.Time `json:"last_poll_at,omitempty"`
}

type tiktokDisplayDiscoveryMonitorState struct {
	NewestPublishedAt time.Time `json:"newest_published_at,omitempty"`
	NewestVideoIDs    []string  `json:"newest_video_ids,omitempty"`
	OverlapSeconds    int64     `json:"overlap_seconds,omitempty"`
	LastPollAt        time.Time `json:"last_poll_at,omitempty"`
	LastObserved      int       `json:"last_observed,omitempty"`
}

type tiktokDisplayActiveRefreshMonitorState struct {
	LastPollAt   time.Time `json:"last_poll_at,omitempty"`
	LastDue      int       `json:"last_due,omitempty"`
	LastObserved int       `json:"last_observed,omitempty"`
}

type tiktokDisplayReconcileMonitorState struct {
	LastPollAt   time.Time `json:"last_poll_at,omitempty"`
	LastFloor    time.Time `json:"last_floor,omitempty"`
	LastObserved int       `json:"last_observed,omitempty"`
	LastError    string    `json:"last_error,omitempty"`
}

type tiktokDisplayBackfillMonitorState struct {
	LastPollAt   time.Time `json:"last_poll_at,omitempty"`
	LastSince    time.Time `json:"last_since,omitempty"`
	LastObserved int       `json:"last_observed,omitempty"`
}

type tiktokDisplayVideoMonitorState struct {
	VideoID                 string    `json:"video_id,omitempty"`
	PublishedAt             time.Time `json:"published_at,omitempty"`
	LastRevisionHash        string    `json:"last_revision_hash,omitempty"`
	LastObservedAt          time.Time `json:"last_observed_at,omitempty"`
	LastEmittedAt           time.Time `json:"last_emitted_at,omitempty"`
	LastMetricChangeAt      time.Time `json:"last_metric_change_at,omitempty"`
	RefreshTier             string    `json:"refresh_tier,omitempty"`
	ConsecutiveUnchanged    int       `json:"consecutive_unchanged,omitempty"`
	LastSuccessfulRefreshAt time.Time `json:"last_successful_refresh_at,omitempty"`
}

type tiktokDisplayStats struct {
	LastCycleAt     time.Time `json:"last_cycle_at,omitempty"`
	LastAttempted   int       `json:"last_attempted,omitempty"`
	LastEmitted     int       `json:"last_emitted,omitempty"`
	LastSuppressed  int       `json:"last_suppressed,omitempty"`
	TotalAttempted  int       `json:"total_attempted,omitempty"`
	TotalEmitted    int       `json:"total_emitted,omitempty"`
	TotalSuppressed int       `json:"total_suppressed,omitempty"`
}

type tiktokDisplayRecordEmitter struct {
	state    *tiktokDisplayMonitorState
	lane     tiktokDisplayMonitorLane
	pollTime time.Time
	emit     nexadapter.EmitFunc
	changed  bool
}

type tiktokDisplayMonitorCycleResult struct {
	DueLanes        []tiktokDisplayMonitorLane
	SuccessfulLanes []tiktokDisplayMonitorLane
	FailedLanes     []tiktokDisplayMonitorLane
	StateChanged    bool
}

var tiktokDisplayMonitorMetricsLogging = true

func resolveTikTokDisplayAdapterStateDir() (string, error) {
	if raw := strings.TrimSpace(os.Getenv(tiktokDisplayAdapterStateDirEnv)); raw != "" {
		return raw, nil
	}
	return "", errors.New("missing adapter state dir (expected $NEXUS_ADAPTER_STATE_DIR)")
}

func loadOptionalTikTokDisplayMonitorState(connectionID string) (*tiktokDisplayMonitorState, bool, error) {
	if strings.TrimSpace(os.Getenv(tiktokDisplayAdapterStateDirEnv)) == "" {
		return defaultTikTokDisplayMonitorState(), false, nil
	}
	state, err := loadTikTokDisplayMonitorState(connectionID)
	return state, true, err
}

func loadTikTokDisplayMonitorState(connectionID string) (*tiktokDisplayMonitorState, error) {
	stateDir, err := resolveTikTokDisplayAdapterStateDir()
	if err != nil {
		return nil, err
	}
	path := tiktokDisplayMonitorStatePath(stateDir, connectionID)
	payload, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return defaultTikTokDisplayMonitorState(), nil
		}
		return nil, fmt.Errorf("read TikTok Display monitor state: %w", err)
	}
	state := defaultTikTokDisplayMonitorState()
	if err := json.Unmarshal(payload, state); err != nil {
		return defaultTikTokDisplayMonitorState(), nil
	}
	state.ensure()
	return state, nil
}

func saveTikTokDisplayMonitorState(connectionID string, state *tiktokDisplayMonitorState) error {
	stateDir, err := resolveTikTokDisplayAdapterStateDir()
	if err != nil {
		return err
	}
	path := tiktokDisplayMonitorStatePath(stateDir, connectionID)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	state.ensure()
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

func defaultTikTokDisplayMonitorState() *tiktokDisplayMonitorState {
	state := &tiktokDisplayMonitorState{
		Version: tiktokDisplayMonitorStateVersion,
		Videos:  map[string]*tiktokDisplayVideoMonitorState{},
		Metrics: map[tiktokDisplayMonitorLane]*tiktokDisplayStats{},
	}
	state.Discovery.OverlapSeconds = int64(tiktokDisplayDiscoveryOverlap.Seconds())
	return state
}

func (state *tiktokDisplayMonitorState) ensure() {
	if state.Version == 0 {
		state.Version = tiktokDisplayMonitorStateVersion
	}
	if state.Videos == nil {
		state.Videos = map[string]*tiktokDisplayVideoMonitorState{}
	}
	if state.Metrics == nil {
		state.Metrics = map[tiktokDisplayMonitorLane]*tiktokDisplayStats{}
	}
	if state.Discovery.OverlapSeconds <= 0 {
		state.Discovery.OverlapSeconds = int64(tiktokDisplayDiscoveryOverlap.Seconds())
	}
}

func tiktokDisplayMonitorStatePath(stateDir string, connectionID string) string {
	return filepath.Join(stateDir, "tiktok-display", connectionID, "monitor-state.json")
}

func (state *tiktokDisplayMonitorState) metrics(lane tiktokDisplayMonitorLane) *tiktokDisplayStats {
	state.ensure()
	if metrics, ok := state.Metrics[lane]; ok && metrics != nil {
		return metrics
	}
	metrics := &tiktokDisplayStats{}
	state.Metrics[lane] = metrics
	return metrics
}

func (metrics *tiktokDisplayStats) beginCycle(pollTime time.Time) {
	metrics.LastCycleAt = pollTime.UTC()
	metrics.LastAttempted = 0
	metrics.LastEmitted = 0
	metrics.LastSuppressed = 0
}

func (state *tiktokDisplayMonitorState) video(videoID string) *tiktokDisplayVideoMonitorState {
	state.ensure()
	key := strings.TrimSpace(videoID)
	if key == "" {
		key = "unknown"
	}
	if videoState, ok := state.Videos[key]; ok && videoState != nil {
		return videoState
	}
	videoState := &tiktokDisplayVideoMonitorState{VideoID: key}
	state.Videos[key] = videoState
	return videoState
}

func newTikTokDisplayRecordEmitter(state *tiktokDisplayMonitorState, lane tiktokDisplayMonitorLane, pollTime time.Time, emit nexadapter.EmitFunc) *tiktokDisplayRecordEmitter {
	return &tiktokDisplayRecordEmitter{
		state:    state,
		lane:     lane,
		pollTime: pollTime.UTC(),
		emit:     emit,
	}
}

func (emitter *tiktokDisplayRecordEmitter) Emit(record any) {
	if emitter.state == nil {
		emitter.emit(record)
		return
	}
	inbound, ok := record.(nexadapter.AdapterInboundRecord)
	if !ok {
		emitter.emit(record)
		return
	}
	family, logicalRowID, revisionHash := tiktokDisplayMonitorRecordKeys(inbound)
	if family == "" || logicalRowID == "" || revisionHash == "" {
		emitter.emit(inbound)
		return
	}

	metrics := emitter.state.metrics(emitter.lane)
	metrics.LastAttempted++
	metrics.TotalAttempted++

	switch family {
	case tiktokDisplayProfileSnapshotFamily:
		emitter.emitProfile(inbound, revisionHash, metrics)
	case tiktokDisplayVideoSnapshotFamily:
		emitter.emitVideo(inbound, revisionHash, metrics)
	default:
		emitter.emit(inbound)
		metrics.LastEmitted++
		metrics.TotalEmitted++
		emitter.changed = true
	}
}

func (emitter *tiktokDisplayRecordEmitter) emitProfile(record nexadapter.AdapterInboundRecord, revisionHash string, metrics *tiktokDisplayStats) {
	emitter.state.Profile.LastObservedAt = emitter.pollTime
	if strings.TrimSpace(emitter.state.Profile.LastRevisionHash) == strings.TrimSpace(revisionHash) {
		metrics.LastSuppressed++
		metrics.TotalSuppressed++
		emitter.changed = true
		return
	}
	emitter.emit(record)
	emitter.state.Profile.LastRevisionHash = strings.TrimSpace(revisionHash)
	emitter.state.Profile.LastEmittedAt = emitter.pollTime
	metrics.LastEmitted++
	metrics.TotalEmitted++
	emitter.changed = true
}

func (emitter *tiktokDisplayRecordEmitter) emitVideo(record nexadapter.AdapterInboundRecord, revisionHash string, metrics *tiktokDisplayStats) {
	videoID := tiktokDisplayRecordVideoID(record)
	videoState := emitter.state.video(videoID)
	publishedAt := tiktokDisplayRecordPublishedAt(record)
	if !publishedAt.IsZero() {
		videoState.PublishedAt = publishedAt
	}
	videoState.LastObservedAt = emitter.pollTime
	videoState.LastSuccessfulRefreshAt = emitter.pollTime
	videoState.RefreshTier = tiktokDisplayVideoRefreshTier(videoState, emitter.pollTime)

	if strings.TrimSpace(videoState.LastRevisionHash) == strings.TrimSpace(revisionHash) {
		videoState.ConsecutiveUnchanged++
		videoState.RefreshTier = tiktokDisplayVideoRefreshTier(videoState, emitter.pollTime)
		metrics.LastSuppressed++
		metrics.TotalSuppressed++
		emitter.changed = true
		return
	}

	emitter.emit(record)
	if strings.TrimSpace(videoState.LastRevisionHash) != "" {
		videoState.LastMetricChangeAt = emitter.pollTime
	} else if videoState.LastMetricChangeAt.IsZero() {
		videoState.LastMetricChangeAt = emitter.pollTime
	}
	videoState.LastRevisionHash = strings.TrimSpace(revisionHash)
	videoState.LastEmittedAt = emitter.pollTime
	videoState.ConsecutiveUnchanged = 0
	videoState.RefreshTier = tiktokDisplayVideoRefreshTier(videoState, emitter.pollTime)
	metrics.LastEmitted++
	metrics.TotalEmitted++
	emitter.changed = true
}

func (emitter *tiktokDisplayRecordEmitter) StateChanged() bool {
	return emitter.changed
}

func runTikTokDisplayMonitorCycle(ctx context.Context, state *tiktokDisplayRuntime, monitorState *tiktokDisplayMonitorState, pollTime time.Time, emit nexadapter.EmitFunc) tiktokDisplayMonitorCycleResult {
	if monitorState == nil {
		monitorState = defaultTikTokDisplayMonitorState()
	}
	monitorState.ensure()
	pollTime = pollTime.UTC()
	result := tiktokDisplayMonitorCycleResult{}
	videoLaneRan := false

	if tiktokDisplayDue(monitorState.Profile.LastPollAt, pollTime, tiktokDisplayProfilePollInterval) {
		result.DueLanes = append(result.DueLanes, tiktokDisplayMonitorLaneProfile)
		monitorState.metrics(tiktokDisplayMonitorLaneProfile).beginCycle(pollTime)
		emitter := newTikTokDisplayRecordEmitter(monitorState, tiktokDisplayMonitorLaneProfile, pollTime, emit)
		accessToken, err := state.accessTokenForRequest(ctx)
		if err != nil {
			result.FailedLanes = append(result.FailedLanes, tiktokDisplayMonitorLaneProfile)
			nexadapter.LogError("tiktok display monitor profile auth failed: %v", err)
		} else {
			profile, err := fetchTikTokDisplayProfile(ctx, accessToken)
			if err != nil {
				result.FailedLanes = append(result.FailedLanes, tiktokDisplayMonitorLaneProfile)
				nexadapter.LogError("tiktok display monitor profile poll failed: %v", err)
			} else if profile == nil {
				result.FailedLanes = append(result.FailedLanes, tiktokDisplayMonitorLaneProfile)
				nexadapter.LogError("tiktok display monitor profile poll failed: empty profile")
			} else {
				emitter.Emit(buildTikTokDisplayProfileSnapshotRecord(state, profile))
				monitorState.Profile.LastPollAt = pollTime
				result.SuccessfulLanes = append(result.SuccessfulLanes, tiktokDisplayMonitorLaneProfile)
				result.StateChanged = true
				if emitter.StateChanged() {
					result.StateChanged = true
				}
			}
		}
	}

	if tiktokDisplayDue(monitorState.Discovery.LastPollAt, pollTime, tiktokDisplayDiscoveryPollInterval) {
		result.DueLanes = append(result.DueLanes, tiktokDisplayMonitorLaneDiscovery)
		monitorState.metrics(tiktokDisplayMonitorLaneDiscovery).beginCycle(pollTime)
		emitter := newTikTokDisplayRecordEmitter(monitorState, tiktokDisplayMonitorLaneDiscovery, pollTime, emit)
		profile := &tiktokDisplayUserInfo{OpenID: state.OpenID, DisplayName: state.DisplayName, ProfileWebLink: state.ProfileWebLink}
		floor := monitorState.discoveryFloor(pollTime)
		accessToken, err := state.accessTokenForRequest(ctx)
		if err != nil {
			result.FailedLanes = append(result.FailedLanes, tiktokDisplayMonitorLaneDiscovery)
			nexadapter.LogError("tiktok display monitor discovery auth failed: %v", err)
		} else {
			videos, err := fetchTikTokDisplayVideos(ctx, accessToken, floor, pollTime)
			if err != nil {
				result.FailedLanes = append(result.FailedLanes, tiktokDisplayMonitorLaneDiscovery)
				nexadapter.LogError("tiktok display monitor discovery poll failed: %v", err)
			} else {
				for _, video := range videos {
					emitter.Emit(buildTikTokDisplayVideoSnapshotRecord(state, profile, video))
				}
				monitorState.updateDiscovery(videos, pollTime)
				result.SuccessfulLanes = append(result.SuccessfulLanes, tiktokDisplayMonitorLaneDiscovery)
				result.StateChanged = true
				videoLaneRan = true
				if emitter.StateChanged() {
					result.StateChanged = true
				}
			}
		}
	}

	if !videoLaneRan {
		dueIDs, floor := monitorState.activeRefreshPlan(pollTime)
		if len(dueIDs) > 0 {
			result.DueLanes = append(result.DueLanes, tiktokDisplayMonitorLaneActiveRefresh)
			metrics := monitorState.metrics(tiktokDisplayMonitorLaneActiveRefresh)
			metrics.beginCycle(pollTime)
			monitorState.Active.LastDue = len(dueIDs)
			emitter := newTikTokDisplayRecordEmitter(monitorState, tiktokDisplayMonitorLaneActiveRefresh, pollTime, emit)
			profile := &tiktokDisplayUserInfo{OpenID: state.OpenID, DisplayName: state.DisplayName, ProfileWebLink: state.ProfileWebLink}
			accessToken, err := state.accessTokenForRequest(ctx)
			if err != nil {
				result.FailedLanes = append(result.FailedLanes, tiktokDisplayMonitorLaneActiveRefresh)
				nexadapter.LogError("tiktok display monitor active refresh auth failed: %v", err)
			} else {
				videos, err := fetchTikTokDisplayVideos(ctx, accessToken, floor, pollTime)
				if err != nil {
					result.FailedLanes = append(result.FailedLanes, tiktokDisplayMonitorLaneActiveRefresh)
					nexadapter.LogError("tiktok display monitor active refresh failed: %v", err)
				} else {
					observed := 0
					for _, video := range videos {
						videoID := displayNonBlank(video.ID, "video")
						if _, ok := dueIDs[videoID]; !ok {
							continue
						}
						observed++
						emitter.Emit(buildTikTokDisplayVideoSnapshotRecord(state, profile, video))
					}
					monitorState.Active.LastPollAt = pollTime
					monitorState.Active.LastObserved = observed
					result.SuccessfulLanes = append(result.SuccessfulLanes, tiktokDisplayMonitorLaneActiveRefresh)
					result.StateChanged = true
					videoLaneRan = true
					if emitter.StateChanged() {
						result.StateChanged = true
					}
				}
			}
		}
	}

	if !videoLaneRan && monitorState.reconcileDue(pollTime) {
		result.DueLanes = append(result.DueLanes, tiktokDisplayMonitorLaneReconcile)
		monitorState.metrics(tiktokDisplayMonitorLaneReconcile).beginCycle(pollTime)
		emitter := newTikTokDisplayRecordEmitter(monitorState, tiktokDisplayMonitorLaneReconcile, pollTime, emit)
		profile := &tiktokDisplayUserInfo{OpenID: state.OpenID, DisplayName: state.DisplayName, ProfileWebLink: state.ProfileWebLink}
		floor := pollTime.Add(-tiktokDisplaySlowReconcileWindow)
		accessToken, err := state.accessTokenForRequest(ctx)
		if err != nil {
			monitorState.Reconcile.LastError = err.Error()
			result.FailedLanes = append(result.FailedLanes, tiktokDisplayMonitorLaneReconcile)
			nexadapter.LogError("tiktok display monitor slow reconcile auth failed: %v", err)
		} else {
			videos, err := fetchTikTokDisplayVideos(ctx, accessToken, floor, pollTime)
			if err != nil {
				monitorState.Reconcile.LastError = err.Error()
				result.FailedLanes = append(result.FailedLanes, tiktokDisplayMonitorLaneReconcile)
				nexadapter.LogError("tiktok display monitor slow reconcile failed: %v", err)
			} else {
				for _, video := range videos {
					emitter.Emit(buildTikTokDisplayVideoSnapshotRecord(state, profile, video))
				}
				monitorState.Reconcile.LastPollAt = pollTime
				monitorState.Reconcile.LastFloor = floor
				monitorState.Reconcile.LastObserved = len(videos)
				monitorState.Reconcile.LastError = ""
				monitorState.updateDiscovery(videos, pollTime)
				result.SuccessfulLanes = append(result.SuccessfulLanes, tiktokDisplayMonitorLaneReconcile)
				result.StateChanged = true
				if emitter.StateChanged() {
					result.StateChanged = true
				}
			}
		}
	} else if monitorState.Reconcile.LastPollAt.IsZero() {
		monitorState.Reconcile.LastPollAt = pollTime
		result.StateChanged = true
	}

	logTikTokDisplayMonitorMetrics(monitorState, pollTime)
	return result
}

func (state *tiktokDisplayMonitorState) discoveryFloor(pollTime time.Time) time.Time {
	if state.Discovery.NewestPublishedAt.IsZero() {
		return pollTime.Add(-tiktokDisplayMonitorReplayWindow)
	}
	overlap := time.Duration(state.Discovery.OverlapSeconds) * time.Second
	if overlap <= 0 {
		overlap = tiktokDisplayDiscoveryOverlap
	}
	return state.Discovery.NewestPublishedAt.Add(-overlap).UTC()
}

func (state *tiktokDisplayMonitorState) updateDiscovery(videos []tiktokDisplayVideoInfo, pollTime time.Time) {
	state.ensure()
	newest := state.Discovery.NewestPublishedAt
	ids := map[string]struct{}{}
	for _, id := range state.Discovery.NewestVideoIDs {
		if strings.TrimSpace(id) != "" {
			ids[strings.TrimSpace(id)] = struct{}{}
		}
	}
	for _, video := range videos {
		published := tiktokDisplayVideoPublishedAt(video)
		if published.IsZero() {
			continue
		}
		videoID := displayNonBlank(video.ID, "video")
		if newest.IsZero() || published.After(newest) {
			newest = published
			ids = map[string]struct{}{videoID: {}}
			continue
		}
		if published.Equal(newest) {
			ids[videoID] = struct{}{}
		}
	}
	state.Discovery.NewestPublishedAt = newest
	state.Discovery.NewestVideoIDs = sortedTikTokDisplayKeys(ids)
	state.Discovery.LastPollAt = pollTime.UTC()
	state.Discovery.LastObserved = len(videos)
}

func (state *tiktokDisplayMonitorState) activeRefreshPlan(pollTime time.Time) (map[string]struct{}, time.Time) {
	state.ensure()
	due := map[string]struct{}{}
	floor := time.Time{}
	for videoID, videoState := range state.Videos {
		if videoState == nil {
			continue
		}
		tier := tiktokDisplayVideoRefreshTier(videoState, pollTime)
		videoState.RefreshTier = tier
		interval := tiktokDisplayRefreshIntervalForTier(tier)
		if !tiktokDisplayDue(videoState.LastSuccessfulRefreshAt, pollTime, interval) {
			continue
		}
		due[videoID] = struct{}{}
		published := videoState.PublishedAt
		if published.IsZero() {
			published = pollTime.Add(-tiktokDisplayMonitorReplayWindow)
		}
		if floor.IsZero() || published.Before(floor) {
			floor = published
		}
	}
	if floor.IsZero() {
		return due, floor
	}
	return due, floor.Add(-1 * time.Minute).UTC()
}

func (state *tiktokDisplayMonitorState) reconcileDue(pollTime time.Time) bool {
	if state.Reconcile.LastPollAt.IsZero() {
		return false
	}
	return tiktokDisplayDue(state.Reconcile.LastPollAt, pollTime, tiktokDisplaySlowReconcileInterval)
}

func tiktokDisplayDue(lastPollAt time.Time, pollTime time.Time, interval time.Duration) bool {
	if lastPollAt.IsZero() {
		return true
	}
	return !lastPollAt.Add(interval).After(pollTime.UTC())
}

func tiktokDisplayVideoRefreshTier(videoState *tiktokDisplayVideoMonitorState, pollTime time.Time) string {
	if videoState == nil {
		return tiktokDisplayVideoRefreshTierHot
	}
	publishedAge := time.Duration(0)
	if !videoState.PublishedAt.IsZero() {
		publishedAge = pollTime.Sub(videoState.PublishedAt)
	}
	recentChange := !videoState.LastMetricChangeAt.IsZero() && pollTime.Sub(videoState.LastMetricChangeAt) <= tiktokDisplayHotVideoAge
	if videoState.PublishedAt.IsZero() || publishedAge <= tiktokDisplayHotVideoAge || recentChange {
		return tiktokDisplayVideoRefreshTierHot
	}
	if publishedAge <= tiktokDisplayWarmVideoAge {
		return tiktokDisplayVideoRefreshTierWarm
	}
	return tiktokDisplayVideoRefreshTierCold
}

func tiktokDisplayRefreshIntervalForTier(tier string) time.Duration {
	switch strings.TrimSpace(tier) {
	case tiktokDisplayVideoRefreshTierWarm:
		return tiktokDisplayWarmRefreshInterval
	case tiktokDisplayVideoRefreshTierCold:
		return tiktokDisplayColdRefreshInterval
	default:
		return tiktokDisplayHotRefreshInterval
	}
}

func tiktokDisplayVideoPublishedAt(video tiktokDisplayVideoInfo) time.Time {
	millis := tiktokDisplayVideoTimestampMillis(video)
	if millis <= 0 {
		return time.Time{}
	}
	return time.UnixMilli(millis).UTC()
}

func tiktokDisplayMonitorRecordKeys(record nexadapter.AdapterInboundRecord) (string, string, string) {
	metadata := record.Payload.Metadata
	if metadata == nil {
		return "", "", ""
	}
	return tiktokDisplayMetadataString(metadata, "family"), tiktokDisplayMetadataString(metadata, "logical_row_id"), tiktokDisplayMetadataString(metadata, "revision_hash")
}

func tiktokDisplayRecordVideoID(record nexadapter.AdapterInboundRecord) string {
	metadata := record.Payload.Metadata
	if metadata == nil {
		return ""
	}
	if providerIDs, ok := metadata["provider_ids"].(map[string]any); ok {
		if value := strings.TrimSpace(fmt.Sprint(providerIDs["video_id"])); value != "" {
			return value
		}
	}
	if row, ok := metadata["row"].(map[string]any); ok {
		if value := strings.TrimSpace(fmt.Sprint(row["id"])); value != "" {
			return value
		}
	}
	return strings.TrimPrefix(tiktokDisplayMetadataString(metadata, "logical_row_id"), "video:")
}

func tiktokDisplayRecordPublishedAt(record nexadapter.AdapterInboundRecord) time.Time {
	if metadata := record.Payload.Metadata; metadata != nil {
		if row, ok := metadata["row"].(map[string]any); ok {
			if seconds, ok := int64FromAny(row["create_time"]); ok && seconds > 0 {
				if seconds > 1_000_000_000_000 {
					return time.UnixMilli(seconds).UTC()
				}
				return time.Unix(seconds, 0).UTC()
			}
		}
	}
	if record.Payload.Timestamp > 0 {
		return time.UnixMilli(record.Payload.Timestamp).UTC()
	}
	return time.Time{}
}

func int64FromAny(value any) (int64, bool) {
	switch v := value.(type) {
	case int64:
		return v, true
	case int:
		return int64(v), true
	case float64:
		return int64(v), true
	case json.Number:
		parsed, err := v.Int64()
		return parsed, err == nil
	case string:
		parsed, err := time.Parse(time.RFC3339, v)
		if err == nil {
			return parsed.Unix(), true
		}
		var out int64
		if _, err := fmt.Sscan(strings.TrimSpace(v), &out); err == nil {
			return out, true
		}
	}
	return 0, false
}

func tiktokDisplayMetadataString(metadata map[string]any, key string) string {
	value, ok := metadata[key]
	if !ok {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func sortedTikTokDisplayKeys(values map[string]struct{}) []string {
	out := make([]string, 0, len(values))
	for value := range values {
		if strings.TrimSpace(value) != "" {
			out = append(out, strings.TrimSpace(value))
		}
	}
	sort.Strings(out)
	return out
}

func logTikTokDisplayMonitorMetrics(state *tiktokDisplayMonitorState, pollTime time.Time) {
	if !tiktokDisplayMonitorMetricsLogging || state == nil {
		return
	}
	lanes := make([]string, 0, len(state.Metrics))
	for lane, metrics := range state.Metrics {
		if metrics == nil || !metrics.LastCycleAt.Equal(pollTime.UTC()) || metrics.LastAttempted == 0 {
			continue
		}
		lanes = append(lanes, string(lane))
	}
	sort.Strings(lanes)
	for _, laneName := range lanes {
		metrics := state.metrics(tiktokDisplayMonitorLane(laneName))
		nexadapter.LogInfo("tiktok display monitor metrics lane=%s attempted=%d emitted=%d suppressed=%d", laneName, metrics.LastAttempted, metrics.LastEmitted, metrics.LastSuppressed)
	}
}
