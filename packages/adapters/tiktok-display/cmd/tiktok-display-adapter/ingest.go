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
	"strconv"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	tiktokDisplayVideoFields           = "id,create_time,cover_image_url,share_url,video_description,duration,height,width,title,embed_html,embed_link,like_count,comment_count,share_count,view_count"
	tiktokDisplayListPageSize          = 20
	tiktokDisplayVideoPageSize         = tiktokDisplayListPageSize
	tiktokDisplayMonitorInterval       = 1 * time.Minute
	tiktokDisplayMonitorErrorBackoff   = 5 * time.Minute
	tiktokDisplayMonitorReplayWindow   = 7 * 24 * time.Hour
	tiktokDisplayDefaultSenderName     = "TikTok Display"
	tiktokDisplayDefaultContainerKind  = "group"
	tiktokDisplayDefaultContentType    = "application/json"
	tiktokDisplayProfileSnapshotFamily = "profile_snapshot"
	tiktokDisplayVideoSnapshotFamily   = "video_snapshot"
)

var (
	tiktokDisplayVideoListURL = "https://open.tiktokapis.com/v2/video/list/"
)

var (
	fetchTikTokDisplayVideos    = fetchTikTokDisplayVideosFromTikTok
	fetchTikTokDisplayVideoPage = fetchTikTokDisplayVideoPageFromTikTok
)

type tiktokDisplayVideo struct {
	CommentCount     int64          `json:"comment_count"`
	CoverImageURL    string         `json:"cover_image_url,omitempty"`
	CreateTime       int64          `json:"create_time"`
	Duration         int64          `json:"duration"`
	EmbedHTML        string         `json:"embed_html,omitempty"`
	EmbedLink        string         `json:"embed_link,omitempty"`
	Height           int64          `json:"height"`
	ID               string         `json:"id,omitempty"`
	LikeCount        int64          `json:"like_count"`
	ShareCount       int64          `json:"share_count"`
	ShareURL         string         `json:"share_url,omitempty"`
	Title            string         `json:"title,omitempty"`
	VideoDescription string         `json:"video_description,omitempty"`
	ViewCount        int64          `json:"view_count"`
	Width            int64          `json:"width"`
	Raw              map[string]any `json:"-"`
}

type tiktokDisplayVideoInfo = tiktokDisplayVideo

type tiktokDisplayVideoListResponse struct {
	Data  *tiktokDisplayVideoListData `json:"data,omitempty"`
	Error *tiktokDisplayAPIError      `json:"error,omitempty"`
}

type tiktokDisplayVideoListData struct {
	Cursor  int64                `json:"cursor,omitempty"`
	HasMore bool                 `json:"has_more,omitempty"`
	Videos  []tiktokDisplayVideo `json:"videos,omitempty"`
}

type tiktokDisplayAPIError struct {
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
	LogID   string `json:"log_id,omitempty"`
}

type tiktokDisplayVideoPage struct {
	Cursor  int64
	HasMore bool
	Videos  []tiktokDisplayVideo
}

