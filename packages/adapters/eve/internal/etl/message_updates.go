package etl

import (
	"database/sql"
	"fmt"
	"time"
)

const (
	messageUpdateTypeEdit            = "edit"
	messageUpdateTypeRetract         = "retract"
	messageUpdateTypeReactionRemoval = "reaction_removal"
)

// MessageUpdate represents a single edit or retraction observed on a message row.
type MessageUpdate struct {
	ROWID               int64
	OriginalMessageGUID string
	UpdateType          string
	TimestampNS         int64
	Text                sql.NullString
	AttributedBody      []byte
	HandleID            sql.NullInt64
	IsFromMe            bool
	ChatIdentifier      string
	ChatDisplayName     sql.NullString
	ChatServiceName     sql.NullString
	ChatStyle           sql.NullInt64
}

// GetMessageUpdatesSince reads edited and retracted messages whose update timestamp is newer than sinceNS.
//
// Each edit and each retraction produces its own row so replay and ordering stay deterministic.
func (c *ChatDB) GetMessageUpdatesSince(sinceNS int64) ([]MessageUpdate, error) {
	query := `
		SELECT
			m.ROWID,
			m.guid,
			?,
			COALESCE(m.date_edited, 0),
			m.text,
			m.attributedBody,
			m.handle_id,
			m.is_from_me,
			ch.chat_identifier,
			ch.display_name,
			ch.service_name,
			ch.style
		FROM message m
		INNER JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
		INNER JOIN chat ch ON ch.ROWID = cmj.chat_id
		WHERE COALESCE(m.date_edited, 0) > ?
		  AND COALESCE(m.date_edited, 0) > 0
		UNION ALL
		SELECT
			m.ROWID,
			m.guid,
			?,
			COALESCE(m.date_retracted, 0),
			m.text,
			m.attributedBody,
			m.handle_id,
			m.is_from_me,
			ch.chat_identifier,
			ch.display_name,
			ch.service_name,
			ch.style
		FROM message m
		INNER JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
		INNER JOIN chat ch ON ch.ROWID = cmj.chat_id
		WHERE COALESCE(m.date_retracted, 0) > ?
		  AND COALESCE(m.date_retracted, 0) > 0
		UNION ALL
		SELECT
			m.ROWID,
			m.associated_message_guid,
			?,
			COALESCE(m.date, 0),
			m.text,
			m.attributedBody,
			m.handle_id,
			m.is_from_me,
			ch.chat_identifier,
			ch.display_name,
			ch.service_name,
			ch.style
		FROM message m
		INNER JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
		INNER JOIN chat ch ON ch.ROWID = cmj.chat_id
		WHERE COALESCE(m.date, 0) > ?
		  AND m.associated_message_guid IS NOT NULL
		  AND m.associated_message_guid != ''
		  AND COALESCE(m.type, 0) = 0
		  AND (
			m.text LIKE 'Removed a heart from %' OR
			m.text LIKE 'Removed a like from %' OR
			m.text LIKE 'Removed a dislike from %' OR
			m.text LIKE 'Removed a laugh from %' OR
			m.text LIKE 'Removed emphasis from %' OR
			m.text LIKE 'Removed a question mark from %'
		  )
		ORDER BY 4, 1, 3
	`

	rows, err := c.db.Query(
		query,
		messageUpdateTypeEdit,
		sinceNS,
		messageUpdateTypeRetract,
		sinceNS,
		messageUpdateTypeReactionRemoval,
		sinceNS,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query message updates: %w", err)
	}
	defer rows.Close()

	var updates []MessageUpdate
	for rows.Next() {
		var update MessageUpdate
		if err := rows.Scan(
			&update.ROWID,
			&update.OriginalMessageGUID,
			&update.UpdateType,
			&update.TimestampNS,
			&update.Text,
			&update.AttributedBody,
			&update.HandleID,
			&update.IsFromMe,
			&update.ChatIdentifier,
			&update.ChatDisplayName,
			&update.ChatServiceName,
			&update.ChatStyle,
		); err != nil {
			return nil, fmt.Errorf("failed to scan message update: %w", err)
		}
		updates = append(updates, update)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating message updates: %w", err)
	}

	return updates, nil
}

