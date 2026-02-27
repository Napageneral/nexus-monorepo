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
	adapterName                  = "zenoti-emr-adapter"
	adapterVersion               = "0.1.0"
	platformID                   = "zenoti-emr"
	defaultPlatformCredentialURL = "https://hub.glowbot.com/api/platform-credentials"
	defaultZenotiBaseURL         = "https://api.zenoti.com"
	dateLayout                   = "2006-01-02"
)

type zenotiCredentials struct {
	AccountID string
	APIKey    string
	CenterID  string
	BaseURL   string
}

type metricPoint struct {
	Date        string
	MetricName  string
	MetadataKey string
	Value       float64
}

func main() {
	nexadapter.Run(nexadapter.Adapter{
		Operations: nexadapter.AdapterOperations{
			AdapterInfo:         info,
			AdapterHealth:       health,
			AdapterAccountsList: accounts,
			EventBackfill:       backfill,
		},
	})
}

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
		},
		CredentialService: "zenoti",
		MultiAccount:      true,
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					Type:    "api_key",
					Label:   "Enter API Key",
					Icon:    "key",
					Service: "zenoti",
					Fields: []nexadapter.AdapterAuthField{
						{
							Name:        "api_key",
							Label:       "API Key",
							Type:        "secret",
							Required:    true,
							Placeholder: "zenoti_api_key",
						},
						{
							Name:        "center_id",
							Label:       "Center ID",
							Type:        "text",
							Required:    false,
							Placeholder: "center_123",
						},
						{
							Name:        "base_url",
							Label:       "Zenoti API Base URL",
							Type:        "text",
							Required:    false,
							Placeholder: "https://api.zenoti.com",
						},
					},
				},
					{
						Type:                  "oauth2",
						Label:                 "Connect with Zenoti",
						Icon:                  "oauth",
						Service:               "zenoti",
						Scopes:                []string{"appointments:read"},
						PlatformCredentials:   true,
						PlatformCredentialURL: platformCredentialURL(),
					},
				{
					Type:        "file_upload",
					Label:       "Upload CSV Export",
					Icon:        "upload",
					Accept:      []string{".csv"},
					TemplateURL: "/templates/emr-import.csv",
				},
			},
			SetupGuide: "Fast path uses api_key. Provide center_id for API sync/backfill; CSV fallback works without API access.",
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
			CredentialRef: "zenoti/default",
			Status:        "ready",
		},
	}, nil
}

func health(ctx context.Context, account string) (*nexadapter.AdapterHealth, error) {
	creds, err := resolveZenotiCredentials(account)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   fallbackAccount(account),
			Error:     err.Error(),
		}, nil
	}

	if strings.TrimSpace(creds.CenterID) == "" {
		return &nexadapter.AdapterHealth{
			Connected:   true,
			Account:     creds.AccountID,
			LastEventAt: time.Now().UnixMilli(),
			Details: map[string]any{
				"warning": "center_id missing; API health verification skipped",
			},
		}, nil
	}

	today := time.Now().UTC().Format(dateLayout)
	_, err = fetchAppointmentsWindow(ctx, creds, today, today)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   creds.AccountID,
			Error:     err.Error(),
		}, nil
	}

	return &nexadapter.AdapterHealth{
		Connected:   true,
		Account:     creds.AccountID,
		LastEventAt: time.Now().UnixMilli(),
		Details: map[string]any{
			"center_id": creds.CenterID,
		},
	}, nil
}

func backfill(ctx context.Context, account string, since time.Time, emit nexadapter.EmitFunc) error {
	creds, err := resolveZenotiCredentials(account)
	if err != nil {
		return err
	}
	if strings.TrimSpace(creds.CenterID) == "" {
		return errors.New("missing center_id credential field for zenoti backfill")
	}

	windowStart := truncateDay(since.UTC())
	windowEnd := truncateDay(time.Now().UTC())

	aggregates := map[string]*metricPoint{}
	for !windowStart.After(windowEnd) {
		chunkEnd := windowStart.AddDate(0, 0, 6)
		if chunkEnd.After(windowEnd) {
			chunkEnd = windowEnd
		}

		rows, err := fetchAppointmentsWindow(
			ctx,
			creds,
			windowStart.Format(dateLayout),
			chunkEnd.Format(dateLayout),
		)
		if err != nil {
			return err
		}
		aggregateAppointmentRows(aggregates, rows)

		windowStart = chunkEnd.AddDate(0, 0, 1)
	}

	for _, point := range sortedMetricPoints(aggregates) {
		if point.Value < 0 {
			continue
		}
		for _, event := range buildZenotiMetricEvents(creds, point) {
			emit(event)
		}
	}

	return nil
}

