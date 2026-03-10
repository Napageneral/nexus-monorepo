package codeintel

type Snapshot struct {
	SnapshotID   string `json:"snapshot_id"`
	RepoID       string `json:"repo_id"`
	CommitSHA    string `json:"commit_sha"`
	RootPath     string `json:"root_path"`
	Status       string `json:"status"`
	IndexVersion int    `json:"index_version"`
	FileCount    int    `json:"file_count"`
	ChunkCount   int    `json:"chunk_count"`
	SymbolCount  int    `json:"symbol_count"`
	LastError    string `json:"last_error"`
	CreatedAt    int64  `json:"created_at"`
	UpdatedAt    int64  `json:"updated_at"`
}

type BuildRequest struct {
	SnapshotID string
	RootPath   string
}

type BuildResult struct {
	Snapshot     Snapshot           `json:"snapshot"`
	Languages    map[string]int     `json:"languages"`
	Capabilities []CapabilityRecord `json:"capabilities"`
}

type FileRecord struct {
	SnapshotID     string `json:"snapshot_id"`
	FilePath       string `json:"file_path"`
	Language       string `json:"language"`
	Classification string `json:"classification"`
	SizeBytes      int64  `json:"size_bytes"`
	Tokens         int    `json:"tokens"`
	Hash           string `json:"hash"`
	ParseStatus    string `json:"parse_status"`
	ChunkCount     int    `json:"chunk_count"`
	SymbolCount    int    `json:"symbol_count"`
}

type FileView struct {
	FileRecord
	RootPath string `json:"root_path"`
	Source   string `json:"source,omitempty"`
}

type ChunkRecord struct {
	SnapshotID  string `json:"snapshot_id"`
	ChunkID     string `json:"chunk_id"`
	FilePath    string `json:"file_path"`
	Language    string `json:"language"`
	Kind        string `json:"kind"`
	Name        string `json:"name"`
	StartLine   int    `json:"start_line"`
	EndLine     int    `json:"end_line"`
	Content     string `json:"content"`
	ContextJSON string `json:"context_json"`
}

type ChunkContext struct {
	Anchor   ChunkRecord  `json:"anchor"`
	Previous *ChunkRecord `json:"previous,omitempty"`
	Next     *ChunkRecord `json:"next,omitempty"`
}

type SymbolRecord struct {
	SnapshotID    string `json:"snapshot_id"`
	SymbolID      string `json:"symbol_id"`
	Name          string `json:"name"`
	QualifiedName string `json:"qualified_name"`
	Kind          string `json:"kind"`
	Language      string `json:"language"`
	FilePath      string `json:"file_path"`
	StartLine     int    `json:"start_line"`
	EndLine       int    `json:"end_line"`
	ChunkID       string `json:"chunk_id"`
}

type ImportRecord struct {
	SnapshotID string `json:"snapshot_id"`
	FilePath   string `json:"file_path"`
	Language   string `json:"language"`
	ImportPath string `json:"import_path"`
	ImportKind string `json:"import_kind"`
}

type CapabilityRecord struct {
	SnapshotID  string `json:"snapshot_id"`
	Language    string `json:"language"`
	Capability  string `json:"capability"`
	Status      string `json:"status"`
	Backend     string `json:"backend"`
	DetailsJSON string `json:"details_json"`
}

type SearchHit struct {
	ChunkID        string  `json:"chunk_id"`
	FilePath       string  `json:"file_path"`
	Language       string  `json:"language"`
	Classification string  `json:"classification,omitempty"`
	Kind           string  `json:"kind"`
	Name           string  `json:"name"`
	StartLine      int     `json:"start_line"`
	EndLine        int     `json:"end_line"`
	Score          float64 `json:"score"`
	Snippet        string  `json:"snippet"`
}

type SearchResult struct {
	Query string      `json:"query"`
	Hits  []SearchHit `json:"hits"`
}

