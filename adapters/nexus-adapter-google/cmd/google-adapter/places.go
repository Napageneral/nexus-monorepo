package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const placesPlatformID = "google-business-profile"

// --- Places API response types ---

type placeDetailsResponse struct {
	Place map[string]any `json:"place"`
}

type placeReviewsResponse struct {
	Reviews []map[string]any `json:"reviews"`
}

// googleCredentials holds resolved credentials for both Google services.
type googleCredentials struct {
	Account string
	PlaceID string
	APIKey  string
}

// --- Places health check ---

func placesHealth(ctx context.Context, creds googleCredentials) (bool, map[string]any) {
	if creds.PlaceID == "" {
		return false, map[string]any{"error": "no place_id configured"}
	}

	details, err := fetchPlaceDetails(ctx, creds)
	if err != nil {
		return false, map[string]any{"error": err.Error()}
	}

	return true, map[string]any{
		"place_id":     creds.PlaceID,
		"rating":       floatFromAny(details.Place["rating"]),
		"review_count": intFromAny(details.Place["userRatingCount"]),
	}
}

// --- Places credential resolution ---

func resolvePlaceCredentials(account string) (googleCredentials, error) {
	account, err := nexadapter.RequireAccount(account)
	if err != nil {
		// Places can work with just a place_id and no account context,
		// so we allow empty account if place_id is available.
		account = "default"
	}

	placeID := ""
	apiKey := ""

	// Try runtime context first
	runtimeCtx, ctxErr := nexadapter.LoadRuntimeContextFromEnv()
	if ctxErr == nil && runtimeCtx != nil && runtimeCtx.Credential != nil {
		placeID = nexadapter.FirstNonBlank(
			nexadapter.FieldValue(runtimeCtx.Credential.Fields, "place_id"),
			nexadapter.FieldValue(runtimeCtx.Credential.Fields, "placeId"),
		)
		apiKey = nexadapter.FirstNonBlank(
			nexadapter.FieldValue(runtimeCtx.Credential.Fields, "api_key"),
			nexadapter.FieldValue(runtimeCtx.Credential.Fields, "apikey"),
			nexadapter.FieldValue(runtimeCtx.Credential.Fields, "key"),
		)
	}

	// Env var fallbacks
	placeID = nexadapter.FirstNonBlank(placeID, os.Getenv("NEXUS_GOG_PLACE_ID"))
	apiKey = nexadapter.FirstNonBlank(apiKey, os.Getenv("NEXUS_GOG_PLACES_API_KEY"))

	if strings.TrimSpace(placeID) == "" {
		return googleCredentials{}, errors.New("missing place_id credential field")
	}

	return googleCredentials{
		Account: account,
		PlaceID: strings.TrimSpace(placeID),
		APIKey:  strings.TrimSpace(apiKey),
	}, nil
}

// --- Places data fetching ---

func fetchPlacesMetrics(ctx context.Context, account string) ([]nexadapter.NexusEvent, time.Time, error) {
	creds, err := resolvePlaceCredentials(account)
	if err != nil {
		return nil, time.Time{}, err
	}

	details, err := fetchPlaceDetails(ctx, creds)
	if err != nil {
		return nil, time.Time{}, err
	}
	reviews, err := fetchPlaceReviews(ctx, creds)
	if err != nil {
		return nil, time.Time{}, err
	}

	date := time.Now().UTC().Format("2006-01-02")
	events := buildPlacesMetricEvents(creds.Account, creds.PlaceID, date, details, reviews)
	return events, time.Now(), nil
}

func fetchPlaceDetails(ctx context.Context, creds googleCredentials) (placeDetailsResponse, error) {
	args := []string{
		"places", "details", creds.PlaceID,
		"--fields", "id,displayName,rating,userRatingCount",
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

func fetchPlaceReviews(ctx context.Context, creds googleCredentials) (placeReviewsResponse, error) {
	args := []string{"places", "reviews", creds.PlaceID}
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

func buildPlacesMetricEvents(
	account string,
	placeID string,
	date string,
	details placeDetailsResponse,
	reviews placeReviewsResponse,
) []nexadapter.NexusEvent {
	placeToken := nexadapter.SafeIDToken(placeID)
	timestamp := nexadapter.MetricTimestamp(date, nil)
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
		eventID := fmt.Sprintf("%s:%s:%s:%s",
			placesPlatformID, placeToken,
			nexadapter.SafeIDToken(date),
			nexadapter.SafeIDToken(metric.Name))
		event := nexadapter.
			NewEvent(placesPlatformID, eventID).
			WithTimestampUnixMs(timestamp).
			WithContent(fmt.Sprintf("%s=%g", metric.Name, metric.Value)).
			WithContentType("text").
			WithSender(placesPlatformID, "Google Business Profile").
			WithContainer("metrics", "channel").
			WithAccount(account).
			WithMetadata("adapter_id", placesPlatformID).
			WithMetadata("place_id", placeID).
			WithMetadata("date", date).
			WithMetadata("metric_name", metric.Name).
			WithMetadata("metric_value", metric.Value).
			Build()
		events = append(events, event)
	}
	return events
}

// --- Type conversion helpers (for untyped JSON responses) ---

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
	case float64:
		return int64(typed)
	default:
		return 0
	}
}
