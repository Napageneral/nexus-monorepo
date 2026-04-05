package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"reflect"
	"strconv"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	tiktokBusinessDateLayout           = "2006-01-02"
	tiktokBusinessDateTimeLayout       = "2006-01-02 15:04:05"
	tiktokBusinessDailyReplayWindow    = 30 * 24 * time.Hour
	tiktokBusinessHourlyReplayWindow   = 24 * time.Hour
	tiktokBusinessMonitorInterval      = 1 * time.Minute
	tiktokBusinessMonitorErrorBackoff  = 5 * time.Minute
	tiktokBusinessMonitorReplayWindow  = 7 * 24 * time.Hour
	tiktokBusinessDefaultPageSize      = "100"
	tiktokBusinessDefaultReportType    = "BASIC"
	tiktokBusinessDefaultReportSource  = "tiktok_business_api"
	tiktokBusinessDefaultContentType   = "application/json"
	tiktokBusinessDefaultSenderName    = "TikTok Business"
	tiktokBusinessDefaultContainerKind = "group"
)

type tiktokBusinessSnapshotFamily struct {
	ID            string
	ContainerName string
}

type tiktokBusinessReportFamily struct {
	ID            string
	ContainerName string
	DataLevel     string
	Dimensions    []string
	Metrics       []string
	WindowDays    int
}

type tiktokBusinessCampaignRow struct {
	AdvertiserID    string         `json:"advertiser_id"`
	CampaignID      string         `json:"campaign_id"`
	CampaignName    string         `json:"campaign_name"`
	CampaignStatus  string         `json:"campaign_status"`
	Objective       string         `json:"objective"`
	BudgetMode      string         `json:"budget_mode"`
	Budget          string         `json:"budget"`
	OperationStatus string         `json:"operation_status"`
	BuyingType      string         `json:"buying_type"`
	OptimizeGoal    string         `json:"optimize_goal"`
	StartDate       string         `json:"start_date"`
	EndDate         string         `json:"end_date"`
	CreateTime      string         `json:"create_time"`
	ModifyTime      string         `json:"modify_time"`
	Raw             map[string]any `json:"-"`
}

type tiktokBusinessAdGroupRow struct {
	AdvertiserID  string         `json:"advertiser_id"`
	CampaignID    string         `json:"campaign_id"`
	CampaignName  string         `json:"campaign_name"`
	AdgroupID     string         `json:"adgroup_id"`
	AdgroupName   string         `json:"adgroup_name"`
	AdgroupStatus string         `json:"adgroup_status"`
	Objective     string         `json:"objective"`
	BudgetMode    string         `json:"budget_mode"`
	Budget        string         `json:"budget"`
	BidType       string         `json:"bid_type"`
	OptimizeGoal  string         `json:"optimize_goal"`
	StartTime     string         `json:"start_time"`
	EndTime       string         `json:"end_time"`
	CreateTime    string         `json:"create_time"`
	ModifyTime    string         `json:"modify_time"`
	Raw           map[string]any `json:"-"`
}

type tiktokBusinessAdRow struct {
	AdvertiserID    string         `json:"advertiser_id"`
	CampaignID      string         `json:"campaign_id"`
	CampaignName    string         `json:"campaign_name"`
	AdgroupID       string         `json:"adgroup_id"`
	AdgroupName     string         `json:"adgroup_name"`
	AdID            string         `json:"ad_id"`
	AdName          string         `json:"ad_name"`
	AdStatus        string         `json:"ad_status"`
	OperationStatus string         `json:"operation_status"`
	CreativeID      string         `json:"creative_id"`
	LandingPageURL  string         `json:"landing_page_url"`
	CreateTime      string         `json:"create_time"`
	ModifyTime      string         `json:"modify_time"`
	Raw             map[string]any `json:"-"`
}

type tiktokBusinessReportRow struct {
	Dimensions map[string]any `json:"dimensions"`
	Metrics    map[string]any `json:"metrics"`
	Raw        map[string]any `json:"-"`
}

type tiktokBusinessAPIResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    struct {
		List     []map[string]any `json:"list"`
		PageInfo struct {
			Page      int `json:"page"`
			PageSize  int `json:"page_size"`
			TotalPage int `json:"total_page"`
		} `json:"page_info"`
	} `json:"data"`
}

type tiktokBusinessReportWindow struct {
	Family       tiktokBusinessReportFamily
	StartDate    time.Time
	EndDate      time.Time
	RequestFrom  string
	RequestUntil string
}

