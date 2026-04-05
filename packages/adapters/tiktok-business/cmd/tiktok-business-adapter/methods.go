package main

import (
	"errors"
	"fmt"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	tiktokBusinessCampaignsListMethodName        = "tiktok-business.campaigns.list"
	tiktokBusinessAdGroupsListMethodName         = "tiktok-business.adgroups.list"
	tiktokBusinessAdsListMethodName              = "tiktok-business.ads.list"
	tiktokBusinessCampaignDailyListMethodName    = "tiktok-business.reports.campaign_daily.list"
	tiktokBusinessAdGroupDailyListMethodName     = "tiktok-business.reports.adgroup_daily.list"
	tiktokBusinessAdDailyListMethodName          = "tiktok-business.reports.ad_daily.list"
	tiktokBusinessAdvertiserHourlyListMethodName  = "tiktok-business.reports.advertiser_hourly.list"
)

func tiktokBusinessMethodCatalog() *nexadapter.AdapterMethodCatalog {
	return &nexadapter.AdapterMethodCatalog{
		Source:    "openapi",
		Document:  "api/openapi.yaml",
		Namespace: platformID,
	}
}

func tiktokBusinessProjection() *nexadapter.AdapterProjection {
	return &nexadapter.AdapterProjection{
		Platform: platformID,
		Families: []nexadapter.AdapterProjectionFamily{
			{Name: "campaign_snapshot", Description: "Canonical TikTok Business campaign snapshot rows."},
			{Name: "adgroup_snapshot", Description: "Canonical TikTok Business ad group snapshot rows."},
			{Name: "ad_snapshot", Description: "Canonical TikTok Business ad snapshot rows."},
			{Name: "campaign_daily", Description: "Canonical TikTok Business campaign daily report rows."},
			{Name: "adgroup_daily", Description: "Canonical TikTok Business ad group daily report rows."},
			{Name: "ad_daily", Description: "Canonical TikTok Business ad daily report rows."},
			{Name: "advertiser_hourly", Description: "Canonical TikTok Business advertiser hourly report rows."},
		},
		Backfill: &nexadapter.AdapterProjectionSync{
			Supported: true,
			Strategy:  "poll",
			Cursor:    "request_window",
		},
		Monitor: &nexadapter.AdapterProjectionSync{
			Supported: true,
			Strategy:  "poll",
			Cursor:    "request_window",
		},
		Routing: &nexadapter.AdapterProjectionRouting{
			Space:            "advertiser",
			Container:        "family",
			Thread:           "provider_row",
			ThreadsSupported: true,
		},
		RecordIDs: &nexadapter.AdapterProjectionRecordIDs{
			Record:    "tiktok-business:<connection_id>:<family>:<logical_row>:<revision>",
			Container: "tiktok-business:<connection_id>:<family>",
			Thread:    "tiktok-business:<connection_id>:<provider_row>",
		},
		Normalization: &nexadapter.AdapterProjectionNormalize{
			Content:     "provider_native_tiktok_business_rows",
			Attachments: false,
		},
	}
}