func backfill(ctx context.Context, connectionID string, since time.Time, emit nexadapter.EmitFunc) error {
	state, err := loadTikTokDisplayRuntime()
	if err != nil {
		return err
	}

	requestedConnectionID, err := nexadapter.RequireConnection(connectionID)
	if err != nil {
		return err
	}
	if state.ConnectionID != "" && state.ConnectionID != requestedConnectionID {
		return fmt.Errorf("runtime connection %q does not match requested connection %q", state.ConnectionID, requestedConnectionID)
	}

	pollTime := time.Now().UTC()
	monitorState, durableState, err := loadOptionalTikTokDisplayMonitorState(state.ConnectionID)
	if err != nil {
		return err
	}
	emitter := newTikTokDisplayRecordEmitter(monitorState, tiktokDisplayMonitorLaneBackfill, pollTime, emit)
	if durableState {
		monitorState.metrics(tiktokDisplayMonitorLaneBackfill).beginCycle(pollTime)
	}

	accessToken, err := state.accessTokenForRequest(ctx)
	if err != nil {
		return err
	}

	profile, err := fetchTikTokDisplayProfile(ctx, accessToken)
	if err != nil {
		return err
	}
	if profile == nil {
		return errors.New("TikTok Display user/info returned no profile")
	}

	emitter.Emit(buildTikTokDisplayProfileSnapshotRecord(state, profile))

	videos, err := fetchTikTokDisplayVideos(ctx, accessToken, since.UTC(), pollTime)
	if err != nil {
		return err
	}
	for _, video := range videos {
		emitter.Emit(buildTikTokDisplayVideoSnapshotRecord(state, profile, video))
	}

	if durableState {
		monitorState.updateDiscovery(videos, pollTime)
		monitorState.Backfill.LastPollAt = pollTime
		monitorState.Backfill.LastSince = since.UTC()
		monitorState.Backfill.LastObserved = len(videos) + 1
		if monitorState.Reconcile.LastPollAt.IsZero() {
			monitorState.Reconcile.LastPollAt = pollTime
		}
		if err := saveTikTokDisplayMonitorState(state.ConnectionID, monitorState); err != nil {
			return err
		}
	}

	return nil
}

func monitor(ctx context.Context, connectionID string, emit nexadapter.EmitFunc) error {
	state, err := loadTikTokDisplayRuntime()
	if err != nil {
		return err
	}

	requestedConnectionID, err := nexadapter.RequireConnection(connectionID)
	if err != nil {
		return err
	}
	if state.ConnectionID != "" && state.ConnectionID != requestedConnectionID {
		return fmt.Errorf("runtime connection %q does not match requested connection %q", state.ConnectionID, requestedConnectionID)
	}

	monitorState, err := loadTikTokDisplayMonitorState(state.ConnectionID)
	if err != nil {
		return err
	}

	consecutiveErrors := 0
	for {
		pollTime := time.Now().UTC()
		result := runTikTokDisplayMonitorCycle(ctx, state, monitorState, pollTime, emit)
		if result.StateChanged {
			if err := saveTikTokDisplayMonitorState(state.ConnectionID, monitorState); err != nil {
				return err
			}
		}

		if len(result.FailedLanes) > 0 && len(result.SuccessfulLanes) == 0 {
			consecutiveErrors++
			if consecutiveErrors >= 5 {
				return fmt.Errorf("too many consecutive TikTok Display monitor errors: %v", result.FailedLanes)
			}
		} else {
			consecutiveErrors = 0
		}

		wait := tiktokDisplayMonitorInterval
		if len(result.DueLanes) > 0 && len(result.SuccessfulLanes) == 0 && len(result.FailedLanes) > 0 {
			wait = tiktokDisplayMonitorErrorBackoff
		}

		select {
		case <-ctx.Done():
			nexadapter.LogInfo("tiktok display monitor shutting down")
			return nil
		case <-time.After(wait):
		}
	}
}

func fetchTikTokDisplayVideosFromTikTok(ctx context.Context, accessToken string, floor time.Time, ceiling time.Time) ([]tiktokDisplayVideoInfo, error) {
	floor = floor.UTC()
	ceiling = ceiling.UTC()
	if ceiling.IsZero() {
		ceiling = time.Now().UTC()
	}
	if !floor.IsZero() && floor.After(ceiling) {
		floor = ceiling
	}

	floorMillis := int64(0)
	if !floor.IsZero() {
		floorMillis = floor.UnixMilli()
	}

	cursor := int64(0)
	var videos []tiktokDisplayVideoInfo

	for {
		page, err := fetchTikTokDisplayVideoPage(ctx, accessToken, &cursor, tiktokDisplayVideoPageSize)
		if err != nil {
			return nil, err
		}
		if page == nil {
			break
		}

		stop := false
		for _, video := range page.Videos {
			videoMillis := tiktokDisplayVideoTimestampMillis(video)
			if floorMillis > 0 && videoMillis > 0 && videoMillis < floorMillis {
				stop = true
				break
			}
			video.Raw = tiktokDisplayVideoRawRow(video)
			videos = append(videos, video)
		}

		if stop || !page.HasMore {
			break
		}
		if page.Cursor <= 0 || page.Cursor == cursor {
			break
		}
		cursor = page.Cursor
	}

	return videos, nil
}

