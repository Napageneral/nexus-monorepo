package codeintel

import (
	"context"
	"database/sql"
	"fmt"
	"go/ast"
	"go/token"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var (
	identifierRe = regexp.MustCompile(`\b[A-Za-z_][A-Za-z0-9_]*\b`)
	callRe       = regexp.MustCompile(`\b([A-Za-z_][A-Za-z0-9_]*)\s*\(`)
)

var languageKeywords = map[string]map[string]struct{}{
	"go": {
		"break": {}, "case": {}, "chan": {}, "const": {}, "continue": {}, "default": {},
		"defer": {}, "else": {}, "fallthrough": {}, "for": {}, "func": {}, "go": {},
		"goto": {}, "if": {}, "import": {}, "interface": {}, "map": {}, "package": {},
		"range": {}, "return": {}, "select": {}, "struct": {}, "switch": {}, "type": {},
		"var": {},
	},
	"typescript": {
		"async": {}, "await": {}, "break": {}, "case": {}, "catch": {}, "class": {},
		"const": {}, "continue": {}, "default": {}, "delete": {}, "else": {},
		"export": {}, "extends": {}, "finally": {}, "for": {}, "function": {},
		"if": {}, "import": {}, "interface": {}, "let": {}, "new": {}, "return": {},
		"switch": {}, "throw": {}, "try": {}, "type": {}, "var": {}, "while": {},
	},
	"python": {
		"and": {}, "as": {}, "assert": {}, "break": {}, "class": {}, "continue": {},
		"def": {}, "elif": {}, "else": {}, "except": {}, "False": {}, "finally": {},
		"for": {}, "from": {}, "if": {}, "import": {}, "in": {}, "is": {},
		"lambda": {}, "None": {}, "not": {}, "or": {}, "pass": {}, "raise": {},
		"return": {}, "True": {}, "try": {}, "while": {}, "with": {}, "yield": {},
	},
	"c": {
		"break": {}, "case": {}, "const": {}, "continue": {}, "default": {}, "do": {},
		"else": {}, "enum": {}, "for": {}, "goto": {}, "if": {}, "return": {},
		"sizeof": {}, "struct": {}, "switch": {}, "typedef": {}, "union": {},
		"void": {}, "while": {},
	},
}

var guideProbePhraseExpansions = map[string][]string{
	"web server":            {"server"},
	"custom alias":          {"new custom alias", "new_custom_alias", "signed suffix", "check suffix signature", "alias suffix", "can create new alias"},
	"email handler":         {"email handler"},
	"job runner":            {"job runner"},
	"creation limits":       {"can create new alias", "quota", "new custom alias"},
	"dashboard ui":          {"dashboard"},
	"rate limiting headers": {"rate limited for alias", "rate limit", "ratelimit policy"},
	"signed suffix":         {"check suffix signature", "alias suffix", "new custom alias", "can create new alias"},
	"sign in":               {"login", "auth"},
	"log in":                {"login", "auth"},
	"manage aliases":        {"alias"},
}

var guideDomainTerms = map[string]struct{}{
	"alias": {}, "aliases": {}, "api": {}, "auth": {}, "dashboard": {}, "email": {},
	"handler": {}, "job": {}, "jobs": {}, "log": {}, "login": {}, "logs": {},
	"mailbox": {}, "queue": {}, "runner": {}, "server": {}, "sign": {}, "signin": {},
	"ui": {}, "user": {}, "users": {}, "web": {}, "worker": {},
}

var guideStopwords = map[string]struct{}{
	"a": {}, "actually": {}, "all": {}, "am": {}, "and": {}, "are": {}, "as": {},
	"at": {}, "be": {}, "can": {}, "confirm": {}, "confirms": {}, "everything": {},
	"get": {}, "how": {}, "i": {}, "in": {}, "is": {}, "it": {}, "locally": {},
	"new": {}, "once": {}, "or": {}, "see": {}, "should": {}, "tell": {},
	"that": {}, "the": {}, "their": {}, "to": {}, "trying": {}, "up": {},
	"what": {}, "when": {}, "with": {}, "responding": {}, "running": {},
}

type guideSearchCandidate struct {
	Hit   SearchHit
	Probe string
	Score int
	Rank  int
}

type plannedGuideSearch struct {
	AnchorHits []SearchHit
	SearchHits []SearchHit
}

type analyzedSnapshotFile struct {
	file    FileRecord
	chunks  []ChunkRecord
	symbols []SymbolRecord
	imports []ImportRecord
	refs    []ReferenceRecord
	calls   []CallRecord
}

func extractRelations(snapshotID string, rel string, language string, chunks []ChunkRecord, symbols []SymbolRecord) ([]ReferenceRecord, []CallRecord) {
	chunkSymbols := map[string][]SymbolRecord{}
	for _, symbol := range symbols {
		chunkSymbols[symbol.ChunkID] = append(chunkSymbols[symbol.ChunkID], symbol)
	}

	var refs []ReferenceRecord
	var calls []CallRecord
	seenRefs := map[string]struct{}{}
	seenCalls := map[string]struct{}{}

	for _, chunk := range chunks {
		lines := splitLinesPreserve(chunk.Content)
		declared := map[string]struct{}{}
		for _, symbol := range chunkSymbols[chunk.ChunkID] {
			declared[symbol.Name] = struct{}{}
		}

		var callerSymbol SymbolRecord
		if syms := chunkSymbols[chunk.ChunkID]; len(syms) > 0 {
			callerSymbol = syms[0]
		}

		for idx, line := range lines {
			lineNo := chunk.StartLine + idx

			for _, bounds := range identifierRe.FindAllStringIndex(line, -1) {
				name := line[bounds[0]:bounds[1]]
				if shouldSkipIdentifier(language, name) {
					continue
				}
				if lineNo == chunk.StartLine {
					if _, ok := declared[name]; ok {
						continue
					}
				}
				key := fmt.Sprintf("%s:%s:%d:%s", rel, chunk.ChunkID, lineNo, name)
				if _, ok := seenRefs[key]; ok {
					continue
				}
				seenRefs[key] = struct{}{}
				refs = append(refs, ReferenceRecord{
					SnapshotID:    snapshotID,
					SymbolName:    name,
					Language:      language,
					FilePath:      rel,
					ChunkID:       chunk.ChunkID,
					StartLine:     lineNo,
					EndLine:       lineNo,
					ReferenceKind: "identifier",
				})
			}

			for _, match := range callRe.FindAllStringSubmatch(line, -1) {
				if len(match) != 2 {
					continue
				}
				callee := match[1]
				if shouldSkipIdentifier(language, callee) {
					continue
				}
				if lineNo == chunk.StartLine && callee == chunk.Name {
					continue
				}
				key := fmt.Sprintf("%s:%s:%d:%s", rel, chunk.ChunkID, lineNo, callee)
				if _, ok := seenCalls[key]; ok {
					continue
				}
				seenCalls[key] = struct{}{}
				calls = append(calls, CallRecord{
					SnapshotID:          snapshotID,
					Language:            language,
					CallerSymbolID:      callerSymbol.SymbolID,
					CallerName:          callerSymbol.Name,
					CallerQualifiedName: callerSymbol.QualifiedName,
					CallerFilePath:      rel,
					CallerChunkID:       chunk.ChunkID,
					CalleeName:          callee,
					Line:                lineNo,
					CallKind:            "call",
				})
			}
		}
	}

	return refs, calls
}

func extractGoASTCalls(snapshotID string, rel string, fset *token.FileSet, file *ast.File, chunks []ChunkRecord, symbols []SymbolRecord) []CallRecord {
	chunkByRange := chunks
	symbolByChunk := map[string]SymbolRecord{}
	for _, symbol := range symbols {
		if _, ok := symbolByChunk[symbol.ChunkID]; !ok {
			symbolByChunk[symbol.ChunkID] = symbol
		}
	}

	var out []CallRecord
	seen := map[string]struct{}{}
	for _, decl := range file.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Body == nil {
			continue
		}
		startLine := fset.Position(fn.Pos()).Line
		endLine := fset.Position(fn.End()).Line
		callerChunk := findChunkForSpan(chunkByRange, startLine, endLine)
		if callerChunk == nil {
			continue
		}
		callerSymbol := symbolByChunk[callerChunk.ChunkID]
		ast.Inspect(fn.Body, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			calleeName := goCallName(call.Fun)
			if calleeName == "" || shouldSkipIdentifier("go", calleeName) {
				return true
			}
			line := fset.Position(call.Pos()).Line
			key := fmt.Sprintf("%s:%s:%d:%s", rel, callerChunk.ChunkID, line, calleeName)
			if _, ok := seen[key]; ok {
				return true
			}
			seen[key] = struct{}{}
			out = append(out, CallRecord{
				SnapshotID:          snapshotID,
				Language:            "go",
				CallerSymbolID:      callerSymbol.SymbolID,
				CallerName:          callerSymbol.Name,
				CallerQualifiedName: callerSymbol.QualifiedName,
				CallerFilePath:      rel,
				CallerChunkID:       callerChunk.ChunkID,
				CalleeName:          calleeName,
				Line:                line,
				CallKind:            "call",
			})
			return true
		})
	}
	return out
}

