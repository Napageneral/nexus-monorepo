package main

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"

	"github.com/nexus-project/adapter-confluence/internal/atlassian"
	"github.com/nexus-project/adapter-confluence/internal/backfill"
	"github.com/nexus-project/adapter-confluence/internal/config"
	"github.com/nexus-project/adapter-confluence/internal/delivery"
	"github.com/nexus-project/adapter-confluence/internal/monitor"
	"github.com/nexus-project/adapter-confluence/internal/record"
	"github.com/nexus-project/adapter-confluence/internal/storage"
)

const (
	adapterName    = "Confluence Cloud"
	adapterVersion = "0.1.0"
	platformID     = "confluence"
	serviceID      = "atlassian"
)

func main() {
	nexadapter.Run(nexadapter.Adapter{
		Operations: nexadapter.AdapterOperations{
			AdapterInfo:         info,
			AdapterHealth:       health,
			AdapterAccountsList: accounts,
			AdapterSetupStart:   setupStart,
			AdapterSetupSubmit:  setupSubmit,
			AdapterSetupStatus:  setupStatus,
			AdapterSetupCancel:  setupCancel,
			AdapterMonitorStart: monitorStart,
			EventBackfill:       backfillRun,
			DeliverySend:        send,
			DeliveryDelete:      deleteDelivery,
		},
	})
}

func info(_ context.Context) (*nexadapter.AdapterInfo, error) {
	return &nexadapter.AdapterInfo{
		Platform: platformID,
		Name:     adapterName,
		Version:  adapterVersion,
		Operations: []nexadapter.AdapterOperation{
			nexadapter.OpAdapterInfo,
			nexadapter.OpAdapterHealth,
			nexadapter.OpAdapterAccountsList,
			nexadapter.OpAdapterSetupStart,
			nexadapter.OpAdapterSetupSubmit,
			nexadapter.OpAdapterSetupStatus,
			nexadapter.OpAdapterSetupCancel,
			nexadapter.OpAdapterMonitorStart,
			nexadapter.OpEventBackfill,
			nexadapter.OpDeliverySend,
			nexadapter.OpDeliveryDelete,
		},
		CredentialService: serviceID,
		MultiAccount:      true,
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					ID:      "atlassian_api_key",
					Type:    "api_key",
					Label:   "Atlassian API Token",
					Icon:    "confluence",
					Service: serviceID,
					Fields:  credentialFields(),
				},
			},
			SetupGuide: tokenGuide,
		},
		PlatformCapabilities: nexadapter.ChannelCapabilities{
			TextLimit:             0,
			SupportsMarkdown:      true,
			MarkdownFlavor:        "standard",
			SupportsTables:        true,
			SupportsCodeBlocks:    true,
			SupportsEmbeds:        false,
			SupportsThreads:       false,
			SupportsReactions:     false,
			SupportsPolls:         false,
			SupportsButtons:       false,
			SupportsEdit:          true,
			SupportsDelete:        true,
			SupportsMedia:         false,
			SupportsVoiceNotes:    false,
			SupportsStreamingEdit: false,
		},
	}, nil
}

func accounts(_ context.Context) ([]nexadapter.AdapterAccount, error) {
	store, err := config.NewStore("")
	if err != nil {
		return nil, err
	}

	cfg, err := store.Load()
	if err != nil {
		return nil, err
	}

	keys := make([]string, 0, len(cfg.Accounts))
	for key := range cfg.Accounts {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	result := make([]nexadapter.AdapterAccount, 0, len(keys))
	for _, key := range keys {
		account := cfg.Accounts[key]
		displayName := strings.TrimSpace(account.SiteURL)
		if displayName == "" {
			displayName = strings.TrimSpace(account.Site)
		}
		result = append(result, nexadapter.AdapterAccount{
			ID:            account.ID,
			DisplayName:   displayName,
			CredentialRef: fmt.Sprintf("%s/%s", serviceID, strings.TrimSpace(account.Email)),
			Status:        "ready",
		})
	}

	return result, nil
}

func health(ctx context.Context, account string) (*nexadapter.AdapterHealth, error) {
	cfg, err := loadAccountConfig(account)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   fallbackAccountID(account),
			Error:     err.Error(),
		}, nil
	}

	client := atlassian.NewClient(cfg.Site, cfg.Email, cfg.APIToken)
	spaces, err := client.ListSpaces(ctx, 1)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   cfg.ID,
			Error:     humanizeHealthError(err),
			Details: map[string]any{
				"site": cfg.SiteURL,
			},
		}, nil
	}

	return &nexadapter.AdapterHealth{
		Connected:   true,
		Account:     cfg.ID,
		LastEventAt: time.Now().UnixMilli(),
		Details: map[string]any{
			"site":              cfg.SiteURL,
			"spaces_accessible": len(spaces),
		},
	}, nil
}

func monitorStart(ctx context.Context, account string, emit nexadapter.EmitFunc) error {
	cfg, dataDir, client, err := runtimeServices(account)
	if err != nil {
		return err
	}
	return monitor.New(
		client,
		*cfg,
		storage.NewPageStore(dataDir),
		monitor.NewWatermarkStore(dataDir),
		record.NewUserCache(),
	).Handler()(ctx, cfg.ID, emit)
}

func backfillRun(ctx context.Context, account string, since time.Time, emit nexadapter.EmitFunc) error {
	cfg, dataDir, client, err := runtimeServices(account)
	if err != nil {
		return err
	}
	return backfill.New(
		client,
		*cfg,
		storage.NewPageStore(dataDir),
		record.NewUserCache(),
	).Handler()(ctx, cfg.ID, since, emit)
}

func send(ctx context.Context, req nexadapter.SendRequest) (*nexadapter.DeliveryResult, error) {
	cfg, _, client, err := runtimeServices(req.Account)
	if err != nil {
		return nil, err
	}
	return delivery.New(client, *cfg).Handler()(ctx, req)
}

func deleteDelivery(ctx context.Context, req nexadapter.DeleteRequest) (*nexadapter.DeliveryResult, error) {
	cfg, _, client, err := runtimeServices(req.Account)
	if err != nil {
		return nil, err
	}
	return delivery.New(client, *cfg).DeleteHandler()(ctx, req)
}

func runtimeServices(account string) (*config.AccountConfig, string, *atlassian.Client, error) {
	cfg, err := loadAccountConfig(account)
	if err != nil {
		return nil, "", nil, err
	}
	dataDir, err := config.ResolveStateDir()
	if err != nil {
		return nil, "", nil, err
	}
	return cfg, dataDir, atlassian.NewClient(cfg.Site, cfg.Email, cfg.APIToken), nil
}
