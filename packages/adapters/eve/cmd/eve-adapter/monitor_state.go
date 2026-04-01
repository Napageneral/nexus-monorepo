package main

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"

	"github.com/nexus-project/adapter-eve/internal/etl"
	"github.com/nexus-project/adapter-eve/internal/livewatch"
)

const (
	monitorWatermarkSource         = "monitor"
	monitorMessageCursorName       = "message_id"
	monitorMessageUpdateCursorName = "message_update_id"
	monitorReactionCursorName      = "reaction_id"
	monitorMembershipCursorName    = "membership_id"
	chatDBWatermarkSource          = "chatdb"
	chatDBMessageRowIDName         = "message_rowid"
	defaultHotSweepInterval        = 0 * time.Second
	defaultMaintenanceInterval     = 15 * time.Minute
)

type monitorCursors struct {
	MessageID       int64
	MessageUpdateID int64
	ReactionID      int64
	MembershipID    int64
}

type monitorBatchMetrics struct {
	SyncDuration       time.Duration
	EmitDuration       time.Duration
	BatchDuration      time.Duration
	SyncResult         *etl.HotSyncResult
	MessageCount       int
	MessageUpdateCount int
	ReactionCount      int
	MembershipCount    int
}

type maintenanceBatchMetrics struct {
	Duration time.Duration
	Result   *etl.MaintenanceSyncResult
}

type monitorBatchPublisher func(context.Context, []nexadapter.AdapterInboundRecord) error

type collectedMonitorBatch struct {
	Records            []nexadapter.AdapterInboundRecord
	NextCursors        monitorCursors
	MessageCount       int
	MessageUpdateCount int
	ReactionCount      int
	MembershipCount    int
}

var livewatchEventsFactory = func(ctx context.Context, chatDBPath string) <-chan livewatch.Event {
	return livewatch.New(
		chatDBPath,
		livewatch.WithPollInterval(50*time.Millisecond),
		livewatch.WithDebounce(50*time.Millisecond),
	).Events(ctx)
}

func loadOrInitMonitorCursors(db *sql.DB) (monitorCursors, error) {
	messageID, err := loadOrInitMonitorCursor(
		db,
		monitorMessageCursorName,
		"SELECT COALESCE(MAX(id), 0) FROM messages",
	)
	if err != nil {
		return monitorCursors{}, err
	}

	messageUpdateID, err := loadOrInitMonitorCursor(
		db,
		monitorMessageUpdateCursorName,
		"SELECT COALESCE(MAX(id), 0) FROM message_updates",
	)
	if err != nil {
		return monitorCursors{}, err
	}

	reactionID, err := loadOrInitMonitorCursor(
		db,
		monitorReactionCursorName,
		"SELECT COALESCE(MAX(id), 0) FROM reactions",
	)
	if err != nil {
		return monitorCursors{}, err
	}

	membershipID, err := loadOrInitMonitorCursor(
		db,
		monitorMembershipCursorName,
		"SELECT COALESCE(MAX(id), 0) FROM membership_events",
	)
	if err != nil {
		return monitorCursors{}, err
	}

	return monitorCursors{
		MessageID:       messageID,
		MessageUpdateID: messageUpdateID,
		ReactionID:      reactionID,
		MembershipID:    membershipID,
	}, nil
}

func loadOrInitMonitorCursor(db *sql.DB, name, initQuery string) (int64, error) {
	wm, err := etl.GetWatermark(db, monitorWatermarkSource, name)
	if err != nil {
		return 0, err
	}
	if wm != nil && wm.ValueInt.Valid {
		return wm.ValueInt.Int64, nil
	}

	var value int64
	if err := db.QueryRow(initQuery).Scan(&value); err != nil {
		return 0, fmt.Errorf("initialize %s cursor: %w", name, err)
	}
	if err := etl.SetWatermark(db, monitorWatermarkSource, name, &value, nil); err != nil {
		return 0, err
	}
	return value, nil
}

func setMonitorCursor(db *sql.DB, name string, value int64) error {
	return etl.SetWatermark(db, monitorWatermarkSource, name, &value, nil)
}

