// eve-adapter is the Nexus adapter binary for iMessage via Eve.
//
// It uses Eve's warehouse ETL pipeline (chat.db → eve.db) to provide
// normalized, contact-resolved iMessage data through the Nexus adapter protocol.
//
// Usage:
//
//	eve-adapter adapter.info
//	eve-adapter adapter.monitor.start --connection conn-eve
//	eve-adapter channels.send --connection conn-eve --container "+14155551234" --text "Hello"
//	eve-adapter records.backfill --connection conn-eve --since 2026-01-01
//	eve-adapter adapter.health --connection conn-eve
//	eve-adapter adapter.accounts.list
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"mime"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"

	"github.com/nexus-project/adapter-eve/internal/config"
	"github.com/nexus-project/adapter-eve/internal/etl"
	"github.com/nexus-project/adapter-eve/internal/migrate"

	_ "github.com/mattn/go-sqlite3"
)

const (
	adapterName    = "eve"
	adapterVersion = "0.1.0"
	platformID     = "imessage"
	stageChunkSize = 5000
)

type stagedBackfillChunk struct {
	Path           string `json:"path"`
	Records        int    `json:"records"`
	FirstRecordID  string `json:"first_record_id,omitempty"`
	LastRecordID   string `json:"last_record_id,omitempty"`
	MinTimestampMs *int64 `json:"min_timestamp_ms,omitempty"`
	MaxTimestampMs *int64 `json:"max_timestamp_ms,omitempty"`
}

type stagedBackfillManifest struct {
	Version      int                   `json:"version"`
	Format       string                `json:"format"`
	StageDir     string                `json:"stage_dir"`
	ManifestPath string                `json:"manifest_path"`
	Chunks       []stagedBackfillChunk `json:"chunks"`
	Totals       struct {
		Records int `json:"records"`
	} `json:"totals"`
}

type stagedChunkWriter struct {
	stageDir     string
	chunkSize    int
	chunkIndex   int
	currentFile  *os.File
	currentEnc   *json.Encoder
	currentChunk *stagedBackfillChunk
	manifest     stagedBackfillManifest
}

func boolPtr(value bool) *bool {
	return &value
}

func main() {
	nexadapter.Run(nexadapter.DefineAdapter(adapterConfig()))
}

func adapterConfig() nexadapter.DefineAdapterConfig[struct{}] {
	return nexadapter.DefineAdapterConfig[struct{}]{
		Platform:          platformID,
		Name:              adapterName,
		Version:           adapterVersion,
		CredentialService: "eve",
		MultiAccount:      false,
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					ID:      "eve_local_access",
					Type:    "custom_flow",
					Label:   "Set Up Eve Local Access",
					Icon:    "settings",
					Service: "eve",
					Fields:  eveSetupFields(),
				},
			},
			SetupGuide: "Grant Full Disk Access to Eve so it can read chat.db, then confirm setup.",
		},
		Capabilities: nexadapter.ChannelCapabilities{
			TextLimit:             4000,
			SupportsMarkdown:      false,
			SupportsTables:        false,
			SupportsCodeBlocks:    false,
			SupportsEmbeds:        false,
			SupportsThreads:       false,
			SupportsReactions:     true,
			SupportsPolls:         false,
			SupportsButtons:       false,
			SupportsEdit:          false,
			SupportsDelete:        false,
			SupportsMedia:         true,
			SupportsVoiceNotes:    true,
			SupportsStreamingEdit: false,
		},
		Connection: nexadapter.ConnectionHandlers[struct{}]{
			Accounts: func(ctx nexadapter.AdapterContext[struct{}]) ([]nexadapter.AdapterAccount, error) {
				return eveAccounts(ctx.Context)
			},
			Health: func(ctx nexadapter.AdapterContext[struct{}]) (*nexadapter.AdapterHealth, error) {
				return eveHealth(ctx.Context, ctx.ConnectionID)
			},
		},
		Ingest: nexadapter.IngestHandlers[struct{}]{
			Monitor: func(ctx nexadapter.AdapterContext[struct{}], emit nexadapter.EmitFunc) error {
				return eveMonitor(ctx.Context, ctx.ConnectionID, emit)
			},
			Backfill: func(ctx nexadapter.AdapterContext[struct{}], since time.Time, emit nexadapter.EmitFunc) error {
				return eveBackfill(ctx.Context, ctx.ConnectionID, since, emit)
			},
		},
		Delivery: nexadapter.DeliveryHandlers[struct{}]{
			Send: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.SendRequest) (*nexadapter.DeliveryResult, error) {
				return eveSend(ctx.Context, req)
			},
		},
		Setup: nexadapter.SetupHandlers[struct{}]{
			Start: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
				return eveSetupStart(ctx.Context, req)
			},
			Submit: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
				return eveSetupSubmit(ctx.Context, req)
			},
			Status: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
				return eveSetupStatus(ctx.Context, req)
			},
			Cancel: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
				return eveSetupCancel(ctx.Context, req)
			},
		},
		Methods: map[string]nexadapter.DeclaredMethod[struct{}]{
			"records.backfill.stage": nexadapter.Method(nexadapter.DeclaredMethod[struct{}]{
				Description:        "Stage historical Eve backfill into canonical JSONL chunk files for Nex bulk import.",
				Action:             "read",
				Params: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"since":     map[string]any{"type": "string"},
						"stage_dir": map[string]any{"type": "string"},
					},
					"required": []string{"since", "stage_dir"},
				},
				Response: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"version":       map[string]any{"type": "integer"},
						"format":        map[string]any{"type": "string"},
						"stage_dir":     map[string]any{"type": "string"},
						"manifest_path": map[string]any{"type": "string"},
						"totals": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"records": map[string]any{"type": "integer"},
							},
							"required": []string{"records"},
						},
						"chunks": map[string]any{
							"type": "array",
							"items": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"path":              map[string]any{"type": "string"},
									"records":           map[string]any{"type": "integer"},
									"first_record_id":   map[string]any{"type": "string"},
									"last_record_id":    map[string]any{"type": "string"},
									"first_timestamp_ms": map[string]any{"type": "integer"},
									"last_timestamp_ms":  map[string]any{"type": "integer"},
								},
								"required": []string{"path", "records"},
							},
						},
					},
					"required": []string{"version", "format", "stage_dir", "manifest_path", "totals", "chunks"},
				},
				ConnectionRequired: boolPtr(true),
				MutatesRemote:      boolPtr(false),
				Handler: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterMethodRequest) (any, error) {
					return eveStageBackfill(ctx.Context, ctx.ConnectionID, req.Payload)
				},
			}),
		},
	}
}

// ---------- Monitor ----------

