package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	adapterName                  = "gog-places-adapter"
	adapterVersion               = "0.1.0"
	platformID                   = "google-business-profile"
	defaultPlatformCredentialURL = "https://hub.glowbot.com/api/platform-credentials"
	dateLayout                   = "2006-01-02"
)

type adapterRuntimeContext struct {
	AccountID  string `json:"account_id"`
	Credential *struct {
		Value  string            `json:"value"`
		Fields map[string]string `json:"fields"`
	} `json:"credential"`
}

type gogAuthListResponse struct {
	Accounts []struct {
		Email    string   `json:"email"`
		Services []string `json:"services,omitempty"`
	} `json:"accounts"`
}

type placeDetailsResponse struct {
	Place map[string]any `json:"place"`
}

type placeReviewsResponse struct {
	Reviews []map[string]any `json:"reviews"`
}

type placeCredentials struct {
	Account string
	PlaceID string
	APIKey  string
}

func main() {
	nexadapter.Run(nexadapter.Adapter{
		Operations: nexadapter.AdapterOperations{
			AdapterInfo:         info,
			AdapterHealth:       health,
			AdapterAccountsList: accounts,
			EventBackfill:       backfill,
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
		},
		CredentialService: "google",
		MultiAccount:      true,
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
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
					Type:                  "oauth2",
					Label:                 "Connect Google Business Profile",
					Icon:                  "oauth",
					Service:               "google",
					Scopes:                []string{"https://www.googleapis.com/auth/business.manage"},
					PlatformCredentials:   true,
					PlatformCredentialURL: platformCredentialURL(),
				},
				{
					Type:        "file_upload",
					Label:       "Upload CSV / Manual Entry",
					Icon:        "upload",
					Accept:      []string{".csv"},
					TemplateURL: "/templates/gbp-import.csv",
				},
			},
			SetupGuide: "Quick connect uses place_id + gog places API key. Full OAuth flow requires Google Business Profile partner approval.",
		},
		PlatformCapabilities: nexadapter.ChannelCapabilities{
			TextLimit:             20000,
			SupportsMarkdown:      true,
			MarkdownFlavor:        "standard",
			SupportsTables:        false,
			SupportsCodeBlocks:    false,
			SupportsEmbeds:        false,
			SupportsThreads:       false,
			SupportsReactions:     false,
			SupportsPolls:         false,
			SupportsButtons:       false,
			SupportsEdit:          false,
			SupportsDelete:        false,
			SupportsMedia:         false,
			SupportsVoiceNotes:    false,
			SupportsStreamingEdit: false,
		},
	}, nil
}

func platformCredentialURL() string {
	if v := strings.TrimSpace(os.Getenv("NEXUS_PLATFORM_CREDENTIAL_URL")); v != "" { //nolint:gosec // config
		return v
	}
	return defaultPlatformCredentialURL
}

func accounts(ctx context.Context) ([]nexadapter.AdapterAccount, error) {
	out, err := runGogJSON(ctx, "", "auth", "list")
	if err != nil {
		return []nexadapter.AdapterAccount{
			{
				ID:          "default",
				DisplayName: "default",
				Status:      "ready",
			},
		}, nil
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
		if len(account.Services) > 0 && !containsService(account.Services, "places") {
			continue
		}
		result = append(result, nexadapter.AdapterAccount{
			ID:            email,
			DisplayName:   email,
			CredentialRef: fmt.Sprintf("google/%s", email),
			Status:        "ready",
		})
	}
	if len(result) == 0 {
		result = append(result, nexadapter.AdapterAccount{
			ID:          "default",
			DisplayName: "default",
			Status:      "ready",
		})
	}
	return result, nil
}

func containsService(services []string, target string) bool {
	for _, service := range services {
		if strings.EqualFold(strings.TrimSpace(service), target) {
			return true
		}
	}
	return false
}

func health(ctx context.Context, account string) (*nexadapter.AdapterHealth, error) {
	creds, err := resolvePlaceCredentials(account)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   fallbackAccount(account),
			Error:     err.Error(),
		}, nil
	}

	details, err := fetchPlaceDetails(ctx, creds)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected: false,
			Account:   creds.Account,
			Error:     err.Error(),
		}, nil
	}

	return &nexadapter.AdapterHealth{
		Connected:   true,
		Account:     creds.Account,
		LastEventAt: time.Now().UnixMilli(),
		Details: map[string]any{
			"place_id":     creds.PlaceID,
			"rating":       floatFromAny(details.Place["rating"]),
			"review_count": intFromAny(details.Place["userRatingCount"]),
		},
	}, nil
}

