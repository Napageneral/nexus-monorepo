package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	adapterName                  = "patient-now-emr-adapter"
	adapterVersion               = "0.1.0"
	platformID                   = "patient-now-emr"
	defaultPlatformCredentialURL = "https://hub.glowbot.com/api/platform-credentials"
	defaultHealthPath            = "/api/health"
	defaultMetricsPath           = "/api/v1/metrics/daily"
	dateLayout                   = "2006-01-02"
)

type patientNowCredentials struct {
	AccountID  string
	APIKey     string
	PracticeID string
	BaseURL    string
}

type metricPoint struct {
	Date        string
	MetricName  string
	MetadataKey string
	Value       float64
}

func main() {
	nexadapter.Run(nexadapter.DefineAdapter(adapterConfig()))
}

func adapterConfig() nexadapter.DefineAdapterConfig[struct{}] {
	return nexadapter.DefineAdapterConfig[struct{}]{
		Platform: platformID,
		Name:     adapterName,
		Version:  adapterVersion,
		Connection: nexadapter.ConnectionHandlers[struct{}]{
			Accounts: func(ctx nexadapter.AdapterContext[struct{}]) ([]nexadapter.AdapterAccount, error) {
				return accounts(ctx.Context)
			},
			Health: func(ctx nexadapter.AdapterContext[struct{}]) (*nexadapter.AdapterHealth, error) {
				return health(ctx.Context, ctx.ConnectionID)
			},
		},
		Ingest: nexadapter.IngestHandlers[struct{}]{
			Monitor: func(ctx nexadapter.AdapterContext[struct{}], emit nexadapter.EmitFunc) error {
				return monitor(ctx.Context, ctx.ConnectionID, emit)
			},
			Backfill: func(ctx nexadapter.AdapterContext[struct{}], since time.Time, emit nexadapter.EmitFunc) error {
				return backfill(ctx.Context, ctx.ConnectionID, since, emit)
			},
		},
		Methods:           map[string]nexadapter.DeclaredMethod[struct{}]{},
		CredentialService: "patient-now",
		MultiAccount:      true,
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					ID:      "patient_now_api_key",
					Type:    "api_key",
					Label:   "Enter API Key",
					Icon:    "key",
					Service: "patient-now",
					Fields: []nexadapter.AdapterAuthField{
						{
							Name:        "api_key",
							Label:       "API Key",
							Type:        "secret",
							Required:    true,
							Placeholder: "patientnow_api_key",
						},
						{
							Name:        "practice_id",
							Label:       "Practice ID",
							Type:        "text",
							Required:    true,
							Placeholder: "practice_123",
						},
						{
							Name:        "base_url",
							Label:       "PatientNow API Base URL",
							Type:        "text",
							Required:    false,
							Placeholder: "https://api.patientnow.example",
						},
					},
				},
				{
					ID:          "patient_now_csv_upload",
					Type:        "file_upload",
					Label:       "Upload CSV Export",
					Icon:        "upload",
					Accept:      []string{".csv"},
					TemplateURL: "/templates/emr-import.csv",
				},
			},
			SetupGuide: "PatientNow private API contracts are partner-gated. Fast path captures api_key + practice_id; set base_url when API access is provisioned.",
		},
		Capabilities: nexadapter.ChannelCapabilities{
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
	}
}

func info(ctx context.Context) (*nexadapter.AdapterInfo, error) {
	adapter := nexadapter.DefineAdapter(adapterConfig())
	return adapter.Operations.AdapterInfo(ctx)
}

func accounts(_ context.Context) ([]nexadapter.AdapterAccount, error) {
	return []nexadapter.AdapterAccount{
		{
			ID:            "default",
			DisplayName:   "default",
			CredentialRef: "patient-now/default",
			Status:        "ready",
		},
	}, nil
}

