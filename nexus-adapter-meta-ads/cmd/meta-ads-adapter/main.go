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
	adapterName                  = "meta-ads-adapter"
	adapterVersion               = "0.1.0"
	platformID                   = "meta-ads"
	defaultPlatformCredentialURL = "https://hub.glowbot.com/api/platform-credentials"
	defaultGraphBaseURL          = "https://graph.facebook.com/v21.0"
	dateLayout                   = "2006-01-02"
)

type metaCredentials struct {
	AccountID   string
	AccessToken string
	AdAccountID string
	GraphBase   string
}

type metaAccountSummary struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	AccountStatus any    `json:"account_status"`
}

type metaActionMetric struct {
	ActionType string `json:"action_type"`
	Value      string `json:"value"`
}

type metaInsightRow struct {
	DateStart         string             `json:"date_start"`
	CampaignID        string             `json:"campaign_id"`
	CampaignName      string             `json:"campaign_name"`
	Spend             string             `json:"spend"`
	Impressions       string             `json:"impressions"`
	Clicks            string             `json:"clicks"`
	Reach             string             `json:"reach"`
	Actions           []metaActionMetric `json:"actions"`
	CostPerActionType []metaActionMetric `json:"cost_per_action_type"`
}

type metaInsightsResponse struct {
	Data   []metaInsightRow `json:"data"`
	Paging struct {
		Next string `json:"next"`
	} `json:"paging"`
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
		CredentialService: "facebook",
		MultiAccount:      true,
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					Type:                  "oauth2",
					Label:                 "Connect with Facebook",
					Icon:                  "oauth",
					Service:               "facebook",
					Scopes:                []string{"ads_read"},
					PlatformCredentials:   true,
					PlatformCredentialURL: platformCredentialURL(),
				},
				{
					Type:    "api_key",
					Label:   "Enter Access Token",
					Icon:    "key",
					Service: "facebook",
					Fields: []nexadapter.AdapterAuthField{
						{
							Name:        "access_token",
							Label:       "Long-Lived User Access Token",
							Type:        "secret",
							Required:    true,
							Placeholder: "EAAB...",
						},
						{
							Name:        "ad_account_id",
							Label:       "Ad Account ID",
							Type:        "text",
							Required:    true,
							Placeholder: "act_1234567890",
						},
					},
				},
				{
					Type:        "file_upload",
					Label:       "Upload CSV Export",
					Icon:        "upload",
					Accept:      []string{".csv"},
					TemplateURL: "/templates/meta-ads-import.csv",
				},
			},
			SetupGuide: "Fast path uses long-lived access_token + ad_account_id. Full OAuth path requires app review for ads_read.",
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
			CredentialRef: "facebook/default",
			Status:        "ready",
		},
	}, nil
}

func health(ctx context.Context, account string) (*nexadapter.AdapterHealth, error) {
	creds, err := resolveMetaCredentials(account)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   fallbackAccount(account),
			Error:     err.Error(),
		}, nil
	}

	summary, err := fetchAccountSummary(ctx, creds)
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
			"ad_account_id":  creds.AdAccountID,
			"account_name":   summary.Name,
			"account_status": fmt.Sprintf("%v", summary.AccountStatus),
		},
	}, nil
}

func backfill(ctx context.Context, account string, since time.Time, emit nexadapter.EmitFunc) error {
	creds, err := resolveMetaCredentials(account)
	if err != nil {
		return err
	}

	from := since.UTC().Format(dateLayout)
	to := time.Now().UTC().Format(dateLayout)
	requestURL := buildInsightsURL(creds, from, to)

	for strings.TrimSpace(requestURL) != "" {
		page, nextURL, err := fetchInsightsPage(ctx, creds, requestURL)
		if err != nil {
			return err
		}
		for _, row := range page.Data {
			for _, event := range buildMetaMetricEvents(creds.AccountID, row) {
				emit(event)
			}
		}
		requestURL = strings.TrimSpace(nextURL)
	}

	return nil
}