func getMessageRowIDWatermark(db *sql.DB) int64 {
	value, err := etl.GetWatermarkInt(db, chatDBWatermarkSource, chatDBMessageRowIDName)
	if err != nil {
		return 0
	}
	return value
}

func setMessageRowIDWatermark(db *sql.DB, value int64) error {
	return etl.SetWatermark(db, chatDBWatermarkSource, chatDBMessageRowIDName, &value, nil)
}

func runWatcherMonitor(
	ctx context.Context,
	chatDBPath string,
	process func(reason string, detectionLag time.Duration) error,
) error {
	return runWatcherMonitorWithCadence(
		ctx,
		chatDBPath,
		process,
		nil,
		defaultMaintenanceInterval,
		defaultHotSweepInterval,
	)
}

func runWatcherMonitorWithMaintenance(
	ctx context.Context,
	chatDBPath string,
	process func(reason string, detectionLag time.Duration) error,
	runMaintenance func(reason string) error,
	maintenanceInterval time.Duration,
) error {
	return runWatcherMonitorWithCadence(
		ctx,
		chatDBPath,
		process,
		runMaintenance,
		maintenanceInterval,
		defaultHotSweepInterval,
	)
}

func runWatcherMonitorWithCadence(
	ctx context.Context,
	chatDBPath string,
	process func(reason string, detectionLag time.Duration) error,
	runMaintenance func(reason string) error,
	maintenanceInterval time.Duration,
	hotSweepInterval time.Duration,
) error {
	watchCtx, watchCancel := context.WithCancel(ctx)
	defer watchCancel()

	// Start the watcher before the startup sync so chat.db changes that land
	// during the initial batch cannot be baselined away.
	events := livewatchEventsFactory(watchCtx, chatDBPath)

	if err := process("startup", 0); err != nil {
		return err
	}
	if runMaintenance != nil {
		if err := runMaintenance("startup"); err != nil {
			return err
		}
	}

	var maintenanceTicker *time.Ticker
	var maintenanceC <-chan time.Time
	if runMaintenance != nil && maintenanceInterval > 0 {
		maintenanceTicker = time.NewTicker(maintenanceInterval)
		maintenanceC = maintenanceTicker.C
		defer maintenanceTicker.Stop()
	}

	var hotSweepTicker *time.Ticker
	var hotSweepC <-chan time.Time
	if hotSweepInterval > 0 {
		hotSweepTicker = time.NewTicker(hotSweepInterval)
		hotSweepC = hotSweepTicker.C
		defer hotSweepTicker.Stop()
	}

	for {
		select {
		case <-ctx.Done():
			nexadapter.LogInfo("monitor shutting down")
			return nil
		case event, ok := <-events:
			if !ok {
				return nil
			}
			detectionLag := latestWatchLag(event)
			if err := process("filesystem", detectionLag); err != nil {
				return err
			}
		case <-hotSweepC:
			if err := process("interval", 0); err != nil {
				return err
			}
		case <-maintenanceC:
			if err := runMaintenance("interval"); err != nil {
				return err
			}
		}
	}
}

func latestWatchLag(event livewatch.Event) time.Duration {
	latest := event.DBModTime
	if event.WALModTime.After(latest) {
		latest = event.WALModTime
	}
	if event.SHMModTime.After(latest) {
		latest = event.SHMModTime
	}
	if latest.IsZero() {
		return 0
	}
	lag := event.ObservedAt.Sub(latest)
	if lag < 0 {
		return 0
	}
	return lag
}

func runWarehouseOnlyMonitor(
	ctx context.Context,
	process func() error,
) error {
	if err := process(); err != nil {
		return err
	}
	<-ctx.Done()
	nexadapter.LogInfo("monitor shutting down")
	return nil
}