func eveMonitor(ctx context.Context, connectionID string, emit nexadapter.EmitFunc) error {
	warehouseDB, err := openWarehouse()
	if err != nil {
		return err
	}
	defer warehouseDB.Close()

	chatDB, chatErr := openChatDB()
	if chatDB != nil {
		defer chatDB.Close()
	}
	if chatErr != nil {
		nexadapter.LogInfo("monitor: cannot open chat.db (sync disabled): %v", chatErr)
	}

	meIdentifier := getMeIdentifier(warehouseDB)

	// Start from the current max message ID so we only emit NEW messages.
	var lastSeenID int64
	if err := warehouseDB.QueryRow("SELECT COALESCE(MAX(id), 0) FROM messages").Scan(&lastSeenID); err != nil {
		return fmt.Errorf("failed to get initial cursor: %w", err)
	}

	var lastSeenReactionID int64
	if err := warehouseDB.QueryRow("SELECT COALESCE(MAX(id), 0) FROM reactions").Scan(&lastSeenReactionID); err != nil {
		return fmt.Errorf("failed to get initial reaction cursor: %w", err)
	}

	var lastSeenMembershipID int64
	if err := warehouseDB.QueryRow("SELECT COALESCE(MAX(id), 0) FROM membership_events").Scan(&lastSeenMembershipID); err != nil {
		return fmt.Errorf("failed to get initial membership cursor: %w", err)
	}

	nexadapter.LogInfo(
		"monitor starting from message=%d reaction=%d membership=%d",
		lastSeenID,
		lastSeenReactionID,
		lastSeenMembershipID,
	)

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			nexadapter.LogInfo("monitor shutting down")
			return nil
		case <-ticker.C:
		}

		// Step 1: Run incremental ETL sync (chat.db → eve.db).
		if chatDB != nil {
			// Use a lookback window because chat.db writes are not always "atomic":
			// a message row can appear before its chat_message_join row, and strict
			// ROWID watermarks can permanently skip messages. Warehouse inserts are
			// idempotent via guid UNIQUE constraints, so reprocessing is safe.
			const lookbackRowIDs int64 = 5000
			sinceRowID := getWatermarkRowID(warehouseDB)
			syncSinceRowID := sinceRowID
			if syncSinceRowID > lookbackRowIDs {
				syncSinceRowID -= lookbackRowIDs
			} else {
				syncSinceRowID = 0
			}

			syncResult, err := etl.FullSync(chatDB, warehouseDB, syncSinceRowID)
			if err != nil {
				nexadapter.LogError("sync failed: %v", err)
			} else if syncResult.MaxMessageRowID > 0 {
				if err := etl.SetWatermark(warehouseDB, "chatdb", "message_rowid", &syncResult.MaxMessageRowID, nil); err != nil {
					nexadapter.LogError("failed to update watermark: %v", err)
				}
			}
		}

		// Step 2: Query warehouse for messages newer than our cursor.
		events, newLastID, err := queryNewMessages(warehouseDB, lastSeenID, meIdentifier)
		if err != nil {
			nexadapter.LogError("failed to query new messages: %v", err)
		} else {
			for _, event := range events {
				emit(bindConnection(event, connectionID))
			}
			if newLastID > lastSeenID {
				nexadapter.LogDebug(
					"emitted %d message events (cursor %d → %d)",
					len(events),
					lastSeenID,
					newLastID,
				)
				lastSeenID = newLastID
			}
		}

		reactions, newLastReactionID, err := queryNewReactions(warehouseDB, lastSeenReactionID, meIdentifier)
		if err != nil {
			nexadapter.LogError("failed to query new reactions: %v", err)
		} else {
			for _, event := range reactions {
				emit(bindConnection(event, connectionID))
			}
			if newLastReactionID > lastSeenReactionID {
				nexadapter.LogDebug(
					"emitted %d reaction events (cursor %d → %d)",
					len(reactions),
					lastSeenReactionID,
					newLastReactionID,
				)
				lastSeenReactionID = newLastReactionID
			}
		}

		membership, newLastMembershipID, err := queryNewMembershipEvents(
			warehouseDB,
			lastSeenMembershipID,
			meIdentifier,
		)
		if err != nil {
			nexadapter.LogError("failed to query new membership events: %v", err)
		} else {
			for _, event := range membership {
				emit(bindConnection(event, connectionID))
			}
			if newLastMembershipID > lastSeenMembershipID {
				nexadapter.LogDebug(
					"emitted %d membership events (cursor %d → %d)",
					len(membership),
					lastSeenMembershipID,
					newLastMembershipID,
				)
				lastSeenMembershipID = newLastMembershipID
			}
		}
	}
}

// ---------- Send ----------

func eveSend(ctx context.Context, req nexadapter.SendRequest) (*nexadapter.DeliveryResult, error) {
	target := strings.TrimSpace(req.Target.Channel.ContainerID)
	if target == "" {
		target = recipientFromThreadID(req.Target.Channel.ThreadID)
	}
	if target == "" {
		return &nexadapter.DeliveryResult{
			Success: false,
			Error: &nexadapter.DeliveryError{
				Type:    "content_rejected",
				Message: "--to is required (or provide --thread)",
				Retry:   false,
			},
		}, nil
	}
	if strings.TrimSpace(req.Target.ReplyToID) != "" {
		return &nexadapter.DeliveryResult{
			Success: false,
			Error: &nexadapter.DeliveryError{
				Type:    "content_rejected",
				Message: "reply_to_id is not supported by the imessage adapter",
				Retry:   false,
			},
		}, nil
	}

	body := strings.TrimSpace(req.Text)
	if body == "" {
		body = strings.TrimSpace(req.Caption)
	}

	result := nexadapter.SendWithChunking(body, 4000, func(chunk string) (string, error) {
		if err := sendAppleScript(ctx, target, chunk, req.Media); err != nil {
			return "", err
		}
		return fmt.Sprintf("imessage:sent:%d", time.Now().UnixNano()), nil
	})

	return result, nil
}

func recipientFromThreadID(threadID string) string {
	trimmed := strings.TrimSpace(threadID)
	if trimmed == "" {
		return ""
	}
	return strings.TrimPrefix(trimmed, "imessage:")
}

func sendAppleScript(ctx context.Context, recipient, text, media string) error {
	var script string
	if media != "" {
		script = fmt.Sprintf(`tell application "Messages"
	set targetService to 1st account whose service type = iMessage
	set targetBuddy to participant "%s" of targetService
	send "%s" to targetBuddy
	send POSIX file "%s" to targetBuddy
end tell`, escapeAppleScript(recipient), escapeAppleScript(text), escapeAppleScript(media))
	} else {
		script = fmt.Sprintf(`tell application "Messages"
	set targetService to 1st account whose service type = iMessage
	set targetBuddy to participant "%s" of targetService
	send "%s" to targetBuddy
end tell`, escapeAppleScript(recipient), escapeAppleScript(text))
	}

	cmd := exec.CommandContext(ctx, "osascript", "-e", script)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("AppleScript failed: %s (output: %s)", err, string(output))
	}
	return nil
}