func fetchAppointmentsWindow(
	ctx context.Context,
	creds zenotiCredentials,
	from string,
	to string,
) ([]map[string]any, error) {
	pageToken := ""
	rows := make([]map[string]any, 0, 256)

	for page := 0; page < 50; page++ {
		params := url.Values{}
		params.Set("center_id", creds.CenterID)
		params.Set("start_date", from)
		params.Set("end_date", to)
		params.Set("page_size", "200")
		if pageToken != "" {
			params.Set("page_token", pageToken)
		}

		var payload map[string]any
		if err := zenotiGetJSON(ctx, creds, "/v1/appointments", params, &payload); err != nil {
			return nil, err
		}

		rows = append(rows, extractRows(payload)...)
		nextPage := firstNonBlank(
			stringValue(payload["next_page_token"]),
			stringValue(mapValue(payload["pagination"])["next_page_token"]),
		)
		if strings.TrimSpace(nextPage) == "" {
			break
		}
		pageToken = strings.TrimSpace(nextPage)
	}

	return rows, nil
}

func zenotiGetJSON(
	ctx context.Context,
	creds zenotiCredentials,
	endpoint string,
	params url.Values,
	out any,
) error {
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
		return fmt.Errorf("build zenoti request: %w", err)
	}
	req.Header.Set("accept", "application/json")
	req.Header.Set("authorization", "apikey "+creds.APIKey)
	req.Header.Set("x-api-key", creds.APIKey)

	res, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return fmt.Errorf("zenoti request failed: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		payload, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		return fmt.Errorf("zenoti request failed (%d): %s", res.StatusCode, strings.TrimSpace(string(payload)))
	}

	if out == nil {
		return nil
	}
	if err := json.NewDecoder(res.Body).Decode(out); err != nil {
		return fmt.Errorf("parse zenoti response: %w", err)
	}
	return nil
}

func extractRows(payload map[string]any) []map[string]any {
	rowsAny, ok := payload["appointments"].([]any)
	if !ok {
		rowsAny, _ = payload["data"].([]any)
	}
	rows := make([]map[string]any, 0, len(rowsAny))
	for _, row := range rowsAny {
		if m := mapValue(row); m != nil {
			rows = append(rows, m)
		}
	}
	return rows
}

func aggregateAppointmentRows(target map[string]*metricPoint, rows []map[string]any) {
	for _, row := range rows {
		date := appointmentDate(row)
		if date == "" {
			continue
		}

		status := strings.ToLower(strings.TrimSpace(stringValue(row["status"])))
		if isBookedStatus(status) {
			addMetric(target, date, "appointments_booked", "", 1)
		}
		if isCompletedStatus(status) {
			addMetric(target, date, "appointments_completed", "", 1)
			addMetric(target, date, "treatments_completed", "", 1)
		}
		if isNoShowStatus(status) {
			addMetric(target, date, "appointments_noshow", "", 1)
		}
		if isCancelledStatus(status) {
			addMetric(target, date, "appointments_cancelled", "", 1)
		}

		if isNew, known := appointmentNewGuest(row); known {
			if isNew {
				addMetric(target, date, "patients_new", "", 1)
			} else {
				addMetric(target, date, "patients_returning", "", 1)
			}
		}

		revenue := revenueValue(row)
		if revenue > 0 {
			addMetric(target, date, "revenue", "", revenue)
			if category := serviceCategory(row); category != "" {
				addMetric(target, date, "revenue_per_service_category", category, revenue)
			}
		}
	}
}

func addMetric(target map[string]*metricPoint, date string, metricName string, metadataKey string, value float64) {
	if value == 0 {
		return
	}
	key := strings.Join([]string{date, metricName, metadataKey}, "|")
	point, ok := target[key]
	if !ok {
		target[key] = &metricPoint{
			Date:        date,
			MetricName:  metricName,
			MetadataKey: metadataKey,
			Value:       value,
		}
		return
	}
	point.Value += value
}