func buildTikTokDisplayProfileSnapshotRecord(state *tiktokDisplayRuntime, profile *tiktokDisplayUserInfo) nexadapter.AdapterInboundRecord {
	openID := displayOpenID(state, profile)
	displayName := displayDisplayName(state, profile)
	profileWebLink := displayProfileWebLink(state, profile)
	logicalRowID := fmt.Sprintf("profile:%s", openID)

	normalizedRow := normalizedTikTokDisplayProfileRow(state, profile)
	providerRow := tiktokDisplayProfileRawRow(profile)
	providerIDs := map[string]any{
		"open_id": openID,
	}
	if strings.TrimSpace(profile.UnionID) != "" {
		providerIDs["union_id"] = profile.UnionID
	}

	content := fmt.Sprintf(
		"profile_snapshot open_id=%s display_name=%s videos=%d followers=%d",
		openID,
		displayName,
		profile.VideoCount,
		profile.FollowerCount,
	)

	return buildTikTokDisplayRecord(
		state,
		tiktokDisplayProfileSnapshotFamily,
		"Profile Snapshots",
		"profile",
		openID,
		displayName,
		openID,
		logicalRowID,
		logicalRowID,
		displayName,
		time.Now().UnixMilli(),
		normalizedRow,
		providerRow,
		providerIDs,
		content,
		map[string]any{
			"profile_web_link": profileWebLink,
			"source_request": map[string]any{
				"endpoint": "user/info",
			},
		},
	)
}

func buildTikTokDisplayVideoSnapshotRecord(state *tiktokDisplayRuntime, profile *tiktokDisplayUserInfo, video tiktokDisplayVideo) nexadapter.AdapterInboundRecord {
	openID := displayOpenID(state, profile)
	displayName := displayDisplayName(state, profile)
	videoID := displayNonBlank(video.ID, "video")
	logicalRowID := fmt.Sprintf("video:%s", videoID)
	threadName := displayNonBlank(video.Title, videoID)
	timestamp := tiktokDisplayVideoTimestampMillis(video)
	if timestamp <= 0 {
		timestamp = time.Now().UnixMilli()
	}

	normalizedRow := normalizedTikTokDisplayVideoRow(video)
	providerRow := video.Raw
	if len(providerRow) == 0 {
		providerRow = tiktokDisplayVideoRawRow(video)
	}
	providerIDs := map[string]any{
		"open_id":  openID,
		"video_id": videoID,
	}

	content := fmt.Sprintf(
		"video_snapshot video=%s title=%s create_time=%s",
		videoID,
		threadName,
		strconv.FormatInt(video.CreateTime, 10),
	)

	return buildTikTokDisplayRecord(
		state,
		tiktokDisplayVideoSnapshotFamily,
		"Video Snapshots",
		"video",
		openID,
		displayName,
		openID,
		logicalRowID,
		logicalRowID,
		threadName,
		timestamp,
		normalizedRow,
		providerRow,
		providerIDs,
		content,
		map[string]any{
			"source_request": map[string]any{
				"endpoint": "video/list",
			},
		},
	)
}

