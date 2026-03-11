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
	account, err := nexadapter.RequireConnection(account)
	if err != nil {
		return googleCredentials{}, err
	}

	placeID := ""
	apiKey := ""

	// Try runtime context first
	runtimeCtx, ctxErr := nexadapter.LoadRuntimeContextFromEnv()
	if ctxErr == nil && runtimeCtx != nil && runtimeCtx.Credential != nil {
		if strings.TrimSpace(runtimeCtx.ConnectionID) != "" {
			account = runtimeCtx.ConnectionID
		}
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

func fetchPlacesMetrics(ctx context.Context, account string) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
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
	records := buildPlacesMetricRecords(creds.Account, creds.PlaceID, date, details, reviews)
	return records, time.Now(), nil
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

func buildPlacesMetricRecords(
	connectionID string,
	placeID string,
	date string,
	details placeDetailsResponse,
	reviews placeReviewsResponse,
) []nexadapter.AdapterInboundRecord {
	connectionID, err := nexadapter.RequireConnection(connectionID)
	if err != nil {
		nexadapter.LogError("places metric records: %v", err)
		return nil
	}
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

	records := make([]nexadapter.AdapterInboundRecord, 0, len(values))
	for _, metric := range values {
		if metric.Value < 0 {
			continue
		}
		recordID := fmt.Sprintf("%s:%s:%s:%s",
			placesPlatformID, placeToken,
			nexadapter.SafeIDToken(date),
			nexadapter.SafeIDToken(metric.Name))
		record := nexadapter.AdapterInboundRecord{
			Operation: "record.ingest",
			Routing: nexadapter.AdapterInboundRouting{
				Adapter:       adapterName,
				Platform:      placesPlatformID,
				ConnectionID:  connectionID,
				SenderID:      placesPlatformID,
				SenderName:    "Google Business Profile",
				ContainerKind: "group",
				ContainerID:   "metrics",
				ContainerName: "Metrics",
				ThreadID:      placeID,
				ThreadName:    placeID,
			},
			Payload: nexadapter.AdapterInboundPayload{
				ExternalRecordID: recordID,
				Timestamp:        timestamp,
				Content:          fmt.Sprintf("%s=%g", metric.Name, metric.Value),
				ContentType:      "text",
				Metadata: map[string]any{
					"connection_id": connectionID,
					"adapter_id":    placesPlatformID,
					"place_id":      placeID,
					"date":          date,
					"metric_name":   metric.Name,
					"metric_value":  metric.Value,
				},
			},
		}
		records = append(records, record)
	}
	return records
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