// ---------- Backfill ----------

func newStagedChunkWriter(stageDir string) *stagedChunkWriter {
	writer := &stagedChunkWriter{
		stageDir:  stageDir,
		chunkSize: stageChunkSize,
		manifest: stagedBackfillManifest{
			Version:  1,
			Format:   "jsonl_files",
			StageDir: stageDir,
		},
	}
	writer.manifest.ManifestPath = filepath.Join(stageDir, "manifest.json")
	return writer
}

func (w *stagedChunkWriter) openChunk() error {
	if w.currentFile != nil {
		return nil
	}
	chunkPath := filepath.Join(w.stageDir, fmt.Sprintf("chunk-%05d.jsonl", w.chunkIndex))
	file, err := os.Create(chunkPath)
	if err != nil {
		return err
	}
	w.currentFile = file
	w.currentEnc = json.NewEncoder(file)
	w.currentChunk = &stagedBackfillChunk{
		Path: chunkPath,
	}
	w.chunkIndex++
	return nil
}

func extractRecordProgress(record nexadapter.AdapterInboundRecord) (string, *int64) {
	recordID := strings.TrimSpace(record.Payload.ExternalRecordID)
	timestamp := record.Payload.Timestamp
	if timestamp <= 0 {
		return recordID, nil
	}
	return recordID, &timestamp
}

func (w *stagedChunkWriter) closeChunk() error {
	if w.currentFile == nil || w.currentChunk == nil {
		return nil
	}
	if err := w.currentFile.Close(); err != nil {
		return err
	}
	w.manifest.Chunks = append(w.manifest.Chunks, *w.currentChunk)
	w.currentFile = nil
	w.currentEnc = nil
	w.currentChunk = nil
	return nil
}

func (w *stagedChunkWriter) write(record nexadapter.AdapterInboundRecord) error {
	if err := w.openChunk(); err != nil {
		return err
	}
	if err := w.currentEnc.Encode(record); err != nil {
		return err
	}
	recordID, timestamp := extractRecordProgress(record)
	w.currentChunk.Records++
	w.manifest.Totals.Records++
	if w.currentChunk.FirstRecordID == "" {
		w.currentChunk.FirstRecordID = recordID
	}
	w.currentChunk.LastRecordID = recordID
	if timestamp != nil {
		if w.currentChunk.MinTimestampMs == nil || *timestamp < *w.currentChunk.MinTimestampMs {
			value := *timestamp
			w.currentChunk.MinTimestampMs = &value
		}
		if w.currentChunk.MaxTimestampMs == nil || *timestamp > *w.currentChunk.MaxTimestampMs {
			value := *timestamp
			w.currentChunk.MaxTimestampMs = &value
		}
	}
	if w.currentChunk.Records >= w.chunkSize {
		return w.closeChunk()
	}
	return nil
}

func (w *stagedChunkWriter) finish() (*stagedBackfillManifest, error) {
	if err := w.closeChunk(); err != nil {
		return nil, err
	}
	raw, err := json.MarshalIndent(w.manifest, "", "  ")
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(w.manifest.ManifestPath, raw, 0o644); err != nil {
		return nil, err
	}
	return &w.manifest, nil
}

func resolveStagedBackfillSince(payload map[string]any) (time.Time, error) {
	raw, _ := payload["since"].(string)
	since := strings.TrimSpace(raw)
	if since == "" {
		return time.Time{}, fmt.Errorf("records.backfill.stage requires payload.since")
	}
	parsed, err := time.Parse(time.RFC3339, since)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid staged backfill since %q: %w", since, err)
	}
	return parsed, nil
}

func resolveStageDir(payload map[string]any) (string, error) {
	if payload != nil {
		if raw, ok := payload["stage_dir"].(string); ok && strings.TrimSpace(raw) != "" {
			stageDir := strings.TrimSpace(raw)
			if err := os.MkdirAll(stageDir, 0o755); err != nil {
				return "", err
			}
			return stageDir, nil
		}
	}
	return os.MkdirTemp("", "nex-eve-staged-backfill-*")
}

func eveStageBackfill(ctx context.Context, connectionID string, payload map[string]any) (any, error) {
	since, err := resolveStagedBackfillSince(payload)
	if err != nil {
		return nil, err
	}
	stageDir, err := resolveStageDir(payload)
	if err != nil {
		return nil, err
	}

	writer := newStagedChunkWriter(stageDir)
	var stageErr error
	err = eveBackfill(ctx, connectionID, since, func(record any) {
		if stageErr != nil {
			return
		}
		inbound, ok := record.(nexadapter.AdapterInboundRecord)
		if !ok {
			stageErr = fmt.Errorf("unexpected staged record type %T", record)
			return
		}
		if err := writer.write(inbound); err != nil {
			stageErr = err
		}
	})
	if err != nil {
		return nil, err
	}
	if stageErr != nil {
		return nil, stageErr
	}
	return writer.finish()
}

func eveBackfill(ctx context.Context, connectionID string, since time.Time, emit nexadapter.EmitFunc) error {
	warehouseDB, err := openWarehouse()
	if err != nil {
		return err
	}
	defer warehouseDB.Close()

	chatDB, chatErr := openChatDB()
	if chatDB != nil {
		defer chatDB.Close()
	}
	if chatErr != nil {
		nexadapter.LogInfo("backfill: cannot open chat.db (will emit from warehouse only): %v", chatErr)
	}

	meIdentifier := getMeIdentifier(warehouseDB)

	// Best-effort: Ensure warehouse is up to date before backfilling.
	if chatDB != nil {
		nexadapter.LogInfo("running sync before backfill...")
		const lookbackRowIDs int64 = 5000
		sinceRowID := getWatermarkRowID(warehouseDB)
		syncSinceRowID := sinceRowID
		if syncSinceRowID > lookbackRowIDs {
			syncSinceRowID -= lookbackRowIDs
		} else {
			syncSinceRowID = 0
		}

		syncResult, err := etl.FullSync(chatDB, warehouseDB, syncSinceRowID)
		if err != nil {
			nexadapter.LogInfo("pre-backfill sync failed (continuing with existing warehouse): %v", err)
		} else if syncResult.MaxMessageRowID > 0 {
			_ = etl.SetWatermark(warehouseDB, "chatdb", "message_rowid", &syncResult.MaxMessageRowID, nil)
		}
	}

	nexadapter.LogInfo("sync complete, starting backfill from %s", since.Format(time.RFC3339))

	// Paginated query — process in batches of 5000 to keep memory bounded.
	const batchSize = 5000
	totalEmitted := 0

	// Messages
	{
		var lastID int64
		for {
			select {
			case <-ctx.Done():
				nexadapter.LogInfo("backfill cancelled after %d events", totalEmitted)
				return nil
			default:
			}

			events, newLastID, err := queryMessagesSince(warehouseDB, since, lastID, batchSize, meIdentifier)
			if err != nil {
				return fmt.Errorf("backfill message query failed: %w", err)
			}
			if len(events) == 0 {
				break
			}
			for _, event := range events {
				emit(bindConnection(event, connectionID))
			}
			totalEmitted += len(events)
			lastID = newLastID
			nexadapter.LogDebug("backfill progress: %d events emitted", totalEmitted)
		}
	}

	// Reactions
	{
		var lastID int64
		for {
			select {
			case <-ctx.Done():
				nexadapter.LogInfo("backfill cancelled after %d events", totalEmitted)
				return nil
			default:
			}

			events, newLastID, err := queryReactionsSince(warehouseDB, since, lastID, batchSize, meIdentifier)
			if err != nil {
				return fmt.Errorf("backfill reaction query failed: %w", err)
			}
			if len(events) == 0 {
				break
			}
			for _, event := range events {
				emit(bindConnection(event, connectionID))
			}
			totalEmitted += len(events)
			lastID = newLastID
			nexadapter.LogDebug("backfill progress: %d events emitted", totalEmitted)
		}
	}

	// Membership events
	{
		var lastID int64
		for {
			select {
			case <-ctx.Done():
				nexadapter.LogInfo("backfill cancelled after %d events", totalEmitted)
				return nil
			default:
			}

			events, newLastID, err := queryMembershipEventsSince(
				warehouseDB,
				since,
				lastID,
				batchSize,
				meIdentifier,
			)
			if err != nil {
				return fmt.Errorf("backfill membership query failed: %w", err)
			}
			if len(events) == 0 {
				break
			}
			for _, event := range events {
				emit(bindConnection(event, connectionID))
			}
			totalEmitted += len(events)
			lastID = newLastID
			nexadapter.LogDebug("backfill progress: %d events emitted", totalEmitted)
		}
	}

	nexadapter.LogInfo("backfill complete: %d events emitted", totalEmitted)
	return nil
}