func buildTikTokDisplayRecord(
	state *tiktokDisplayRuntime,
	familyID string,
	containerName string,
	grain string,
	senderID string,
	senderName string,
	spaceID string,
	logicalRowID string,
	threadID string,
	threadName string,
	timestamp int64,
	normalizedRow map[string]any,
	providerRow any,
	providerIDs map[string]any,
	content string,
	extraMetadata map[string]any,
) nexadapter.AdapterInboundRecord {
	connectionID, err := nexadapter.RequireConnection(state.ConnectionID)
	if err != nil {
		nexadapter.LogError("tiktok display record build: %v", err)
		return nexadapter.AdapterInboundRecord{}
	}

	revisionPayload := stableTikTokDisplayRevisionPayload(familyID, normalizedRow)
	revisionHash := tiktokDisplayRevisionHash(revisionPayload)

	metadata := map[string]any{
		"connection_id":  connectionID,
		"adapter_id":     platformID,
		"family":         familyID,
		"grain":          grain,
		"logical_row_id": logicalRowID,
		"revision_hash":  revisionHash,
		"row":            normalizedRow,
		"provider_row":   providerRow,
		"provider_ids":   providerIDs,
		"source_system":  "tiktok_display_api",
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
			SenderID:      senderID,
			SenderName:    senderName,
			ReceiverID:    connectionID,
			SpaceID:       spaceID,
			ContainerKind: tiktokDisplayDefaultContainerKind,
			ContainerID:   familyID,
			ContainerName: containerName,
			ThreadID:      threadID,
			ThreadName:    threadName,
			Metadata: map[string]any{
				"family": familyID,
				"grain":  grain,
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf(
				"%s:%s:%s:%s:%s",
				platformID,
				nexadapter.SafeIDToken(connectionID),
				familyID,
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

func normalizedTikTokDisplayProfileRow(state *tiktokDisplayRuntime, profile *tiktokDisplayUserInfo) map[string]any {
	normalized := map[string]any{}
	normalized["open_id"] = displayOpenID(state, profile)
	if strings.TrimSpace(profile.UnionID) != "" {
		normalized["union_id"] = strings.TrimSpace(profile.UnionID)
	}
	if strings.TrimSpace(profile.AvatarURL) != "" {
		normalized["avatar_url"] = strings.TrimSpace(profile.AvatarURL)
	}
	if strings.TrimSpace(displayDisplayName(state, profile)) != "" {
		normalized["display_name"] = displayDisplayName(state, profile)
	}
	if strings.TrimSpace(profile.BioDescription) != "" {
		normalized["bio_description"] = strings.TrimSpace(profile.BioDescription)
	}
	if strings.TrimSpace(displayProfileDeepLink(profile)) != "" {
		normalized["profile_deep_link"] = displayProfileDeepLink(profile)
	}
	if strings.TrimSpace(displayProfileWebLink(state, profile)) != "" {
		normalized["profile_web_link"] = displayProfileWebLink(state, profile)
	}
	normalized["is_verified"] = profile.IsVerified
	normalized["follower_count"] = profile.FollowerCount
	normalized["following_count"] = profile.FollowingCount
	normalized["likes_count"] = profile.LikesCount
	normalized["video_count"] = profile.VideoCount
	return normalized
}

func normalizedTikTokDisplayVideoRow(video tiktokDisplayVideo) map[string]any {
	normalized := map[string]any{
		"id":            displayNonBlank(video.ID, "video"),
		"create_time":   video.CreateTime,
		"duration":      video.Duration,
		"height":        video.Height,
		"width":         video.Width,
		"like_count":    video.LikeCount,
		"comment_count": video.CommentCount,
		"share_count":   video.ShareCount,
		"view_count":    video.ViewCount,
	}
	if strings.TrimSpace(video.CoverImageURL) != "" {
		normalized["cover_image_url"] = strings.TrimSpace(video.CoverImageURL)
	}
	if strings.TrimSpace(video.ShareURL) != "" {
		normalized["share_url"] = strings.TrimSpace(video.ShareURL)
	}
	if strings.TrimSpace(video.VideoDescription) != "" {
		normalized["video_description"] = strings.TrimSpace(video.VideoDescription)
	}
	if strings.TrimSpace(video.Title) != "" {
		normalized["title"] = strings.TrimSpace(video.Title)
	}
	if strings.TrimSpace(video.EmbedHTML) != "" {
		normalized["embed_html"] = strings.TrimSpace(video.EmbedHTML)
	}
	if strings.TrimSpace(video.EmbedLink) != "" {
		normalized["embed_link"] = strings.TrimSpace(video.EmbedLink)
	}
	return normalized
}

func tiktokDisplayProfileRawRow(profile *tiktokDisplayUserInfo) map[string]any {
	if profile == nil {
		return map[string]any{}
	}

	return map[string]any{
		"open_id":           strings.TrimSpace(profile.OpenID),
		"union_id":          strings.TrimSpace(profile.UnionID),
		"avatar_url":        strings.TrimSpace(profile.AvatarURL),
		"display_name":      strings.TrimSpace(profile.DisplayName),
		"bio_description":   strings.TrimSpace(profile.BioDescription),
		"profile_deep_link": strings.TrimSpace(profile.ProfileDeepLink),
		"profile_web_link":  strings.TrimSpace(profile.ProfileWebLink),
		"is_verified":       profile.IsVerified,
		"follower_count":    profile.FollowerCount,
		"following_count":   profile.FollowingCount,
		"likes_count":       profile.LikesCount,
		"video_count":       profile.VideoCount,
	}
}

func tiktokDisplayVideoRawRow(video tiktokDisplayVideo) map[string]any {
	raw := map[string]any{
		"id":                displayNonBlank(video.ID, "video"),
		"create_time":       video.CreateTime,
		"duration":          video.Duration,
		"height":            video.Height,
		"width":             video.Width,
		"like_count":        video.LikeCount,
		"comment_count":     video.CommentCount,
		"share_count":       video.ShareCount,
		"view_count":        video.ViewCount,
		"cover_image_url":   strings.TrimSpace(video.CoverImageURL),
		"share_url":         strings.TrimSpace(video.ShareURL),
		"video_description": strings.TrimSpace(video.VideoDescription),
		"title":             strings.TrimSpace(video.Title),
		"embed_html":        strings.TrimSpace(video.EmbedHTML),
		"embed_link":        strings.TrimSpace(video.EmbedLink),
	}
	for key, value := range raw {
		if str, ok := value.(string); ok && strings.TrimSpace(str) == "" {
			delete(raw, key)
		}
	}
	return raw
}

func fetchTikTokDisplayVideoPageFromTikTok(ctx context.Context, accessToken string, cursor *int64, pageSize int) (*tiktokDisplayVideoPage, error) {
	endpoint, err := url.Parse(tiktokDisplayVideoListURL)
	if err != nil {
		return nil, fmt.Errorf("parse TikTok Display video/list URL: %w", err)
	}
	query := endpoint.Query()
	query.Set("fields", tiktokDisplayVideoFields)
	endpoint.RawQuery = query.Encode()

	body := map[string]any{
		"max_count": tiktokDisplayListPageSize,
	}
	if pageSize > 0 {
		body["max_count"] = pageSize
	}
	if cursor != nil && *cursor > 0 {
		body["cursor"] = *cursor
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal TikTok Display video/list request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), strings.NewReader(string(payload)))
	if err != nil {
		return nil, fmt.Errorf("create TikTok Display video/list request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(accessToken))
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", tiktokDisplayDefaultContentType)

	client := tiktokDisplayHTTPClient
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call TikTok Display video/list: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read TikTok Display video/list response: %w", err)
	}

	var envelope tiktokDisplayVideoListResponse
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &envelope); err != nil {
			return nil, fmt.Errorf("parse TikTok Display video/list response: %w", err)
		}
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if envelope.Error != nil && strings.TrimSpace(envelope.Error.Message) != "" {
			return nil, fmt.Errorf("TikTok Display video/list failed: %s", envelope.Error.Message)
		}
		return nil, fmt.Errorf("TikTok Display video/list failed with HTTP %d", resp.StatusCode)
	}
	if envelope.Error != nil && strings.TrimSpace(envelope.Error.Message) != "" && !strings.EqualFold(strings.TrimSpace(envelope.Error.Code), "ok") {
		return nil, fmt.Errorf("TikTok Display video/list failed: %s", envelope.Error.Message)
	}
	if envelope.Data == nil {
		return nil, errors.New("TikTok Display video/list response missing data")
	}

	return &tiktokDisplayVideoPage{
		Cursor:  envelope.Data.Cursor,
		HasMore: envelope.Data.HasMore,
		Videos:  envelope.Data.Videos,
	}, nil
}

func tiktokDisplayVideoTimestampMillis(video tiktokDisplayVideo) int64 {
	if video.CreateTime <= 0 {
		return 0
	}
	if video.CreateTime < 1_000_000_000_000 {
		return video.CreateTime * 1000
	}
	return video.CreateTime
}

func tiktokDisplayRevisionHash(value any) string {
	payload, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:8])
}

