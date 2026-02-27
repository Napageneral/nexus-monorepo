package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	adapterName                  = "gog-ads-adapter"
	adapterVersion               = "0.1.0"
	platformID                   = "google-ads"
	defaultPlatformCredentialURL = "https://hub.glowbot.com/api/platform-credentials"
	adsDateLayout                = "2006-01-02"
)

type gogAuthListResponse struct {
	Accounts []struct {
		Email    string   `json:"email"`
		Services []string `json:"services,omitempty"`
	} `json:"accounts"`
}

type adsAccountsResponse struct {
	Accounts []map[string]any `json:"accounts"`
}

type adsMetricsResponse struct {
	Metrics []adsMetricRow `json:"metrics"`
}

type adsMetricRow struct {
	Date         string  `json:"date"`
	CampaignID   string  `json:"campaign_id"`
	CampaignName string  `json:"campaign_name"`
	AdGroupID    string  `json:"ad_group_id"`
	AdGroupName  string  `json:"ad_group_name"`
	AdID         string  `json:"ad_id"`
	AdName       string  `json:"ad_name"`
	AccountID    string  `json:"account_id"`
	AccountName  string  `json:"account_name"`
	Cost         float64 `json:"cost"`
	CostMicros   int64   `json:"cost_micros"`
	Impressions  int64   `json:"impressions"`
	Clicks       int64   `json:"clicks"`
	Conversions  float64 `json:"conversions"`
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
		CredentialService: "google",
		MultiAccount:      true,
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					Type:                  "oauth2",
					Label:                 "Connect with Google",
					Icon:                  "oauth",
					Service:               "google",
					Scopes:                []string{"https://www.googleapis.com/auth/adwords.readonly"},
					PlatformCredentials:   true,
					PlatformCredentialURL: platformCredentialURL(),
				},
				{
					Type:        "file_upload",
					Label:       "Upload CSV Export",
					Icon:        "upload",
					Accept:      []string{".csv"},
					TemplateURL: "/templates/google-ads-import.csv",
				},
			},
			SetupGuide: "Authorize Google Ads in gog and configure ads.developer-token + ads.customer-id in gog config.",
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

func platformCredentialURL() string {
	if v := strings.TrimSpace(os.Getenv("NEXUS_PLATFORM_CREDENTIAL_URL")); v != "" { //nolint:gosec // config
		return v
	}
	return defaultPlatformCredentialURL
}

func accounts(ctx context.Context) ([]nexadapter.AdapterAccount, error) {
	out, err := runGogJSON(ctx, "", "auth", "list")
	if err != nil {
		return nil, err
	}

	var resp gogAuthListResponse
	if err := json.Unmarshal(out, &resp); err != nil {
		return nil, fmt.Errorf("parse gog auth list: %w", err)
	}

	result := make([]nexadapter.AdapterAccount, 0, len(resp.Accounts))
	for _, account := range resp.Accounts {
		email := strings.ToLower(strings.TrimSpace(account.Email))
		if email == "" {
			continue
		}
		if len(account.Services) > 0 && !containsService(account.Services, "ads") {
			continue
		}
		result = append(result, nexadapter.AdapterAccount{
			ID:            email,
			DisplayName:   email,
			CredentialRef: fmt.Sprintf("google/%s", email),
			Status:        "ready",
		})
	}
	return result, nil
}

func containsService(services []string, target string) bool {
	for _, service := range services {
		if strings.EqualFold(strings.TrimSpace(service), target) {
			return true
		}
	}
	return false
}

func health(ctx context.Context, account string) (*nexadapter.AdapterHealth, error) {
	resolved, err := resolveAccount(ctx, account)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   fallbackAccount(account),
			Error:     err.Error(),
		}, nil
	}

	out, err := runGogJSON(ctx, resolved, "ads", "accounts")
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   resolved,
			Error:     err.Error(),
		}, nil
	}

	var resp adsAccountsResponse
	if err := json.Unmarshal(out, &resp); err != nil {
		return nil, fmt.Errorf("parse gog ads accounts response: %w", err)
	}
	if len(resp.Accounts) == 0 {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   resolved,
			Error:     "no accessible Google Ads accounts",
		}, nil
	}

	return &nexadapter.AdapterHealth{
		Connected:   true,
		Account:     resolved,
		LastEventAt: time.Now().UnixMilli(),
		Details: map[string]any{
			"accounts": len(resp.Accounts),
		},
	}, nil
}

