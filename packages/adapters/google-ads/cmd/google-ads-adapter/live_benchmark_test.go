package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

type googleLiveRequestSummary struct {
	Phase  string `json:"phase"`
	Method string `json:"method"`
	Path   string `json:"path"`
	Family string `json:"family,omitempty"`
}

type googleLiveBenchmarkArtifact struct {
	AdapterID                       string                     `json:"adapter_id"`
	AdapterVersion                  string                     `json:"adapter_version"`
	RequestedAt                     string                     `json:"requested_at"`
	CustomerID                      string                     `json:"customer_id"`
	BackfillSince                   string                     `json:"backfill_since"`
	BackfillUntil                   string                     `json:"backfill_until"`
	BackfillRequestCount            int                        `json:"backfill_request_count"`
	BackfillRecordCount             int                        `json:"backfill_record_count"`
	BackfillFamilyCounts            map[string]int             `json:"backfill_family_counts"`
	RequiredFamiliesPresent         map[string]bool            `json:"required_families_present"`
	FirstMonitorDueFamilies         []googleMonitorFamily      `json:"first_monitor_due_families"`
	FirstMonitorSuccessfulFamilies  []googleMonitorFamily      `json:"first_monitor_successful_families"`
	FirstMonitorFailedFamilies      []googleMonitorFamily      `json:"first_monitor_failed_families"`
	FirstMonitorRequestCount        int                        `json:"first_monitor_request_count"`
	FirstMonitorEmittedRecordCount  int                        `json:"first_monitor_emitted_record_count"`
	SteadyMonitorCycles             int                        `json:"steady_monitor_cycles"`
	SteadyMonitorRequestCount       int                        `json:"steady_monitor_request_count"`
	SteadyMonitorEmittedRecordCount int                        `json:"steady_monitor_emitted_record_count"`
	SteadyMonitorFailedFamilies     []googleMonitorFamily      `json:"steady_monitor_failed_families"`
	RequestSamples                  []googleLiveRequestSummary `json:"request_samples"`
}

type googleCountingTransport struct {
	base     http.RoundTripper
	mu       sync.Mutex
	phase    string
	requests []googleLiveRequestSummary
}

func (transport *googleCountingTransport) SetPhase(phase string) {
	transport.mu.Lock()
	defer transport.mu.Unlock()
	transport.phase = phase
}

func (transport *googleCountingTransport) Requests() []googleLiveRequestSummary {
	transport.mu.Lock()
	defer transport.mu.Unlock()
	copied := make([]googleLiveRequestSummary, len(transport.requests))
	copy(copied, transport.requests)
	return copied
}

func (transport *googleCountingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	var body []byte
	if req.Body != nil {
		body, _ = io.ReadAll(req.Body)
		req.Body = io.NopCloser(bytes.NewReader(body))
	}

	transport.mu.Lock()
	phase := transport.phase
	transport.requests = append(transport.requests, summarizeGoogleLiveRequest(phase, req, body))
	transport.mu.Unlock()

	return transport.base.RoundTrip(req)
}

