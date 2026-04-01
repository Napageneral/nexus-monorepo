// eve-adapter is the Nexus adapter binary for iMessage via Eve.
//
// It uses Eve's warehouse ETL pipeline (chat.db → eve.db) to provide
// normalized, contact-resolved iMessage data through the Nexus adapter protocol.
//
// Usage:
//
//	eve-adapter adapter.info
//	eve-adapter adapter.monitor.start --connection conn-eve
//	eve-adapter imessage.send --connection conn-eve --payload-json '{"target":{"channel":{"platform":"imessage","container_id":"+14155551234"}},"text":"Hello"}'
//	eve-adapter records.backfill --connection conn-eve --since 2026-01-01
//	eve-adapter adapter.health --connection conn-eve
//	eve-adapter adapter.connections.list
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
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
	Path             string `json:"path"`
	Records          int    `json:"records"`
	FirstRecordID    string `json:"first_record_id,omitempty"`
	LastRecordID     string `json:"last_record_id,omitempty"`
	FirstTimestampMs *int64 `json:"first_timestamp_ms,omitempty"`
	LastTimestampMs  *int64 `json:"last_timestamp_ms,omitempty"`
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

type imessageMethodTarget struct {
	ConnectionID string                `json:"connection_id"`
	Channel      nexadapter.ChannelRef `json:"channel"`
	ReplyToID    string                `json:"reply_to_id,omitempty"`
}

type imessageSendRequest struct {
	Target  imessageMethodTarget `json:"target"`
	Text    string               `json:"text,omitempty"`
	Media   string               `json:"media,omitempty"`
	Caption string               `json:"caption,omitempty"`
}

type imessageMethodResult struct {
	Success    bool                         `json:"success"`
	MessageIDs []string                     `json:"message_ids"`
	ChunksSent int                          `json:"chunks_sent"`
	TotalChars int                          `json:"total_chars,omitempty"`
	AttemptID  string                       `json:"attempt_id,omitempty"`
	Status     string                       `json:"status,omitempty"`
	Confirmed  bool                         `json:"confirmed"`
	Executor   string                       `json:"executor,omitempty"`
	Delivery   *imessageDeliveryObservation `json:"delivery,omitempty"`
	Error      *nexadapter.DeliveryError    `json:"error,omitempty"`
}

func boolPtr(value bool) *bool {
	return &value
}

func stringFromAny(value any) string {
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
}

func readMethodSendRequest(req nexadapter.AdapterMethodRequest) (imessageSendRequest, error) {
	payload := req.Payload
	if payload == nil {
		payload = map[string]any{}
	}

	targetRaw, ok := payload["target"].(map[string]any)
	if !ok {
		return imessageSendRequest{}, fmt.Errorf("imessage.send requires payload.target")
	}

	if stringFromAny(targetRaw["connection_id"]) == "" {
		connectionID := strings.TrimSpace(req.ConnectionID)
		if connectionID == "" {
			return imessageSendRequest{}, fmt.Errorf("imessage.send requires --connection or payload.target.connection_id")
		}
		targetRaw["connection_id"] = connectionID
	}

	encoded, err := json.Marshal(map[string]any{
		"target":  targetRaw,
		"text":    payload["text"],
		"media":   payload["media"],
		"caption": payload["caption"],
	})
	if err != nil {
		return imessageSendRequest{}, err
	}

	var sendReq imessageSendRequest
	if err := json.Unmarshal(encoded, &sendReq); err != nil {
		return imessageSendRequest{}, err
	}
	return sendReq, nil
}

func main() {
	if handled, code := maybeRunEdgeConnectCommand(); handled {
		os.Exit(code)
		return
	}
	nexadapter.Run(nexadapter.DefineAdapter(adapterConfig()))
}

