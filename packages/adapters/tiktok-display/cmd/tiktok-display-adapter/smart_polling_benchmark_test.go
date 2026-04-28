package main

import (
	"context"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func BenchmarkTikTokDisplayQuietMonitorCycle(b *testing.B) {
	originalFetchProfile := fetchTikTokDisplayProfile
	originalFetchVideos := fetchTikTokDisplayVideos
	originalMetricsLogging := tiktokDisplayMonitorMetricsLogging
	b.Cleanup(func() {
		fetchTikTokDisplayProfile = originalFetchProfile
		fetchTikTokDisplayVideos = originalFetchVideos
		tiktokDisplayMonitorMetricsLogging = originalMetricsLogging
	})
	tiktokDisplayMonitorMetricsLogging = false

	fetchTikTokDisplayProfile = func(ctx context.Context, accessToken string) (*tiktokDisplayUserInfo, error) {
		return &tiktokDisplayUserInfo{
			OpenID:        "open_123",
			DisplayName:   "Moon Sleep",
			FollowerCount: 321,
			LikesCount:    789,
			VideoCount:    12,
		}, nil
	}
	publishedAt := time.Date(2026, time.April, 27, 14, 0, 0, 0, time.UTC)
	fetchTikTokDisplayVideos = func(ctx context.Context, accessToken string, floor time.Time, ceiling time.Time) ([]tiktokDisplayVideoInfo, error) {
		return []tiktokDisplayVideoInfo{
			{ID: "video_123", Title: "Original", CreateTime: publishedAt.Unix(), ViewCount: 111, LikeCount: 22},
		}, nil
	}

	state := &tiktokDisplayRuntime{ConnectionID: "display-primary", AccessToken: "access-token", OpenID: "open_123", DisplayName: "Moon Sleep"}
	monitorState := defaultTikTokDisplayMonitorState()
	firstPoll := time.Date(2026, time.April, 27, 15, 0, 0, 0, time.UTC)
	runTikTokDisplayMonitorCycle(context.Background(), state, monitorState, firstPoll, func(record any) {})

	b.ReportAllocs()
	for idx := 0; idx < b.N; idx++ {
		pollTime := firstPoll.Add(time.Duration(idx+1) * tiktokDisplayDiscoveryPollInterval)
		var records []nexadapter.AdapterInboundRecord
		result := runTikTokDisplayMonitorCycle(context.Background(), state, monitorState, pollTime, collectTikTokDisplayRecords(&records))
		if len(result.FailedLanes) != 0 {
			b.Fatalf("failed lanes = %v", result.FailedLanes)
		}
		if len(records) != 0 {
			b.Fatalf("quiet cycle emitted %d records, want zero", len(records))
		}
	}
}