func goCallName(expr ast.Expr) string {
	switch target := expr.(type) {
	case *ast.Ident:
		return target.Name
	case *ast.SelectorExpr:
		if target.Sel != nil {
			return target.Sel.Name
		}
	}
	return ""
}

func findChunkForSpan(chunks []ChunkRecord, startLine int, endLine int) *ChunkRecord {
	for i := range chunks {
		if chunks[i].StartLine <= startLine && chunks[i].EndLine >= endLine {
			return &chunks[i]
		}
	}
	return nil
}

func mergeCallRecords(groups ...[]CallRecord) []CallRecord {
	merged := make([]CallRecord, 0)
	seen := map[string]struct{}{}
	for _, group := range groups {
		for _, call := range group {
			key := fmt.Sprintf("%s:%s:%s:%d:%s", call.CallerFilePath, call.CallerChunkID, call.CalleeName, call.Line, call.CallKind)
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			merged = append(merged, call)
		}
	}
	sort.Slice(merged, func(i, j int) bool {
		if merged[i].CallerFilePath != merged[j].CallerFilePath {
			return merged[i].CallerFilePath < merged[j].CallerFilePath
		}
		if merged[i].Line != merged[j].Line {
			return merged[i].Line < merged[j].Line
		}
		return merged[i].CalleeName < merged[j].CalleeName
	})
	return merged
}