func adapterConfig() nexadapter.DefineAdapterConfig[struct{}] {
	return nexadapter.DefineAdapterConfig[struct{}]{
		Platform:          platformID,
		Name:              adapterName,
		Version:           adapterVersion,
		CredentialService: "eve",
		MultiAccount:      true,
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
		Capabilities: adapterChannelCapabilities(),
		Connection: nexadapter.ConnectionHandlers[struct{}]{
			Connections: func(ctx nexadapter.AdapterContext[struct{}]) ([]nexadapter.AdapterConnectionIdentity, error) {
				return eveConnections(ctx.Context)
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
		Methods: declaredAdapterMethods(),
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

	cursors, err := loadOrInitMonitorCursors(warehouseDB)
	if err != nil {
		return fmt.Errorf("failed to load monitor cursors: %w", err)
	}
	nexadapter.LogInfo(
		"monitor starting from message=%d reaction=%d membership=%d",
		cursors.MessageID,
		cursors.ReactionID,
		cursors.MembershipID,
	)

	process := func(reason string, detectionLag time.Duration) error {
		metrics, err := processMonitorBatch(
			ctx,
			warehouseDB,
			chatDB,
			connectionID,
			meIdentifier,
			&cursors,
			func(_ context.Context, records []nexadapter.AdapterInboundRecord) error {
				for _, record := range records {
					emit(record)
				}
				return nil
			},
		)
		if err != nil {
			nexadapter.LogError("monitor batch failed (%s): %v", reason, err)
			return nil
		}

		if metrics.SyncResult != nil {
			nexadapter.LogDebug(
				"monitor batch sync (%s): detect_ms=%d sync_ms=%d handles=%d chats=%d participants=%d messages=%d message_updates=%d reactions=%d membership=%d attachments=%d message_rowid=%d reaction_rowid=%d membership_rowid=%d message_update_ns=%d attachment_rowid=%d",
				reason,
				detectionLag.Milliseconds(),
				metrics.SyncDuration.Milliseconds(),
				metrics.SyncResult.HandlesCount,
				metrics.SyncResult.ChatsCount,
				metrics.SyncResult.ChatParticipantsCount,
				metrics.SyncResult.MessagesCount,
				metrics.SyncResult.MessageUpdatesCount,
				metrics.SyncResult.ReactionsCount,
				metrics.SyncResult.MembershipCount,
				metrics.SyncResult.AttachmentsCount,
				metrics.SyncResult.Watermarks.MessageRowID,
				metrics.SyncResult.Watermarks.ReactionRowID,
				metrics.SyncResult.Watermarks.MembershipRowID,
				metrics.SyncResult.Watermarks.MessageUpdateNS,
				metrics.SyncResult.Watermarks.AttachmentRowID,
			)
		}

		if metrics.MessageCount > 0 || metrics.MessageUpdateCount > 0 || metrics.ReactionCount > 0 || metrics.MembershipCount > 0 {
			nexadapter.LogDebug(
				"monitor batch emit (%s): detect_ms=%d emit_ms=%d total_ms=%d emitted_messages=%d emitted_message_updates=%d emitted_reactions=%d emitted_membership=%d",
				reason,
				detectionLag.Milliseconds(),
				metrics.EmitDuration.Milliseconds(),
				metrics.BatchDuration.Milliseconds(),
				metrics.MessageCount,
				metrics.MessageUpdateCount,
				metrics.ReactionCount,
				metrics.MembershipCount,
			)
		}

		return nil
	}

	processMaintenance := func(reason string) error {
		metrics, err := processMaintenanceBatch(warehouseDB, chatDB)
		if err != nil {
			nexadapter.LogError("maintenance batch failed (%s): %v", reason, err)
			return nil
		}
		if metrics.Result != nil {
			nexadapter.LogDebug(
				"maintenance batch (%s): duration_ms=%d handles=%d addressbook=%d chats=%d participants=%d conversations=%d conversation_run_ns=%d",
				reason,
				metrics.Duration.Milliseconds(),
				metrics.Result.HandlesCount,
				metrics.Result.AddressBookUpdatesCount,
				metrics.Result.ChatsCount,
				metrics.Result.ChatParticipantsCount,
				metrics.Result.ConversationsCount,
				metrics.Result.Watermarks.ConversationRunNS,
			)
		}
		return nil
	}

	if chatDB == nil {
		return runWarehouseOnlyMonitor(ctx, func() error {
			return process("warehouse-only-poll", 0)
		})
	}

	var batchMu sync.Mutex
	lockedProcess := func(reason string, detectionLag time.Duration) error {
		batchMu.Lock()
		defer batchMu.Unlock()
		return process(reason, detectionLag)
	}
	lockedMaintenance := func(reason string) error {
		batchMu.Lock()
		defer batchMu.Unlock()
		return processMaintenance(reason)
	}

	return runWatcherMonitorWithMaintenance(ctx, etl.GetChatDBPath(), lockedProcess, lockedMaintenance, defaultMaintenanceInterval)
}

// ---------- Send ----------

func eveSend(ctx context.Context, req imessageSendRequest) (*imessageMethodResult, error) {
	return currentActionExecutor().Send(ctx, req)
}

func recipientFromThreadID(threadID string) string {
	trimmed := strings.TrimSpace(threadID)
	if trimmed == "" {
		return ""
	}
	return strings.TrimPrefix(trimmed, "imessage:")
}

type appleScriptSendTarget struct {
	Recipient  string
	ChatTarget string
	UseChat    bool
}

var appleScriptAttachmentRoot = defaultAppleScriptAttachmentRoot

var runAppleScriptCommand = func(ctx context.Context, script string) error {
	cmd := exec.CommandContext(ctx, "osascript", "-e", script)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("AppleScript failed: %s (output: %s)", err, string(output))
	}
	return nil
}

func sendAppleScript(ctx context.Context, target appleScriptSendTarget, text, media string) error {
	stagedMedia, err := stageAppleScriptAttachment(media)
	if err != nil {
		return err
	}
	script := buildAppleScriptSendScript(target, text, stagedMedia)
	return runAppleScriptCommand(ctx, script)
}

func buildAppleScriptSendScript(target appleScriptSendTarget, text, media string) string {
	if target.UseChat {
		return fmt.Sprintf(`tell application "Messages"
	set targetChat to chat id "%s"
	%s
	%s
end tell`, escapeAppleScript(target.ChatTarget), appleScriptSendTextClause(text, "targetChat"), appleScriptSendMediaClause(media, "targetChat"))
	}
	return fmt.Sprintf(`tell application "Messages"
	set targetService to 1st account whose service type = iMessage
	set targetBuddy to participant "%s" of targetService
	%s
	%s
end tell`, escapeAppleScript(target.Recipient), appleScriptSendTextClause(text, "targetBuddy"), appleScriptSendMediaClause(media, "targetBuddy"))
}

func appleScriptSendTextClause(text, targetRef string) string {
	if strings.TrimSpace(text) == "" {
		return ""
	}
	return fmt.Sprintf(`if "%s" is not "" then
		send "%s" to %s
	end if`, escapeAppleScript(text), escapeAppleScript(text), targetRef)
}

func appleScriptSendMediaClause(media, targetRef string) string {
	if strings.TrimSpace(media) == "" {
		return ""
	}
	return fmt.Sprintf(`if "%s" is not "" then
		set theFile to POSIX file "%s" as alias
		send theFile to %s
	end if`, escapeAppleScript(media), escapeAppleScript(media), targetRef)
}

func resolveAppleScriptSendTarget(containerID, threadID string) (appleScriptSendTarget, error) {
	raw := strings.TrimSpace(containerID)
	if raw == "" {
		raw = recipientFromThreadID(threadID)
	}
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return appleScriptSendTarget{}, fmt.Errorf("--to is required (or provide --thread)")
	}
	if strings.HasPrefix(raw, "chat_id:") {
		return appleScriptSendTarget{}, fmt.Errorf("chat_id thread targets require a chat identifier or handle")
	}
	if looksLikeAppleScriptHandle(raw) {
		return appleScriptSendTarget{Recipient: raw}, nil
	}
	return appleScriptSendTarget{ChatTarget: raw, UseChat: true}, nil
}

func looksLikeAppleScriptHandle(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return false
	}
	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "imessage:") || strings.HasPrefix(lower, "sms:") || strings.HasPrefix(lower, "auto:") {
		return true
	}
	if strings.Contains(trimmed, "@") {
		return true
	}
	allowed := "+0123456789 ()-"
	for _, ch := range trimmed {
		if !strings.ContainsRune(allowed, ch) {
			return false
		}
	}
	return true
}

