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

func TestMonitorPollsWithRecentReplayWindowUntilCancelled(t *testing.T) {
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
	t.Setenv(tiktokDisplayAdapterStateDirEnv, t.TempDir())

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
	ctx, cancel := context.WithCancel(context.Background())
	fetchTikTokDisplayVideos = func(ctx context.Context, accessToken string, floor time.Time, ceiling time.Time) ([]tiktokDisplayVideoInfo, error) {
		capturedFloor = floor
		capturedCeiling = ceiling
		cancel()
		return nil, nil
	}

	startedAt := time.Now().UTC()
	err := monitor(ctx, "display-primary", func(record any) {})
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

func TestRunTikTokDisplayMonitorCycleSuppressesQuietRevisions(t *testing.T) {
	originalFetchProfile := fetchTikTokDisplayProfile
	originalFetchVideos := fetchTikTokDisplayVideos
	t.Cleanup(func() {
		fetchTikTokDisplayProfile = originalFetchProfile
		fetchTikTokDisplayVideos = originalFetchVideos
	})

	profile := &tiktokDisplayUserInfo{
		OpenID:         "open_123",
		DisplayName:    "Moon Sleep",
		ProfileWebLink: "https://www.tiktok.com/@moonsleep",
		FollowerCount:  321,
		FollowingCount: 45,
		LikesCount:     789,
		VideoCount:     12,
	}
	videos := []tiktokDisplayVideoInfo{
		{
			ID:               "video_123",
			Title:            "Moon Sleep Clip",
			CreateTime:       time.Date(2026, time.April, 27, 14, 0, 0, 0, time.UTC).Unix(),
			ViewCount:        111,
			LikeCount:        22,
			CommentCount:     3,
			ShareCount:       4,
			VideoDescription: "clip",
		},
	}
	fetchTikTokDisplayProfile = func(ctx context.Context, accessToken string) (*tiktokDisplayUserInfo, error) {
		return profile, nil
	}
	fetchTikTokDisplayVideos = func(ctx context.Context, accessToken string, floor time.Time, ceiling time.Time) ([]tiktokDisplayVideoInfo, error) {
		return videos, nil
	}

	state := &tiktokDisplayRuntime{
		ConnectionID:   "display-primary",
		AccessToken:    "access-token",
		OpenID:         "open_123",
		DisplayName:    "Moon Sleep",
		ProfileWebLink: "https://www.tiktok.com/@moonsleep",
	}
	monitorState := defaultTikTokDisplayMonitorState()
	firstPoll := time.Date(2026, time.April, 27, 15, 0, 0, 0, time.UTC)

	var firstRecords []nexadapter.AdapterInboundRecord
	first := runTikTokDisplayMonitorCycle(context.Background(), state, monitorState, firstPoll, collectTikTokDisplayRecords(&firstRecords))
	if len(first.FailedLanes) != 0 {
		t.Fatalf("first failed lanes = %v", first.FailedLanes)
	}
	if len(firstRecords) != 2 {
		t.Fatalf("first records = %d, want profile + video", len(firstRecords))
	}

	var secondRecords []nexadapter.AdapterInboundRecord
	second := runTikTokDisplayMonitorCycle(context.Background(), state, monitorState, firstPoll.Add(tiktokDisplayDiscoveryPollInterval), collectTikTokDisplayRecords(&secondRecords))
	if len(second.FailedLanes) != 0 {
		t.Fatalf("second failed lanes = %v", second.FailedLanes)
	}
	if len(secondRecords) != 0 {
		t.Fatalf("second records = %d, want quiet-cycle suppression", len(secondRecords))
	}
	profileMetrics := monitorState.metrics(tiktokDisplayMonitorLaneProfile)
	if profileMetrics.LastAttempted != 1 || profileMetrics.LastSuppressed != 1 || profileMetrics.LastEmitted != 0 {
		t.Fatalf("profile quiet metrics = %+v, want one suppressed profile", profileMetrics)
	}
	discoveryMetrics := monitorState.metrics(tiktokDisplayMonitorLaneDiscovery)
	if discoveryMetrics.LastAttempted != 1 || discoveryMetrics.LastSuppressed != 1 || discoveryMetrics.LastEmitted != 0 {
		t.Fatalf("discovery quiet metrics = %+v, want one suppressed video", discoveryMetrics)
	}
}

func TestRunTikTokDisplayMonitorCycleUsesPublishOverlapForDiscovery(t *testing.T) {
	originalFetchProfile := fetchTikTokDisplayProfile
	originalFetchVideos := fetchTikTokDisplayVideos
	t.Cleanup(func() {
		fetchTikTokDisplayProfile = originalFetchProfile
		fetchTikTokDisplayVideos = originalFetchVideos
	})

	fetchTikTokDisplayProfile = func(ctx context.Context, accessToken string) (*tiktokDisplayUserInfo, error) {
		return &tiktokDisplayUserInfo{OpenID: "open_123", DisplayName: "Moon Sleep"}, nil
	}

	publishedAt := time.Date(2026, time.April, 27, 14, 0, 0, 0, time.UTC)
	firstVideos := []tiktokDisplayVideoInfo{
		{ID: "video_123", Title: "Original", CreateTime: publishedAt.Unix(), ViewCount: 111},
	}
	secondVideos := []tiktokDisplayVideoInfo{
		{ID: "video_456", Title: "New", CreateTime: publishedAt.Add(30 * time.Minute).Unix(), ViewCount: 10},
		{ID: "video_123", Title: "Original", CreateTime: publishedAt.Unix(), ViewCount: 111},
	}
	call := 0
	var floors []time.Time
	fetchTikTokDisplayVideos = func(ctx context.Context, accessToken string, floor time.Time, ceiling time.Time) ([]tiktokDisplayVideoInfo, error) {
		call++
		floors = append(floors, floor)
		if call == 1 {
			return firstVideos, nil
		}
		return secondVideos, nil
	}

	state := &tiktokDisplayRuntime{ConnectionID: "display-primary", AccessToken: "access-token", OpenID: "open_123", DisplayName: "Moon Sleep"}
	monitorState := defaultTikTokDisplayMonitorState()
	firstPoll := time.Date(2026, time.April, 27, 15, 0, 0, 0, time.UTC)
	runTikTokDisplayMonitorCycle(context.Background(), state, monitorState, firstPoll, func(record any) {})

	var secondRecords []nexadapter.AdapterInboundRecord
	second := runTikTokDisplayMonitorCycle(context.Background(), state, monitorState, firstPoll.Add(tiktokDisplayDiscoveryPollInterval), collectTikTokDisplayRecords(&secondRecords))
	if len(second.FailedLanes) != 0 {
		t.Fatalf("second failed lanes = %v", second.FailedLanes)
	}
	if len(secondRecords) != 1 {
		t.Fatalf("second records = %d, want only new video", len(secondRecords))
	}
	if got := secondRecords[0].Payload.Metadata["logical_row_id"]; got != "video:video_456" {
		t.Fatalf("emitted logical row = %#v, want new video row", got)
	}
	if len(floors) != 2 {
		t.Fatalf("floors = %d, want two discovery calls", len(floors))
	}
	wantSecondFloor := publishedAt.Add(-tiktokDisplayDiscoveryOverlap)
	if !floors[1].Equal(wantSecondFloor) {
		t.Fatalf("second floor = %s, want publish overlap floor %s", floors[1], wantSecondFloor)
	}
}

func TestTikTokDisplayMonitorStatePersistsAcrossRestart(t *testing.T) {
	t.Setenv(tiktokDisplayAdapterStateDirEnv, t.TempDir())

	originalFetchProfile := fetchTikTokDisplayProfile
	originalFetchVideos := fetchTikTokDisplayVideos
	t.Cleanup(func() {
		fetchTikTokDisplayProfile = originalFetchProfile
		fetchTikTokDisplayVideos = originalFetchVideos
	})

	fetchTikTokDisplayProfile = func(ctx context.Context, accessToken string) (*tiktokDisplayUserInfo, error) {
		return &tiktokDisplayUserInfo{OpenID: "open_123", DisplayName: "Moon Sleep", FollowerCount: 321}, nil
	}
	fetchTikTokDisplayVideos = func(ctx context.Context, accessToken string, floor time.Time, ceiling time.Time) ([]tiktokDisplayVideoInfo, error) {
		return []tiktokDisplayVideoInfo{
			{ID: "video_123", Title: "Original", CreateTime: time.Date(2026, time.April, 27, 14, 0, 0, 0, time.UTC).Unix(), ViewCount: 111},
		}, nil
	}

	state := &tiktokDisplayRuntime{ConnectionID: "display-primary", AccessToken: "access-token", OpenID: "open_123", DisplayName: "Moon Sleep"}
	monitorState := defaultTikTokDisplayMonitorState()
	firstPoll := time.Date(2026, time.April, 27, 15, 0, 0, 0, time.UTC)
	runTikTokDisplayMonitorCycle(context.Background(), state, monitorState, firstPoll, func(record any) {})
	if err := saveTikTokDisplayMonitorState(state.ConnectionID, monitorState); err != nil {
		t.Fatalf("save monitor state: %v", err)
	}

	reloaded, err := loadTikTokDisplayMonitorState(state.ConnectionID)
	if err != nil {
		t.Fatalf("load monitor state: %v", err)
	}
	var records []nexadapter.AdapterInboundRecord
	result := runTikTokDisplayMonitorCycle(context.Background(), state, reloaded, firstPoll.Add(tiktokDisplayDiscoveryPollInterval), collectTikTokDisplayRecords(&records))
	if len(result.FailedLanes) != 0 {
		t.Fatalf("failed lanes = %v", result.FailedLanes)
	}
	if len(records) != 0 {
		t.Fatalf("records after restart = %d, want unchanged suppression from persisted state", len(records))
	}
}

func TestRunTikTokDisplayActiveRefreshEmitsMetricChange(t *testing.T) {
	originalFetchProfile := fetchTikTokDisplayProfile
	originalFetchVideos := fetchTikTokDisplayVideos
	t.Cleanup(func() {
		fetchTikTokDisplayProfile = originalFetchProfile
		fetchTikTokDisplayVideos = originalFetchVideos
	})

	fetchTikTokDisplayProfile = func(ctx context.Context, accessToken string) (*tiktokDisplayUserInfo, error) {
		return &tiktokDisplayUserInfo{OpenID: "open_123", DisplayName: "Moon Sleep"}, nil
	}

	publishedAt := time.Date(2026, time.April, 27, 14, 0, 0, 0, time.UTC)
	state := &tiktokDisplayRuntime{ConnectionID: "display-primary", AccessToken: "access-token", OpenID: "open_123", DisplayName: "Moon Sleep"}
	monitorState := defaultTikTokDisplayMonitorState()
	firstPoll := time.Date(2026, time.April, 27, 15, 0, 0, 0, time.UTC)
	fetchTikTokDisplayVideos = func(ctx context.Context, accessToken string, floor time.Time, ceiling time.Time) ([]tiktokDisplayVideoInfo, error) {
		return []tiktokDisplayVideoInfo{{ID: "video_123", Title: "Original", CreateTime: publishedAt.Unix(), ViewCount: 111}}, nil
	}
	runTikTokDisplayMonitorCycle(context.Background(), state, monitorState, firstPoll, func(record any) {})

	activePoll := firstPoll.Add(tiktokDisplayHotRefreshInterval)
	monitorState.Profile.LastPollAt = activePoll
	monitorState.Discovery.LastPollAt = activePoll
	fetchTikTokDisplayVideos = func(ctx context.Context, accessToken string, floor time.Time, ceiling time.Time) ([]tiktokDisplayVideoInfo, error) {
		return []tiktokDisplayVideoInfo{{ID: "video_123", Title: "Original", CreateTime: publishedAt.Unix(), ViewCount: 222}}, nil
	}

	var records []nexadapter.AdapterInboundRecord
	result := runTikTokDisplayMonitorCycle(context.Background(), state, monitorState, activePoll, collectTikTokDisplayRecords(&records))
	if len(result.FailedLanes) != 0 {
		t.Fatalf("failed lanes = %v", result.FailedLanes)
	}
	if len(records) != 1 {
		t.Fatalf("active refresh records = %d, want changed video revision", len(records))
	}
	if !containsTikTokDisplayLane(result.SuccessfulLanes, tiktokDisplayMonitorLaneActiveRefresh) {
		t.Fatalf("successful lanes = %v, want active refresh", result.SuccessfulLanes)
	}
}

func TestRunTikTokDisplaySlowReconcileEmitsOlderMetricChange(t *testing.T) {
	originalFetchProfile := fetchTikTokDisplayProfile
	originalFetchVideos := fetchTikTokDisplayVideos
	t.Cleanup(func() {
		fetchTikTokDisplayProfile = originalFetchProfile
		fetchTikTokDisplayVideos = originalFetchVideos
	})

	fetchTikTokDisplayProfile = func(ctx context.Context, accessToken string) (*tiktokDisplayUserInfo, error) {
		return &tiktokDisplayUserInfo{OpenID: "open_123", DisplayName: "Moon Sleep"}, nil
	}

	oldPublishedAt := time.Date(2026, time.March, 1, 14, 0, 0, 0, time.UTC)
	state := &tiktokDisplayRuntime{ConnectionID: "display-primary", AccessToken: "access-token", OpenID: "open_123", DisplayName: "Moon Sleep"}
	monitorState := defaultTikTokDisplayMonitorState()
	videoState := monitorState.video("video_old")
	videoState.PublishedAt = oldPublishedAt
	videoState.LastRevisionHash = "old-revision"
	videoState.LastSuccessfulRefreshAt = time.Date(2026, time.April, 27, 15, 0, 0, 0, time.UTC)
	videoState.RefreshTier = tiktokDisplayVideoRefreshTierCold
	pollTime := time.Date(2026, time.April, 27, 15, 0, 0, 0, time.UTC)
	monitorState.Profile.LastPollAt = pollTime
	monitorState.Discovery.LastPollAt = pollTime
	monitorState.Active.LastPollAt = pollTime
	monitorState.Reconcile.LastPollAt = pollTime.Add(-tiktokDisplaySlowReconcileInterval)

	fetchTikTokDisplayVideos = func(ctx context.Context, accessToken string, floor time.Time, ceiling time.Time) ([]tiktokDisplayVideoInfo, error) {
		return []tiktokDisplayVideoInfo{{ID: "video_old", Title: "Old", CreateTime: oldPublishedAt.Unix(), ViewCount: 333}}, nil
	}

	var records []nexadapter.AdapterInboundRecord
	result := runTikTokDisplayMonitorCycle(context.Background(), state, monitorState, pollTime, collectTikTokDisplayRecords(&records))
	if len(result.FailedLanes) != 0 {
		t.Fatalf("failed lanes = %v", result.FailedLanes)
	}
	if !containsTikTokDisplayLane(result.SuccessfulLanes, tiktokDisplayMonitorLaneReconcile) {
		t.Fatalf("successful lanes = %v, want slow reconcile", result.SuccessfulLanes)
	}
	if len(records) != 1 {
		t.Fatalf("reconcile records = %d, want one changed old video", len(records))
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

func collectTikTokDisplayRecords(records *[]nexadapter.AdapterInboundRecord) nexadapter.EmitFunc {
	return func(record any) {
		inbound, ok := record.(nexadapter.AdapterInboundRecord)
		if !ok {
			return
		}
		if inbound.Operation == "" {
			return
		}
		*records = append(*records, inbound)
	}
}

func containsTikTokDisplayLane(values []tiktokDisplayMonitorLane, want tiktokDisplayMonitorLane) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
