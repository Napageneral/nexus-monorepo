package main

import (
	"context"
	"testing"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestAdapterInfoIncludesTikTokDisplayMethodCatalogAndProjection(t *testing.T) {
	adapter := nexadapter.DefineAdapter(adapterConfig())
	info, err := adapter.Operations.AdapterInfo(context.Background())
	if err != nil {
		t.Fatalf("AdapterInfo() returned error: %v", err)
	}

	if info.MethodCatalog == nil {
		t.Fatalf("expected method catalog metadata")
	}
	if info.MethodCatalog.Source != "openapi" {
		t.Fatalf("expected openapi source, got %q", info.MethodCatalog.Source)
	}
	if info.MethodCatalog.Document != "api/openapi.yaml" {
		t.Fatalf("expected api/openapi.yaml document, got %q", info.MethodCatalog.Document)
	}
	if info.MethodCatalog.Namespace != platformID {
		t.Fatalf("expected namespace %q, got %q", platformID, info.MethodCatalog.Namespace)
	}

	if info.Projection == nil {
		t.Fatalf("expected projection metadata")
	}
	if info.Projection.Platform != platformID {
		t.Fatalf("expected projection platform %q, got %q", platformID, info.Projection.Platform)
	}
	if len(info.Projection.Families) != 2 {
		t.Fatalf("expected two projection families, got %#v", info.Projection.Families)
	}
	if info.Projection.Families[0].Name != tiktokDisplayProfileSnapshotFamily {
		t.Fatalf("expected profile family first, got %q", info.Projection.Families[0].Name)
	}
	if info.Projection.Families[1].Name != tiktokDisplayVideoSnapshotFamily {
		t.Fatalf("expected video family second, got %q", info.Projection.Families[1].Name)
	}
	if info.Projection.Backfill == nil || !info.Projection.Backfill.Supported {
		t.Fatalf("expected backfill projection support, got %#v", info.Projection.Backfill)
	}
	if info.Projection.Monitor == nil || !info.Projection.Monitor.Supported {
		t.Fatalf("expected monitor projection support, got %#v", info.Projection.Monitor)
	}
	if info.Projection.Normalization == nil || info.Projection.Normalization.Content != "provider_native_profile_and_video_snapshots" {
		t.Fatalf("expected normalization metadata, got %#v", info.Projection.Normalization)
	}

	methods := map[string]nexadapter.AdapterMethod{}
	for _, method := range info.Methods {
		methods[method.Name] = method
	}
	if len(methods) != 2 {
		t.Fatalf("expected two adapter methods, got %#v", info.Methods)
	}
	if _, ok := methods["tiktok-display.user.info.get"]; !ok {
		t.Fatalf("missing tiktok-display.user.info.get in adapter info methods: %#v", info.Methods)
	}
	if _, ok := methods["tiktok-display.video.list"]; !ok {
		t.Fatalf("missing tiktok-display.video.list in adapter info methods: %#v", info.Methods)
	}
}

func TestTikTokDisplayUserInfoGetMethodReturnsRawProfileRow(t *testing.T) {
	path := writeTikTokDisplayRuntimeContext(t, map[string]any{
		"version":       1,
		"platform":      platformID,
		"connection_id": "display-primary",
		"config":        map[string]any{},
		"credential": map[string]any{
			"value":   "access-token",
			"ref":     "tiktok-display/display-primary",
			"service": platformID,
			"fields": map[string]string{
				"access_token":     "access-token",
				"open_id":          "open_123",
				"display_name":     "Moon Sleep",
				"profile_web_link": "https://www.tiktok.com/@moonsleep",
			},
		},
	})
	t.Setenv("NEXUS_ADAPTER_CONTEXT_PATH", path)

	originalFetch := fetchTikTokDisplayProfile
	t.Cleanup(func() {
		fetchTikTokDisplayProfile = originalFetch
	})
	fetchTikTokDisplayProfile = func(ctx context.Context, accessToken string) (*tiktokDisplayUserInfo, error) {
		if accessToken != "access-token" {
			t.Fatalf("expected access token access-token, got %q", accessToken)
		}
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

	result, err := tiktokDisplayUserInfoGetMethod(
		nexadapter.AdapterContext[struct{}]{Context: context.Background(), ConnectionID: "display-primary"},
		nexadapter.AdapterMethodRequest{ConnectionID: "display-primary", Payload: map[string]any{}},
	)
	if err != nil {
		t.Fatalf("tiktokDisplayUserInfoGetMethod returned error: %v", err)
	}

	payload, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("unexpected response type %T", result)
	}
	profile, ok := payload["profile"].(map[string]any)
	if !ok {
		t.Fatalf("profile response missing raw row: %#v", payload["profile"])
	}
	if profile["open_id"] != "open_123" {
		t.Fatalf("expected open_id open_123, got %#v", profile["open_id"])
	}
	if profile["display_name"] != "Moon Sleep" {
		t.Fatalf("expected display_name Moon Sleep, got %#v", profile["display_name"])
	}
	if profile["video_count"] != int64(12) {
		t.Fatalf("expected video_count 12, got %#v", profile["video_count"])
	}
	sourceRequest, ok := payload["source_request"].(map[string]any)
	if !ok {
		t.Fatalf("source_request response missing: %#v", payload["source_request"])
	}
	if sourceRequest["endpoint"] != "user/info" {
		t.Fatalf("expected user/info source request, got %#v", sourceRequest["endpoint"])
	}
}

func TestTikTokDisplayVideoListMethodReturnsPageAndHonorsRequestedPageSize(t *testing.T) {
	path := writeTikTokDisplayRuntimeContext(t, map[string]any{
		"version":       1,
		"platform":      platformID,
		"connection_id": "display-primary",
		"config":        map[string]any{},
		"credential": map[string]any{
			"value":   "access-token",
			"ref":     "tiktok-display/display-primary",
			"service": platformID,
			"fields": map[string]string{
				"access_token": "access-token",
				"open_id":      "open_123",
			},
		},
	})
	t.Setenv("NEXUS_ADAPTER_CONTEXT_PATH", path)

	originalFetch := fetchTikTokDisplayVideoPage
	t.Cleanup(func() {
		fetchTikTokDisplayVideoPage = originalFetch
	})

	var capturedCursor *int64
	var capturedPageSize int
	fetchTikTokDisplayVideoPage = func(ctx context.Context, accessToken string, cursor *int64, pageSize int) (*tiktokDisplayVideoPage, error) {
		if accessToken != "access-token" {
			t.Fatalf("expected access token access-token, got %q", accessToken)
		}
		capturedCursor = cursor
		capturedPageSize = pageSize
		return &tiktokDisplayVideoPage{
			Cursor:  44,
			HasMore: true,
			Videos: []tiktokDisplayVideo{
				{
					ID:               "video_123",
					Title:            "Moon Sleep Clip",
					CreateTime:       1711687200,
					ViewCount:        111,
					LikeCount:        22,
					CommentCount:     3,
					ShareCount:       4,
					VideoDescription: "clip",
				},
			},
		}, nil
	}

	result, err := tiktokDisplayVideoListMethod(
		nexadapter.AdapterContext[struct{}]{Context: context.Background(), ConnectionID: "display-primary"},
		nexadapter.AdapterMethodRequest{
			ConnectionID: "display-primary",
			Payload: map[string]any{
				"cursor":    21,
				"page_size": 7,
			},
		},
	)
	if err != nil {
		t.Fatalf("tiktokDisplayVideoListMethod returned error: %v", err)
	}

	if capturedPageSize != 7 {
		t.Fatalf("expected page size 7, got %d", capturedPageSize)
	}
	if capturedCursor == nil || *capturedCursor != 21 {
		t.Fatalf("expected cursor 21, got %#v", capturedCursor)
	}

	payload, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("unexpected response type %T", result)
	}
	if payload["cursor"] != int64(44) {
		t.Fatalf("expected cursor 44, got %#v", payload["cursor"])
	}
	if payload["has_more"] != true {
		t.Fatalf("expected has_more true, got %#v", payload["has_more"])
	}
	videos, ok := payload["videos"].([]map[string]any)
	if !ok {
		t.Fatalf("videos response missing raw rows: %#v", payload["videos"])
	}
	if len(videos) != 1 {
		t.Fatalf("expected one video row, got %#v", videos)
	}
	if videos[0]["id"] != "video_123" {
		t.Fatalf("expected video id video_123, got %#v", videos[0]["id"])
	}
	sourceRequest, ok := payload["source_request"].(map[string]any)
	if !ok {
		t.Fatalf("source_request response missing: %#v", payload["source_request"])
	}
	if sourceRequest["endpoint"] != "video/list" {
		t.Fatalf("expected video/list source request, got %#v", sourceRequest["endpoint"])
	}
}
