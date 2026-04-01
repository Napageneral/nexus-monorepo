package etl

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// ChatDB handles read-only access to the macOS Messages chat.db
type ChatDB struct {
	db *sql.DB
}

// MessageCount contains statistics about messages in chat.db
type MessageCount struct {
	TotalMessages int       `json:"total_messages"`
	MaxRowID      int64     `json:"max_rowid"`
	OldestDate    time.Time `json:"oldest_date,omitempty"`
	NewestDate    time.Time `json:"newest_date,omitempty"`
}

// GetChatDBPath returns the path to the macOS Messages chat.db
func GetChatDBPath() string {
	// Check for env override first
	if override := os.Getenv("EVE_SOURCE_CHAT_DB"); override != "" {
		return os.ExpandEnv(override)
	}
	if override := os.Getenv("CHATSTATS_SOURCE_CHAT_DB"); override != "" {
		return os.ExpandEnv(override)
	}

	// Default macOS location
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, "Library", "Messages", "chat.db")
}

// OpenChatDB opens the chat.db with read-only optimized pragmas
func OpenChatDB(path string) (*ChatDB, error) {
	// Check if file exists
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil, fmt.Errorf("chat.db not found at %s", path)
	}

	// Open with read-only URI mode
	// Note: Don't use immutable=1 for live macOS Messages DB (uses WAL)
	uri := fmt.Sprintf("file:%s?mode=ro", path)
	db, err := sql.Open("sqlite3", uri)
	if err != nil {
		return nil, fmt.Errorf("failed to open chat.db: %w", err)
	}

	// Set read-only pragmas for performance
	pragmas := []string{
		"PRAGMA query_only=ON",
		"PRAGMA synchronous=OFF",
		"PRAGMA journal_mode=OFF",
		"PRAGMA temp_store=MEMORY",
		"PRAGMA cache_size=-262144",  // 256MB cache
		"PRAGMA mmap_size=268435456", // 256MB memory map
	}

	for _, pragma := range pragmas {
		if _, err := db.Exec(pragma); err != nil {
			// Ignore pragma errors (some may not be supported)
			continue
		}
	}

	return &ChatDB{db: db}, nil
}

// Close closes the chat.db connection
func (c *ChatDB) Close() error {
	if c.db != nil {
		return c.db.Close()
	}
	return nil
}

// CountMessages returns statistics about messages in chat.db
// If sinceRowID > 0, only counts messages with ROWID > sinceRowID
func (c *ChatDB) CountMessages(sinceRowID int64) (*MessageCount, error) {
	query := `
		SELECT
			COUNT(*) as total,
			COALESCE(MAX(ROWID), 0) as max_rowid,
			MIN(date) as oldest_date,
			MAX(date) as newest_date
		FROM message
	`

	args := []interface{}{}
	if sinceRowID > 0 {
		query += " WHERE ROWID > ?"
		args = append(args, sinceRowID)
	}

	var count MessageCount
	var oldestNano, newestNano sql.NullInt64

	err := c.db.QueryRow(query, args...).Scan(
		&count.TotalMessages,
		&count.MaxRowID,
		&oldestNano,
		&newestNano,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to count messages: %w", err)
	}

	// Convert Apple timestamps (nanoseconds since 2001-01-01) to Go time
	// Apple epoch: 2001-01-01 00:00:00 UTC
	appleEpoch := time.Date(2001, 1, 1, 0, 0, 0, 0, time.UTC)

	if oldestNano.Valid && oldestNano.Int64 > 0 {
		count.OldestDate = appleEpoch.Add(time.Duration(oldestNano.Int64) * time.Nanosecond)
	}
	if newestNano.Valid && newestNano.Int64 > 0 {
		count.NewestDate = appleEpoch.Add(time.Duration(newestNano.Int64) * time.Nanosecond)
	}

	return &count, nil
}

// GetChatCount returns the number of chats in chat.db
func (c *ChatDB) GetChatCount() (int, error) {
	var count int
	err := c.db.QueryRow("SELECT COUNT(*) FROM chat").Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count chats: %w", err)
	}
	return count, nil
}