// ---------- Health ----------

func eveHealth(_ context.Context, connectionID string) (*nexadapter.AdapterHealth, error) {
	// Check chat.db accessibility.
	chatDBPath := etl.GetChatDBPath()
	if chatDBPath == "" {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: connectionID,
			Error:        "cannot determine chat.db path",
		}, nil
	}

	chatDB, err := etl.OpenChatDB(chatDBPath)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: connectionID,
			Error:        fmt.Sprintf("cannot open chat.db: %v", err),
			Details:      map[string]any{"chat_db_path": chatDBPath},
		}, nil
	}
	chatDB.Close()

	// Check warehouse accessibility.
	cfg := config.Load()
	warehouseDB, err := sql.Open("sqlite3", cfg.EveDBPath+"?mode=ro")
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: connectionID,
			Error:        fmt.Sprintf("cannot open eve.db: %v", err),
			Details:      map[string]any{"chat_db_path": chatDBPath, "warehouse_path": cfg.EveDBPath},
		}, nil
	}
	defer warehouseDB.Close()

	// Get latest message timestamp and count.
	var lastEventAt int64
	var lastTS sql.NullString
	_ = warehouseDB.QueryRow("SELECT MAX(timestamp) FROM messages").Scan(&lastTS)
	if lastTS.Valid {
		lastEventAt = parseTimestampMs(lastTS.String)
	}

	var msgCount int64
	_ = warehouseDB.QueryRow("SELECT COUNT(*) FROM messages").Scan(&msgCount)

	return &nexadapter.AdapterHealth{
		Connected:    true,
		ConnectionID: connectionID,
		LastEventAt:  lastEventAt,
		Details: map[string]any{
			"chat_db_path":   chatDBPath,
			"warehouse_path": cfg.EveDBPath,
			"message_count":  msgCount,
		},
	}, nil
}

// ---------- Accounts ----------

func eveAccounts(_ context.Context) ([]nexadapter.AdapterAccount, error) {
	return []nexadapter.AdapterAccount{
		{
			ID:          "default",
			DisplayName: getFullName(),
			Status:      "active",
		},
	}, nil
}

func eveSetupFields() []nexadapter.AdapterAuthField {
	return []nexadapter.AdapterAuthField{
		{
			Name:     "confirm_full_disk_access",
			Label:    "I enabled Full Disk Access for Eve",
			Type:     "select",
			Required: true,
			Options: []nexadapter.AdapterAuthFieldOption{
				{Label: "Yes", Value: "yes"},
				{Label: "Not yet", Value: "no"},
			},
		},
	}
}

func setupConnectionIDOrDefault(connectionID string) string {
	trimmed := strings.TrimSpace(connectionID)
	if trimmed == "" {
		return "eve-local"
	}
	return trimmed
}

func setupSessionIDOrDefault(sessionID string) string {
	trimmed := strings.TrimSpace(sessionID)
	if trimmed == "" {
		return fmt.Sprintf("eve-setup-%d", time.Now().UnixNano())
	}
	return trimmed
}

func isEveSetupConfirmed(payload map[string]any) bool {
	if payload == nil {
		return false
	}

	normalize := func(raw any) bool {
		switch value := raw.(type) {
		case bool:
			return value
		case string:
			v := strings.ToLower(strings.TrimSpace(value))
			return v == "true" || v == "yes" || v == "y" || v == "1" || v == "confirmed"
		case float64:
			return value == 1
		case int:
			return value == 1
		case int64:
			return value == 1
		default:
			return false
		}
	}

	return normalize(payload["confirm_full_disk_access"]) || normalize(payload["confirm"])
}

func buildEveSetupResult(ctx context.Context, req nexadapter.AdapterSetupRequest, requireConfirm bool) (*nexadapter.AdapterSetupResult, error) {
	connectionID := setupConnectionIDOrDefault(req.ConnectionID)
	sessionID := setupSessionIDOrDefault(req.SessionID)

	health, err := eveHealth(ctx, connectionID)
	if err != nil {
		return nil, err
	}
	if health.Connected {
		return &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusCompleted,
			SessionID:    sessionID,
			ConnectionID: connectionID,
			Service:      "eve",
			Message:      "Eve can access chat.db and is ready.",
			Metadata: map[string]any{
				"connected":    true,
				"health_error": health.Error,
			},
		}, nil
	}

	if requireConfirm && !isEveSetupConfirmed(req.Payload) {
		return &nexadapter.AdapterSetupResult{
			Status:       nexadapter.SetupStatusRequiresInput,
			SessionID:    sessionID,
			ConnectionID: connectionID,
			Service:      "eve",
			Message:      "Confirm Full Disk Access after enabling it in System Settings.",
			Instructions: "System Settings -> Privacy & Security -> Full Disk Access -> enable access for Eve and your runtime shell, then submit again.",
			Fields:       eveSetupFields(),
			Metadata: map[string]any{
				"connected":    false,
				"health_error": health.Error,
			},
		}, nil
	}

	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusRequiresInput,
		SessionID:    sessionID,
		ConnectionID: connectionID,
		Service:      "eve",
		Message:      "Eve still cannot read chat.db.",
		Instructions: "Grant Full Disk Access to Eve and your runtime shell, then submit again.",
		Fields:       eveSetupFields(),
		Metadata: map[string]any{
			"connected":    false,
			"health_error": health.Error,
			"details":      health.Details,
		},
	}, nil
}