func buildSymbolNameIndex(files []analyzedSnapshotFile) map[string][]SymbolRecord {
	index := map[string][]SymbolRecord{}
	for _, file := range files {
		for _, symbol := range file.symbols {
			key := symbolIndexKey(symbol.Language, symbol.Name)
			index[key] = append(index[key], symbol)
		}
	}
	return index
}

func resolveReferenceSymbols(refs []ReferenceRecord, symbolIndex map[string][]SymbolRecord) []ReferenceRecord {
	out := make([]ReferenceRecord, 0, len(refs))
	for _, ref := range refs {
		candidates := symbolIndex[symbolIndexKey(ref.Language, ref.SymbolName)]
		if len(candidates) == 1 {
			ref.SymbolID = candidates[0].SymbolID
			ref.QualifiedName = candidates[0].QualifiedName
		}
		out = append(out, ref)
	}
	return out
}

func resolveCallSymbols(calls []CallRecord, symbolIndex map[string][]SymbolRecord) []CallRecord {
	out := make([]CallRecord, 0, len(calls))
	for _, call := range calls {
		candidates := symbolIndex[symbolIndexKey(call.Language, call.CalleeName)]
		if len(candidates) == 1 {
			call.CalleeSymbolID = candidates[0].SymbolID
			call.CalleeQualifiedName = candidates[0].QualifiedName
		}
		out = append(out, call)
	}
	return out
}

func symbolIndexKey(language string, name string) string {
	return strings.TrimSpace(language) + "\x00" + strings.TrimSpace(name)
}

func shouldSkipIdentifier(language string, name string) bool {
	name = strings.TrimSpace(name)
	if name == "" {
		return true
	}
	if keywords, ok := languageKeywords[language]; ok {
		if _, found := keywords[name]; found {
			return true
		}
	}
	return false
}

