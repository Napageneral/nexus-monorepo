package main

import (
	"context"
	"encoding/base64"
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
	adapterName    = "twilio-adapter"
	adapterVersion = "0.1.0"
	platformID     = "twilio"
	dateLayout     = "2006-01-02"
	maxPages       = 100
)

type twilioCredentials struct {
	AccountID  string
	AccountSID string
	AuthToken  string
	BaseURL    string
}

type twilioCall struct {
	SID          string `json:"sid"`
	Status       string `json:"status"`
	Direction    string `json:"direction"`
	Duration     string `json:"duration"`
	Price        string `json:"price"`
	DateCreated  string `json:"date_created"`
	DateUpdated  string `json:"date_updated"`
	StartTime    string `json:"start_time"`
	EndTime      string `json:"end_time"`
	From         string `json:"from"`
	To           string `json:"to"`
	PriceUnit    string `json:"price_unit"`
	AccountSID   string `json:"account_sid"`
	AnsweredBy   string `json:"answered_by"`
	CallerName   string `json:"caller_name"`
	ForwardedFrom string `json:"forwarded_from"`
}

type twilioCallsResponse struct {
	Calls          []twilioCall `json:"calls"`
	NextPageURI    string       `json:"next_page_uri"`
	Page           int          `json:"page"`
	PageSize       int          `json:"page_size"`
	FirstPageURI   string       `json:"first_page_uri"`
	PreviousPageURI string      `json:"previous_page_uri"`
	URI            string       `json:"uri"`
}

type twilioMetrics struct {
	CallsTotal       float64
	CallsInbound     float64
	CallsOutbound    float64
	CallsCompleted   float64
	CallsFailed      float64
	CallsDurationSum float64
	CallsDurationCnt float64
	CallsCostSum     float64
}

func main() {
	nexadapter.Run(nexadapter.Adapter{
		Operations: nexadapter.AdapterOperations{
			AdapterInfo:         info,
			AdapterHealth:       health,
			AdapterAccountsList: accounts,
			EventBackfill:       backfill,
			AdapterMonitorStart: monitor,
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
			nexadapter.OpAdapterMonitorStart,
		},
		CredentialService: "twilio",
		MultiAccount:      false,
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					Type:  "api_key",
					Label: "Enter Twilio Credentials",
					Icon:  "key",
					Fields: []nexadapter.AdapterAuthField{
						{
							Name:        "account_sid",
							Label:       "Account SID",
							Type:        "text",
							Required:    true,
							Placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
						},
						{
							Name:        "auth_token",
							Label:       "Auth Token",
							Type:        "secret",
							Required:    true,
							Placeholder: "your auth token",
						},
					},
				},
				{
					Type:        "file_upload",
					Label:       "Upload CSV Export",
					Icon:        "upload",
					Accept:      []string{".csv"},
					TemplateURL: "/templates/twilio-import.csv",
				},
			},
			SetupGuide: "Enter your Twilio Account SID and Auth Token from the Twilio Console.",
		},
		PlatformCapabilities: nexadapter.ChannelCapabilities{
			TextLimit:             1600,
			SupportsMarkdown:      false,
			MarkdownFlavor:        "",
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
			CredentialRef: "twilio/default",
			Status:        "ready",
		},
	}, nil
}

func health(ctx context.Context, account string) (*nexadapter.AdapterHealth, error) {
	account, err := nexadapter.RequireAccount(account)
	if err != nil {
		return nil, err
	}

	creds, err := resolveTwilioCredentials(account)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   account,
			Error:     err.Error(),
		}, nil
	}

	params := url.Values{}
	params.Set("PageSize", "1")

	var testResponse twilioCallsResponse
	endpoint := fmt.Sprintf("/2010-04-01/Accounts/%s/Calls.json", creds.AccountSID)
	if err := twilioGetJSON(ctx, creds, endpoint, params, &testResponse); err != nil {
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
			"account_sid": nexadapter.SafeIDToken(creds.AccountSID),
			"base_url":    creds.BaseURL,
		},
	}, nil
}

func backfill(ctx context.Context, account string, since time.Time, emit nexadapter.EmitFunc) error {
	account, err := nexadapter.RequireAccount(account)
	if err != nil {
		return err
	}

	events, _, err := fetchTwilioMetricsSince(ctx, account, since)
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
		Interval: 1 * time.Hour,
		Fetch: func(ctx context.Context, since time.Time) ([]nexadapter.NexusEvent, time.Time, error) {
			return fetchTwilioMetricsSince(ctx, account, since)
		},
		MaxConsecutiveErrors: 5,
	})(ctx, account, emit)
}

func fetchTwilioMetricsSince(ctx context.Context, account string, since time.Time) ([]nexadapter.NexusEvent, time.Time, error) {
	creds, err := resolveTwilioCredentials(account)
	if err != nil {
		return nil, time.Time{}, err
	}

	from := since.UTC()
	to := time.Now().UTC()

	// Fetch all calls in the date range
	calls, err := fetchAllCalls(ctx, creds, from, to)
	if err != nil {
		return nil, time.Time{}, err
	}

	// Aggregate metrics by date
	metricsByDate := aggregateTwilioCallsByDate(calls)

	// Build events for each date and metric
	var events []nexadapter.NexusEvent
	for date, metrics := range metricsByDate {
		events = append(events, buildTwilioMetricEvents(creds.AccountID, date, metrics)...)
	}

	return events, time.Now(), nil
}

