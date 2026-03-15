package db

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
	"time"
)

// BenchmarkEventInsert measures event insertion throughput.
func BenchmarkEventInsert(b *testing.B) {
	dataDir := filepath.Join(b.TempDir(), "data")
	l, err := OpenLedgers(dataDir)
	if err != nil {
		b.Fatalf("OpenLedgers: %v", err)
	}
	defer l.Close()

	ctx := context.Background()
	now := time.Now().UnixMilli()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		id := fmt.Sprintf("evt-bench-%d", i)
		_, err := l.Events.ExecContext(ctx,
			`INSERT INTO events (id, adapter_id, platform, content, timestamp) VALUES (?, ?, ?, ?, ?)`,
			id, "bench-adapter", "test", "benchmark event content", now+int64(i))
		if err != nil {
			b.Fatalf("insert event: %v", err)
		}
	}
}

// BenchmarkEventInsertBatch measures batch event insertion throughput using transactions.
func BenchmarkEventInsertBatch(b *testing.B) {
	dataDir := filepath.Join(b.TempDir(), "data")
	l, err := OpenLedgers(dataDir)
	if err != nil {
		b.Fatalf("OpenLedgers: %v", err)
	}
	defer l.Close()

	ctx := context.Background()
	now := time.Now().UnixMilli()

	b.ResetTimer()
	tx, err := l.Events.BeginTx(ctx, nil)
	if err != nil {
		b.Fatalf("begin tx: %v", err)
	}
	stmt, err := tx.PrepareContext(ctx,
		`INSERT INTO events (id, adapter_id, platform, content, timestamp) VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		b.Fatalf("prepare: %v", err)
	}
	for i := 0; i < b.N; i++ {
		id := fmt.Sprintf("evt-batch-%d", i)
		if _, err := stmt.ExecContext(ctx, id, "bench", "test", "batch content", now+int64(i)); err != nil {
			b.Fatalf("insert: %v", err)
		}
	}
	stmt.Close()
	if err := tx.Commit(); err != nil {
		b.Fatalf("commit: %v", err)
	}
}

// BenchmarkMemoryRecall benchmarks FTS5 recall with pre-seeded elements.
func BenchmarkMemoryRecall(b *testing.B) {
	if !FTSEnabled() {
		b.Skip("FTS5 not enabled")
	}

	dataDir := filepath.Join(b.TempDir(), "data")
	l, err := OpenLedgers(dataDir)
	if err != nil {
		b.Fatalf("OpenLedgers: %v", err)
	}
	defer l.Close()

	ctx := context.Background()
	now := time.Now().UnixMilli()

	// Seed 1000 elements with varied content.
	topics := []string{
		"artificial intelligence and machine learning",
		"cloud computing and distributed systems",
		"web development with Go and TypeScript",
		"database optimization and indexing strategies",
		"security best practices and authentication",
		"DevOps continuous integration deployment",
		"mobile application development frameworks",
		"data science and statistical analysis",
		"network protocols and communication",
		"software architecture design patterns",
	}

	tx, err := l.Memory.BeginTx(ctx, nil)
	if err != nil {
		b.Fatalf("begin tx: %v", err)
	}
	stmt, err := tx.PrepareContext(ctx,
		`INSERT INTO elements (id, type, content, summary, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		b.Fatalf("prepare: %v", err)
	}
	for i := 0; i < 1000; i++ {
		id := fmt.Sprintf("elem-recall-%d", i)
		topic := topics[i%len(topics)]
		content := fmt.Sprintf("Element %d discusses %s with practical examples and real-world applications", i, topic)
		summary := fmt.Sprintf("Summary about %s", topic)
		if _, err := stmt.ExecContext(ctx, id, "fact", content, summary, "active", now, now); err != nil {
			b.Fatalf("seed element %d: %v", i, err)
		}
	}
	stmt.Close()
	if err := tx.Commit(); err != nil {
		b.Fatalf("commit seed: %v", err)
	}

	queries := []string{
		"machine learning artificial intelligence",
		"Go TypeScript web development",
		"database optimization",
		"security authentication",
		"cloud distributed systems",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		query := queries[i%len(queries)]
		rows, err := l.Memory.QueryContext(ctx,
			`SELECT e.id, e.content, e.summary
			 FROM elements e
			 WHERE e.rowid IN (SELECT rowid FROM elements_fts WHERE elements_fts MATCH ?)
			 LIMIT 10`,
			query)
		if err != nil {
			b.Fatalf("FTS query: %v", err)
		}
		count := 0
		for rows.Next() {
			var id, content, summary string
			if err := rows.Scan(&id, &content, &summary); err != nil {
				b.Fatalf("scan: %v", err)
			}
			count++
		}
		rows.Close()
		if count == 0 {
			b.Fatalf("FTS query %q returned 0 results", query)
		}
	}
}

// BenchmarkPipelineRequestInsert measures pipeline request insertion throughput.
func BenchmarkPipelineRequestInsert(b *testing.B) {
	dataDir := filepath.Join(b.TempDir(), "data")
	l, err := OpenLedgers(dataDir)
	if err != nil {
		b.Fatalf("OpenLedgers: %v", err)
	}
	defer l.Close()

	ctx := context.Background()
	now := time.Now().UnixMilli()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		err := l.InsertPipelineRequest(ctx, PipelineRequestRow{
			ID:         fmt.Sprintf("pr-bench-%d", i),
			Operation:  "event.ingest",
			Status:     "completed",
			SenderID:   "user-1",
			AdapterID:  "discord",
			Payload:    `{"content":"hello"}`,
			Result:     `{"processed":true}`,
			Stages:     `[]`,
			DurationMS: 5,
			CreatedAt:  now + int64(i),
		})
		if err != nil {
			b.Fatalf("insert pipeline request: %v", err)
		}
	}
}

// BenchmarkOpenLedgers measures the cost of opening all 7 databases.
func BenchmarkOpenLedgers(b *testing.B) {
	for i := 0; i < b.N; i++ {
		dataDir := filepath.Join(b.TempDir(), "data")
		l, err := OpenLedgers(dataDir)
		if err != nil {
			b.Fatalf("OpenLedgers: %v", err)
		}
		l.Close()
	}
}