func (s *Service) GetSymbolByID(ctx context.Context, snapshotID string, symbolID string) (*SymbolRecord, error) {
	var row SymbolRecord
	err := s.db.QueryRowContext(ctx, `
		SELECT snapshot_id, symbol_id, name, qualified_name, kind, language, file_path, start_line, end_line, chunk_id
		FROM code_symbols
		WHERE snapshot_id = ? AND symbol_id = ?
	`, snapshotID, strings.TrimSpace(symbolID)).Scan(
		&row.SnapshotID,
		&row.SymbolID,
		&row.Name,
		&row.QualifiedName,
		&row.Kind,
		&row.Language,
		&row.FilePath,
		&row.StartLine,
		&row.EndLine,
		&row.ChunkID,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("symbol not found: %s", symbolID)
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *Service) GetReferences(ctx context.Context, snapshotID string, symbolName string, language string, limit int) ([]ReferenceRecord, error) {
	if limit <= 0 {
		limit = 20
	}
	symbolName = strings.TrimSpace(symbolName)
	language = strings.TrimSpace(language)
	if symbolName == "" {
		return nil, fmt.Errorf("symbol name is required")
	}
	where := []string{"snapshot_id = ?", "symbol_name = ?"}
	args := []interface{}{snapshotID, symbolName}
	if language != "" {
		where = append(where, "language = ?")
		args = append(args, language)
	}
	args = append(args, limit)
	rows, err := s.db.QueryContext(ctx, `
		SELECT snapshot_id, symbol_id, symbol_name, qualified_name, language, file_path, chunk_id, start_line, end_line, reference_kind
		FROM code_references
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY file_path ASC, start_line ASC
		LIMIT ?
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ReferenceRecord
	for rows.Next() {
		var row ReferenceRecord
		if err := rows.Scan(&row.SnapshotID, &row.SymbolID, &row.SymbolName, &row.QualifiedName, &row.Language, &row.FilePath, &row.ChunkID, &row.StartLine, &row.EndLine, &row.ReferenceKind); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Service) GetCallers(ctx context.Context, snapshotID string, calleeName string, language string, limit int) ([]CallRecord, error) {
	if limit <= 0 {
		limit = 20
	}
	calleeName = strings.TrimSpace(calleeName)
	language = strings.TrimSpace(language)
	if calleeName == "" {
		return nil, fmt.Errorf("callee name is required")
	}
	where := []string{"snapshot_id = ?", "callee_name = ?"}
	args := []interface{}{snapshotID, calleeName}
	if language != "" {
		where = append(where, "language = ?")
		args = append(args, language)
	}
	args = append(args, limit)
	return s.queryCalls(ctx, `
		SELECT snapshot_id, language, caller_symbol_id, caller_name, caller_qualified_name, caller_file_path, caller_chunk_id, callee_symbol_id, callee_name, callee_qualified_name, line, call_kind
		FROM code_calls
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY caller_file_path ASC, line ASC
		LIMIT ?
	`, args...)
}

func (s *Service) GetCallees(ctx context.Context, snapshotID string, callerSymbolID string, callerChunkID string, limit int) ([]CallRecord, error) {
	if limit <= 0 {
		limit = 20
	}
	callerSymbolID = strings.TrimSpace(callerSymbolID)
	callerChunkID = strings.TrimSpace(callerChunkID)
	if callerSymbolID == "" && callerChunkID == "" {
		return nil, fmt.Errorf("caller_symbol_id or caller_chunk_id is required")
	}
	where := []string{"snapshot_id = ?"}
	args := []interface{}{snapshotID}
	if callerSymbolID != "" {
		where = append(where, "caller_symbol_id = ?")
		args = append(args, callerSymbolID)
	} else {
		where = append(where, "caller_chunk_id = ?")
		args = append(args, callerChunkID)
	}
	args = append(args, limit)
	return s.queryCalls(ctx, `
		SELECT snapshot_id, language, caller_symbol_id, caller_name, caller_qualified_name, caller_file_path, caller_chunk_id, callee_symbol_id, callee_name, callee_qualified_name, line, call_kind
		FROM code_calls
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY line ASC, callee_name ASC
		LIMIT ?
	`, args...)
}

func (s *Service) queryCalls(ctx context.Context, query string, args ...interface{}) ([]CallRecord, error) {
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CallRecord
	for rows.Next() {
		var row CallRecord
		if err := rows.Scan(&row.SnapshotID, &row.Language, &row.CallerSymbolID, &row.CallerName, &row.CallerQualifiedName, &row.CallerFilePath, &row.CallerChunkID, &row.CalleeSymbolID, &row.CalleeName, &row.CalleeQualifiedName, &row.Line, &row.CallKind); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Service) listSymbolsForChunk(ctx context.Context, snapshotID string, chunkID string) ([]SymbolRecord, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT snapshot_id, symbol_id, name, qualified_name, kind, language, file_path, start_line, end_line, chunk_id
		FROM code_symbols
		WHERE snapshot_id = ? AND chunk_id = ?
		ORDER BY start_line ASC
	`, snapshotID, strings.TrimSpace(chunkID))
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

func (s *Service) BuildContextPack(ctx context.Context, req ContextPackRequest) (*ContextPack, error) {
	req.SnapshotID = strings.TrimSpace(req.SnapshotID)
	req.Query = strings.TrimSpace(req.Query)
	req.SymbolQuery = strings.TrimSpace(req.SymbolQuery)
	req.TargetID = strings.TrimSpace(req.TargetID)
	req.Path = filepath.ToSlash(strings.TrimSpace(req.Path))
	if req.SnapshotID == "" {
		return nil, fmt.Errorf("snapshot_id is required")
	}
	if req.Limit <= 0 {
		req.Limit = 10
	}

	pack := &ContextPack{
		Query:       req.Query,
		Limitations: []string{"best-effort lexical references", "best-effort lexical call edges"},
	}

	anchorChunkMap := map[string]ChunkRecord{}
	supportingChunkMap := map[string]ChunkRecord{}
	anchorSymbolMap := map[string]SymbolRecord{}
	fileSet := map[string]struct{}{}

	addAnchorChunk := func(chunk ChunkRecord) {
		if chunk.ChunkID == "" {
			return
		}
		anchorChunkMap[chunk.ChunkID] = chunk
		fileSet[chunk.FilePath] = struct{}{}
	}
	addSupportingChunk := func(chunk ChunkRecord) {
		if chunk.ChunkID == "" {
			return
		}
		if _, ok := anchorChunkMap[chunk.ChunkID]; ok {
			return
		}
		supportingChunkMap[chunk.ChunkID] = chunk
		fileSet[chunk.FilePath] = struct{}{}
	}
	addAnchorSymbol := func(symbol SymbolRecord) {
		if symbol.SymbolID == "" {
			return
		}
		anchorSymbolMap[symbol.SymbolID] = symbol
		fileSet[symbol.FilePath] = struct{}{}
	}

	if req.TargetID != "" {
		if chunk, err := s.GetChunk(ctx, req.SnapshotID, req.TargetID, "", 0); err == nil {
			addAnchorChunk(*chunk)
			symbols, err := s.listSymbolsForChunk(ctx, req.SnapshotID, chunk.ChunkID)
			if err == nil {
				for _, symbol := range symbols {
					addAnchorSymbol(symbol)
				}
			}
		} else if symbol, err := s.GetSymbolByID(ctx, req.SnapshotID, req.TargetID); err == nil {
			addAnchorSymbol(*symbol)
			chunk, err := s.GetChunk(ctx, req.SnapshotID, symbol.ChunkID, "", 0)
			if err == nil {
				addAnchorChunk(*chunk)
			}
		}
	}

	if len(anchorChunkMap) == 0 && req.Path != "" {
		chunk, err := s.GetChunk(ctx, req.SnapshotID, "", req.Path, req.Line)
		if err == nil {
			addAnchorChunk(*chunk)
			symbols, err := s.listSymbolsForChunk(ctx, req.SnapshotID, chunk.ChunkID)
			if err == nil {
				for _, symbol := range symbols {
					addAnchorSymbol(symbol)
				}
			}
		}
	}

	if len(anchorSymbolMap) == 0 && req.SymbolQuery != "" {
		symbols, err := s.ResolveSymbol(ctx, req.SnapshotID, req.SymbolQuery, "", req.Limit)
		if err == nil {
			for _, symbol := range symbols {
				addAnchorSymbol(symbol)
				chunk, err := s.GetChunk(ctx, req.SnapshotID, symbol.ChunkID, "", 0)
				if err == nil {
					addAnchorChunk(*chunk)
				}
			}
		}
	}

	if req.Query != "" {
		if len(anchorChunkMap) == 0 && len(anchorSymbolMap) == 0 {
			planned := s.planGuideSearch(ctx, req.SnapshotID, req.Query, req.Limit)
			pack.SearchHits = planned.SearchHits
			for _, hit := range planned.AnchorHits {
				chunk, err := s.resolveGuideAnchorChunk(ctx, req.SnapshotID, hit)
				if err != nil {
					continue
				}
				addAnchorChunk(*chunk)
				symbols, err := s.listSymbolsForChunk(ctx, req.SnapshotID, chunk.ChunkID)
				if err == nil {
					for _, symbol := range symbols {
						addAnchorSymbol(symbol)
					}
				}
			}
			for _, hit := range pack.SearchHits {
				chunk, err := s.GetChunk(ctx, req.SnapshotID, hit.ChunkID, "", 0)
				if err == nil {
					addSupportingChunk(*chunk)
				}
			}
		} else {
			search, err := s.SearchSemantic(ctx, req.SnapshotID, req.Query, req.Limit)
			if err == nil {
				pack.SearchHits = dedupeSearchHits(filterGuideSearchHits(search.Hits))
				for idx, hit := range pack.SearchHits {
					if idx >= 3 {
						break
					}
					chunk, err := s.GetChunk(ctx, req.SnapshotID, hit.ChunkID, "", 0)
					if err == nil {
						addSupportingChunk(*chunk)
					}
				}
			}
		}
	}

	for _, chunk := range anchorChunkMap {
		ctxPack, err := s.GetContext(ctx, req.SnapshotID, chunk.ChunkID, "", 0)
		if err != nil {
			continue
		}
		if ctxPack.Previous != nil {
			addSupportingChunk(*ctxPack.Previous)
		}
		if ctxPack.Next != nil {
			addSupportingChunk(*ctxPack.Next)
		}
		imports, err := s.GetImports(ctx, req.SnapshotID, chunk.FilePath)
		if err == nil {
			pack.Imports = append(pack.Imports, imports...)
			for _, imp := range imports {
				fileSet[imp.FilePath] = struct{}{}
			}
		}
	}

	for _, symbol := range anchorSymbolMap {
		refs, err := s.GetReferences(ctx, req.SnapshotID, symbol.Name, symbol.Language, req.Limit)
		if err == nil {
			pack.References = append(pack.References, refs...)
			for _, ref := range refs {
				fileSet[ref.FilePath] = struct{}{}
				chunk, err := s.GetChunk(ctx, req.SnapshotID, ref.ChunkID, "", 0)
				if err == nil {
					addSupportingChunk(*chunk)
				}
			}
		}
		callers, err := s.GetCallers(ctx, req.SnapshotID, symbol.Name, symbol.Language, req.Limit)
		if err == nil {
			pack.Callers = append(pack.Callers, callers...)
			for _, caller := range callers {
				fileSet[caller.CallerFilePath] = struct{}{}
				chunk, err := s.GetChunk(ctx, req.SnapshotID, caller.CallerChunkID, "", 0)
				if err == nil {
					addSupportingChunk(*chunk)
				}
			}
		}
		callees, err := s.GetCallees(ctx, req.SnapshotID, symbol.SymbolID, "", req.Limit)
		if err == nil {
			pack.Callees = append(pack.Callees, callees...)
			for _, callee := range callees {
				fileSet[callee.CallerFilePath] = struct{}{}
			}
		}
	}

	testTerms := make([]string, 0)
	for _, symbol := range anchorSymbolMap {
		testTerms = append(testTerms, symbol.Name)
	}
	for _, chunk := range anchorChunkMap {
		testTerms = append(testTerms, baseStem(chunk.FilePath))
	}
	for _, caller := range pack.Callers {
		testTerms = append(testTerms, caller.CallerName)
		testTerms = append(testTerms, baseStem(caller.CallerFilePath))
	}
	for _, callee := range pack.Callees {
		testTerms = append(testTerms, callee.CalleeName)
	}
	for _, hit := range pack.SearchHits {
		testTerms = append(testTerms, baseStem(hit.FilePath))
	}
	tests, err := s.GetTestsImpact(ctx, req.SnapshotID, testTerms, req.Limit)
	if err == nil {
		pack.Tests = tests
		for _, test := range tests {
			fileSet[test.FilePath] = struct{}{}
		}
	}

	pack.AnchorChunks = sortChunks(anchorChunkMap)
	pack.AnchorSymbols = sortSymbols(anchorSymbolMap)
	pack.SupportingChunks = sortChunks(supportingChunkMap)
	pack.SupportingFiles = sortFileSet(fileSet)
	pack.References = dedupeReferences(pack.References)
	pack.Callers = dedupeCalls(pack.Callers)
	pack.Callees = dedupeCalls(pack.Callees)
	pack.Imports = dedupeImports(pack.Imports)

	return pack, nil
}

func sortChunks(chunks map[string]ChunkRecord) []ChunkRecord {
	out := make([]ChunkRecord, 0, len(chunks))
	for _, chunk := range chunks {
		out = append(out, chunk)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].FilePath != out[j].FilePath {
			return out[i].FilePath < out[j].FilePath
		}
		return out[i].StartLine < out[j].StartLine
	})
	return out
}

