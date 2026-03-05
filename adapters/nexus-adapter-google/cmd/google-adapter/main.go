package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	adapterName                  = "google-adapter"
	adapterVersion               = "0.1.0"
	platformID                   = "google"
	defaultPlatformCredentialURL = "https://hub.glowbot.com/api/platform-credentials"
)

func main() {
	nexadapter.Run(nexadapter.Adapter{
		Operations: nexadapter.AdapterOperations{
			AdapterInfo:         info,
			AdapterHealth:       health,
			AdapterAccountsList: accounts,
			EventBackfill:       backfill,
			AdapterMonitorStart: monitor,
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
			nexadapter.OpEventBackfill,
			nexadapter.OpAdapterMonitorStart,
		},
		CredentialService: "google",
		MultiAccount:      true,
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					Type:    "oauth2",
					Label:   "Connect with Google",
					Icon:    "oauth",
					Service: "google",
					Scopes: []string{
						"https://www.googleapis.com/auth/adwords.readonly",
						"https://www.googleapis.com/auth/business.manage",
					},
					PlatformCredentials:   true,
					PlatformCredentialURL: nexadapter.PlatformCredentialURL(defaultPlatformCredentialURL),
				},
				{
					Type:    "api_key",
					Label:   "Quick Connect (Places API)",
					Icon:    "key",
					Service: "google",
					Fields: []nexadapter.AdapterAuthField{
						{
							Name:        "place_id",
							Label:       "Google Place ID",
							Type:        "text",
							Required:    true,
							Placeholder: "ChIJN1t_tDeuEmsRUsoyG83frY4",
						},
					},
				},
				{
					Type:        "file_upload",
					Label:       "Upload CSV Export",
					Icon:        "upload",
					Accept:      []string{".csv"},
					TemplateURL: "/templates/google-import.csv",
				},
			},
			SetupGuide: "Connect with Google to sync Ads campaigns and Business Profile data. Quick Connect uses a Place ID for reviews/ratings only.",
		},
		PlatformCapabilities: nexadapter.ChannelCapabilities{
			TextLimit:        20000,
			SupportsMarkdown: true,
			MarkdownFlavor:   "standard",
		},
	}, nil
}

func accounts(ctx context.Context) ([]nexadapter.AdapterAccount, error) {
	// Discover accounts that have ads or places services
	out, err := runGogJSON(ctx, "", "auth", "list")
	if err != nil {
		// If gog auth fails, check for API-key-only places config
		creds, credErr := resolvePlaceCredentials("default")
		if credErr == nil && creds.PlaceID != "" {
			return []nexadapter.AdapterAccount{
				{ID: "default", DisplayName: "default (Places API)", Status: "ready"},
			}, nil
		}
		return nil, err
	}

	var resp gogAuthListResponse
	if err := json.Unmarshal(out, &resp); err != nil {
		return nil, fmt.Errorf("parse gog auth list: %w", err)
	}

	result := make([]nexadapter.AdapterAccount, 0, len(resp.Accounts))
	for _, account := range resp.Accounts {
		email := strings.ToLower(strings.TrimSpace(account.Email))
		if email == "" {
			continue
		}
		hasAds := containsService(account.Services, "ads")
		hasPlaces := containsService(account.Services, "places")
		if len(account.Services) > 0 && !hasAds && !hasPlaces {
			continue
		}
		result = append(result, nexadapter.AdapterAccount{
			ID:            email,
			DisplayName:   email,
			CredentialRef: fmt.Sprintf("google/%s", email),
			Status:        "ready",
		})
	}

	return result, nil
}