func eveSetupStart(ctx context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return buildEveSetupResult(ctx, req, false)
}

func eveSetupSubmit(ctx context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return buildEveSetupResult(ctx, req, true)
}

func eveSetupStatus(ctx context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return buildEveSetupResult(ctx, req, false)
}

func eveSetupCancel(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusCancelled,
		SessionID:    setupSessionIDOrDefault(req.SessionID),
		ConnectionID: setupConnectionIDOrDefault(req.ConnectionID),
		Service:      "eve",
		Message:      "Setup cancelled.",
	}, nil
}

// =====================================================================
// Warehouse query helpers
// =====================================================================

// warehouseRow holds a single row from the warehouse messages join query.
type warehouseRow struct {
	ID               int64
	SenderContactID  sql.NullInt64
	Content          sql.NullString
	Timestamp        sql.NullString
	IsFromMe         bool
	GUID             string
	ServiceName      sql.NullString
	ReplyToGUID      sql.NullString
	ChatID           int64
	SenderName       sql.NullString
	SenderIdentifier sql.NullString
	ChatIdentifier   string
	IsGroup          bool
	ChatName         sql.NullString
}

// Base query joining messages → contacts → contact_identifiers → chats.
// The sender_identifier subquery picks the primary (or first) identifier
// for the contact, giving us a phone number or email for the sender.
const warehouseMessageQuery = `
SELECT
	m.id, m.sender_id, m.content, m.timestamp, m.is_from_me, m.guid,
	m.service_name, m.reply_to_guid, m.chat_id,
	c.name,
	(SELECT ci.identifier FROM contact_identifiers ci
	 WHERE ci.contact_id = m.sender_id
	 ORDER BY ci.is_primary DESC LIMIT 1),
	ch.chat_identifier, ch.is_group, ch.chat_name
FROM messages m
LEFT JOIN contacts c ON m.sender_id = c.id
LEFT JOIN chats ch ON m.chat_id = ch.id
`