var (
	tiktokBusinessSnapshotFamilies = []tiktokBusinessSnapshotFamily{
		{ID: "campaign_snapshot", ContainerName: "Campaign Snapshots"},
		{ID: "adgroup_snapshot", ContainerName: "Ad Group Snapshots"},
		{ID: "ad_snapshot", ContainerName: "Ad Snapshots"},
	}
	tiktokBusinessReportFamilies = []tiktokBusinessReportFamily{
		{
			ID:            "campaign_daily",
			ContainerName: "Campaign Daily",
			DataLevel:     "AUCTION_CAMPAIGN",
			Dimensions:    []string{"stat_time_day", "campaign_id"},
			Metrics:       []string{"spend", "impressions", "clicks", "ctr", "cpc", "cpm", "complete_payment", "complete_payment_roas", "value_per_complete_payment"},
			WindowDays:    30,
		},
		{
			ID:            "adgroup_daily",
			ContainerName: "Ad Group Daily",
			DataLevel:     "AUCTION_ADGROUP",
			Dimensions:    []string{"stat_time_day", "adgroup_id"},
			Metrics:       []string{"spend", "impressions", "clicks", "ctr", "cpc", "cpm", "complete_payment", "complete_payment_roas", "value_per_complete_payment"},
			WindowDays:    30,
		},
		{
			ID:            "ad_daily",
			ContainerName: "Ad Daily",
			DataLevel:     "AUCTION_AD",
			Dimensions:    []string{"stat_time_day", "ad_id"},
			Metrics:       []string{"spend", "impressions", "clicks", "ctr", "cpc", "cpm", "complete_payment", "complete_payment_roas", "value_per_complete_payment"},
			WindowDays:    30,
		},
		{
			ID:            "advertiser_hourly",
			ContainerName: "Advertiser Hourly",
			DataLevel:     "AUCTION_ADVERTISER",
			Dimensions:    []string{"stat_time_hour"},
			Metrics:       []string{"spend", "impressions", "clicks", "ctr", "cpc", "cpm", "complete_payment", "complete_payment_roas", "value_per_complete_payment"},
			WindowDays:    1,
		},
	}
)

func backfill(ctx nexadapter.AdapterContext[struct{}], since time.Time, emit nexadapter.EmitFunc) error {
	state, err := loadTikTokBusinessState(ctx)
	if err != nil {
		return err
	}

	records, err := fetchTikTokBusinessBackfill(ctx.Context, state, since.UTC(), time.Now().UTC())
	if err != nil {
		return err
	}
	for _, record := range records {
		emit(record)
	}
	return nil
}

func monitor(ctx nexadapter.AdapterContext[struct{}], emit nexadapter.EmitFunc) error {
	state, err := loadTikTokBusinessState(ctx)
	if err != nil {
		return err
	}

	return nexadapter.PollMonitor(nexadapter.PollConfig[nexadapter.AdapterInboundRecord]{
		Interval:      tiktokBusinessMonitorInterval,
		ErrorBackoff:  tiktokBusinessMonitorErrorBackoff,
		InitialCursor: time.Now().UTC(),
		Fetch: func(ctx context.Context, since time.Time) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
			return fetchTikTokBusinessMonitorCycle(ctx, state, since)
		},
		MaxConsecutiveErrors: 5,
	})(ctx.Context, state.ConnectionID, emit)
}

func fetchTikTokBusinessMonitorCycle(ctx context.Context, state *tiktokBusinessState, since time.Time) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
	asOf := time.Now().UTC()
	replaySince := since.Add(-tiktokBusinessMonitorReplayWindow)
	records, err := fetchTikTokBusinessBackfill(ctx, state, replaySince, asOf)
	if err != nil {
		return nil, time.Time{}, err
	}
	return records, asOf, nil
}

func fetchTikTokBusinessBackfill(ctx context.Context, state *tiktokBusinessState, since time.Time, until time.Time) ([]nexadapter.AdapterInboundRecord, error) {
	since = since.UTC()
	until = until.UTC()
	if since.IsZero() || since.After(until) {
		since = until
	}

	var records []nexadapter.AdapterInboundRecord

	for _, family := range tiktokBusinessSnapshotFamilies {
		switch family.ID {
		case "campaign_snapshot":
			rows, err := fetchTikTokBusinessCampaignRows(ctx, state)
			if err != nil {
				return nil, err
			}
			for _, row := range rows {
				record := buildTikTokBusinessCampaignSnapshotRecord(state, family, row)
				if record.Operation != "" {
					records = append(records, record)
				}
			}
		case "adgroup_snapshot":
			rows, err := fetchTikTokBusinessAdGroupRows(ctx, state)
			if err != nil {
				return nil, err
			}
			for _, row := range rows {
				record := buildTikTokBusinessAdGroupSnapshotRecord(state, family, row)
				if record.Operation != "" {
					records = append(records, record)
				}
			}
		case "ad_snapshot":
			rows, err := fetchTikTokBusinessAdRows(ctx, state)
			if err != nil {
				return nil, err
			}
			for _, row := range rows {
				record := buildTikTokBusinessAdSnapshotRecord(state, family, row)
				if record.Operation != "" {
					records = append(records, record)
				}
			}
		}
	}

	for _, family := range tiktokBusinessReportFamilies {
		windows := planTikTokBusinessReportWindows(since, until, family)
		for _, window := range windows {
			rows, err := fetchTikTokBusinessReportRows(ctx, state, family, window)
			if err != nil {
				return nil, err
			}
			for _, row := range rows {
				record := buildTikTokBusinessReportRecord(state, family, row, window)
				if record.Operation != "" {
					records = append(records, record)
				}
			}
		}
	}

	return records, nil
}