func backfill(ctx context.Context, account string, _ time.Time, emit nexadapter.EmitFunc) error {
	creds, err := resolvePlaceCredentials(account)
	if err != nil {
		return err
	}

	details, err := fetchPlaceDetails(ctx, creds)
	if err != nil {
		return err
	}
	reviews, err := fetchPlaceReviews(ctx, creds)
	if err != nil {
		return err
	}

	date := time.Now().UTC().Format(dateLayout)
	for _, event := range buildPlacesMetricEvents(creds.Account, creds.PlaceID, date, details, reviews) {
		emit(event)
	}

	return nil
}

func buildPlacesMetricEvents(
	account string,
	placeID string,
	date string,
	details placeDetailsResponse,
	reviews placeReviewsResponse,
) []nexadapter.NexusEvent {
	account = fallbackAccount(account)
	placeToken := sanitizeToken(placeID)
	timestamp := metricTimestampMs(date)
	rating := floatFromAny(details.Place["rating"])
	reviewCount := float64(intFromAny(details.Place["userRatingCount"]))
	reviewSampleCount := float64(len(reviews.Reviews))

	type metricValue struct {
		Name  string
		Value float64
	}
	values := []metricValue{
		{Name: "reviews_count", Value: reviewCount},
		{Name: "reviews_rating_avg", Value: rating},
		{Name: "reviews_new", Value: reviewSampleCount},
	}

	events := make([]nexadapter.NexusEvent, 0, len(values))
	for _, metric := range values {
		if metric.Value < 0 {
			continue
		}
		eventID := fmt.Sprintf("%s:%s:%s:%s", platformID, placeToken, sanitizeToken(date), sanitizeToken(metric.Name))
		event := nexadapter.
			NewEvent(platformID, eventID).
			WithTimestampUnixMs(timestamp).
			WithContent(fmt.Sprintf("%s=%g", metric.Name, metric.Value)).
			WithContentType("text").
			WithSender(platformID, "Google Business Profile").
			WithContainer("metrics", "channel").
			WithAccount(account).
			WithMetadata("adapter_id", platformID).
			WithMetadata("place_id", placeID).
			WithMetadata("date", date).
			WithMetadata("metric_name", metric.Name).
			WithMetadata("metric_value", metric.Value).
			Build()
		events = append(events, event)
	}
	return events
}

func fetchPlaceDetails(ctx context.Context, creds placeCredentials) (placeDetailsResponse, error) {
	args := []string{
		"places",
		"details",
		creds.PlaceID,
		"--fields",
		"id,displayName,rating,userRatingCount",
	}
	if creds.APIKey != "" {
		args = append(args, "--api-key", creds.APIKey)
	}
	out, err := runGogJSON(ctx, "", args...)
	if err != nil {
		return placeDetailsResponse{}, err
	}

	var resp placeDetailsResponse
	if err := json.Unmarshal(out, &resp); err != nil {
		return placeDetailsResponse{}, fmt.Errorf("parse gog places details response: %w", err)
	}
	if resp.Place == nil {
		return placeDetailsResponse{}, errors.New("gog places details response missing place object")
	}
	return resp, nil
}

func fetchPlaceReviews(ctx context.Context, creds placeCredentials) (placeReviewsResponse, error) {
	args := []string{
		"places",
		"reviews",
		creds.PlaceID,
	}
	if creds.APIKey != "" {
		args = append(args, "--api-key", creds.APIKey)
	}
	out, err := runGogJSON(ctx, "", args...)
	if err != nil {
		return placeReviewsResponse{}, err
	}

	var resp placeReviewsResponse
	if err := json.Unmarshal(out, &resp); err != nil {
		return placeReviewsResponse{}, fmt.Errorf("parse gog places reviews response: %w", err)
	}
	return resp, nil
}

