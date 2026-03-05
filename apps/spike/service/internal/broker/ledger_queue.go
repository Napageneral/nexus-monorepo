package broker

import (
	"database/sql"
	"fmt"
	"strings"
)

func (b *Broker) enqueue(item QueueItemWrite) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	if strings.TrimSpace(item.ID) == "" {
		return fmt.Errorf("queue item id is required")
	}
	if strings.TrimSpace(item.SessionLabel) == "" {
		return fmt.Errorf("queue session label is required")
	}
	if strings.TrimSpace(item.MessageJSON) == "" {
		return fmt.Errorf("queue message_json is required")
	}
	if strings.TrimSpace(item.Mode) == "" {
		item.Mode = "queue"
	}
	if strings.TrimSpace(item.Status) == "" {
		item.Status = "queued"
	}
	if item.EnqueuedAt <= 0 {
		item.EnqueuedAt = nowUnixMilli()
	}

	_, err := db.Exec(`
		INSERT INTO queue_items (
			id, session_label, message_json, mode, status, enqueued_at, started_at, completed_at, error
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		item.ID,
		item.SessionLabel,
		item.MessageJSON,
		item.Mode,
		item.Status,
		item.EnqueuedAt,
		nullInt64Ptr(item.StartedAt),
		nullInt64Ptr(item.CompletedAt),
		nullIfBlank(item.Error),
	)
	return err
}

func (b *Broker) updateQueueItemStatus(id string, status string, startedAt *int64, completedAt *int64, errText string) error {
	db := b.ledgerDB()
	if db == nil {
		return fmt.Errorf("broker ledger is not configured")
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("queue item id is required")
	}
	status = strings.TrimSpace(status)
	if status == "" {
		return fmt.Errorf("queue item status is required")
	}
	_, err := db.Exec(`
		UPDATE queue_items
		SET status = ?,
		    started_at = COALESCE(?, started_at),
		    completed_at = COALESCE(?, completed_at),
		    error = COALESCE(?, error)
		WHERE id = ?
	`, status, nullInt64Ptr(startedAt), nullInt64Ptr(completedAt), nullIfBlank(errText), id)
	return err
}

func (b *Broker) listQueueItems(filter QueueFilter) ([]*QueueItem, error) {
	db := b.ledgerDB()
	if db == nil {
		return nil, fmt.Errorf("broker ledger is not configured")
	}

	where := make([]string, 0, 2)
	args := make([]any, 0, 3)
	if v := strings.TrimSpace(filter.SessionLabel); v != "" {
		where = append(where, "session_label = ?")
		args = append(args, v)
	}
	if v := strings.TrimSpace(filter.Status); v != "" {
		where = append(where, "status = ?")
		args = append(args, v)
	}
	limit := filter.Limit
	if limit <= 0 {
		limit = 200
	}

	query := `
		SELECT id, session_label, message_json, mode, status, enqueued_at, started_at, completed_at, error
		FROM queue_items
	`
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	query += " ORDER BY enqueued_at ASC LIMIT ?"
	args = append(args, limit)

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]*QueueItem, 0)
	for rows.Next() {
		var (
			item        QueueItem
			enqueuedAt  int64
			startedAt   sql.NullInt64
			completedAt sql.NullInt64
			errText     sql.NullString
		)
		if err := rows.Scan(
			&item.ID,
			&item.SessionLabel,
			&item.MessageJSON,
			&item.Mode,
			&item.Status,
			&enqueuedAt,
			&startedAt,
			&completedAt,
			&errText,
		); err != nil {
			return nil, err
		}
		item.EnqueuedAt = fromUnixMilli(enqueuedAt)
		item.StartedAt = fromNullUnixMilli(startedAt)
		item.CompletedAt = fromNullUnixMilli(completedAt)
		item.Error = nullString(errText)
		out = append(out, &item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}