func health(ctx context.Context, connectionID string) (*nexadapter.AdapterHealth, error) {
	creds, err := resolvePatientNowCredentials(connectionID)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: connectionID,
			Error:        err.Error(),
		}, nil
	}

	if strings.TrimSpace(creds.BaseURL) == "" {
		return &nexadapter.AdapterHealth{
			Connected:    true,
			ConnectionID: creds.AccountID,
			LastEventAt:  time.Now().UnixMilli(),
			Details: map[string]any{
				"verification": "credentials_only",
				"warning":      "base_url not configured; remote API health check skipped",
			},
		}, nil
	}

	healthPath := nexadapter.FirstNonBlank(strings.TrimSpace(os.Getenv("NEXUS_PATIENT_NOW_HEALTH_PATH")), defaultHealthPath)
	params := url.Values{}
	params.Set("practice_id", creds.PracticeID)
	if err := patientNowRequest(ctx, creds, http.MethodGet, healthPath, params, nil); err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: creds.AccountID,
			Error:        err.Error(),
		}, nil
	}

	return &nexadapter.AdapterHealth{
		Connected:    true,
		ConnectionID: creds.AccountID,
		LastEventAt:  time.Now().UnixMilli(),
		Details: map[string]any{
			"practice_id": creds.PracticeID,
		},
	}, nil
}

func backfill(ctx context.Context, connectionID string, since time.Time, emit nexadapter.EmitFunc) error {
	events, _, err := fetchPatientNowMetricsSince(ctx, connectionID, since)
	if err != nil {
		return err
	}
	for _, event := range events {
		emit(event)
	}
	return nil
}

func monitor(ctx context.Context, connectionID string, emit nexadapter.EmitFunc) error {
	return nexadapter.PollMonitor(nexadapter.PollConfig[nexadapter.AdapterInboundRecord]{
		Interval: 15 * time.Minute,
		Fetch: func(ctx context.Context, since time.Time) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
			return fetchPatientNowMetricsSince(ctx, connectionID, since)
		},
		MaxConsecutiveErrors: 5,
	})(ctx, connectionID, emit)
}

func fetchPatientNowMetricsSince(ctx context.Context, connectionID string, since time.Time) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
	creds, err := resolvePatientNowCredentials(connectionID)
	if err != nil {
		return nil, time.Time{}, err
	}
	if strings.TrimSpace(creds.BaseURL) == "" {
		return nil, time.Time{}, errors.New("patient now API base_url is not configured; use CSV upload until partner API access is available")
	}

	metricsPath := nexadapter.FirstNonBlank(strings.TrimSpace(os.Getenv("NEXUS_PATIENT_NOW_METRICS_PATH")), defaultMetricsPath)
	params := url.Values{}
	params.Set("practice_id", creds.PracticeID)
	params.Set("since", since.UTC().Format(dateLayout))
	params.Set("until", time.Now().UTC().Format(dateLayout))

	var payload map[string]any
	if err := patientNowRequest(ctx, creds, http.MethodGet, metricsPath, params, &payload); err != nil {
		return nil, time.Time{}, err
	}

	metrics, err := extractMetricPoints(payload)
	if err != nil {
		return nil, time.Time{}, err
	}

	var events []nexadapter.AdapterInboundRecord
	for _, point := range metrics {
		if point.Value < 0 {
			continue
		}
		events = append(events, buildPatientNowEvents(creds, point)...)
	}

	return events, time.Now(), nil
}

