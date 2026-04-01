package etl

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// Reaction represents a reaction extracted from chat.db messages
type Reaction struct {
	ROWID                 int64
	GUID                  string
	AssociatedMessageGUID string
	HandleID              sql.NullInt64
	Date                  int64
	IsFromMe              bool
	ReactionType          int // 2000-2005 (legacy) or 0 (modern text-based)
	Text                  sql.NullString
	ChatID                int64
	ChatIdentifier        string
	ChatDisplayName       sql.NullString
	ChatServiceName       sql.NullString
	ChatStyle             sql.NullInt64
}

// GetReactions reads reaction messages from chat.db
// Reactions are stored differently across macOS/iOS versions:
// - Older: type 2000-2005 (love, like, dislike, laugh, emphasis, question)
// - Newer: type 0 with text starting with "Loved", "Liked", etc.
func (c *ChatDB) GetReactions(sinceRowID int64) ([]Reaction, error) {
	query := `
		SELECT
			m.ROWID,
			m.guid,
			m.associated_message_guid,
			m.handle_id,
			m.date,
			m.is_from_me,
			m.type,
			m.text,
			cmj.chat_id,
			c.chat_identifier,
			c.display_name,
			c.service_name,
			c.style
		FROM message m
		INNER JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
		INNER JOIN chat c ON c.ROWID = cmj.chat_id
		WHERE m.ROWID > ?
		  AND m.associated_message_guid IS NOT NULL
		  AND m.associated_message_guid != ''
		  AND (
		    -- Legacy format: type 2000-2005
		    (m.type >= 2000 AND m.type <= 2005)
		    OR
		    -- Modern format: type 0 with reaction text patterns
		    (m.type = 0 AND (
		      m.text LIKE 'Loved %' OR
		      m.text LIKE 'Liked %' OR
		      m.text LIKE 'Disliked %' OR
		      m.text LIKE 'Laughed at %' OR
		      m.text LIKE 'Emphasized %' OR
		      m.text LIKE 'Questioned %'
		    ))
		  )
		ORDER BY m.ROWID
	`

	rows, err := c.db.Query(query, sinceRowID)
	if err != nil {
		return nil, fmt.Errorf("failed to query reactions: %w", err)
	}
	defer rows.Close()

	var reactions []Reaction
	for rows.Next() {
		var r Reaction
		if err := rows.Scan(
			&r.ROWID,
			&r.GUID,
			&r.AssociatedMessageGUID,
			&r.HandleID,
			&r.Date,
			&r.IsFromMe,
			&r.ReactionType,
			&r.Text,
			&r.ChatID,
			&r.ChatIdentifier,
			&r.ChatDisplayName,
			&r.ChatServiceName,
			&r.ChatStyle,
		); err != nil {
			return nil, fmt.Errorf("failed to scan reaction: %w", err)
		}
		reactions = append(reactions, r)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating reactions: %w", err)
	}

	return reactions, nil
}

// GetMaxObservedReactionRowID returns the highest reaction ROWID currently
// visible through the joined live delta query.
func (c *ChatDB) GetMaxObservedReactionRowID() (int64, error) {
	query := `
		SELECT COALESCE(MAX(m.ROWID), 0)
		FROM message m
		INNER JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
		INNER JOIN chat c ON c.ROWID = cmj.chat_id
		WHERE m.associated_message_guid IS NOT NULL
		  AND m.associated_message_guid != ''
		  AND (
		    (m.type >= 2000 AND m.type <= 2005)
		    OR
		    (m.type = 0 AND (
		      m.text LIKE 'Loved %' OR
		      m.text LIKE 'Liked %' OR
		      m.text LIKE 'Disliked %' OR
		      m.text LIKE 'Laughed at %' OR
		      m.text LIKE 'Emphasized %' OR
		      m.text LIKE 'Questioned %'
		    ))
		  )
	`

	var maxRowID int64
	if err := c.db.QueryRow(query).Scan(&maxRowID); err != nil {
		return 0, fmt.Errorf("failed to query max observed reaction ROWID: %w", err)
	}
	return maxRowID, nil
}