func stableTikTokDisplayRevisionPayload(familyID string, normalizedRow map[string]any) any {
	switch familyID {
	case tiktokDisplayProfileSnapshotFamily:
		return stableTikTokDisplayProfileRevisionRow(normalizedRow)
	case tiktokDisplayVideoSnapshotFamily:
		return stableTikTokDisplayVideoRevisionRow(normalizedRow)
	default:
		return normalizedRow
	}
}

func stableTikTokDisplayProfileRevisionRow(normalizedRow map[string]any) map[string]any {
	return filterTikTokDisplayRevisionRow(normalizedRow, map[string]struct{}{
		"open_id":          {},
		"union_id":         {},
		"display_name":     {},
		"bio_description":  {},
		"profile_web_link": {},
		"is_verified":      {},
		"follower_count":   {},
		"following_count":  {},
		"likes_count":      {},
		"video_count":      {},
	})
}

func stableTikTokDisplayVideoRevisionRow(normalizedRow map[string]any) map[string]any {
	return filterTikTokDisplayRevisionRow(normalizedRow, map[string]struct{}{
		"id":                {},
		"create_time":       {},
		"duration":          {},
		"height":            {},
		"width":             {},
		"like_count":        {},
		"comment_count":     {},
		"share_count":       {},
		"view_count":        {},
		"video_description": {},
		"title":             {},
	})
}

