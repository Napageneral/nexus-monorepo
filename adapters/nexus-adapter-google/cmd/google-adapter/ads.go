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

func fetchAdsMetricsSince(ctx context.Context, account string, since time.Time) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
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

	var records []nexadapter.AdapterInboundRecord
	for _, row := range resp.Metrics {
		records = append(records, buildAdsMetricRecords(resolved, row)...)
	}

	return records, time.Now(), nil
}

func buildAdsMetricRecords(connectionID string, row adsMetricRow) []nexadapter.AdapterInboundRecord {
	date := strings.TrimSpace(row.Date)
	if date == "" {
		date = time.Now().UTC().Format(adsDateLayout)
	}

	connectionID, err := nexadapter.RequireConnection(connectionID)
	if err != nil {
		nexadapter.LogError("ads metric records: %v", err)
		return nil
	}

	timestamp := nexadapter.MetricTimestamp(date, nil)
	baseID := strings.Join([]string{
		adsPlatformID,
		nexadapter.SafeIDToken(connectionID),
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

	records := make([]nexadapter.AdapterInboundRecord, 0, len(values))
	for _, metric := range values {
		if metric.Value < 0 {
			continue
		}
		record := nexadapter.AdapterInboundRecord{
			Operation: "record.ingest",
			Routing: nexadapter.AdapterInboundRouting{
				Adapter:       adapterName,
				Platform:      adsPlatformID,
				ConnectionID:  connectionID,
				SenderID:      adsPlatformID,
				SenderName:    "Google Ads",
				ContainerKind: "group",
				ContainerID:   "metrics",
				ContainerName: "Metrics",
				ThreadID:      row.CampaignID,
				ThreadName:    row.CampaignName,
			},
			Payload: nexadapter.AdapterInboundPayload{
				ExternalRecordID: fmt.Sprintf("%s:%s", baseID, nexadapter.SafeIDToken(metric.Name)),
				Timestamp:        timestamp,
				Content:          fmt.Sprintf("%s=%g", metric.Name, metric.Value),
				ContentType:      "text",
				Metadata: map[string]any{
					"connection_id": connectionID,
					"adapter_id":    adsPlatformID,
					"metric_name":   metric.Name,
					"metric_value":  metric.Value,
					"date":          date,
					"campaign_id":   row.CampaignID,
					"campaign_name": row.CampaignName,
					"ad_group_id":   row.AdGroupID,
					"ad_group_name": row.AdGroupName,
					"ad_id":         row.AdID,
					"ad_name":       row.AdName,
				},
			},
		}
		records = append(records, record)
	}

	return records
}