func backfill(ctx context.Context, account string, since time.Time, emit nexadapter.EmitFunc) error {
	resolved, err := resolveAccount(ctx, account)
	if err != nil {
		return err
	}

	from := since.UTC().Format(adsDateLayout)
	to := time.Now().UTC().Format(adsDateLayout)
	out, err := runGogJSON(
		ctx,
		resolved,
		"ads",
		"metrics",
		"--from",
		from,
		"--to",
		to,
		"--level",
		"campaign",
	)
	if err != nil {
		return err
	}

	var resp adsMetricsResponse
	if err := json.Unmarshal(out, &resp); err != nil {
		return fmt.Errorf("parse gog ads metrics response: %w", err)
	}

	for _, row := range resp.Metrics {
		for _, event := range buildAdsMetricEvents(resolved, row) {
			emit(event)
		}
	}

	return nil
}

func buildAdsMetricEvents(account string, row adsMetricRow) []nexadapter.NexusEvent {
	date := strings.TrimSpace(row.Date)
	if date == "" {
		date = time.Now().UTC().Format(adsDateLayout)
	}
	account = fallbackAccount(account)
	timestamp := metricTimestampMs(date)
	baseID := strings.Join([]string{
		platformID,
		sanitizeToken(account),
		sanitizeToken(date),
		sanitizeToken(row.CampaignID),
	}, ":")

	type metricValue struct {
		Name  string
		Value float64
	}
	values := []metricValue{
		{Name: "ad_spend", Value: row.Cost},
		{Name: "ad_impressions", Value: float64(row.Impressions)},
		{Name: "ad_clicks", Value: float64(row.Clicks)},
		{Name: "ad_conversions", Value: row.Conversions},
	}
	if row.Clicks > 0 {
		values = append(values, metricValue{Name: "ad_cost_per_click", Value: row.Cost / float64(row.Clicks)})
	}
	if row.Conversions > 0 {
		values = append(values, metricValue{Name: "ad_cost_per_conversion", Value: row.Cost / row.Conversions})
	}

	events := make([]nexadapter.NexusEvent, 0, len(values))
	for _, metric := range values {
		if metric.Value < 0 {
			continue
		}
		event := nexadapter.
			NewEvent(platformID, fmt.Sprintf("%s:%s", baseID, sanitizeToken(metric.Name))).
			WithTimestampUnixMs(timestamp).
			WithContent(fmt.Sprintf("%s=%g", metric.Name, metric.Value)).
			WithContentType("text").
			WithSender(platformID, "Google Ads").
			WithContainer("metrics", "channel").
			WithAccount(account).
			WithMetadata("adapter_id", platformID).
			WithMetadata("metric_name", metric.Name).
			WithMetadata("metric_value", metric.Value).
			WithMetadata("date", date).
			WithMetadata("campaign_id", row.CampaignID).
			WithMetadata("campaign_name", row.CampaignName).
			WithMetadata("ad_group_id", row.AdGroupID).
			WithMetadata("ad_group_name", row.AdGroupName).
			WithMetadata("ad_id", row.AdID).
			WithMetadata("ad_name", row.AdName).
			Build()
		events = append(events, event)
	}

	return events
}

func metricTimestampMs(isoDay string) int64 {
	parsed, err := time.Parse(adsDateLayout, strings.TrimSpace(isoDay))
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

func gogCommand() string {
	if v := strings.TrimSpace(os.Getenv("NEXUS_GOG_COMMAND")); v != "" { //nolint:gosec // config
		return v
	}
	return "gog"
}

func resolveAccount(ctx context.Context, account string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(account))
	if normalized != "" {
		return normalized, nil
	}
	list, err := accounts(ctx)
	if err != nil {
		return "", err
	}
	if len(list) == 0 {
		return "", errors.New("no gog ads accounts configured; run `gog auth add <email> --services ads`")
	}
	return list[0].ID, nil
}

func fallbackAccount(account string) string {
	value := strings.TrimSpace(strings.ToLower(account))
	if value == "" {
		return "default"
	}
	return value
}

func runGogJSON(ctx context.Context, account string, args ...string) ([]byte, error) {
	base := []string{"--json"}
	if trimmed := strings.TrimSpace(account); trimmed != "" {
		base = append(base, "--account", trimmed)
	}
	full := append(base, args...)

	cmd := exec.CommandContext(ctx, gogCommand(), full...) //nolint:gosec // command is user-configurable
	cmd.Env = os.Environ()

	out, err := cmd.Output()
	if err == nil {
		return out, nil
	}

	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		stderr := strings.TrimSpace(string(exitErr.Stderr))
		if stderr == "" {
			stderr = "no stderr"
		}
		return nil, fmt.Errorf("gog %s failed: %s", strings.Join(args, " "), stderr)
	}
	return nil, err
}
