package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	adapterName        = "callrail-adapter"
	adapterVersion     = "0.1.0"
	platformID         = "callrail"
	defaultBaseURL     = "https://api.callrail.com"
	dateLayout         = "2006-01-02"
	maxPagesPerRequest = 100
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type callRailCredentials struct {
	AccountID string
	APIToken  string
	CompanyID string // optional — for multi-location filtering
	BaseURL   string
}

type callsResponse struct {
	Calls      []callRecord `json:"calls"`
	Page       int          `json:"page"`
	PerPage    int          `json:"per_page"`
	TotalPages int          `json:"total_pages"`
	TotalCount int          `json:"total_count"`
}

type callRecord struct {
	ID               string `json:"id"`
	StartTime        string `json:"start_time"`
	Duration         any    `json:"duration"` // string or number
	Direction        string `json:"direction"`
	AnsweredAt       string `json:"answered_at"`
	Source           string `json:"source"`
	Campaign         string `json:"campaign"`
	CampaignName     string `json:"campaign_name"`
	CompanyID        string `json:"company_id"`
	CompanyName      string `json:"company_name"`
	FirstCall        any    `json:"first_call"`  // bool or string
	LeadStatus       string `json:"lead_status"` // "good_lead", "not_a_lead", etc.
	Tags             []any  `json:"tags"`
	TrackingNumber   string `json:"tracking_phone_number"`
	ConversationID   string `json:"conversation_id"`
	FormSubmission   bool   `json:"form_submission"`
	CallType         string `json:"call_type"`
	Value            any    `json:"value"` // string or number — revenue attribution
}

type companiesResponse struct {
	Companies []struct {
		ID   any    `json:"id"` // sometimes int, sometimes string
		Name string `json:"name"`
	} `json:"companies"`
}

// callMetrics holds daily aggregated call metrics.
type callMetrics struct {
	TotalCalls     int
	AnsweredCalls  int
	MissedCalls    int
	FirstTimeCalls int
	TotalDuration  int // seconds
	BySource       map[string]int
	ByCampaign     map[string]int
	QualifiedLeads int
	ConvertedLeads int
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

func main() {
	nexadapter.Run(nexadapter.Adapter{
		Operations: nexadapter.AdapterOperations{
			AdapterInfo:          info,
			AdapterHealth:        health,
			AdapterAccountsList:  accounts,
			EventBackfill:        backfill,
			AdapterMonitorStart:  monitor,
		},
	})
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

func info(_ context.Context) (*nexadapter.AdapterInfo, error) {
	return &nexadapter.AdapterInfo{
		Platform: platformID,
		Name:     adapterName,
		Version:  adapterVersion,
		Operations: []nexadapter.AdapterOperation{
			nexadapter.OpAdapterInfo,
			nexadapter.OpAdapterHealth,
			nexadapter.OpAdapterAccountsList,
			nexadapter.OpEventBackfill,
			nexadapter.OpAdapterMonitorStart,
		},
		CredentialService: "callrail",
		MultiAccount:      true,
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					Type:    "api_key",
					Label:   "Enter API Token",
					Icon:    "key",
					Service: "callrail",
					Fields: []nexadapter.AdapterAuthField{
						{
							Name:        "api_token",
							Label:       "API Token",
							Type:        "secret",
							Required:    true,
							Placeholder: "callrail_api_token",
						},
						{
							Name:        "account_id",
							Label:       "Account ID",
							Type:        "text",
							Required:    true,
							Placeholder: "123456789",
						},
						{
							Name:        "company_id",
							Label:       "Company ID (optional, for multi-location)",
							Type:        "text",
							Required:    false,
							Placeholder: "COM8154748ae6",
						},
					},
				},
				{
					Type:        "file_upload",
					Label:       "Upload CSV Export",
					Icon:        "upload",
					Accept:      []string{".csv"},
					TemplateURL: "/templates/callrail-import.csv",
				},
			},
			SetupGuide: "Go to CallRail Settings → API Access to generate an API key. Note your Account ID from the URL.",
		},
		PlatformCapabilities: nexadapter.ChannelCapabilities{
			TextLimit:             20000,
			SupportsMarkdown:      true,
			MarkdownFlavor:        "standard",
			SupportsTables:        false,
			SupportsCodeBlocks:    false,
			SupportsEmbeds:        false,
			SupportsThreads:       false,
			SupportsReactions:     false,
			SupportsPolls:         false,
			SupportsButtons:       false,
			SupportsEdit:          false,
			SupportsDelete:        false,
			SupportsMedia:         false,
			SupportsVoiceNotes:    false,
			SupportsStreamingEdit: false,
		},
	}, nil
}

