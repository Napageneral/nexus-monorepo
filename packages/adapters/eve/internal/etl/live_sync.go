package etl

import (
	"database/sql"
	"fmt"
	"time"
)

const (
	hotSyncLookbackRowIDs               int64 = 5000
	hotSyncLookbackDuration                   = 5 * time.Minute
	hotSyncWatermarkSource                    = "chatdb"
	hotSyncWatermarkHandleName                = "handle_rowid"
	hotSyncWatermarkChatName                  = "chat_rowid"
	hotSyncWatermarkMessageName               = "message_rowid"
	hotSyncWatermarkMessageUpdateName         = "message_update_timestamp"
	hotSyncWatermarkReactionName              = "reaction_rowid"
	hotSyncWatermarkReactionRemovalName       = "reaction_removal_timestamp"
	hotSyncWatermarkMembershipName            = "membership_rowid"
	hotSyncWatermarkAttachmentName            = "attachment_rowid"
)

// HotSyncWatermarks tracks durable live-sync progress for the hot loop.
type HotSyncWatermarks struct {
	HandleRowID              int64
	ChatRowID                int64
	MessageRowID             int64
	MessageUpdateTimestamp   int64
	MessageUpdateNS          int64
	ReactionRowID            int64
	ReactionRemovalTimestamp int64
	MembershipRowID          int64
	AttachmentRowID          int64
}

// HotSyncResult summarizes a single live delta pass.
type HotSyncResult struct {
	HandlesCount          int
	ChatsCount            int
	ChatParticipantsCount int
	MessagesCount         int
	MessageUpdatesCount   int
	ReactionsCount        int
	ReactionRemovalsCount int
	MembershipCount       int
	AttachmentsCount      int
	Watermarks            HotSyncWatermarks
}

type hotSyncRowIDResult struct {
	Count      int
	FrontierID int64
}

type hotSyncTimestampResult struct {
	Count          int
	FrontierTimeNS int64
}

