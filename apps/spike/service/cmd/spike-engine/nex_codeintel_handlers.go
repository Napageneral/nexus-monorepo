package main

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"github.com/Napageneral/spike/internal/codeintel"
)

type codeIntelBackend struct {
	Language string `json:"language,omitempty"`
	Engine   string `json:"engine"`
	Version  string `json:"version,omitempty"`
}

type codeIntelToolResponse struct {
	OK          bool             `json:"ok"`
	SnapshotID  string           `json:"snapshot_id,omitempty"`
	Tool        string           `json:"tool"`
	Status      string           `json:"status"`
	Backend     codeIntelBackend `json:"backend"`
	Warnings    []string         `json:"warnings"`
	Limitations []string         `json:"limitations"`
	Result      interface{}      `json:"result,omitempty"`
}

func (s *oracleServer) codeIntelService() (*codeintel.Service, error) {
	if s.spikeStore == nil {
		return nil, fmt.Errorf("spike store is not configured")
	}
	return codeintel.New(s.spikeStore.DB())
}

func (s *oracleServer) codeIntelEnvelope(ctx context.Context, svc *codeintel.Service, snapshotID string, language string, tool string, result interface{}) (*codeIntelToolResponse, error) {
	status := "complete"
	backend := codeIntelBackend{
		Language: strings.TrimSpace(language),
		Engine:   defaultCodeIntelEngine(tool, language),
		Version:  "v1",
	}
	limitations := []string{}
	if strings.TrimSpace(snapshotID) != "" && strings.TrimSpace(language) != "" {
		capability, err := svc.GetCapability(ctx, snapshotID, language, tool)
		if err != nil {
			return nil, err
		}
		if capability != nil {
			if strings.TrimSpace(capability.Status) != "" {
				status = capability.Status
			}
			if strings.TrimSpace(capability.Backend) != "" {
				backend.Engine = capability.Backend
			}
			limitations = decodeCapabilityLimitations(capability.DetailsJSON)
		}
	}
	return &codeIntelToolResponse{
		OK:          true,
		SnapshotID:  snapshotID,
		Tool:        tool,
		Status:      status,
		Backend:     backend,
		Warnings:    []string{},
		Limitations: limitations,
		Result:      result,
	}, nil
}

func defaultCodeIntelEngine(tool string, language string) string {
	switch tool {
	case "index.build", "index.status":
		return "code-index"
	case "search.semantic":
		return "sqlite-fts5"
	case "source.file":
		return "inventory"
	case "context.pack":
		return "code-pack"
	case "tests.impact":
		return "test-impact"
	case "guide.build":
		return "guide-builder"
	}
	switch strings.TrimSpace(language) {
	case "go":
		return "go/ast"
	case "typescript":
		return "typescript/top-level"
	case "python":
		return "python/top-level"
	case "c":
		return "c/top-level"
	default:
		return "inventory"
	}
}

func decodeCapabilityLimitations(detailsJSON string) []string {
	detailsJSON = strings.TrimSpace(detailsJSON)
	if detailsJSON == "" || detailsJSON == "{}" {
		return []string{}
	}
	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(detailsJSON), &raw); err != nil {
		return []string{detailsJSON}
	}
	if reason, ok := raw["reason"].(string); ok && strings.TrimSpace(reason) != "" {
		return []string{strings.TrimSpace(reason)}
	}
	keys := make([]string, 0, len(raw))
	for key := range raw {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	limitations := make([]string, 0, len(keys))
	for _, key := range keys {
		limitations = append(limitations, fmt.Sprintf("%s=%v", key, raw[key]))
	}
	return limitations
}

func codeIntelBaseStem(path string) string {
	base := filepath.Base(path)
	base = strings.TrimSuffix(base, filepath.Ext(base))
	base = strings.TrimPrefix(base, "test_")
	base = strings.TrimSuffix(base, "_test")
	return base
}