// GetMaxObservedMessageUpdateTimestampNS returns the latest update timestamp
// currently visible through the joined live delta query.
func (c *ChatDB) GetMaxObservedMessageUpdateTimestampNS() (int64, error) {
	query := `
		SELECT COALESCE(MAX(ts), 0)
		FROM (
			SELECT COALESCE(m.date_edited, 0) AS ts
			FROM message m
			INNER JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
			INNER JOIN chat ch ON ch.ROWID = cmj.chat_id
			WHERE COALESCE(m.date_edited, 0) > 0
			UNION ALL
			SELECT COALESCE(m.date_retracted, 0) AS ts
			FROM message m
			INNER JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
			INNER JOIN chat ch ON ch.ROWID = cmj.chat_id
			WHERE COALESCE(m.date_retracted, 0) > 0
			UNION ALL
			SELECT COALESCE(m.date, 0) AS ts
			FROM message m
			INNER JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
			INNER JOIN chat ch ON ch.ROWID = cmj.chat_id
			WHERE COALESCE(m.date, 0) > 0
			  AND m.associated_message_guid IS NOT NULL
			  AND m.associated_message_guid != ''
			  AND COALESCE(m.type, 0) = 0
			  AND (
				m.text LIKE 'Removed a heart from %' OR
				m.text LIKE 'Removed a like from %' OR
				m.text LIKE 'Removed a dislike from %' OR
				m.text LIKE 'Removed a laugh from %' OR
				m.text LIKE 'Removed emphasis from %' OR
				m.text LIKE 'Removed a question mark from %'
			  )
		)
	`

	var maxTimestampNS int64
	if err := c.db.QueryRow(query).Scan(&maxTimestampNS); err != nil {
		return 0, fmt.Errorf("failed to query max observed message update timestamp: %w", err)
	}
	return maxTimestampNS, nil
}

// GetMessageUpdates is kept as a compatibility wrapper for older call sites.
func (c *ChatDB) GetMessageUpdates(sinceNS int64) ([]MessageUpdate, error) {
	return c.GetMessageUpdatesSince(sinceNS)
}

// SyncMessageUpdatesDelta copies edits and retractions from chat.db into warehouse message_updates.
func SyncMessageUpdatesDelta(chatDB *ChatDB, warehouseDB *sql.DB, sinceNS int64) (int, error) {
	result, err := syncMessageUpdatesDeltaResult(chatDB, warehouseDB, sinceNS)
	if err != nil {
		return 0, err
	}
	return result.Count, nil
}

