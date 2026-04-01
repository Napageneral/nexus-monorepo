package etl

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// ReactionRemoval represents deletion evidence for a reaction message.
//
// The source query intentionally stays broad enough to capture deleted-message
// evidence first; the sync path then enriches and filters it against the
// warehouse reaction stream so the stored event stays truthful and replay-safe.
type ReactionRemoval struct {
	SourceMessageGUID   sql.NullString
	DeleteDateNS        int64
	OriginalMessageGUID sql.NullString
	HandleID            sql.NullInt64
	SenderID            sql.NullInt64
	IsFromMe            bool
	ReactionType        int
	Text                sql.NullString
	AttributedBody      []byte
	ChatIdentifier      string
	ChatDisplayName     sql.NullString
	ChatServiceName     sql.NullString
	ChatStyle           sql.NullInt64
}

// WarehouseReaction is the replay-safe enrichment source for a removed reaction.
type WarehouseReaction struct {
	OriginalMessageGUID sql.NullString
	SenderID            sql.NullInt64
	ChatID              sql.NullInt64
	ReactionType        int
	IsFromMe            bool
	ChatIdentifier      sql.NullString
}

// GetReactionRemovalsSince reads deletion evidence from chat.db.
//
// The returned rows are candidates; the sync path can later enrich them against
// the warehouse reaction table and then only store rows that can be verified as
// actual reaction removals.
func (c *ChatDB) GetReactionRemovalsSince(sinceNS int64) ([]ReactionRemoval, error) {
	query := `
		SELECT
			COALESCE(m.guid, dm.guid),
			COALESCE(crmj.delete_date, rmp.delete_date, 0),
			m.associated_message_guid,
			m.handle_id,
			m.is_from_me,
			m.type,
			m.text,
			m.attributedBody,
			ch.chat_identifier,
			ch.display_name,
			ch.service_name,
			ch.style
		FROM deleted_messages dm
		LEFT JOIN message m ON m.guid = dm.guid
		LEFT JOIN chat_recoverable_message_join crmj ON crmj.message_id = COALESCE(m.ROWID, dm.ROWID)
		LEFT JOIN chat_message_join cmj ON cmj.message_id = COALESCE(m.ROWID, dm.ROWID)
		LEFT JOIN chat ch ON ch.ROWID = COALESCE(crmj.chat_id, cmj.chat_id)
		LEFT JOIN recoverable_message_part rmp
			ON rmp.chat_id = COALESCE(crmj.chat_id, cmj.chat_id)
		   AND rmp.message_id = COALESCE(m.ROWID, dm.ROWID)
		   AND rmp.part_index = 0
		WHERE COALESCE(crmj.delete_date, rmp.delete_date, 0) > ?
		ORDER BY 2, 1
	`

	rows, err := c.db.Query(query, sinceNS)
	if err != nil {
		return nil, fmt.Errorf("failed to query reaction removals: %w", err)
	}
	defer rows.Close()

	var removals []ReactionRemoval
	for rows.Next() {
		var removal ReactionRemoval
		if err := rows.Scan(
			&removal.SourceMessageGUID,
			&removal.DeleteDateNS,
			&removal.OriginalMessageGUID,
			&removal.HandleID,
			&removal.IsFromMe,
			&removal.ReactionType,
			&removal.Text,
			&removal.AttributedBody,
			&removal.ChatIdentifier,
			&removal.ChatDisplayName,
			&removal.ChatServiceName,
			&removal.ChatStyle,
		); err != nil {
			return nil, fmt.Errorf("failed to scan reaction removal: %w", err)
		}
		removals = append(removals, removal)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating reaction removals: %w", err)
	}

	return removals, nil
}

