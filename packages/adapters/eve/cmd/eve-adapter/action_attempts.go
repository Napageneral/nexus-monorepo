package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type ActionAttemptStatus string

const (
	ActionAttemptStatusPending    ActionAttemptStatus = "pending"
	ActionAttemptStatusDispatched ActionAttemptStatus = "dispatched"
	ActionAttemptStatusConfirmed  ActionAttemptStatus = "confirmed"
	ActionAttemptStatusFailed     ActionAttemptStatus = "failed"
	ActionAttemptStatusCanceled   ActionAttemptStatus = "canceled"
)

type ActionAttemptRecord struct {
	ID                int64               `json:"id"`
	AttemptID         string              `json:"attempt_id"`
	ConnectionID      string              `json:"connection_id"`
	EdgeID            string              `json:"edge_id,omitempty"`
	Action            string              `json:"action"`
	Status            ActionAttemptStatus `json:"status"`
	RequestJSON       json.RawMessage     `json:"request_json"`
	ResponseJSON      json.RawMessage     `json:"response_json,omitempty"`
	ErrorMessage      string              `json:"error_message,omitempty"`
	TargetRecordID    string              `json:"target_record_id,omitempty"`
	TargetThreadID    string              `json:"target_thread_id,omitempty"`
	TargetMessageGUID string              `json:"target_message_guid,omitempty"`
	Metadata          map[string]any      `json:"metadata,omitempty"`
	DispatchedAtMs    *int64              `json:"dispatched_at_ms,omitempty"`
	ConfirmedAtMs     *int64              `json:"confirmed_at_ms,omitempty"`
	FailedAtMs        *int64              `json:"failed_at_ms,omitempty"`
	CreatedAtMs       int64               `json:"created_at_ms"`
	UpdatedAtMs       int64               `json:"updated_at_ms"`
}