func sortSymbols(symbols map[string]SymbolRecord) []SymbolRecord {
	out := make([]SymbolRecord, 0, len(symbols))
	for _, symbol := range symbols {
		out = append(out, symbol)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].FilePath != out[j].FilePath {
			return out[i].FilePath < out[j].FilePath
		}
		return out[i].StartLine < out[j].StartLine
	})
	return out
}

func sortFileSet(fileSet map[string]struct{}) []string {
	out := make([]string, 0, len(fileSet))
	for path := range fileSet {
		out = append(out, path)
	}
	sort.Strings(out)
	return out
}

func dedupeImports(imports []ImportRecord) []ImportRecord {
	seen := map[string]struct{}{}
	out := make([]ImportRecord, 0, len(imports))
	for _, imp := range imports {
		key := imp.FilePath + "\x00" + imp.ImportPath + "\x00" + imp.ImportKind
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, imp)
	}
	return out
}

func dedupeReferences(refs []ReferenceRecord) []ReferenceRecord {
	seen := map[string]struct{}{}
	out := make([]ReferenceRecord, 0, len(refs))
	for _, ref := range refs {
		key := fmt.Sprintf("%s:%s:%d:%s", ref.FilePath, ref.ChunkID, ref.StartLine, ref.SymbolName)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, ref)
	}
	return out
}

