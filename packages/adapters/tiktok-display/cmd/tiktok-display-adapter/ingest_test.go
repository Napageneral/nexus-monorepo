package main

import (
	"context"
	"strings"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestFetchTikTokDisplayVideosStopsAtFloorDate(t *testing.T) {
	originalFetchPage := fetchTikTokDisplayVideoPage
	t.Cleanup(func() {
		fetchTikTokDisplayVideoPage = originalFetchPage
	})

	pageCalls := 0
	fetchTikTokDisplayVideoPage = func(ctx context.Context, accessToken string, cursor *int64, pageSize int) (*tiktokDisplayVideoPage, error) {
		pageCalls++
		if accessToken != "access-token" {
			t.Fatalf("expected access token access-token, got %q", accessToken)
		}
		if pageSize != tiktokDisplayVideoPageSize {
			t.Fatalf("expected page size %d, got %d", tiktokDisplayVideoPageSize, pageSize)
		}
		if pageCalls == 1 {
			return &tiktokDisplayVideoPage{
				Cursor:  20,
				HasMore: true,
				Videos: []tiktokDisplayVideo{
					{ID: "video_recent", Title: "Recent", CreateTime: time.Date(2026, time.March, 20, 12, 0, 0, 0, time.UTC).Unix()},
					{ID: "video_old", Title: "Old", CreateTime: time.Date(2026, time.March, 1, 12, 0, 0, 0, time.UTC).Unix()},
				},
			}, nil
		}
		t.Fatalf("unexpected extra video/list page fetch")
		return nil, nil
	}

	floor := time.Date(2026, time.March, 10, 0, 0, 0, 0, time.UTC)
	videos, err := fetchTikTokDisplayVideosFromTikTok(context.Background(), "access-token", floor, time.Date(2026, time.March, 30, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("fetchTikTokDisplayVideosFromTikTok returned error: %v", err)
	}
	if pageCalls != 1 {
		t.Fatalf("pageCalls = %d, want 1", pageCalls)
	}
	if len(videos) != 1 {
		t.Fatalf("len(videos) = %d, want 1", len(videos))
	}
	if videos[0].ID != "video_recent" {
		t.Fatalf("videos[0].ID = %q, want video_recent", videos[0].ID)
	}
	if got := videos[0].Raw["id"]; got != "video_recent" {
		t.Fatalf("provider raw id = %#v, want video_recent", got)
	}
}

func TestBackfillEmitsProfileAndVideoSnapshotRecords(t *testing.T) {
	path := writeTikTokDisplayRuntimeContext(t, map[string]any{
		"version":       1,
		"platform":      platformID,
		"connection_id": "display-primary",
		"config":        map[string]any{},
		"credential": map[string]any{
			"value":   "access-token",
			"ref":     "tiktok-display/display-primary",
			"service": platformID,
			"account": "open_123",
			"fields": map[string]string{
				"access_token":     "access-token",
				"open_id":          "open_123",
				"display_name":     "Moon Sleep",
				"profile_web_link": "https://www.tiktok.com/@moonsleep",
			},
		},
	})
	t.Setenv("NEXUS_ADAPTER_CONTEXT_PATH", path)

	originalFetchProfile := fetchTikTokDisplayProfile
	originalFetchVideos := fetchTikTokDisplayVideos
	t.Cleanup(func() {
		fetchTikTokDisplayProfile = originalFetchProfile
		fetchTikTokDisplayVideos = originalFetchVideos
	})

	fetchTikTokDisplayProfile = func(ctx context.Context, accessToken string) (*tiktokDisplayUserInfo, error) {
		return &tiktokDisplayUserInfo{
			OpenID:         "open_123",
			DisplayName:    "Moon Sleep",
			ProfileWebLink: "https://www.tiktok.com/@moonsleep",
			FollowerCount:  321,
			FollowingCount: 45,
			LikesCount:     789,
			VideoCount:     12,
			IsVerified:     true,
		}, nil
	}
	fetchTikTokDisplayVideos = func(ctx context.Context, accessToken string, floor time.Time, ceiling time.Time) ([]tiktokDisplayVideoInfo, error) {
		return []tiktokDisplayVideoInfo{
			{
				ID:               "video_123",
				Title:            "Moon Sleep Clip",
				CreateTime:       time.Date(2026, time.March, 28, 10, 0, 0, 0, time.UTC).Unix(),
				ViewCount:        111,
				LikeCount:        22,
				CommentCount:     3,
				ShareCount:       4,
				VideoDescription: "clip",
			},
		}, nil
	}

	var records []nexadapter.AdapterInboundRecord
	emit := func(record any) {
		inbound, ok := record.(nexadapter.AdapterInboundRecord)
		if !ok {
			t.Fatalf("emit record type = %T, want nexadapter.AdapterInboundRecord", record)
		}
		records = append(records, inbound)
	}

	err := backfill(context.Background(), "display-primary", time.Date(2026, time.March, 1, 0, 0, 0, 0, time.UTC), emit)
	if err != nil {
		t.Fatalf("backfill returned error: %v", err)
	}
	if len(records) != 2 {
		t.Fatalf("len(records) = %d, want 2", len(records))
	}

	profileRecord := records[0]
	if profileRecord.Routing.ContainerID != tiktokDisplayProfileSnapshotFamily {
		t.Fatalf("profile container = %q, want %q", profileRecord.Routing.ContainerID, tiktokDisplayProfileSnapshotFamily)
	}
	if profileRecord.Payload.Metadata["family"] != tiktokDisplayProfileSnapshotFamily {
		t.Fatalf("profile family = %#v, want %q", profileRecord.Payload.Metadata["family"], tiktokDisplayProfileSnapshotFamily)
	}
	if got := profileRecord.Payload.Metadata["provider_ids"].(map[string]any)["open_id"]; got != "open_123" {
		t.Fatalf("profile provider_ids.open_id = %#v, want open_123", got)
	}

	videoRecord := records[1]
	if videoRecord.Routing.ContainerID != tiktokDisplayVideoSnapshotFamily {
		t.Fatalf("video container = %q, want %q", videoRecord.Routing.ContainerID, tiktokDisplayVideoSnapshotFamily)
	}
	if !strings.Contains(videoRecord.Payload.ExternalRecordID, "video_snapshot") {
		t.Fatalf("video external record id = %q, want it to contain video_snapshot", videoRecord.Payload.ExternalRecordID)
	}
	row, ok := videoRecord.Payload.Metadata["row"].(map[string]any)
	if !ok {
		t.Fatalf("video row metadata missing: %#v", videoRecord.Payload.Metadata["row"])
	}
	if row["id"] != "video_123" {
		t.Fatalf("video row id = %#v, want video_123", row["id"])
	}
	providerRow, ok := videoRecord.Payload.Metadata["provider_row"].(map[string]any)
	if !ok {
		t.Fatalf("video provider_row missing: %#v", videoRecord.Payload.Metadata["provider_row"])
	}
	if providerRow["id"] != "video_123" {
		t.Fatalf("video provider_row.id = %#v, want video_123", providerRow["id"])
	}
}

func TestMonitorUsesRecentReplayWindow(t *testing.T) {
	path := writeTikTokDisplayRuntimeContext(t, map[string]any{
		"version":       1,
		"platform":      platformID,
		"connection_id": "display-primary",
		"config":        map[string]any{},
		"credential": map[string]any{
			"value":   "access-token",
			"ref":     "tiktok-display/display-primary",
			"service": platformID,
			"account": "open_123",
			"fields": map[string]string{
				"access_token": "access-token",
				"open_id":      "open_123",
			},
		},
	})
	t.Setenv("NEXUS_ADAPTER_CONTEXT_PATH", path)

	originalFetchProfile := fetchTikTokDisplayProfile
	originalFetchVideos := fetchTikTokDisplayVideos
	t.Cleanup(func() {
		fetchTikTokDisplayProfile = originalFetchProfile
		fetchTikTokDisplayVideos = originalFetchVideos
	})

	fetchTikTokDisplayProfile = func(ctx context.Context, accessToken string) (*tiktokDisplayUserInfo, error) {
		return &tiktokDisplayUserInfo{OpenID: "open_123", DisplayName: "Moon Sleep"}, nil
	}

	var capturedFloor time.Time
	var capturedCeiling time.Time
	fetchTikTokDisplayVideos = func(ctx context.Context, accessToken string, floor time.Time, ceiling time.Time) ([]tiktokDisplayVideoInfo, error) {
		capturedFloor = floor
		capturedCeiling = ceiling
		return nil, nil
	}

	startedAt := time.Now().UTC()
	err := monitor(context.Background(), "display-primary", func(record any) {})
	finishedAt := time.Now().UTC()
	if err != nil {
		t.Fatalf("monitor returned error: %v", err)
	}
	if capturedFloor.IsZero() || capturedCeiling.IsZero() {
		t.Fatalf("expected monitor to call fetchTikTokDisplayVideos with floor and ceiling")
	}

	expectedMinFloor := startedAt.Add(-tiktokDisplayMonitorReplayWindow).Add(-2 * time.Second)
	expectedMaxFloor := finishedAt.Add(-tiktokDisplayMonitorReplayWindow).Add(2 * time.Second)
	if capturedFloor.Before(expectedMinFloor) || capturedFloor.After(expectedMaxFloor) {
		t.Fatalf("capturedFloor = %s, want between %s and %s", capturedFloor, expectedMinFloor, expectedMaxFloor)
	}
	if capturedCeiling.Before(startedAt.Add(-2*time.Second)) || capturedCeiling.After(finishedAt.Add(2*time.Second)) {
		t.Fatalf("capturedCeiling = %s, want near now between %s and %s", capturedCeiling, startedAt.Add(-2*time.Second), finishedAt.Add(2*time.Second))
	}
}

func TestProfileSnapshotRevisionHashIgnoresVolatileURLs(t *testing.T) {
	state := &tiktokDisplayRuntime{
		ConnectionID:   "display-primary",
		OpenID:         "open_123",
		DisplayName:    "Moon Sleep",
		ProfileWebLink: "https://www.tiktok.com/@moonsleep",
	}

	first := buildTikTokDisplayProfileSnapshotRecord(state, &tiktokDisplayUserInfo{
		OpenID:          "open_123",
		DisplayName:     "Moon Sleep",
		ProfileWebLink:  "https://www.tiktok.com/@moonsleep",
		ProfileDeepLink: "https://vm.tiktok.com/ZTk2first/",
		AvatarURL:       "https://cdn.example.com/avatar.jpeg?x-expires=1&x-signature=aaa",
		FollowerCount:   321,
		FollowingCount:  45,
		LikesCount:      789,
		VideoCount:      12,
	})
	second := buildTikTokDisplayProfileSnapshotRecord(state, &tiktokDisplayUserInfo{
		OpenID:          "open_123",
		DisplayName:     "Moon Sleep",
		ProfileWebLink:  "https://www.tiktok.com/@moonsleep",
		ProfileDeepLink: "https://vm.tiktok.com/ZTk2second/",
		AvatarURL:       "https://cdn.example.com/avatar.jpeg?x-expires=2&x-signature=bbb",
		FollowerCount:   321,
		FollowingCount:  45,
		LikesCount:      789,
		VideoCount:      12,
	})

	if first.Payload.ExternalRecordID != second.Payload.ExternalRecordID {
		t.Fatalf("profile revision should ignore volatile URLs: %q != %q", first.Payload.ExternalRecordID, second.Payload.ExternalRecordID)
	}
	if first.Payload.Metadata["revision_hash"] != second.Payload.Metadata["revision_hash"] {
		t.Fatalf("profile revision hash should ignore volatile URLs: %#v != %#v", first.Payload.Metadata["revision_hash"], second.Payload.Metadata["revision_hash"])
	}
}

func TestVideoSnapshotRevisionHashIgnoresVolatileURLs(t *testing.T) {
	state := &tiktokDisplayRuntime{
		ConnectionID: "display-primary",
		OpenID:       "open_123",
		DisplayName:  "Moon Sleep",
	}
	profile := &tiktokDisplayUserInfo{
		OpenID:      "open_123",
		DisplayName: "Moon Sleep",
	}

	first := buildTikTokDisplayVideoSnapshotRecord(state, profile, tiktokDisplayVideo{
		ID:               "video_123",
		Title:            "Moon Sleep Clip",
		CreateTime:       time.Date(2026, time.March, 28, 10, 0, 0, 0, time.UTC).Unix(),
		ViewCount:        111,
		LikeCount:        22,
		CommentCount:     3,
		ShareCount:       4,
		VideoDescription: "clip",
		CoverImageURL:    "https://cdn.example.com/cover.jpeg?x-expires=1&x-signature=aaa",
		EmbedHTML:        "<blockquote data-video-id=\"video_123\">first</blockquote>",
		EmbedLink:        "https://www.tiktok.com/player/v1/video_123?variant=one",
		ShareURL:         "https://www.tiktok.com/@moonsleep/video/video_123?utm_source=first",
	})
	second := buildTikTokDisplayVideoSnapshotRecord(state, profile, tiktokDisplayVideo{
		ID:               "video_123",
		Title:            "Moon Sleep Clip",
		CreateTime:       time.Date(2026, time.March, 28, 10, 0, 0, 0, time.UTC).Unix(),
		ViewCount:        111,
		LikeCount:        22,
		CommentCount:     3,
		ShareCount:       4,
		VideoDescription: "clip",
		CoverImageURL:    "https://cdn.example.com/cover.jpeg?x-expires=2&x-signature=bbb",
		EmbedHTML:        "<blockquote data-video-id=\"video_123\">second</blockquote>",
		EmbedLink:        "https://www.tiktok.com/player/v1/video_123?variant=two",
		ShareURL:         "https://www.tiktok.com/@moonsleep/video/video_123?utm_source=second",
	})

	if first.Payload.ExternalRecordID != second.Payload.ExternalRecordID {
		t.Fatalf("video revision should ignore volatile URLs: %q != %q", first.Payload.ExternalRecordID, second.Payload.ExternalRecordID)
	}
	if first.Payload.Metadata["revision_hash"] != second.Payload.Metadata["revision_hash"] {
		t.Fatalf("video revision hash should ignore volatile URLs: %#v != %#v", first.Payload.Metadata["revision_hash"], second.Payload.Metadata["revision_hash"])
	}
}

func TestVideoSnapshotRevisionHashChangesWhenMetricsChange(t *testing.T) {
	state := &tiktokDisplayRuntime{
		ConnectionID: "display-primary",
		OpenID:       "open_123",
		DisplayName:  "Moon Sleep",
	}
	profile := &tiktokDisplayUserInfo{
		OpenID:      "open_123",
		DisplayName: "Moon Sleep",
	}

	first := buildTikTokDisplayVideoSnapshotRecord(state, profile, tiktokDisplayVideo{
		ID:               "video_123",
		Title:            "Moon Sleep Clip",
		CreateTime:       time.Date(2026, time.March, 28, 10, 0, 0, 0, time.UTC).Unix(),
		ViewCount:        111,
		LikeCount:        22,
		CommentCount:     3,
		ShareCount:       4,
		VideoDescription: "clip",
	})
	second := buildTikTokDisplayVideoSnapshotRecord(state, profile, tiktokDisplayVideo{
		ID:               "video_123",
		Title:            "Moon Sleep Clip",
		CreateTime:       time.Date(2026, time.March, 28, 10, 0, 0, 0, time.UTC).Unix(),
		ViewCount:        222,
		LikeCount:        22,
		CommentCount:     3,
		ShareCount:       4,
		VideoDescription: "clip",
	})

	if first.Payload.ExternalRecordID == second.Payload.ExternalRecordID {
		t.Fatalf("video revision should change when stable metrics change: %q", first.Payload.ExternalRecordID)
	}
	if first.Payload.Metadata["revision_hash"] == second.Payload.Metadata["revision_hash"] {
		t.Fatalf("video revision hash should change when stable metrics change: %#v", first.Payload.Metadata["revision_hash"])
	}
}