func fetchTikTokBusinessCampaignRows(ctx context.Context, state *tiktokBusinessState) ([]tiktokBusinessCampaignRow, error) {
	rows, err := fetchTikTokBusinessList(ctx, state.AccessToken, "campaign/get", url.Values{
		"advertiser_id": {state.BoundAdvertiserID},
		"page_size":     {tiktokBusinessDefaultPageSize},
	})
	if err != nil {
		return nil, err
	}
	decoded := make([]tiktokBusinessCampaignRow, 0, len(rows))
	for _, row := range rows {
		decodedRow, err := decodeTikTokBusinessRow[tiktokBusinessCampaignRow](row)
		if err != nil {
			return nil, err
		}
		decodedRow.Raw = row
		decoded = append(decoded, decodedRow)
	}
	return decoded, nil
}

func fetchTikTokBusinessAdGroupRows(ctx context.Context, state *tiktokBusinessState) ([]tiktokBusinessAdGroupRow, error) {
	rows, err := fetchTikTokBusinessList(ctx, state.AccessToken, "adgroup/get", url.Values{
		"advertiser_id": {state.BoundAdvertiserID},
		"page_size":     {tiktokBusinessDefaultPageSize},
	})
	if err != nil {
		return nil, err
	}
	decoded := make([]tiktokBusinessAdGroupRow, 0, len(rows))
	for _, row := range rows {
		decodedRow, err := decodeTikTokBusinessRow[tiktokBusinessAdGroupRow](row)
		if err != nil {
			return nil, err
		}
		decodedRow.Raw = row
		decoded = append(decoded, decodedRow)
	}
	return decoded, nil
}

func fetchTikTokBusinessAdRows(ctx context.Context, state *tiktokBusinessState) ([]tiktokBusinessAdRow, error) {
	rows, err := fetchTikTokBusinessList(ctx, state.AccessToken, "ad/get", url.Values{
		"advertiser_id": {state.BoundAdvertiserID},
		"page_size":     {tiktokBusinessDefaultPageSize},
	})
	if err != nil {
		return nil, err
	}
	decoded := make([]tiktokBusinessAdRow, 0, len(rows))
	for _, row := range rows {
		decodedRow, err := decodeTikTokBusinessRow[tiktokBusinessAdRow](row)
		if err != nil {
			return nil, err
		}
		decodedRow.Raw = row
		decoded = append(decoded, decodedRow)
	}
	return decoded, nil
}

func fetchTikTokBusinessReportRows(ctx context.Context, state *tiktokBusinessState, family tiktokBusinessReportFamily, window tiktokBusinessReportWindow) ([]tiktokBusinessReportRow, error) {
	params := url.Values{}
	params.Set("advertiser_id", state.BoundAdvertiserID)
	params.Set("report_type", tiktokBusinessDefaultReportType)
	params.Set("data_level", family.DataLevel)
	params.Set("dimensions", mustJSONString(family.Dimensions))
	params.Set("metrics", mustJSONString(family.Metrics))
	params.Set("start_date", window.RequestFrom)
	params.Set("end_date", window.RequestUntil)
	params.Set("page_size", tiktokBusinessDefaultPageSize)

	rows, err := fetchTikTokBusinessList(ctx, state.AccessToken, "report/integrated/get", params)
	if err != nil {
		return nil, err
	}
	decoded := make([]tiktokBusinessReportRow, 0, len(rows))
	for _, row := range rows {
		decodedRow, err := decodeTikTokBusinessRow[tiktokBusinessReportRow](row)
		if err != nil {
			return nil, err
		}
		decodedRow.Raw = row
		decoded = append(decoded, decodedRow)
	}
	return decoded, nil
}

func fetchTikTokBusinessList(ctx context.Context, accessToken string, path string, params url.Values) ([]map[string]any, error) {
	page := 1
	totalPages := 1
	var rows []map[string]any

	for page <= totalPages {
		pageParams := cloneURLValues(params)
		pageParams.Set("page", strconv.Itoa(page))
		if pageParams.Get("page_size") == "" {
			pageParams.Set("page_size", tiktokBusinessDefaultPageSize)
		}
		endpoint := buildTikTokBusinessEndpoint(path, pageParams)

		var payload tiktokBusinessAPIResponse
		if err := tiktokBusinessDoJSON(ctx, accessToken, endpoint, &payload); err != nil {
			return nil, err
		}
		rows = append(rows, payload.Data.List...)
		totalPages = payload.Data.PageInfo.TotalPage
		if totalPages < 1 {
			totalPages = 1
		}
		page++
	}

	return rows, nil
}