func extractMetricPoints(payload map[string]any) ([]metricPoint, error) {
	if entries := arrayValue(payload["metrics"]); len(entries) > 0 {
		points := make([]metricPoint, 0, len(entries))
		for _, entry := range entries {
			item := mapValue(entry)
			if item == nil {
				continue
			}
			date := toISODate(stringValue(item["date"]))
			metricName := normalizeMetricName(stringValue(item["metric_name"]))
			value, ok := floatValue(item["metric_value"])
			if !ok || date == "" || metricName == "" {
				continue
			}
			points = append(points, metricPoint{
				Date:        date,
				MetricName:  metricName,
				MetadataKey: strings.TrimSpace(stringValue(item["metadata_key"])),
				Value:       value,
			})
		}
		if len(points) == 0 {
			return nil, errors.New("patient now metrics payload did not include usable metric rows")
		}
		return dedupePoints(points), nil
	}

	rows := arrayValue(payload["rows"])
	if len(rows) == 0 {
		rows = arrayValue(payload["data"])
	}
	if len(rows) == 0 {
		return nil, errors.New("patient now metrics payload missing both metrics[] and rows[]")
	}

	aggregates := map[string]*metricPoint{}
	for _, rowAny := range rows {
		row := mapValue(rowAny)
		if row == nil {
			continue
		}
		date := toISODate(stringValue(row["date"]))
		if date == "" {
			continue
		}
		status := strings.ToLower(strings.TrimSpace(stringValue(row["status"])))
		if isBookedStatus(status) {
			addMetric(aggregates, date, "appointments_booked", "", 1)
		}
		if isCompletedStatus(status) {
			addMetric(aggregates, date, "appointments_completed", "", 1)
			addMetric(aggregates, date, "treatments_completed", "", 1)
		}
		if isNoShowStatus(status) {
			addMetric(aggregates, date, "appointments_noshow", "", 1)
		}
		if isCancelledStatus(status) {
			addMetric(aggregates, date, "appointments_cancelled", "", 1)
		}

		if isNew, known := boolValue(row["is_new_patient"]); known {
			if isNew {
				addMetric(aggregates, date, "patients_new", "", 1)
			} else {
				addMetric(aggregates, date, "patients_returning", "", 1)
			}
		}
		if revenue, ok := floatValue(firstNonNil(row["revenue"], row["amount"])); ok {
			addMetric(aggregates, date, "revenue", "", revenue)
		}
	}

	return pointsFromMap(aggregates), nil
}

func patientNowRequest(
	ctx context.Context,
	creds patientNowCredentials,
	method string,
	endpoint string,
	params url.Values,
	out any,
) error {
	baseURL := strings.TrimRight(creds.BaseURL, "/")
	requestURL := baseURL + normalizeEndpoint(endpoint)
	if params != nil {
		encoded := params.Encode()
		if encoded != "" {
			requestURL += "?" + encoded
		}
	}

	req, err := http.NewRequestWithContext(ctx, method, requestURL, nil)
	if err != nil {
		return fmt.Errorf("build patient now request: %w", err)
	}
	req.Header.Set("accept", "application/json")
	req.Header.Set("authorization", "Bearer "+creds.APIKey)
	req.Header.Set("x-api-key", creds.APIKey)

	res, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return fmt.Errorf("patient now request failed: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		payload, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		return fmt.Errorf("patient now request failed (%d): %s", res.StatusCode, strings.TrimSpace(string(payload)))
	}

	if out == nil {
		return nil
	}
	if err := json.NewDecoder(res.Body).Decode(out); err != nil {
		return fmt.Errorf("parse patient now response: %w", err)
	}
	return nil
}

func buildPatientNowEvents(creds patientNowCredentials, point metricPoint) []nexadapter.AdapterInboundRecord {
	metadataToken := point.MetadataKey
	if strings.TrimSpace(metadataToken) == "" {
		metadataToken = "total"
	}
	eventID := strings.Join(
		[]string{
			platformID,
			nexadapter.SafeIDToken(creds.AccountID),
			nexadapter.SafeIDToken(point.Date),
			nexadapter.SafeIDToken(creds.PracticeID),
			nexadapter.SafeIDToken(point.MetricName),
			nexadapter.SafeIDToken(metadataToken),
		},
		":",
	)
	event := nexadapter.
		NewRecord(platformID, eventID).
		WithTimestampUnixMs(nexadapter.MetricTimestamp(point.Date, nil)).
		WithContent(fmt.Sprintf("%s=%g", point.MetricName, point.Value)).
		WithContentType("text").
		WithSender(platformID, "PatientNow").
		WithContainer("metrics", "channel").
		WithConnection(creds.AccountID).
		WithSpace(creds.PracticeID, creds.PracticeID).
		WithMetadata("adapter_id", platformID).
		WithMetadata("practice_id", creds.PracticeID).
		WithMetadata("date", point.Date).
		WithMetadata("metric_name", point.MetricName).
		WithMetadata("metric_value", point.Value).
		Build()
	if strings.TrimSpace(point.MetadataKey) != "" {
		event.Payload.Metadata["metadata_key"] = point.MetadataKey
	}

	return []nexadapter.AdapterInboundRecord{event}
}