// HotSync runs the low-latency live sync path for Eve.
//
// It keeps durable per-domain watermarks for the live loop, uses bounded
// lookback windows for replay safety, and avoids the broad backfill-oriented
// FullSync path.
func HotSync(chatDB *ChatDB, warehouseDB *sql.DB) (*HotSyncResult, error) {
	if chatDB == nil {
		return nil, fmt.Errorf("hot sync requires chat.db access")
	}
	if warehouseDB == nil {
		return nil, fmt.Errorf("hot sync requires a warehouse database")
	}

	watermarks, err := loadOrSeedHotSyncWatermarks(chatDB, warehouseDB)
	if err != nil {
		return nil, err
	}

	result := &HotSyncResult{Watermarks: watermarks}

	messageSince := deltaRowID(watermarks.MessageRowID)
	if syncResult, err := syncMessagesDeltaResult(chatDB, warehouseDB, messageSince); err != nil {
		return nil, fmt.Errorf("hot message sync failed: %w", err)
	} else {
		result.MessagesCount = syncResult.Count
		if syncResult.FrontierID > watermarks.MessageRowID {
			watermarks.MessageRowID = syncResult.FrontierID
			if err := SetWatermark(warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkMessageName, &watermarks.MessageRowID, nil); err != nil {
				return nil, fmt.Errorf("failed to persist message watermark: %w", err)
			}
		}
	}

	if syncResult, err := syncMessageUpdatesDeltaResult(chatDB, warehouseDB, deltaTimestamp(watermarks.MessageUpdateTimestamp)); err != nil {
		return nil, fmt.Errorf("hot message update sync failed: %w", err)
	} else {
		result.MessageUpdatesCount = syncResult.Count
		if syncResult.FrontierTimeNS > watermarks.MessageUpdateTimestamp {
			watermarks.MessageUpdateTimestamp = syncResult.FrontierTimeNS
			watermarks.MessageUpdateNS = syncResult.FrontierTimeNS
			if err := SetWatermark(warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkMessageUpdateName, &watermarks.MessageUpdateTimestamp, nil); err != nil {
				return nil, fmt.Errorf("failed to persist message update watermark: %w", err)
			}
		}
	}

	reactionSince := deltaRowID(watermarks.ReactionRowID)
	if syncResult, err := syncReactionsDeltaResult(chatDB, warehouseDB, reactionSince); err != nil {
		return nil, fmt.Errorf("hot reaction sync failed: %w", err)
	} else {
		result.ReactionsCount = syncResult.Count
		if syncResult.FrontierID > watermarks.ReactionRowID {
			watermarks.ReactionRowID = syncResult.FrontierID
			if err := SetWatermark(warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkReactionName, &watermarks.ReactionRowID, nil); err != nil {
				return nil, fmt.Errorf("failed to persist reaction watermark: %w", err)
			}
		}
	}

	reactionRemovalSince := deltaTimestamp(watermarks.ReactionRemovalTimestamp)
	if syncResult, err := syncReactionRemovalsDeltaResult(chatDB, warehouseDB, reactionRemovalSince); err != nil {
		return nil, fmt.Errorf("hot reaction removal sync failed: %w", err)
	} else {
		result.ReactionRemovalsCount = syncResult.Count
		if syncResult.FrontierTimeNS > watermarks.ReactionRemovalTimestamp {
			watermarks.ReactionRemovalTimestamp = syncResult.FrontierTimeNS
			if err := SetWatermark(warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkReactionRemovalName, &watermarks.ReactionRemovalTimestamp, nil); err != nil {
				return nil, fmt.Errorf("failed to persist reaction removal watermark: %w", err)
			}
		}
	}

	membershipSince := deltaRowID(watermarks.MembershipRowID)
	if syncResult, err := syncMembershipEventsDeltaResult(chatDB, warehouseDB, membershipSince); err != nil {
		return nil, fmt.Errorf("hot membership sync failed: %w", err)
	} else {
		result.MembershipCount = syncResult.Count
		if syncResult.FrontierID > watermarks.MembershipRowID {
			watermarks.MembershipRowID = syncResult.FrontierID
			if err := SetWatermark(warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkMembershipName, &watermarks.MembershipRowID, nil); err != nil {
				return nil, fmt.Errorf("failed to persist membership watermark: %w", err)
			}
		}
	}

	attachmentSince := deltaRowID(watermarks.AttachmentRowID)
	if syncResult, err := syncAttachmentsDeltaResult(chatDB, warehouseDB, attachmentSince); err != nil {
		return nil, fmt.Errorf("hot attachment sync failed: %w", err)
	} else {
		result.AttachmentsCount = syncResult.Count
		if syncResult.FrontierID > watermarks.AttachmentRowID {
			watermarks.AttachmentRowID = syncResult.FrontierID
			if err := SetWatermark(warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkAttachmentName, &watermarks.AttachmentRowID, nil); err != nil {
				return nil, fmt.Errorf("failed to persist attachment watermark: %w", err)
			}
		}
	}

	result.Watermarks = watermarks
	return result, nil
}

func deltaRowID(rowID int64) int64 {
	if rowID > hotSyncLookbackRowIDs {
		return rowID - hotSyncLookbackRowIDs
	}
	return 0
}

func deltaTimestamp(timestampNS int64) int64 {
	if timestampNS <= 0 {
		return 0
	}
	lookbackNS := int64(hotSyncLookbackDuration)
	if timestampNS > lookbackNS {
		return timestampNS - lookbackNS
	}
	return 0
}