func buildTikTokBusinessCampaignSnapshotRecord(state *tiktokBusinessState, family tiktokBusinessSnapshotFamily, row tiktokBusinessCampaignRow) nexadapter.AdapterInboundRecord {
	normalizedRow := normalizedTikTokBusinessCampaignRow(row)
	return buildTikTokBusinessRecord(state, family, normalizedRow, row.Raw, campaignSnapshotTimestamp(row.CreateTime, row.ModifyTime), fmt.Sprintf("campaign_snapshot campaign=%s status=%s objective=%s", nonBlank(row.CampaignID, "campaign"), nonBlank(row.CampaignStatus, "unknown"), nonBlank(row.Objective, "unknown")), map[string]any{
		"provider_ids": map[string]any{
			"advertiser_id": row.AdvertiserID,
			"campaign_id":   row.CampaignID,
		},
		"raw_row": row.Raw,
	})
}

func buildTikTokBusinessAdGroupSnapshotRecord(state *tiktokBusinessState, family tiktokBusinessSnapshotFamily, row tiktokBusinessAdGroupRow) nexadapter.AdapterInboundRecord {
	normalizedRow := normalizedTikTokBusinessAdGroupRow(row)
	return buildTikTokBusinessRecord(state, family, normalizedRow, row.Raw, campaignSnapshotTimestamp(row.CreateTime, row.ModifyTime), fmt.Sprintf("adgroup_snapshot adgroup=%s status=%s", nonBlank(row.AdgroupID, "adgroup"), nonBlank(row.AdgroupStatus, "unknown")), map[string]any{
		"provider_ids": map[string]any{
			"advertiser_id": row.AdvertiserID,
			"campaign_id":   row.CampaignID,
			"adgroup_id":    row.AdgroupID,
		},
		"raw_row": row.Raw,
	})
}

func buildTikTokBusinessAdSnapshotRecord(state *tiktokBusinessState, family tiktokBusinessSnapshotFamily, row tiktokBusinessAdRow) nexadapter.AdapterInboundRecord {
	normalizedRow := normalizedTikTokBusinessAdRow(row)
	return buildTikTokBusinessRecord(state, family, normalizedRow, row.Raw, campaignSnapshotTimestamp(row.CreateTime, row.ModifyTime), fmt.Sprintf("ad_snapshot ad=%s status=%s", nonBlank(row.AdID, "ad"), nonBlank(row.AdStatus, "unknown")), map[string]any{
		"provider_ids": map[string]any{
			"advertiser_id": row.AdvertiserID,
			"campaign_id":   row.CampaignID,
			"adgroup_id":    row.AdgroupID,
			"ad_id":         row.AdID,
		},
		"raw_row": row.Raw,
	})
}

func buildTikTokBusinessReportRecord(state *tiktokBusinessState, family tiktokBusinessReportFamily, row tiktokBusinessReportRow, window tiktokBusinessReportWindow) nexadapter.AdapterInboundRecord {
	normalizedRow := normalizedTikTokBusinessReportRow(row)
	derived := derivedTikTokBusinessReportMeasures(row)
	timestamp := reportTimestamp(row, family)
	providerIDs := reportProviderIDs(row)
	providerIDs["advertiser_id"] = state.BoundAdvertiserID

	content := fmt.Sprintf("%s %s spend=%s clicks=%s purchases=%g",
		family.ID,
		reportRowLabel(row, family),
		valueString(row.Metrics, "spend"),
		valueString(row.Metrics, "clicks"),
		derived["purchases"],
	)

	return buildTikTokBusinessRecord(state, tiktokBusinessSnapshotFamily{ID: family.ID, ContainerName: family.ContainerName}, normalizedRow, row.Raw, timestamp, content, map[string]any{
		"provider_ids":  providerIDs,
		"derived":       derived,
		"row_type":      family.ID,
		"report_level":  family.DataLevel,
		"window_start":  window.RequestFrom,
		"window_end":    window.RequestUntil,
		"window_days":   family.WindowDays,
		"dimensions":    family.Dimensions,
		"metrics":       family.Metrics,
		"raw_row":       row.Raw,
		"source_system": tiktokBusinessDefaultReportSource,
	})
}