func fetchAllCalls(ctx context.Context, creds twilioCredentials, from time.Time, to time.Time) ([]twilioCall, error) {
	endpoint := fmt.Sprintf("/2010-04-01/Accounts/%s/Calls.json", creds.AccountSID)
	params := url.Values{}
	params.Set("StartTime>=", from.Format(dateLayout))
	params.Set("EndTime<=", to.Format(dateLayout))
	params.Set("PageSize", "1000")

	var allCalls []twilioCall
	nextPageURI := ""
	pagesRead := 0

	for {
		if pagesRead >= maxPages {
			break
		}

		var response twilioCallsResponse
		var err error

		if nextPageURI != "" {
			// Use the full next_page_uri URL provided by Twilio
			fullURL := creds.BaseURL + nextPageURI
			err = twilioGetJSONFullURL(ctx, creds, fullURL, &response)
		} else {
			// First request with params
			err = twilioGetJSON(ctx, creds, endpoint, params, &response)
		}

		if err != nil {
			return nil, err
		}

		allCalls = append(allCalls, response.Calls...)
		pagesRead++

		nextPageURI = strings.TrimSpace(response.NextPageURI)
		if nextPageURI == "" {
			break
		}
	}

	return allCalls, nil
}

func aggregateTwilioCallsByDate(calls []twilioCall) map[string]twilioMetrics {
	metricsByDate := make(map[string]twilioMetrics)

	for _, call := range calls {
		// Parse the date from start_time or date_created
		dateStr := extractDate(call.StartTime)
		if dateStr == "" {
			dateStr = extractDate(call.DateCreated)
		}
		if dateStr == "" {
			continue
		}

		metrics := metricsByDate[dateStr]

		// Total calls
		metrics.CallsTotal++

		// Direction
		direction := strings.ToLower(strings.TrimSpace(call.Direction))
		if strings.Contains(direction, "inbound") {
			metrics.CallsInbound++
		} else if strings.Contains(direction, "outbound") {
			metrics.CallsOutbound++
		}

		// Status
		status := strings.ToLower(strings.TrimSpace(call.Status))
		if status == "completed" {
			metrics.CallsCompleted++
		} else if status == "failed" || status == "busy" || status == "no-answer" {
			metrics.CallsFailed++
		}

		// Duration
		duration := parseNumber(call.Duration)
		if duration > 0 {
			metrics.CallsDurationSum += duration
			metrics.CallsDurationCnt++
		}

		// Cost (price is negative in Twilio, so we take absolute value)
		price := parseNumber(call.Price)
		if price != 0 {
			metrics.CallsCostSum += math.Abs(price)
		}

		metricsByDate[dateStr] = metrics
	}

	return metricsByDate
}

func buildTwilioMetricEvents(account string, date string, metrics twilioMetrics) []nexadapter.NexusEvent {
	timestamp := nexadapter.MetricTimestamp(date, nil)

	type metricValue struct {
		name  string
		value float64
	}

	metricsList := []metricValue{
		{name: "calls_total", value: metrics.CallsTotal},
		{name: "calls_inbound", value: metrics.CallsInbound},
		{name: "calls_outbound", value: metrics.CallsOutbound},
		{name: "calls_completed", value: metrics.CallsCompleted},
		{name: "calls_failed", value: metrics.CallsFailed},
		{name: "calls_cost_total", value: metrics.CallsCostSum},
	}

	// Calculate average duration
	if metrics.CallsDurationCnt > 0 {
		avgDuration := metrics.CallsDurationSum / metrics.CallsDurationCnt
		metricsList = append(metricsList, metricValue{name: "calls_duration_avg", value: avgDuration})
	}

	var events []nexadapter.NexusEvent
	for _, metric := range metricsList {
		if metric.value < 0 {
			continue
		}

		eventID := fmt.Sprintf("%s:%s:%s:%s", platformID, nexadapter.SafeIDToken(account), nexadapter.SafeIDToken(date), nexadapter.SafeIDToken(metric.name))

		event := nexadapter.
			NewEvent(platformID, eventID).
			WithTimestampUnixMs(timestamp).
			WithContent(fmt.Sprintf("%s=%g", metric.name, metric.value)).
			WithContentType("text").
			WithSender(platformID, "Twilio").
			WithContainer("metrics", "channel").
			WithAccount(account).
			WithMetadata("adapter_id", platformID).
			WithMetadata("date", date).
			WithMetadata("metric_name", metric.name).
			WithMetadata("metric_value", metric.value).
			Build()

		events = append(events, event)
	}

	return events
}

