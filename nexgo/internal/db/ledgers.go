// Package db manages the seven Nexus SQLite ledger databases.
package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "github.com/mattn/go-sqlite3" // SQLite driver
)

// Ledgers holds connections to all Nexus SQLite databases.
type Ledgers struct {
	Events     *sql.DB
	Agents     *sql.DB
	Identity   *sql.DB
	Memory     *sql.DB
	Embeddings *sql.DB
	Runtime    *sql.DB
	Work       *sql.DB
}

// dbEntry pairs a name with a pointer to the corresponding Ledgers field.
type dbEntry struct {
	name string
	db   **sql.DB
}

// entries returns a slice of all ledger database name/pointer pairs.
func (l *Ledgers) entries() []dbEntry {
	return []dbEntry{
		{"events", &l.Events},
		{"agents", &l.Agents},
		{"identity", &l.Identity},
		{"memory", &l.Memory},
		{"embeddings", &l.Embeddings},
		{"runtime", &l.Runtime},
		{"work", &l.Work},
	}
}

// OpenLedgers opens all 7 SQLite databases in dataDir and bootstraps their schemas.
// Each database file is created if it does not exist. WAL mode, busy_timeout=5000,
// and foreign_keys=ON are set on every connection.
func OpenLedgers(dataDir string) (*Ledgers, error) {
	l := &Ledgers{}

	for _, e := range l.entries() {
		dbPath := filepath.Join(dataDir, e.name+".db")
		db, err := openDB(dbPath)
		if err != nil {
			// Close any databases that were already opened.
			l.Close()
			return nil, fmt.Errorf("open %s: %w", e.name, err)
		}
		*e.db = db

		schema, ok := ledgerSchemas[e.name]
		if !ok {
			l.Close()
			return nil, fmt.Errorf("no schema found for %s", e.name)
		}
		if err := bootstrap(db, schema); err != nil {
			l.Close()
			return nil, fmt.Errorf("bootstrap %s: %w", e.name, err)
		}

		// Apply FTS5 schema if the fts5 build tag is active.
		if ftsEnabled {
			if fts, ok := ftsSchemas[e.name]; ok {
				if err := bootstrap(db, fts); err != nil {
					l.Close()
					return nil, fmt.Errorf("bootstrap %s fts: %w", e.name, err)
				}
			}
		}
	}

	return l, nil
}

// openDB opens a single SQLite database file with standard pragmas.
// It creates the parent directory if needed.
func openDB(path string) (*sql.DB, error) {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("mkdir %s: %w", dir, err)
	}

	dsn := path + "?_journal_mode=WAL&_busy_timeout=5000&_foreign_keys=ON"
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, err
	}

	// Verify the connection is alive.
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}

	return db, nil
}

// bootstrap executes the DDL statements for a single database.
func bootstrap(db *sql.DB, ddl string) error {
	_, err := db.Exec(ddl)
	return err
}

// Close closes all open database connections. It collects errors from each
// close call and returns them joined.
func (l *Ledgers) Close() error {
	var errs []string
	for _, e := range l.entries() {
		if *e.db != nil {
			if err := (*e.db).Close(); err != nil {
				errs = append(errs, fmt.Sprintf("%s: %v", e.name, err))
			}
			*e.db = nil
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("close ledgers: %s", strings.Join(errs, "; "))
	}
	return nil
}

// HealthCheck pings each database and returns a map of name -> status.
// Status is "ok" if the ping succeeds, or the error string otherwise.
func (l *Ledgers) HealthCheck() map[string]string {
	result := make(map[string]string, 7)
	for _, e := range l.entries() {
		if *e.db == nil {
			result[e.name] = "closed"
			continue
		}
		if err := (*e.db).Ping(); err != nil {
			result[e.name] = err.Error()
		} else {
			result[e.name] = "ok"
		}
	}
	return result
}