// SyncReactions copies reactions from chat.db to reactions table in eve.db
// Supports incremental sync via sinceRowID watermark
// Returns the number of reactions synced
func SyncReactions(chatDB *ChatDB, warehouseDB *sql.DB, sinceRowID int64) (int, error) {
	reactions, err := chatDB.GetReactions(sinceRowID)
	if err != nil {
		return 0, fmt.Errorf("failed to read reactions: %w", err)
	}

	if len(reactions) == 0 {
		return 0, nil
	}

	tx, err := warehouseDB.Begin()
	if err != nil {
		return 0, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	if err := ensureOriginalMessagesForReactions(tx, chatDB, reactions); err != nil {
		return 0, err
	}
	if err := ensureChatsForReactions(tx, reactions); err != nil {
		return 0, err
	}
	chatMap, err := loadWarehouseChatMap(tx)
	if err != nil {
		return 0, err
	}
	handleMap, err := loadWarehouseHandleMapForReactions(tx, chatDB, reactions)
	if err != nil {
		return 0, err
	}

	created := 0
	for _, r := range reactions {
		if err := insertReaction(tx, chatMap, handleMap, &r); err != nil {
			return 0, fmt.Errorf("failed to insert reaction %d: %w", r.ROWID, err)
		}
		created++
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return created, nil
}

func ensureOriginalMessagesForReactions(tx *sql.Tx, chatDB *ChatDB, reactions []Reaction) error {
	missingGUIDs, err := loadMissingReactionMessageGUIDs(tx, reactions)
	if err != nil {
		return err
	}
	if len(missingGUIDs) == 0 {
		return nil
	}

	messages, err := chatDB.GetMessagesByGUIDs(missingGUIDs)
	if err != nil {
		return err
	}
	if len(messages) == 0 {
		return nil
	}
	if err := ensureChatsForMessages(tx, messages); err != nil {
		return err
	}
	handleMap, err := loadWarehouseHandleMapForMessages(tx, chatDB, messages)
	if err != nil {
		return err
	}
	for _, msg := range messages {
		if err := insertMessage(tx, &msg, handleMap); err != nil {
			return fmt.Errorf("failed to seed source message %s for reaction replay: %w", msg.GUID, err)
		}
	}
	return nil
}

func loadMissingReactionMessageGUIDs(tx *sql.Tx, reactions []Reaction) ([]string, error) {
	guids := uniqueOriginalMessageGUIDs(reactions)
	if len(guids) == 0 {
		return nil, nil
	}

	placeholders := make([]string, 0, len(guids))
	args := make([]any, 0, len(guids))
	for _, guid := range guids {
		placeholders = append(placeholders, "?")
		args = append(args, guid)
	}

	rows, err := tx.Query(`
		SELECT guid
		FROM messages
		WHERE guid IN (`+joinPlaceholders(placeholders)+`)
	`, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query existing reaction source messages: %w", err)
	}
	defer rows.Close()

	existing := make(map[string]struct{}, len(guids))
	for rows.Next() {
		var guid string
		if err := rows.Scan(&guid); err != nil {
			return nil, fmt.Errorf("failed to scan reaction source message guid: %w", err)
		}
		existing[strings.TrimSpace(guid)] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating reaction source messages: %w", err)
	}

	missing := make([]string, 0, len(guids))
	for _, guid := range guids {
		if _, ok := existing[guid]; ok {
			continue
		}
		missing = append(missing, guid)
	}
	return missing, nil
}

func uniqueOriginalMessageGUIDs(reactions []Reaction) []string {
	seen := make(map[string]struct{}, len(reactions))
	out := make([]string, 0, len(reactions))
	for _, reaction := range reactions {
		guid := normalizeAssociatedMessageGUID(reaction.AssociatedMessageGUID)
		if guid == "" {
			continue
		}
		if _, ok := seen[guid]; ok {
			continue
		}
		seen[guid] = struct{}{}
		out = append(out, guid)
	}
	return out
}

func normalizeAssociatedMessageGUID(raw string) string {
	normalized := strings.TrimSpace(raw)
	if normalized == "" {
		return ""
	}
	if idx := len(normalized) - 36; idx > 0 && len(normalized) > 36 {
		normalized = normalized[idx:]
	}
	return normalized
}

func insertReaction(tx *sql.Tx, chatMap map[string]int64, handleMap map[int64]int64, r *Reaction) error {
	reactionType := r.ReactionType
	if reactionType < 2000 || reactionType > 2005 {
		if r.Text.Valid && r.Text.String != "" {
			reactionType = reactionTextToType(r.Text.String)
		}
	}
	if reactionType < 2000 || reactionType > 2005 {
		return nil
	}

	originalGUID := normalizeAssociatedMessageGUID(r.AssociatedMessageGUID)
	if originalGUID == "" {
		return nil
	}

	warehouseChatID, ok := chatMap[r.ChatIdentifier]
	if !ok {
		return fmt.Errorf("failed to map chat_identifier to warehouse chat id (chat_identifier=%q)", r.ChatIdentifier)
	}

	// Convert Apple timestamp to Go time
	appleEpoch := time.Date(2001, 1, 1, 0, 0, 0, 0, time.UTC)
	timestamp := appleEpoch.Add(time.Duration(r.Date) * time.Nanosecond)

	var senderID *int64
	if r.HandleID.Valid && r.HandleID.Int64 > 0 {
		if contactID, ok := handleMap[r.HandleID.Int64]; ok {
			senderID = &contactID
		}
	}

	query := `
		INSERT INTO reactions (
			original_message_guid,
			timestamp,
			sender_id,
			chat_id,
			reaction_type,
			is_from_me,
			guid
		) VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(guid) DO UPDATE SET
			original_message_guid = excluded.original_message_guid,
			timestamp = excluded.timestamp,
			sender_id = excluded.sender_id,
			chat_id = excluded.chat_id,
			reaction_type = excluded.reaction_type,
			is_from_me = excluded.is_from_me
	`

	if _, err := tx.Exec(query,
		originalGUID,
		timestamp,
		senderID,
		warehouseChatID,
		reactionType,
		r.IsFromMe,
		r.GUID,
	); err != nil {
		return fmt.Errorf("failed to insert reaction: %w", err)
	}

	return nil
}

func reactionTextToType(text string) int {
	text = strings.TrimSpace(text)
	switch {
	case strings.HasPrefix(text, "Loved"):
		return 2000
	case strings.HasPrefix(text, "Liked"):
		return 2001
	case strings.HasPrefix(text, "Disliked"):
		return 2002
	case strings.HasPrefix(text, "Laughed at"):
		return 2003
	case strings.HasPrefix(text, "Emphasized"):
		return 2004
	case strings.HasPrefix(text, "Questioned"):
		return 2005
	default:
		return 0
	}
}

func loadWarehouseChatMap(tx *sql.Tx) (map[string]int64, error) {
	rows, err := tx.Query(`SELECT id, chat_identifier FROM chats`)
	if err != nil {
		return nil, fmt.Errorf("failed to query warehouse chats: %w", err)
	}
	defer rows.Close()

	chatMap := make(map[string]int64)
	for rows.Next() {
		var id int64
		var identifier string
		if err := rows.Scan(&id, &identifier); err != nil {
			return nil, fmt.Errorf("failed to scan chat map: %w", err)
		}
		chatMap[identifier] = id
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating chat map: %w", err)
	}
	return chatMap, nil
}