func sortedMetricPoints(points map[string]*metricPoint) []metricPoint {
	if len(points) == 0 {
		return nil
	}
	keys := make([]string, 0, len(points))
	for key := range points {
		keys = append(keys, key)
	}
	sortStrings(keys)

	result := make([]metricPoint, 0, len(keys))
	for _, key := range keys {
		if point, ok := points[key]; ok && point != nil {
			result = append(result, *point)
		}
	}
	return result
}

func buildZenotiMetricEvents(creds zenotiCredentials, point metricPoint) []nexadapter.NexusEvent {
	metadataToken := point.MetadataKey
	if strings.TrimSpace(metadataToken) == "" {
		metadataToken = "total"
	}
	eventID := strings.Join(
		[]string{
			platformID,
			sanitizeToken(creds.AccountID),
			sanitizeToken(point.Date),
			sanitizeToken(creds.CenterID),
			sanitizeToken(point.MetricName),
			sanitizeToken(metadataToken),
		},
		":",
	)
	event := nexadapter.
		NewEvent(platformID, eventID).
		WithTimestampUnixMs(metricTimestampMs(point.Date)).
		WithContent(fmt.Sprintf("%s=%g", point.MetricName, point.Value)).
		WithContentType("text").
		WithSender(platformID, "Zenoti").
		WithContainer("metrics", "channel").
		WithAccount(creds.AccountID).
		WithMetadata("adapter_id", platformID).
		WithMetadata("center_id", creds.CenterID).
		WithMetadata("date", point.Date).
		WithMetadata("metric_name", point.MetricName).
		WithMetadata("metric_value", point.Value).
		Build()

	if strings.TrimSpace(point.MetadataKey) != "" {
		event.Metadata["metadata_key"] = point.MetadataKey
	}

	return []nexadapter.NexusEvent{event}
}

func appointmentDate(row map[string]any) string {
	for _, key := range []string{"date", "appointment_date", "start_date", "start_time", "scheduled_time"} {
		if value := stringValue(row[key]); value != "" {
			if iso := toISODate(value); iso != "" {
				return iso
			}
		}
	}
	return ""
}

func appointmentNewGuest(row map[string]any) (bool, bool) {
	for _, key := range []string{"is_new_guest", "is_new", "new_guest"} {
		if value, known := boolValue(row[key]); known {
			return value, true
		}
	}
	guest := mapValue(row["guest"])
	if guest == nil {
		return false, false
	}
	for _, key := range []string{"is_new_guest", "is_new", "new_guest"} {
		if value, known := boolValue(guest[key]); known {
			return value, true
		}
	}
	if visits, ok := intValue(guest["visits_count"]); ok {
		if visits <= 0 {
			return true, true
		}
		return false, true
	}
	return false, false
}

func revenueValue(row map[string]any) float64 {
	for _, key := range []string{"revenue", "amount", "invoice_amount", "total_amount"} {
		if value, ok := floatValue(row[key]); ok {
			return value
		}
	}
	invoice := mapValue(row["invoice"])
	if invoice != nil {
		for _, key := range []string{"total_amount", "grand_total", "amount"} {
			if value, ok := floatValue(invoice[key]); ok {
				return value
			}
		}
	}
	return 0
}

func serviceCategory(row map[string]any) string {
	for _, key := range []string{"service_category", "serviceCategory"} {
		if value := strings.TrimSpace(stringValue(row[key])); value != "" {
			return value
		}
	}
	service := mapValue(row["service"])
	if service != nil {
		if value := strings.TrimSpace(stringValue(service["category"])); value != "" {
			return value
		}
	}
	return ""
}

func isBookedStatus(status string) bool {
	status = strings.ToLower(strings.TrimSpace(status))
	return status == "booked" || status == "confirmed" || status == "checked_in" ||
		status == "checked-in" || status == "started" || status == "closed" || status == "completed"
}

func isCompletedStatus(status string) bool {
	status = strings.ToLower(strings.TrimSpace(status))
	return status == "closed" || status == "completed"
}

func isNoShowStatus(status string) bool {
	status = strings.ToLower(strings.TrimSpace(status))
	return status == "no_show" || status == "no-show" || status == "noshow"
}

func isCancelledStatus(status string) bool {
	status = strings.ToLower(strings.TrimSpace(status))
	return status == "cancelled" || status == "canceled"
}