func (s *oracleServer) nexCodeIntelIndexBuild(p map[string]interface{}) (interface{}, error) {
	svc, err := s.codeIntelService()
	if err != nil {
		return nil, err
	}
	rootPath := payloadStr(p, "root_path")
	if rootPath == "" {
		return nil, fmt.Errorf("root_path is required")
	}
	result, err := svc.Build(context.Background(), codeintel.BuildRequest{
		SnapshotID: payloadStr(p, "snapshot_id"),
		RootPath:   rootPath,
	})
	if err != nil {
		return nil, err
	}
	return s.codeIntelEnvelope(context.Background(), svc, result.Snapshot.SnapshotID, "", "index.build", result)
}

func (s *oracleServer) nexCodeIntelIndexStatus(p map[string]interface{}) (interface{}, error) {
	svc, err := s.codeIntelService()
	if err != nil {
		return nil, err
	}
	snapshotID := payloadStr(p, "snapshot_id")
	if snapshotID == "" {
		return nil, fmt.Errorf("snapshot_id is required")
	}
	snapshot, err := svc.GetSnapshot(context.Background(), snapshotID)
	if err != nil {
		return nil, err
	}
	capabilities, err := svc.GetCapabilities(context.Background(), snapshotID)
	if err != nil {
		return nil, err
	}
	return s.codeIntelEnvelope(context.Background(), svc, snapshotID, "", "index.status", map[string]interface{}{
		"snapshot":     snapshot,
		"capabilities": capabilities,
	})
}

func (s *oracleServer) nexCodeIntelSourceFile(p map[string]interface{}) (interface{}, error) {
	svc, err := s.codeIntelService()
	if err != nil {
		return nil, err
	}
	snapshotID := payloadStr(p, "snapshot_id")
	path := payloadStr(p, "path")
	if snapshotID == "" || path == "" {
		return nil, fmt.Errorf("snapshot_id and path are required")
	}
	file, err := svc.GetFile(context.Background(), snapshotID, path, payloadBool(p, "include_source"))
	if err != nil {
		return nil, err
	}
	return s.codeIntelEnvelope(context.Background(), svc, snapshotID, file.Language, "source.file", file)
}

func (s *oracleServer) nexCodeIntelSourceChunk(p map[string]interface{}) (interface{}, error) {
	svc, err := s.codeIntelService()
	if err != nil {
		return nil, err
	}
	snapshotID := payloadStr(p, "snapshot_id")
	if snapshotID == "" {
		return nil, fmt.Errorf("snapshot_id is required")
	}
	chunk, err := svc.GetChunk(
		context.Background(),
		snapshotID,
		payloadStr(p, "target_id"),
		payloadStr(p, "path"),
		payloadInt(p, "line", 0),
	)
	if err != nil {
		return nil, err
	}
	return s.codeIntelEnvelope(context.Background(), svc, snapshotID, chunk.Language, "source.chunk", chunk)
}

func (s *oracleServer) nexCodeIntelSourceContext(p map[string]interface{}) (interface{}, error) {
	svc, err := s.codeIntelService()
	if err != nil {
		return nil, err
	}
	snapshotID := payloadStr(p, "snapshot_id")
	if snapshotID == "" {
		return nil, fmt.Errorf("snapshot_id is required")
	}
	ctxPack, err := svc.GetContext(
		context.Background(),
		snapshotID,
		payloadStr(p, "target_id"),
		payloadStr(p, "path"),
		payloadInt(p, "line", 0),
	)
	if err != nil {
		return nil, err
	}
	return s.codeIntelEnvelope(context.Background(), svc, snapshotID, ctxPack.Anchor.Language, "source.context", ctxPack)
}

func (s *oracleServer) nexCodeIntelSymbolResolve(p map[string]interface{}) (interface{}, error) {
	svc, err := s.codeIntelService()
	if err != nil {
		return nil, err
	}
	snapshotID := payloadStr(p, "snapshot_id")
	query := payloadStr(p, "symbol_query")
	if query == "" {
		query = payloadStr(p, "query")
	}
	if snapshotID == "" || query == "" {
		return nil, fmt.Errorf("snapshot_id and symbol_query are required")
	}
	language := payloadStr(p, "language")
	limit := payloadInt(p, "limit", 10)
	symbols, err := svc.ResolveSymbol(context.Background(), snapshotID, query, language, limit)
	if err != nil {
		return nil, err
	}
	return s.codeIntelEnvelope(context.Background(), svc, snapshotID, language, "symbol.resolve", map[string]interface{}{
		"query":   query,
		"symbols": symbols,
	})
}