func buildTikTokBusinessRecord(state *tiktokBusinessState, family tiktokBusinessSnapshotFamily, normalizedRow map[string]any, rawRow map[string]any, timestamp int64, content string, extraMetadata map[string]any) nexadapter.AdapterInboundRecord {
	connectionID, err := nexadapter.RequireConnection(state.ConnectionID)
	if err != nil {
		nexadapter.LogError("tiktok business record build: %v", err)
		return nexadapter.AdapterInboundRecord{}
	}

	logicalRowID, threadID, threadName := tiktokBusinessRowIdentity(state, family.ID, normalizedRow)
	revisionPayload := map[string]any{
		"normalized_row": normalizedRow,
		"raw_row":        rawRow,
	}
	revisionHash := tiktokBusinessRevisionHash(revisionPayload)

	metadata := map[string]any{
		"connection_id":  connectionID,
		"adapter_id":     platformID,
		"family":         family.ID,
		"logical_row_id": logicalRowID,
		"revision_hash":  revisionHash,
		"row":            normalizedRow,
		"provider_row":   rawRow,
	}
	for key, value := range extraMetadata {
		metadata[key] = value
	}

	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Adapter:       adapterName,
			Platform:      platformID,
			ConnectionID:  connectionID,
			SenderID:      state.BoundAdvertiserID,
			SenderName:    tiktokBusinessDefaultSenderName,
			ReceiverID:    connectionID,
			SpaceID:       state.BoundAdvertiserID,
			ContainerKind: tiktokBusinessDefaultContainerKind,
			ContainerID:   family.ID,
			ContainerName: family.ContainerName,
			ThreadID:      threadID,
			ThreadName:    threadName,
			Metadata: map[string]any{
				"family":        family.ID,
				"grain":         tiktokBusinessFamilyGrain(family.ID),
				"advertiser_id": state.BoundAdvertiserID,
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf(
				"%s:%s:%s:%s:%s",
				platformID,
				nexadapter.SafeIDToken(connectionID),
				family.ID,
				logicalRowID,
				revisionHash,
			),
			Timestamp:   timestamp,
			Content:     content,
			ContentType: "text",
			Metadata:    metadata,
		},
	}
}

func tiktokBusinessRowIdentity(state *tiktokBusinessState, familyID string, normalizedRow map[string]any) (string, string, string) {
	advertiserID := nonBlank(state.BoundAdvertiserID, "advertiser")
	switch familyID {
	case "campaign_snapshot":
		campaignID := nonBlank(stringValue(normalizedRow["campaign_id"]), "campaign")
		return fmt.Sprintf("%s:%s", advertiserID, campaignID), fmt.Sprintf("%s:%s", advertiserID, campaignID), stringValue(normalizedRow["campaign_name"])
	case "adgroup_snapshot":
		adgroupID := nonBlank(stringValue(normalizedRow["adgroup_id"]), "adgroup")
		return fmt.Sprintf("%s:%s", advertiserID, adgroupID), fmt.Sprintf("%s:%s", advertiserID, adgroupID), stringValue(normalizedRow["adgroup_name"])
	case "ad_snapshot":
		adID := nonBlank(stringValue(normalizedRow["ad_id"]), "ad")
		return fmt.Sprintf("%s:%s", advertiserID, adID), fmt.Sprintf("%s:%s", advertiserID, adID), stringValue(normalizedRow["ad_name"])
	case "campaign_daily":
		campaignID := nonBlank(stringValue(normalizedRow["campaign_id"]), "campaign")
		date := nonBlank(stringValue(normalizedRow["stat_time_day"]), dateLayout())
		logicalID := fmt.Sprintf("%s:%s:%s", advertiserID, date, campaignID)
		return logicalID, fmt.Sprintf("%s:%s", advertiserID, campaignID), stringValue(normalizedRow["campaign_name"])
	case "adgroup_daily":
		adgroupID := nonBlank(stringValue(normalizedRow["adgroup_id"]), "adgroup")
		date := nonBlank(stringValue(normalizedRow["stat_time_day"]), dateLayout())
		logicalID := fmt.Sprintf("%s:%s:%s", advertiserID, date, adgroupID)
		return logicalID, fmt.Sprintf("%s:%s", advertiserID, adgroupID), stringValue(normalizedRow["adgroup_name"])
	case "ad_daily":
		adID := nonBlank(stringValue(normalizedRow["ad_id"]), "ad")
		date := nonBlank(stringValue(normalizedRow["stat_time_day"]), dateLayout())
		logicalID := fmt.Sprintf("%s:%s:%s", advertiserID, date, adID)
		return logicalID, fmt.Sprintf("%s:%s", advertiserID, adID), stringValue(normalizedRow["ad_name"])
	case "advertiser_hourly":
		hour := nonBlank(stringValue(normalizedRow["stat_time_hour"]), "hour")
		return fmt.Sprintf("%s:%s", advertiserID, hour), fmt.Sprintf("%s:hourly", advertiserID), advertiserID
	default:
		return fmt.Sprintf("%s:%s", advertiserID, familyID), advertiserID, familyID
	}
}