func loadOrSeedHotSyncWatermarks(chatDB *ChatDB, warehouseDB *sql.DB) (HotSyncWatermarks, error) {
	messageMax, err := chatDB.GetMaxEligibleMessageRowID()
	if err != nil {
		return HotSyncWatermarks{}, err
	}
	messageUpdateMax, err := chatDB.GetMaxObservedMessageUpdateTimestampNS()
	if err != nil {
		return HotSyncWatermarks{}, err
	}
	reactionMax, err := chatDB.GetMaxObservedReactionRowID()
	if err != nil {
		return HotSyncWatermarks{}, err
	}
	reactionRemovalMax, err := chatDB.GetMaxObservedReactionRemovalTimestampNS()
	if err != nil {
		return HotSyncWatermarks{}, err
	}
	membershipMax, err := chatDB.GetMaxObservedMembershipRowID()
	if err != nil {
		return HotSyncWatermarks{}, err
	}
	attachmentMax, err := chatDB.GetMaxObservedAttachmentRowID()
	if err != nil {
		return HotSyncWatermarks{}, err
	}

	handleRowID, err := GetOrSeedWatermarkInt(warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkHandleName, 0)
	if err != nil {
		return HotSyncWatermarks{}, err
	}
	chatRowID, err := GetOrSeedWatermarkInt(warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkChatName, 0)
	if err != nil {
		return HotSyncWatermarks{}, err
	}
	messageRowID, err := GetOrSeedWatermarkInt(warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkMessageName, messageMax)
	if err != nil {
		return HotSyncWatermarks{}, err
	}
	messageUpdateTimestamp, err := GetOrSeedWatermarkInt(warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkMessageUpdateName, messageUpdateMax)
	if err != nil {
		return HotSyncWatermarks{}, err
	}
	reactionRowID, err := GetOrSeedWatermarkInt(warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkReactionName, reactionMax)
	if err != nil {
		return HotSyncWatermarks{}, err
	}
	reactionRemovalTimestamp, err := GetOrSeedWatermarkInt(warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkReactionRemovalName, reactionRemovalMax)
	if err != nil {
		return HotSyncWatermarks{}, err
	}
	membershipRowID, err := GetOrSeedWatermarkInt(warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkMembershipName, membershipMax)
	if err != nil {
		return HotSyncWatermarks{}, err
	}
	attachmentRowID, err := GetOrSeedWatermarkInt(warehouseDB, hotSyncWatermarkSource, hotSyncWatermarkAttachmentName, attachmentMax)
	if err != nil {
		return HotSyncWatermarks{}, err
	}

	return HotSyncWatermarks{
		HandleRowID:              handleRowID,
		ChatRowID:                chatRowID,
		MessageRowID:             messageRowID,
		MessageUpdateTimestamp:   messageUpdateTimestamp,
		MessageUpdateNS:          messageUpdateTimestamp,
		ReactionRowID:            reactionRowID,
		ReactionRemovalTimestamp: reactionRemovalTimestamp,
		MembershipRowID:          membershipRowID,
		AttachmentRowID:          attachmentRowID,
	}, nil
}