func fetchAccountSummary(ctx context.Context, creds metaCredentials) (metaAccountSummary, error) {
	u, err := url.Parse(strings.TrimRight(creds.GraphBase, "/") + "/" + url.PathEscape(creds.AdAccountID))
	if err != nil {
		return metaAccountSummary{}, err
	}
	q := u.Query()
	q.Set("fields", "id,name,account_status")
	u.RawQuery = q.Encode()

	var response metaAccountSummary
	if err := graphGetJSON(ctx, creds.AccessToken, u.String(), &response); err != nil {
		return metaAccountSummary{}, err
	}
	if strings.TrimSpace(response.ID) == "" {
		return metaAccountSummary{}, errors.New("meta account lookup returned empty id")
	}
	return response, nil
}

func fetchInsightsPage(
	ctx context.Context,
	creds metaCredentials,
	requestURL string,
) (metaInsightsResponse, string, error) {
	var response metaInsightsResponse
	if err := graphGetJSON(ctx, creds.AccessToken, requestURL, &response); err != nil {
		return metaInsightsResponse{}, "", err
	}
	return response, strings.TrimSpace(response.Paging.Next), nil
}

func buildInsightsURL(creds metaCredentials, from string, to string) string {
	u, err := url.Parse(
		strings.TrimRight(creds.GraphBase, "/") + "/" + url.PathEscape(creds.AdAccountID) + "/insights",
	)
	if err != nil {
		return ""
	}

	q := u.Query()
	q.Set("fields", "campaign_id,campaign_name,date_start,spend,impressions,clicks,reach,actions,cost_per_action_type")
	q.Set("level", "campaign")
	q.Set("time_increment", "1")
	q.Set("limit", "200")
	q.Set("time_range", fmt.Sprintf(`{"since":"%s","until":"%s"}`, from, to))
	u.RawQuery = q.Encode()
	return u.String()
}

func graphGetJSON(ctx context.Context, accessToken string, requestURL string, out any) error {
	parsed, err := url.Parse(requestURL)
	if err != nil {
		return fmt.Errorf("parse graph url: %w", err)
	}
	query := parsed.Query()
	if strings.TrimSpace(query.Get("access_token")) == "" {
		query.Set("access_token", accessToken)
	}
	parsed.RawQuery = query.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return fmt.Errorf("build graph request: %w", err)
	}

	res, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return fmt.Errorf("meta graph request failed: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		payload, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		return fmt.Errorf("meta graph request failed (%d): %s", res.StatusCode, strings.TrimSpace(string(payload)))
	}

	if out == nil {
		return nil
	}
	if err := json.NewDecoder(res.Body).Decode(out); err != nil {
		return fmt.Errorf("parse graph response: %w", err)
	}
	return nil
}

func buildMetaMetricEvents(account string, row metaInsightRow) []nexadapter.NexusEvent {
	date := strings.TrimSpace(row.DateStart)
	if date == "" {
		date = time.Now().UTC().Format(dateLayout)
	}

	campaignID := strings.TrimSpace(row.CampaignID)
	campaignName := strings.TrimSpace(row.CampaignName)
	spend := parseNumber(row.Spend)
	impressions := parseNumber(row.Impressions)
	clicks := parseNumber(row.Clicks)
	reach := parseNumber(row.Reach)
	conversions := parseConversions(row.Actions)
	costPerResult := parseCostPerResult(row.CostPerActionType)
	if costPerResult <= 0 && spend > 0 && conversions > 0 {
		costPerResult = spend / conversions
	}

	type metricValue struct {
		name  string
		value float64
	}
	metrics := []metricValue{
		{name: "ad_spend", value: spend},
		{name: "ad_impressions", value: impressions},
		{name: "ad_clicks", value: clicks},
		{name: "ad_conversions", value: conversions},
		{name: "ad_reach", value: reach},
	}
	if costPerResult > 0 {
		metrics = append(metrics, metricValue{name: "ad_cost_per_result", value: costPerResult})
	}

	timestamp := metricTimestampMs(date)
	account = fallbackAccount(account)
	base := strings.Join(
		[]string{platformID, sanitizeToken(account), sanitizeToken(date), sanitizeToken(campaignID)},
		":",
	)

	events := make([]nexadapter.NexusEvent, 0, len(metrics))
	for _, metric := range metrics {
		if metric.value < 0 {
			continue
		}
		event := nexadapter.
			NewEvent(platformID, fmt.Sprintf("%s:%s", base, sanitizeToken(metric.name))).
			WithTimestampUnixMs(timestamp).
			WithContent(fmt.Sprintf("%s=%g", metric.name, metric.value)).
			WithContentType("text").
			WithSender(platformID, "Meta Ads").
			WithContainer("metrics", "channel").
			WithAccount(account).
			WithMetadata("adapter_id", platformID).
			WithMetadata("metric_name", metric.name).
			WithMetadata("metric_value", metric.value).
			WithMetadata("date", date).
			WithMetadata("campaign_id", campaignID).
			WithMetadata("campaign_name", campaignName).
			Build()
		events = append(events, event)
	}

	return events
}

