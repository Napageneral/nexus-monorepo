package main

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func declaredTikTokDisplayMethods() map[string]nexadapter.DeclaredMethod[struct{}] {
	connectionRequired := true

	return map[string]nexadapter.DeclaredMethod[struct{}]{
		"tiktok-display.user.info.get": nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
			Description: "Read the authorized TikTok Display profile for the bound connection.",
			Action:      "read",
			Params: map[string]any{
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
			},
			Response: map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"properties": map[string]any{
					"profile": map[string]any{
						"type":                 "object",
						"additionalProperties": true,
					},
					"source_request": map[string]any{
						"type":                 "object",
						"additionalProperties": true,
					},
				},
				"required": []string{"profile", "source_request"},
			},
			ConnectionRequired: &connectionRequired,
			Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
				return tiktokDisplayUserInfoGetMethod(ctx, req)
			},
		}),
		"tiktok-display.video.list": nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
			Description: "Read one page of TikTok Display videos for the bound connection.",
			Action:      "read",
			Params: map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"properties": map[string]any{
					"connection_id": map[string]any{"type": "string"},
					"payload": map[string]any{
						"type":                 "object",
						"additionalProperties": false,
						"properties": map[string]any{
							"cursor": map[string]any{
								"anyOf": []map[string]any{
									{"type": "integer"},
									{"type": "string"},
									{"type": "null"},
								},
								"minimum": 0,
							},
							"page_size": map[string]any{
								"anyOf": []map[string]any{
									{"type": "integer"},
									{"type": "string"},
									{"type": "null"},
								},
								"minimum": 1,
							},
						},
					},
				},
				"required": []string{"connection_id"},
			},
			Response: map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"properties": map[string]any{
					"cursor": map[string]any{
						"anyOf": []map[string]any{
							{"type": "integer"},
							{"type": "null"},
						},
					},
					"has_more": map[string]any{"type": "boolean"},
					"videos": map[string]any{
						"type":  "array",
						"items": map[string]any{"type": "object", "additionalProperties": true},
					},
					"source_request": map[string]any{
						"type":                 "object",
						"additionalProperties": true,
					},
				},
				"required": []string{"cursor", "has_more", "videos", "source_request"},
			},
			ConnectionRequired: &connectionRequired,
			Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
				return tiktokDisplayVideoListMethod(ctx, req)
			},
		}),
	}
}

func tiktokDisplayUserInfoGetMethod(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
	state, err := loadTikTokDisplayRuntime()
	if err != nil {
		return nil, err
	}
	if err := requireTikTokDisplayMethodConnection(state.ConnectionID, req.ConnectionID); err != nil {
		return nil, err
	}

	profile, err := fetchTikTokDisplayProfile(ctx.Context, state.AccessToken)
	if err != nil {
		return nil, err
	}
	if profile == nil {
		return nil, errors.New("TikTok Display user/info returned no profile")
	}

	return map[string]any{
		"profile":        tiktokDisplayProfileRawRow(profile),
		"source_request": map[string]any{"endpoint": "user/info"},
	}, nil
}

func tiktokDisplayVideoListMethod(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
	state, err := loadTikTokDisplayRuntime()
	if err != nil {
		return nil, err
	}
	if err := requireTikTokDisplayMethodConnection(state.ConnectionID, req.ConnectionID); err != nil {
		return nil, err
	}

	cursor := optionalTikTokDisplayMethodInt64(req.Payload, "cursor")
	pageSize := optionalTikTokDisplayMethodInt(req.Payload, "page_size", tiktokDisplayVideoPageSize)
	if pageSize <= 0 {
		pageSize = tiktokDisplayVideoPageSize
	}
	page, err := fetchTikTokDisplayVideoPage(ctx.Context, state.AccessToken, cursor, pageSize)
	if err != nil {
		return nil, err
	}
	if page == nil {
		return map[string]any{
			"cursor":         int64(0),
			"has_more":       false,
			"videos":         []map[string]any{},
			"source_request": map[string]any{"endpoint": "video/list", "cursor": cursor, "page_size": pageSize},
		}, nil
	}

	videos := make([]map[string]any, 0, len(page.Videos))
	for _, video := range page.Videos {
		videos = append(videos, tiktokDisplayVideoRawRow(video))
	}

	return map[string]any{
		"cursor":   page.Cursor,
		"has_more": page.HasMore,
		"videos":   videos,
		"source_request": map[string]any{
			"endpoint":  "video/list",
			"cursor":    cursor,
			"page_size": pageSize,
		},
	}, nil
}

func requireTikTokDisplayMethodConnection(runtimeConnectionID, requestedConnectionID string) error {
	requestedConnectionID = strings.TrimSpace(requestedConnectionID)
	if requestedConnectionID == "" {
		return errors.New("missing connection_id")
	}
	if runtimeConnectionID != "" && runtimeConnectionID != requestedConnectionID {
		return fmt.Errorf(
			"runtime connection %q does not match requested connection %q",
			runtimeConnectionID,
			requestedConnectionID,
		)
	}
	return nil
}

func optionalTikTokDisplayMethodInt(payload map[string]any, key string, defaultValue int) int {
	if payload == nil {
		return defaultValue
	}
	raw, ok := payload[key]
	if !ok || raw == nil {
		return defaultValue
	}

	switch value := raw.(type) {
	case int:
		if value > 0 {
			return value
		}
	case int64:
		if value > 0 {
			return int(value)
		}
	case float64:
		if value > 0 {
			return int(value)
		}
	case string:
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return defaultValue
		}
		if parsed, err := strconv.Atoi(trimmed); err == nil && parsed > 0 {
			return parsed
		}
	}
	return defaultValue
}

func optionalTikTokDisplayMethodInt64(payload map[string]any, key string) *int64 {
	if payload == nil {
		return nil
	}
	raw, ok := payload[key]
	if !ok || raw == nil {
		return nil
	}

	switch value := raw.(type) {
	case int:
		if value >= 0 {
			v := int64(value)
			return &v
		}
	case int64:
		if value >= 0 {
			v := value
			return &v
		}
	case float64:
		if value >= 0 {
			v := int64(value)
			return &v
		}
	case string:
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return nil
		}
		if parsed, err := strconv.ParseInt(trimmed, 10, 64); err == nil && parsed >= 0 {
			return &parsed
		}
	}
	return nil
}