func declaredTikTokBusinessMethods() map[string]nexadapter.DeclaredMethod[struct{}] {
	connectionRequired := true
	mutatesRemote := false

	return map[string]nexadapter.DeclaredMethod[struct{}]{
		tiktokBusinessCampaignsListMethodName: nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
			Description: "List TikTok Business campaign rows visible to the bound advertiser.",
			Action:      "read",
			Params:      tiktokBusinessEmptyMethodParamsSchema(),
			Response:    tiktokBusinessResourceListResponseSchema("campaigns"),
			ConnectionRequired: &connectionRequired,
			MutatesRemote:      &mutatesRemote,
			Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
				return tiktokBusinessCampaignsListMethod(ctx, req)
			},
		}),
		tiktokBusinessAdGroupsListMethodName: nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
			Description: "List TikTok Business ad group rows visible to the bound advertiser.",
			Action:      "read",
			Params:      tiktokBusinessEmptyMethodParamsSchema(),
			Response:    tiktokBusinessResourceListResponseSchema("adgroups"),
			ConnectionRequired: &connectionRequired,
			MutatesRemote:      &mutatesRemote,
			Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
				return tiktokBusinessAdGroupsListMethod(ctx, req)
			},
		}),
		tiktokBusinessAdsListMethodName: nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
			Description: "List TikTok Business ad rows visible to the bound advertiser.",
			Action:      "read",
			Params:      tiktokBusinessEmptyMethodParamsSchema(),
			Response:    tiktokBusinessResourceListResponseSchema("ads"),
			ConnectionRequired: &connectionRequired,
			MutatesRemote:      &mutatesRemote,
			Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
				return tiktokBusinessAdsListMethod(ctx, req)
			},
		}),
		tiktokBusinessCampaignDailyListMethodName: nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
			Description: "Read TikTok Business campaign daily report rows for an explicit date range.",
			Action:      "read",
			Params:      tiktokBusinessReportMethodParamsSchema(),
			Response:    tiktokBusinessReportListResponseSchema(),
			ConnectionRequired: &connectionRequired,
			MutatesRemote:      &mutatesRemote,
			Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
				return tiktokBusinessCampaignDailyListMethod(ctx, req)
			},
		}),
		tiktokBusinessAdGroupDailyListMethodName: nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
			Description: "Read TikTok Business ad group daily report rows for an explicit date range.",
			Action:      "read",
			Params:      tiktokBusinessReportMethodParamsSchema(),
			Response:    tiktokBusinessReportListResponseSchema(),
			ConnectionRequired: &connectionRequired,
			MutatesRemote:      &mutatesRemote,
			Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
				return tiktokBusinessAdGroupDailyListMethod(ctx, req)
			},
		}),
		tiktokBusinessAdDailyListMethodName: nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
			Description: "Read TikTok Business ad daily report rows for an explicit date range.",
			Action:      "read",
			Params:      tiktokBusinessReportMethodParamsSchema(),
			Response:    tiktokBusinessReportListResponseSchema(),
			ConnectionRequired: &connectionRequired,
			MutatesRemote:      &mutatesRemote,
			Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
				return tiktokBusinessAdDailyListMethod(ctx, req)
			},
		}),
		tiktokBusinessAdvertiserHourlyListMethodName: nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
			Description: "Read TikTok Business advertiser hourly report rows for an explicit date range.",
			Action:      "read",
			Params:      tiktokBusinessReportMethodParamsSchema(),
			Response:    tiktokBusinessReportListResponseSchema(),
			ConnectionRequired: &connectionRequired,
			MutatesRemote:      &mutatesRemote,
			Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
				return tiktokBusinessAdvertiserHourlyListMethod(ctx, req)
			},
		}),
	}
}

func tiktokBusinessEmptyMethodParamsSchema() map[string]any {
	return map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"properties": map[string]any{
			"connection_id": map[string]any{"type": "string"},
			"payload": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"properties":           map[string]any{},
			},
		},
		"required": []string{"connection_id"},
	}
}

func tiktokBusinessReportMethodParamsSchema() map[string]any {
	return map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"properties": map[string]any{
			"connection_id": map[string]any{"type": "string"},
			"payload": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"properties": map[string]any{
					"since": map[string]any{"type": "string"},
					"until": map[string]any{"type": "string"},
				},
				"required": []string{"since", "until"},
			},
		},
		"required": []string{"connection_id", "payload"},
	}
}

func tiktokBusinessResourceListResponseSchema(resourceName string) map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"advertiser_id": map[string]any{"type": "string"},
			resourceName: map[string]any{
				"type": "array",
				"items": map[string]any{
					"type":                 "object",
					"additionalProperties": true,
				},
			},
			"count": map[string]any{"type": "integer"},
		},
		"required": []string{resourceName, "count"},
	}
}

func tiktokBusinessReportListResponseSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"advertiser_id": map[string]any{"type": "string"},
			"family":        map[string]any{"type": "string"},
			"since":         map[string]any{"type": "string"},
			"until":         map[string]any{"type": "string"},
			"rows": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type":                 "object",
					"additionalProperties": true,
				},
			},
			"count": map[string]any{"type": "integer"},
		},
		"required": []string{"family", "since", "until", "rows", "count"},
	}
}

func tiktokBusinessCampaignsListMethod(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
	state, err := loadTikTokBusinessState(ctx)
	if err != nil {
		return nil, err
	}

	rows, err := fetchTikTokBusinessCampaignRows(ctx.Context, state)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"advertiser_id": state.BoundAdvertiserID,
		"campaigns":     rows,
		"count":         len(rows),
	}, nil
}