func resolvePlaceCredentials(account string) (placeCredentials, error) {
	account = fallbackAccount(account)
	placeID := ""
	apiKey := ""

	ctx, err := loadRuntimeContext()
	if err != nil {
		return placeCredentials{}, err
	}
	if ctx != nil && ctx.Credential != nil {
		placeID = firstNonBlank(
			fieldValue(ctx.Credential.Fields, "place_id"),
			fieldValue(ctx.Credential.Fields, "placeId"),
		)
		apiKey = firstNonBlank(
			fieldValue(ctx.Credential.Fields, "api_key"),
			fieldValue(ctx.Credential.Fields, "apikey"),
			fieldValue(ctx.Credential.Fields, "key"),
		)
	}

	placeID = firstNonBlank(placeID, os.Getenv("NEXUS_GOG_PLACE_ID"))
	apiKey = firstNonBlank(apiKey, os.Getenv("NEXUS_GOG_PLACES_API_KEY"))

	if strings.TrimSpace(placeID) == "" {
		return placeCredentials{}, errors.New("missing place_id credential field")
	}

	return placeCredentials{
		Account: account,
		PlaceID: strings.TrimSpace(placeID),
		APIKey:  strings.TrimSpace(apiKey),
	}, nil
}

func fieldValue(fields map[string]string, key string) string {
	if fields == nil {
		return ""
	}
	return strings.TrimSpace(fields[key])
}

func loadRuntimeContext() (*adapterRuntimeContext, error) {
	contextPath := strings.TrimSpace(os.Getenv("NEXUS_ADAPTER_CONTEXT_PATH")) //nolint:gosec // runtime-provided env var
	if contextPath == "" {
		return nil, nil
	}

	raw, err := os.ReadFile(contextPath) //nolint:gosec // runtime-provided file path
	if err != nil {
		return nil, fmt.Errorf("read adapter runtime context: %w", err)
	}

	var ctx adapterRuntimeContext
	if err := json.Unmarshal(raw, &ctx); err != nil {
		return nil, fmt.Errorf("parse adapter runtime context: %w", err)
	}
	return &ctx, nil
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func floatFromAny(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case int32:
		return float64(typed)
	default:
		return 0
	}
}

func intFromAny(value any) int64 {
	switch typed := value.(type) {
	case int:
		return int64(typed)
	case int64:
		return typed
	case int32:
		return int64(typed)
	case float64:
		return int64(typed)
	case float32:
		return int64(typed)
	default:
		return 0
	}
}

func metricTimestampMs(isoDay string) int64 {
	parsed, err := time.Parse(dateLayout, strings.TrimSpace(isoDay))
	if err != nil {
		return time.Now().UnixMilli()
	}
	return parsed.Add(12 * time.Hour).UnixMilli()
}

func sanitizeToken(raw string) string {
	trimmed := strings.TrimSpace(strings.ToLower(raw))
	if trimmed == "" {
		return "na"
	}
	var b strings.Builder
	for _, ch := range trimmed {
		switch {
		case ch >= 'a' && ch <= 'z':
			b.WriteRune(ch)
		case ch >= '0' && ch <= '9':
			b.WriteRune(ch)
		case ch == '-', ch == '_', ch == '.':
			b.WriteRune(ch)
		default:
			b.WriteByte('-')
		}
	}
	token := strings.Trim(b.String(), "-._")
	if token == "" {
		return "na"
	}
	return token
}

func fallbackAccount(account string) string {
	value := strings.TrimSpace(strings.ToLower(account))
	if value == "" {
		return "default"
	}
	return value
}

func gogCommand() string {
	if v := strings.TrimSpace(os.Getenv("NEXUS_GOG_COMMAND")); v != "" { //nolint:gosec // config
		return v
	}
	return "gog"
}

func runGogJSON(ctx context.Context, account string, args ...string) ([]byte, error) {
	base := []string{"--json"}
	if trimmed := strings.TrimSpace(account); trimmed != "" {
		base = append(base, "--account", trimmed)
	}
	full := append(base, args...)

	cmd := exec.CommandContext(ctx, gogCommand(), full...) //nolint:gosec // command is user-configurable
	cmd.Env = os.Environ()

	out, err := cmd.Output()
	if err == nil {
		return out, nil
	}

	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		stderr := strings.TrimSpace(string(exitErr.Stderr))
		if stderr == "" {
			stderr = "no stderr"
		}
		return nil, fmt.Errorf("gog %s failed: %s", strings.Join(args, " "), stderr)
	}
	return nil, err
}