func tiktokBusinessFamilyGrain(familyID string) string {
	switch familyID {
	case "campaign_snapshot":
		return "campaign"
	case "adgroup_snapshot":
		return "adgroup"
	case "ad_snapshot":
		return "ad"
	case "campaign_daily":
		return "date+campaign"
	case "adgroup_daily":
		return "date+adgroup"
	case "ad_daily":
		return "date+ad"
	case "advertiser_hourly":
		return "date+hour"
	default:
		return "unknown"
	}
}

func planTikTokBusinessReportWindows(since time.Time, until time.Time, family tiktokBusinessReportFamily) []tiktokBusinessReportWindow {
	since = since.UTC()
	until = until.UTC()
	if since.IsZero() || since.After(until) {
		return nil
	}

	start := dateFloorUTC(since)
	end := dateFloorUTC(until)
	windowSpan := time.Duration(family.WindowDays) * 24 * time.Hour
	if windowSpan <= 0 {
		windowSpan = tiktokBusinessDailyReplayWindow
	}

	var windows []tiktokBusinessReportWindow
	for cursor := start; !cursor.After(end); cursor = cursor.Add(windowSpan) {
		windowEnd := cursor.Add(windowSpan).Add(-time.Nanosecond)
		if windowEnd.After(until) {
			windowEnd = until
		}
		if windowEnd.Before(cursor) {
			windowEnd = cursor
		}
		windows = append(windows, tiktokBusinessReportWindow{
			Family:       family,
			StartDate:    cursor,
			EndDate:      windowEnd,
			RequestFrom:  cursor.Format(tiktokBusinessDateLayout),
			RequestUntil: windowEnd.Format(tiktokBusinessDateLayout),
		})
	}
	return windows
}

func dateFloorUTC(value time.Time) time.Time {
	value = value.UTC()
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, time.UTC)
}

func tiktokBusinessDoJSON(ctx context.Context, accessToken string, endpoint string, out *tiktokBusinessAPIResponse) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("build TikTok Business request: %w", err)
	}
	req.Header.Set("Access-Token", accessToken)
	req.Header.Set("Content-Type", tiktokBusinessDefaultContentType)

	client := businessHTTPClient
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("TikTok Business request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return fmt.Errorf("read TikTok Business response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("TikTok Business request failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("decode TikTok Business response: %w", err)
	}
	if out.Code != 0 {
		if strings.TrimSpace(out.Message) != "" {
			return errors.New(out.Message)
		}
		return errors.New("TikTok Business API returned a non-zero code")
	}
	return nil
}

func buildTikTokBusinessEndpoint(path string, params url.Values) string {
	u, err := url.Parse(strings.TrimRight(businessAPIBaseURL, "/") + "/" + strings.Trim(path, "/") + "/")
	if err != nil {
		return ""
	}
	q := u.Query()
	for key, values := range params {
		if len(values) == 0 {
			continue
		}
		q.Set(key, values[0])
	}
	u.RawQuery = q.Encode()
	return u.String()
}

func cloneURLValues(values url.Values) url.Values {
	clone := make(url.Values, len(values))
	for key, list := range values {
		if len(list) == 0 {
			continue
		}
		clone[key] = append([]string{}, list...)
	}
	return clone
}

func decodeTikTokBusinessRow[T any](row map[string]any) (T, error) {
	var decoded T

	value := reflect.ValueOf(&decoded).Elem()
	if value.Kind() != reflect.Struct {
		payload, err := json.Marshal(row)
		if err != nil {
			return decoded, err
		}
		if err := json.Unmarshal(payload, &decoded); err != nil {
			return decoded, err
		}
		return decoded, nil
	}

	valueType := value.Type()
	for idx := 0; idx < value.NumField(); idx++ {
		fieldType := valueType.Field(idx)
		fieldValue := value.Field(idx)
		if !fieldValue.CanSet() {
			continue
		}

		tag := fieldType.Tag.Get("json")
		if tag == "" || tag == "-" {
			continue
		}
		key := strings.TrimSpace(strings.Split(tag, ",")[0])
		if key == "" || key == "-" {
			continue
		}
		rawValue, ok := row[key]
		if !ok {
			continue
		}

		switch fieldValue.Kind() {
		case reflect.String:
			fieldValue.SetString(stringValue(rawValue))
		case reflect.Map:
			if rawMap, ok := rawValue.(map[string]any); ok {
				fieldValue.Set(reflect.ValueOf(rawMap))
				continue
			}
			payload, err := json.Marshal(rawValue)
			if err != nil {
				return decoded, err
			}
			target := reflect.New(fieldType.Type)
			if err := json.Unmarshal(payload, target.Interface()); err != nil {
				return decoded, err
			}
			fieldValue.Set(target.Elem())
		default:
			payload, err := json.Marshal(rawValue)
			if err != nil {
				return decoded, err
			}
			target := reflect.New(fieldType.Type)
			if err := json.Unmarshal(payload, target.Interface()); err != nil {
				return decoded, err
			}
			fieldValue.Set(target.Elem())
		}
	}

	return decoded, nil
}