// SyncHandlesDelta copies handles from chat.db to the warehouse using a ROWID watermark.
func SyncHandlesDelta(chatDB *ChatDB, warehouseDB *sql.DB, sinceRowID int64) (int, error) {
	handles, err := chatDB.GetHandlesSince(sinceRowID)
	if err != nil {
		return 0, fmt.Errorf("failed to read handles: %w", err)
	}
	if len(handles) == 0 {
		return 0, nil
	}

	tx, err := warehouseDB.Begin()
	if err != nil {
		return 0, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	for _, handle := range handles {
		if err := insertHandle(tx, &handle); err != nil {
			return 0, fmt.Errorf("failed to insert handle %d: %w", handle.ROWID, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return len(handles), nil
}

// SyncChatsDelta copies chats from chat.db to the warehouse using a ROWID watermark.
func SyncChatsDelta(chatDB *ChatDB, warehouseDB *sql.DB, sinceRowID int64) (int, error) {
	chats, err := chatDB.GetChatsSince(sinceRowID)
	if err != nil {
		return 0, fmt.Errorf("failed to read chats: %w", err)
	}
	if len(chats) == 0 {
		return 0, nil
	}

	tx, err := warehouseDB.Begin()
	if err != nil {
		return 0, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	for _, chat := range chats {
		if err := insertChat(tx, &chat); err != nil {
			return 0, fmt.Errorf("failed to insert chat %d: %w", chat.ROWID, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return len(chats), nil
}

// SyncChatParticipantsDelta copies chat participants for chats above the ROWID watermark.
func SyncChatParticipantsDelta(chatDB *ChatDB, warehouseDB *sql.DB, sinceRowID int64) (int, error) {
	participants, err := chatDB.GetChatParticipantsSince(sinceRowID)
	if err != nil {
		return 0, fmt.Errorf("failed to read chat participants: %w", err)
	}
	if len(participants) == 0 {
		return 0, nil
	}

	tx, err := warehouseDB.Begin()
	if err != nil {
		return 0, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	synced, err := syncChatParticipants(tx, chatDB, participants)
	if err != nil {
		return 0, err
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return synced, nil
}

// SyncMessagesDelta copies new messages from chat.db to the warehouse using a ROWID watermark.
func SyncMessagesDelta(chatDB *ChatDB, warehouseDB *sql.DB, sinceRowID int64) (int, error) {
	result, err := syncMessagesDeltaResult(chatDB, warehouseDB, sinceRowID)
	if err != nil {
		return 0, err
	}
	return result.Count, nil
}

func syncMessagesDeltaResult(chatDB *ChatDB, warehouseDB *sql.DB, sinceRowID int64) (hotSyncRowIDResult, error) {
	messages, err := chatDB.GetMessages(sinceRowID)
	if err != nil {
		return hotSyncRowIDResult{}, fmt.Errorf("failed to read messages: %w", err)
	}
	result := hotSyncRowIDResult{FrontierID: maxMessageFrontier(messages)}
	if len(messages) == 0 {
		return result, nil
	}

	tx, err := warehouseDB.Begin()
	if err != nil {
		return hotSyncRowIDResult{}, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	if err := ensureChatsForMessages(tx, messages); err != nil {
		return hotSyncRowIDResult{}, err
	}
	handleMap, err := loadWarehouseHandleMapForMessages(tx, chatDB, messages)
	if err != nil {
		return hotSyncRowIDResult{}, err
	}

	for _, msg := range messages {
		if err := insertMessage(tx, &msg, handleMap); err != nil {
			return hotSyncRowIDResult{}, fmt.Errorf("failed to insert message %d: %w", msg.ROWID, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return hotSyncRowIDResult{}, fmt.Errorf("failed to commit transaction: %w", err)
	}

	result.Count = len(messages)
	return result, nil
}

// SyncReactionsDelta copies new reactions from chat.db to the warehouse using a ROWID watermark.
func SyncReactionsDelta(chatDB *ChatDB, warehouseDB *sql.DB, sinceRowID int64) (int, error) {
	result, err := syncReactionsDeltaResult(chatDB, warehouseDB, sinceRowID)
	if err != nil {
		return 0, err
	}
	return result.Count, nil
}

func syncReactionsDeltaResult(chatDB *ChatDB, warehouseDB *sql.DB, sinceRowID int64) (hotSyncRowIDResult, error) {
	reactions, err := chatDB.GetReactions(sinceRowID)
	if err != nil {
		return hotSyncRowIDResult{}, fmt.Errorf("failed to read reactions: %w", err)
	}
	result := hotSyncRowIDResult{FrontierID: maxReactionFrontier(reactions)}
	if len(reactions) == 0 {
		return result, nil
	}

	tx, err := warehouseDB.Begin()
	if err != nil {
		return hotSyncRowIDResult{}, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	if err := ensureOriginalMessagesForReactions(tx, chatDB, reactions); err != nil {
		return hotSyncRowIDResult{}, err
	}
	if err := ensureChatsForReactions(tx, reactions); err != nil {
		return hotSyncRowIDResult{}, err
	}
	chatMap, err := loadWarehouseChatMap(tx)
	if err != nil {
		return hotSyncRowIDResult{}, err
	}
	handleMap, err := loadWarehouseHandleMapForReactions(tx, chatDB, reactions)
	if err != nil {
		return hotSyncRowIDResult{}, err
	}

	created := 0
	for _, reaction := range reactions {
		if err := insertReaction(tx, chatMap, handleMap, &reaction); err != nil {
			return hotSyncRowIDResult{}, fmt.Errorf("failed to insert reaction %d: %w", reaction.ROWID, err)
		}
		created++
	}

	if err := tx.Commit(); err != nil {
		return hotSyncRowIDResult{}, fmt.Errorf("failed to commit transaction: %w", err)
	}

	result.Count = created
	return result, nil
}

// SyncMembershipEventsDelta copies new group membership events from chat.db to the warehouse using a ROWID watermark.
func SyncMembershipEventsDelta(chatDB *ChatDB, warehouseDB *sql.DB, sinceRowID int64) (int, error) {
	result, err := syncMembershipEventsDeltaResult(chatDB, warehouseDB, sinceRowID)
	if err != nil {
		return 0, err
	}
	return result.Count, nil
}

func syncMembershipEventsDeltaResult(chatDB *ChatDB, warehouseDB *sql.DB, sinceRowID int64) (hotSyncRowIDResult, error) {
	actions, err := chatDB.GetGroupActions(sinceRowID)
	if err != nil {
		return hotSyncRowIDResult{}, fmt.Errorf("failed to read group actions: %w", err)
	}
	result := hotSyncRowIDResult{FrontierID: maxMembershipFrontier(actions)}
	if len(actions) == 0 {
		return result, nil
	}

	tx, err := warehouseDB.Begin()
	if err != nil {
		return hotSyncRowIDResult{}, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	if err := ensureChatsForMembership(tx, actions); err != nil {
		return hotSyncRowIDResult{}, err
	}
	chatMap, err := loadWarehouseChatMap(tx)
	if err != nil {
		return hotSyncRowIDResult{}, err
	}
	handleMap, err := loadWarehouseHandleMapForMembership(tx, chatDB, actions)
	if err != nil {
		return hotSyncRowIDResult{}, err
	}
	meContactID, err := loadWarehouseMeContactID(tx)
	if err != nil {
		return hotSyncRowIDResult{}, err
	}

	created := 0
	for _, action := range actions {
		if err := insertMembershipEvent(tx, chatMap, handleMap, meContactID, &action); err != nil {
			return hotSyncRowIDResult{}, fmt.Errorf("failed to insert membership event %d: %w", action.ROWID, err)
		}
		created++
	}

	if err := tx.Commit(); err != nil {
		return hotSyncRowIDResult{}, fmt.Errorf("failed to commit transaction: %w", err)
	}

	result.Count = created
	return result, nil
}

func maxMessageFrontier(messages []Message) int64 {
	var maxRowID int64
	for _, msg := range messages {
		if msg.ROWID > maxRowID {
			maxRowID = msg.ROWID
		}
	}
	return maxRowID
}

func maxReactionFrontier(reactions []Reaction) int64 {
	var maxRowID int64
	for _, reaction := range reactions {
		if reaction.ROWID > maxRowID {
			maxRowID = reaction.ROWID
		}
	}
	return maxRowID
}

func maxMembershipFrontier(actions []GroupAction) int64 {
	var maxRowID int64
	for _, action := range actions {
		if action.ROWID > maxRowID {
			maxRowID = action.ROWID
		}
	}
	return maxRowID
}

func loadWarehouseHandleMapForMessages(tx *sql.Tx, chatDB *ChatDB, messages []Message) (map[int64]int64, error) {
	rowIDs := uniqueMessageHandleRowIDs(messages)
	if len(rowIDs) == 0 {
		return map[int64]int64{}, nil
	}
	handles, err := chatDB.GetHandlesByRowIDs(rowIDs)
	if err != nil {
		return nil, err
	}
	return buildWarehouseHandleMapForHandles(tx, handles)
}

func loadWarehouseHandleMapForReactions(tx *sql.Tx, chatDB *ChatDB, reactions []Reaction) (map[int64]int64, error) {
	rowIDs := uniqueReactionHandleRowIDs(reactions)
	if len(rowIDs) == 0 {
		return map[int64]int64{}, nil
	}
	handles, err := chatDB.GetHandlesByRowIDs(rowIDs)
	if err != nil {
		return nil, err
	}
	return buildWarehouseHandleMapForHandles(tx, handles)
}

func loadWarehouseHandleMapForMembership(tx *sql.Tx, chatDB *ChatDB, actions []GroupAction) (map[int64]int64, error) {
	rowIDs := uniqueMembershipHandleRowIDs(actions)
	if len(rowIDs) == 0 {
		return map[int64]int64{}, nil
	}
	handles, err := chatDB.GetHandlesByRowIDs(rowIDs)
	if err != nil {
		return nil, err
	}
	return buildWarehouseHandleMapForHandles(tx, handles)
}

func buildWarehouseHandleMapForHandles(tx *sql.Tx, handles []Handle) (map[int64]int64, error) {
	stmt, err := tx.Prepare(`
		SELECT contact_id
		FROM contact_identifiers
		WHERE identifier = ? AND type = ?
		LIMIT 1
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare handle lookup: %w", err)
	}
	defer stmt.Close()

	handleMap := make(map[int64]int64, len(handles))
	for _, handle := range handles {
		normalized, identifierType := normalizeIdentifier(handle.ID)
		if normalized == "" {
			continue
		}
		if err := insertHandle(tx, &handle); err != nil {
			return nil, fmt.Errorf("failed to seed handle %d: %w", handle.ROWID, err)
		}
		var contactID int64
		if err := stmt.QueryRow(normalized, identifierType).Scan(&contactID); err == nil {
			handleMap[handle.ROWID] = contactID
		}
	}
	return handleMap, nil
}

func ensureChatsForMessages(tx *sql.Tx, messages []Message) error {
	return ensureChats(tx, uniqueMessageChats(messages))
}

func ensureChatsForReactions(tx *sql.Tx, reactions []Reaction) error {
	return ensureChats(tx, uniqueReactionChats(reactions))
}

func ensureChatsForMembership(tx *sql.Tx, actions []GroupAction) error {
	return ensureChats(tx, uniqueMembershipChats(actions))
}

func ensureChats(tx *sql.Tx, chats []Chat) error {
	seen := make(map[string]struct{}, len(chats))
	for _, chat := range chats {
		if chat.ChatIdentifier == "" {
			continue
		}
		if _, ok := seen[chat.ChatIdentifier]; ok {
			continue
		}
		seen[chat.ChatIdentifier] = struct{}{}
		if err := insertChat(tx, &chat); err != nil {
			return fmt.Errorf("failed to seed chat %q: %w", chat.ChatIdentifier, err)
		}
	}
	return nil
}

func uniqueMessageChats(messages []Message) []Chat {
	chats := make([]Chat, 0, len(messages))
	seen := make(map[string]struct{}, len(messages))
	for _, msg := range messages {
		if msg.ChatIdentifier == "" {
			continue
		}
		if _, ok := seen[msg.ChatIdentifier]; ok {
			continue
		}
		seen[msg.ChatIdentifier] = struct{}{}
		chats = append(chats, Chat{
			ROWID:          msg.ChatID,
			ChatIdentifier: msg.ChatIdentifier,
			DisplayName:    msg.ChatDisplayName,
			ServiceName:    msg.ChatServiceName,
			Style:          int(nullInt64Value(msg.ChatStyle)),
		})
	}
	return chats
}

func uniqueReactionChats(reactions []Reaction) []Chat {
	chats := make([]Chat, 0, len(reactions))
	seen := make(map[string]struct{}, len(reactions))
	for _, reaction := range reactions {
		if reaction.ChatIdentifier == "" {
			continue
		}
		if _, ok := seen[reaction.ChatIdentifier]; ok {
			continue
		}
		seen[reaction.ChatIdentifier] = struct{}{}
		chats = append(chats, Chat{
			ROWID:          reaction.ChatID,
			ChatIdentifier: reaction.ChatIdentifier,
			DisplayName:    reaction.ChatDisplayName,
			ServiceName:    reaction.ChatServiceName,
			Style:          int(nullInt64Value(reaction.ChatStyle)),
		})
	}
	return chats
}

func uniqueMembershipChats(actions []GroupAction) []Chat {
	chats := make([]Chat, 0, len(actions))
	seen := make(map[string]struct{}, len(actions))
	for _, action := range actions {
		if action.ChatIdentifier == "" {
			continue
		}
		if _, ok := seen[action.ChatIdentifier]; ok {
			continue
		}
		seen[action.ChatIdentifier] = struct{}{}
		chats = append(chats, Chat{
			ROWID:          action.ChatID,
			ChatIdentifier: action.ChatIdentifier,
			DisplayName:    action.ChatDisplayName,
			ServiceName:    action.ChatServiceName,
			Style:          int(nullInt64Value(action.ChatStyle)),
		})
	}
	return chats
}

func nullInt64Value(val sql.NullInt64) int64 {
	if val.Valid {
		return val.Int64
	}
	return 0
}

func uniqueMessageHandleRowIDs(messages []Message) []int64 {
	seen := make(map[int64]struct{})
	out := make([]int64, 0, len(messages))
	for _, msg := range messages {
		if !msg.HandleID.Valid || msg.HandleID.Int64 <= 0 {
			continue
		}
		if _, ok := seen[msg.HandleID.Int64]; ok {
			continue
		}
		seen[msg.HandleID.Int64] = struct{}{}
		out = append(out, msg.HandleID.Int64)
	}
	return out
}

func uniqueReactionHandleRowIDs(reactions []Reaction) []int64 {
	seen := make(map[int64]struct{})
	out := make([]int64, 0, len(reactions))
	for _, reaction := range reactions {
		if !reaction.HandleID.Valid || reaction.HandleID.Int64 <= 0 {
			continue
		}
		if _, ok := seen[reaction.HandleID.Int64]; ok {
			continue
		}
		seen[reaction.HandleID.Int64] = struct{}{}
		out = append(out, reaction.HandleID.Int64)
	}
	return out
}

func uniqueMembershipHandleRowIDs(actions []GroupAction) []int64 {
	seen := make(map[int64]struct{})
	out := make([]int64, 0, len(actions)*2)
	add := func(id sql.NullInt64) {
		if !id.Valid || id.Int64 <= 0 {
			return
		}
		if _, ok := seen[id.Int64]; ok {
			return
		}
		seen[id.Int64] = struct{}{}
		out = append(out, id.Int64)
	}

	for _, action := range actions {
		add(action.HandleID)
		add(action.OtherHandleID)
	}
	return out
}
