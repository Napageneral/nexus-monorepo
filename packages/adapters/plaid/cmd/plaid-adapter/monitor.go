package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	provider "github.com/nexus-project/adapter-plaid/internal/plaid"
	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const defaultMonitorInterval = 15 * time.Minute
const defaultEmitInterval = 50 * time.Millisecond
const transactionPageSize = 500

func monitor(ctx nexadapter.AdapterContext[*provider.Client], emit nexadapter.EmitFunc) error {
	connectionID, err := nexadapter.RequireConnection(ctx.ConnectionID)
	if err != nil {
		return err
	}
	interval, err := resolveMonitorInterval()
	if err != nil {
		return err
	}
	emitInterval, err := resolveEmitInterval()
	if err != nil {
		return err
	}
	emit = pacedEmit(ctx.Context, emit, emitInterval)

	// The cursor deliberately lives only for the lifetime of this monitor
	// process. A restart replays the Item from the initial cursor and relies on
	// deterministic record ids for idempotency. That is more work than a local
	// cursor file, but it prevents a host-side cursor commit from getting ahead
	// of Nex's durable records ledger.
	cursor := ""
	for {
		nextCursor, pollErr := pollPlaidSource(ctx.Context, ctx.Client, connectionID, cursor, emit)
		if pollErr != nil {
			return pollErr
		}
		cursor = nextCursor

		select {
		case <-ctx.Context.Done():
			return nil
		case <-time.After(interval):
		}
	}
}

func resolveEmitInterval() (time.Duration, error) {
	raw := strings.TrimSpace(os.Getenv("NEXUS_PLAID_EMIT_INTERVAL"))
	if raw == "" {
		return defaultEmitInterval, nil
	}
	interval, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("invalid NEXUS_PLAID_EMIT_INTERVAL: %w", err)
	}
	if interval < 10*time.Millisecond || interval > time.Second {
		return 0, fmt.Errorf("NEXUS_PLAID_EMIT_INTERVAL must be between 10ms and 1s")
	}
	return interval, nil
}

func pacedEmit(ctx context.Context, emit nexadapter.EmitFunc, interval time.Duration) nexadapter.EmitFunc {
	return func(record any) {
		emit(record)
		delay := interval
		if inbound, ok := record.(nexadapter.AdapterInboundRecord); ok {
			family, _ := inbound.Payload.Metadata["family"].(string)
			if family == "transaction_sync_packet" || family == "transaction_sync_page" {
				delay = maxDuration(delay, 250*time.Millisecond)
			}
		}
		timer := time.NewTimer(delay)
		defer timer.Stop()
		select {
		case <-ctx.Done():
		case <-timer.C:
		}
	}
}

func maxDuration(left time.Duration, right time.Duration) time.Duration {
	if left > right {
		return left
	}
	return right
}

func resolveMonitorInterval() (time.Duration, error) {
	raw := strings.TrimSpace(os.Getenv("NEXUS_PLAID_MONITOR_INTERVAL"))
	if raw == "" {
		return defaultMonitorInterval, nil
	}
	interval, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("invalid NEXUS_PLAID_MONITOR_INTERVAL: %w", err)
	}
	if interval < time.Minute || interval > 24*time.Hour {
		return 0, fmt.Errorf("NEXUS_PLAID_MONITOR_INTERVAL must be between 1m and 24h")
	}
	return interval, nil
}

func pollPlaidSource(
	ctx context.Context,
	client *provider.Client,
	connectionID string,
	cursor string,
	emit nexadapter.EmitFunc,
) (string, error) {
	item, err := client.GetItem(ctx)
	if err != nil {
		return cursor, err
	}
	emit(buildItemSnapshotRecord(connectionID, item))
	if err := itemAttentionError(item.Item); err != nil {
		return cursor, err
	}

	accounts, err := client.GetAccounts(ctx)
	if err != nil {
		return cursor, err
	}
	emit(buildAccountSnapshotRecord(connectionID, item.Item, accounts))

	syncResult, err := client.SyncTransactions(ctx, provider.SyncOptions{
		Cursor:      cursor,
		Count:       transactionPageSize,
		MaxPages:    1000,
		MaxRestarts: 3,
	})
	if err != nil {
		return cursor, err
	}
	packetRecord := buildTransactionSyncPacketRecord(connectionID, item.Item, syncResult)
	emit(packetRecord)
	for _, pageRecord := range buildTransactionSyncPageRecords(connectionID, item.Item, syncResult) {
		emit(pageRecord)
	}
	if syncResult.CompletionState != "complete" || !syncResult.CursorCommitAllowed || syncResult.TerminalError != nil {
		return cursor, fmt.Errorf("Plaid transaction sync did not complete; cursor was not advanced")
	}
	if strings.TrimSpace(syncResult.NextCursor) == "" {
		return cursor, fmt.Errorf("Plaid transaction sync completed without a next cursor")
	}
	for _, change := range syncResult.Changes {
		emit(buildTransactionChangeRecord(
			connectionID,
			item.Item,
			change,
			packetRecord.Payload.ExternalRecordID,
		))
	}
	return syncResult.NextCursor, nil
}

