package broker

import (
	"database/sql"
	"encoding/json"
	"strings"
	"time"
)

func nowUnixMilli() int64 {
	return time.Now().UTC().UnixMilli()
}

func fromUnixMilli(v int64) time.Time {
	if v <= 0 {
		return time.Time{}
	}
	return time.UnixMilli(v).UTC()
}

func fromNullUnixMilli(v sql.NullInt64) *time.Time {
	if !v.Valid || v.Int64 <= 0 {
		return nil
	}
	t := time.UnixMilli(v.Int64).UTC()
	return &t
}

func asJSONString(raw string) string {
	raw = trimSpace(raw)
	if raw == "" {
		return "{}"
	}
	return raw
}

func asJSONArrayString(raw string) string {
	raw = trimSpace(raw)
	if raw == "" {
		return "[]"
	}
	return raw
}

func trimSpace(v string) string {
	return strings.TrimSpace(v)
}

func boolToSQLite(v bool) int {
	if v {
		return 1
	}
	return 0
}

func sqliteToBool(v int64) bool {
	return v != 0
}

func mustJSON(v any, fallback string) string {
	b, err := json.Marshal(v)
	if err != nil {
		return fallback
	}
	return string(b)
}