// GetMaxObservedReactionRemovalTimestampNS returns the latest deletion
// timestamp currently visible through the joined live delta query.
func (c *ChatDB) GetMaxObservedReactionRemovalTimestampNS() (int64, error) {
	query := `
		SELECT COALESCE(MAX(
			COALESCE(crmj.delete_date, rmp.delete_date, 0)
		), 0)
		FROM deleted_messages dm
		LEFT JOIN message m ON m.guid = dm.guid
		LEFT JOIN chat_recoverable_message_join crmj ON crmj.message_id = COALESCE(m.ROWID, dm.ROWID)
		LEFT JOIN chat_message_join cmj ON cmj.message_id = COALESCE(m.ROWID, dm.ROWID)
		LEFT JOIN chat ch ON ch.ROWID = COALESCE(crmj.chat_id, cmj.chat_id)
		LEFT JOIN recoverable_message_part rmp
			ON rmp.chat_id = COALESCE(crmj.chat_id, cmj.chat_id)
		   AND rmp.message_id = COALESCE(m.ROWID, dm.ROWID)
		   AND rmp.part_index = 0
		WHERE COALESCE(crmj.delete_date, rmp.delete_date, 0) > 0
	`

	var maxTimestampNS int64
	if err := c.db.QueryRow(query).Scan(&maxTimestampNS); err != nil {
		return 0, fmt.Errorf("failed to query max observed reaction removal timestamp: %w", err)
	}
	return maxTimestampNS, nil
}

// SyncReactionRemovalsDelta copies reaction removal evidence into message_updates.
func SyncReactionRemovalsDelta(chatDB *ChatDB, warehouseDB *sql.DB, sinceNS int64) (int, error) {
	result, err := syncReactionRemovalsDeltaResult(chatDB, warehouseDB, sinceNS)
	if err != nil {
		return 0, err
	}
	return result.Count, nil
}