func dedupeCalls(calls []CallRecord) []CallRecord {
	seen := map[string]struct{}{}
	out := make([]CallRecord, 0, len(calls))
	for _, call := range calls {
		key := fmt.Sprintf("%s:%s:%s:%d", call.CallerFilePath, call.CallerChunkID, call.CalleeName, call.Line)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, call)
	}
	return out
}

func dedupeSearchHits(hits []SearchHit) []SearchHit {
	seen := map[string]struct{}{}
	out := make([]SearchHit, 0, len(hits))
	for _, hit := range hits {
		key := hit.ChunkID
		if key == "" {
			key = hit.FilePath + ":" + hit.Name
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, hit)
	}
	return out
}

func filterGuideSearchHits(hits []SearchHit) []SearchHit {
	out := make([]SearchHit, 0, len(hits))
	for _, hit := range hits {
		if hit.Classification != "" && hit.Classification != "source" && hit.Classification != "text" {
			continue
		}
		if isLowSignalGuidePath(hit.FilePath) {
			continue
		}
		out = append(out, hit)
	}
	return out
}

func (s *Service) planGuideSearch(ctx context.Context, snapshotID string, query string, limit int) plannedGuideSearch {
	probes := buildGuideQueryProbes(query)
	if len(probes) == 0 {
		search, err := s.SearchSemantic(ctx, snapshotID, query, limit)
		if err != nil {
			return plannedGuideSearch{}
		}
		filtered := dedupeSearchHits(filterGuideSearchHits(search.Hits))
		return plannedGuideSearch{SearchHits: filtered}
	}

	perProbeLimit := minInt(12, maxInt(6, limit))
	candidates := make([]guideSearchCandidate, 0)
	anchorHits := make([]SearchHit, 0)
	selectedAnchorFiles := map[string]struct{}{}
	for _, probe := range probes {
		probeCandidates := make([]guideSearchCandidate, 0, perProbeLimit*2)
		pathHits, err := s.searchGuidePathHits(ctx, snapshotID, probe, perProbeLimit)
		if err == nil {
			for idx, hit := range pathHits {
				score := scoreGuideSearchHit(probe, hit, idx) + 40
				if score <= 0 {
					continue
				}
				candidate := guideSearchCandidate{
					Hit:   hit,
					Probe: probe,
					Score: score,
					Rank:  idx,
				}
				candidates = append(candidates, candidate)
				probeCandidates = append(probeCandidates, candidate)
			}
		}

		search, err := s.SearchSemantic(ctx, snapshotID, probe, perProbeLimit)
		if err == nil {
			for idx, hit := range search.Hits {
				score := scoreGuideSearchHit(probe, hit, idx)
				if score <= 0 {
					continue
				}
				candidate := guideSearchCandidate{
					Hit:   hit,
					Probe: probe,
					Score: score,
					Rank:  idx,
				}
				candidates = append(candidates, candidate)
				probeCandidates = append(probeCandidates, candidate)
			}
		}
		sort.SliceStable(probeCandidates, func(i, j int) bool {
			if probeCandidates[i].Score != probeCandidates[j].Score {
				return probeCandidates[i].Score > probeCandidates[j].Score
			}
			if probeCandidates[i].Hit.FilePath != probeCandidates[j].Hit.FilePath {
				return probeCandidates[i].Hit.FilePath < probeCandidates[j].Hit.FilePath
			}
			return probeCandidates[i].Hit.StartLine < probeCandidates[j].Hit.StartLine
		})
		for _, candidate := range probeCandidates {
			if isGuideAnchorCandidatePath(candidate.Hit.FilePath) {
				continue
			}
			if _, ok := selectedAnchorFiles[candidate.Hit.FilePath]; ok {
				continue
			}
			selectedAnchorFiles[candidate.Hit.FilePath] = struct{}{}
			anchorHits = append(anchorHits, candidate.Hit)
			break
		}
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].Score != candidates[j].Score {
			return candidates[i].Score > candidates[j].Score
		}
		if candidates[i].Hit.FilePath != candidates[j].Hit.FilePath {
			return candidates[i].Hit.FilePath < candidates[j].Hit.FilePath
		}
		return candidates[i].Hit.StartLine < candidates[j].Hit.StartLine
	})

	hits := make([]SearchHit, 0, len(candidates))
	for _, candidate := range candidates {
		hits = append(hits, candidate.Hit)
	}
	filtered := dedupeSearchHits(hits)
	if len(anchorHits) == 0 {
		for _, hit := range filtered {
			if isGuideAnchorCandidatePath(hit.FilePath) {
				continue
			}
			anchorHits = append(anchorHits, hit)
			if len(anchorHits) >= minInt(4, maxInt(2, limit/3+1)) {
				break
			}
		}
	}
	return plannedGuideSearch{
		AnchorHits: dedupeSearchHits(anchorHits),
		SearchHits: filtered,
	}
}