func syncMessageUpdatesDeltaResult(chatDB *ChatDB, warehouseDB *sql.DB, sinceNS int64) (hotSyncTimestampResult, error) {
	updates, err := chatDB.GetMessageUpdatesSince(sinceNS)
	if err != nil {
		return hotSyncTimestampResult{}, fmt.Errorf("failed to read message updates: %w", err)
	}
	result := hotSyncTimestampResult{FrontierTimeNS: maxMessageUpdateFrontier(updates)}
	if len(updates) == 0 {
		return result, nil
	}

	tx, err := warehouseDB.Begin()
	if err != nil {
		return hotSyncTimestampResult{}, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	if err := ensureChatsForMessageUpdates(tx, updates); err != nil {
		return hotSyncTimestampResult{}, err
	}
	chatMap, err := loadWarehouseChatMap(tx)
	if err != nil {
		return hotSyncTimestampResult{}, err
	}
	handleMap, err := loadWarehouseHandleMap(tx, chatDB)
	if err != nil {
		return hotSyncTimestampResult{}, err
	}

	synced := 0
	for _, update := range updates {
		if err := insertMessageUpdate(tx, chatMap, handleMap, &update); err != nil {
			return hotSyncTimestampResult{}, fmt.Errorf("failed to insert message update %d: %w", update.ROWID, err)
		}
		synced++
	}

	if err := tx.Commit(); err != nil {
		return hotSyncTimestampResult{}, fmt.Errorf("failed to commit message update transaction: %w", err)
	}

	result.Count = synced
	return result, nil
}

// SyncMessageUpdates preserves the older name used by the full sync path.
func SyncMessageUpdates(chatDB *ChatDB, warehouseDB *sql.DB, sinceNS int64) (int, error) {
	return SyncMessageUpdatesDelta(chatDB, warehouseDB, sinceNS)
}

func maxMessageUpdateFrontier(updates []MessageUpdate) int64 {
	var maxTimestampNS int64
	for _, update := range updates {
		if update.TimestampNS > maxTimestampNS {
			maxTimestampNS = update.TimestampNS
		}
	}
	return maxTimestampNS
}

func insertMessageUpdate(
	tx *sql.Tx,
	chatMap map[string]int64,
	handleMap map[int64]int64,
	update *MessageUpdate,
) error {
	if update == nil {
		return nil
	}
	switch update.UpdateType {
	case messageUpdateTypeEdit, messageUpdateTypeRetract, messageUpdateTypeReactionRemoval:
	default:
		return nil
	}
	if update.TimestampNS <= 0 || update.OriginalMessageGUID == "" {
		return nil
	}

	warehouseChatID, ok := chatMap[update.ChatIdentifier]
	if !ok {
		return fmt.Errorf("failed to map chat_identifier to warehouse chat id (chat_identifier=%q)", update.ChatIdentifier)
	}

	content := ""
	if update.Text.Valid {
		content = update.Text.String
	}
	if content == "" && len(update.AttributedBody) > 0 {
		content = decodeAttributedBody(update.AttributedBody)
	}
	content = cleanMessageContent(content)

	appleEpoch := time.Date(2001, 1, 1, 0, 0, 0, 0, time.UTC)
	timestamp := appleEpoch.Add(time.Duration(update.TimestampNS) * time.Nanosecond)
	syntheticGUID := fmt.Sprintf("imessage:message_update:%s:%s:%d", update.OriginalMessageGUID, update.UpdateType, update.TimestampNS)

	var senderID *int64
	if update.HandleID.Valid && update.HandleID.Int64 > 0 {
		if contactID, ok := handleMap[update.HandleID.Int64]; ok {
			senderID = &contactID
		}
	}

	if err := upsertMessageUpdate(tx,
		update.OriginalMessageGUID,
		update.UpdateType,
		content,
		timestamp,
		warehouseChatID,
		senderID,
		update.IsFromMe,
		syntheticGUID,
	); err != nil {
		return fmt.Errorf("failed to insert message update: %w", err)
	}

	return nil
}

func upsertMessageUpdate(
	tx *sql.Tx,
	originalMessageGUID string,
	updateType string,
	content string,
	timestamp time.Time,
	chatID int64,
	senderID *int64,
	isFromMe bool,
	guid string,
) error {
	switch updateType {
	case messageUpdateTypeEdit, messageUpdateTypeRetract, messageUpdateTypeReactionRemoval:
	default:
		return nil
	}
	if originalMessageGUID == "" || guid == "" {
		return nil
	}

	query := `
		INSERT INTO message_updates (
			original_message_guid,
			update_type,
			content,
			timestamp,
			chat_id,
			sender_id,
			is_from_me,
			guid
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(guid) DO UPDATE SET
			original_message_guid = excluded.original_message_guid,
			update_type = excluded.update_type,
			content = excluded.content,
			timestamp = excluded.timestamp,
			chat_id = excluded.chat_id,
			sender_id = excluded.sender_id,
			is_from_me = excluded.is_from_me
	`

	if _, err := tx.Exec(
		query,
		originalMessageGUID,
		updateType,
		content,
		timestamp,
		chatID,
		senderID,
		isFromMe,
		guid,
	); err != nil {
		return fmt.Errorf("failed to upsert message update: %w", err)
	}

	return nil
}

func ensureChatsForMessageUpdates(tx *sql.Tx, updates []MessageUpdate) error {
	chats := make([]Chat, 0, len(updates))
	seen := make(map[string]struct{}, len(updates))
	for _, update := range updates {
		if update.ChatIdentifier == "" {
			continue
		}
		if _, ok := seen[update.ChatIdentifier]; ok {
			continue
		}
		seen[update.ChatIdentifier] = struct{}{}
		chats = append(chats, Chat{
			ROWID:          update.ROWID,
			ChatIdentifier: update.ChatIdentifier,
			DisplayName:    update.ChatDisplayName,
			ServiceName:    update.ChatServiceName,
			Style:          int(nullInt64Value(update.ChatStyle)),
		})
	}
	return ensureChats(tx, chats)
}