// GetHandleCount returns the number of handles (contacts) in chat.db
func (c *ChatDB) GetHandleCount() (int, error) {
	var count int
	err := c.db.QueryRow("SELECT COUNT(*) FROM handle").Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count handles: %w", err)
	}
	return count, nil
}

func (c *ChatDB) queryMaxMessageRowID(where string) (int64, error) {
	query := "SELECT COALESCE(MAX(ROWID), 0) FROM message"
	if where != "" {
		query += " WHERE " + where
	}

	var maxRowID int64
	if err := c.db.QueryRow(query).Scan(&maxRowID); err != nil {
		return 0, fmt.Errorf("failed to query max message ROWID: %w", err)
	}
	return maxRowID, nil
}

func (c *ChatDB) getMaxRowID(table string) (int64, error) {
	var query string
	switch table {
	case "handle", "chat", "attachment":
		query = "SELECT COALESCE(MAX(ROWID), 0) FROM " + table
	default:
		return 0, fmt.Errorf("unsupported rowid table %q", table)
	}

	var maxRowID int64
	if err := c.db.QueryRow(query).Scan(&maxRowID); err != nil {
		return 0, fmt.Errorf("failed to query max ROWID for %s: %w", table, err)
	}
	return maxRowID, nil
}

// GetMaxHandleRowID returns the maximum ROWID from the handle table.
func (c *ChatDB) GetMaxHandleRowID() (int64, error) {
	return c.getMaxRowID("handle")
}

// GetMaxChatRowID returns the maximum ROWID from the chat table.
func (c *ChatDB) GetMaxChatRowID() (int64, error) {
	return c.getMaxRowID("chat")
}

// GetMaxReactionRowID returns the highest message ROWID currently representing a reaction.
func (c *ChatDB) GetMaxReactionRowID() (int64, error) {
	return c.queryMaxMessageRowID(`
		associated_message_guid IS NOT NULL
		AND associated_message_guid != ''
		AND (
			(type >= 2000 AND type <= 2005)
			OR
			(type = 0 AND (
				text LIKE 'Loved %' OR
				text LIKE 'Liked %' OR
				text LIKE 'Disliked %' OR
				text LIKE 'Laughed at %' OR
				text LIKE 'Emphasized %' OR
				text LIKE 'Questioned %'
			))
		)
	`)
}

// GetMaxMembershipRowID returns the highest message ROWID currently representing a membership event.
func (c *ChatDB) GetMaxMembershipRowID() (int64, error) {
	return c.queryMaxMessageRowID(`
		group_action_type IS NOT NULL
		AND group_action_type != 0
	`)
}

// GetMaxMessageUpdateTimestampNS returns the latest edit or retraction timestamp in Apple epoch nanoseconds.
func (c *ChatDB) GetMaxMessageUpdateTimestampNS() (int64, error) {
	query := `
		SELECT COALESCE(MAX(
			CASE
				WHEN COALESCE(date_retracted, 0) > COALESCE(date_edited, 0)
					THEN COALESCE(date_retracted, 0)
				ELSE COALESCE(date_edited, 0)
			END
		), 0)
		FROM message
		WHERE COALESCE(date_edited, 0) > 0 OR COALESCE(date_retracted, 0) > 0
	`

	var maxTimestampNS int64
	if err := c.db.QueryRow(query).Scan(&maxTimestampNS); err != nil {
		return 0, fmt.Errorf("failed to query max message update timestamp: %w", err)
	}
	return maxTimestampNS, nil
}

// GetMaxReactionRemovalTimestampNS returns the latest recoverable-message delete timestamp in Apple epoch nanoseconds.
func (c *ChatDB) GetMaxReactionRemovalTimestampNS() (int64, error) {
	query := `
		SELECT COALESCE(MAX(
			COALESCE(delete_date, 0)
		), 0)
		FROM chat_recoverable_message_join
		WHERE COALESCE(delete_date, 0) > 0
	`

	var maxTimestampNS int64
	if err := c.db.QueryRow(query).Scan(&maxTimestampNS); err != nil {
		return 0, fmt.Errorf("failed to query max reaction removal timestamp: %w", err)
	}
	return maxTimestampNS, nil
}