func (s *oracleServer) resolveCodeIntelSymbolTarget(ctx context.Context, svc *codeintel.Service, snapshotID string, targetID string, symbolQuery string, language string) (*codeintel.SymbolRecord, string, error) {
	targetID = strings.TrimSpace(targetID)
	symbolQuery = strings.TrimSpace(symbolQuery)
	language = strings.TrimSpace(language)
	if targetID != "" {
		symbol, err := svc.GetSymbolByID(ctx, snapshotID, targetID)
		if err != nil {
			return nil, "", err
		}
		return symbol, symbol.Name, nil
	}
	if symbolQuery == "" {
		return nil, "", fmt.Errorf("symbol_query or target_id is required")
	}
	symbols, err := svc.ResolveSymbol(ctx, snapshotID, symbolQuery, language, 1)
	if err != nil {
		return nil, "", err
	}
	if len(symbols) == 0 {
		return nil, "", fmt.Errorf("symbol not found: %s", symbolQuery)
	}
	return &symbols[0], symbols[0].Name, nil
}

func (s *oracleServer) nexCodeIntelSymbolReferences(p map[string]interface{}) (interface{}, error) {
	svc, err := s.codeIntelService()
	if err != nil {
		return nil, err
	}
	snapshotID := payloadStr(p, "snapshot_id")
	if snapshotID == "" {
		return nil, fmt.Errorf("snapshot_id is required")
	}
	symbol, symbolName, err := s.resolveCodeIntelSymbolTarget(
		context.Background(),
		svc,
		snapshotID,
		payloadStr(p, "target_id"),
		payloadStr(p, "symbol_query"),
		payloadStr(p, "language"),
	)
	if err != nil {
		return nil, err
	}
	refs, err := svc.GetReferences(context.Background(), snapshotID, symbolName, symbol.Language, payloadInt(p, "limit", 20))
	if err != nil {
		return nil, err
	}
	return s.codeIntelEnvelope(context.Background(), svc, snapshotID, symbol.Language, "symbol.references", map[string]interface{}{
		"symbol":     symbol,
		"references": refs,
	})
}

func (s *oracleServer) nexCodeIntelGraphImports(p map[string]interface{}) (interface{}, error) {
	svc, err := s.codeIntelService()
	if err != nil {
		return nil, err
	}
	snapshotID := payloadStr(p, "snapshot_id")
	path := payloadStr(p, "path")
	if snapshotID == "" || path == "" {
		return nil, fmt.Errorf("snapshot_id and path are required")
	}
	file, err := svc.GetFile(context.Background(), snapshotID, path, false)
	if err != nil {
		return nil, err
	}
	imports, err := svc.GetImports(context.Background(), snapshotID, path)
	if err != nil {
		return nil, err
	}
	return s.codeIntelEnvelope(context.Background(), svc, snapshotID, file.Language, "graph.imports", map[string]interface{}{
		"path":    path,
		"imports": imports,
	})
}

func (s *oracleServer) nexCodeIntelGraphImporters(p map[string]interface{}) (interface{}, error) {
	svc, err := s.codeIntelService()
	if err != nil {
		return nil, err
	}
	snapshotID := payloadStr(p, "snapshot_id")
	importPath := payloadStr(p, "import_path")
	if importPath == "" {
		importPath = payloadStr(p, "path")
	}
	if snapshotID == "" || importPath == "" {
		return nil, fmt.Errorf("snapshot_id and import_path are required")
	}
	importers, err := svc.GetImporters(context.Background(), snapshotID, importPath)
	if err != nil {
		return nil, err
	}
	language := ""
	if len(importers) > 0 {
		language = importers[0].Language
	}
	return s.codeIntelEnvelope(context.Background(), svc, snapshotID, language, "graph.importers", map[string]interface{}{
		"import_path": importPath,
		"importers":   importers,
	})
}

