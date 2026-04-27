package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	tiktokBusinessLiveBenchmarkEnv     = "TIKTOK_BUSINESS_LIVE_BENCHMARK"
	tiktokBusinessBenchmarkDefaultDays = 30
	tiktokBusinessLegacyReplayWindow   = 7 * 24 * time.Hour
)

type tiktokBusinessBenchmarkArtifact struct {
	AdapterID                       string                       `json:"adapter_id"`
	AdapterVersion                  string                       `json:"adapter_version"`
	GeneratedAt                     string                       `json:"generated_at"`
	ConnectionID                    string                       `json:"connection_id"`
	AdvertiserIDSuffix              string                       `json:"advertiser_id_suffix"`
	BackfillDays                    int                          `json:"backfill_days"`
	BackfillSince                   string                       `json:"backfill_since"`
	BackfillUntil                   string                       `json:"backfill_until"`
	BackfillImplementationChanged   bool                         `json:"backfill_implementation_changed_since_0_1_0"`
	LegacyMonitorReplayWindowHours  int                          `json:"legacy_monitor_replay_window_hours"`
	CurrentMonitorHotLookbackHours  int                          `json:"current_monitor_hot_lookback_hours"`
	CurrentMonitorSlowLookbackHours int                          `json:"current_monitor_slow_lookback_hours"`
	Runs                            []tiktokBusinessBenchmarkRun `json:"runs"`
	RichnessParity                  map[string]any               `json:"richness_parity,omitempty"`
	Comparisons                     map[string]any               `json:"comparisons,omitempty"`
}

type tiktokBusinessBenchmarkRun struct {
	Name                string                                  `json:"name"`
	StartedAt           string                                  `json:"started_at"`
	ElapsedMS           int64                                   `json:"elapsed_ms"`
	RequestCount        int                                     `json:"request_count"`
	RecordsTotal        int                                     `json:"records_total"`
	UniqueRecordIDs     int                                     `json:"unique_record_ids"`
	UniqueLogicalRows   int                                     `json:"unique_logical_rows"`
	RecordsByFamily     map[string]int                          `json:"records_by_family"`
	RequestsByEndpoint  map[string]int                          `json:"requests_by_endpoint"`
	RequestsByDataLevel map[string]int                          `json:"requests_by_data_level,omitempty"`
	RequestsByWindow    map[string]int                          `json:"requests_by_window,omitempty"`
	RequestedMetrics    []string                                `json:"requested_metrics,omitempty"`
	Monitor             *tiktokBusinessBenchmarkMonitorSummary  `json:"monitor,omitempty"`
	Cycles              []tiktokBusinessBenchmarkMonitorSummary `json:"cycles,omitempty"`
}

type tiktokBusinessBenchmarkMonitorSummary struct {
	PollTime           string                                 `json:"poll_time"`
	DueFamilies        []string                               `json:"due_families"`
	SuccessfulFamilies []string                               `json:"successful_families"`
	FailedFamilies     []string                               `json:"failed_families"`
	StateChanged       bool                                   `json:"state_changed"`
	Metrics            map[string]tiktokBusinessMetricSummary `json:"metrics"`
}

type tiktokBusinessMetricSummary struct {
	LastAttempted   int `json:"last_attempted"`
	LastEmitted     int `json:"last_emitted"`
	LastSuppressed  int `json:"last_suppressed"`
	TotalAttempted  int `json:"total_attempted"`
	TotalEmitted    int `json:"total_emitted"`
	TotalSuppressed int `json:"total_suppressed"`
}

type tiktokBusinessBenchmarkRequest struct {
	Endpoint  string   `json:"endpoint"`
	DataLevel string   `json:"data_level,omitempty"`
	StartDate string   `json:"start_date,omitempty"`
	EndDate   string   `json:"end_date,omitempty"`
	Page      string   `json:"page,omitempty"`
	Metrics   []string `json:"metrics,omitempty"`
	Status    int      `json:"status"`
	ElapsedMS int64    `json:"elapsed_ms"`
}

type tiktokBusinessBenchmarkTransport struct {
	base     http.RoundTripper
	mu       sync.Mutex
	requests []tiktokBusinessBenchmarkRequest
}

