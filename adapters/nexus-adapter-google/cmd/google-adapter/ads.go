package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	adsPlatformID = "google-ads"
	adsDateLayout = "2006-01-02"
)

// --- Ads API response types ---

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

// --- Ads health check ---

func adsHealth(ctx context.Context, account string) (bool, map[string]any) {
	resolved, err := resolveAccount(ctx, account, "ads")
	if err != nil {
		return false, map[string]any{"error": err.Error()}
	}

	out, err := runGogJSON(ctx, resolved, "ads", "accounts")
	if err != nil {
		return false, map[string]any{"error": err.Error()}
	}

	var resp adsAccountsResponse
	if err := json.Unmarshal(out, &resp); err != nil {
		return false, map[string]any{"error": fmt.Sprintf("parse ads accounts: %v", err)}
	}
	if len(resp.Accounts) == 0 {
		return false, map[string]any{"error": "no accessible Google Ads accounts"}
	}

	return true, map[string]any{"ads_accounts": len(resp.Accounts)}
}

// --- Ads data fetching ---

func fetchAdsMetricsSince(ctx context.Context, account string, since time.Time) ([]nexadapter.NexusEvent, time.Time, error) {
	resolved, err := resolveAccount(ctx, account, "ads")
	if err != nil {
		return nil, time.Time{}, err
	}

	from := since.UTC().Format(adsDateLayout)
	to := time.Now().UTC().Format(adsDateLayout)
	out, err := runGogJSON(ctx, resolved, "ads", "metrics",
		"--from", from, "--to", to, "--level", "campaign")
	if err != nil {
		return nil, time.Time{}, err
	}

	var resp adsMetricsResponse
	if err := json.Unmarshal(out, &resp); err != nil {
		return nil, time.Time{}, fmt.Errorf("parse gog ads metrics response: %w", err)
	}

	var events []nexadapter.NexusEvent
	for _, row := range resp.Metrics {
		events = append(events, buildAdsMetricEvents(resolved, row)...)
	}

	return events, time.Now(), nil
}

func buildAdsMetricEvents(account string, row adsMetricRow) []nexadapter.NexusEvent {
	date := strings.TrimSpace(row.Date)
	if date == "" {
		date = time.Now().UTC().Format(adsDateLayout)
	}

	account, err := nexadapter.RequireAccount(account)
	if err != nil {
		nexadapter.LogError("ads metric events: %v", err)
		return nil
	}

	timestamp := nexadapter.MetricTimestamp(date, nil)
	baseID := strings.Join([]string{
		adsPlatformID,
		nexadapter.SafeIDToken(account),
		nexadapter.SafeIDToken(date),
		nexadapter.SafeIDToken(row.CampaignID),
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
			NewEvent(adsPlatformID, fmt.Sprintf("%s:%s", baseID, nexadapter.SafeIDToken(metric.Name))).
			WithTimestampUnixMs(timestamp).
			WithContent(fmt.Sprintf("%s=%g", metric.Name, metric.Value)).
			WithContentType("text").
			WithSender(adsPlatformID, "Google Ads").
			WithContainer("metrics", "channel").
			WithAccount(account).
			WithMetadata("adapter_id", adsPlatformID).
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