func TestLiveGoogleAdsLocalBenchmark(t *testing.T) {
	if strings.TrimSpace(os.Getenv("GOOGLE_ADS_LIVE_BENCHMARK")) == "" {
		t.Skip("set GOOGLE_ADS_LIVE_BENCHMARK=1 to run the live MoonSleep Google Ads benchmark")
	}

	t.Setenv(googleAdapterStateDirEnv, t.TempDir())
	counter := &googleCountingTransport{
		base:  http.DefaultTransport,
		phase: "setup",
	}
	previousClient := googleAdsHTTPClient
	previousTokenCache := googleAccessTokenCached
	googleAdsHTTPClient = &http.Client{Timeout: defaultHTTPTimeout, Transport: counter}
	googleAccessTokenCached = nil
	t.Cleanup(func() {
		googleAdsHTTPClient = previousClient
		googleAccessTokenCached = previousTokenCache
	})

	ctx := context.Background()
	connectionID := "local-moonsleep-google-ads"
	creds, err := resolveGoogleAdsCredentials(connectionID)
	if err != nil {
		t.Fatalf("resolveGoogleAdsCredentials: %v", err)
	}

	asOf := time.Now().UTC()
	since := asOf.AddDate(0, 0, -30)
	counter.SetPhase("backfill")
	backfillRecords, _, err := fetchGoogleAdsRowsCycle(ctx, connectionID, since, asOf, googleSyncModeBackfill)
	if err != nil {
		t.Fatalf("fetchGoogleAdsRowsCycle: %v", err)
	}

	monitorState := defaultGoogleMonitorState()
	revisionStore, err := loadGoogleRevisionStore(connectionID)
	if err != nil {
		t.Fatalf("loadGoogleRevisionStore: %v", err)
	}

	firstPoll := asOf
	counter.SetPhase("monitor_first")
	var firstMonitorRecords []nexadapter.AdapterInboundRecord
	firstMonitor := runGoogleMonitorCycle(ctx, creds, monitorState, revisionStore, firstPoll, func(record any) {
		if inbound, ok := record.(nexadapter.AdapterInboundRecord); ok {
			firstMonitorRecords = append(firstMonitorRecords, inbound)
		}
	})
	if len(firstMonitor.FailedFamilies) > 0 {
		t.Fatalf("first monitor failed families: %v", firstMonitor.FailedFamilies)
	}

	const steadyCycles = 10
	var steadyRecords []nexadapter.AdapterInboundRecord
	var steadyFailed []googleMonitorFamily
	counter.SetPhase("monitor_steady")
	for index := 1; index <= steadyCycles; index++ {
		result := runGoogleMonitorCycle(ctx, creds, monitorState, revisionStore, firstPoll.Add(time.Duration(index)*defaultMonitorInterval), func(record any) {
			if inbound, ok := record.(nexadapter.AdapterInboundRecord); ok {
				steadyRecords = append(steadyRecords, inbound)
			}
		})
		steadyFailed = append(steadyFailed, result.FailedFamilies...)
	}
	if len(steadyFailed) > 0 {
		t.Fatalf("steady monitor failed families: %v", steadyFailed)
	}

	requests := counter.Requests()
	artifact := googleLiveBenchmarkArtifact{
		AdapterID:                       platformID,
		AdapterVersion:                  adapterVersion,
		RequestedAt:                     time.Now().UTC().Format(time.RFC3339),
		CustomerID:                      creds.CustomerID,
		BackfillSince:                   since.Format(dateLayout),
		BackfillUntil:                   asOf.Format(dateLayout),
		BackfillRequestCount:            countGoogleProviderRequests(requests, "backfill"),
		BackfillRecordCount:             len(backfillRecords),
		BackfillFamilyCounts:            countGoogleRecordFamilies(backfillRecords),
		RequiredFamiliesPresent:         requiredGoogleFamiliesPresent(backfillRecords),
		FirstMonitorDueFamilies:         firstMonitor.DueFamilies,
		FirstMonitorSuccessfulFamilies:  firstMonitor.SuccessfulFamilies,
		FirstMonitorFailedFamilies:      firstMonitor.FailedFamilies,
		FirstMonitorRequestCount:        countGoogleProviderRequests(requests, "monitor_first"),
		FirstMonitorEmittedRecordCount:  len(firstMonitorRecords),
		SteadyMonitorCycles:             steadyCycles,
		SteadyMonitorRequestCount:       countGoogleProviderRequests(requests, "monitor_steady"),
		SteadyMonitorEmittedRecordCount: len(steadyRecords),
		SteadyMonitorFailedFamilies:     steadyFailed,
		RequestSamples:                  firstNGoogleLiveRequests(requests, 32),
	}

	assertGoogleAllTrue(t, "required families", artifact.RequiredFamiliesPresent)
	if artifact.BackfillRecordCount == 0 {
		t.Fatalf("expected live backfill records")
	}
	if artifact.SteadyMonitorRequestCount > steadyCycles {
		t.Fatalf("steady monitor made too many provider requests: %d", artifact.SteadyMonitorRequestCount)
	}
	if artifact.SteadyMonitorEmittedRecordCount != 0 {
		t.Fatalf("expected steady monitor duplicate suppression, got %d emitted records", artifact.SteadyMonitorEmittedRecordCount)
	}

	path := writeGoogleLiveBenchmarkArtifact(t, artifact)
	t.Logf("google ads live benchmark artifact: %s", path)
}