func syncReactionRemovalsDeltaResult(chatDB *ChatDB, warehouseDB *sql.DB, sinceNS int64) (hotSyncTimestampResult, error) {
	removals, err := chatDB.GetReactionRemovalsSince(sinceNS)
	if err != nil {
		return hotSyncTimestampResult{}, fmt.Errorf("failed to read reaction removals: %w", err)
	}
	result := hotSyncTimestampResult{}
	if len(removals) == 0 {
		return result, nil
	}

	if err := enrichReactionRemovalsFromWarehouse(warehouseDB, removals); err != nil {
		return hotSyncTimestampResult{}, err
	}

	tx, err := warehouseDB.Begin()
	if err != nil {
		return hotSyncTimestampResult{}, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	if err := ensureChatsForReactionRemovals(tx, removals); err != nil {
		return hotSyncTimestampResult{}, err
	}
	chatMap, err := loadWarehouseChatMap(tx)
	if err != nil {
		return hotSyncTimestampResult{}, err
	}
	handleMap, err := loadWarehouseHandleMapForReactionRemovals(tx, chatDB, removals)
	if err != nil {
		return hotSyncTimestampResult{}, err
	}

	synced := 0
	frontierBlocked := false
	for _, removal := range removals {
		if err := insertReactionRemoval(tx, chatMap, handleMap, &removal); err != nil {
			return hotSyncTimestampResult{}, fmt.Errorf("failed to insert reaction removal %q: %w", removal.SourceMessageGUID.String, err)
		}
		stored := isStoredReactionRemoval(&removal)
		if stored {
			synced++
		}
		if !frontierBlocked {
			if stored {
				result.FrontierTimeNS = removal.DeleteDateNS
			} else {
				frontierBlocked = true
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return hotSyncTimestampResult{}, fmt.Errorf("failed to commit reaction removal transaction: %w", err)
	}

	result.Count = synced
	return result, nil
}

func isStoredReactionRemoval(removal *ReactionRemoval) bool {
	if removal == nil {
		return false
	}
	if removal.SourceMessageGUID.String == "" {
		return false
	}
	if removal.OriginalMessageGUID.String == "" {
		return false
	}
	return reactionRemovalType(removal) != 0
}

func enrichReactionRemovalsFromWarehouse(warehouseDB *sql.DB, removals []ReactionRemoval) error {
	guids := uniqueReactionRemovalSourceGUIDs(removals)
	if len(guids) == 0 {
		return nil
	}

	warehouseReactions, err := loadWarehouseReactionsByGUIDs(warehouseDB, guids)
	if err != nil {
		return err
	}

	for i := range removals {
		key := removals[i].SourceMessageGUID.String
		reaction, ok := warehouseReactions[key]
		if !ok {
			continue
		}

		sourceHasMessageData := removals[i].OriginalMessageGUID.Valid || removals[i].HandleID.Valid || removals[i].Text.Valid || len(removals[i].AttributedBody) > 0 || removals[i].ReactionType != 0

		if !removals[i].OriginalMessageGUID.Valid || removals[i].OriginalMessageGUID.String == "" {
			removals[i].OriginalMessageGUID = reaction.OriginalMessageGUID
		}
		if !removals[i].HandleID.Valid && reaction.SenderID.Valid {
			removals[i].SenderID = reaction.SenderID
		}
		if removals[i].ReactionType < 2000 || removals[i].ReactionType > 2005 {
			removals[i].ReactionType = reaction.ReactionType
		}
		if removals[i].ChatIdentifier == "" && reaction.ChatIdentifier.Valid {
			removals[i].ChatIdentifier = reaction.ChatIdentifier.String
		}
		if removals[i].ChatIdentifier == "" && reaction.ChatID.Valid {
			if chatIdentifier, err := loadWarehouseChatIdentifierByID(warehouseDB, reaction.ChatID.Int64); err == nil && chatIdentifier != "" {
				removals[i].ChatIdentifier = chatIdentifier
			}
		}
		if !sourceHasMessageData {
			removals[i].IsFromMe = reaction.IsFromMe
		}
	}

	return nil
}

func loadWarehouseReactionsByGUIDs(warehouseDB *sql.DB, guids []string) (map[string]WarehouseReaction, error) {
	if len(guids) == 0 {
		return map[string]WarehouseReaction{}, nil
	}

	placeholders := make([]string, 0, len(guids))
	args := make([]any, 0, len(guids))
	for _, guid := range guids {
		placeholders = append(placeholders, "?")
		args = append(args, guid)
	}

	query := `
		SELECT
			r.guid,
			r.original_message_guid,
			r.sender_id,
			r.chat_id,
			r.reaction_type,
			r.is_from_me,
			ch.chat_identifier
		FROM reactions r
		LEFT JOIN chats ch ON ch.id = r.chat_id
		WHERE r.guid IN (` + joinPlaceholders(placeholders) + `)
	`

	rows, err := warehouseDB.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query warehouse reactions: %w", err)
	}
	defer rows.Close()

	reactions := make(map[string]WarehouseReaction)
	for rows.Next() {
		var guid string
		var reaction WarehouseReaction
		if err := rows.Scan(
			&guid,
			&reaction.OriginalMessageGUID,
			&reaction.SenderID,
			&reaction.ChatID,
			&reaction.ReactionType,
			&reaction.IsFromMe,
			&reaction.ChatIdentifier,
		); err != nil {
			return nil, fmt.Errorf("failed to scan warehouse reaction: %w", err)
		}
		reactions[guid] = reaction
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating warehouse reactions: %w", err)
	}

	return reactions, nil
}

func loadWarehouseChatIdentifierByID(warehouseDB *sql.DB, chatID int64) (string, error) {
	if chatID <= 0 {
		return "", nil
	}

	var identifier sql.NullString
	if err := warehouseDB.QueryRow(`SELECT chat_identifier FROM chats WHERE id = ?`, chatID).Scan(&identifier); err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", err
	}
	if !identifier.Valid {
		return "", nil
	}
	return identifier.String, nil
}

func insertReactionRemoval(tx *sql.Tx, chatMap map[string]int64, handleMap map[int64]int64, removal *ReactionRemoval) error {
	if removal == nil {
		return nil
	}
	if removal.SourceMessageGUID.String == "" {
		return nil
	}

	originalGUID := strings.TrimSpace(removal.OriginalMessageGUID.String)
	if originalGUID == "" {
		return nil
	}

	reactionType := reactionRemovalType(removal)
	if reactionType == 0 {
		return nil
	}

	warehouseChatID, ok := chatMap[removal.ChatIdentifier]
	if !ok {
		return fmt.Errorf("failed to map chat_identifier to warehouse chat id (chat_identifier=%q)", removal.ChatIdentifier)
	}

	content := ""
	if removal.Text.Valid {
		content = removal.Text.String
	}
	if content == "" && len(removal.AttributedBody) > 0 {
		content = decodeAttributedBody(removal.AttributedBody)
	}
	content = cleanMessageContent(content)

	appleEpoch := time.Date(2001, 1, 1, 0, 0, 0, 0, time.UTC)
	timestamp := appleEpoch.Add(time.Duration(removal.DeleteDateNS) * time.Nanosecond)
	syntheticGUID := fmt.Sprintf("imessage:reaction_remove:%s:%d", removal.SourceMessageGUID.String, removal.DeleteDateNS)

	var senderID *int64
	if removal.HandleID.Valid && removal.HandleID.Int64 > 0 {
		if contactID, ok := handleMap[removal.HandleID.Int64]; ok {
			senderID = &contactID
		}
	} else if removal.SenderID.Valid && removal.SenderID.Int64 > 0 {
		senderID = &removal.SenderID.Int64
	}

	if err := upsertMessageUpdate(
		tx,
		originalGUID,
		messageUpdateTypeReactionRemoval,
		content,
		timestamp,
		warehouseChatID,
		senderID,
		removal.IsFromMe,
		syntheticGUID,
	); err != nil {
		return err
	}

	return nil
}

func reactionRemovalType(removal *ReactionRemoval) int {
	if removal == nil {
		return 0
	}
	if removal.ReactionType >= 2000 && removal.ReactionType <= 2005 {
		return removal.ReactionType
	}

	content := ""
	if removal.Text.Valid {
		content = removal.Text.String
	}
	if content == "" && len(removal.AttributedBody) > 0 {
		content = decodeAttributedBody(removal.AttributedBody)
	}
	return reactionTextToType(content)
}

func uniqueReactionRemovalSourceGUIDs(removals []ReactionRemoval) []string {
	seen := make(map[string]struct{}, len(removals))
	out := make([]string, 0, len(removals))
	for _, removal := range removals {
		guid := strings.TrimSpace(removal.SourceMessageGUID.String)
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

func ensureChatsForReactionRemovals(tx *sql.Tx, removals []ReactionRemoval) error {
	return ensureChats(tx, uniqueReactionRemovalChats(removals))
}

func loadWarehouseHandleMapForReactionRemovals(tx *sql.Tx, chatDB *ChatDB, removals []ReactionRemoval) (map[int64]int64, error) {
	rowIDs := uniqueReactionRemovalHandleRowIDs(removals)
	if len(rowIDs) == 0 {
		return map[int64]int64{}, nil
	}
	handles, err := chatDB.GetHandlesByRowIDs(rowIDs)
	if err != nil {
		return nil, err
	}
	return buildWarehouseHandleMapForHandles(tx, handles)
}

func uniqueReactionRemovalChats(removals []ReactionRemoval) []Chat {
	chats := make([]Chat, 0, len(removals))
	seen := make(map[string]struct{}, len(removals))
	for _, removal := range removals {
		if removal.ChatIdentifier == "" {
			continue
		}
		if _, ok := seen[removal.ChatIdentifier]; ok {
			continue
		}
		seen[removal.ChatIdentifier] = struct{}{}
		chats = append(chats, Chat{
			ChatIdentifier: removal.ChatIdentifier,
			DisplayName:    removal.ChatDisplayName,
			ServiceName:    removal.ChatServiceName,
			Style:          int(nullInt64Value(removal.ChatStyle)),
		})
	}
	return chats
}

func uniqueReactionRemovalHandleRowIDs(removals []ReactionRemoval) []int64 {
	seen := make(map[int64]struct{})
	out := make([]int64, 0, len(removals))
	for _, removal := range removals {
		if !removal.HandleID.Valid || removal.HandleID.Int64 <= 0 {
			continue
		}
		if _, ok := seen[removal.HandleID.Int64]; ok {
			continue
		}
		seen[removal.HandleID.Int64] = struct{}{}
		out = append(out, removal.HandleID.Int64)
	}
	return out
}