// GetHandlesSince reads handles from chat.db with an optional ROWID watermark.
func (c *ChatDB) GetHandlesSince(sinceRowID int64) ([]Handle, error) {
	query := `
		SELECT ROWID, id
		FROM handle
		WHERE ROWID > ?
		ORDER BY ROWID
	`

	rows, err := c.db.Query(query, sinceRowID)
	if err != nil {
		return nil, fmt.Errorf("failed to query handles: %w", err)
	}
	defer rows.Close()

	var handles []Handle
	for rows.Next() {
		var h Handle
		if err := rows.Scan(&h.ROWID, &h.ID); err != nil {
			return nil, fmt.Errorf("failed to scan handle: %w", err)
		}
		handles = append(handles, h)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating handles: %w", err)
	}

	return handles, nil
}

// GetHandlesByRowIDs reads a specific set of handles from chat.db.
func (c *ChatDB) GetHandlesByRowIDs(rowIDs []int64) ([]Handle, error) {
	if len(rowIDs) == 0 {
		return nil, nil
	}

	placeholders := make([]string, 0, len(rowIDs))
	args := make([]any, 0, len(rowIDs))
	for _, rowID := range rowIDs {
		placeholders = append(placeholders, "?")
		args = append(args, rowID)
	}

	query := `
		SELECT ROWID, id
		FROM handle
		WHERE ROWID IN (` + joinPlaceholders(placeholders) + `)
		ORDER BY ROWID
	`

	rows, err := c.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query handles by rowid: %w", err)
	}
	defer rows.Close()

	var handles []Handle
	for rows.Next() {
		var h Handle
		if err := rows.Scan(&h.ROWID, &h.ID); err != nil {
			return nil, fmt.Errorf("failed to scan handle: %w", err)
		}
		handles = append(handles, h)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating handles: %w", err)
	}

	return handles, nil
}

// GetChatsSince reads chats from chat.db with an optional ROWID watermark.
func (c *ChatDB) GetChatsSince(sinceRowID int64) ([]Chat, error) {
	query := `
		SELECT ROWID, chat_identifier, display_name, service_name, style
		FROM chat
		WHERE ROWID > ?
		ORDER BY ROWID
	`

	rows, err := c.db.Query(query, sinceRowID)
	if err != nil {
		return nil, fmt.Errorf("failed to query chats: %w", err)
	}
	defer rows.Close()

	var chats []Chat
	for rows.Next() {
		var ch Chat
		if err := rows.Scan(&ch.ROWID, &ch.ChatIdentifier, &ch.DisplayName, &ch.ServiceName, &ch.Style); err != nil {
			return nil, fmt.Errorf("failed to scan chat: %w", err)
		}
		chats = append(chats, ch)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating chats: %w", err)
	}

	return chats, nil
}

// GetChatParticipantsSince reads chat participants for chats above the ROWID watermark.
func (c *ChatDB) GetChatParticipantsSince(sinceRowID int64) ([]ChatParticipant, error) {
	query := `
		SELECT ch.chat_identifier, chj.handle_id
		FROM chat_handle_join chj
		JOIN chat ch ON ch.ROWID = chj.chat_id
		WHERE ch.ROWID > ?
		  AND ch.chat_identifier IS NOT NULL
		  AND ch.chat_identifier != ''
		ORDER BY ch.chat_identifier, chj.handle_id
	`

	rows, err := c.db.Query(query, sinceRowID)
	if err != nil {
		return nil, fmt.Errorf("failed to query chat participants: %w", err)
	}
	defer rows.Close()

	var out []ChatParticipant
	for rows.Next() {
		var p ChatParticipant
		if err := rows.Scan(&p.ChatIdentifier, &p.HandleID); err != nil {
			return nil, fmt.Errorf("failed to scan chat participant: %w", err)
		}
		out = append(out, p)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating chat participants: %w", err)
	}

	return out, nil
}

func joinPlaceholders(parts []string) string {
	if len(parts) == 0 {
		return ""
	}
	out := parts[0]
	for _, part := range parts[1:] {
		out += "," + part
	}
	return out
}