func filterTikTokDisplayRevisionRow(
	normalizedRow map[string]any,
	allowed map[string]struct{},
) map[string]any {
	filtered := map[string]any{}
	for key, value := range normalizedRow {
		if _, ok := allowed[key]; !ok {
			continue
		}
		filtered[key] = value
	}
	return filtered
}

func displayOpenID(state *tiktokDisplayRuntime, profile *tiktokDisplayUserInfo) string {
	if profile != nil && strings.TrimSpace(profile.OpenID) != "" {
		return strings.TrimSpace(profile.OpenID)
	}
	return strings.TrimSpace(state.OpenID)
}

func displayDisplayName(state *tiktokDisplayRuntime, profile *tiktokDisplayUserInfo) string {
	if profile != nil && strings.TrimSpace(profile.DisplayName) != "" {
		return strings.TrimSpace(profile.DisplayName)
	}
	if strings.TrimSpace(state.DisplayName) != "" {
		return strings.TrimSpace(state.DisplayName)
	}
	if openID := displayOpenID(state, profile); openID != "" {
		return openID
	}
	return tiktokDisplayDefaultSenderName
}

func displayProfileWebLink(state *tiktokDisplayRuntime, profile *tiktokDisplayUserInfo) string {
	if profile != nil && strings.TrimSpace(profile.ProfileWebLink) != "" {
		return strings.TrimSpace(profile.ProfileWebLink)
	}
	return strings.TrimSpace(state.ProfileWebLink)
}

func displayProfileDeepLink(profile *tiktokDisplayUserInfo) string {
	if profile == nil {
		return ""
	}
	return strings.TrimSpace(profile.ProfileDeepLink)
}

func displayNonBlank(value string, fallback string) string {
	if trimmed := strings.TrimSpace(value); trimmed != "" {
		return trimmed
	}
	return fallback
}