func (s *oracleServer) nexCodeIntelGraphCallers(p map[string]interface{}) (interface{}, error) {
	svc, err := s.codeIntelService()
	if err != nil {
		return nil, err
	}
	snapshotID := payloadStr(p, "snapshot_id")
	if snapshotID == "" {
		return nil, fmt.Errorf("snapshot_id is required")
	}
	symbol, symbolName, err := s.resolveCodeIntelSymbolTarget(
		context.Background(),
		svc,
		snapshotID,
		payloadStr(p, "target_id"),
		payloadStr(p, "symbol_query"),
		payloadStr(p, "language"),
	)
	if err != nil {
		return nil, err
	}
	callers, err := svc.GetCallers(context.Background(), snapshotID, symbolName, symbol.Language, payloadInt(p, "limit", 20))
	if err != nil {
		return nil, err
	}
	return s.codeIntelEnvelope(context.Background(), svc, snapshotID, symbol.Language, "graph.callers", map[string]interface{}{
		"symbol":  symbol,
		"callers": callers,
	})
}

func (s *oracleServer) nexCodeIntelGraphCallees(p map[string]interface{}) (interface{}, error) {
	svc, err := s.codeIntelService()
	if err != nil {
		return nil, err
	}
	snapshotID := payloadStr(p, "snapshot_id")
	if snapshotID == "" {
		return nil, fmt.Errorf("snapshot_id is required")
	}
	limit := payloadInt(p, "limit", 20)
	var language string
	var caller interface{}
	var callees []codeintel.CallRecord

	targetID := payloadStr(p, "target_id")
	if targetID != "" {
		if symbol, err := svc.GetSymbolByID(context.Background(), snapshotID, targetID); err == nil {
			language = symbol.Language
			caller = symbol
			callees, err = svc.GetCallees(context.Background(), snapshotID, symbol.SymbolID, "", limit)
			if err != nil {
				return nil, err
			}
		} else {
			chunk, chunkErr := svc.GetChunk(context.Background(), snapshotID, targetID, "", 0)
			if chunkErr != nil {
				return nil, err
			}
			language = chunk.Language
			caller = chunk
			callees, err = svc.GetCallees(context.Background(), snapshotID, "", chunk.ChunkID, limit)
			if err != nil {
				return nil, err
			}
		}
	} else if path := payloadStr(p, "path"); path != "" {
		chunk, err := svc.GetChunk(context.Background(), snapshotID, "", path, payloadInt(p, "line", 0))
		if err != nil {
			return nil, err
		}
		language = chunk.Language
		caller = chunk
		callees, err = svc.GetCallees(context.Background(), snapshotID, "", chunk.ChunkID, limit)
		if err != nil {
			return nil, err
		}
	} else if symbolQuery := payloadStr(p, "symbol_query"); symbolQuery != "" {
		symbol, _, err := s.resolveCodeIntelSymbolTarget(
			context.Background(),
			svc,
			snapshotID,
			"",
			symbolQuery,
			payloadStr(p, "language"),
		)
		if err != nil {
			return nil, err
		}
		language = symbol.Language
		caller = symbol
		callees, err = svc.GetCallees(context.Background(), snapshotID, symbol.SymbolID, "", limit)
		if err != nil {
			return nil, err
		}
	} else {
		return nil, fmt.Errorf("target_id, path, or symbol_query is required")
	}

	return s.codeIntelEnvelope(context.Background(), svc, snapshotID, language, "graph.callees", map[string]interface{}{
		"caller":  caller,
		"callees": callees,
	})
}

func (s *oracleServer) nexCodeIntelSearchSemantic(p map[string]interface{}) (interface{}, error) {
	svc, err := s.codeIntelService()
	if err != nil {
		return nil, err
	}
	snapshotID := payloadStr(p, "snapshot_id")
	query := payloadStr(p, "query")
	if snapshotID == "" || query == "" {
		return nil, fmt.Errorf("snapshot_id and query are required")
	}
	result, err := svc.SearchSemantic(context.Background(), snapshotID, query, payloadInt(p, "limit", 10))
	if err != nil {
		return nil, err
	}
	return s.codeIntelEnvelope(context.Background(), svc, snapshotID, "", "search.semantic", result)
}