func itemAttentionError(item provider.ItemSummary) error {
	if len(item.ProviderError) > 0 {
		return fmt.Errorf("Plaid Item %s requires attention", item.ProviderItemID)
	}
	success, successOK := parseProviderTimestamp(item.LastSuccessfulUpdate)
	failure, failureOK := parseProviderTimestamp(item.LastFailedUpdate)
	if failureOK && (!successOK || failure.After(success)) {
		return fmt.Errorf("Plaid Item %s failed after its last successful update", item.ProviderItemID)
	}
	if expiration, ok := parseProviderTimestamp(item.ConsentExpirationTime); ok && !expiration.After(time.Now().UTC()) {
		return fmt.Errorf("Plaid Item %s consent has expired", item.ProviderItemID)
	}
	return nil
}

func buildItemSnapshotRecord(connectionID string, result provider.ItemResult) nexadapter.AdapterInboundRecord {
	externalRecordID := fmt.Sprintf("item:%s:health", itemIdentity(result.Item, connectionID))
	return sourceRecord(
		connectionID,
		result.Item,
		externalRecordID,
		evidenceTimestamp(result.Evidence),
		"item_health_snapshot",
		fmt.Sprintf("Plaid Item health institution=%s item=%s", result.Item.InstitutionID, result.Item.ProviderItemID),
		completeProviderSnapshot(result.Raw, map[string]any{
			"item":                result.Item,
			"evidence":            result.Evidence,
			"credential_bindings": result.CredentialBindings,
		}),
	)
}

func buildAccountSnapshotRecord(
	connectionID string,
	item provider.ItemSummary,
	result provider.AccountsResult,
) nexadapter.AdapterInboundRecord {
	externalRecordID := fmt.Sprintf("item:%s:accounts", itemIdentity(item, connectionID))
	return sourceRecord(
		connectionID,
		item,
		externalRecordID,
		evidenceTimestamp(result.Evidence),
		"account_snapshot",
		fmt.Sprintf("Plaid account snapshot accounts=%d", len(result.Accounts)),
		completeProviderSnapshot(result.Raw, map[string]any{
			"accounts":            result.Accounts,
			"evidence":            result.Evidence,
			"credential_bindings": result.CredentialBindings,
		}),
	)
}

func buildTransactionSyncPacketRecord(
	connectionID string,
	item provider.ItemSummary,
	result provider.TransactionSyncResult,
) nexadapter.AdapterInboundRecord {
	externalRecordID := transactionSyncPacketExternalID(result)
	pageRecordIDs := transactionSyncPageExternalIDs(result)
	return sourceRecord(
		connectionID,
		item,
		externalRecordID,
		transactionSyncTimestamp(result),
		"transaction_sync_packet",
		fmt.Sprintf(
			"Plaid transaction sync state=%s added=%d modified=%d removed=%d",
			result.CompletionState,
			len(result.Added),
			len(result.Modified),
			len(result.Removed),
		),
		map[string]any{
			"sync_result": map[string]any{
				"credential_bindings":   result.CredentialBindings,
				"completion_state":      result.CompletionState,
				"cursor_commit_allowed": result.CursorCommitAllowed,
				"starting_cursor":       result.StartingCursor,
				"next_cursor":           result.NextCursor,
				"pages":                 result.Pages,
				"restarts":              result.Restarts,
				"added_count":           len(result.Added),
				"modified_count":        len(result.Modified),
				"removed_count":         len(result.Removed),
				"change_count":          len(result.Changes),
				"page_record_ids":       pageRecordIDs,
				"terminal_error":        result.TerminalError,
			},
		},
	)
}

func buildTransactionSyncPageRecords(
	connectionID string,
	item provider.ItemSummary,
	result provider.TransactionSyncResult,
) []nexadapter.AdapterInboundRecord {
	records := make([]nexadapter.AdapterInboundRecord, 0, len(result.PageEvidence))
	for index, evidence := range result.PageEvidence {
		externalRecordID := transactionSyncPageExternalID(result, index)
		updateStatus := ""
		if index < len(result.RawPages) {
			updateStatus = transactionsUpdateStatus(result.RawPages[index])
		}
		snapshot := map[string]any{
			"page_number":                index + 1,
			"page_count":                 len(result.PageEvidence),
			"transactions_update_status": updateStatus,
			"evidence":                   evidence,
		}
		if index < len(result.RawPages) {
			snapshot = completeProviderSnapshot(result.RawPages[index], snapshot)
		}
		records = append(records, sourceRecord(
			connectionID,
			item,
			externalRecordID,
			evidenceTimestamp(evidence),
			"transaction_sync_page",
			fmt.Sprintf(
				"Plaid transaction sync page=%d/%d update_status=%s",
				index+1,
				len(result.PageEvidence),
				updateStatus,
			),
			snapshot,
		))
	}
	return records
}

func transactionSyncPageExternalIDs(
	result provider.TransactionSyncResult,
) []string {
	recordIDs := make([]string, 0, len(result.PageEvidence))
	for index := range result.PageEvidence {
		recordIDs = append(
			recordIDs,
			transactionSyncPageExternalID(result, index),
		)
	}
	return recordIDs
}