func accounts(_ context.Context) ([]nexadapter.AdapterAccount, error) {
	return []nexadapter.AdapterAccount{
		{
			ID:            "default",
			DisplayName:   "default",
			CredentialRef: "callrail/default",
			Status:        "ready",
		},
	}, nil
}

func health(ctx context.Context, account string) (*nexadapter.AdapterHealth, error) {
	account, err := nexadapter.RequireAccount(account)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   account,
			Error:     err.Error(),
		}, nil
	}

	creds, err := resolveCallRailCredentials(account)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   account,
			Error:     err.Error(),
		}, nil
	}

	// Test with a minimal calls query.
	params := url.Values{}
	params.Set("per_page", "1")
	var payload callsResponse
	if err := callRailGetJSON(ctx, creds, fmt.Sprintf("/v3/a/%s/calls.json", creds.AccountID), params, &payload); err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   creds.AccountID,
			Error:     err.Error(),
		}, nil
	}

	details := map[string]any{
		"account_id":  creds.AccountID,
		"total_calls": payload.TotalCount,
	}
	if strings.TrimSpace(creds.CompanyID) != "" {
		details["company_id"] = creds.CompanyID
	}

	return &nexadapter.AdapterHealth{
		Connected:   true,
		Account:     creds.AccountID,
		LastEventAt: time.Now().UnixMilli(),
		Details:     details,
	}, nil
}

func backfill(ctx context.Context, account string, since time.Time, emit nexadapter.EmitFunc) error {
	account, err := nexadapter.RequireAccount(account)
	if err != nil {
		return err
	}
	events, _, err := fetchCallRailMetricsSince(ctx, account, since)
	if err != nil {
		return err
	}
	for _, event := range events {
		emit(event)
	}
	return nil
}

func monitor(ctx context.Context, account string, emit nexadapter.EmitFunc) error {
	account, err := nexadapter.RequireAccount(account)
	if err != nil {
		return err
	}
	return nexadapter.PollMonitor(nexadapter.PollConfig{
		Interval: 6 * time.Hour,
		Fetch: func(ctx context.Context, since time.Time) ([]nexadapter.NexusEvent, time.Time, error) {
			return fetchCallRailMetricsSince(ctx, account, since)
		},
		MaxConsecutiveErrors: 5,
	})(ctx, account, emit)
}

// ---------------------------------------------------------------------------
// Core Fetch Logic
// ---------------------------------------------------------------------------

