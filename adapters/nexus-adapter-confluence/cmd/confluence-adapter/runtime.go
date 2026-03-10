package main

import (
	"errors"
	"fmt"
	"strings"

	nexadapter "github.com/nexus-project/adapter-sdk-go"

	"github.com/nexus-project/adapter-confluence/internal/atlassian"
	"github.com/nexus-project/adapter-confluence/internal/config"
)

func loadAccountConfig(account string) (*config.AccountConfig, error) {
	if runtimeCfg, err := loadAccountFromRuntime(account); err == nil {
		return runtimeCfg, nil
	}

	store, err := config.NewStore("")
	if err != nil {
		return nil, err
	}

	cfg, err := store.Load()
	if err != nil {
		return nil, err
	}

	accountID := fallbackAccountID(account)
	if accountID == "default" && len(cfg.Accounts) == 1 {
		for _, stored := range cfg.Accounts {
			copy := stored
			return &copy, nil
		}
	}

	stored, ok := cfg.Accounts[accountID]
	if !ok {
		return nil, fmt.Errorf("unknown Confluence account %q", accountID)
	}
	copy := stored
	return &copy, nil
}

func loadAccountFromRuntime(account string) (*config.AccountConfig, error) {
	runtimeCtx, err := nexadapter.LoadRuntimeContextFromEnv()
	if err != nil {
		return nil, err
	}
	if runtimeCtx.Credential == nil {
		return nil, errors.New("missing runtime credential")
	}

	fields := runtimeCtx.Credential.Fields
	email := strings.TrimSpace(fields["email"])
	if email == "" {
		email = strings.TrimSpace(fields["username"])
	}
	apiToken := strings.TrimSpace(fields["api_token"])
	site := strings.TrimSpace(fields["site"])
	if email == "" || apiToken == "" || site == "" {
		return nil, errors.New("runtime credential missing one of email, api_token, or site")
	}

	accountID := strings.TrimSpace(runtimeCtx.ConnectionID)
	if accountID == "" {
		accountID = fallbackAccountID(account)
	}

	return &config.AccountConfig{
		ID:              accountID,
		Email:           email,
		APIToken:        apiToken,
		Site:            normalizeSite(site),
		SiteURL:         siteURL(site),
		SiteDisplayName: siteDisplayNameFromSlug(site),
		Spaces:          runtimeSpaces(runtimeCtx.Config),
		Sync:            runtimeSyncConfig(runtimeCtx.Config),
	}, nil
}

func humanizeHealthError(err error) string {
	var statusErr *atlassian.StatusError
	if errors.As(err, &statusErr) {
		switch statusErr.StatusCode {
		case 401:
			return "authentication failed: 401 Unauthorized"
		case 403:
			return "authentication failed: 403 Forbidden"
		}
		return statusErr.Error()
	}
	return err.Error()
}

func runtimeSpaces(raw map[string]any) []config.SpaceOption {
	if raw == nil {
		return nil
	}
	spacesRaw, ok := raw["spaces"]
	if !ok {
		return nil
	}

	items, ok := spacesRaw.([]any)
	if !ok {
		return nil
	}

	out := make([]config.SpaceOption, 0, len(items))
	for _, item := range items {
		switch value := item.(type) {
		case string:
			trimmed := strings.TrimSpace(value)
			if trimmed == "" {
				continue
			}
			out = append(out, config.SpaceOption{Key: trimmed, Name: trimmed})
		case map[string]any:
			key := stringValue(value["key"])
			if key == "" {
				continue
			}
			out = append(out, config.SpaceOption{
				ID:    stringValue(value["id"]),
				Key:   key,
				Name:  stringValue(value["name"]),
				Label: stringValue(value["label"]),
			})
		}
	}
	return out
}

func runtimeSyncConfig(raw map[string]any) config.SyncConfig {
	cfg := config.DefaultSyncConfig()
	if raw == nil {
		return cfg
	}

	syncRaw, ok := raw["sync"].(map[string]any)
	if !ok {
		return cfg
	}
	if value, ok := syncRaw["pages"].(bool); ok {
		cfg.Pages = value
	}
	if value, ok := syncRaw["page_content"].(bool); ok {
		cfg.PageContent = value
	}
	if value, ok := syncRaw["labels"].(bool); ok {
		cfg.Labels = value
	}
	if value, ok := syncRaw["versions"].(bool); ok {
		cfg.Versions = value
	}
	return cfg
}

func stringValue(raw any) string {
	value, _ := raw.(string)
	return strings.TrimSpace(value)
}