func dedupePoints(points []metricPoint) []metricPoint {
	aggregates := map[string]*metricPoint{}
	for _, point := range points {
		addMetric(aggregates, point.Date, point.MetricName, point.MetadataKey, point.Value)
	}
	return pointsFromMap(aggregates)
}

func pointsFromMap(aggregates map[string]*metricPoint) []metricPoint {
	if len(aggregates) == 0 {
		return nil
	}
	keys := make([]string, 0, len(aggregates))
	for key := range aggregates {
		keys = append(keys, key)
	}
	sortStrings(keys)

	points := make([]metricPoint, 0, len(keys))
	for _, key := range keys {
		if point, ok := aggregates[key]; ok && point != nil {
			points = append(points, *point)
		}
	}
	return points
}

func addMetric(aggregates map[string]*metricPoint, date string, metricName string, metadataKey string, value float64) {
	if value == 0 {
		return
	}
	key := strings.Join([]string{date, metricName, metadataKey}, "|")
	if existing, ok := aggregates[key]; ok && existing != nil {
		existing.Value += value
		return
	}
	aggregates[key] = &metricPoint{
		Date:        date,
		MetricName:  metricName,
		MetadataKey: metadataKey,
		Value:       value,
	}
}

func normalizeMetricName(raw string) string {
	name := strings.TrimSpace(strings.ToLower(raw))
	if name == "" {
		return ""
	}
	name = strings.ReplaceAll(name, "-", "_")
	name = strings.ReplaceAll(name, " ", "_")
	switch name {
	case "patients_new", "patients_returning", "appointments_booked", "appointments_completed", "appointments_noshow", "appointments_cancelled", "treatments_completed", "revenue":
		return name
	default:
		return ""
	}
}

func resolvePatientNowCredentials(account string) (patientNowCredentials, error) {
	resolvedAccount := account
	if strings.TrimSpace(resolvedAccount) == "" {
		resolvedAccount = "default"
	}
	fields := map[string]string{}
	apiKey := ""
	practiceID := ""
	baseURL := ""

	runtimeContext, err := nexadapter.LoadRuntimeContextFromEnv()
	if err == nil && runtimeContext != nil {
		if strings.TrimSpace(runtimeContext.ConnectionID) != "" {
			resolvedAccount = runtimeContext.ConnectionID
		}
		if runtimeContext.Credential != nil {
			fields = runtimeContext.Credential.Fields
			apiKey = nexadapter.FirstNonBlank(
				nexadapter.FieldValue(fields, "api_key"),
				nexadapter.FieldValue(fields, "apikey"),
				nexadapter.FieldValue(fields, "key"),
				runtimeContext.Credential.Value,
			)
			practiceID = nexadapter.FirstNonBlank(
				nexadapter.FieldValue(fields, "practice_id"),
				nexadapter.FieldValue(fields, "practice"),
			)
			baseURL = nexadapter.FirstNonBlank(
				nexadapter.FieldValue(fields, "base_url"),
			)
		}
	}

	apiKey = nexadapter.FirstNonBlank(
		apiKey,
		strings.TrimSpace(os.Getenv("NEXUS_PATIENT_NOW_API_KEY")),
		strings.TrimSpace(os.Getenv("PATIENT_NOW_API_KEY")),
	)
	practiceID = nexadapter.FirstNonBlank(
		practiceID,
		strings.TrimSpace(os.Getenv("NEXUS_PATIENT_NOW_PRACTICE_ID")),
		strings.TrimSpace(os.Getenv("PATIENT_NOW_PRACTICE_ID")),
	)
	baseURL = nexadapter.FirstNonBlank(
		baseURL,
		strings.TrimSpace(os.Getenv("NEXUS_PATIENT_NOW_BASE_URL")),
		strings.TrimSpace(os.Getenv("PATIENT_NOW_BASE_URL")),
	)

	if strings.TrimSpace(apiKey) == "" {
		return patientNowCredentials{}, errors.New("missing api_key credential field")
	}
	if strings.TrimSpace(practiceID) == "" {
		return patientNowCredentials{}, errors.New("missing practice_id credential field")
	}

	return patientNowCredentials{
		AccountID:  resolvedAccount,
		APIKey:     strings.TrimSpace(apiKey),
		PracticeID: strings.TrimSpace(practiceID),
		BaseURL:    strings.TrimRight(strings.TrimSpace(baseURL), "/"),
	}, nil
}