func (s *Service) searchGuidePathHits(ctx context.Context, snapshotID string, probe string, limit int) ([]SearchHit, error) {
	if limit <= 0 {
		limit = 10
	}
	normalized := normalizeGuideProbe(probe)
	if normalized == "" {
		return nil, nil
	}
	variants := []string{
		normalized,
		strings.ReplaceAll(normalized, " ", "_"),
		strings.ReplaceAll(normalized, " ", ""),
	}
	seen := map[string]struct{}{}
	conditions := make([]string, 0, len(variants)*2)
	args := []interface{}{snapshotID}
	for _, variant := range variants {
		if variant == "" {
			continue
		}
		if _, ok := seen[variant]; ok {
			continue
		}
		seen[variant] = struct{}{}
		pattern := "%" + strings.ToLower(variant) + "%"
		conditions = append(conditions, "lower(c.file_path) LIKE ?")
		args = append(args, pattern)
		conditions = append(conditions, "lower(c.name) LIKE ?")
		args = append(args, pattern)
	}
	if len(conditions) == 0 {
		return nil, nil
	}
	args = append(args, limit)

	rows, err := s.db.QueryContext(ctx, `
		SELECT c.chunk_id, c.file_path, c.language, f.classification, c.kind, c.name, c.start_line, c.end_line, 0.0 AS score, substr(c.content, 1, 500)
		FROM code_chunks c
		JOIN code_files f ON f.snapshot_id = c.snapshot_id AND f.file_path = c.file_path
		WHERE c.snapshot_id = ? AND (`+strings.Join(conditions, " OR ")+`)
		ORDER BY c.file_path ASC, c.start_line ASC
		LIMIT ?
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	hits := make([]SearchHit, 0)
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
	return dedupeSearchHits(hits), nil
}

func (s *Service) resolveGuideAnchorChunk(ctx context.Context, snapshotID string, hit SearchHit) (*ChunkRecord, error) {
	chunk, err := s.GetChunk(ctx, snapshotID, hit.ChunkID, "", 0)
	if err != nil {
		return nil, err
	}
	if chunk.Kind != "preamble" && chunk.Kind != "file" {
		return chunk, nil
	}

	var replacement ChunkRecord
	err = s.db.QueryRowContext(ctx, `
		SELECT snapshot_id, chunk_id, file_path, language, kind, name, start_line, end_line, content, context_json
		FROM code_chunks
		WHERE snapshot_id = ? AND file_path = ? AND kind NOT IN ('file', 'preamble')
		ORDER BY start_line ASC
		LIMIT 1
	`, snapshotID, chunk.FilePath).Scan(
		&replacement.SnapshotID,
		&replacement.ChunkID,
		&replacement.FilePath,
		&replacement.Language,
		&replacement.Kind,
		&replacement.Name,
		&replacement.StartLine,
		&replacement.EndLine,
		&replacement.Content,
		&replacement.ContextJSON,
	)
	if err == nil {
		return &replacement, nil
	}
	if err == sql.ErrNoRows {
		return chunk, nil
	}
	return nil, err
}

func scoreGuideSearchHit(probe string, hit SearchHit, rank int) int {
	if hit.Classification != "" && hit.Classification != "source" && hit.Classification != "text" {
		return -1
	}
	if isLowSignalGuidePath(hit.FilePath) {
		return -1
	}

	score := 120 - rank*10
	if isGuideTestPath(hit.FilePath) {
		score -= 50
	}
	if isGuideMigrationPath(hit.FilePath) {
		score -= 40
	}

	normalizedProbe := normalizeGuideProbe(probe)
	probeTokens := guideQueryTokens(probe)
	searchSpace := strings.ToLower(filepath.ToSlash(hit.FilePath) + " " + hit.Name)
	probeStem := strings.ReplaceAll(normalizedProbe, " ", "_")
	fileStem := strings.ToLower(baseStem(hit.FilePath))
	pathSegments := strings.Split(strings.ToLower(filepath.ToSlash(filepath.Dir(hit.FilePath))), "/")

	if fileStem == probeStem {
		score += 140
	}
	if len(probeTokens) == 1 && fileStem == probeTokens[0] {
		score += 120
	}
	if len(probeTokens) > 0 {
		lastToken := probeTokens[len(probeTokens)-1]
		if fileStem == lastToken {
			score += 90
		}
		for _, segment := range pathSegments {
			if segment == probeStem || segment == lastToken {
				score += 70
				break
			}
		}
	}

	if normalizedProbe != "" && strings.Contains(searchSpace, probeStem) {
		score += 80
	}
	if normalizedProbe != "" && strings.Contains(searchSpace, normalizedProbe) {
		score += 60
	}
	if strings.Contains(searchSpace, strings.ReplaceAll(normalizedProbe, " ", "")) {
		score += 30
	}

	matchedTerms := 0
	for _, token := range probeTokens {
		if strings.Contains(searchSpace, token) {
			matchedTerms++
		}
	}
	if matchedTerms == len(probeTokens) && len(probeTokens) > 1 {
		score += 40
	}
	score += matchedTerms * 10

	switch hit.Kind {
	case "def", "class", "method", "func", "preamble":
		score += 10
	}

	return score
}

func buildGuideQueryProbes(query string) []string {
	lower := normalizeGuideProbe(query)
	if lower == "" {
		return nil
	}
	probes := make([]string, 0)
	seen := map[string]struct{}{}
	matchedPhraseExpansion := false
	add := func(items ...string) {
		for _, item := range items {
			item = normalizeGuideProbe(item)
			if item == "" {
				continue
			}
			if _, ok := seen[item]; ok {
				continue
			}
			seen[item] = struct{}{}
			probes = append(probes, item)
		}
	}

	for phrase, expansions := range guideProbePhraseExpansions {
		if strings.Contains(lower, phrase) {
			matchedPhraseExpansion = true
			add(expansions...)
		}
	}

	if matchedPhraseExpansion {
		return probes
	}

	tokens := guideQueryTokens(lower)
	for size := 3; size >= 1; size-- {
		for start := 0; start+size <= len(tokens); start++ {
			window := tokens[start : start+size]
			if !windowHasGuideDomainTerm(window) {
				continue
			}
			if windowAllStopwords(window) {
				continue
			}
			phrase := strings.Join(window, " ")
			add(phrase)
			if size > 1 {
				add(strings.Join(window, "_"))
			} else {
				add(singularGuideToken(window[0]))
			}
		}
	}

	add(lower)
	return probes
}

func normalizeGuideProbe(query string) string {
	lower := strings.ToLower(query)
	lower = strings.NewReplacer("-", " ", "_", " ", "/", " ", ".", " ", ",", " ", "?", " ", "!", " ", ":", " ", ";", " ", "(", " ", ")", " ", "\"", " ", "'", " ").Replace(lower)
	return strings.Join(strings.Fields(lower), " ")
}

func guideQueryTokens(query string) []string {
	lower := normalizeGuideProbe(query)
	if lower == "" {
		return nil
	}
	raw := strings.Fields(lower)
	out := make([]string, 0, len(raw))
	for _, token := range raw {
		if token == "" {
			continue
		}
		out = append(out, token)
	}
	return out
}

func windowHasGuideDomainTerm(tokens []string) bool {
	for _, token := range tokens {
		if _, ok := guideDomainTerms[token]; ok {
			return true
		}
		if _, ok := guideDomainTerms[singularGuideToken(token)]; ok {
			return true
		}
	}
	return false
}

func windowAllStopwords(tokens []string) bool {
	for _, token := range tokens {
		if _, ok := guideStopwords[token]; !ok {
			return false
		}
	}
	return true
}

func singularGuideToken(token string) string {
	if len(token) > 4 && strings.HasSuffix(token, "ies") {
		return strings.TrimSuffix(token, "ies") + "y"
	}
	if len(token) > 4 && strings.HasSuffix(token, "s") {
		return strings.TrimSuffix(token, "s")
	}
	return token
}

func isGuideAnchorCandidatePath(path string) bool {
	return isGuideTestPath(path) || isGuideMigrationPath(path) || isLowSignalGuidePath(path)
}

func isGuideTestPath(path string) bool {
	lower := strings.ToLower(filepath.ToSlash(path))
	return strings.HasPrefix(lower, "tests/") || strings.Contains(lower, "/tests/") || strings.HasSuffix(lower, "_test.go") || strings.Contains(lower, "test_")
}

func isGuideMigrationPath(path string) bool {
	lower := strings.ToLower(filepath.ToSlash(path))
	return strings.HasPrefix(lower, "migrations/") || strings.Contains(lower, "/migrations/") || strings.Contains(lower, "/versions/")
}

func isLowSignalGuidePath(path string) bool {
	lower := strings.ToLower(filepath.ToSlash(path))
	lowSignalMarkers := []string{
		"/static/",
		"/assets/",
		"/plugins/",
		"/public/",
		"/dist/",
		"/build/",
		"/node_modules/",
		"/vendor/",
		"/coverage/",
	}
	for _, marker := range lowSignalMarkers {
		if strings.Contains(lower, marker) || strings.HasPrefix(lower, strings.TrimPrefix(marker, "/")) {
			return true
		}
	}
	return false
}

func minInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a int, b int) int {
	if a > b {
		return a
	}
	return b
}