func tiktokBusinessAdGroupsListMethod(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
	state, err := loadTikTokBusinessState(ctx)
	if err != nil {
		return nil, err
	}

	rows, err := fetchTikTokBusinessAdGroupRows(ctx.Context, state)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"advertiser_id": state.BoundAdvertiserID,
		"adgroups":      rows,
		"count":         len(rows),
	}, nil
}

func tiktokBusinessAdsListMethod(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
	state, err := loadTikTokBusinessState(ctx)
	if err != nil {
		return nil, err
	}

	rows, err := fetchTikTokBusinessAdRows(ctx.Context, state)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"advertiser_id": state.BoundAdvertiserID,
		"ads":           rows,
		"count":         len(rows),
	}, nil
}

func tiktokBusinessCampaignDailyListMethod(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
	return tiktokBusinessReportListMethod(ctx, req, "campaign_daily")
}

func tiktokBusinessAdGroupDailyListMethod(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
	return tiktokBusinessReportListMethod(ctx, req, "adgroup_daily")
}

func tiktokBusinessAdDailyListMethod(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
	return tiktokBusinessReportListMethod(ctx, req, "ad_daily")
}

func tiktokBusinessAdvertiserHourlyListMethod(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
	return tiktokBusinessReportListMethod(ctx, req, "advertiser_hourly")
}

func tiktokBusinessReportListMethod(
	ctx nexadapter.AdapterContext[struct{}],
	req nexadapter.AdapterMethodRequest,
	familyID string,
) (any, error) {
	state, err := loadTikTokBusinessState(ctx)
	if err != nil {
		return nil, err
	}

	family, ok := tiktokBusinessReportFamilyByID(familyID)
	if !ok {
		return nil, fmt.Errorf("unknown TikTok Business report family %q", familyID)
	}

	since, until, err := resolveTikTokBusinessReadRange(req.Payload)
	if err != nil {
		return nil, err
	}

	rows := make([]tiktokBusinessReportRow, 0)
	for _, window := range planTikTokBusinessReportWindows(since, until, family) {
		windowRows, err := fetchTikTokBusinessReportRows(ctx.Context, state, family, window)
		if err != nil {
			return nil, err
		}
		rows = append(rows, windowRows...)
	}

	return map[string]any{
		"advertiser_id": state.BoundAdvertiserID,
		"family":        family.ID,
		"since":         since.Format(tiktokBusinessDateLayout),
		"until":         until.Format(tiktokBusinessDateLayout),
		"rows":          rows,
		"count":         len(rows),
	}, nil
}

func tiktokBusinessReportFamilyByID(familyID string) (tiktokBusinessReportFamily, bool) {
	for _, family := range tiktokBusinessReportFamilies {
		if family.ID == familyID {
			return family, true
		}
	}
	return tiktokBusinessReportFamily{}, false
}

func resolveTikTokBusinessReadRange(payload map[string]any) (time.Time, time.Time, error) {
	if payload == nil {
		return time.Time{}, time.Time{}, errors.New("missing TikTok Business payload")
	}

	sinceRaw, ok := payload["since"].(string)
	if !ok {
		return time.Time{}, time.Time{}, errors.New("payload.since is required")
	}
	untilRaw, ok := payload["until"].(string)
	if !ok {
		return time.Time{}, time.Time{}, errors.New("payload.until is required")
	}

	since, err := parseTikTokBusinessReadDate(sinceRaw)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	until, err := parseTikTokBusinessReadDate(untilRaw)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	if until.Before(since) {
		return time.Time{}, time.Time{}, fmt.Errorf("payload.until must be on or after payload.since")
	}
	return since, until, nil
}

func parseTikTokBusinessReadDate(value string) (time.Time, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return time.Time{}, errors.New("date is required")
	}

	layouts := []string{
		time.RFC3339,
		time.RFC3339Nano,
		tiktokBusinessDateLayout,
	}
	for _, layout := range layouts {
		if parsed, err := time.ParseInLocation(layout, trimmed, time.UTC); err == nil {
			return dateFloorUTC(parsed), nil
		}
	}
	return time.Time{}, fmt.Errorf("invalid date %q", value)
}