func parseConversions(actions []metaActionMetric) float64 {
	total := 0.0
	for _, action := range actions {
		actionType := strings.ToLower(strings.TrimSpace(action.ActionType))
		if !isConversionAction(actionType) {
			continue
		}
		value := parseNumber(action.Value)
		if value > 0 {
			total += value
		}
	}
	return total
}

func parseCostPerResult(values []metaActionMetric) float64 {
	for _, value := range values {
		actionType := strings.ToLower(strings.TrimSpace(value.ActionType))
		if !isConversionAction(actionType) {
			continue
		}
		parsed := parseNumber(value.Value)
		if parsed > 0 {
			return parsed
		}
	}
	return 0
}

func isConversionAction(actionType string) bool {
	actionType = strings.ToLower(strings.TrimSpace(actionType))
	if actionType == "" {
		return false
	}
	if strings.Contains(actionType, "offsite_conversion") || strings.Contains(actionType, "onsite_conversion") {
		return true
	}
	for _, token := range []string{
		"purchase",
		"lead",
		"contact",
		"complete_registration",
		"submit_application",
		"book",
		"initiate_checkout",
		"add_to_cart",
	} {
		if strings.Contains(actionType, token) {
			return true
		}
	}
	return false
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

func resolveMetaCredentials(account string) (metaCredentials, error) {
	resolvedAccount := fallbackAccount(account)
	fields := map[string]string{}
	accessToken := ""
	adAccountID := ""
	graphBaseURL := ""

	runtimeContext, err := nexadapter.LoadRuntimeContextFromEnv()
	if err == nil && runtimeContext != nil {
		if strings.TrimSpace(runtimeContext.AccountID) != "" {
			resolvedAccount = fallbackAccount(runtimeContext.AccountID)
		}
		if runtimeContext.Credential != nil {
			fields = runtimeContext.Credential.Fields
			accessToken = firstNonBlank(
				fieldValue(fields, "access_token"),
				fieldValue(fields, "token"),
				fieldValue(fields, "pat"),
				runtimeContext.Credential.Value,
			)
			adAccountID = firstNonBlank(
				fieldValue(fields, "ad_account_id"),
				fieldValue(fields, "account_id"),
				fieldValue(fields, "act"),
			)
			graphBaseURL = firstNonBlank(
				fieldValue(fields, "graph_base_url"),
				fieldValue(fields, "base_url"),
			)
		}
	}

	accessToken = firstNonBlank(
		accessToken,
		strings.TrimSpace(os.Getenv("NEXUS_META_ACCESS_TOKEN")),
		strings.TrimSpace(os.Getenv("META_ACCESS_TOKEN")),
	)
	adAccountID = firstNonBlank(
		adAccountID,
		strings.TrimSpace(os.Getenv("NEXUS_META_AD_ACCOUNT_ID")),
		strings.TrimSpace(os.Getenv("META_AD_ACCOUNT_ID")),
	)
	graphBaseURL = firstNonBlank(
		graphBaseURL,
		strings.TrimSpace(os.Getenv("NEXUS_META_GRAPH_BASE_URL")),
		defaultGraphBaseURL,
	)

	if strings.TrimSpace(accessToken) == "" {
		return metaCredentials{}, errors.New("missing access_token credential field")
	}
	if strings.TrimSpace(adAccountID) == "" {
		return metaCredentials{}, errors.New("missing ad_account_id credential field")
	}

	return metaCredentials{
		AccountID:   resolvedAccount,
		AccessToken: strings.TrimSpace(accessToken),
		AdAccountID: normalizeAdAccountID(adAccountID),
		GraphBase:   strings.TrimRight(strings.TrimSpace(graphBaseURL), "/"),
	}, nil
}

func normalizeAdAccountID(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(trimmed), "act_") {
		return "act_" + strings.TrimPrefix(strings.TrimPrefix(trimmed, "act_"), "ACT_")
	}
	return "act_" + trimmed
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
