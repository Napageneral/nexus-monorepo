package control

import (
	"fmt"
	"strings"
	"time"
)

// WebhookDelivery tracks one GitHub delivery-id ingest lifecycle.
type WebhookDelivery struct {
	DeliveryID  string    `json:"delivery_id"`
	Event       string    `json:"event"`
	TreeID      string    `json:"tree_id"`
	PayloadHash string    `json:"payload_hash"`
	Status      string    `json:"status"`
	JobIDsJSON  string    `json:"job_ids_json"`
	Error       string    `json:"error"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// UpsertWebhookDeliveryReceived inserts the delivery if new and returns existing state otherwise.
func (s *Store) UpsertWebhookDeliveryReceived(deliveryID string, event string, treeID string, payloadHash string) (*WebhookDelivery, bool, error) {
	if s == nil || s.db == nil {
		return nil, false, fmt.Errorf("control store is not configured")
	}
	deliveryID = strings.TrimSpace(deliveryID)
	event = strings.TrimSpace(event)
	treeID = strings.TrimSpace(treeID)
	payloadHash = strings.TrimSpace(strings.ToLower(payloadHash))
	if deliveryID == "" {
		return nil, false, fmt.Errorf("delivery_id is required")
	}
	if event == "" {
		return nil, false, fmt.Errorf("event is required")
	}
	if treeID == "" {
		return nil, false, fmt.Errorf("tree_id is required")
	}
	if payloadHash == "" {
		return nil, false, fmt.Errorf("payload_hash is required")
	}

	now := time.Now().UTC().UnixMilli()
	res, err := s.db.Exec(`
		INSERT OR IGNORE INTO webhook_deliveries
		  (delivery_id, event, tree_id, payload_hash, status, job_ids_json, error, created_at, updated_at)
		VALUES (?, ?, ?, ?, 'received', '[]', '', ?, ?)
	`, deliveryID, event, treeID, payloadHash, now, now)
	if err != nil {
		return nil, false, err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return nil, false, err
	}
	row, err := s.GetWebhookDelivery(deliveryID)
	if err != nil {
		return nil, false, err
	}
	return row, rows > 0, nil
}

func (s *Store) UpdateWebhookDelivery(deliveryID string, status string, jobIDsJSON string, errMsg string) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("control store is not configured")
	}
	deliveryID = strings.TrimSpace(deliveryID)
	status = strings.TrimSpace(strings.ToLower(status))
	jobIDsJSON = strings.TrimSpace(jobIDsJSON)
	errMsg = strings.TrimSpace(errMsg)
	if deliveryID == "" {
		return fmt.Errorf("delivery_id is required")
	}
	if status == "" {
		return fmt.Errorf("status is required")
	}
	if jobIDsJSON == "" {
		jobIDsJSON = "[]"
	}
	_, err := s.db.Exec(`
		UPDATE webhook_deliveries
		SET status = ?, job_ids_json = ?, error = ?, updated_at = ?
		WHERE delivery_id = ?
	`, status, jobIDsJSON, errMsg, time.Now().UTC().UnixMilli(), deliveryID)
	return err
}

func (s *Store) GetWebhookDelivery(deliveryID string) (*WebhookDelivery, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("control store is not configured")
	}
	deliveryID = strings.TrimSpace(deliveryID)
	if deliveryID == "" {
		return nil, fmt.Errorf("delivery_id is required")
	}
	row := s.db.QueryRow(`
		SELECT delivery_id, event, tree_id, payload_hash, status, job_ids_json, error, created_at, updated_at
		FROM webhook_deliveries
		WHERE delivery_id = ?
	`, deliveryID)
	return scanWebhookDelivery(row)
}

func scanWebhookDelivery(scanner interface{ Scan(dest ...any) error }) (*WebhookDelivery, error) {
	var (
		out         WebhookDelivery
		createdAtMS int64
		updatedAtMS int64
	)
	if err := scanner.Scan(
		&out.DeliveryID,
		&out.Event,
		&out.TreeID,
		&out.PayloadHash,
		&out.Status,
		&out.JobIDsJSON,
		&out.Error,
		&createdAtMS,
		&updatedAtMS,
	); err != nil {
		return nil, err
	}
	out.CreatedAt = fromUnixMilli(createdAtMS)
	out.UpdatedAt = fromUnixMilli(updatedAtMS)
	return &out, nil
}