type ActionAttemptCreateInput struct {
	AttemptID         string
	ConnectionID      string
	EdgeID            string
	Action            string
	Status            ActionAttemptStatus
	Request           any
	Response          any
	ErrorMessage      string
	TargetRecordID    string
	TargetThreadID    string
	TargetMessageGUID string
	Metadata          map[string]any
	DispatchedAt      *time.Time
	ConfirmedAt       *time.Time
	FailedAt          *time.Time
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type ActionAttemptUpdateInput struct {
	EdgeID            *string
	Action            *string
	Status            *ActionAttemptStatus
	Request           any
	Response          any
	ErrorMessage      *string
	TargetRecordID    *string
	TargetThreadID    *string
	TargetMessageGUID *string
	Metadata          map[string]any
	DispatchedAt      *time.Time
	ConfirmedAt       *time.Time
	FailedAt          *time.Time
	UpdatedAt         *time.Time
}

type ActionAttemptQueryFilter struct {
	AttemptID    string
	ConnectionID string
	EdgeID       string
	Action       string
	Status       ActionAttemptStatus
	Limit        int
	Offset       int
}

func normalizeNonEmptyString(value string) string {
	return strings.TrimSpace(value)
}

func nowUnixMs(t time.Time) int64 {
	if t.IsZero() {
		t = time.Now()
	}
	return t.UTC().UnixMilli()
}

func generateAttemptID() (string, error) {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return "attempt-" + hex.EncodeToString(raw[:]), nil
}

func marshalJSONText(value any, fallback string) (string, error) {
	if value == nil {
		return fallback, nil
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

func decodeJSONText(raw sql.NullString) json.RawMessage {
	if !raw.Valid || strings.TrimSpace(raw.String) == "" {
		return nil
	}
	return json.RawMessage(raw.String)
}

func decodeOptionalUnixMs(raw sql.NullInt64) *int64 {
	if !raw.Valid {
		return nil
	}
	value := raw.Int64
	return &value
}

func decodeOptionalMap(raw sql.NullString) map[string]any {
	if !raw.Valid || strings.TrimSpace(raw.String) == "" {
		return nil
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(raw.String), &out); err != nil {
		return nil
	}
	return out
}

func actionAttemptRowToRecord(row struct {
	ID                int64
	AttemptID         string
	ConnectionID      string
	EdgeID            sql.NullString
	Action            string
	Status            string
	RequestJSON       sql.NullString
	ResponseJSON      sql.NullString
	ErrorMessage      sql.NullString
	TargetRecordID    sql.NullString
	TargetThreadID    sql.NullString
	TargetMessageGUID sql.NullString
	MetadataJSON      sql.NullString
	DispatchedAt      sql.NullInt64
	ConfirmedAt       sql.NullInt64
	FailedAt          sql.NullInt64
	CreatedAt         int64
	UpdatedAt         int64
}) ActionAttemptRecord {
	return ActionAttemptRecord{
		ID:                row.ID,
		AttemptID:         row.AttemptID,
		ConnectionID:      row.ConnectionID,
		EdgeID:            strings.TrimSpace(row.EdgeID.String),
		Action:            row.Action,
		Status:            ActionAttemptStatus(row.Status),
		RequestJSON:       decodeJSONText(row.RequestJSON),
		ResponseJSON:      decodeJSONText(row.ResponseJSON),
		ErrorMessage:      strings.TrimSpace(row.ErrorMessage.String),
		TargetRecordID:    strings.TrimSpace(row.TargetRecordID.String),
		TargetThreadID:    strings.TrimSpace(row.TargetThreadID.String),
		TargetMessageGUID: strings.TrimSpace(row.TargetMessageGUID.String),
		Metadata:          decodeOptionalMap(row.MetadataJSON),
		DispatchedAtMs:    decodeOptionalUnixMs(row.DispatchedAt),
		ConfirmedAtMs:     decodeOptionalUnixMs(row.ConfirmedAt),
		FailedAtMs:        decodeOptionalUnixMs(row.FailedAt),
		CreatedAtMs:       row.CreatedAt,
		UpdatedAtMs:       row.UpdatedAt,
	}
}

func CreateActionAttempt(db *sql.DB, input ActionAttemptCreateInput) (ActionAttemptRecord, error) {
	attemptID := normalizeNonEmptyString(input.AttemptID)
	if attemptID == "" {
		generated, err := generateAttemptID()
		if err != nil {
			return ActionAttemptRecord{}, fmt.Errorf("generate attempt id: %w", err)
		}
		attemptID = generated
	}
	connectionID := normalizeNonEmptyString(input.ConnectionID)
	if connectionID == "" {
		return ActionAttemptRecord{}, fmt.Errorf("connection_id is required")
	}
	action := normalizeNonEmptyString(input.Action)
	if action == "" {
		return ActionAttemptRecord{}, fmt.Errorf("action is required")
	}
	status := input.Status
	if strings.TrimSpace(string(status)) == "" {
		status = ActionAttemptStatusPending
	}

	requestText, err := marshalJSONText(input.Request, "{}")
	if err != nil {
		return ActionAttemptRecord{}, fmt.Errorf("encode request: %w", err)
	}
	responseText, err := marshalJSONText(input.Response, "")
	if err != nil {
		return ActionAttemptRecord{}, fmt.Errorf("encode response: %w", err)
	}
	metadataText := ""
	if input.Metadata != nil {
		raw, err := json.Marshal(input.Metadata)
		if err != nil {
			return ActionAttemptRecord{}, fmt.Errorf("encode metadata: %w", err)
		}
		metadataText = string(raw)
	}

	createdAtMs := nowUnixMs(input.CreatedAt)
	updatedAtMs := nowUnixMs(input.UpdatedAt)
	if updatedAtMs == 0 {
		updatedAtMs = createdAtMs
	}
	dispatchedAtMs := nullableTimeMs(input.DispatchedAt)
	confirmedAtMs := nullableTimeMs(input.ConfirmedAt)
	failedAtMs := nullableTimeMs(input.FailedAt)

	_, err = db.Exec(`
		INSERT INTO action_attempts (
			attempt_id, connection_id, edge_id, action, status,
			request_json, response_json, error_message,
			target_record_id, target_thread_id, target_message_guid,
			metadata_json, dispatched_at, confirmed_at, failed_at,
			created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, attemptID, connectionID, nullableString(input.EdgeID), action, string(status), requestText, nullableText(responseText), nullableString(input.ErrorMessage), nullableString(input.TargetRecordID), nullableString(input.TargetThreadID), nullableString(input.TargetMessageGUID), nullableText(metadataText), dispatchedAtMs, confirmedAtMs, failedAtMs, createdAtMs, updatedAtMs)
	if err != nil {
		return ActionAttemptRecord{}, fmt.Errorf("insert action attempt: %w", err)
	}

	record, err := GetActionAttemptByAttemptID(db, attemptID)
	if err != nil {
		return ActionAttemptRecord{}, err
	}
	return record, nil
}

func UpdateActionAttemptByAttemptID(db *sql.DB, attemptID string, input ActionAttemptUpdateInput) (ActionAttemptRecord, error) {
	attemptID = normalizeNonEmptyString(attemptID)
	if attemptID == "" {
		return ActionAttemptRecord{}, fmt.Errorf("attempt_id is required")
	}

	sets := make([]string, 0, 12)
	args := make([]any, 0, 12)
	if input.EdgeID != nil {
		sets = append(sets, "edge_id = ?")
		args = append(args, nullableString(*input.EdgeID))
	}
	if input.Action != nil {
		sets = append(sets, "action = ?")
		args = append(args, normalizeNonEmptyString(*input.Action))
	}
	if input.Status != nil {
		sets = append(sets, "status = ?")
		args = append(args, strings.TrimSpace(string(*input.Status)))
	}
	if input.Request != nil {
		raw, err := json.Marshal(input.Request)
		if err != nil {
			return ActionAttemptRecord{}, fmt.Errorf("encode request: %w", err)
		}
		sets = append(sets, "request_json = ?")
		args = append(args, string(raw))
	}
	if input.Response != nil {
		raw, err := json.Marshal(input.Response)
		if err != nil {
			return ActionAttemptRecord{}, fmt.Errorf("encode response: %w", err)
		}
		sets = append(sets, "response_json = ?")
		args = append(args, string(raw))
	}
	if input.ErrorMessage != nil {
		sets = append(sets, "error_message = ?")
		args = append(args, nullableString(*input.ErrorMessage))
	}
	if input.TargetRecordID != nil {
		sets = append(sets, "target_record_id = ?")
		args = append(args, nullableString(*input.TargetRecordID))
	}
	if input.TargetThreadID != nil {
		sets = append(sets, "target_thread_id = ?")
		args = append(args, nullableString(*input.TargetThreadID))
	}
	if input.TargetMessageGUID != nil {
		sets = append(sets, "target_message_guid = ?")
		args = append(args, nullableString(*input.TargetMessageGUID))
	}
	if input.Metadata != nil {
		raw, err := json.Marshal(input.Metadata)
		if err != nil {
			return ActionAttemptRecord{}, fmt.Errorf("encode metadata: %w", err)
		}
		sets = append(sets, "metadata_json = ?")
		args = append(args, string(raw))
	}
	if input.DispatchedAt != nil {
		sets = append(sets, "dispatched_at = ?")
		args = append(args, nullableTimeMs(input.DispatchedAt))
	}
	if input.ConfirmedAt != nil {
		sets = append(sets, "confirmed_at = ?")
		args = append(args, nullableTimeMs(input.ConfirmedAt))
	}
	if input.FailedAt != nil {
		sets = append(sets, "failed_at = ?")
		args = append(args, nullableTimeMs(input.FailedAt))
	}

	updatedAt := time.Now()
	if input.UpdatedAt != nil {
		updatedAt = *input.UpdatedAt
	}
	sets = append(sets, "updated_at = ?")
	args = append(args, nowUnixMs(updatedAt))
	args = append(args, attemptID)

	query := fmt.Sprintf("UPDATE action_attempts SET %s WHERE attempt_id = ?", strings.Join(sets, ", "))
	result, err := db.Exec(query, args...)
	if err != nil {
		return ActionAttemptRecord{}, fmt.Errorf("update action attempt: %w", err)
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		return ActionAttemptRecord{}, fmt.Errorf("action attempt not found: %s", attemptID)
	}
	return GetActionAttemptByAttemptID(db, attemptID)
}

func GetActionAttemptByAttemptID(db *sql.DB, attemptID string) (ActionAttemptRecord, error) {
	attemptID = normalizeNonEmptyString(attemptID)
	if attemptID == "" {
		return ActionAttemptRecord{}, fmt.Errorf("attempt_id is required")
	}
	row := db.QueryRow(`
		SELECT id, attempt_id, connection_id, edge_id, action, status,
		       request_json, response_json, error_message,
		       target_record_id, target_thread_id, target_message_guid,
		       metadata_json, dispatched_at, confirmed_at, failed_at,
		       created_at, updated_at
		  FROM action_attempts
		 WHERE attempt_id = ?
	`, attemptID)
	var scanned struct {
		ID                int64
		AttemptID         string
		ConnectionID      string
		EdgeID            sql.NullString
		Action            string
		Status            string
		RequestJSON       sql.NullString
		ResponseJSON      sql.NullString
		ErrorMessage      sql.NullString
		TargetRecordID    sql.NullString
		TargetThreadID    sql.NullString
		TargetMessageGUID sql.NullString
		MetadataJSON      sql.NullString
		DispatchedAt      sql.NullInt64
		ConfirmedAt       sql.NullInt64
		FailedAt          sql.NullInt64
		CreatedAt         int64
		UpdatedAt         int64
	}
	if err := row.Scan(
		&scanned.ID,
		&scanned.AttemptID,
		&scanned.ConnectionID,
		&scanned.EdgeID,
		&scanned.Action,
		&scanned.Status,
		&scanned.RequestJSON,
		&scanned.ResponseJSON,
		&scanned.ErrorMessage,
		&scanned.TargetRecordID,
		&scanned.TargetThreadID,
		&scanned.TargetMessageGUID,
		&scanned.MetadataJSON,
		&scanned.DispatchedAt,
		&scanned.ConfirmedAt,
		&scanned.FailedAt,
		&scanned.CreatedAt,
		&scanned.UpdatedAt,
	); err != nil {
		if errorsIsNotFound(err) {
			return ActionAttemptRecord{}, fmt.Errorf("action attempt not found: %s", attemptID)
		}
		return ActionAttemptRecord{}, fmt.Errorf("query action attempt: %w", err)
	}
	return actionAttemptRowToRecord(scanned), nil
}

func ListActionAttempts(db *sql.DB, filter ActionAttemptQueryFilter) ([]ActionAttemptRecord, error) {
	conditions := make([]string, 0, 4)
	args := make([]any, 0, 4)
	if filter.AttemptID = normalizeNonEmptyString(filter.AttemptID); filter.AttemptID != "" {
		conditions = append(conditions, "attempt_id = ?")
		args = append(args, filter.AttemptID)
	}
	if filter.ConnectionID = normalizeNonEmptyString(filter.ConnectionID); filter.ConnectionID != "" {
		conditions = append(conditions, "connection_id = ?")
		args = append(args, filter.ConnectionID)
	}
	if filter.EdgeID = normalizeNonEmptyString(filter.EdgeID); filter.EdgeID != "" {
		conditions = append(conditions, "edge_id = ?")
		args = append(args, filter.EdgeID)
	}
	if filter.Action = normalizeNonEmptyString(filter.Action); filter.Action != "" {
		conditions = append(conditions, "action = ?")
		args = append(args, filter.Action)
	}
	if status := strings.TrimSpace(string(filter.Status)); status != "" {
		conditions = append(conditions, "status = ?")
		args = append(args, status)
	}
	limit := filter.Limit
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}
	args = append(args, limit, offset)

	query := `
		SELECT id, attempt_id, connection_id, edge_id, action, status,
		       request_json, response_json, error_message,
		       target_record_id, target_thread_id, target_message_guid,
		       metadata_json, dispatched_at, confirmed_at, failed_at,
		       created_at, updated_at
		  FROM action_attempts
	`
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("list action attempts: %w", err)
	}
	defer rows.Close()

	records := make([]ActionAttemptRecord, 0)
	for rows.Next() {
		var scanned struct {
			ID                int64
			AttemptID         string
			ConnectionID      string
			EdgeID            sql.NullString
			Action            string
			Status            string
			RequestJSON       sql.NullString
			ResponseJSON      sql.NullString
			ErrorMessage      sql.NullString
			TargetRecordID    sql.NullString
			TargetThreadID    sql.NullString
			TargetMessageGUID sql.NullString
			MetadataJSON      sql.NullString
			DispatchedAt      sql.NullInt64
			ConfirmedAt       sql.NullInt64
			FailedAt          sql.NullInt64
			CreatedAt         int64
			UpdatedAt         int64
		}
		if err := rows.Scan(
			&scanned.ID,
			&scanned.AttemptID,
			&scanned.ConnectionID,
			&scanned.EdgeID,
			&scanned.Action,
			&scanned.Status,
			&scanned.RequestJSON,
			&scanned.ResponseJSON,
			&scanned.ErrorMessage,
			&scanned.TargetRecordID,
			&scanned.TargetThreadID,
			&scanned.TargetMessageGUID,
			&scanned.MetadataJSON,
			&scanned.DispatchedAt,
			&scanned.ConfirmedAt,
			&scanned.FailedAt,
			&scanned.CreatedAt,
			&scanned.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan action attempt: %w", err)
		}
		records = append(records, actionAttemptRowToRecord(scanned))
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate action attempts: %w", err)
	}
	return records, nil
}

func ListPendingActionAttempts(db *sql.DB, connectionID string, limit int) ([]ActionAttemptRecord, error) {
	return ListActionAttempts(db, ActionAttemptQueryFilter{
		ConnectionID: connectionID,
		Status:       ActionAttemptStatusPending,
		Limit:        limit,
	})
}

func nullableString(value string) any {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return trimmed
}

func nullableText(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func nullableTimeMs(value *time.Time) any {
	if value == nil || value.IsZero() {
		return nil
	}
	v := value.UTC().UnixMilli()
	return v
}

func errorsIsNotFound(err error) bool {
	return err == sql.ErrNoRows
}