func processMonitorBatch(
	ctx context.Context,
	warehouseDB *sql.DB,
	chatDB *etl.ChatDB,
	connectionID string,
	meIdentifier string,
	cursors *monitorCursors,
	publish monitorBatchPublisher,
) (monitorBatchMetrics, error) {
	start := time.Now()
	metrics := monitorBatchMetrics{}

	if chatDB != nil {
		syncStart := time.Now()
		syncResult, err := etl.HotSync(chatDB, warehouseDB)
		metrics.SyncDuration = time.Since(syncStart)
		if err != nil {
			return metrics, fmt.Errorf("sync failed: %w", err)
		}
		metrics.SyncResult = syncResult
	}

	emitStart := time.Now()
	batch, err := collectMonitorBatch(warehouseDB, connectionID, meIdentifier, *cursors)
	if err != nil {
		return metrics, err
	}
	if len(batch.Records) > 0 {
		if err := publish(ctx, batch.Records); err != nil {
			return metrics, err
		}
		if err := reconcileActionAttempts(warehouseDB, batch.Records); err != nil {
			return metrics, fmt.Errorf("reconcile action attempts: %w", err)
		}
	}
	if err := persistMonitorCursors(warehouseDB, *cursors, batch.NextCursors); err != nil {
		return metrics, err
	}
	*cursors = batch.NextCursors

	metrics.EmitDuration = time.Since(emitStart)
	metrics.BatchDuration = time.Since(start)
	metrics.MessageCount = batch.MessageCount
	metrics.MessageUpdateCount = batch.MessageUpdateCount
	metrics.ReactionCount = batch.ReactionCount
	metrics.MembershipCount = batch.MembershipCount
	return metrics, nil
}

func collectMonitorBatch(
	warehouseDB *sql.DB,
	connectionID string,
	meIdentifier string,
	cursors monitorCursors,
) (collectedMonitorBatch, error) {
	batch := collectedMonitorBatch{
		NextCursors: cursors,
	}

	messageEvents, newMessageID, err := queryNewMessages(warehouseDB, cursors.MessageID, meIdentifier)
	if err != nil {
		return batch, fmt.Errorf("query new messages: %w", err)
	}
	for _, event := range messageEvents {
		batch.Records = append(batch.Records, bindConnection(event, connectionID))
	}
	if newMessageID > batch.NextCursors.MessageID {
		batch.NextCursors.MessageID = newMessageID
	}
	batch.MessageCount = len(messageEvents)

	messageUpdateEvents, newMessageUpdateID, err := queryNewMessageUpdates(
		warehouseDB,
		cursors.MessageUpdateID,
		meIdentifier,
	)
	if err != nil {
		return batch, fmt.Errorf("query new message updates: %w", err)
	}
	for _, event := range messageUpdateEvents {
		batch.Records = append(batch.Records, bindConnection(event, connectionID))
	}
	if newMessageUpdateID > batch.NextCursors.MessageUpdateID {
		batch.NextCursors.MessageUpdateID = newMessageUpdateID
	}
	batch.MessageUpdateCount = len(messageUpdateEvents)

	reactionEvents, newReactionID, err := queryNewReactions(warehouseDB, cursors.ReactionID, meIdentifier)
	if err != nil {
		return batch, fmt.Errorf("query new reactions: %w", err)
	}
	for _, event := range reactionEvents {
		batch.Records = append(batch.Records, bindConnection(event, connectionID))
	}
	if newReactionID > batch.NextCursors.ReactionID {
		batch.NextCursors.ReactionID = newReactionID
	}
	batch.ReactionCount = len(reactionEvents)

	membershipEvents, newMembershipID, err := queryNewMembershipEvents(
		warehouseDB,
		cursors.MembershipID,
		meIdentifier,
	)
	if err != nil {
		return batch, fmt.Errorf("query new membership events: %w", err)
	}
	for _, event := range membershipEvents {
		batch.Records = append(batch.Records, bindConnection(event, connectionID))
	}
	if newMembershipID > batch.NextCursors.MembershipID {
		batch.NextCursors.MembershipID = newMembershipID
	}
	batch.MembershipCount = len(membershipEvents)

	return batch, nil
}