type ReferenceRecord struct {
	SnapshotID    string `json:"snapshot_id"`
	SymbolID      string `json:"symbol_id,omitempty"`
	SymbolName    string `json:"symbol_name"`
	QualifiedName string `json:"qualified_name,omitempty"`
	Language      string `json:"language"`
	FilePath      string `json:"file_path"`
	ChunkID       string `json:"chunk_id"`
	StartLine     int    `json:"start_line"`
	EndLine       int    `json:"end_line"`
	ReferenceKind string `json:"reference_kind"`
}

type CallRecord struct {
	SnapshotID          string `json:"snapshot_id"`
	Language            string `json:"language"`
	CallerSymbolID      string `json:"caller_symbol_id,omitempty"`
	CallerName          string `json:"caller_name,omitempty"`
	CallerQualifiedName string `json:"caller_qualified_name,omitempty"`
	CallerFilePath      string `json:"caller_file_path"`
	CallerChunkID       string `json:"caller_chunk_id"`
	CalleeSymbolID      string `json:"callee_symbol_id,omitempty"`
	CalleeName          string `json:"callee_name"`
	CalleeQualifiedName string `json:"callee_qualified_name,omitempty"`
	Line                int    `json:"line"`
	CallKind            string `json:"call_kind"`
}

type ContextPackRequest struct {
	SnapshotID  string `json:"snapshot_id"`
	Query       string `json:"query,omitempty"`
	SymbolQuery string `json:"symbol_query,omitempty"`
	TargetID    string `json:"target_id,omitempty"`
	Path        string `json:"path,omitempty"`
	Line        int    `json:"line,omitempty"`
	Limit       int    `json:"limit,omitempty"`
}

type ContextPack struct {
	Query            string             `json:"query"`
	AnchorChunks     []ChunkRecord      `json:"anchor_chunks"`
	AnchorSymbols    []SymbolRecord     `json:"anchor_symbols"`
	SupportingChunks []ChunkRecord      `json:"supporting_chunks"`
	SupportingFiles  []string           `json:"supporting_files"`
	Imports          []ImportRecord     `json:"imports"`
	References       []ReferenceRecord  `json:"references"`
	Callers          []CallRecord       `json:"callers"`
	Callees          []CallRecord       `json:"callees"`
	Tests            []TestImpactRecord `json:"tests"`
	SearchHits       []SearchHit        `json:"search_hits"`
	Limitations      []string           `json:"limitations"`
}

type TestImpactRecord struct {
	FilePath   string   `json:"file_path"`
	Language   string   `json:"language"`
	MatchKind  string   `json:"match_kind"`
	MatchTerms []string `json:"match_terms"`
	Rationale  string   `json:"rationale"`
}

type GuideRequest struct {
	SnapshotID  string `json:"snapshot_id"`
	Query       string `json:"query,omitempty"`
	SymbolQuery string `json:"symbol_query,omitempty"`
	TargetID    string `json:"target_id,omitempty"`
	Path        string `json:"path,omitempty"`
	Line        int    `json:"line,omitempty"`
	Limit       int    `json:"limit,omitempty"`
}

type GuideFinding struct {
	Summary         string   `json:"summary"`
	EvidenceFiles   []string `json:"evidence_files,omitempty"`
	EvidenceSymbols []string `json:"evidence_symbols,omitempty"`
	EvidenceFlows   []string `json:"evidence_flows,omitempty"`
	EvidenceTests   []string `json:"evidence_tests,omitempty"`
}

type GuideArtifact struct {
	TaskUnderstanding               string         `json:"task_understanding"`
	ProvisionalAnswer               string         `json:"provisional_answer,omitempty"`
	EvidenceBackedFindings          []GuideFinding `json:"evidence_backed_findings"`
	RelevantFiles                   []string       `json:"relevant_files"`
	RelevantSymbols                 []string       `json:"relevant_symbols"`
	RelevantFlows                   []string       `json:"relevant_flows"`
	OpenUncertainties               []string       `json:"open_uncertainties"`
	RuntimeChecksForDownstreamAgent []string       `json:"runtime_checks_for_the_downstream_agent"`
	SuggestedHandoffPlan            []string       `json:"suggested_handoff_plan"`
	ContextPack                     ContextPack    `json:"context_pack"`
	GuideMarkdown                   string         `json:"guide_markdown"`
}
