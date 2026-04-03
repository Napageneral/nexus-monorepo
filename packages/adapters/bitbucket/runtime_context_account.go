package main

import (
	"encoding/json"
	"fmt"
	"strings"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func loadRuntimeAccount(accountID string) (AccountConfig, Provider, error) {
	runtimeContext, err := nexadapter.LoadRuntimeContextFromEnv()
	if err != nil {
		return AccountConfig{}, nil, err
	}
	if strings.TrimSpace(accountID) != "" && runtimeContext.ConnectionID != accountID {
		return AccountConfig{}, nil, fmt.Errorf(
			"runtime context connection mismatch: expected %q, got %q",
			accountID,
			runtimeContext.ConnectionID,
		)
	}

	config, err := accountConfigFromRuntimeContext(runtimeContext)
	if err != nil {
		return AccountConfig{}, nil, err
	}
	provider, err := GetProvider(config.Provider)
	if err != nil {
		return AccountConfig{}, nil, err
	}
	return config, provider, nil
}

func accountConfigFromRuntimeContext(runtimeContext *nexadapter.RuntimeContext) (AccountConfig, error) {
	if runtimeContext == nil {
		return AccountConfig{}, fmt.Errorf("missing runtime context")
	}
	if runtimeContext.Credential == nil {
		return AccountConfig{}, fmt.Errorf("runtime context missing credential")
	}

	config := AccountConfig{
		AccountID:           runtimeContext.ConnectionID,
		Provider:            firstNonEmptyString(runtimeContext.Credential.Fields["provider"], stringConfig(runtimeContext.Config, "provider"), platformID),
		Host:                firstNonEmptyString(runtimeContext.Credential.Fields["host"], stringConfig(runtimeContext.Config, "host")),
		Token:               firstNonEmptyString(runtimeContext.Credential.Fields["token"], runtimeContext.Credential.Fields["accessToken"], runtimeContext.Credential.Value),
		Username:            firstNonEmptyString(runtimeContext.Credential.Fields["username"], stringConfig(runtimeContext.Config, "username")),
		Workspace:           stringConfig(runtimeContext.Config, "workspace"),
		PollIntervalSeconds: intConfig(runtimeContext.Config, "poll_interval_seconds"),
		BackfillSince:       stringConfig(runtimeContext.Config, "backfill_since"),
	}
	if config.PollIntervalSeconds <= 0 {
		config.PollIntervalSeconds = 60
	}

	repositories, err := repositoriesFromRuntimeConfig(runtimeContext.Config["repositories"])
	if err != nil {
		return AccountConfig{}, err
	}
	config.Repositories = repositories

	switch {
	case strings.TrimSpace(config.Host) == "":
		return AccountConfig{}, fmt.Errorf("runtime context missing host")
	case strings.TrimSpace(config.Token) == "":
		return AccountConfig{}, fmt.Errorf("runtime context missing token")
	}

	return config, nil
}

func repositoriesFromRuntimeConfig(raw any) ([]Repository, error) {
	if raw == nil {
		return nil, nil
	}
	encoded, err := json.Marshal(raw)
	if err != nil {
		return nil, fmt.Errorf("marshal runtime repositories: %w", err)
	}
	var repositories []Repository
	if err := json.Unmarshal(encoded, &repositories); err != nil {
		return nil, fmt.Errorf("parse runtime repositories: %w", err)
	}
	return repositories, nil
}

func stringConfig(config map[string]any, key string) string {
	if config == nil {
		return ""
	}
	value, ok := config[key]
	if !ok {
		return ""
	}
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
}

func intConfig(config map[string]any, key string) int {
	if config == nil {
		return 0
	}
	value, ok := config[key]
	if !ok {
		return 0
	}
	switch typed := value.(type) {
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	default:
		return 0
	}
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