// queryNewMessages returns events for messages with id > sinceID.
func queryNewMessages(
	db *sql.DB,
	sinceID int64,
	meIdentifier string,
) ([]nexadapter.AdapterInboundRecord, int64, error) {
	rows, err := db.Query(warehouseMessageQuery+"WHERE m.id > ? ORDER BY m.id", sinceID)
	if err != nil {
		return nil, sinceID, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	var (
		messageRows []warehouseRow
		firstID     int64
		lastID      = sinceID
	)

	for rows.Next() {
		var row warehouseRow
		if err := scanWarehouseRow(rows, &row); err != nil {
			return nil, lastID, err
		}
		if firstID == 0 {
			firstID = row.ID
		}
		messageRows = append(messageRows, row)
		lastID = row.ID
	}

	if err := rows.Err(); err != nil {
		return nil, lastID, err
	}

	attachmentsByMessageID := map[int64][]nexadapter.Attachment{}
	if len(messageRows) > 0 {
		var err error
		attachmentsByMessageID, err = queryAttachmentsForMessageIDRange(db, firstID, lastID)
		if err != nil {
			return nil, lastID, err
		}
	}

	events := make([]nexadapter.AdapterInboundRecord, 0, len(messageRows))
	for _, row := range messageRows {
		events = append(events, convertWarehouseMessage(row, attachmentsByMessageID[row.ID], meIdentifier))
	}

	return events, lastID, nil
}

// queryMessagesSince returns events for messages with timestamp >= since AND id > afterID, paginated.
func queryMessagesSince(
	db *sql.DB,
	since time.Time,
	afterID int64,
	limit int,
	meIdentifier string,
) ([]nexadapter.AdapterInboundRecord, int64, error) {
	// Format since in the same style go-sqlite3 uses for storage ("2006-01-02 15:04:05+00:00").
	sinceStr := since.UTC().Format("2006-01-02 15:04:05+00:00")

	q := warehouseMessageQuery + "WHERE m.timestamp >= ? AND m.id > ? ORDER BY m.id LIMIT ?"
	rows, err := db.Query(q, sinceStr, afterID, limit)
	if err != nil {
		return nil, afterID, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	var (
		messageRows []warehouseRow
		firstID     int64
		lastID      = afterID
	)

	for rows.Next() {
		var row warehouseRow
		if err := scanWarehouseRow(rows, &row); err != nil {
			return nil, lastID, err
		}
		if firstID == 0 {
			firstID = row.ID
		}
		messageRows = append(messageRows, row)
		lastID = row.ID
	}

	if err := rows.Err(); err != nil {
		return nil, lastID, err
	}

	attachmentsByMessageID := map[int64][]nexadapter.Attachment{}
	if len(messageRows) > 0 {
		var err error
		attachmentsByMessageID, err = queryAttachmentsForMessageIDRange(db, firstID, lastID)
		if err != nil {
			return nil, lastID, err
		}
	}

	events := make([]nexadapter.AdapterInboundRecord, 0, len(messageRows))
	for _, row := range messageRows {
		events = append(events, convertWarehouseMessage(row, attachmentsByMessageID[row.ID], meIdentifier))
	}

	return events, lastID, nil
}

func scanWarehouseRow(rows *sql.Rows, row *warehouseRow) error {
	return rows.Scan(
		&row.ID, &row.SenderContactID, &row.Content, &row.Timestamp, &row.IsFromMe, &row.GUID,
		&row.ServiceName, &row.ReplyToGUID, &row.ChatID,
		&row.SenderName, &row.SenderIdentifier,
		&row.ChatIdentifier, &row.IsGroup, &row.ChatName,
	)
}

// =====================================================================
// Record conversion
// =====================================================================

// cachedFullName stores the local user's full name (from `id -F`).
// Resolved once, used for all is_from_me messages.
var cachedFullName string

func convertWarehouseMessage(
	row warehouseRow,
	attachments []nexadapter.Attachment,
	meIdentifier string,
) nexadapter.AdapterInboundRecord {
	peerKind := "direct"
	if row.IsGroup {
		peerKind = "group"
	}

	// Parse timestamp.
	var timestampMs int64
	if row.Timestamp.Valid {
		timestampMs = parseTimestampMs(row.Timestamp.String)
	}

	content := ""
	if row.Content.Valid {
		content = row.Content.String
	}

	// Determine sender.
	// In chat.db, is_from_me messages have handle_id pointing to the recipient
	// (in DMs) or NULL (in groups). The warehouse inherits this, so sender_id
	// is wrong for outgoing messages. We correct it here.
	var senderID, senderName string
	if row.IsFromMe {
		senderID = meIdentifier
		if senderID == "" {
			senderID = "me"
		}
		senderName = getFullName()
	} else {
		if row.SenderIdentifier.Valid {
			senderID = row.SenderIdentifier.String
		}
		if row.SenderName.Valid {
			senderName = row.SenderName.String
		}
	}

	serviceName := ""
	if row.ServiceName.Valid {
		serviceName = row.ServiceName.String
	}

	threadID := deriveThreadID(row.ChatIdentifier, row.ChatID)

	b := nexadapter.NewRecord(platformID, "imessage:"+row.GUID).
		WithTimestampUnixMs(timestampMs).
		WithContent(content).
		WithContentType("text").
		WithSender(senderID, senderName).
		WithContainer(row.ChatIdentifier, peerKind).
		WithThread(threadID).
		WithMetadata("is_from_me", row.IsFromMe).
		WithMetadata("chat_id", row.ChatID).
		WithMetadata("service", serviceName).
		WithMetadata("account", "default")

	if row.SenderContactID.Valid {
		b.WithMetadata("sender_handle_id", row.SenderContactID.Int64)
	}

	if row.ReplyToGUID.Valid && row.ReplyToGUID.String != "" {
		replyTo := "imessage:" + row.ReplyToGUID.String
		b.WithReplyTo(replyTo)
		b.WithMetadata("reply_to", replyTo)
	}

	for _, att := range attachments {
		b.WithAttachment(att)
	}

	return b.Build()
}

func deriveThreadID(chatIdentifier string, chatID int64) string {
	chatIdentifier = strings.TrimSpace(chatIdentifier)
	if chatIdentifier != "" {
		return "imessage:" + chatIdentifier
	}
	return fmt.Sprintf("imessage:chat_id:%d", chatID)
}

func bindConnection(record nexadapter.AdapterInboundRecord, connectionID string) nexadapter.AdapterInboundRecord {
	record.Routing.ConnectionID = strings.TrimSpace(connectionID)
	return record
}

func queryAttachmentsForMessageIDRange(
	db *sql.DB,
	minMessageID int64,
	maxMessageID int64,
) (map[int64][]nexadapter.Attachment, error) {
	rows, err := db.Query(`
		SELECT message_id, file_name, mime_type, size, guid
		FROM attachments
		WHERE message_id >= ? AND message_id <= ?
		ORDER BY message_id, id
	`, minMessageID, maxMessageID)
	if err != nil {
		return nil, fmt.Errorf("attachments query failed: %w", err)
	}
	defer rows.Close()

	out := make(map[int64][]nexadapter.Attachment)
	for rows.Next() {
		var (
			messageID int64
			fileName  sql.NullString
			mimeType  sql.NullString
			size      sql.NullInt64
			guid      string
		)

		if err := rows.Scan(&messageID, &fileName, &mimeType, &size, &guid); err != nil {
			return nil, fmt.Errorf("attachments scan failed: %w", err)
		}

		fullPath := strings.TrimSpace(fileName.String)
		baseName := ""
		if fullPath != "" {
			baseName = filepath.Base(fullPath)
		}

		ct := strings.TrimSpace(strings.ToLower(mimeType.String))
		if ct == "" && baseName != "" {
			guessed := strings.ToLower(strings.TrimSpace(mime.TypeByExtension(filepath.Ext(baseName))))
			if guessed != "" {
				if semi := strings.IndexByte(guessed, ';'); semi >= 0 {
					guessed = strings.TrimSpace(guessed[:semi])
				}
				ct = guessed
			}
		}
		if ct == "" {
			ct = "application/octet-stream"
		}

		att := nexadapter.Attachment{
			ID:       "imessage:attachment:" + guid,
			Filename: baseName,
			MIMEType: ct,
		}
		if size.Valid && size.Int64 > 0 {
			att.Size = size.Int64
		}
		if fullPath != "" {
			att.LocalPath = fullPath
		}

		out[messageID] = append(out[messageID], att)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// =====================================================================
// Reactions + membership events
// =====================================================================

type warehouseReactionRow struct {
	ID                  int64
	GUID                string
	OriginalMessageGUID string
	Timestamp           sql.NullString
	IsFromMe            bool
	ChatID              int64
	SenderContactID     sql.NullInt64
	ReactionType        sql.NullInt64
	SenderName          sql.NullString
	SenderIdentifier    sql.NullString
	ChatIdentifier      string
	IsGroup             bool
	ChatName            sql.NullString
}

const warehouseReactionQuery = `
SELECT
	r.id, r.guid, r.original_message_guid, r.timestamp, r.is_from_me,
	r.chat_id, r.sender_id, r.reaction_type,
	c.name,
	(SELECT ci.identifier FROM contact_identifiers ci
	 WHERE ci.contact_id = r.sender_id
	 ORDER BY ci.is_primary DESC LIMIT 1),
	ch.chat_identifier, ch.is_group, ch.chat_name
FROM reactions r
LEFT JOIN contacts c ON r.sender_id = c.id
LEFT JOIN chats ch ON r.chat_id = ch.id
`

func scanWarehouseReactionRow(rows *sql.Rows, row *warehouseReactionRow) error {
	return rows.Scan(
		&row.ID,
		&row.GUID,
		&row.OriginalMessageGUID,
		&row.Timestamp,
		&row.IsFromMe,
		&row.ChatID,
		&row.SenderContactID,
		&row.ReactionType,
		&row.SenderName,
		&row.SenderIdentifier,
		&row.ChatIdentifier,
		&row.IsGroup,
		&row.ChatName,
	)
}

func queryNewReactions(db *sql.DB, sinceID int64, meIdentifier string) ([]nexadapter.AdapterInboundRecord, int64, error) {
	rows, err := db.Query(warehouseReactionQuery+"WHERE r.id > ? ORDER BY r.id", sinceID)
	if err != nil {
		return nil, sinceID, fmt.Errorf("reaction query failed: %w", err)
	}
	defer rows.Close()

	var events []nexadapter.AdapterInboundRecord
	lastID := sinceID

	for rows.Next() {
		var row warehouseReactionRow
		if err := scanWarehouseReactionRow(rows, &row); err != nil {
			return nil, lastID, err
		}
		events = append(events, convertWarehouseReaction(row, meIdentifier))
		lastID = row.ID
	}

	return events, lastID, rows.Err()
}

func queryReactionsSince(
	db *sql.DB,
	since time.Time,
	afterID int64,
	limit int,
	meIdentifier string,
) ([]nexadapter.AdapterInboundRecord, int64, error) {
	sinceStr := since.UTC().Format("2006-01-02 15:04:05+00:00")
	rows, err := db.Query(
		warehouseReactionQuery+"WHERE r.timestamp >= ? AND r.id > ? ORDER BY r.id LIMIT ?",
		sinceStr,
		afterID,
		limit,
	)
	if err != nil {
		return nil, afterID, fmt.Errorf("reaction query failed: %w", err)
	}
	defer rows.Close()

	var events []nexadapter.AdapterInboundRecord
	lastID := afterID

	for rows.Next() {
		var row warehouseReactionRow
		if err := scanWarehouseReactionRow(rows, &row); err != nil {
			return nil, lastID, err
		}
		events = append(events, convertWarehouseReaction(row, meIdentifier))
		lastID = row.ID
	}

	return events, lastID, rows.Err()
}

func convertWarehouseReaction(row warehouseReactionRow, meIdentifier string) nexadapter.AdapterInboundRecord {
	peerKind := "direct"
	if row.IsGroup {
		peerKind = "group"
	}

	// Parse timestamp.
	var timestampMs int64
	if row.Timestamp.Valid {
		timestampMs = parseTimestampMs(row.Timestamp.String)
	}

	peerID := strings.TrimSpace(row.ChatIdentifier)
	if peerID == "" {
		peerID = fmt.Sprintf("chat_id:%d", row.ChatID)
	}

	// Determine sender.
	var senderID, senderName string
	if row.IsFromMe {
		senderID = meIdentifier
		if senderID == "" {
			senderID = "me"
		}
		senderName = getFullName()
	} else {
		if row.SenderIdentifier.Valid {
			senderID = row.SenderIdentifier.String
		}
		if row.SenderName.Valid {
			senderName = row.SenderName.String
		}
	}
	if strings.TrimSpace(senderID) == "" {
		senderID = "unknown"
	}

	threadID := deriveThreadID(row.ChatIdentifier, row.ChatID)
	replyTo := "imessage:" + row.OriginalMessageGUID
	emoji := mapReactionType(row.ReactionType.Int64)

	b := nexadapter.NewRecord(platformID, "imessage:reaction:"+row.GUID).
		WithTimestampUnixMs(timestampMs).
		WithContent(emoji).
		WithContentType("reaction").
		WithSender(senderID, senderName).
		WithContainer(peerID, peerKind).
		WithThread(threadID).
		WithReplyTo(replyTo).
		WithMetadata("is_from_me", row.IsFromMe).
		WithMetadata("chat_id", row.ChatID).
		WithMetadata("reaction_type", row.ReactionType.Int64).
		WithMetadata("original_guid", row.OriginalMessageGUID).
		WithMetadata("reply_to", replyTo).
		WithMetadata("account", "default")

	if row.SenderContactID.Valid {
		b.WithMetadata("sender_handle_id", row.SenderContactID.Int64)
	}

	return b.Build()
}

type warehouseMembershipRow struct {
	ID                int64
	GUID              string
	ActorID           sql.NullInt64
	MemberID          sql.NullInt64
	ActionType        sql.NullInt64
	ItemType          sql.NullInt64
	MessageActionType sql.NullInt64
	GroupTitle        sql.NullString
	Timestamp         sql.NullString
	IsFromMe          bool
	ChatID            int64
	ActorName         sql.NullString
	ActorIdentifier   sql.NullString
	ChatIdentifier    string
	IsGroup           bool
	ChatName          sql.NullString
}

const warehouseMembershipQuery = `
SELECT
	me.id, me.guid,
	me.actor_id, me.member_id, me.action_type, me.item_type, me.message_action_type,
	me.group_title, me.timestamp, me.is_from_me, me.chat_id,
	actor.name,
	(SELECT ci.identifier FROM contact_identifiers ci
	 WHERE ci.contact_id = me.actor_id
	 ORDER BY ci.is_primary DESC LIMIT 1),
	ch.chat_identifier, ch.is_group, ch.chat_name
FROM membership_events me
LEFT JOIN contacts actor ON me.actor_id = actor.id
LEFT JOIN chats ch ON me.chat_id = ch.id
`

func scanWarehouseMembershipRow(rows *sql.Rows, row *warehouseMembershipRow) error {
	return rows.Scan(
		&row.ID,
		&row.GUID,
		&row.ActorID,
		&row.MemberID,
		&row.ActionType,
		&row.ItemType,
		&row.MessageActionType,
		&row.GroupTitle,
		&row.Timestamp,
		&row.IsFromMe,
		&row.ChatID,
		&row.ActorName,
		&row.ActorIdentifier,
		&row.ChatIdentifier,
		&row.IsGroup,
		&row.ChatName,
	)
}

func queryNewMembershipEvents(
	db *sql.DB,
	sinceID int64,
	meIdentifier string,
) ([]nexadapter.AdapterInboundRecord, int64, error) {
	rows, err := db.Query(warehouseMembershipQuery+"WHERE me.id > ? ORDER BY me.id", sinceID)
	if err != nil {
		return nil, sinceID, fmt.Errorf("membership query failed: %w", err)
	}
	defer rows.Close()

	var events []nexadapter.AdapterInboundRecord
	lastID := sinceID

	for rows.Next() {
		var row warehouseMembershipRow
		if err := scanWarehouseMembershipRow(rows, &row); err != nil {
			return nil, lastID, err
		}
		events = append(events, convertWarehouseMembership(row, meIdentifier))
		lastID = row.ID
	}

	return events, lastID, rows.Err()
}

func queryMembershipEventsSince(
	db *sql.DB,
	since time.Time,
	afterID int64,
	limit int,
	meIdentifier string,
) ([]nexadapter.AdapterInboundRecord, int64, error) {
	sinceStr := since.UTC().Format("2006-01-02 15:04:05+00:00")
	rows, err := db.Query(
		warehouseMembershipQuery+"WHERE me.timestamp >= ? AND me.id > ? ORDER BY me.id LIMIT ?",
		sinceStr,
		afterID,
		limit,
	)
	if err != nil {
		return nil, afterID, fmt.Errorf("membership query failed: %w", err)
	}
	defer rows.Close()

	var events []nexadapter.AdapterInboundRecord
	lastID := afterID

	for rows.Next() {
		var row warehouseMembershipRow
		if err := scanWarehouseMembershipRow(rows, &row); err != nil {
			return nil, lastID, err
		}
		events = append(events, convertWarehouseMembership(row, meIdentifier))
		lastID = row.ID
	}

	return events, lastID, rows.Err()
}

func convertWarehouseMembership(row warehouseMembershipRow, meIdentifier string) nexadapter.AdapterInboundRecord {
	peerKind := "direct"
	if row.IsGroup {
		peerKind = "group"
	}

	// Parse timestamp.
	var timestampMs int64
	if row.Timestamp.Valid {
		timestampMs = parseTimestampMs(row.Timestamp.String)
	}

	peerID := strings.TrimSpace(row.ChatIdentifier)
	if peerID == "" {
		peerID = fmt.Sprintf("chat_id:%d", row.ChatID)
	}

	action := mapGroupActionType(row.ActionType.Int64)

	// Determine sender.
	var senderID, senderName string
	if row.IsFromMe {
		senderID = meIdentifier
		if senderID == "" {
			senderID = "me"
		}
		senderName = getFullName()
	} else {
		if row.ActorIdentifier.Valid {
			senderID = row.ActorIdentifier.String
		}
		if row.ActorName.Valid {
			senderName = row.ActorName.String
		}
	}
	if strings.TrimSpace(senderID) == "" {
		senderID = "unknown"
	}

	threadID := deriveThreadID(row.ChatIdentifier, row.ChatID)

	b := nexadapter.NewRecord(platformID, "imessage:membership:"+row.GUID).
		WithTimestampUnixMs(timestampMs).
		WithContent(action).
		WithContentType("membership").
		WithSender(senderID, senderName).
		WithContainer(peerID, peerKind).
		WithThread(threadID).
		WithMetadata("is_from_me", row.IsFromMe).
		WithMetadata("chat_id", row.ChatID).
		WithMetadata("action", action).
		WithMetadata("group_action_type", row.ActionType.Int64).
		WithMetadata("membership_rowid", row.ID).
		WithMetadata("account", "default")

	if row.ActorID.Valid {
		b.WithMetadata("actor_handle_id", row.ActorID.Int64)
	}
	if row.MemberID.Valid {
		b.WithMetadata("member_handle_id", row.MemberID.Int64)
	}
	if row.ItemType.Valid {
		b.WithMetadata("item_type", row.ItemType.Int64)
	}
	if row.MessageActionType.Valid {
		b.WithMetadata("message_action_type", row.MessageActionType.Int64)
	}
	if row.GroupTitle.Valid && strings.TrimSpace(row.GroupTitle.String) != "" {
		b.WithMetadata("group_title", strings.TrimSpace(row.GroupTitle.String))
	}

	return b.Build()
}

func mapReactionType(reactionType int64) string {
	// iMessage reaction types (from iMessage database)
	reactionMap := map[int64]string{
		2000: "❤️", // Love
		2001: "👍",  // Like
		2002: "👎",  // Dislike
		2003: "😂",  // Laugh
		2004: "‼️", // Emphasize
		2005: "❓",  // Question
	}

	if emoji, ok := reactionMap[reactionType]; ok {
		return emoji
	}
	return ""
}

func mapGroupActionType(actionType int64) string {
	switch actionType {
	case 1:
		return "removed"
	case 3:
		return "added"
	default:
		return "unknown"
	}
}

// =====================================================================
// Database helpers
// =====================================================================

// openWarehouse opens Eve's warehouse database (eve.db, read-write),
// running migrations if needed.
func openWarehouse() (*sql.DB, error) {
	cfg := config.Load()

	// Auto-initialize warehouse if it doesn't exist.
	if err := os.MkdirAll(cfg.AppDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create app directory: %w", err)
	}
	if err := migrate.MigrateWarehouse(cfg.EveDBPath); err != nil {
		return nil, fmt.Errorf("warehouse migration failed: %w", err)
	}

	// Open warehouse.
	warehouseDB, err := sql.Open("sqlite3", cfg.EveDBPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open warehouse: %w", err)
	}

	// SQLite is single-writer. Use a single pooled connection and a busy timeout
	// so the monitor can ETL + query without flapping on transient locks.
	warehouseDB.SetMaxOpenConns(1)
	warehouseDB.SetMaxIdleConns(1)

	// PRAGMAs apply per-connection; with MaxOpenConns(1) this is sufficient.
	pragmas := []string{
		"PRAGMA foreign_keys=ON;",
		"PRAGMA busy_timeout=10000;",
		"PRAGMA journal_mode=WAL;",
		"PRAGMA synchronous=NORMAL;",
	}
	for _, pragma := range pragmas {
		if _, err := warehouseDB.Exec(pragma); err != nil {
			_ = warehouseDB.Close()
			return nil, fmt.Errorf("failed to set %s: %w", pragma, err)
		}
	}

	return warehouseDB, nil
}

// openChatDB opens chat.db (read-only). This can fail if the binary lacks Full Disk Access.
func openChatDB() (*etl.ChatDB, error) {
	chatDBPath := etl.GetChatDBPath()
	if chatDBPath == "" {
		return nil, fmt.Errorf("cannot determine chat.db path")
	}
	chatDB, err := etl.OpenChatDB(chatDBPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open chat.db: %w", err)
	}
	return chatDB, nil
}

// getWatermarkRowID reads the current chatdb/message_rowid watermark.
func getWatermarkRowID(db *sql.DB) int64 {
	wm, err := etl.GetWatermark(db, "chatdb", "message_rowid")
	if err != nil || wm == nil || !wm.ValueInt.Valid {
		return 0
	}
	return wm.ValueInt.Int64
}

// =====================================================================
// Utility helpers
// =====================================================================

func escapeAppleScript(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "\"", "\\\"")
	return s
}

func getFullName() string {
	if cachedFullName != "" {
		return cachedFullName
	}
	out, err := exec.Command("id", "-F").Output()
	if err != nil {
		return "Unknown"
	}
	cachedFullName = strings.TrimSpace(string(out))
	return cachedFullName
}

// cachedMeIdentifier stores the best-effort local user's identifier from the warehouse.
// This is usually a phone number or email (preferred over "me").
var cachedMeIdentifier string

func getMeIdentifier(db *sql.DB) string {
	if cachedMeIdentifier != "" {
		return cachedMeIdentifier
	}
	if db == nil {
		return ""
	}

	var identifier sql.NullString
	err := db.QueryRow(`
		SELECT ci.identifier
		FROM contacts c
		JOIN contact_identifiers ci ON ci.contact_id = c.id
		WHERE c.is_me = 1
		ORDER BY
			CASE ci.type
				WHEN 'phone' THEN 1
				WHEN 'email' THEN 2
				WHEN 'handle' THEN 3
				ELSE 4
			END,
			ci.is_primary DESC,
			COALESCE(ci.last_used, '') DESC
		LIMIT 1
	`).Scan(&identifier)
	if err != nil {
		return ""
	}

	cachedMeIdentifier = strings.TrimSpace(identifier.String)
	return cachedMeIdentifier
}

// parseTimestampMs parses a warehouse timestamp string into Unix milliseconds.
// Handles the go-sqlite3 storage format: "2006-01-02 15:04:05.999999999+00:00".
func parseTimestampMs(s string) int64 {
	// go-sqlite3 stores time.Time as "2006-01-02 15:04:05.999999999+00:00"
	formats := []string{
		"2006-01-02 15:04:05.999999999+00:00",
		"2006-01-02 15:04:05.999999999-07:00",
		"2006-01-02T15:04:05.999999999Z07:00",
		"2006-01-02 15:04:05+00:00",
		"2006-01-02T15:04:05Z",
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t.UnixMilli()
		}
	}
	return 0
}