func summarizeGoogleLiveRequest(phase string, req *http.Request, body []byte) googleLiveRequestSummary {
	path := ""
	method := ""
	if req != nil {
		method = req.Method
		if req.URL != nil {
			path = req.URL.Path
		}
	}
	return googleLiveRequestSummary{
		Phase:  phase,
		Method: method,
		Path:   path,
		Family: classifyGoogleLiveRequest(path, body),
	}
}

func classifyGoogleLiveRequest(path string, body []byte) string {
	switch {
	case strings.Contains(path, "/token"):
		return "oauth_token"
	case strings.Contains(path, "customers:listAccessibleCustomers"):
		return "account_access_snapshot"
	}
	var payload struct {
		Query string `json:"query"`
	}
	_ = json.Unmarshal(body, &payload)
	query := payload.Query
	switch {
	case strings.Contains(query, "FROM customer"):
		return "account_access_snapshot"
	case strings.Contains(query, "FROM ad_group_ad"):
		return "ad_daily"
	case strings.Contains(query, "FROM ad_group"):
		return "ad_group_daily"
	case strings.Contains(query, "segments.hour"):
		return "campaign_hourly"
	case strings.Contains(query, "FROM campaign"):
		return "campaign_daily"
	default:
		return ""
	}
}

func countGoogleProviderRequests(requests []googleLiveRequestSummary, phase string) int {
	count := 0
	for _, request := range requests {
		if request.Phase == phase && request.Family != "oauth_token" {
			count++
		}
	}
	return count
}

func firstNGoogleLiveRequests(requests []googleLiveRequestSummary, limit int) []googleLiveRequestSummary {
	if len(requests) <= limit {
		return requests
	}
	return requests[:limit]
}

func countGoogleRecordFamilies(records []nexadapter.AdapterInboundRecord) map[string]int {
	counts := map[string]int{}
	for _, record := range records {
		if family := googleRecordFamily(record); family != "" {
			counts[family]++
		}
	}
	return counts
}

func requiredGoogleFamiliesPresent(records []nexadapter.AdapterInboundRecord) map[string]bool {
	counts := countGoogleRecordFamilies(records)
	present := map[string]bool{}
	for _, family := range googleRowFamilies {
		present[family.ID] = counts[family.ID] > 0
	}
	return present
}

func googleRecordFamily(record nexadapter.AdapterInboundRecord) string {
	if record.Payload.Metadata == nil {
		return ""
	}
	value, _ := record.Payload.Metadata["family"].(string)
	return strings.TrimSpace(value)
}

func assertGoogleAllTrue(t *testing.T, label string, values map[string]bool) {
	t.Helper()
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if !values[key] {
			t.Fatalf("%s missing %s: %#v", label, key, values)
		}
	}
}

func writeGoogleLiveBenchmarkArtifact(t *testing.T, artifact googleLiveBenchmarkArtifact) string {
	t.Helper()
	root := filepath.Join(os.Getenv("HOME"), "nexus", "state", "artifacts", "validation", "google-ads-local-benchmark")
	if err := os.MkdirAll(root, 0o700); err != nil {
		t.Fatalf("create artifact dir: %v", err)
	}
	path := filepath.Join(root, "google-ads-local-benchmark-"+time.Now().UTC().Format("2006-01-02T15-04-05Z")+".json")
	payload, err := json.MarshalIndent(artifact, "", "  ")
	if err != nil {
		t.Fatalf("marshal artifact: %v", err)
	}
	if err := os.WriteFile(path, append(payload, '\n'), 0o600); err != nil {
		t.Fatalf("write artifact: %v", err)
	}
	return path
}
