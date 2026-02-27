package main

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	adapterName    = "apple-maps-adapter"
	adapterVersion = "0.1.0"
	platformID     = "apple-maps"
	dateLayout     = "2006-01-02"
)

type manualMetric struct {
	Date   string
	Name   string
	Value  float64
	Source string
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
		CredentialService: "apple-maps",
		MultiAccount:      true,
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					Type:        "file_upload",
					Label:       "Upload CSV / Manual Entry",
					Icon:        "upload",
					Accept:      []string{".csv"},
					TemplateURL: "/templates/apple-maps-import.csv",
				},
			},
			SetupGuide: "Apple Maps runs in manual/CSV mode for this integration path.",
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

func accounts(_ context.Context) ([]nexadapter.AdapterAccount, error) {
	return []nexadapter.AdapterAccount{
		{
			ID:            "default",
			DisplayName:   "default",
			CredentialRef: "apple-maps/default",
			Status:        "ready",
		},
	}, nil
}

func health(_ context.Context, account string) (*nexadapter.AdapterHealth, error) {
	return &nexadapter.AdapterHealth{
		Connected:   true,
		Account:     fallbackAccount(account),
		LastEventAt: time.Now().UnixMilli(),
		Details: map[string]any{
			"mode": "manual_csv",
		},
	}, nil
}

func backfill(_ context.Context, account string, since time.Time, emit nexadapter.EmitFunc) error {
	_ = since
	for _, metric := range resolveManualMetrics() {
		eventID := strings.Join(
			[]string{
				platformID,
				sanitizeToken(fallbackAccount(account)),
				sanitizeToken(metric.Date),
				sanitizeToken(metric.Name),
			},
			":",
		)
		event := nexadapter.
			NewEvent(platformID, eventID).
			WithTimestampUnixMs(metricTimestampMs(metric.Date)).
			WithContent(fmt.Sprintf("%s=%g", metric.Name, metric.Value)).
			WithContentType("text").
			WithSender(platformID, "Apple Maps").
			WithContainer("metrics", "channel").
			WithAccount(fallbackAccount(account)).
			WithMetadata("adapter_id", platformID).
			WithMetadata("metric_name", metric.Name).
			WithMetadata("metric_value", metric.Value).
			WithMetadata("date", metric.Date).
			WithMetadata("source", metric.Source).
			Build()
		emit(event)
	}
	return nil
}

func resolveManualMetrics() []manualMetric {
	date := firstNonBlank(
		strings.TrimSpace(os.Getenv("NEXUS_APPLE_MAPS_DATE")),
		time.Now().UTC().Format(dateLayout),
	)

	metrics := make([]manualMetric, 0, 3)
	for _, definition := range []struct {
		name   string
		envVar string
	}{
		{name: "reviews_count", envVar: "NEXUS_APPLE_MAPS_REVIEWS_COUNT"},
		{name: "reviews_rating_avg", envVar: "NEXUS_APPLE_MAPS_REVIEWS_RATING_AVG"},
		{name: "reviews_new", envVar: "NEXUS_APPLE_MAPS_REVIEWS_NEW"},
	} {
		value := parseFloat(os.Getenv(definition.envVar))
		if value < 0 {
			continue
		}
		if value == 0 {
			continue
		}
		metrics = append(metrics, manualMetric{
			Date:   date,
			Name:   definition.name,
			Value:  value,
			Source: "manual_env",
		})
	}
	return metrics
}

func parseFloat(raw string) float64 {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return 0
	}
	value, err := strconv.ParseFloat(trimmed, 64)
	if err != nil {
		return 0
	}
	return value
}

func metricTimestampMs(isoDay string) int64 {
	parsed, err := time.Parse(dateLayout, strings.TrimSpace(isoDay))
	if err != nil {
		return time.Now().UnixMilli()
	}
	return parsed.Add(12 * time.Hour).UnixMilli()
}

func fallbackAccount(account string) string {
	value := strings.TrimSpace(strings.ToLower(account))
	if value == "" {
		return "default"
	}
	return value
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
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
