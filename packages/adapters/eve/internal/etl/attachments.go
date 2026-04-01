package etl

import (
	"database/sql"
	"fmt"
	"time"
)

// Attachment represents an attachment from chat.db
type Attachment struct {
	ROWID       int64
	GUID        string
	CreatedDate int64 // Apple timestamp (nanoseconds since 2001-01-01)
	Filename    sql.NullString
	UTI         sql.NullString
	MimeType    sql.NullString
	TotalBytes  sql.NullInt64
	IsSticker   bool
	MessageGUID string // From message_attachment_join + message
}

// SyncAttachments copies attachments from chat.db to attachments table in eve.db.
// Reads attachments via message_attachment_join and maps to messages by guid.
// Returns the number of attachments synced
func SyncAttachments(chatDB *ChatDB, warehouseDB *sql.DB, sinceRowID int64) (int, error) {
	result, err := syncAttachmentsDeltaResult(chatDB, warehouseDB, sinceRowID)
	if err != nil {
		return 0, err
	}
	return result.Count, nil
}

func syncAttachmentsDeltaResult(chatDB *ChatDB, warehouseDB *sql.DB, sinceRowID int64) (hotSyncRowIDResult, error) {
	// Read attachments from chat.db
	attachments, err := chatDB.GetAttachmentsSince(sinceRowID)
	if err != nil {
		return hotSyncRowIDResult{}, fmt.Errorf("failed to read attachments: %w", err)
	}
	result := hotSyncRowIDResult{}

	if len(attachments) == 0 {
		return result, nil
	}

	// Begin transaction for atomic writes
	tx, err := warehouseDB.Begin()
	if err != nil {
		return hotSyncRowIDResult{}, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Build message guid -> message id mapping
	messageMap, err := buildMessageMap(tx)
	if err != nil {
		return hotSyncRowIDResult{}, fmt.Errorf("failed to build message map: %w", err)
	}

	// Insert attachments
	syncedCount := 0
	frontierBlocked := false
	for _, att := range attachments {
		messageID, ok := messageMap[att.MessageGUID]
		if !ok {
			// Do not advance past the first attachment whose message cannot yet be
			// resolved in the warehouse. Later rows may already be idempotent, but
			// preserving a contiguous frontier avoids relying on replay to recover
			// this gap.
			frontierBlocked = true
			continue
		}

		if err := insertAttachment(tx, &att, messageID); err != nil {
			return hotSyncRowIDResult{}, fmt.Errorf("failed to insert attachment %d: %w", att.ROWID, err)
		}
		syncedCount++
		if !frontierBlocked {
			result.FrontierID = att.ROWID
		}
	}

	if err := tx.Commit(); err != nil {
		return hotSyncRowIDResult{}, fmt.Errorf("failed to commit transaction: %w", err)
	}

	result.Count = syncedCount
	return result, nil
}

// GetAttachments reads attachments from chat.db via message_attachment_join.
// Joins with message table to get message guid for foreign key mapping.
func (c *ChatDB) GetAttachments() ([]Attachment, error) {
	return c.GetAttachmentsSince(0)
}

// GetAttachmentsSince reads attachments from chat.db with an optional ROWID watermark.
func (c *ChatDB) GetAttachmentsSince(sinceRowID int64) ([]Attachment, error) {
	query := `
		SELECT
			a.ROWID,
			a.guid,
			a.created_date,
			a.filename,
			a.uti,
			a.mime_type,
			a.total_bytes,
			a.is_sticker,
			m.guid as message_guid
		FROM attachment a
		INNER JOIN message_attachment_join maj ON a.ROWID = maj.attachment_id
		INNER JOIN message m ON maj.message_id = m.ROWID
		WHERE a.ROWID > ?
		ORDER BY a.ROWID
	`

	rows, err := c.db.Query(query, sinceRowID)
	if err != nil {
		return nil, fmt.Errorf("failed to query attachments: %w", err)
	}
	defer rows.Close()

	var attachments []Attachment
	for rows.Next() {
		var att Attachment
		if err := rows.Scan(
			&att.ROWID,
			&att.GUID,
			&att.CreatedDate,
			&att.Filename,
			&att.UTI,
			&att.MimeType,
			&att.TotalBytes,
			&att.IsSticker,
			&att.MessageGUID,
		); err != nil {
			return nil, fmt.Errorf("failed to scan attachment: %w", err)
		}
		attachments = append(attachments, att)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating attachments: %w", err)
	}

	return attachments, nil
}

// GetMaxObservedAttachmentRowID returns the highest attachment ROWID currently
// visible through the joined live delta query.
func (c *ChatDB) GetMaxObservedAttachmentRowID() (int64, error) {
	query := `
		SELECT COALESCE(MAX(a.ROWID), 0)
		FROM attachment a
		INNER JOIN message_attachment_join maj ON a.ROWID = maj.attachment_id
		INNER JOIN message m ON maj.message_id = m.ROWID
	`

	var maxRowID int64
	if err := c.db.QueryRow(query).Scan(&maxRowID); err != nil {
		return 0, fmt.Errorf("failed to query max observed attachment ROWID: %w", err)
	}
	return maxRowID, nil
}

// GetMaxAttachmentRowID returns the maximum ROWID from the attachment table.
func (c *ChatDB) GetMaxAttachmentRowID() (int64, error) {
	return c.getMaxRowID("attachment")
}

// buildMessageMap creates a mapping from message guid to message id
func buildMessageMap(tx *sql.Tx) (map[string]int64, error) {
	rows, err := tx.Query("SELECT guid, id FROM messages")
	if err != nil {
		return nil, fmt.Errorf("failed to query messages: %w", err)
	}
	defer rows.Close()

	messageMap := make(map[string]int64)
	for rows.Next() {
		var guid string
		var id int64
		if err := rows.Scan(&guid, &id); err != nil {
			return nil, fmt.Errorf("failed to scan message mapping: %w", err)
		}
		messageMap[guid] = id
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating message mapping: %w", err)
	}

	return messageMap, nil
}

// insertAttachment inserts an attachment into the attachments table
// Converts Apple timestamp to Unix timestamp
func insertAttachment(tx *sql.Tx, att *Attachment, messageID int64) error {
	// Convert Apple timestamp to Go time
	// Apple epoch: 2001-01-01 00:00:00 UTC
	appleEpoch := time.Date(2001, 1, 1, 0, 0, 0, 0, time.UTC)
	createdDate := appleEpoch.Add(time.Duration(att.CreatedDate) * time.Nanosecond)

	// Extract nullable fields
	filename := ""
	if att.Filename.Valid {
		filename = att.Filename.String
	}

	uti := ""
	if att.UTI.Valid {
		uti = att.UTI.String
	}

	mimeType := ""
	if att.MimeType.Valid {
		mimeType = att.MimeType.String
	}

	var size *int64
	if att.TotalBytes.Valid {
		size = &att.TotalBytes.Int64
	}

	// Insert into attachments table
	// Idempotent via guid UNIQUE constraint
	query := `
		INSERT INTO attachments (
			message_id,
			file_name,
			mime_type,
			size,
			created_date,
			is_sticker,
			guid,
			uti
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(guid) DO UPDATE SET
			message_id = excluded.message_id,
			file_name = excluded.file_name,
			mime_type = excluded.mime_type,
			size = excluded.size,
			created_date = excluded.created_date,
			is_sticker = excluded.is_sticker,
			uti = excluded.uti
	`

	if _, err := tx.Exec(query,
		messageID,
		filename,
		mimeType,
		size,
		createdDate,
		att.IsSticker,
		att.GUID,
		uti,
	); err != nil {
		return fmt.Errorf("failed to insert attachment: %w", err)
	}

	return nil
}
