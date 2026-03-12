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
	nexadapter.Run(nexadapter.DefineAdapter(adapterConfig()))
}

func adapterConfig() nexadapter.DefineAdapterConfig[struct{}] {
	return nexadapter.DefineAdapterConfig[struct{}]{
		Platform: platformID,
		Name:     adapterName,
		Version:  adapterVersion,
		Connection: nexadapter.ConnectionHandlers[struct{}]{
			Accounts: func(ctx nexadapter.AdapterContext[struct{}]) ([]nexadapter.AdapterAccount, error) {
				return accounts(ctx.Context)
			},
			Health: func(ctx nexadapter.AdapterContext[struct{}]) (*nexadapter.AdapterHealth, error) {
				return health(ctx.Context, ctx.ConnectionID)
			},
		},
		Ingest: nexadapter.IngestHandlers[struct{}]{
			Backfill: func(ctx nexadapter.AdapterContext[struct{}], since time.Time, emit nexadapter.EmitFunc) error {
				return backfill(ctx.Context, ctx.ConnectionID, since, emit)
			},
		},
		Methods:           map[string]nexadapter.DeclaredMethod[struct{}]{},
		CredentialService: "apple-maps",
		MultiAccount:      true,
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					ID:          "apple_maps_csv_upload",
					Type:        "file_upload",
					Label:       "Upload CSV / Manual Entry",
					Icon:        "upload",
					Accept:      []string{".csv"},
					TemplateURL: "/templates/apple-maps-import.csv",
				},
			},
			SetupGuide: "Apple Maps runs in manual/CSV mode for this integration path.",
		},
		Capabilities: nexadapter.ChannelCapabilities{
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
	}
}

func info(ctx context.Context) (*nexadapter.AdapterInfo, error) {
	adapter := nexadapter.DefineAdapter(adapterConfig())
	return adapter.Operations.AdapterInfo(ctx)
}

func accounts(_ context.Context) ([]nexadapter.AdapterAccount, error) {
	runtimeContext, err := nexadapter.LoadRuntimeContextFromEnv()
	if err != nil {
		return []nexadapter.AdapterAccount{}, nil
	}

	credentialRef := "apple-maps/" + runtimeContext.ConnectionID
	if runtimeContext.Credential != nil && strings.TrimSpace(runtimeContext.Credential.Ref) != "" {
		credentialRef = runtimeContext.Credential.Ref
	}

	return []nexadapter.AdapterAccount{
		{
			ID:            runtimeContext.ConnectionID,
			DisplayName:   runtimeContext.ConnectionID,
			CredentialRef: credentialRef,
			Status:        "ready",
		},
	}, nil
}

func health(_ context.Context, account string) (*nexadapter.AdapterHealth, error) {
	account, err := nexadapter.RequireConnection(account)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: account,
			Error:        err.Error(),
		}, nil
	}
	return &nexadapter.AdapterHealth{
		Connected:    true,
		ConnectionID: account,
		LastEventAt:  time.Now().UnixMilli(),
		Details: map[string]any{
			"mode": "manual_csv",
		},
	}, nil
}

func backfill(_ context.Context, account string, since time.Time, emit nexadapter.EmitFunc) error {
	_ = since
	account, err := nexadapter.RequireConnection(account)
	if err != nil {
		return err
	}

	for _, metric := range resolveManualMetrics() {
		record := nexadapter.AdapterInboundRecord{
			Operation: "record.ingest",
			Routing: nexadapter.AdapterInboundRouting{
				Adapter:       adapterName,
				Platform:      platformID,
				ConnectionID:  account,
				SenderID:      platformID,
				SenderName:    "Apple Maps",
				ContainerKind: "group",
				ContainerID:   "metrics",
				ContainerName: "Metrics",
				ThreadID:      "manual-metrics",
				ThreadName:    "Manual Metrics",
			},
			Payload: nexadapter.AdapterInboundPayload{
				ExternalRecordID: fmt.Sprintf("%s:%s:%s:%s", platformID, strings.ToLower(nexadapter.SafeIDToken(account)), strings.ToLower(nexadapter.SafeIDToken(metric.Date)), strings.ToLower(nexadapter.SafeIDToken(metric.Name))),
				Timestamp:        nexadapter.MetricTimestamp(metric.Date, nil),
				Content:          fmt.Sprintf("%s=%g", metric.Name, metric.Value),
				ContentType:      "text",
				Metadata: map[string]any{
					"connection_id": account,
					"adapter_id":    platformID,
					"metric_name":   metric.Name,
					"metric_value":  metric.Value,
					"date":          metric.Date,
					"source":        metric.Source,
				},
			},
		}
		emit(record)
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

func firstNonBlank(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