// fetchCallRailMetricsSince fetches calls since the given time across all
// discovered companies (multi-location). If a specific company_id is
// configured, only that company is included.
func fetchCallRailMetricsSince(ctx context.Context, account string, since time.Time) ([]nexadapter.NexusEvent, time.Time, error) {
	creds, err := resolveCallRailCredentials(account)
	if err != nil {
		return nil, time.Time{}, err
	}

	// Determine which companies to process.
	var companyIDs []string
	if strings.TrimSpace(creds.CompanyID) != "" {
		companyIDs = []string{creds.CompanyID}
	} else {
		companyIDs, err = fetchCompanies(ctx, creds)
		if err != nil {
			nexadapter.LogError("discover callrail companies: %v (proceeding without company filter)", err)
			companyIDs = nil // Will fetch all calls without company_id filter.
		}
		if len(companyIDs) > 0 {
			nexadapter.LogInfo("discovered %d callrail company/companies", len(companyIDs))
		}
	}

	from := since.UTC().Format(dateLayout)
	to := time.Now().UTC().Format(dateLayout)

	if len(companyIDs) == 0 {
		// No companies to iterate — fetch all calls for the account.
		calls, err := fetchCallsForDateRange(ctx, creds, from, to, "")
		if err != nil {
			return nil, time.Time{}, err
		}
		metrics := aggregateCallsByDate(calls)
		events := buildAllCallMetricEvents(creds.AccountID, "", metrics)
		return events, time.Now(), nil
	}

	var allEvents []nexadapter.NexusEvent
	for _, companyID := range companyIDs {
		calls, err := fetchCallsForDateRange(ctx, creds, from, to, companyID)
		if err != nil {
			nexadapter.LogError("fetch calls for company %s: %v", companyID, err)
			continue
		}
		metrics := aggregateCallsByDate(calls)
		events := buildAllCallMetricEvents(creds.AccountID, companyID, metrics)
		allEvents = append(allEvents, events...)
	}

	return allEvents, time.Now(), nil
}

// fetchCompanies discovers all companies (locations) for the account.
func fetchCompanies(ctx context.Context, creds callRailCredentials) ([]string, error) {
	var payload companiesResponse
	if err := callRailGetJSON(ctx, creds, "/v3/companies.json", nil, &payload); err != nil {
		return nil, err
	}

	var companyIDs []string
	for _, company := range payload.Companies {
		id := anyToString(company.ID)
		if id != "" {
			companyIDs = append(companyIDs, id)
		}
	}
	return companyIDs, nil
}