func transactionSyncPageExternalID(result provider.TransactionSyncResult, index int) string {
	return fmt.Sprintf("transaction-sync:%s:page:%04d", cursorIdentity(result.StartingCursor), index+1)
}

func transactionSyncPacketExternalID(result provider.TransactionSyncResult) string {
	return fmt.Sprintf("transaction-sync:%s:packet:%s", cursorIdentity(result.StartingCursor), cursorIdentity(result.NextCursor))
}

func cursorIdentity(value string) string {
	if trimmed := strings.TrimSpace(value); trimmed != "" {
		return nexadapter.SafeIDToken(trimmed)
	}
	return "initial"
}

func transactionsUpdateStatus(raw json.RawMessage) string {
	var page struct {
		TransactionsUpdateStatus string `json:"transactions_update_status"`
	}
	if err := json.Unmarshal(raw, &page); err != nil {
		return ""
	}
	return strings.TrimSpace(page.TransactionsUpdateStatus)
}

func buildTransactionChangeRecord(
	connectionID string,
	item provider.ItemSummary,
	change provider.TransactionChange,
	packetRecordID string,
) nexadapter.AdapterInboundRecord {
	externalRecordID := fmt.Sprintf("transaction:%s", nexadapter.SafeIDToken(change.ProviderTransactionID))
	timestamp, ok := parseProviderTimestamp(change.ObservedAt)
	if !ok {
		timestamp = time.Now().UTC()
	}
	return sourceRecord(
		connectionID,
		item,
		externalRecordID,
		timestamp.UnixMilli(),
		"transaction_change",
		fmt.Sprintf(
			"Plaid transaction change action=%s transaction=%s account=%s",
			change.ChangeAction,
			change.ProviderTransactionID,
			change.ProviderAccountID,
		),
		completeProviderSnapshot(change.Raw, map[string]any{
			"change":                         change,
			"sync_packet_external_record_id": packetRecordID,
		}),
	)
}

func sourceRecord(
	connectionID string,
	item provider.ItemSummary,
	recordID string,
	timestamp int64,
	family string,
	content string,
	snapshot map[string]any,
) nexadapter.AdapterInboundRecord {
	if timestamp <= 0 {
		timestamp = time.Now().UTC().UnixMilli()
	}
	institutionID := strings.TrimSpace(item.InstitutionID)
	if institutionID == "" {
		institutionID = "plaid"
	}
	itemID := strings.TrimSpace(item.ProviderItemID)
	if itemID == "" {
		itemID = connectionID
	}
	payloadMetadata := map[string]any{
		"automation_eligible":       false,
		"family":                    family,
		"source_observation_reason": "plaid_readonly_financial_source",
	}
	providerAccountRef := itemID
	sourceRecordType := "plaid." + family
	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Adapter:            adapterName,
			Platform:           platformID,
			ConnectionID:       connectionID,
			ProviderAccountRef: &providerAccountRef,
			SenderID:           institutionID,
			SenderName:         "Plaid",
			ReceiverID:         connectionID,
			SpaceID:            itemID,
			SpaceName:          institutionID,
			ContainerKind:      "group",
			ContainerID:        "financial_source",
			ContainerName:      "Plaid read-only source",
			ThreadID:           "plaid:item:" + nexadapter.SafeIDToken(itemID),
			ThreadName:         connectionID,
			Metadata: map[string]any{
				"family": family,
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: recordID,
			SourceRecordType: &sourceRecordType,
			Timestamp:        timestamp,
			Content:          content,
			ContentType:      "text",
			Payload:          snapshot,
			Metadata:         payloadMetadata,
		},
	}
}

func completeProviderSnapshot(raw json.RawMessage, additional map[string]any) map[string]any {
	digest := sha256.Sum256(raw)
	snapshot := make(map[string]any, len(additional)+2)
	for key, value := range additional {
		snapshot[key] = value
	}
	snapshot["provider_object_json"] = string(raw)
	snapshot["provider_object_sha256"] = hex.EncodeToString(digest[:])
	return snapshot
}

func itemIdentity(item provider.ItemSummary, fallback string) string {
	if providerID := strings.TrimSpace(item.ProviderItemID); providerID != "" {
		return nexadapter.SafeIDToken(providerID)
	}
	return nexadapter.SafeIDToken(fallback)
}

func evidenceTimestamp(evidence provider.SourceEvidence) int64 {
	if parsed, ok := parseProviderTimestamp(evidence.FetchedAt); ok {
		return parsed.UnixMilli()
	}
	return time.Now().UTC().UnixMilli()
}

func transactionSyncTimestamp(result provider.TransactionSyncResult) int64 {
	for index := len(result.PageEvidence) - 1; index >= 0; index-- {
		if parsed, ok := parseProviderTimestamp(result.PageEvidence[index].FetchedAt); ok {
			return parsed.UnixMilli()
		}
	}
	return time.Now().UTC().UnixMilli()
}

func parseProviderTimestamp(value string) (time.Time, bool) {
	parsed, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(value))
	if err != nil {
		return time.Time{}, false
	}
	return parsed.UTC(), true
}