func normalizeEndpoint(endpoint string) string {
	trimmed := strings.TrimSpace(endpoint)
	if trimmed == "" {
		return "/"
	}
	if strings.HasPrefix(trimmed, "/") {
		return trimmed
	}
	return "/" + trimmed
}

func mapValue(input any) map[string]any {
	m, _ := input.(map[string]any)
	return m
}

func arrayValue(input any) []any {
	items, _ := input.([]any)
	return items
}

func stringValue(input any) string {
	switch typed := input.(type) {
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(typed), 'f', -1, 64)
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case int32:
		return strconv.FormatInt(int64(typed), 10)
	default:
		return ""
	}
}

func boolValue(input any) (bool, bool) {
	switch typed := input.(type) {
	case bool:
		return typed, true
	case string:
		normalized := strings.ToLower(strings.TrimSpace(typed))
		switch normalized {
		case "true", "1", "yes", "y":
			return true, true
		case "false", "0", "no", "n":
			return false, true
		default:
			return false, false
		}
	default:
		return false, false
	}
}

func floatValue(input any) (float64, bool) {
	switch typed := input.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case int32:
		return float64(typed), true
	case string:
		value, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		if err != nil {
			return 0, false
		}
		return value, true
	default:
		return 0, false
	}
}

func firstNonNil(values ...any) any {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

func isBookedStatus(status string) bool {
	status = strings.ToLower(strings.TrimSpace(status))
	return status == "booked" || status == "confirmed" || status == "completed"
}

func isCompletedStatus(status string) bool {
	status = strings.ToLower(strings.TrimSpace(status))
	return status == "completed" || status == "closed"
}

func isNoShowStatus(status string) bool {
	status = strings.ToLower(strings.TrimSpace(status))
	return status == "no_show" || status == "no-show" || status == "noshow"
}

func isCancelledStatus(status string) bool {
	status = strings.ToLower(strings.TrimSpace(status))
	return status == "cancelled" || status == "canceled"
}

func toISODate(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if len(trimmed) >= 10 {
		if day := trimmed[:10]; isISODate(day) {
			return day
		}
	}
	parsed, err := time.Parse(time.RFC3339, trimmed)
	if err == nil {
		return parsed.UTC().Format(dateLayout)
	}
	parsed, err = time.Parse("2006-01-02", trimmed)
	if err == nil {
		return parsed.UTC().Format(dateLayout)
	}
	return ""
}

func isISODate(raw string) bool {
	if len(raw) != 10 {
		return false
	}
	_, err := time.Parse("2006-01-02", raw)
	return err == nil
}

func sortStrings(values []string) {
	for i := 0; i < len(values); i++ {
		for j := i + 1; j < len(values); j++ {
			if values[j] < values[i] {
				values[i], values[j] = values[j], values[i]
			}
		}
	}
}