func (s *oracleServer) nexCodeIntelContextPack(p map[string]interface{}) (interface{}, error) {
	svc, err := s.codeIntelService()
	if err != nil {
		return nil, err
	}
	req := codeintel.ContextPackRequest{
		SnapshotID:  payloadStr(p, "snapshot_id"),
		Query:       payloadStr(p, "query"),
		SymbolQuery: payloadStr(p, "symbol_query"),
		TargetID:    payloadStr(p, "target_id"),
		Path:        payloadStr(p, "path"),
		Line:        payloadInt(p, "line", 0),
		Limit:       payloadInt(p, "limit", 10),
	}
	pack, err := svc.BuildContextPack(context.Background(), req)
	if err != nil {
		return nil, err
	}
	language := ""
	if len(pack.AnchorSymbols) > 0 {
		language = pack.AnchorSymbols[0].Language
	} else if len(pack.AnchorChunks) > 0 {
		language = pack.AnchorChunks[0].Language
	}
	return s.codeIntelEnvelope(context.Background(), svc, req.SnapshotID, language, "context.pack", pack)
}

func (s *oracleServer) nexCodeIntelTestsImpact(p map[string]interface{}) (interface{}, error) {
	svc, err := s.codeIntelService()
	if err != nil {
		return nil, err
	}
	snapshotID := payloadStr(p, "snapshot_id")
	if snapshotID == "" {
		return nil, fmt.Errorf("snapshot_id is required")
	}

	terms := []string{}
	language := payloadStr(p, "language")
	if targetID := payloadStr(p, "target_id"); targetID != "" {
		if symbol, err := svc.GetSymbolByID(context.Background(), snapshotID, targetID); err == nil {
			language = symbol.Language
			terms = append(terms, symbol.Name)
			terms = append(terms, codeIntelBaseStem(symbol.FilePath))
		} else if chunk, err := svc.GetChunk(context.Background(), snapshotID, targetID, "", 0); err == nil {
			language = chunk.Language
			terms = append(terms, chunk.Name)
			terms = append(terms, codeIntelBaseStem(chunk.FilePath))
		}
	}
	if symbolQuery := payloadStr(p, "symbol_query"); symbolQuery != "" {
		terms = append(terms, symbolQuery)
	}
	if path := payloadStr(p, "path"); path != "" {
		terms = append(terms, codeIntelBaseStem(path))
	}
	if query := payloadStr(p, "query"); query != "" {
		terms = append(terms, query)
	}

	tests, err := svc.GetTestsImpact(context.Background(), snapshotID, terms, payloadInt(p, "limit", 10))
	if err != nil {
		return nil, err
	}
	return s.codeIntelEnvelope(context.Background(), svc, snapshotID, language, "tests.impact", map[string]interface{}{
		"terms": terms,
		"tests": tests,
	})
}

func (s *oracleServer) nexGuidesBuild(p map[string]interface{}) (interface{}, error) {
	svc, err := s.codeIntelService()
	if err != nil {
		return nil, err
	}
	req := codeintel.GuideRequest{
		SnapshotID:  payloadStr(p, "snapshot_id"),
		Query:       payloadStr(p, "query"),
		SymbolQuery: payloadStr(p, "symbol_query"),
		TargetID:    payloadStr(p, "target_id"),
		Path:        payloadStr(p, "path"),
		Line:        payloadInt(p, "line", 0),
		Limit:       payloadInt(p, "limit", 10),
	}
	if strings.TrimSpace(req.SnapshotID) == "" {
		return nil, fmt.Errorf("snapshot_id is required")
	}
	guide, err := svc.BuildGuide(context.Background(), req)
	if err != nil {
		return nil, err
	}
	language := ""
	if len(guide.ContextPack.AnchorSymbols) > 0 {
		language = guide.ContextPack.AnchorSymbols[0].Language
	} else if len(guide.ContextPack.AnchorChunks) > 0 {
		language = guide.ContextPack.AnchorChunks[0].Language
	}
	return s.codeIntelEnvelope(context.Background(), svc, req.SnapshotID, language, "guide.build", guide)
}