func health(ctx context.Context, account string) (*nexadapter.AdapterHealth, error) {
	details := map[string]any{}
	anyConnected := false

	// Check ads service
	adsOk, adsDetails := adsHealth(ctx, account)
	details["ads"] = map[string]any{"connected": adsOk}
	for k, v := range adsDetails {
		details["ads_"+k] = v
	}
	if adsOk {
		anyConnected = true
	}

	// Check places service
	creds, credErr := resolvePlaceCredentials(account)
	if credErr == nil {
		placesOk, placesDetails := placesHealth(ctx, creds)
		details["places"] = map[string]any{"connected": placesOk}
		for k, v := range placesDetails {
			details["places_"+k] = v
		}
		if placesOk {
			anyConnected = true
		}
	} else {
		details["places"] = map[string]any{"connected": false, "error": credErr.Error()}
	}

	displayAccount := strings.TrimSpace(account)
	if displayAccount == "" {
		displayAccount = "default"
	}

	h := &nexadapter.AdapterHealth{
		Connected: anyConnected,
		Account:   displayAccount,
		Details:   details,
	}
	if anyConnected {
		h.LastEventAt = time.Now().UnixMilli()
	}
	if !anyConnected {
		h.Error = "neither Google Ads nor Google Business Profile could connect"
	}

	return h, nil
}

func backfill(ctx context.Context, account string, since time.Time, emit nexadapter.EmitFunc) error {
	// Backfill ads (date-range based)
	adsEvents, _, adsErr := fetchAdsMetricsSince(ctx, account, since)
	if adsErr != nil {
		nexadapter.LogInfo("ads backfill skipped: %v", adsErr)
	} else {
		for _, event := range adsEvents {
			emit(event)
		}
		nexadapter.LogInfo("ads backfill emitted %d events", len(adsEvents))
	}

	// Backfill places (snapshot-based, ignores since)
	placesEvents, _, placesErr := fetchPlacesMetrics(ctx, account)
	if placesErr != nil {
		nexadapter.LogInfo("places backfill skipped: %v", placesErr)
	} else {
		for _, event := range placesEvents {
			emit(event)
		}
		nexadapter.LogInfo("places backfill emitted %d events", len(placesEvents))
	}

	// If both failed, return an error
	if adsErr != nil && placesErr != nil {
		return fmt.Errorf("all services failed — ads: %v; places: %v", adsErr, placesErr)
	}
	return nil
}

func monitor(ctx context.Context, account string, emit nexadapter.EmitFunc) error {
	// Run ads and places monitors concurrently.
	// Each runs independently — one failing doesn't crash the other.
	var wg sync.WaitGroup
	errCh := make(chan error, 2)

	// Ads monitor: 6h interval
	wg.Add(1)
	go func() {
		defer wg.Done()
		err := nexadapter.PollMonitor(nexadapter.PollConfig{
			Interval: 6 * time.Hour,
			Fetch: func(ctx context.Context, since time.Time) ([]nexadapter.NexusEvent, time.Time, error) {
				return fetchAdsMetricsSince(ctx, account, since)
			},
			MaxConsecutiveErrors: 5,
		})(ctx, account, emit)
		if err != nil {
			nexadapter.LogError("ads monitor stopped: %v", err)
			errCh <- fmt.Errorf("ads monitor: %w", err)
		}
	}()

	// Places monitor: 24h interval
	wg.Add(1)
	go func() {
		defer wg.Done()
		err := nexadapter.PollMonitor(nexadapter.PollConfig{
			Interval: 24 * time.Hour,
			Fetch: func(ctx context.Context, _ time.Time) ([]nexadapter.NexusEvent, time.Time, error) {
				return fetchPlacesMetrics(ctx, account)
			},
			MaxConsecutiveErrors: 5,
		})(ctx, account, emit)
		if err != nil {
			nexadapter.LogError("places monitor stopped: %v", err)
			errCh <- fmt.Errorf("places monitor: %w", err)
		}
	}()

	// Wait for both to finish (on context cancellation or max errors)
	wg.Wait()
	close(errCh)

	// Collect errors
	var errs []string
	for err := range errCh {
		errs = append(errs, err.Error())
	}
	if len(errs) > 0 {
		return fmt.Errorf("monitor errors: %s", strings.Join(errs, "; "))
	}
	return nil
}