func defaultAppleScriptAttachmentRoot() (string, error) {
	if override := strings.TrimSpace(os.Getenv("EVE_APPLESCRIPT_ATTACHMENT_ROOT")); override != "" {
		return filepath.Clean(expandTildePath(override)), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home directory: %w", err)
	}
	return filepath.Join(home, "Library", "Messages", "Attachments", "eve"), nil
}

func stageAppleScriptAttachment(source string) (string, error) {
	trimmed := strings.TrimSpace(source)
	if trimmed == "" {
		return "", nil
	}
	sourcePath := filepath.Clean(expandTildePath(trimmed))
	info, err := os.Stat(sourcePath)
	if err != nil {
		return "", fmt.Errorf("stat media for AppleScript send: %w", err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("media path must be a file: %s", sourcePath)
	}

	root, err := appleScriptAttachmentRoot()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", fmt.Errorf("create AppleScript attachment root: %w", err)
	}
	stageDir, err := os.MkdirTemp(root, "stage-")
	if err != nil {
		return "", fmt.Errorf("create AppleScript stage dir: %w", err)
	}
	destination := filepath.Join(stageDir, filepath.Base(sourcePath))
	if err := copyFile(sourcePath, destination); err != nil {
		return "", err
	}
	return destination, nil
}

func copyFile(sourcePath, destination string) error {
	sourceFile, err := os.Open(sourcePath)
	if err != nil {
		return fmt.Errorf("open media for AppleScript send: %w", err)
	}
	defer sourceFile.Close()

	destinationFile, err := os.Create(destination)
	if err != nil {
		return fmt.Errorf("create staged media for AppleScript send: %w", err)
	}
	defer destinationFile.Close()

	if _, err := io.Copy(destinationFile, sourceFile); err != nil {
		return fmt.Errorf("copy staged media for AppleScript send: %w", err)
	}
	return nil
}