func twilioGetJSON(ctx context.Context, creds twilioCredentials, endpoint string, params url.Values, out any) error {
	u, err := url.Parse(strings.TrimRight(creds.BaseURL, "/") + endpoint)
	if err != nil {
		return fmt.Errorf("parse twilio url: %w", err)
	}
	if params != nil {
		u.RawQuery = params.Encode()
	}

	return twilioGetJSONFullURL(ctx, creds, u.String(), out)
}

func twilioGetJSONFullURL(ctx context.Context, creds twilioCredentials, fullURL string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		return fmt.Errorf("build twilio request: %w", err)
	}

	// Set Basic Auth
	authStr := creds.AccountSID + ":" + creds.AuthToken
	encodedAuth := base64.StdEncoding.EncodeToString([]byte(authStr))
	req.Header.Set("Authorization", "Basic "+encodedAuth)
	req.Header.Set("Accept", "application/json")

	res, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return fmt.Errorf("twilio request failed: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		payload, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		return fmt.Errorf("twilio request failed (%d): %s", res.StatusCode, strings.TrimSpace(string(payload)))
	}

	if out == nil {
		return nil
	}
	if err := json.NewDecoder(res.Body).Decode(out); err != nil {
		return fmt.Errorf("parse twilio response: %w", err)
	}
	return nil
}

func resolveTwilioCredentials(account string) (twilioCredentials, error) {
	resolvedAccount, err := nexadapter.RequireAccount(account)
	if err != nil {
		return twilioCredentials{}, err
	}

	fields := map[string]string{}
	accountSID := ""
	authToken := ""
	baseURL := ""

	runtimeContext, err := nexadapter.LoadRuntimeContextFromEnv()
	if err == nil && runtimeContext != nil {
		if strings.TrimSpace(runtimeContext.AccountID) != "" {
			resolvedAccount, err = nexadapter.RequireAccount(runtimeContext.AccountID)
			if err != nil {
				return twilioCredentials{}, err
			}
		}
		if runtimeContext.Credential != nil {
			fields = runtimeContext.Credential.Fields
			accountSID = nexadapter.FirstNonBlank(
				nexadapter.FieldValue(fields, "account_sid"),
				nexadapter.FieldValue(fields, "accountSid"),
				nexadapter.FieldValue(fields, "sid"),
				runtimeContext.Credential.Value,
			)
			authToken = nexadapter.FirstNonBlank(
				nexadapter.FieldValue(fields, "auth_token"),
				nexadapter.FieldValue(fields, "authToken"),
				nexadapter.FieldValue(fields, "token"),
			)
			baseURL = nexadapter.FirstNonBlank(
				nexadapter.FieldValue(fields, "base_url"),
				nexadapter.FieldValue(fields, "baseUrl"),
			)
		}
	}

	accountSID = nexadapter.FirstNonBlank(
		accountSID,
		strings.TrimSpace(os.Getenv("NEXUS_TWILIO_ACCOUNT_SID")),
		strings.TrimSpace(os.Getenv("TWILIO_ACCOUNT_SID")),
	)
	authToken = nexadapter.FirstNonBlank(
		authToken,
		strings.TrimSpace(os.Getenv("NEXUS_TWILIO_AUTH_TOKEN")),
		strings.TrimSpace(os.Getenv("TWILIO_AUTH_TOKEN")),
	)
	baseURL = nexadapter.FirstNonBlank(
		baseURL,
		strings.TrimSpace(os.Getenv("NEXUS_TWILIO_BASE_URL")),
		"https://api.twilio.com",
	)

	if strings.TrimSpace(accountSID) == "" {
		return twilioCredentials{}, errors.New("missing account_sid credential field")
	}
	if strings.TrimSpace(authToken) == "" {
		return twilioCredentials{}, errors.New("missing auth_token credential field")
	}

	return twilioCredentials{
		AccountID:  resolvedAccount,
		AccountSID: strings.TrimSpace(accountSID),
		AuthToken:  strings.TrimSpace(authToken),
		BaseURL:    strings.TrimRight(strings.TrimSpace(baseURL), "/"),
	}, nil
}

func parseNumber(raw string) float64 {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return 0
	}
	value, err := strconv.ParseFloat(trimmed, 64)
	if err != nil {
		return 0
	}
	return value
}

// extractDate extracts YYYY-MM-DD from Twilio's RFC1123Z timestamps
// (e.g., "Mon, 15 Jan 2026 10:30:00 +0000")
func extractDate(timestamp string) string {
	timestamp = strings.TrimSpace(timestamp)
	if timestamp == "" {
		return ""
	}

	// Twilio timestamps are in RFC2822 format like "Mon, 15 Jan 2024 10:30:00 +0000"
	// Try parsing common formats
	formats := []string{
		time.RFC1123Z,
		time.RFC1123,
		time.RFC3339,
		"2006-01-02",
	}

	for _, format := range formats {
		if t, err := time.Parse(format, timestamp); err == nil {
			return t.UTC().Format(dateLayout)
		}
	}

	// If all else fails, try to extract YYYY-MM-DD pattern
	if len(timestamp) >= 10 {
		parts := strings.Fields(timestamp)
		for _, part := range parts {
			if len(part) == 10 && part[4] == '-' && part[7] == '-' {
				return part
			}
		}
	}

	return ""
}
