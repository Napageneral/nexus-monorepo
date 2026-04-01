package etl

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// Message represents a message from chat.db
type Message struct {
	ROWID                 int64
	GUID                  string
	Text                  sql.NullString
	AttributedBody        []byte
	HandleID              sql.NullInt64
	Date                  int64 // Apple timestamp (nanoseconds since 2001-01-01)
	IsFromMe              bool
	MessageType           int
	ServiceName           sql.NullString
	AssociatedMessageGUID sql.NullString
	ReplyToGUID           sql.NullString
	ChatID                int64  // Source chat ROWID from chat_message_join
	ChatIdentifier        string // From chat.chat_identifier (not unique in chat.db)
	ChatDisplayName       sql.NullString
	ChatServiceName       sql.NullString
	ChatStyle             sql.NullInt64
}

// MessageDeliveryState captures the current Messages-side delivery state for a
// single message row, including its first attachment transfer when present.
type MessageDeliveryState struct {
	RowID                   int64
	GUID                    string
	Text                    string
	IsSent                  bool
	IsDelivered             bool
	IsFinished              bool
	ErrorCode               int64
	ChatIdentifier          string
	TimestampUnixMilli      int64
	AttachmentTransferState sql.NullInt64
	AttachmentFilename      sql.NullString
}

// SyncMessages copies messages from chat.db to messages table in eve.db
// Supports incremental sync via sinceRowID watermark
// Returns the number of messages synced
func SyncMessages(chatDB *ChatDB, warehouseDB *sql.DB, sinceRowID int64) (int, error) {
	// Read messages from chat.db (incremental if sinceRowID > 0)
	messages, err := chatDB.GetMessages(sinceRowID)
	if err != nil {
		return 0, fmt.Errorf("failed to read messages: %w", err)
	}

	if len(messages) == 0 {
		return 0, nil
	}

	// Begin transaction for atomic writes
	tx, err := warehouseDB.Begin()
	if err != nil {
		return 0, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	handleMap, err := loadWarehouseHandleMap(tx, chatDB)
	if err != nil {
		return 0, err
	}

	// Insert messages
	for _, msg := range messages {
		if err := insertMessage(tx, &msg, handleMap); err != nil {
			return 0, fmt.Errorf("failed to insert message %d: %w", msg.ROWID, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return len(messages), nil
}

// GetMessages reads messages from chat.db with optional watermark
// Messages are joined with chat_message_join to get the chat_id
func (c *ChatDB) GetMessages(sinceRowID int64) ([]Message, error) {
	query := `
		SELECT
			m.ROWID,
			m.guid,
			m.text,
			m.attributedBody,
			m.handle_id,
			m.date,
			m.is_from_me,
			m.type,
			m.service,
			m.associated_message_guid,
			m.reply_to_guid,
			cmj.chat_id,
			c.chat_identifier,
			c.display_name,
			c.service_name,
			c.style
		FROM message m
		INNER JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
		INNER JOIN chat c ON c.ROWID = cmj.chat_id
		WHERE m.ROWID > ?
		  AND (m.type < 2000 OR m.type > 2005 OR m.type IS NULL)
		  AND NOT (
		    -- Exclude modern text-based reactions (Loved, Liked, etc.)
		    m.type = 0
		    AND m.associated_message_guid IS NOT NULL
		    AND m.associated_message_guid != ''
		    AND m.text IS NOT NULL
		    AND m.text != ''
		    AND (
		      m.text LIKE 'Loved %' OR
		      m.text LIKE 'Liked %' OR
		      m.text LIKE 'Disliked %' OR
		      m.text LIKE 'Laughed at %' OR
		      m.text LIKE 'Emphasized %' OR
		      m.text LIKE 'Questioned %'
		    )
		  )
		  AND (m.group_action_type IS NULL OR m.group_action_type = 0)
		ORDER BY m.ROWID
	`

	rows, err := c.db.Query(query, sinceRowID)
	if err != nil {
		return nil, fmt.Errorf("failed to query messages: %w", err)
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var msg Message
		if err := rows.Scan(
			&msg.ROWID,
			&msg.GUID,
			&msg.Text,
			&msg.AttributedBody,
			&msg.HandleID,
			&msg.Date,
			&msg.IsFromMe,
			&msg.MessageType,
			&msg.ServiceName,
			&msg.AssociatedMessageGUID,
			&msg.ReplyToGUID,
			&msg.ChatID,
			&msg.ChatIdentifier,
			&msg.ChatDisplayName,
			&msg.ChatServiceName,
			&msg.ChatStyle,
		); err != nil {
			return nil, fmt.Errorf("failed to scan message: %w", err)
		}
		messages = append(messages, msg)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating messages: %w", err)
	}

	return messages, nil
}

// GetMaxEligibleMessageRowID returns the highest plain-message ROWID that is
// currently visible through the same joined shape used by the live delta path.
func (c *ChatDB) GetMaxEligibleMessageRowID() (int64, error) {
	query := `
		SELECT COALESCE(MAX(m.ROWID), 0)
		FROM message m
		INNER JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
		INNER JOIN chat c ON c.ROWID = cmj.chat_id
		WHERE (m.type < 2000 OR m.type > 2005 OR m.type IS NULL)
		  AND NOT (
		    m.type = 0
		    AND m.associated_message_guid IS NOT NULL
		    AND m.associated_message_guid != ''
		    AND m.text IS NOT NULL
		    AND m.text != ''
		    AND (
		      m.text LIKE 'Loved %' OR
		      m.text LIKE 'Liked %' OR
		      m.text LIKE 'Disliked %' OR
		      m.text LIKE 'Laughed at %' OR
		      m.text LIKE 'Emphasized %' OR
		      m.text LIKE 'Questioned %'
		    )
		  )
		  AND (m.group_action_type IS NULL OR m.group_action_type = 0)
	`

	var maxRowID int64
	if err := c.db.QueryRow(query).Scan(&maxRowID); err != nil {
		return 0, fmt.Errorf("failed to query max eligible message ROWID: %w", err)
	}
	return maxRowID, nil
}

// GetMessagesByGUIDs reads an explicit set of messages from chat.db, regardless
// of the hot-loop ROWID watermark. This is used to backfill older source
// messages that recent reactions still reference.
func (c *ChatDB) GetMessagesByGUIDs(guids []string) ([]Message, error) {
	if len(guids) == 0 {
		return nil, nil
	}

	placeholders := make([]string, 0, len(guids))
	args := make([]any, 0, len(guids))
	for _, guid := range guids {
		trimmed := strings.TrimSpace(guid)
		if trimmed == "" {
			continue
		}
		placeholders = append(placeholders, "?")
		args = append(args, trimmed)
	}
	if len(placeholders) == 0 {
		return nil, nil
	}

	query := `
		SELECT
			m.ROWID,
			m.guid,
			m.text,
			m.attributedBody,
			m.handle_id,
			m.date,
			m.is_from_me,
			m.type,
			m.service,
			m.associated_message_guid,
			m.reply_to_guid,
			cmj.chat_id,
			c.chat_identifier,
			c.display_name,
			c.service_name,
			c.style
		FROM message m
		INNER JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
		INNER JOIN chat c ON c.ROWID = cmj.chat_id
		WHERE m.guid IN (` + joinPlaceholders(placeholders) + `)
		ORDER BY m.ROWID
	`

	rows, err := c.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query messages by guid: %w", err)
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var msg Message
		if err := rows.Scan(
			&msg.ROWID,
			&msg.GUID,
			&msg.Text,
			&msg.AttributedBody,
			&msg.HandleID,
			&msg.Date,
			&msg.IsFromMe,
			&msg.MessageType,
			&msg.ServiceName,
			&msg.AssociatedMessageGUID,
			&msg.ReplyToGUID,
			&msg.ChatID,
			&msg.ChatIdentifier,
			&msg.ChatDisplayName,
			&msg.ChatServiceName,
			&msg.ChatStyle,
		); err != nil {
			return nil, fmt.Errorf("failed to scan message by guid: %w", err)
		}
		messages = append(messages, msg)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating messages by guid: %w", err)
	}

	return messages, nil
}

// GetMessageDeliveryStateByGUID reads the current delivery state for a message
// row directly from chat.db, including the first attachment transfer if one is
// linked to the message.
func (c *ChatDB) GetMessageDeliveryStateByGUID(guid string) (*MessageDeliveryState, error) {
	trimmed := strings.TrimSpace(guid)
	if trimmed == "" {
		return nil, nil
	}

	query := `
		SELECT
			m.ROWID,
			m.guid,
			COALESCE(m.text, ''),
			m.is_sent,
			m.is_delivered,
			m.is_finished,
			COALESCE(m.error, 0),
			COALESCE(c.chat_identifier, ''),
			COALESCE((m.date / 1000000) + 978307200000, 0),
			a.transfer_state,
			a.filename
		FROM message m
		LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
		LEFT JOIN chat c ON c.ROWID = cmj.chat_id
		LEFT JOIN message_attachment_join maj ON maj.message_id = m.ROWID
		LEFT JOIN attachment a ON a.ROWID = maj.attachment_id
		WHERE m.guid = ?
		ORDER BY a.ROWID
		LIMIT 1
	`

	var state MessageDeliveryState
	err := c.db.QueryRow(query, trimmed).Scan(
		&state.RowID,
		&state.GUID,
		&state.Text,
		&state.IsSent,
		&state.IsDelivered,
		&state.IsFinished,
		&state.ErrorCode,
		&state.ChatIdentifier,
		&state.TimestampUnixMilli,
		&state.AttachmentTransferState,
		&state.AttachmentFilename,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query delivery state for guid %q: %w", trimmed, err)
	}
	return &state, nil
}

func (c *ChatDB) GetRecentOutboundDeliveryStates(selectors []string, minRowID int64) ([]MessageDeliveryState, error) {
	if len(selectors) == 0 {
		return nil, nil
	}
	conditions := make([]string, 0, len(selectors))
	args := []any{minRowID}
	for _, selector := range selectors {
		trimmed := strings.TrimSpace(selector)
		if trimmed == "" {
			continue
		}
		conditions = append(conditions, "(c.chat_identifier = ? OR c.guid = ?)")
		args = append(args, trimmed, trimmed)
	}
	if len(conditions) == 0 {
		return nil, nil
	}

	query := `
		SELECT
			m.ROWID,
			m.guid,
			COALESCE(m.text, ''),
			m.is_sent,
			m.is_delivered,
			m.is_finished,
			COALESCE(m.error, 0),
			COALESCE(c.chat_identifier, ''),
			COALESCE((m.date / 1000000) + 978307200000, 0),
			a.transfer_state,
			a.filename
		FROM message m
		INNER JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
		INNER JOIN chat c ON c.ROWID = cmj.chat_id
		LEFT JOIN message_attachment_join maj ON maj.message_id = m.ROWID
		LEFT JOIN attachment a ON a.ROWID = maj.attachment_id
		WHERE m.ROWID > ?
		  AND COALESCE(m.is_from_me, 0) = 1
		  AND (` + strings.Join(conditions, " OR ") + `)
		ORDER BY m.ROWID ASC, a.ROWID ASC
	`

	rows, err := c.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query recent outbound delivery states: %w", err)
	}
	defer rows.Close()

	var states []MessageDeliveryState
	for rows.Next() {
		var state MessageDeliveryState
		if err := rows.Scan(
			&state.RowID,
			&state.GUID,
			&state.Text,
			&state.IsSent,
			&state.IsDelivered,
			&state.IsFinished,
			&state.ErrorCode,
			&state.ChatIdentifier,
			&state.TimestampUnixMilli,
			&state.AttachmentTransferState,
			&state.AttachmentFilename,
		); err != nil {
			return nil, fmt.Errorf("scan recent outbound delivery state: %w", err)
		}
		states = append(states, state)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate recent outbound delivery states: %w", err)
	}
	return states, nil
}

func (c *ChatDB) GetMaxMessageRowIDForChatSelectors(selectors []string) (int64, error) {
	if len(selectors) == 0 {
		return 0, nil
	}
	conditions := make([]string, 0, len(selectors))
	args := []any{}
	for _, selector := range selectors {
		trimmed := strings.TrimSpace(selector)
		if trimmed == "" {
			continue
		}
		conditions = append(conditions, "(c.chat_identifier = ? OR c.guid = ?)")
		args = append(args, trimmed, trimmed)
	}
	if len(conditions) == 0 {
		return 0, nil
	}

	query := `
		SELECT COALESCE(MAX(m.ROWID), 0)
		FROM message m
		INNER JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
		INNER JOIN chat c ON c.ROWID = cmj.chat_id
		WHERE ` + strings.Join(conditions, " OR ")

	var maxRowID int64
	if err := c.db.QueryRow(query, args...).Scan(&maxRowID); err != nil {
		return 0, fmt.Errorf("failed to query max message rowid for selectors: %w", err)
	}
	return maxRowID, nil
}

func (c *ChatDB) GetMaxRecentOutboundMessageRowID(selectors []string) (int64, error) {
	if len(selectors) == 0 {
		return 0, nil
	}
	conditions := make([]string, 0, len(selectors))
	args := make([]any, 0, len(selectors)*2)
	for _, selector := range selectors {
		trimmed := strings.TrimSpace(selector)
		if trimmed == "" {
			continue
		}
		conditions = append(conditions, "(c.chat_identifier = ? OR c.guid = ?)")
		args = append(args, trimmed, trimmed)
	}
	if len(conditions) == 0 {
		return 0, nil
	}

	query := `
		SELECT COALESCE(MAX(m.ROWID), 0)
		FROM message m
		INNER JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
		INNER JOIN chat c ON c.ROWID = cmj.chat_id
		WHERE COALESCE(m.is_from_me, 0) = 1
		  AND (` + strings.Join(conditions, " OR ") + `)
	`

	var maxRowID int64
	if err := c.db.QueryRow(query, args...).Scan(&maxRowID); err != nil {
		return 0, fmt.Errorf("failed to query max recent outbound message rowid: %w", err)
	}
	return maxRowID, nil
}

// insertMessage inserts a message into the messages table
// Converts Apple timestamp to Unix timestamp
// Maps handle_id to sender_id (contact foreign key)
func insertMessage(tx *sql.Tx, msg *Message, handleMap map[int64]int64) error {
	// Convert Apple timestamp to Go time
	// Apple epoch: 2001-01-01 00:00:00 UTC
	appleEpoch := time.Date(2001, 1, 1, 0, 0, 0, 0, time.UTC)
	timestamp := appleEpoch.Add(time.Duration(msg.Date) * time.Nanosecond)

	// Extract nullable fields
	content := ""
	if msg.Text.Valid {
		content = msg.Text.String
	}
	if content == "" && len(msg.AttributedBody) > 0 {
		content = decodeAttributedBody(msg.AttributedBody)
	}
	content = cleanMessageContent(content)

	var senderID *int64
	if msg.HandleID.Valid && msg.HandleID.Int64 > 0 {
		if contactID, ok := handleMap[msg.HandleID.Int64]; ok {
			senderID = &contactID
		}
	}

	serviceName := ""
	if msg.ServiceName.Valid {
		serviceName = msg.ServiceName.String
	}

	var associatedMessageGUID *string
	if msg.AssociatedMessageGUID.Valid && msg.AssociatedMessageGUID.String != "" {
		associatedMessageGUID = &msg.AssociatedMessageGUID.String
	}

	var replyToGUID *string
	if msg.ReplyToGUID.Valid && msg.ReplyToGUID.String != "" {
		replyToGUID = &msg.ReplyToGUID.String
	}

	// IMPORTANT:
	// chat.db can contain multiple chat rows with the same chat_identifier.
	// Eve's warehouse schema currently enforces chats.chat_identifier as UNIQUE, which
	// means only one "canonical" chat row exists in the warehouse for that identifier.
	//
	// Therefore, we must map source chat ROWID -> canonical warehouse chats.id
	// via chat_identifier; otherwise messages can reference non-existent chats rows.
	var warehouseChatID int64
	if err := tx.QueryRow(`SELECT id FROM chats WHERE chat_identifier = ?`, msg.ChatIdentifier).Scan(&warehouseChatID); err != nil {
		return fmt.Errorf("failed to map chat_identifier to warehouse chat id (chat_identifier=%q): %w", msg.ChatIdentifier, err)
	}

	// Insert into messages table
	// Idempotent via guid UNIQUE constraint
	query := `
		INSERT INTO messages (
			chat_id,
			sender_id,
			content,
			timestamp,
			is_from_me,
			message_type,
			service_name,
			guid,
			associated_message_guid,
			reply_to_guid
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(guid) DO UPDATE SET
			chat_id = excluded.chat_id,
			sender_id = excluded.sender_id,
			content = excluded.content,
			timestamp = excluded.timestamp,
			is_from_me = excluded.is_from_me,
			message_type = excluded.message_type,
			service_name = excluded.service_name,
			associated_message_guid = excluded.associated_message_guid,
			reply_to_guid = excluded.reply_to_guid
	`

	if _, err := tx.Exec(query,
		warehouseChatID,
		senderID,
		content,
		timestamp,
		msg.IsFromMe,
		msg.MessageType,
		serviceName,
		msg.GUID,
		associatedMessageGUID,
		replyToGUID,
	); err != nil {
		return fmt.Errorf("failed to insert message: %w", err)
	}

	return nil
}
