package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func loadRuntimeContext() (*jiraRuntimeContext, error) {
	path := strings.TrimSpace(os.Getenv(nexadapter.AdapterContextEnvVar))
	if path == "" {
		return nil, fmt.Errorf("missing runtime context (expected $%s)", nexadapter.AdapterContextEnvVar)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read runtime context: %w", err)
	}

	var ctx jiraRuntimeContext
	if err := json.Unmarshal(raw, &ctx); err != nil {
		return nil, fmt.Errorf("parse runtime context json: %w", err)
	}
	if ctx.Platform == "" {
		return nil, fmt.Errorf("runtime context missing platform")
	}
	if ctx.ConnectionID == "" {
		return nil, fmt.Errorf("runtime context missing connection_id")
	}
	if ctx.Config == nil {
		ctx.Config = map[string]any{}
	}
	return &ctx, nil
}

func loadConnectionConfig() (*jiraConnectionConfig, *jiraRuntimeContext, error) {
	ctx, err := loadRuntimeContext()
	if err != nil {
		return nil, nil, err
	}

	cfg := &jiraConnectionConfig{
		ConnectionID: ctx.ConnectionID,
		Projects:     configStringSlice(ctx.Config, "projects"),
		PollInterval: 5 * time.Minute,
		Watermarks:   map[string]time.Time{},
	}

	if pollInterval := configString(ctx.Config, "poll_interval"); pollInterval != "" {
		d, err := time.ParseDuration(pollInterval)
		if err != nil {
			return nil, nil, fmt.Errorf("invalid poll_interval %q: %w", pollInterval, err)
		}
		cfg.PollInterval = d
	}
	if syncConfig, ok := ctx.Config["sync"].(map[string]any); ok {
		if pollInterval := configString(syncConfig, "poll_interval"); pollInterval != "" {
			d, err := time.ParseDuration(pollInterval)
			if err != nil {
				return nil, nil, fmt.Errorf("invalid sync.poll_interval %q: %w", pollInterval, err)
			}
			cfg.PollInterval = d
		}
	}
	if rawWatermarks, ok := ctx.Config["watermarks"].(map[string]any); ok {
		for key, value := range rawWatermarks {
			text := strings.TrimSpace(fmt.Sprintf("%v", value))
			if text == "" {
				continue
			}
			t, err := parseRFC3339OrJiraTime(text)
			if err != nil {
				return nil, nil, fmt.Errorf("invalid watermark for %s: %w", key, err)
			}
			cfg.Watermarks[key] = t
		}
	}

	return cfg, ctx, nil
}

func loadJiraClientFromRuntime() (*jiraClient, *jiraConnectionConfig, error) {
	cfg, ctx, err := loadConnectionConfig()
	if err != nil {
		return nil, nil, err
	}
	if ctx.Credential == nil {
		return nil, nil, fmt.Errorf("missing runtime credential for jira adapter")
	}
	fields := ctx.Credential.Fields
	client, err := newJiraClient(
		configString(map[string]any{
			"site":      firstNonBlank(fields["site"], fields["site_name"]),
			"email":     fields["email"],
			"api_token": fields["api_token"],
		}, "site"),
		fields["email"],
		fields["api_token"],
	)
	if err != nil {
		return nil, nil, err
	}
	return client, cfg, nil
}

func parseRFC3339OrJiraTime(value string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, value); err == nil {
		return t, nil
	}
	return parseJiraTimestamp(value)
}