// fetchCallsForDateRange paginates through the calls API.
func fetchCallsForDateRange(ctx context.Context, creds callRailCredentials, from string, to string, companyID string) ([]callRecord, error) {
	var allCalls []callRecord

	for page := 1; page <= maxPagesPerRequest; page++ {
		params := url.Values{}
		params.Set("start_date", from)
		params.Set("end_date", to)
		params.Set("per_page", "250")
		params.Set("page", strconv.Itoa(page))
		params.Set("fields", "id,start_time,duration,direction,answered_at,source,campaign,campaign_name,company_id,company_name,first_call,lead_status,tags,value,call_type")
		if strings.TrimSpace(companyID) != "" {
			params.Set("company_id", companyID)
		}

		var resp callsResponse
		endpoint := fmt.Sprintf("/v3/a/%s/calls.json", creds.AccountID)
		if err := callRailGetJSON(ctx, creds, endpoint, params, &resp); err != nil {
			return nil, err
		}

		allCalls = append(allCalls, resp.Calls...)

		if page >= resp.TotalPages || len(resp.Calls) == 0 {
			break
		}
	}

	return allCalls, nil
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

func aggregateCallsByDate(calls []callRecord) map[string]*callMetrics {
	metrics := make(map[string]*callMetrics)

	for _, call := range calls {
		date := nexadapter.ExtractISODate(call.StartTime)
		if date == "" {
			continue
		}

		m, ok := metrics[date]
		if !ok {
			m = &callMetrics{
				BySource:   make(map[string]int),
				ByCampaign: make(map[string]int),
			}
			metrics[date] = m
		}

		m.TotalCalls++

		// Answered vs missed.
		if strings.TrimSpace(call.AnsweredAt) != "" {
			m.AnsweredCalls++
		} else {
			m.MissedCalls++
		}

		// First call (new caller).
		if isFirstCall(call.FirstCall) {
			m.FirstTimeCalls++
		}

		// Duration.
		dur := anyToInt(call.Duration)
		if dur > 0 {
			m.TotalDuration += dur
		}

		// By source.
		if source := strings.TrimSpace(call.Source); source != "" {
			m.BySource[source]++
		}

		// By campaign.
		campaign := nexadapter.FirstNonBlank(call.CampaignName, call.Campaign)
		if campaign != "" {
			m.ByCampaign[campaign]++
		}

		// Lead qualification.
		leadStatus := strings.ToLower(strings.TrimSpace(call.LeadStatus))
		if leadStatus == "good_lead" || leadStatus == "qualified" {
			m.QualifiedLeads++
		}
		if hasTag(call.Tags, "booked") || hasTag(call.Tags, "converted") || hasTag(call.Tags, "appointment") {
			m.ConvertedLeads++
		}
	}

	return metrics
}

func buildAllCallMetricEvents(account string, companyID string, metricsByDate map[string]*callMetrics) []nexadapter.NexusEvent {
	dates := sortedKeys(metricsByDate)
	var events []nexadapter.NexusEvent
	for _, date := range dates {
		m := metricsByDate[date]
		events = append(events, buildCallMetricEvents(account, companyID, date, m)...)
	}
	return events
}

func buildCallMetricEvents(account string, companyID string, date string, m *callMetrics) []nexadapter.NexusEvent {
	// Caller should have validated, but add safety check
	var err error
	account, err = nexadapter.RequireAccount(account)
	if err != nil {
		nexadapter.LogError("invalid account in buildCallMetricEvents: %v", err)
		account = "default" // fallback for safety
	}
	timestamp := nexadapter.MetricTimestamp(date, nil)

	companyToken := strings.ToLower(nexadapter.SafeIDToken(companyID))
	if companyToken == "na" {
		companyToken = "all"
	}

	type metricValue struct {
		name  string
		value float64
	}
	values := []metricValue{
		{name: "calls_total", value: float64(m.TotalCalls)},
		{name: "calls_answered", value: float64(m.AnsweredCalls)},
		{name: "calls_missed", value: float64(m.MissedCalls)},
		{name: "calls_first_time", value: float64(m.FirstTimeCalls)},
	}
	if m.TotalCalls > 0 && m.TotalDuration > 0 {
		values = append(values, metricValue{
			name:  "calls_duration_avg",
			value: math.Round(float64(m.TotalDuration)/float64(m.TotalCalls)*100) / 100,
		})
	}
	if m.QualifiedLeads > 0 {
		values = append(values, metricValue{name: "leads_qualified", value: float64(m.QualifiedLeads)})
	}
	if m.ConvertedLeads > 0 {
		values = append(values, metricValue{name: "leads_converted", value: float64(m.ConvertedLeads)})
	}

	// Add by-source metrics.
	for source, count := range m.BySource {
		values = append(values, metricValue{
			name:  "calls_by_source",
			value: float64(count),
		})
		_ = source // used in event metadata below
	}

	// Add by-campaign metrics.
	for campaign, count := range m.ByCampaign {
		values = append(values, metricValue{
			name:  "calls_by_campaign",
			value: float64(count),
		})
		_ = campaign // used in event metadata below
	}

	events := make([]nexadapter.NexusEvent, 0, len(values))

	// Core metrics (non-source/campaign).
	for _, metric := range values {
		if metric.value < 0 {
			continue
		}
		if metric.name == "calls_by_source" || metric.name == "calls_by_campaign" {
			continue // handled separately below
		}
		eventID := fmt.Sprintf("%s:%s:%s:%s:%s", platformID, strings.ToLower(nexadapter.SafeIDToken(account)), strings.ToLower(nexadapter.SafeIDToken(date)), companyToken, strings.ToLower(nexadapter.SafeIDToken(metric.name)))
		event := nexadapter.
			NewEvent(platformID, eventID).
			WithTimestampUnixMs(timestamp).
			WithContent(fmt.Sprintf("%s=%g", metric.name, metric.value)).
			WithContentType("text").
			WithSender(platformID, "CallRail").
			WithContainer("metrics", "channel").
			WithAccount(account).
			WithMetadata("adapter_id", platformID).
			WithMetadata("date", date).
			WithMetadata("metric_name", metric.name).
			WithMetadata("metric_value", metric.value).
			Build()
		if companyID != "" {
			event.Metadata["clinic_id"] = companyID
		}
		events = append(events, event)
	}

	// Per-source metrics.
	for source, count := range m.BySource {
		eventID := fmt.Sprintf("%s:%s:%s:%s:calls_by_source:%s", platformID, strings.ToLower(nexadapter.SafeIDToken(account)), strings.ToLower(nexadapter.SafeIDToken(date)), companyToken, strings.ToLower(nexadapter.SafeIDToken(source)))
		event := nexadapter.
			NewEvent(platformID, eventID).
			WithTimestampUnixMs(timestamp).
			WithContent(fmt.Sprintf("calls_by_source=%d", count)).
			WithContentType("text").
			WithSender(platformID, "CallRail").
			WithContainer("metrics", "channel").
			WithAccount(account).
			WithMetadata("adapter_id", platformID).
			WithMetadata("date", date).
			WithMetadata("metric_name", "calls_by_source").
			WithMetadata("metric_value", float64(count)).
			WithMetadata("metadata_key", source).
			Build()
		if companyID != "" {
			event.Metadata["clinic_id"] = companyID
		}
		events = append(events, event)
	}

	// Per-campaign metrics.
	for campaign, count := range m.ByCampaign {
		eventID := fmt.Sprintf("%s:%s:%s:%s:calls_by_campaign:%s", platformID, strings.ToLower(nexadapter.SafeIDToken(account)), strings.ToLower(nexadapter.SafeIDToken(date)), companyToken, strings.ToLower(nexadapter.SafeIDToken(campaign)))
		event := nexadapter.
			NewEvent(platformID, eventID).
			WithTimestampUnixMs(timestamp).
			WithContent(fmt.Sprintf("calls_by_campaign=%d", count)).
			WithContentType("text").
			WithSender(platformID, "CallRail").
			WithContainer("metrics", "channel").
			WithAccount(account).
			WithMetadata("adapter_id", platformID).
			WithMetadata("date", date).
			WithMetadata("metric_name", "calls_by_campaign").
			WithMetadata("metric_value", float64(count)).
			WithMetadata("metadata_key", campaign).
			Build()
		if companyID != "" {
			event.Metadata["clinic_id"] = companyID
		}
		events = append(events, event)
	}

	return events
}

// ---------------------------------------------------------------------------
// HTTP Client
// ---------------------------------------------------------------------------

func callRailGetJSON(ctx context.Context, creds callRailCredentials, endpoint string, params url.Values, out any) error {
	baseURL := strings.TrimRight(creds.BaseURL, "/")
	requestURL := baseURL + endpoint
	if params != nil {
		encoded := params.Encode()
		if encoded != "" {
			requestURL += "?" + encoded
		}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return fmt.Errorf("build callrail request: %w", err)
	}
	req.Header.Set("accept", "application/json")
	req.Header.Set("authorization", fmt.Sprintf("Token token=\"%s\"", creds.APIToken))

	res, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return fmt.Errorf("callrail request failed: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		payload, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		return fmt.Errorf("callrail request failed (%d): %s", res.StatusCode, strings.TrimSpace(string(payload)))
	}

	if out == nil {
		return nil
	}
	if err := json.NewDecoder(res.Body).Decode(out); err != nil {
		return fmt.Errorf("parse callrail response: %w", err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Credential Resolution
// ---------------------------------------------------------------------------

func resolveCallRailCredentials(account string) (callRailCredentials, error) {
	account, err := nexadapter.RequireAccount(account)
	if err != nil {
		return callRailCredentials{}, fmt.Errorf("invalid account: %w", err)
	}

	fields := map[string]string{}
	apiToken := ""
	accountID := ""
	companyID := ""
	baseURL := ""

	runtimeContext, err := nexadapter.LoadRuntimeContextFromEnv()
	if err == nil && runtimeContext != nil {
		if runtimeContext.Credential != nil {
			fields = runtimeContext.Credential.Fields
			apiToken = nexadapter.FirstNonBlank(
				nexadapter.FieldValue(fields, "api_token"),
				nexadapter.FieldValue(fields, "api_key"),
				nexadapter.FieldValue(fields, "token"),
				runtimeContext.Credential.Value,
			)
			accountID = nexadapter.FirstNonBlank(
				nexadapter.FieldValue(fields, "account_id"),
			)
			companyID = nexadapter.FirstNonBlank(
				nexadapter.FieldValue(fields, "company_id"),
			)
			baseURL = nexadapter.FirstNonBlank(
				nexadapter.FieldValue(fields, "base_url"),
			)
		}
	}

	apiToken = nexadapter.FirstNonBlank(
		apiToken,
		strings.TrimSpace(os.Getenv("NEXUS_CALLRAIL_API_TOKEN")),
		strings.TrimSpace(os.Getenv("CALLRAIL_API_TOKEN")),
	)
	accountID = nexadapter.FirstNonBlank(
		accountID,
		strings.TrimSpace(os.Getenv("NEXUS_CALLRAIL_ACCOUNT_ID")),
		strings.TrimSpace(os.Getenv("CALLRAIL_ACCOUNT_ID")),
	)
	companyID = nexadapter.FirstNonBlank(
		companyID,
		strings.TrimSpace(os.Getenv("NEXUS_CALLRAIL_COMPANY_ID")),
		strings.TrimSpace(os.Getenv("CALLRAIL_COMPANY_ID")),
	)
	baseURL = nexadapter.FirstNonBlank(
		baseURL,
		strings.TrimSpace(os.Getenv("NEXUS_CALLRAIL_BASE_URL")),
		defaultBaseURL,
	)

	if strings.TrimSpace(apiToken) == "" {
		return callRailCredentials{}, errors.New("missing api_token credential field")
	}
	if strings.TrimSpace(accountID) == "" {
		return callRailCredentials{}, errors.New("missing account_id credential field")
	}

	return callRailCredentials{
		AccountID: strings.TrimSpace(accountID),
		APIToken:  strings.TrimSpace(apiToken),
		CompanyID: strings.TrimSpace(companyID),
		BaseURL:   strings.TrimRight(strings.TrimSpace(baseURL), "/"),
	}, nil
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

func isFirstCall(value any) bool {
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		return strings.ToLower(strings.TrimSpace(typed)) == "true" || typed == "1"
	default:
		return false
	}
}

func hasTag(tags []any, target string) bool {
	target = strings.ToLower(strings.TrimSpace(target))
	for _, tag := range tags {
		var tagStr string
		switch typed := tag.(type) {
		case string:
			tagStr = typed
		case map[string]any:
			if name, ok := typed["name"].(string); ok {
				tagStr = name
			}
		}
		if strings.ToLower(strings.TrimSpace(tagStr)) == target {
			return true
		}
	}
	return false
}

func anyToInt(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case string:
		n, _ := strconv.Atoi(strings.TrimSpace(typed))
		return n
	default:
		return 0
	}
}

func anyToString(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case float64:
		return strconv.FormatFloat(typed, 'f', 0, 64)
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	default:
		return ""
	}
}

func sortedKeys(m map[string]*callMetrics) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	// Simple insertion sort (small N).
	for i := 1; i < len(keys); i++ {
		for j := i; j > 0 && keys[j] < keys[j-1]; j-- {
			keys[j], keys[j-1] = keys[j-1], keys[j]
		}
	}
	return keys
}