func resolveZenotiCredentials(account string) (zenotiCredentials, error) {
	resolvedAccount := fallbackAccount(account)
	fields := map[string]string{}
	apiKey := ""
	centerID := ""
	baseURL := ""

	runtimeContext, err := nexadapter.LoadRuntimeContextFromEnv()
	if err == nil && runtimeContext != nil {
		if strings.TrimSpace(runtimeContext.AccountID) != "" {
			resolvedAccount = fallbackAccount(runtimeContext.AccountID)
		}
		if runtimeContext.Credential != nil {
			fields = runtimeContext.Credential.Fields
			apiKey = firstNonBlank(
				fieldValue(fields, "api_key"),
				fieldValue(fields, "apikey"),
				fieldValue(fields, "key"),
				runtimeContext.Credential.Value,
			)
			centerID = firstNonBlank(
				fieldValue(fields, "center_id"),
				fieldValue(fields, "center"),
			)
			baseURL = firstNonBlank(
				fieldValue(fields, "base_url"),
			)
		}
	}

	apiKey = firstNonBlank(
		apiKey,
		strings.TrimSpace(os.Getenv("NEXUS_ZENOTI_API_KEY")),
		strings.TrimSpace(os.Getenv("ZENOTI_API_KEY")),
	)
	centerID = firstNonBlank(
		centerID,
		strings.TrimSpace(os.Getenv("NEXUS_ZENOTI_CENTER_ID")),
		strings.TrimSpace(os.Getenv("ZENOTI_CENTER_ID")),
	)
	baseURL = firstNonBlank(
		baseURL,
		strings.TrimSpace(os.Getenv("NEXUS_ZENOTI_BASE_URL")),
		defaultZenotiBaseURL,
	)

	if strings.TrimSpace(apiKey) == "" {
		return zenotiCredentials{}, errors.New("missing api_key credential field")
	}

	return zenotiCredentials{
		AccountID: resolvedAccount,
		APIKey:    strings.TrimSpace(apiKey),
		CenterID:  strings.TrimSpace(centerID),
		BaseURL:   strings.TrimRight(strings.TrimSpace(baseURL), "/"),
	}, nil
}

func platformCredentialURL() string {
	if v := strings.TrimSpace(os.Getenv("NEXUS_PLATFORM_CREDENTIAL_URL")); v != "" { //nolint:gosec // runtime config
		return v
	}
	return defaultPlatformCredentialURL
}

func metricTimestampMs(isoDay string) int64 {
	parsed, err := time.Parse(dateLayout, strings.TrimSpace(isoDay))
	if err != nil {
		return time.Now().UnixMilli()
	}
	return parsed.Add(12 * time.Hour).UnixMilli()
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
	parsed, err = time.Parse("2006-01-02 15:04:05", trimmed)
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

func truncateDay(value time.Time) time.Time {
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, time.UTC)
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

func mapValue(input any) map[string]any {
	m, _ := input.(map[string]any)
	return m
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

func intValue(input any) (int, bool) {
	switch typed := input.(type) {
	case int:
		return typed, true
	case int64:
		return int(typed), true
	case int32:
		return int(typed), true
	case float64:
		return int(typed), true
	case string:
		value, err := strconv.Atoi(strings.TrimSpace(typed))
		if err != nil {
			return 0, false
		}
		return value, true
	default:
		return 0, false
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

func fieldValue(fields map[string]string, key string) string {
	if fields == nil {
		return ""
	}
	return strings.TrimSpace(fields[key])
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func fallbackAccount(account string) string {
	value := strings.TrimSpace(strings.ToLower(account))
	if value == "" {
		return "default"
	}
	return value
}

func sanitizeToken(raw string) string {
	trimmed := strings.TrimSpace(strings.ToLower(raw))
	if trimmed == "" {
		return "na"
	}
	var b strings.Builder
	for _, ch := range trimmed {
		switch {
		case ch >= 'a' && ch <= 'z':
			b.WriteRune(ch)
		case ch >= '0' && ch <= '9':
			b.WriteRune(ch)
		case ch == '-', ch == '_', ch == '.':
			b.WriteRune(ch)
		default:
			b.WriteByte('-')
		}
	}
	token := strings.Trim(b.String(), "-._")
	if token == "" {
		return "na"
	}
	return token
}
