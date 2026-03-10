package codeintel

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Napageneral/spike/internal/ignore"
	"github.com/Napageneral/spike/internal/tokenizer"
)

const currentIndexVersion = 1

type Service struct {
	db        *sql.DB
	tokenizer tokenizer.Tokenizer
}

func New(db *sql.DB) (*Service, error) {
	tok, err := tokenizer.NewAnthropicTokenizer()
	if err != nil {
		return nil, err
	}
	return &Service{db: db, tokenizer: tok}, nil
}

func (s *Service) Build(ctx context.Context, req BuildRequest) (*BuildResult, error) {
	rootPath, err := filepath.Abs(strings.TrimSpace(req.RootPath))
	if err != nil {
		return nil, fmt.Errorf("abs root path: %w", err)
	}
	if rootPath == "" {
		return nil, fmt.Errorf("root_path is required")
	}
	info, err := os.Stat(rootPath)
	if err != nil {
		return nil, fmt.Errorf("stat root path: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("root_path must be a directory")
	}

	repoID, commitSHA := inspectGit(rootPath)
	snapshotID := strings.TrimSpace(req.SnapshotID)
	if snapshotID == "" {
		snapshotID = deriveSnapshotID(rootPath, repoID, commitSHA)
	}

	now := time.Now().Unix()
	if err := s.upsertSnapshot(ctx, Snapshot{
		SnapshotID:   snapshotID,
		RepoID:       repoID,
		CommitSHA:    commitSHA,
		RootPath:     rootPath,
		Status:       "building",
		IndexVersion: currentIndexVersion,
		CreatedAt:    now,
		UpdatedAt:    now,
	}); err != nil {
		return nil, err
	}
	if err := s.clearSnapshotData(ctx, snapshotID); err != nil {
		_ = s.markSnapshotError(ctx, snapshotID, rootPath, repoID, commitSHA, err)
		return nil, err
	}

	spec, _ := ignore.LoadSpec(rootPath)
	languageCounts := map[string]int{}
	capabilities := map[string]map[string]CapabilityRecord{}

	var analyzed []analyzedSnapshotFile

	err = filepath.WalkDir(rootPath, func(abs string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if d.IsDir() {
			switch d.Name() {
			case ".git", ".intent":
				return filepath.SkipDir
			}
			if spec != nil && spec.MatchPath(abs, true) {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			return nil
		}
		if spec != nil && spec.MatchPath(abs, false) {
			return nil
		}
		if info, err := d.Info(); err == nil && !info.Mode().IsRegular() {
			return nil
		}

		rel, err := filepath.Rel(rootPath, abs)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		if rel == "." || rel == "" {
			return nil
		}

		data, err := os.ReadFile(abs)
		if err != nil {
			return nil
		}

		class := classifyFile(rel, data)
		tokens := 0
		if class.TextLike {
			tokens = s.tokenizer.Count(string(data))
		}

		fileRec := FileRecord{
			SnapshotID:     snapshotID,
			FilePath:       rel,
			Language:       class.Language,
			Classification: class.Classification,
			SizeBytes:      int64(len(data)),
			Tokens:         tokens,
			Hash:           hashBytes(data),
			ParseStatus:    "skipped",
		}

		var chunks []ChunkRecord
		var symbols []SymbolRecord
		var imports []ImportRecord
		var refs []ReferenceRecord
		var calls []CallRecord
		if class.ParseEligible {
			chunks, symbols, imports, refs, calls = analyzeSource(snapshotID, rel, class.Language, string(data))
			if len(chunks) > 0 {
				fileRec.ParseStatus = "parsed"
			} else {
				fileRec.ParseStatus = "partial"
			}
			fileRec.ChunkCount = len(chunks)
			fileRec.SymbolCount = len(symbols)
			languageCounts[class.Language]++
			for capability, record := range defaultCapabilities(snapshotID, class.Language) {
				if _, ok := capabilities[class.Language]; !ok {
					capabilities[class.Language] = map[string]CapabilityRecord{}
				}
				capabilities[class.Language][capability] = record
			}
		}

		analyzed = append(analyzed, analyzedSnapshotFile{
			file:    fileRec,
			chunks:  chunks,
			symbols: symbols,
			imports: imports,
			refs:    refs,
			calls:   calls,
		})
		return nil
	})
	if err != nil {
		_ = s.markSnapshotError(ctx, snapshotID, rootPath, repoID, commitSHA, err)
		return nil, err
	}

	sort.Slice(analyzed, func(i, j int) bool {
		return analyzed[i].file.FilePath < analyzed[j].file.FilePath
	})
	symbolIndex := buildSymbolNameIndex(analyzed)
	for i := range analyzed {
		analyzed[i].refs = resolveReferenceSymbols(analyzed[i].refs, symbolIndex)
		analyzed[i].calls = resolveCallSymbols(analyzed[i].calls, symbolIndex)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	totalChunks := 0
	totalSymbols := 0
	for _, item := range analyzed {
		if err := insertFile(ctx, tx, item.file); err != nil {
			return nil, err
		}
		for _, chunk := range item.chunks {
			if err := insertChunk(ctx, tx, chunk); err != nil {
				return nil, err
			}
			totalChunks++
		}
		for _, symbol := range item.symbols {
			if err := insertSymbol(ctx, tx, symbol); err != nil {
				return nil, err
			}
			totalSymbols++
		}
		for _, imp := range item.imports {
			if err := insertImport(ctx, tx, imp); err != nil {
				return nil, err
			}
		}
		for _, ref := range item.refs {
			if err := insertReference(ctx, tx, ref); err != nil {
				return nil, err
			}
		}
		for _, call := range item.calls {
			if err := insertCall(ctx, tx, call); err != nil {
				return nil, err
			}
		}
	}
	var capabilityRows []CapabilityRecord
	for _, byCap := range capabilities {
		keys := make([]string, 0, len(byCap))
		for capability := range byCap {
			keys = append(keys, capability)
		}
		sort.Strings(keys)
		for _, capability := range keys {
			row := byCap[capability]
			if err := insertCapability(ctx, tx, row); err != nil {
				return nil, err
			}
			capabilityRows = append(capabilityRows, row)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	snapshot := Snapshot{
		SnapshotID:   snapshotID,
		RepoID:       repoID,
		CommitSHA:    commitSHA,
		RootPath:     rootPath,
		Status:       "ready",
		IndexVersion: currentIndexVersion,
		FileCount:    len(analyzed),
		ChunkCount:   totalChunks,
		SymbolCount:  totalSymbols,
		CreatedAt:    now,
		UpdatedAt:    time.Now().Unix(),
	}
	if err := s.upsertSnapshot(ctx, snapshot); err != nil {
		return nil, err
	}

	built, err := s.GetSnapshot(ctx, snapshotID)
	if err != nil {
		return nil, err
	}
	return &BuildResult{
		Snapshot:     *built,
		Languages:    languageCounts,
		Capabilities: capabilityRows,
	}, nil
}

func (s *Service) ListSnapshots(ctx context.Context) ([]Snapshot, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT snapshot_id, repo_id, commit_sha, root_path, status, index_version, file_count, chunk_count, symbol_count, last_error, created_at, updated_at
		FROM code_snapshots ORDER BY updated_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Snapshot
	for rows.Next() {
		var row Snapshot
		if err := rows.Scan(&row.SnapshotID, &row.RepoID, &row.CommitSHA, &row.RootPath, &row.Status, &row.IndexVersion, &row.FileCount, &row.ChunkCount, &row.SymbolCount, &row.LastError, &row.CreatedAt, &row.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Service) GetSnapshot(ctx context.Context, snapshotID string) (*Snapshot, error) {
	var row Snapshot
	err := s.db.QueryRowContext(ctx, `
		SELECT snapshot_id, repo_id, commit_sha, root_path, status, index_version, file_count, chunk_count, symbol_count, last_error, created_at, updated_at
		FROM code_snapshots WHERE snapshot_id = ?
	`, snapshotID).Scan(&row.SnapshotID, &row.RepoID, &row.CommitSHA, &row.RootPath, &row.Status, &row.IndexVersion, &row.FileCount, &row.ChunkCount, &row.SymbolCount, &row.LastError, &row.CreatedAt, &row.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("code snapshot not found: %s", snapshotID)
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *Service) GetCapabilities(ctx context.Context, snapshotID string) ([]CapabilityRecord, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT snapshot_id, language, capability, status, backend, details_json
		FROM code_capabilities
		WHERE snapshot_id = ?
		ORDER BY language ASC, capability ASC
	`, snapshotID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CapabilityRecord
	for rows.Next() {
		var row CapabilityRecord
		if err := rows.Scan(&row.SnapshotID, &row.Language, &row.Capability, &row.Status, &row.Backend, &row.DetailsJSON); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Service) GetCapability(ctx context.Context, snapshotID string, language string, capability string) (*CapabilityRecord, error) {
	var row CapabilityRecord
	err := s.db.QueryRowContext(ctx, `
		SELECT snapshot_id, language, capability, status, backend, details_json
		FROM code_capabilities
		WHERE snapshot_id = ? AND language = ? AND capability = ?
	`, snapshotID, strings.TrimSpace(language), strings.TrimSpace(capability)).Scan(
		&row.SnapshotID,
		&row.Language,
		&row.Capability,
		&row.Status,
		&row.Backend,
		&row.DetailsJSON,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *Service) GetFile(ctx context.Context, snapshotID string, filePath string, includeSource bool) (*FileView, error) {
	snapshot, err := s.GetSnapshot(ctx, snapshotID)
	if err != nil {
		return nil, err
	}
	var row FileView
	row.RootPath = snapshot.RootPath
	err = s.db.QueryRowContext(ctx, `
		SELECT snapshot_id, file_path, language, classification, size_bytes, tokens, hash, parse_status, chunk_count, symbol_count
		FROM code_files
		WHERE snapshot_id = ? AND file_path = ?
	`, snapshotID, filepath.ToSlash(strings.TrimSpace(filePath))).Scan(
		&row.SnapshotID, &row.FilePath, &row.Language, &row.Classification, &row.SizeBytes, &row.Tokens, &row.Hash, &row.ParseStatus, &row.ChunkCount, &row.SymbolCount,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("file not found in snapshot: %s", filePath)
	}
	if err != nil {
		return nil, err
	}
	if includeSource && row.Classification != "binary" {
		b, err := os.ReadFile(filepath.Join(snapshot.RootPath, filepath.FromSlash(row.FilePath)))
		if err == nil && utf8.Valid(b) {
			row.Source = string(b)
		}
	}
	return &row, nil
}

func (s *Service) GetChunk(ctx context.Context, snapshotID string, chunkID string, filePath string, line int) (*ChunkRecord, error) {
	chunkID = strings.TrimSpace(chunkID)
	filePath = filepath.ToSlash(strings.TrimSpace(filePath))
	var row ChunkRecord
	switch {
	case chunkID != "":
		err := s.db.QueryRowContext(ctx, `
			SELECT snapshot_id, chunk_id, file_path, language, kind, name, start_line, end_line, content, context_json
			FROM code_chunks WHERE snapshot_id = ? AND chunk_id = ?
		`, snapshotID, chunkID).Scan(&row.SnapshotID, &row.ChunkID, &row.FilePath, &row.Language, &row.Kind, &row.Name, &row.StartLine, &row.EndLine, &row.Content, &row.ContextJSON)
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("chunk not found: %s", chunkID)
		}
		if err != nil {
			return nil, err
		}
		return &row, nil
	case filePath != "" && line > 0:
		err := s.db.QueryRowContext(ctx, `
			SELECT snapshot_id, chunk_id, file_path, language, kind, name, start_line, end_line, content, context_json
			FROM code_chunks
			WHERE snapshot_id = ? AND file_path = ? AND start_line <= ? AND end_line >= ?
			ORDER BY start_line ASC LIMIT 1
		`, snapshotID, filePath, line, line).Scan(&row.SnapshotID, &row.ChunkID, &row.FilePath, &row.Language, &row.Kind, &row.Name, &row.StartLine, &row.EndLine, &row.Content, &row.ContextJSON)
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("chunk not found for file/line")
		}
		if err != nil {
			return nil, err
		}
		return &row, nil
	case filePath != "":
		err := s.db.QueryRowContext(ctx, `
			SELECT snapshot_id, chunk_id, file_path, language, kind, name, start_line, end_line, content, context_json
			FROM code_chunks
			WHERE snapshot_id = ? AND file_path = ?
			ORDER BY start_line ASC LIMIT 1
		`, snapshotID, filePath).Scan(&row.SnapshotID, &row.ChunkID, &row.FilePath, &row.Language, &row.Kind, &row.Name, &row.StartLine, &row.EndLine, &row.Content, &row.ContextJSON)
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("chunk not found for file")
		}
		if err != nil {
			return nil, err
		}
		return &row, nil
	default:
		return nil, fmt.Errorf("chunk_id or file_path is required")
	}
}

func (s *Service) GetContext(ctx context.Context, snapshotID string, chunkID string, filePath string, line int) (*ChunkContext, error) {
	anchor, err := s.GetChunk(ctx, snapshotID, chunkID, filePath, line)
	if err != nil {
		return nil, err
	}
	ctxResult := &ChunkContext{Anchor: *anchor}
	var prev ChunkRecord
	err = s.db.QueryRowContext(ctx, `
		SELECT snapshot_id, chunk_id, file_path, language, kind, name, start_line, end_line, content, context_json
		FROM code_chunks
		WHERE snapshot_id = ? AND file_path = ? AND end_line < ?
		ORDER BY end_line DESC LIMIT 1
	`, snapshotID, anchor.FilePath, anchor.StartLine).Scan(&prev.SnapshotID, &prev.ChunkID, &prev.FilePath, &prev.Language, &prev.Kind, &prev.Name, &prev.StartLine, &prev.EndLine, &prev.Content, &prev.ContextJSON)
	if err == nil {
		ctxResult.Previous = &prev
	} else if err != sql.ErrNoRows {
		return nil, err
	}
	var next ChunkRecord
	err = s.db.QueryRowContext(ctx, `
		SELECT snapshot_id, chunk_id, file_path, language, kind, name, start_line, end_line, content, context_json
		FROM code_chunks
		WHERE snapshot_id = ? AND file_path = ? AND start_line > ?
		ORDER BY start_line ASC LIMIT 1
	`, snapshotID, anchor.FilePath, anchor.EndLine).Scan(&next.SnapshotID, &next.ChunkID, &next.FilePath, &next.Language, &next.Kind, &next.Name, &next.StartLine, &next.EndLine, &next.Content, &next.ContextJSON)
	if err == nil {
		ctxResult.Next = &next
	} else if err != sql.ErrNoRows {
		return nil, err
	}
	return ctxResult, nil
}

func (s *Service) SearchSemantic(ctx context.Context, snapshotID string, query string, limit int) (*SearchResult, error) {
	if limit <= 0 {
		limit = 10
	}
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("query is required")
	}
	ftsQuery := buildFTSQuery(query)
	rows, err := s.db.QueryContext(ctx, `
		SELECT c.chunk_id, c.file_path, c.language, f.classification, c.kind, c.name, c.start_line, c.end_line, bm25(code_chunks_fts) AS score, substr(c.content, 1, 500)
		FROM code_chunks_fts
		JOIN code_chunks c ON c.rowid = code_chunks_fts.rowid
		JOIN code_files f ON f.snapshot_id = c.snapshot_id AND f.file_path = c.file_path
		WHERE c.snapshot_id = ? AND code_chunks_fts MATCH ?
		ORDER BY CASE f.classification
			WHEN 'source' THEN 0
			WHEN 'text' THEN 1
			WHEN 'generated' THEN 2
			WHEN 'vendor' THEN 3
			ELSE 4
		END ASC, bm25(code_chunks_fts) ASC
		LIMIT ?
	`, snapshotID, ftsQuery, limit)
	if err != nil {
		return s.searchFallback(ctx, snapshotID, query, limit)
	}
	defer rows.Close()
	var hits []SearchHit
	for rows.Next() {
		var hit SearchHit
		if err := rows.Scan(&hit.ChunkID, &hit.FilePath, &hit.Language, &hit.Classification, &hit.Kind, &hit.Name, &hit.StartLine, &hit.EndLine, &hit.Score, &hit.Snippet); err != nil {
			return nil, err
		}
		hits = append(hits, hit)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return &SearchResult{Query: query, Hits: hits}, nil
}

func (s *Service) searchFallback(ctx context.Context, snapshotID string, query string, limit int) (*SearchResult, error) {
	pattern := "%" + strings.ToLower(query) + "%"
	rows, err := s.db.QueryContext(ctx, `
		SELECT c.chunk_id, c.file_path, c.language, f.classification, c.kind, c.name, c.start_line, c.end_line, 0.0 AS score, substr(c.content, 1, 500)
		FROM code_chunks c
		JOIN code_files f ON f.snapshot_id = c.snapshot_id AND f.file_path = c.file_path
		WHERE c.snapshot_id = ? AND (lower(c.content) LIKE ? OR lower(c.name) LIKE ? OR lower(c.file_path) LIKE ?)
		ORDER BY CASE f.classification
			WHEN 'source' THEN 0
			WHEN 'text' THEN 1
			WHEN 'generated' THEN 2
			WHEN 'vendor' THEN 3
			ELSE 4
		END ASC, c.file_path ASC, c.start_line ASC
		LIMIT ?
	`, snapshotID, pattern, pattern, pattern, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var hits []SearchHit
	for rows.Next() {
		var hit SearchHit
		if err := rows.Scan(&hit.ChunkID, &hit.FilePath, &hit.Language, &hit.Classification, &hit.Kind, &hit.Name, &hit.StartLine, &hit.EndLine, &hit.Score, &hit.Snippet); err != nil {
			return nil, err
		}
		hits = append(hits, hit)
	}
	return &SearchResult{Query: query, Hits: hits}, rows.Err()
}

func (s *Service) ResolveSymbol(ctx context.Context, snapshotID string, query string, language string, limit int) ([]SymbolRecord, error) {
	if limit <= 0 {
		limit = 10
	}
	query = strings.TrimSpace(query)
	language = strings.TrimSpace(language)
	if query == "" {
		return nil, fmt.Errorf("symbol query is required")
	}
	where := []string{"snapshot_id = ?"}
	args := []interface{}{snapshotID}
	if language != "" {
		where = append(where, "language = ?")
		args = append(args, language)
	}
	likeQuery := "%" + query + "%"
	args = append(args, query, query, likeQuery, query, query, limit)
	rows, err := s.db.QueryContext(ctx, `
		SELECT snapshot_id, symbol_id, name, qualified_name, kind, language, file_path, start_line, end_line, chunk_id
		FROM code_symbols
		WHERE `+strings.Join(where, " AND ")+`
		  AND (name = ? OR qualified_name = ? OR name LIKE ?)
		ORDER BY CASE
			WHEN name = ? THEN 0
			WHEN qualified_name = ? THEN 1
			ELSE 2
		END, file_path ASC, start_line ASC
		LIMIT ?
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SymbolRecord
	for rows.Next() {
		var row SymbolRecord
		if err := rows.Scan(&row.SnapshotID, &row.SymbolID, &row.Name, &row.QualifiedName, &row.Kind, &row.Language, &row.FilePath, &row.StartLine, &row.EndLine, &row.ChunkID); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Service) GetImports(ctx context.Context, snapshotID string, filePath string) ([]ImportRecord, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT snapshot_id, file_path, language, import_path, import_kind
		FROM code_imports
		WHERE snapshot_id = ? AND file_path = ?
		ORDER BY import_path ASC
	`, snapshotID, filepath.ToSlash(strings.TrimSpace(filePath)))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ImportRecord
	for rows.Next() {
		var row ImportRecord
		if err := rows.Scan(&row.SnapshotID, &row.FilePath, &row.Language, &row.ImportPath, &row.ImportKind); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Service) GetImporters(ctx context.Context, snapshotID string, importPath string) ([]ImportRecord, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT snapshot_id, file_path, language, import_path, import_kind
		FROM code_imports
		WHERE snapshot_id = ? AND import_path = ?
		ORDER BY file_path ASC
	`, snapshotID, strings.TrimSpace(importPath))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ImportRecord
	for rows.Next() {
		var row ImportRecord
		if err := rows.Scan(&row.SnapshotID, &row.FilePath, &row.Language, &row.ImportPath, &row.ImportKind); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Service) upsertSnapshot(ctx context.Context, snapshot Snapshot) error {
	now := time.Now().Unix()
	if snapshot.CreatedAt == 0 {
		snapshot.CreatedAt = now
	}
	snapshot.UpdatedAt = now
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO code_snapshots (snapshot_id, repo_id, commit_sha, root_path, status, index_version, file_count, chunk_count, symbol_count, last_error, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(snapshot_id) DO UPDATE SET
			repo_id=excluded.repo_id,
			commit_sha=excluded.commit_sha,
			root_path=excluded.root_path,
			status=excluded.status,
			index_version=excluded.index_version,
			file_count=excluded.file_count,
			chunk_count=excluded.chunk_count,
			symbol_count=excluded.symbol_count,
			last_error=excluded.last_error,
			updated_at=excluded.updated_at
	`, snapshot.SnapshotID, snapshot.RepoID, snapshot.CommitSHA, snapshot.RootPath, snapshot.Status, snapshot.IndexVersion, snapshot.FileCount, snapshot.ChunkCount, snapshot.SymbolCount, snapshot.LastError, snapshot.CreatedAt, snapshot.UpdatedAt)
	return err
}

func (s *Service) markSnapshotError(ctx context.Context, snapshotID string, rootPath string, repoID string, commitSHA string, buildErr error) error {
	return s.upsertSnapshot(ctx, Snapshot{
		SnapshotID:   snapshotID,
		RepoID:       repoID,
		CommitSHA:    commitSHA,
		RootPath:     rootPath,
		Status:       "error",
		IndexVersion: currentIndexVersion,
		LastError:    buildErr.Error(),
	})
}

func (s *Service) clearSnapshotData(ctx context.Context, snapshotID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, stmt := range []string{
		`DELETE FROM code_capabilities WHERE snapshot_id = ?`,
		`DELETE FROM code_calls WHERE snapshot_id = ?`,
		`DELETE FROM code_references WHERE snapshot_id = ?`,
		`DELETE FROM code_imports WHERE snapshot_id = ?`,
		`DELETE FROM code_symbols WHERE snapshot_id = ?`,
		`DELETE FROM code_chunks WHERE snapshot_id = ?`,
		`DELETE FROM code_files WHERE snapshot_id = ?`,
	} {
		if _, err := tx.ExecContext(ctx, stmt, snapshotID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func insertFile(ctx context.Context, tx *sql.Tx, row FileRecord) error {
	_, err := tx.ExecContext(ctx, `
		INSERT INTO code_files (snapshot_id, file_path, language, classification, size_bytes, tokens, hash, parse_status, chunk_count, symbol_count)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, row.SnapshotID, row.FilePath, row.Language, row.Classification, row.SizeBytes, row.Tokens, row.Hash, row.ParseStatus, row.ChunkCount, row.SymbolCount)
	return err
}

func insertChunk(ctx context.Context, tx *sql.Tx, row ChunkRecord) error {
	_, err := tx.ExecContext(ctx, `
		INSERT INTO code_chunks (snapshot_id, chunk_id, file_path, language, kind, name, start_line, end_line, content, context_json)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, row.SnapshotID, row.ChunkID, row.FilePath, row.Language, row.Kind, row.Name, row.StartLine, row.EndLine, row.Content, row.ContextJSON)
	return err
}

func insertSymbol(ctx context.Context, tx *sql.Tx, row SymbolRecord) error {
	_, err := tx.ExecContext(ctx, `
		INSERT INTO code_symbols (snapshot_id, symbol_id, name, qualified_name, kind, language, file_path, start_line, end_line, chunk_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, row.SnapshotID, row.SymbolID, row.Name, row.QualifiedName, row.Kind, row.Language, row.FilePath, row.StartLine, row.EndLine, row.ChunkID)
	return err
}

func insertImport(ctx context.Context, tx *sql.Tx, row ImportRecord) error {
	_, err := tx.ExecContext(ctx, `
		INSERT OR IGNORE INTO code_imports (snapshot_id, file_path, language, import_path, import_kind)
		VALUES (?, ?, ?, ?, ?)
	`, row.SnapshotID, row.FilePath, row.Language, row.ImportPath, row.ImportKind)
	return err
}

func insertCapability(ctx context.Context, tx *sql.Tx, row CapabilityRecord) error {
	_, err := tx.ExecContext(ctx, `
		INSERT INTO code_capabilities (snapshot_id, language, capability, status, backend, details_json)
		VALUES (?, ?, ?, ?, ?, ?)
	`, row.SnapshotID, row.Language, row.Capability, row.Status, row.Backend, row.DetailsJSON)
	return err
}

func insertReference(ctx context.Context, tx *sql.Tx, row ReferenceRecord) error {
	_, err := tx.ExecContext(ctx, `
		INSERT OR IGNORE INTO code_references (snapshot_id, symbol_name, language, file_path, chunk_id, start_line, end_line, reference_kind, symbol_id, qualified_name)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, row.SnapshotID, row.SymbolName, row.Language, row.FilePath, row.ChunkID, row.StartLine, row.EndLine, row.ReferenceKind, row.SymbolID, row.QualifiedName)
	return err
}

func insertCall(ctx context.Context, tx *sql.Tx, row CallRecord) error {
	_, err := tx.ExecContext(ctx, `
		INSERT OR IGNORE INTO code_calls (snapshot_id, language, caller_symbol_id, caller_name, caller_qualified_name, caller_file_path, caller_chunk_id, callee_symbol_id, callee_name, callee_qualified_name, line, call_kind)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, row.SnapshotID, row.Language, row.CallerSymbolID, row.CallerName, row.CallerQualifiedName, row.CallerFilePath, row.CallerChunkID, row.CalleeSymbolID, row.CalleeName, row.CalleeQualifiedName, row.Line, row.CallKind)
	return err
}

type fileClass struct {
	Language       string
	Classification string
	TextLike       bool
	ParseEligible  bool
}

func classifyFile(rel string, data []byte) fileClass {
	path := strings.ToLower(filepath.ToSlash(rel))
	if !utf8.Valid(data) || bytesLikelyBinary(data) {
		return fileClass{Classification: "binary"}
	}
	switch {
	case strings.Contains(path, "/node_modules/"), strings.Contains(path, "/vendor/"), strings.Contains(path, "/dist/"), strings.Contains(path, "/build/"), strings.Contains(path, "/coverage/"):
		return fileClass{Classification: "vendor", TextLike: true}
	case strings.Contains(path, ".min."), strings.Contains(path, ".generated."), strings.Contains(path, "_generated."), strings.HasSuffix(path, ".pb.go"), strings.HasSuffix(path, ".min.js"):
		return fileClass{Classification: "generated", TextLike: true}
	case strings.Contains(string(data[:min(len(data), 256)]), "Code generated"):
		return fileClass{Classification: "generated", TextLike: true}
	}
	switch ext := strings.ToLower(filepath.Ext(path)); ext {
	case ".go":
		return fileClass{Language: "go", Classification: "source", TextLike: true, ParseEligible: true}
	case ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs":
		return fileClass{Language: "typescript", Classification: "source", TextLike: true, ParseEligible: true}
	case ".py":
		return fileClass{Language: "python", Classification: "source", TextLike: true, ParseEligible: true}
	case ".c", ".h":
		return fileClass{Language: "c", Classification: "source", TextLike: true, ParseEligible: true}
	default:
		return fileClass{Classification: "text", TextLike: true}
	}
}

func bytesLikelyBinary(data []byte) bool {
	if len(data) == 0 {
		return false
	}
	sample := data
	if len(sample) > 4096 {
		sample = sample[:4096]
	}
	nonPrintable := 0
	for _, b := range sample {
		if b == 0 {
			return true
		}
		if b < 9 || (b > 13 && b < 32) {
			nonPrintable++
		}
	}
	return float64(nonPrintable)/float64(len(sample)) > 0.1
}

func defaultCapabilities(snapshotID string, language string) map[string]CapabilityRecord {
	backend := map[string]string{
		"go":         "go/ast",
		"typescript": "typescript/top-level",
		"python":     "python/top-level",
		"c":          "c/top-level",
	}[language]
	if backend == "" {
		backend = "unknown"
	}
	statusForSymbol := "partial"
	if language == "go" {
		statusForSymbol = "complete"
	}
	statusForContext := "complete"
	return map[string]CapabilityRecord{
		"source.file":       {SnapshotID: snapshotID, Language: language, Capability: "source.file", Status: "complete", Backend: "inventory", DetailsJSON: `{}`},
		"source.chunk":      {SnapshotID: snapshotID, Language: language, Capability: "source.chunk", Status: "complete", Backend: backend, DetailsJSON: `{}`},
		"source.context":    {SnapshotID: snapshotID, Language: language, Capability: "source.context", Status: statusForContext, Backend: backend, DetailsJSON: `{}`},
		"search.semantic":   {SnapshotID: snapshotID, Language: language, Capability: "search.semantic", Status: "complete", Backend: "sqlite-fts5", DetailsJSON: `{}`},
		"symbol.resolve":    {SnapshotID: snapshotID, Language: language, Capability: "symbol.resolve", Status: statusForSymbol, Backend: backend, DetailsJSON: `{}`},
		"graph.imports":     {SnapshotID: snapshotID, Language: language, Capability: "graph.imports", Status: "complete", Backend: backend, DetailsJSON: `{}`},
		"graph.importers":   {SnapshotID: snapshotID, Language: language, Capability: "graph.importers", Status: "complete", Backend: backend, DetailsJSON: `{}`},
		"symbol.references": {SnapshotID: snapshotID, Language: language, Capability: "symbol.references", Status: "partial", Backend: backend, DetailsJSON: `{"reason":"best-effort lexical references"}`},
		"graph.callers":     {SnapshotID: snapshotID, Language: language, Capability: "graph.callers", Status: "partial", Backend: backend, DetailsJSON: `{"reason":"best-effort lexical call edges"}`},
		"graph.callees":     {SnapshotID: snapshotID, Language: language, Capability: "graph.callees", Status: "partial", Backend: backend, DetailsJSON: `{"reason":"best-effort lexical call edges"}`},
		"context.pack":      {SnapshotID: snapshotID, Language: language, Capability: "context.pack", Status: "partial", Backend: backend, DetailsJSON: `{"reason":"assembled from chunks, relations, and search hits"}`},
		"tests.impact":      {SnapshotID: snapshotID, Language: language, Capability: "tests.impact", Status: "partial", Backend: "heuristic-test-impact", DetailsJSON: `{"reason":"heuristic test matching from paths and content"}`},
	}
}

func analyzeSource(snapshotID string, rel string, language string, src string) ([]ChunkRecord, []SymbolRecord, []ImportRecord, []ReferenceRecord, []CallRecord) {
	switch language {
	case "go":
		return analyzeGo(snapshotID, rel, src)
	case "typescript":
		return analyzeTS(snapshotID, rel, src)
	case "python":
		return analyzePython(snapshotID, rel, src)
	case "c":
		return analyzeC(snapshotID, rel, src)
	default:
		return nil, nil, nil, nil, nil
	}
}

func analyzeGo(snapshotID string, rel string, src string) ([]ChunkRecord, []SymbolRecord, []ImportRecord, []ReferenceRecord, []CallRecord) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, rel, src, parser.AllErrors|parser.ParseComments)
	if err != nil || file == nil {
		chunks := fallbackWholeFileChunk(snapshotID, rel, "go", src)
		refs, calls := extractRelations(snapshotID, rel, "go", chunks, nil)
		return chunks, nil, nil, refs, calls
	}
	lines := splitLinesPreserve(src)
	var chunks []ChunkRecord
	var symbols []SymbolRecord
	var imports []ImportRecord
	packageName := ""
	if file.Name != nil {
		packageName = file.Name.Name
	}
	for _, imp := range file.Imports {
		path := strings.Trim(imp.Path.Value, `"`)
		imports = append(imports, ImportRecord{
			SnapshotID: snapshotID,
			FilePath:   rel,
			Language:   "go",
			ImportPath: path,
			ImportKind: "import",
		})
	}
	firstDeclLine := len(lines) + 1
	for _, decl := range file.Decls {
		start := fset.Position(decl.Pos()).Line
		end := fset.Position(decl.End()).Line
		if start < firstDeclLine {
			firstDeclLine = start
		}
		switch d := decl.(type) {
		case *ast.FuncDecl:
			name := ""
			if d.Name != nil {
				name = d.Name.Name
			}
			chunkID := chunkIDFor(rel, start, name)
			chunks = append(chunks, ChunkRecord{
				SnapshotID: snapshotID,
				ChunkID:    chunkID,
				FilePath:   rel,
				Language:   "go",
				Kind:       "function",
				Name:       name,
				StartLine:  start,
				EndLine:    end,
				Content:    sliceLines(lines, start, end),
				ContextJSON: mustJSON(map[string]any{
					"package": packageName,
				}),
			})
			symbols = append(symbols, SymbolRecord{
				SnapshotID:    snapshotID,
				SymbolID:      symbolIDFor(rel, name, start),
				Name:          name,
				QualifiedName: qualify(packageName, name),
				Kind:          "function",
				Language:      "go",
				FilePath:      rel,
				StartLine:     start,
				EndLine:       end,
				ChunkID:       chunkID,
			})
		case *ast.GenDecl:
			names := namesForGenDecl(d)
			kind := strings.ToLower(d.Tok.String())
			name := ""
			if len(names) > 0 {
				name = names[0]
			}
			chunkID := chunkIDFor(rel, start, name)
			chunks = append(chunks, ChunkRecord{
				SnapshotID: snapshotID,
				ChunkID:    chunkID,
				FilePath:   rel,
				Language:   "go",
				Kind:       kind,
				Name:       name,
				StartLine:  start,
				EndLine:    end,
				Content:    sliceLines(lines, start, end),
				ContextJSON: mustJSON(map[string]any{
					"package": packageName,
					"names":   names,
				}),
			})
			for _, n := range names {
				symbols = append(symbols, SymbolRecord{
					SnapshotID:    snapshotID,
					SymbolID:      symbolIDFor(rel, n, start),
					Name:          n,
					QualifiedName: qualify(packageName, n),
					Kind:          kind,
					Language:      "go",
					FilePath:      rel,
					StartLine:     start,
					EndLine:       end,
					ChunkID:       chunkID,
				})
			}
		}
	}
	if firstDeclLine > 1 && len(lines) > 0 {
		chunks = append([]ChunkRecord{{
			SnapshotID:  snapshotID,
			ChunkID:     chunkIDFor(rel, 1, "preamble"),
			FilePath:    rel,
			Language:    "go",
			Kind:        "preamble",
			Name:        "preamble",
			StartLine:   1,
			EndLine:     firstDeclLine - 1,
			Content:     sliceLines(lines, 1, firstDeclLine-1),
			ContextJSON: mustJSON(map[string]any{"package": packageName}),
		}}, chunks...)
	}
	if len(chunks) == 0 {
		chunks = fallbackWholeFileChunk(snapshotID, rel, "go", src)
	}
	refs, calls := extractRelations(snapshotID, rel, "go", chunks, symbols)
	return chunks, symbols, imports, refs, mergeCallRecords(calls, extractGoASTCalls(snapshotID, rel, fset, file, chunks, symbols))
}

func namesForGenDecl(d *ast.GenDecl) []string {
	var names []string
	for _, spec := range d.Specs {
		switch s := spec.(type) {
		case *ast.TypeSpec:
			if s.Name != nil {
				names = append(names, s.Name.Name)
			}
		case *ast.ValueSpec:
			for _, ident := range s.Names {
				if ident != nil {
					names = append(names, ident.Name)
				}
			}
		}
	}
	return names
}

var (
	tsImportFromRe = regexp.MustCompile(`^\s*import\s+.*?\s+from\s+['"]([^'"]+)['"]`)
	tsImportBareRe = regexp.MustCompile(`^\s*import\s+['"]([^'"]+)['"]`)
	tsRequireRe    = regexp.MustCompile(`require\(\s*['"]([^'"]+)['"]\s*\)`)
	tsDeclRes      = []struct {
		kind string
		re   *regexp.Regexp
	}{
		{"function", regexp.MustCompile(`^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)`)},
		{"class", regexp.MustCompile(`^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)`)},
		{"interface", regexp.MustCompile(`^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)`)},
		{"type", regexp.MustCompile(`^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)`)},
		{"const", regexp.MustCompile(`^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)`)},
	}
	pyImportRe     = regexp.MustCompile(`^\s*import\s+([A-Za-z0-9_.,\s]+)`)
	pyFromImportRe = regexp.MustCompile(`^\s*from\s+([A-Za-z0-9_\.]+)\s+import\s+`)
	pyDeclRe       = regexp.MustCompile(`^(def|class)\s+([A-Za-z_][A-Za-z0-9_]*)`)
	cIncludeRe     = regexp.MustCompile(`^\s*#include\s+[<"]([^>"]+)[>"]`)
	cFuncRe        = regexp.MustCompile(`^\s*[A-Za-z_][A-Za-z0-9_\s\*\(\),]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*\{`)
)

func analyzeTS(snapshotID string, rel string, src string) ([]ChunkRecord, []SymbolRecord, []ImportRecord, []ReferenceRecord, []CallRecord) {
	lines := splitLinesPreserve(src)
	var imports []ImportRecord
	for _, line := range lines {
		if m := tsImportFromRe.FindStringSubmatch(line); len(m) == 2 {
			imports = append(imports, ImportRecord{SnapshotID: snapshotID, FilePath: rel, Language: "typescript", ImportPath: m[1], ImportKind: "import"})
			continue
		}
		if m := tsImportBareRe.FindStringSubmatch(line); len(m) == 2 {
			imports = append(imports, ImportRecord{SnapshotID: snapshotID, FilePath: rel, Language: "typescript", ImportPath: m[1], ImportKind: "import"})
			continue
		}
		for _, mm := range tsRequireRe.FindAllStringSubmatch(line, -1) {
			if len(mm) == 2 {
				imports = append(imports, ImportRecord{SnapshotID: snapshotID, FilePath: rel, Language: "typescript", ImportPath: mm[1], ImportKind: "require"})
			}
		}
	}
	chunks, symbols, _ := analyzeTopLevelByRegex(snapshotID, rel, "typescript", lines, tsDeclRes, "")
	refs, calls := extractRelations(snapshotID, rel, "typescript", chunks, symbols)
	return chunks, symbols, imports, refs, calls
}

func analyzePython(snapshotID string, rel string, src string) ([]ChunkRecord, []SymbolRecord, []ImportRecord, []ReferenceRecord, []CallRecord) {
	lines := splitLinesPreserve(src)
	var imports []ImportRecord
	for _, line := range lines {
		if m := pyFromImportRe.FindStringSubmatch(line); len(m) == 2 {
			imports = append(imports, ImportRecord{SnapshotID: snapshotID, FilePath: rel, Language: "python", ImportPath: m[1], ImportKind: "from"})
			continue
		}
		if m := pyImportRe.FindStringSubmatch(line); len(m) == 2 {
			for _, piece := range strings.Split(m[1], ",") {
				piece = strings.TrimSpace(piece)
				if piece != "" {
					imports = append(imports, ImportRecord{SnapshotID: snapshotID, FilePath: rel, Language: "python", ImportPath: piece, ImportKind: "import"})
				}
			}
		}
	}
	decls := []struct {
		kind string
		re   *regexp.Regexp
	}{
		{"def", regexp.MustCompile(`^def\s+([A-Za-z_][A-Za-z0-9_]*)`)},
		{"class", regexp.MustCompile(`^class\s+([A-Za-z_][A-Za-z0-9_]*)`)},
	}
	chunks, symbols, _ := analyzeTopLevelByRegex(snapshotID, rel, "python", lines, decls, "python")
	refs, calls := extractRelations(snapshotID, rel, "python", chunks, symbols)
	return chunks, symbols, imports, refs, calls
}

func analyzeC(snapshotID string, rel string, src string) ([]ChunkRecord, []SymbolRecord, []ImportRecord, []ReferenceRecord, []CallRecord) {
	lines := splitLinesPreserve(src)
	var imports []ImportRecord
	for _, line := range lines {
		if m := cIncludeRe.FindStringSubmatch(line); len(m) == 2 {
			imports = append(imports, ImportRecord{SnapshotID: snapshotID, FilePath: rel, Language: "c", ImportPath: m[1], ImportKind: "include"})
		}
	}
	decls := []struct {
		kind string
		re   *regexp.Regexp
	}{
		{"function", cFuncRe},
	}
	chunks, symbols, _ := analyzeTopLevelByRegex(snapshotID, rel, "c", lines, decls, "")
	refs, calls := extractRelations(snapshotID, rel, "c", chunks, symbols)
	return chunks, symbols, imports, refs, calls
}

func analyzeTopLevelByRegex(snapshotID string, rel string, language string, lines []string, decls []struct {
	kind string
	re   *regexp.Regexp
}, indentMode string) ([]ChunkRecord, []SymbolRecord, []ImportRecord) {
	type start struct {
		line int
		kind string
		name string
	}
	var starts []start
	braceDepth := 0
	for i, line := range lines {
		lineNo := i + 1
		trimmed := strings.TrimSpace(line)
		if indentMode == "python" {
			if strings.TrimSpace(line) != "" && line == strings.TrimLeft(line, " \t") {
				for _, decl := range decls {
					if m := decl.re.FindStringSubmatch(trimmed); len(m) == 2 {
						starts = append(starts, start{line: lineNo, kind: decl.kind, name: m[1]})
					}
				}
			}
			continue
		}
		if braceDepth == 0 {
			for _, decl := range decls {
				if m := decl.re.FindStringSubmatch(trimmed); len(m) == 2 {
					starts = append(starts, start{line: lineNo, kind: decl.kind, name: m[1]})
					break
				}
			}
		}
		braceDepth += strings.Count(line, "{")
		braceDepth -= strings.Count(line, "}")
		if braceDepth < 0 {
			braceDepth = 0
		}
	}
	var chunks []ChunkRecord
	var symbols []SymbolRecord
	if len(starts) == 0 {
		return fallbackWholeFileChunk(snapshotID, rel, language, strings.Join(lines, "\n")), nil, nil
	}
	if starts[0].line > 1 {
		chunks = append(chunks, ChunkRecord{
			SnapshotID:  snapshotID,
			ChunkID:     chunkIDFor(rel, 1, "preamble"),
			FilePath:    rel,
			Language:    language,
			Kind:        "preamble",
			Name:        "preamble",
			StartLine:   1,
			EndLine:     starts[0].line - 1,
			Content:     sliceLines(lines, 1, starts[0].line-1),
			ContextJSON: `{}`,
		})
	}
	for idx, start := range starts {
		end := len(lines)
		if idx+1 < len(starts) {
			end = starts[idx+1].line - 1
		}
		chunkID := chunkIDFor(rel, start.line, start.name)
		chunks = append(chunks, ChunkRecord{
			SnapshotID:  snapshotID,
			ChunkID:     chunkID,
			FilePath:    rel,
			Language:    language,
			Kind:        start.kind,
			Name:        start.name,
			StartLine:   start.line,
			EndLine:     end,
			Content:     sliceLines(lines, start.line, end),
			ContextJSON: `{}`,
		})
		symbols = append(symbols, SymbolRecord{
			SnapshotID:    snapshotID,
			SymbolID:      symbolIDFor(rel, start.name, start.line),
			Name:          start.name,
			QualifiedName: qualify(moduleNameForFile(rel), start.name),
			Kind:          start.kind,
			Language:      language,
			FilePath:      rel,
			StartLine:     start.line,
			EndLine:       end,
			ChunkID:       chunkID,
		})
	}
	return chunks, symbols, nil
}

func fallbackWholeFileChunk(snapshotID string, rel string, language string, src string) []ChunkRecord {
	lines := splitLinesPreserve(src)
	end := len(lines)
	if end == 0 {
		end = 1
	}
	return []ChunkRecord{{
		SnapshotID:  snapshotID,
		ChunkID:     chunkIDFor(rel, 1, "file"),
		FilePath:    rel,
		Language:    language,
		Kind:        "file",
		Name:        filepath.Base(rel),
		StartLine:   1,
		EndLine:     end,
		Content:     src,
		ContextJSON: `{}`,
	}}
}

func splitLinesPreserve(src string) []string {
	src = strings.ReplaceAll(src, "\r\n", "\n")
	return strings.Split(src, "\n")
}

func sliceLines(lines []string, start int, end int) string {
	if start < 1 {
		start = 1
	}
	if end > len(lines) {
		end = len(lines)
	}
	if start > end || start > len(lines) {
		return ""
	}
	return strings.Join(lines[start-1:end], "\n")
}

func deriveSnapshotID(rootPath string, repoID string, commitSHA string) string {
	base := repoID
	if base == "" {
		base = filepath.Base(rootPath)
	}
	base = sanitizeID(base)
	if commitSHA != "" {
		return fmt.Sprintf("%s-%s", base, commitSHA[:min(len(commitSHA), 12)])
	}
	sum := sha256.Sum256([]byte(rootPath))
	return fmt.Sprintf("%s-%s", base, hex.EncodeToString(sum[:])[:12])
}

func inspectGit(rootPath string) (string, string) {
	repoID := filepath.Base(rootPath)
	remoteURL := strings.TrimSpace(runGit(rootPath, "config", "--get", "remote.origin.url"))
	if remoteURL != "" {
		repoID = repoIDFromRemote(remoteURL)
	}
	commitSHA := strings.TrimSpace(runGit(rootPath, "rev-parse", "HEAD"))
	return repoID, commitSHA
}

func runGit(rootPath string, args ...string) string {
	cmd := exec.Command("git", append([]string{"-C", rootPath}, args...)...)
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func repoIDFromRemote(remote string) string {
	remote = strings.TrimSpace(strings.TrimSuffix(remote, ".git"))
	remote = strings.TrimPrefix(remote, "https://")
	remote = strings.TrimPrefix(remote, "http://")
	remote = strings.TrimPrefix(remote, "git@")
	remote = strings.ReplaceAll(remote, ":", "/")
	parts := strings.Split(remote, "/")
	if len(parts) >= 2 {
		return strings.ToLower(parts[len(parts)-2] + "/" + parts[len(parts)-1])
	}
	return sanitizeID(filepath.Base(remote))
}

func sanitizeID(raw string) string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		return "snapshot"
	}
	var b strings.Builder
	lastDash := false
	for _, r := range raw {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if r == '/' || r == '_' || r == '-' || r == '.' {
			if !lastDash {
				b.WriteRune('-')
				lastDash = true
			}
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "snapshot"
	}
	return out
}

func chunkIDFor(path string, startLine int, name string) string {
	base := fmt.Sprintf("%s:%d:%s", path, startLine, name)
	sum := sha256.Sum256([]byte(base))
	return hex.EncodeToString(sum[:])[:16]
}

func symbolIDFor(path string, name string, startLine int) string {
	base := fmt.Sprintf("%s:%s:%d", path, name, startLine)
	sum := sha256.Sum256([]byte(base))
	return hex.EncodeToString(sum[:])[:16]
}

func qualify(scope string, name string) string {
	scope = strings.TrimSpace(scope)
	name = strings.TrimSpace(name)
	if scope == "" {
		return name
	}
	if name == "" {
		return scope
	}
	return scope + "." + name
}

func moduleNameForFile(rel string) string {
	rel = strings.TrimSuffix(filepath.ToSlash(rel), filepath.Ext(rel))
	return strings.ReplaceAll(rel, "/", ".")
}

func hashBytes(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func mustJSON(v interface{}) string {
	data, err := json.Marshal(v)
	if err != nil {
		return `{}`
	}
	return string(data)
}

func buildFTSQuery(query string) string {
	parts := strings.Fields(strings.ToLower(query))
	if len(parts) == 0 {
		return `""`
	}
	for i, part := range parts {
		part = strings.Trim(part, `"'`)
		if part == "" {
			continue
		}
		parts[i] = `"` + part + `"`
	}
	return strings.Join(parts, " OR ")
}

func min(a int, b int) int {
	if a < b {
		return a
	}
	return b
}