func persistMonitorCursors(db *sql.DB, previous, next monitorCursors) error {
	if next.MessageID > previous.MessageID {
		if err := setMonitorCursor(db, monitorMessageCursorName, next.MessageID); err != nil {
			return fmt.Errorf("persist message cursor: %w", err)
		}
	}
	if next.MessageUpdateID > previous.MessageUpdateID {
		if err := setMonitorCursor(db, monitorMessageUpdateCursorName, next.MessageUpdateID); err != nil {
			return fmt.Errorf("persist message update cursor: %w", err)
		}
	}
	if next.ReactionID > previous.ReactionID {
		if err := setMonitorCursor(db, monitorReactionCursorName, next.ReactionID); err != nil {
			return fmt.Errorf("persist reaction cursor: %w", err)
		}
	}
	if next.MembershipID > previous.MembershipID {
		if err := setMonitorCursor(db, monitorMembershipCursorName, next.MembershipID); err != nil {
			return fmt.Errorf("persist membership cursor: %w", err)
		}
	}
	return nil
}

func runEdgeMonitorStream(
	ctx context.Context,
	connectionID string,
	transport *edgeSessionTransport,
) error {
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
		nexadapter.LogInfo("edge stream: cannot open chat.db (sync disabled): %v", chatErr)
	}

	meIdentifier := getMeIdentifier(warehouseDB)
	cursors, err := loadOrInitMonitorCursors(warehouseDB)
	if err != nil {
		return fmt.Errorf("failed to load monitor cursors: %w", err)
	}

	process := func(reason string, detectionLag time.Duration) error {
		metrics, err := processMonitorBatch(
			ctx,
			warehouseDB,
			chatDB,
			connectionID,
			meIdentifier,
			&cursors,
			func(ctx context.Context, records []nexadapter.AdapterInboundRecord) error {
				if len(records) == 0 {
					return nil
				}
				return transport.sendCanonicalRecords(ctx, records)
			},
		)
		if err != nil {
			return fmt.Errorf("edge stream batch failed (%s): %w", reason, err)
		}

		if metrics.SyncResult != nil {
			nexadapter.LogDebug(
				"edge stream sync (%s): detect_ms=%d sync_ms=%d messages=%d message_updates=%d reactions=%d membership=%d attachments=%d",
				reason,
				detectionLag.Milliseconds(),
				metrics.SyncDuration.Milliseconds(),
				metrics.SyncResult.MessagesCount,
				metrics.SyncResult.MessageUpdatesCount,
				metrics.SyncResult.ReactionsCount,
				metrics.SyncResult.MembershipCount,
				metrics.SyncResult.AttachmentsCount,
			)
		}
		if metrics.MessageCount > 0 || metrics.MessageUpdateCount > 0 || metrics.ReactionCount > 0 || metrics.MembershipCount > 0 {
			nexadapter.LogDebug(
				"edge stream emit (%s): detect_ms=%d emit_ms=%d total_ms=%d emitted_messages=%d emitted_message_updates=%d emitted_reactions=%d emitted_membership=%d",
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
			return fmt.Errorf("edge maintenance batch failed (%s): %w", reason, err)
		}
		if metrics.Result != nil {
			nexadapter.LogDebug(
				"edge maintenance batch (%s): duration_ms=%d handles=%d addressbook=%d chats=%d participants=%d conversations=%d",
				reason,
				metrics.Duration.Milliseconds(),
				metrics.Result.HandlesCount,
				metrics.Result.AddressBookUpdatesCount,
				metrics.Result.ChatsCount,
				metrics.Result.ChatParticipantsCount,
				metrics.Result.ConversationsCount,
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

	return runWatcherMonitorWithMaintenance(
		ctx,
		etl.GetChatDBPath(),
		lockedProcess,
		lockedMaintenance,
		defaultMaintenanceInterval,
	)
}

func processMaintenanceBatch(
	warehouseDB *sql.DB,
	chatDB *etl.ChatDB,
) (maintenanceBatchMetrics, error) {
	start := time.Now()
	metrics := maintenanceBatchMetrics{}

	if chatDB == nil {
		metrics.Duration = time.Since(start)
		return metrics, nil
	}

	result, err := etl.MaintenanceSync(chatDB, warehouseDB)
	metrics.Duration = time.Since(start)
	if err != nil {
		return metrics, fmt.Errorf("maintenance sync failed: %w", err)
	}
	metrics.Result = result
	return metrics, nil
}