func normalizedTikTokBusinessCampaignRow(row tiktokBusinessCampaignRow) map[string]any {
	normalized := map[string]any{}
	putIfNotBlank(normalized, "advertiser_id", row.AdvertiserID)
	putIfNotBlank(normalized, "campaign_id", row.CampaignID)
	putIfNotBlank(normalized, "campaign_name", row.CampaignName)
	putIfNotBlank(normalized, "campaign_status", row.CampaignStatus)
	putIfNotBlank(normalized, "objective", row.Objective)
	putIfNotBlank(normalized, "budget_mode", row.BudgetMode)
	putIfNotBlank(normalized, "budget", row.Budget)
	putIfNotBlank(normalized, "operation_status", row.OperationStatus)
	putIfNotBlank(normalized, "buying_type", row.BuyingType)
	putIfNotBlank(normalized, "optimize_goal", row.OptimizeGoal)
	putIfNotBlank(normalized, "start_date", row.StartDate)
	putIfNotBlank(normalized, "end_date", row.EndDate)
	putIfNotBlank(normalized, "create_time", row.CreateTime)
	putIfNotBlank(normalized, "modify_time", row.ModifyTime)
	return normalized
}

func normalizedTikTokBusinessAdGroupRow(row tiktokBusinessAdGroupRow) map[string]any {
	normalized := map[string]any{}
	putIfNotBlank(normalized, "advertiser_id", row.AdvertiserID)
	putIfNotBlank(normalized, "campaign_id", row.CampaignID)
	putIfNotBlank(normalized, "campaign_name", row.CampaignName)
	putIfNotBlank(normalized, "adgroup_id", row.AdgroupID)
	putIfNotBlank(normalized, "adgroup_name", row.AdgroupName)
	putIfNotBlank(normalized, "adgroup_status", row.AdgroupStatus)
	putIfNotBlank(normalized, "objective", row.Objective)
	putIfNotBlank(normalized, "budget_mode", row.BudgetMode)
	putIfNotBlank(normalized, "budget", row.Budget)
	putIfNotBlank(normalized, "bid_type", row.BidType)
	putIfNotBlank(normalized, "optimize_goal", row.OptimizeGoal)
	putIfNotBlank(normalized, "start_time", row.StartTime)
	putIfNotBlank(normalized, "end_time", row.EndTime)
	putIfNotBlank(normalized, "create_time", row.CreateTime)
	putIfNotBlank(normalized, "modify_time", row.ModifyTime)
	return normalized
}

func normalizedTikTokBusinessAdRow(row tiktokBusinessAdRow) map[string]any {
	normalized := map[string]any{}
	putIfNotBlank(normalized, "advertiser_id", row.AdvertiserID)
	putIfNotBlank(normalized, "campaign_id", row.CampaignID)
	putIfNotBlank(normalized, "campaign_name", row.CampaignName)
	putIfNotBlank(normalized, "adgroup_id", row.AdgroupID)
	putIfNotBlank(normalized, "adgroup_name", row.AdgroupName)
	putIfNotBlank(normalized, "ad_id", row.AdID)
	putIfNotBlank(normalized, "ad_name", row.AdName)
	putIfNotBlank(normalized, "ad_status", row.AdStatus)
	putIfNotBlank(normalized, "operation_status", row.OperationStatus)
	putIfNotBlank(normalized, "creative_id", row.CreativeID)
	putIfNotBlank(normalized, "landing_page_url", row.LandingPageURL)
	putIfNotBlank(normalized, "create_time", row.CreateTime)
	putIfNotBlank(normalized, "modify_time", row.ModifyTime)
	return normalized
}

func normalizedTikTokBusinessReportRow(row tiktokBusinessReportRow) map[string]any {
	normalized := map[string]any{}
	for key, value := range row.Dimensions {
		normalized[key] = value
	}
	for key, value := range row.Metrics {
		normalized[key] = value
	}
	return normalized
}