func TestLiveTikTokBusinessLocalBenchmark(t *testing.T) {
	if os.Getenv(tiktokBusinessLiveBenchmarkEnv) != "1" {
		t.Skipf("set %s=1 to run the live TikTok Business benchmark", tiktokBusinessLiveBenchmarkEnv)
	}

	accessToken := firstNonBlankEnv("TIKTOK_BUSINESS_ACCESS_TOKEN", "TIKTOK_ACCESS_TOKEN")
	advertiserID := firstNonBlankEnv("TIKTOK_BUSINESS_ADVERTISER_ID", "TIKTOK_ADVERTISER_ID")
	if accessToken == "" || advertiserID == "" {
		t.Fatalf("missing TikTok Business benchmark credentials; expected token and advertiser id env vars")
	}

	connectionID := firstNonBlankEnv("TIKTOK_BUSINESS_CONNECTION_ID")
	if connectionID == "" {
		connectionID = "local-moonsleep-tiktok-business"
	}
	days := intEnv("TIKTOK_BUSINESS_BENCHMARK_DAYS", tiktokBusinessBenchmarkDefaultDays)
	if days < 1 {
		days = tiktokBusinessBenchmarkDefaultDays
	}
	timeout := durationSecondsEnv("TIKTOK_BUSINESS_BENCHMARK_TIMEOUT_SECONDS", 10*time.Minute)

	oldBaseURL := businessAPIBaseURL
	oldClient := businessHTTPClient
	tracker := &tiktokBusinessBenchmarkTransport{base: http.DefaultTransport}
	businessHTTPClient = &http.Client{Timeout: defaultLookupTimeout, Transport: tracker}
	t.Cleanup(func() {
		businessAPIBaseURL = oldBaseURL
		businessHTTPClient = oldClient
	})

	stateDir := t.TempDir()
	t.Setenv(tiktokBusinessAdapterStateDirEnv, stateDir)

	state := &tiktokBusinessState{
		ConnectionID:         connectionID,
		AccessToken:          accessToken,
		BoundAdvertiserID:    advertiserID,
		VisibleAdvertiserIDs: []string{advertiserID},
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	until := time.Now().UTC()
	since := until.AddDate(0, 0, -days)
	artifact := tiktokBusinessBenchmarkArtifact{
		AdapterID:                       platformID,
		AdapterVersion:                  adapterVersion,
		GeneratedAt:                     until.Format(time.RFC3339),
		ConnectionID:                    connectionID,
		AdvertiserIDSuffix:              suffix(advertiserID, 4),
		BackfillDays:                    days,
		BackfillSince:                   since.Format(time.RFC3339),
		BackfillUntil:                   until.Format(time.RFC3339),
		BackfillImplementationChanged:   true,
		LegacyMonitorReplayWindowHours:  int(tiktokBusinessLegacyReplayWindow / time.Hour),
		CurrentMonitorHotLookbackHours:  int(tiktokBusinessHotReportLookback / time.Hour),
		CurrentMonitorSlowLookbackHours: int(tiktokBusinessDailyReportLookback / time.Hour),
	}

	backfillRun, err := runTikTokBusinessRecordBenchmark(ctx, tracker, "current_backfill", func() ([]nexadapter.AdapterInboundRecord, *tiktokBusinessBenchmarkMonitorSummary, error) {
		records, err := fetchTikTokBusinessBackfill(ctx, state, since, until)
		return records, nil, err
	})
	if err != nil {
		t.Fatalf("current backfill benchmark failed: %v", err)
	}
	artifact.Runs = append(artifact.Runs, backfillRun)

	legacyMonitorRun, err := runTikTokBusinessRecordBenchmark(ctx, tracker, "legacy_monitor_7d_full_replay_cycle", func() ([]nexadapter.AdapterInboundRecord, *tiktokBusinessBenchmarkMonitorSummary, error) {
		records, err := fetchTikTokBusinessBackfill(ctx, state, until.Add(-tiktokBusinessLegacyReplayWindow), until)
		return records, nil, err
	})
	if err != nil {
		t.Fatalf("legacy monitor benchmark failed: %v", err)
	}
	artifact.Runs = append(artifact.Runs, legacyMonitorRun)

	monitorState := defaultTikTokBusinessMonitorState()
	revisionStore, err := loadTikTokBusinessRevisionStore(state.ConnectionID)
	if err != nil {
		t.Fatalf("load revision store: %v", err)
	}

	currentFirstRun, err := runTikTokBusinessMonitorBenchmark(ctx, tracker, "current_monitor_first_cycle", state, monitorState, revisionStore, until)
	if err != nil {
		t.Fatalf("current first monitor benchmark failed: %v", err)
	}
	artifact.Runs = append(artifact.Runs, currentFirstRun)

	soakRun, err := runTikTokBusinessMonitorSoakBenchmark(ctx, tracker, "current_monitor_10m_simulated_soak", state, monitorState, revisionStore, until.Add(tiktokBusinessMonitorInterval), 10)
	if err != nil {
		t.Fatalf("current monitor soak benchmark failed: %v", err)
	}
	artifact.Runs = append(artifact.Runs, soakRun)

	artifact.RichnessParity = summarizeTikTokBusinessRichnessParity(artifact.Runs)
	if err := assertTikTokBusinessRichnessParity(artifact.RichnessParity); err != nil {
		t.Fatalf("richness parity assertions failed: %v", err)
	}
	artifact.Comparisons = compareTikTokBusinessBenchmarkRuns(artifact.Runs)
	outputPath, err := writeTikTokBusinessBenchmarkArtifact(artifact)
	if err != nil {
		t.Fatalf("write benchmark artifact: %v", err)
	}
	t.Logf("wrote benchmark artifact: %s", outputPath)
}

func runTikTokBusinessRecordBenchmark(ctx context.Context, tracker *tiktokBusinessBenchmarkTransport, name string, run func() ([]nexadapter.AdapterInboundRecord, *tiktokBusinessBenchmarkMonitorSummary, error)) (tiktokBusinessBenchmarkRun, error) {
	tracker.Reset()
	start := time.Now().UTC()
	records, monitor, err := run()
	elapsed := time.Since(start)
	requests := tracker.Snapshot()
	summary := summarizeTikTokBusinessBenchmarkRun(name, start, elapsed, records, requests)
	summary.Monitor = monitor
	if err != nil {
		return summary, err
	}
	return summary, ctx.Err()
}

func runTikTokBusinessMonitorBenchmark(ctx context.Context, tracker *tiktokBusinessBenchmarkTransport, name string, state *tiktokBusinessState, monitorState *tiktokBusinessMonitorState, revisionStore *tiktokBusinessRevisionStore, pollTime time.Time) (tiktokBusinessBenchmarkRun, error) {
	return runTikTokBusinessRecordBenchmark(ctx, tracker, name, func() ([]nexadapter.AdapterInboundRecord, *tiktokBusinessBenchmarkMonitorSummary, error) {
		records := []nexadapter.AdapterInboundRecord{}
		result := runTikTokBusinessMonitorCycle(ctx, state, monitorState, revisionStore, pollTime, func(record any) {
			if inbound, ok := record.(nexadapter.AdapterInboundRecord); ok && inbound.Operation != "" {
				records = append(records, inbound)
			}
		})
		monitor := summarizeTikTokBusinessMonitorResult(result, monitorState, pollTime)
		if len(result.FailedFamilies) > 0 {
			return records, &monitor, fmt.Errorf("failed monitor families: %v", result.FailedFamilies)
		}
		return records, &monitor, nil
	})
}

func runTikTokBusinessMonitorSoakBenchmark(ctx context.Context, tracker *tiktokBusinessBenchmarkTransport, name string, state *tiktokBusinessState, monitorState *tiktokBusinessMonitorState, revisionStore *tiktokBusinessRevisionStore, firstPoll time.Time, cycles int) (tiktokBusinessBenchmarkRun, error) {
	tracker.Reset()
	start := time.Now().UTC()
	records := []nexadapter.AdapterInboundRecord{}
	summaries := []tiktokBusinessBenchmarkMonitorSummary{}
	for idx := 0; idx < cycles; idx++ {
		pollTime := firstPoll.Add(time.Duration(idx) * tiktokBusinessMonitorInterval)
		result := runTikTokBusinessMonitorCycle(ctx, state, monitorState, revisionStore, pollTime, func(record any) {
			if inbound, ok := record.(nexadapter.AdapterInboundRecord); ok && inbound.Operation != "" {
				records = append(records, inbound)
			}
		})
		summary := summarizeTikTokBusinessMonitorResult(result, monitorState, pollTime)
		summaries = append(summaries, summary)
		if len(result.FailedFamilies) > 0 {
			return summarizeTikTokBusinessBenchmarkRun(name, start, time.Since(start), records, tracker.Snapshot()), fmt.Errorf("failed monitor families on cycle %d: %v", idx+1, result.FailedFamilies)
		}
		if err := ctx.Err(); err != nil {
			return summarizeTikTokBusinessBenchmarkRun(name, start, time.Since(start), records, tracker.Snapshot()), err
		}
	}
	run := summarizeTikTokBusinessBenchmarkRun(name, start, time.Since(start), records, tracker.Snapshot())
	run.Cycles = summaries
	return run, nil
}

func summarizeTikTokBusinessBenchmarkRun(name string, start time.Time, elapsed time.Duration, records []nexadapter.AdapterInboundRecord, requests []tiktokBusinessBenchmarkRequest) tiktokBusinessBenchmarkRun {
	recordsByFamily := map[string]int{}
	recordIDs := map[string]struct{}{}
	logicalRows := map[string]struct{}{}
	for _, record := range records {
		family := stringFromMap(record.Payload.Metadata, "family")
		if family == "" {
			family = stringFromMap(record.Routing.Metadata, "family")
		}
		if family == "" {
			family = "unknown"
		}
		recordsByFamily[family]++
		if record.Payload.ExternalRecordID != "" {
			recordIDs[record.Payload.ExternalRecordID] = struct{}{}
		}
		logicalRowID := stringFromMap(record.Payload.Metadata, "logical_row_id")
		if logicalRowID != "" {
			logicalRows[family+":"+logicalRowID] = struct{}{}
		}
	}

	return tiktokBusinessBenchmarkRun{
		Name:                name,
		StartedAt:           start.Format(time.RFC3339),
		ElapsedMS:           elapsed.Milliseconds(),
		RequestCount:        len(requests),
		RecordsTotal:        len(records),
		UniqueRecordIDs:     len(recordIDs),
		UniqueLogicalRows:   len(logicalRows),
		RecordsByFamily:     sortedCountMap(recordsByFamily),
		RequestsByEndpoint:  sortedCountMap(countRequestsBy(requests, func(req tiktokBusinessBenchmarkRequest) string { return req.Endpoint })),
		RequestsByDataLevel: sortedCountMap(countRequestsBy(requests, func(req tiktokBusinessBenchmarkRequest) string { return req.DataLevel })),
		RequestsByWindow:    sortedCountMap(countRequestsBy(requests, requestWindowKey)),
		RequestedMetrics:    sortedStringSet(unionRequestMetrics(requests)),
	}
}

func summarizeTikTokBusinessMonitorResult(result tiktokBusinessMonitorCycleResult, monitorState *tiktokBusinessMonitorState, pollTime time.Time) tiktokBusinessBenchmarkMonitorSummary {
	return tiktokBusinessBenchmarkMonitorSummary{
		PollTime:           pollTime.UTC().Format(time.RFC3339),
		DueFamilies:        stringMonitorFamilies(result.DueFamilies),
		SuccessfulFamilies: stringMonitorFamilies(result.SuccessfulFamilies),
		FailedFamilies:     stringMonitorFamilies(result.FailedFamilies),
		StateChanged:       result.StateChanged,
		Metrics:            summarizeTikTokBusinessMonitorMetrics(monitorState),
	}
}

func summarizeTikTokBusinessMonitorMetrics(monitorState *tiktokBusinessMonitorState) map[string]tiktokBusinessMetricSummary {
	out := map[string]tiktokBusinessMetricSummary{}
	if monitorState == nil {
		return out
	}
	for family, metrics := range monitorState.Metrics {
		if metrics == nil {
			continue
		}
		out[string(family)] = tiktokBusinessMetricSummary{
			LastAttempted:   metrics.LastAttempted,
			LastEmitted:     metrics.LastEmitted,
			LastSuppressed:  metrics.LastSuppressed,
			TotalAttempted:  metrics.TotalAttempted,
			TotalEmitted:    metrics.TotalEmitted,
			TotalSuppressed: metrics.TotalSuppressed,
		}
	}
	return out
}

func compareTikTokBusinessBenchmarkRuns(runs []tiktokBusinessBenchmarkRun) map[string]any {
	byName := map[string]tiktokBusinessBenchmarkRun{}
	for _, run := range runs {
		byName[run.Name] = run
	}
	legacy := byName["legacy_monitor_7d_full_replay_cycle"]
	first := byName["current_monitor_first_cycle"]
	soak := byName["current_monitor_10m_simulated_soak"]
	comparisons := map[string]any{
		"backfill_path_note": "Backfill remains the exhaustive reconstruction path; 0.1.2 adds MoonSleep metric/entity richness while live-sync optimization stays isolated to monitor scheduling and duplicate suppression.",
	}
	if legacy.RequestCount > 0 && first.RequestCount > 0 {
		comparisons["first_cycle_request_ratio_current_vs_legacy"] = float64(first.RequestCount) / float64(legacy.RequestCount)
	}
	if legacy.RequestCount > 0 && soak.RequestCount > 0 {
		comparisons["ten_minute_request_ratio_current_vs_legacy_projection"] = float64(soak.RequestCount) / float64(legacy.RequestCount*10)
		comparisons["legacy_projected_10m_request_count"] = legacy.RequestCount * 10
		comparisons["current_simulated_10m_request_count"] = soak.RequestCount
	}
	if legacy.RecordsTotal > 0 && soak.RecordsTotal >= 0 {
		comparisons["legacy_projected_10m_record_count"] = legacy.RecordsTotal * 10
		comparisons["current_simulated_10m_record_count"] = soak.RecordsTotal
	}
	return comparisons
}

func (transport *tiktokBusinessBenchmarkTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	base := transport.base
	if base == nil {
		base = http.DefaultTransport
	}
	start := time.Now()
	resp, err := base.RoundTrip(req)
	elapsed := time.Since(start)

	status := 0
	if resp != nil {
		status = resp.StatusCode
	}
	transport.mu.Lock()
	transport.requests = append(transport.requests, summarizeTikTokBusinessRequest(req.URL, status, elapsed))
	transport.mu.Unlock()
	return resp, err
}

func (transport *tiktokBusinessBenchmarkTransport) Reset() {
	transport.mu.Lock()
	defer transport.mu.Unlock()
	transport.requests = nil
}

func (transport *tiktokBusinessBenchmarkTransport) Snapshot() []tiktokBusinessBenchmarkRequest {
	transport.mu.Lock()
	defer transport.mu.Unlock()
	out := make([]tiktokBusinessBenchmarkRequest, len(transport.requests))
	copy(out, transport.requests)
	return out
}

func summarizeTikTokBusinessRequest(u *url.URL, status int, elapsed time.Duration) tiktokBusinessBenchmarkRequest {
	query := u.Query()
	endpoint := strings.Trim(u.Path, "/")
	endpoint = strings.TrimPrefix(endpoint, "open_api/v1.3/")
	return tiktokBusinessBenchmarkRequest{
		Endpoint:  endpoint,
		DataLevel: query.Get("data_level"),
		StartDate: query.Get("start_date"),
		EndDate:   query.Get("end_date"),
		Page:      query.Get("page"),
		Metrics:   parseJSONStringSlice(query.Get("metrics")),
		Status:    status,
		ElapsedMS: elapsed.Milliseconds(),
	}
}

func summarizeTikTokBusinessRichnessParity(runs []tiktokBusinessBenchmarkRun) map[string]any {
	byName := map[string]tiktokBusinessBenchmarkRun{}
	for _, run := range runs {
		byName[run.Name] = run
	}
	backfill := byName["current_backfill"]
	requiredEndpoints := []string{"campaign/get", "adgroup/get", "ad/get", "report/integrated/get"}
	requiredDataLevels := []string{"AUCTION_CAMPAIGN", "AUCTION_ADGROUP", "AUCTION_AD", "AUCTION_ADVERTISER"}
	requiredFamilies := []string{"campaign_snapshot", "adgroup_snapshot", "ad_snapshot", "campaign_daily", "adgroup_daily", "ad_daily", "advertiser_hourly"}

	return map[string]any{
		"baseline":                           "MoonSleep ops-analytics paid-media TikTok worker",
		"required_report_metrics":            append([]string{}, tiktokBusinessReportMetricFields...),
		"requested_report_metrics":           backfill.RequestedMetrics,
		"required_report_metrics_present":    requiredStringsPresent(backfill.RequestedMetrics, tiktokBusinessReportMetricFields),
		"required_backfill_endpoints":        requiredEndpoints,
		"backfill_endpoints_present":         requiredKeysPresent(backfill.RequestsByEndpoint, requiredEndpoints),
		"required_data_levels":               requiredDataLevels,
		"backfill_data_levels_present":       requiredKeysPresent(backfill.RequestsByDataLevel, requiredDataLevels),
		"required_record_families":           requiredFamilies,
		"record_families_present":            requiredKeysPresent(backfill.RecordsByFamily, requiredFamilies),
		"landing_page_view_metric_requested": stringSliceContains(backfill.RequestedMetrics, "total_landing_page_view"),
	}
}

func assertTikTokBusinessRichnessParity(parity map[string]any) error {
	if parity == nil {
		return fmt.Errorf("missing richness parity summary")
	}
	if present, _ := parity["landing_page_view_metric_requested"].(bool); !present {
		return fmt.Errorf("total_landing_page_view was not requested")
	}
	for _, field := range []string{"required_report_metrics_present", "backfill_endpoints_present", "backfill_data_levels_present"} {
		present, ok := parity[field].(map[string]bool)
		if !ok {
			return fmt.Errorf("%s has unexpected type %T", field, parity[field])
		}
		for key, ok := range present {
			if !ok {
				return fmt.Errorf("%s missing %s", field, key)
			}
		}
	}
	return nil
}

func writeTikTokBusinessBenchmarkArtifact(artifact tiktokBusinessBenchmarkArtifact) (string, error) {
	root := filepath.Join(os.Getenv("HOME"), "nexus", "state", "artifacts", "validation", "tiktok-business-local-benchmark")
	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", err
	}
	name := fmt.Sprintf("tiktok-business-local-benchmark-%s.json", strings.ReplaceAll(artifact.GeneratedAt, ":", "-"))
	path := filepath.Join(root, name)
	payload, err := json.MarshalIndent(artifact, "", "  ")
	if err != nil {
		return "", err
	}
	payload = append(payload, '\n')
	if err := os.WriteFile(path, payload, 0o600); err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(root, "latest.json"), payload, 0o600); err != nil {
		return "", err
	}
	return path, nil
}