func expandTildePath(path string) string {
	if path == "~" {
		home, err := os.UserHomeDir()
		if err == nil {
			return home
		}
		return path
	}
	if strings.HasPrefix(path, "~/") {
		home, err := os.UserHomeDir()
		if err == nil {
			return filepath.Join(home, strings.TrimPrefix(path, "~/"))
		}
	}
	return path
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
		if w.currentChunk.FirstTimestampMs == nil || *timestamp < *w.currentChunk.FirstTimestampMs {
			value := *timestamp
			w.currentChunk.FirstTimestampMs = &value
		}
		if w.currentChunk.LastTimestampMs == nil || *timestamp > *w.currentChunk.LastTimestampMs {
			value := *timestamp
			w.currentChunk.LastTimestampMs = &value
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
		sinceRowID := getMessageRowIDWatermark(warehouseDB)
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

	// Message updates
	{
		var lastID int64
		for {
			select {
			case <-ctx.Done():
				nexadapter.LogInfo("backfill cancelled after %d events", totalEmitted)
				return nil
			default:
			}

			events, newLastID, err := queryMessageUpdatesSince(
				warehouseDB,
				since,
				lastID,
				batchSize,
				meIdentifier,
			)
			if err != nil {
				return fmt.Errorf("backfill message update query failed: %w", err)
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
	actionCaps := currentActionCapabilities()
	surface := currentSessionSurface()
	if strings.TrimSpace(connectionID) == "" {
		connectionID = defaultConnectionIDFromSurface(surface)
	}

	// Check chat.db accessibility.
	chatDBPath := etl.GetChatDBPath()
	if chatDBPath == "" {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: connectionID,
			Error:        "cannot determine chat.db path",
			Details:      mergeSessionDetails(mergeActionCapabilityFields(map[string]any{}, actionCaps), surface),
		}, nil
	}

	chatDB, err := etl.OpenChatDB(chatDBPath)
	if err != nil {
		return &nexadapter.AdapterHealth{
			Connected:    false,
			ConnectionID: connectionID,
			Error:        fmt.Sprintf("cannot open chat.db: %v", err),
			Details: mergeSessionDetails(mergeActionCapabilityFields(map[string]any{
				"chat_db_path": chatDBPath,
			}, actionCaps), surface),
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
			Details: mergeSessionDetails(mergeActionCapabilityFields(map[string]any{
				"chat_db_path":   chatDBPath,
				"warehouse_path": cfg.EveDBPath,
			}, actionCaps), surface),
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
		Connected:      true,
		ConnectionID:   connectionID,
		Account:        surface.Account,
		AccountContact: surface.AccountContact,
		LastEventAt:    lastEventAt,
		Details: mergeSessionDetails(mergeActionCapabilityFields(map[string]any{
			"chat_db_path":     chatDBPath,
			"warehouse_path":   cfg.EveDBPath,
			"message_count":    msgCount,
			"adapter_contacts": getSelfContactSeeds(),
		}, actionCaps), surface),
	}, nil
}

// ---------- Connections ----------

func eveConnections(_ context.Context) ([]nexadapter.AdapterConnectionIdentity, error) {
	surface := currentSessionSurface()
	return []nexadapter.AdapterConnectionIdentity{
		{
			ID:             defaultConnectionIDFromSurface(surface),
			DisplayName:    defaultDisplayName(),
			Account:        surface.Account,
			AccountContact: surface.AccountContact,
			Status:         "active",
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
		return defaultConnectionID()
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

	health, err := eveHealthFn(ctx, connectionID)
	if err != nil {
		return nil, err
	}
	account, accountContact := getSelfAccountProjection()
	if health.Connected {
		return &nexadapter.AdapterSetupResult{
			Status:         nexadapter.SetupStatusCompleted,
			SessionID:      sessionID,
			ConnectionID:   connectionID,
			Service:        "eve",
			Account:        account,
			AccountContact: accountContact,
			Message:        "Eve can access chat.db and is ready.",
			Metadata: map[string]any{
				"connected":    true,
				"health_error": health.Error,
				"details":      health.Details,
			},
		}, nil
	}

	if requireConfirm && !isEveSetupConfirmed(req.Payload) {
		return &nexadapter.AdapterSetupResult{
			Status:         nexadapter.SetupStatusRequiresInput,
			SessionID:      sessionID,
			ConnectionID:   connectionID,
			Service:        "eve",
			Account:        account,
			AccountContact: accountContact,
			Message:        "Confirm Full Disk Access after enabling it in System Settings.",
			Instructions:   "System Settings -> Privacy & Security -> Full Disk Access -> enable access for Eve and your runtime shell, then submit again.",
			Fields:         eveSetupFields(),
			Metadata: map[string]any{
				"connected":    false,
				"health_error": health.Error,
				"details":      health.Details,
			},
		}, nil
	}

	return &nexadapter.AdapterSetupResult{
		Status:         nexadapter.SetupStatusRequiresInput,
		SessionID:      sessionID,
		ConnectionID:   connectionID,
		Service:        "eve",
		Account:        account,
		AccountContact: accountContact,
		Message:        "Eve still cannot read chat.db.",
		Instructions:   "Grant Full Disk Access to Eve and your runtime shell, then submit again.",
		Fields:         eveSetupFields(),
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
			senderID = preferredSelfIdentifier(getSelfIdentity())
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
		WithMetadata("account", currentSessionSurface().Account)

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
			senderID = preferredSelfIdentifier(getSelfIdentity())
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
		WithMetadata("account", currentSessionSurface().Account)

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
			senderID = preferredSelfIdentifier(getSelfIdentity())
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
		WithMetadata("account", currentSessionSurface().Account)

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

type warehouseMessageUpdateRow struct {
	ID                  int64
	GUID                string
	OriginalMessageGUID string
	UpdateType          string
	Content             sql.NullString
	Timestamp           sql.NullString
	IsFromMe            bool
	ChatID              int64
	SenderContactID     sql.NullInt64
	SenderName          sql.NullString
	SenderIdentifier    sql.NullString
	ChatIdentifier      string
	IsGroup             bool
	ChatName            sql.NullString
}

const warehouseMessageUpdateQuery = `
SELECT
	mu.id, mu.guid, mu.original_message_guid, mu.update_type, mu.content, mu.timestamp,
	mu.is_from_me, mu.chat_id, mu.sender_id,
	sender.name,
	(SELECT ci.identifier FROM contact_identifiers ci
	 WHERE ci.contact_id = mu.sender_id
	 ORDER BY ci.is_primary DESC LIMIT 1),
	ch.chat_identifier, ch.is_group, ch.chat_name
FROM message_updates mu
LEFT JOIN contacts sender ON mu.sender_id = sender.id
LEFT JOIN chats ch ON mu.chat_id = ch.id
`

func scanWarehouseMessageUpdateRow(rows *sql.Rows, row *warehouseMessageUpdateRow) error {
	return rows.Scan(
		&row.ID,
		&row.GUID,
		&row.OriginalMessageGUID,
		&row.UpdateType,
		&row.Content,
		&row.Timestamp,
		&row.IsFromMe,
		&row.ChatID,
		&row.SenderContactID,
		&row.SenderName,
		&row.SenderIdentifier,
		&row.ChatIdentifier,
		&row.IsGroup,
		&row.ChatName,
	)
}

func queryNewMessageUpdates(
	db *sql.DB,
	sinceID int64,
	meIdentifier string,
) ([]nexadapter.AdapterInboundRecord, int64, error) {
	rows, err := db.Query(warehouseMessageUpdateQuery+"WHERE mu.id > ? ORDER BY mu.id", sinceID)
	if err != nil {
		return nil, sinceID, fmt.Errorf("message update query failed: %w", err)
	}
	defer rows.Close()

	var events []nexadapter.AdapterInboundRecord
	lastID := sinceID

	for rows.Next() {
		var row warehouseMessageUpdateRow
		if err := scanWarehouseMessageUpdateRow(rows, &row); err != nil {
			return nil, lastID, err
		}
		events = append(events, convertWarehouseMessageUpdate(row, meIdentifier))
		lastID = row.ID
	}

	return events, lastID, rows.Err()
}

func queryMessageUpdatesSince(
	db *sql.DB,
	since time.Time,
	afterID int64,
	limit int,
	meIdentifier string,
) ([]nexadapter.AdapterInboundRecord, int64, error) {
	sinceStr := since.UTC().Format("2006-01-02 15:04:05+00:00")
	rows, err := db.Query(
		warehouseMessageUpdateQuery+"WHERE mu.timestamp >= ? AND mu.id > ? ORDER BY mu.id LIMIT ?",
		sinceStr,
		afterID,
		limit,
	)
	if err != nil {
		return nil, afterID, fmt.Errorf("message update query failed: %w", err)
	}
	defer rows.Close()

	var events []nexadapter.AdapterInboundRecord
	lastID := afterID

	for rows.Next() {
		var row warehouseMessageUpdateRow
		if err := scanWarehouseMessageUpdateRow(rows, &row); err != nil {
			return nil, lastID, err
		}
		events = append(events, convertWarehouseMessageUpdate(row, meIdentifier))
		lastID = row.ID
	}

	return events, lastID, rows.Err()
}

func convertWarehouseMessageUpdate(row warehouseMessageUpdateRow, meIdentifier string) nexadapter.AdapterInboundRecord {
	peerKind := "direct"
	if row.IsGroup {
		peerKind = "group"
	}

	var timestampMs int64
	if row.Timestamp.Valid {
		timestampMs = parseTimestampMs(row.Timestamp.String)
	}

	peerID := strings.TrimSpace(row.ChatIdentifier)
	if peerID == "" {
		peerID = fmt.Sprintf("chat_id:%d", row.ChatID)
	}

	var senderID, senderName string
	if row.IsFromMe {
		senderID = meIdentifier
		if senderID == "" {
			senderID = preferredSelfIdentifier(getSelfIdentity())
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

	content := ""
	if row.Content.Valid {
		content = row.Content.String
	}

	threadID := deriveThreadID(row.ChatIdentifier, row.ChatID)
	originalRecordID := "imessage:" + row.OriginalMessageGUID

	b := nexadapter.NewRecord(platformID, "imessage:message_update:"+row.GUID).
		WithTimestampUnixMs(timestampMs).
		WithContent(content).
		WithContentType("message_update").
		WithSender(senderID, senderName).
		WithContainer(peerID, peerKind).
		WithThread(threadID).
		WithReplyTo(originalRecordID).
		WithMetadata("is_from_me", row.IsFromMe).
		WithMetadata("chat_id", row.ChatID).
		WithMetadata("update_type", row.UpdateType).
		WithMetadata("original_guid", row.OriginalMessageGUID).
		WithMetadata("reply_to", originalRecordID).
		WithMetadata("account", currentSessionSurface().Account)

	if row.SenderContactID.Valid {
		b.WithMetadata("sender_handle_id", row.SenderContactID.Int64)
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

type selfIdentity struct {
	Name   string   `json:"name"`
	Phones []string `json:"phones,omitempty"`
	Emails []string `json:"emails,omitempty"`
}

var cachedSelfIdentity *selfIdentity
var eveHealthFn = eveHealth

func appendUnique(values []string, value string) []string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return values
	}
	for _, existing := range values {
		if strings.EqualFold(strings.TrimSpace(existing), trimmed) {
			return values
		}
	}
	return append(values, trimmed)
}

func getSelfIdentity() selfIdentity {
	if cachedSelfIdentity != nil {
		return *cachedSelfIdentity
	}

	identity := selfIdentity{Name: getFullName()}
	chatDBPath := etl.GetChatDBPath()
	if chatDBPath != "" {
		chatDB, err := sql.Open("sqlite3", chatDBPath+"?mode=ro")
		if err == nil {
			defer chatDB.Close()
			rows, queryErr := chatDB.Query(`
			SELECT DISTINCT account
			FROM message
			WHERE is_from_me = 1
			  AND account IS NOT NULL
			  AND account != ''
		`)
			if queryErr == nil {
				defer rows.Close()
				for rows.Next() {
					var account string
					if err := rows.Scan(&account); err != nil {
						continue
					}
					switch {
					case strings.HasPrefix(account, "E:"):
						identity.Emails = appendUnique(identity.Emails, strings.TrimPrefix(account, "E:"))
					case strings.HasPrefix(account, "P:"):
						identity.Phones = appendUnique(identity.Phones, strings.TrimPrefix(account, "P:"))
					}
				}
			}
		}
	}

	cachedSelfIdentity = &identity
	return identity
}

func preferredSelfIdentifier(identity selfIdentity) string {
	for _, email := range identity.Emails {
		if trimmed := strings.TrimSpace(email); trimmed != "" {
			return trimmed
		}
	}
	for _, phone := range identity.Phones {
		if trimmed := strings.TrimSpace(phone); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func resolveSelfAccountProjection(identity selfIdentity) (string, *nexadapter.ConnectionAccountContact) {
	for _, email := range identity.Emails {
		trimmed := strings.TrimSpace(email)
		if trimmed == "" {
			continue
		}
		return trimmed, &nexadapter.ConnectionAccountContact{
			Platform:  "email",
			SpaceID:   "",
			ContactID: trimmed,
		}
	}
	for _, phone := range identity.Phones {
		trimmed := strings.TrimSpace(phone)
		if trimmed == "" {
			continue
		}
		return trimmed, &nexadapter.ConnectionAccountContact{
			Platform:  "phone",
			SpaceID:   "",
			ContactID: trimmed,
		}
	}
	return "default", nil
}

func getSelfAccountProjection() (string, *nexadapter.ConnectionAccountContact) {
	return resolveSelfAccountProjection(getSelfIdentity())
}

func getSelfContactSeeds() []map[string]any {
	identity := getSelfIdentity()
	seeds := make([]map[string]any, 0, len(identity.Emails)+len(identity.Phones))
	for _, email := range identity.Emails {
		trimmed := strings.TrimSpace(email)
		if trimmed == "" {
			continue
		}
		seeds = append(seeds, map[string]any{
			"platform":    "email",
			"sender_id":   trimmed,
			"sender_name": identity.Name,
		})
	}
	for _, phone := range identity.Phones {
		trimmed := strings.TrimSpace(phone)
		if trimmed == "" {
			continue
		}
		seeds = append(seeds, map[string]any{
			"platform":    "phone",
			"sender_id":   trimmed,
			"sender_name": identity.Name,
		})
	}
	return seeds
}

// cachedMeIdentifier stores the best-effort local user's identifier from the warehouse.
// This is usually an email or phone number and must never fall back to "me".
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
				WHEN 'email' THEN 1
				WHEN 'phone' THEN 2
				WHEN 'handle' THEN 3
				ELSE 4
			END,
			ci.is_primary DESC,
			COALESCE(ci.last_used, '') DESC
		LIMIT 1
	`).Scan(&identifier)
	if err != nil {
		cachedMeIdentifier = preferredSelfIdentifier(getSelfIdentity())
		return cachedMeIdentifier
	}

	cachedMeIdentifier = strings.TrimSpace(identifier.String)
	if cachedMeIdentifier == "" {
		cachedMeIdentifier = preferredSelfIdentifier(getSelfIdentity())
	}
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