func derivedTikTokBusinessReportMeasures(row tiktokBusinessReportRow) map[string]any {
	purchases := valueNumber(row.Metrics, "complete_payment")
	spend := valueNumber(row.Metrics, "spend")
	purchaseValue := valueNumber(row.Metrics, "complete_payment") * valueNumber(row.Metrics, "value_per_complete_payment")
	if purchaseValue == 0 {
		purchaseValue = valueNumber(row.Metrics, "complete_payment_roas") * spend
	}
	costPerPurchase := 0.0
	if purchases > 0 && spend > 0 {
		costPerPurchase = spend / purchases
	}

	return map[string]any{
		"clicks":                     valueNumber(row.Metrics, "clicks"),
		"spend":                      spend,
		"impressions":                valueNumber(row.Metrics, "impressions"),
		"purchases":                  purchases,
		"purchase_value":             purchaseValue,
		"cost_per_purchase":          costPerPurchase,
		"ctr":                        valueNumber(row.Metrics, "ctr"),
		"cpc":                        valueNumber(row.Metrics, "cpc"),
		"cpm":                        valueNumber(row.Metrics, "cpm"),
		"complete_payment_roas":      valueNumber(row.Metrics, "complete_payment_roas"),
		"value_per_complete_payment": valueNumber(row.Metrics, "value_per_complete_payment"),
	}
}

func reportProviderIDs(row tiktokBusinessReportRow) map[string]any {
	ids := map[string]any{}
	for _, key := range []string{"advertiser_id", "campaign_id", "adgroup_id", "ad_id", "stat_time_day", "stat_time_hour"} {
		if value, ok := row.Dimensions[key]; ok {
			ids[key] = value
		}
	}
	return ids
}

func reportRowLabel(row tiktokBusinessReportRow, family tiktokBusinessReportFamily) string {
	switch family.ID {
	case "campaign_daily":
		return nonBlank(stringValue(row.Dimensions["campaign_id"]), "campaign")
	case "adgroup_daily":
		return nonBlank(stringValue(row.Dimensions["adgroup_id"]), "adgroup")
	case "ad_daily":
		return nonBlank(stringValue(row.Dimensions["ad_id"]), "ad")
	default:
		return nonBlank(stringValue(row.Dimensions["stat_time_hour"]), "hour")
	}
}

func reportTimestamp(row tiktokBusinessReportRow, family tiktokBusinessReportFamily) int64 {
	if family.ID == "advertiser_hourly" {
		if ts := parseTikTokBusinessTimestamp(stringValue(row.Dimensions["stat_time_hour"])); ts != 0 {
			return ts
		}
	}
	if ts := parseTikTokBusinessTimestamp(stringValue(row.Dimensions["stat_time_day"])); ts != 0 {
		return ts
	}
	return time.Now().UnixMilli()
}

func parseTikTokBusinessTimestamp(value string) int64 {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	layouts := []string{
		time.RFC3339,
		tiktokBusinessDateTimeLayout,
		"2006-01-02 15:04",
		tiktokBusinessDateLayout,
	}
	for _, layout := range layouts {
		if parsed, err := time.ParseInLocation(layout, value, time.UTC); err == nil {
			if layout == tiktokBusinessDateLayout {
				return nexadapter.MetricTimestamp(parsed.Format(tiktokBusinessDateLayout), time.UTC)
			}
			return parsed.UnixMilli()
		}
	}
	if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return parsed.UnixMilli()
	}
	return 0
}

func campaignSnapshotTimestamp(createTime string, modifyTime string) int64 {
	for _, candidate := range []string{modifyTime, createTime} {
		if ts := parseTikTokBusinessTimestamp(candidate); ts != 0 {
			return ts
		}
	}
	return time.Now().UnixMilli()
}

func tiktokBusinessRevisionHash(value any) string {
	payload, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:8])
}

func mustJSONString(value any) string {
	payload, err := json.Marshal(value)
	if err != nil {
		return "[]"
	}
	return string(payload)
}

func valueString(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	return strings.TrimSpace(stringValue(m[key]))
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(typed)
	case []byte:
		return strings.TrimSpace(string(typed))
	case fmt.Stringer:
		return strings.TrimSpace(typed.String())
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(typed), 'f', -1, 32)
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case json.Number:
		return typed.String()
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

func valueNumber(m map[string]any, key string) float64 {
	if m == nil {
		return 0
	}
	return numberValue(m[key])
}

func numberValue(value any) float64 {
	switch typed := value.(type) {
	case nil:
		return 0
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case json.Number:
		parsed, _ := typed.Float64()
		return parsed
	case string:
		parsed, _ := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		return parsed
	default:
		parsed, _ := strconv.ParseFloat(strings.TrimSpace(fmt.Sprint(typed)), 64)
		return parsed
	}
}

func putIfNotBlank(target map[string]any, key string, value string) {
	if trimmed := strings.TrimSpace(value); trimmed != "" {
		target[key] = trimmed
	}
}

func nonBlank(value string, fallback string) string {
	if trimmed := strings.TrimSpace(value); trimmed != "" {
		return trimmed
	}
	return fallback
}

func dateLayout() string {
	return tiktokBusinessDateLayout
}