func firstNonBlankEnv(names ...string) string {
	for _, name := range names {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	return ""
}

func intEnv(name string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func durationSecondsEnv(name string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return fallback
	}
	return time.Duration(value) * time.Second
}

func suffix(value string, length int) string {
	value = strings.TrimSpace(value)
	if len(value) <= length {
		return value
	}
	return value[len(value)-length:]
}

func stringFromMap(values map[string]any, key string) string {
	if values == nil {
		return ""
	}
	value, ok := values[key]
	if !ok || value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func stringMonitorFamilies(families []tiktokBusinessMonitorFamily) []string {
	out := make([]string, 0, len(families))
	for _, family := range families {
		out = append(out, string(family))
	}
	sort.Strings(out)
	return out
}

func countRequestsBy(requests []tiktokBusinessBenchmarkRequest, key func(tiktokBusinessBenchmarkRequest) string) map[string]int {
	counts := map[string]int{}
	for _, req := range requests {
		value := strings.TrimSpace(key(req))
		if value == "" {
			continue
		}
		counts[value]++
	}
	return counts
}

func unionRequestMetrics(requests []tiktokBusinessBenchmarkRequest) map[string]struct{} {
	metrics := map[string]struct{}{}
	for _, req := range requests {
		for _, metric := range req.Metrics {
			metric = strings.TrimSpace(metric)
			if metric != "" {
				metrics[metric] = struct{}{}
			}
		}
	}
	return metrics
}

func parseJSONStringSlice(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var values []string
	if err := json.Unmarshal([]byte(raw), &values); err != nil {
		return nil
	}
	return values
}

func requiredKeysPresent(values map[string]int, required []string) map[string]bool {
	out := map[string]bool{}
	for _, key := range required {
		out[key] = values[key] > 0
	}
	return out
}

func requiredStringsPresent(values []string, required []string) map[string]bool {
	out := map[string]bool{}
	for _, key := range required {
		out[key] = stringSliceContains(values, key)
	}
	return out
}

func stringSliceContains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func requestWindowKey(req tiktokBusinessBenchmarkRequest) string {
	parts := []string{req.Endpoint}
	if req.DataLevel != "" {
		parts = append(parts, req.DataLevel)
	}
	if req.StartDate != "" || req.EndDate != "" {
		parts = append(parts, req.StartDate+".."+req.EndDate)
	}
	return strings.Join(parts, " ")
}

func sortedCountMap(values map[string]int) map[string]int {
	if len(values) == 0 {
		return map[string]int{}
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	out := make(map[string]int, len(values))
	for _, key := range keys {
		out[key] = values[key]
	}
	return out
}

func sortedStringSet(values map[string]struct{}) []string {
	if len(values) == 0 {
		return nil
	}
	out := make([]string, 0, len(values))
	for value := range values {
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}
