package history

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/Napageneral/spike/internal/git"
)

type Options struct {
	RootPath         string
	StateDir         string
	MaxDepth         int
	BigBangThreshold int
	DB               *sql.DB
	ScopeKey         string
}

type analysisState struct {
	Version          int       `json:"version"`
	Head             string    `json:"head"`
	AnalyzedAt       time.Time `json:"analyzed_at"`
	MaxDepth         int       `json:"max_depth"`
	BigBangThreshold int       `json:"big_bang_threshold"`
}

type HistoryAgent struct {
	rootPath         string
	stateDir         string
	maxDepth         int
	bigBangThreshold int
	db               *sql.DB
	scopeKey         string

	mu sync.Mutex

	head     string
	coChange *CoChangeStats
	velocity *VelocityStats
	events   *StructuralEventsStats

	pairIndex map[string]map[string]int
}

func NewHistoryAgent(opts Options) (*HistoryAgent, error) {
	root, err := filepath.Abs(strings.TrimSpace(opts.RootPath))
	if err != nil {
		return nil, err
	}
	if root == "" {
		return nil, fmt.Errorf("rootPath is required")
	}
	stateDir := strings.TrimSpace(opts.StateDir)
	if stateDir == "" {
		stateDir = filepath.Join(root, ".intent", "terrain-history")
	}
	if !filepath.IsAbs(stateDir) {
		stateDir = filepath.Join(root, stateDir)
	}
	maxDepth := opts.MaxDepth
	if maxDepth <= 0 {
		maxDepth = 3
	}
	bigBang := opts.BigBangThreshold
	if bigBang <= 0 {
		bigBang = 200
	}

	return &HistoryAgent{
		rootPath:         root,
		stateDir:         stateDir,
		maxDepth:         maxDepth,
		bigBangThreshold: bigBang,
		db:               opts.DB,
		scopeKey:         strings.TrimSpace(opts.ScopeKey),
	}, nil
}

func (h *HistoryAgent) Analyze(ctx context.Context) error {
	_ = ctx

	h.mu.Lock()
	defer h.mu.Unlock()

	if !git.IsGitRepo(h.rootPath) {
		return nil
	}
	gitRoot, err := gitTopLevel(h.rootPath)
	if err != nil {
		return nil
	}
	head, err := gitHeadCommit(gitRoot)
	if err != nil {
		// No commits (or not a repo we can read).
		return nil
	}

	prev, _ := h.loadAnalysisState()
	if prev != nil &&
		strings.TrimSpace(prev.Head) == head &&
		prev.MaxDepth == h.maxDepth &&
		prev.BigBangThreshold == h.bigBangThreshold &&
		h.statsFilesExist() {
		// Fast path: nothing changed.
		h.head = head
		_ = h.loadStatsLocked()
		return nil
	}

	stats, err := computeStats(gitRoot, head, h.maxDepth, h.bigBangThreshold)
	if err != nil {
		return err
	}

	state := analysisState{
		Version:          currentVersion,
		Head:             head,
		AnalyzedAt:       time.Now().UTC(),
		MaxDepth:         h.maxDepth,
		BigBangThreshold: h.bigBangThreshold,
	}
	if h.db != nil {
		if err := h.saveHistoryJSONLocked("co-change", stats.coChange); err != nil {
			return err
		}
		if err := h.saveHistoryJSONLocked("velocity", stats.velocity); err != nil {
			return err
		}
		if err := h.saveHistoryJSONLocked("structural-events", stats.events); err != nil {
			return err
		}
		if err := h.saveHistoryJSONLocked("analysis-state", state); err != nil {
			return err
		}
	} else {
		if err := os.MkdirAll(filepath.Join(h.stateDir, "stats"), 0o755); err != nil {
			return err
		}
		if err := writeJSON(filepath.Join(h.stateDir, "stats", "co-change.json"), stats.coChange); err != nil {
			return err
		}
		if err := writeJSON(filepath.Join(h.stateDir, "stats", "velocity.json"), stats.velocity); err != nil {
			return err
		}
		if err := writeJSON(filepath.Join(h.stateDir, "stats", "structural-events.json"), stats.events); err != nil {
			return err
		}
		if err := writeJSON(filepath.Join(h.stateDir, "analysis-state.json"), state); err != nil {
			return err
		}
	}

	h.head = head
	h.coChange = stats.coChange
	h.velocity = stats.velocity
	h.events = stats.events
	h.pairIndex = nil
	return nil
}

func (h *HistoryAgent) Query(scope string) (*HistoryContext, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.coChange == nil || h.velocity == nil || h.events == nil {
		_ = h.loadStatsLocked()
	}
	if h.coChange == nil || h.velocity == nil || h.events == nil {
		return nil, nil
	}

	key := scopeKey(scope, h.maxDepth)
	if key == "" {
		key = "."
	}

	ctx := &HistoryContext{
		Scope:       canonicalScope(scope),
		Key:         key,
		Head:        h.coChange.Head,
		GeneratedAt: h.coChange.GeneratedAt,
	}

	// Co-change partners.
	partners := h.coChangePartnersLocked(key, 10)
	ctx.CoChange = partners

	// Velocity.
	if h.velocity.ByDir != nil {
		if v, ok := h.velocity.ByDir[key]; ok {
			copyV := v
			ctx.Velocity = &copyV
		}
	}

	// Structural events (most recent first).
	ctx.Events = filterEventsForScope(h.events.Events, key, 5)

	return ctx, nil
}

func (h *HistoryAgent) Coupling(a, b string) (float64, int, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.coChange == nil {
		_ = h.loadStatsLocked()
	}
	if h.coChange == nil {
		return 0, 0, false
	}

	ka := scopeKey(a, h.maxDepth)
	kb := scopeKey(b, h.maxDepth)
	if ka == "" || kb == "" || ka == kb {
		return 0, 0, false
	}

	co := h.pairCountLocked(ka, kb)
	if co <= 0 {
		return 0, 0, false
	}
	ca := h.coChange.DirCommitCounts[ka]
	cb := h.coChange.DirCommitCounts[kb]
	min := ca
	if cb < min {
		min = cb
	}
	if min <= 0 {
		return 0, co, true
	}
	// Overlap coefficient: co / min(freq_a, freq_b).
	return float64(co) / float64(min), co, true
}

func (h *HistoryAgent) statsFilesExist() bool {
	if h.db != nil {
		rows, err := h.db.Query(`SELECT key FROM history WHERE key IN (?, ?, ?)`,
			h.dbKey("co-change"),
			h.dbKey("velocity"),
			h.dbKey("structural-events"),
		)
		if err != nil {
			return false
		}
		defer rows.Close()
		seen := map[string]bool{}
		for rows.Next() {
			var key string
			if err := rows.Scan(&key); err != nil {
				return false
			}
			key = strings.TrimSpace(key)
			if key != "" {
				seen[key] = true
			}
		}
		return seen[h.dbKey("co-change")] && seen[h.dbKey("velocity")] && seen[h.dbKey("structural-events")]
	}

	for _, p := range []string{
		filepath.Join(h.stateDir, "stats", "co-change.json"),
		filepath.Join(h.stateDir, "stats", "velocity.json"),
		filepath.Join(h.stateDir, "stats", "structural-events.json"),
	} {
		if _, err := os.Stat(p); err != nil {
			return false
		}
	}
	return true
}

func (h *HistoryAgent) loadAnalysisState() (*analysisState, error) {
	if h.db != nil {
		var raw string
		if err := h.db.QueryRow(`SELECT data FROM history WHERE key=?`, h.dbKey("analysis-state")).Scan(&raw); err != nil {
			return nil, err
		}
		var st analysisState
		if err := json.Unmarshal([]byte(raw), &st); err != nil {
			return nil, err
		}
		return &st, nil
	}

	b, err := os.ReadFile(filepath.Join(h.stateDir, "analysis-state.json"))
	if err != nil {
		return nil, err
	}
	var st analysisState
	if err := json.Unmarshal(b, &st); err != nil {
		return nil, err
	}
	return &st, nil
}

func (h *HistoryAgent) loadStatsLocked() error {
	var (
		co  *CoChangeStats
		vel *VelocityStats
		ev  *StructuralEventsStats
		err error
	)
	if h.db != nil {
		co, err = loadHistoryJSON[CoChangeStats](h.db, h.dbKey("co-change"))
		if err != nil {
			return err
		}
		vel, err = loadHistoryJSON[VelocityStats](h.db, h.dbKey("velocity"))
		if err != nil {
			return err
		}
		ev, err = loadHistoryJSON[StructuralEventsStats](h.db, h.dbKey("structural-events"))
		if err != nil {
			return err
		}
	} else {
		co, err = readJSON[CoChangeStats](filepath.Join(h.stateDir, "stats", "co-change.json"))
		if err != nil {
			return err
		}
		vel, err = readJSON[VelocityStats](filepath.Join(h.stateDir, "stats", "velocity.json"))
		if err != nil {
			return err
		}
		ev, err = readJSON[StructuralEventsStats](filepath.Join(h.stateDir, "stats", "structural-events.json"))
		if err != nil {
			return err
		}
	}
	h.coChange = co
	h.velocity = vel
	h.events = ev
	h.head = strings.TrimSpace(co.Head)
	h.pairIndex = nil
	return nil
}

func loadHistoryJSON[T any](db *sql.DB, key string) (*T, error) {
	if db == nil {
		return nil, fmt.Errorf("history db not configured")
	}
	key = strings.TrimSpace(key)
	if key == "" {
		return nil, fmt.Errorf("history key is required")
	}
	var raw string
	if err := db.QueryRow(`SELECT data FROM history WHERE key=?`, key).Scan(&raw); err != nil {
		return nil, err
	}
	var out T
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (h *HistoryAgent) saveHistoryJSONLocked(key string, v any) error {
	if h == nil || h.db == nil {
		return fmt.Errorf("history db not configured")
	}
	key = strings.TrimSpace(key)
	if key == "" {
		return fmt.Errorf("history key is required")
	}
	key = h.dbKey(key)
	raw, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	_, err = h.db.Exec(
		`INSERT INTO history (key, data, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at;`,
		key,
		string(raw),
		time.Now().UTC().Format(time.RFC3339Nano),
	)
	return err
}

func (h *HistoryAgent) dbKey(suffix string) string {
	suffix = strings.TrimSpace(suffix)
	if suffix == "" {
		return ""
	}
	if h == nil {
		return suffix
	}
	scope := strings.TrimSpace(h.scopeKey)
	if scope == "" {
		return suffix
	}
	return "history:" + scope + ":" + suffix
}

func canonicalScope(scope string) string {
	scope = path.Clean(strings.TrimSpace(scope))
	scope = strings.TrimPrefix(scope, "./")
	if scope == "" || scope == "." {
		return "."
	}
	return scope
}

func scopeKey(scope string, depth int) string {
	scope = canonicalScope(scope)
	if scope == "." {
		return "."
	}
	parts := strings.Split(scope, "/")
	if depth > 0 && len(parts) > depth {
		parts = parts[:depth]
	}
	return path.Join(parts...)
}

func (h *HistoryAgent) pairCountLocked(a, b string) int {
	if a == "" || b == "" || a == b {
		return 0
	}
	if h.pairIndex == nil {
		h.pairIndex = map[string]map[string]int{}
		for _, p := range h.coChange.Pairs {
			aa := strings.TrimSpace(p.A)
			bb := strings.TrimSpace(p.B)
			if aa == "" || bb == "" || p.Co <= 0 {
				continue
			}
			m := h.pairIndex[aa]
			if m == nil {
				m = map[string]int{}
				h.pairIndex[aa] = m
			}
			m[bb] = p.Co
		}
	}
	if a > b {
		a, b = b, a
	}
	if m := h.pairIndex[a]; m != nil {
		return m[b]
	}
	return 0
}

func (h *HistoryAgent) coChangePartnersLocked(key string, limit int) []CouplingPartner {
	key = strings.TrimSpace(key)
	if key == "" || h.coChange == nil {
		return nil
	}
	countA := h.coChange.DirCommitCounts[key]
	if countA <= 0 {
		return nil
	}

	type scored struct {
		dir    string
		score  float64
		co     int
		countB int
	}

	scoredPartners := []scored{}
	for _, pair := range h.coChange.Pairs {
		a := pair.A
		b := pair.B
		if a != key && b != key {
			continue
		}
		other := b
		if a != key {
			other = a
		}
		countB := h.coChange.DirCommitCounts[other]
		score := 0.0
		min := countA
		if countB < min {
			min = countB
		}
		if min > 0 {
			// Overlap coefficient: co / min(freq_a, freq_b).
			score = float64(pair.Co) / float64(min)
		}
		scoredPartners = append(scoredPartners, scored{
			dir:    other,
			score:  score,
			co:     pair.Co,
			countB: countB,
		})
	}

	sort.Slice(scoredPartners, func(i, j int) bool {
		if scoredPartners[i].score != scoredPartners[j].score {
			return scoredPartners[i].score > scoredPartners[j].score
		}
		if scoredPartners[i].co != scoredPartners[j].co {
			return scoredPartners[i].co > scoredPartners[j].co
		}
		return scoredPartners[i].dir < scoredPartners[j].dir
	})
	if limit <= 0 {
		limit = 10
	}
	if len(scoredPartners) > limit {
		scoredPartners = scoredPartners[:limit]
	}

	out := make([]CouplingPartner, 0, len(scoredPartners))
	for _, p := range scoredPartners {
		out = append(out, CouplingPartner{
			Dir:    p.dir,
			Score:  p.score,
			Co:     p.co,
			CountA: countA,
			CountB: p.countB,
		})
	}
	return out
}

func filterEventsForScope(events []StructuralEvent, key string, limit int) []StructuralEvent {
	if len(events) == 0 {
		return nil
	}
	key = strings.TrimSpace(key)
	if key == "" {
		key = "."
	}

	matches := func(dir string) bool {
		dir = strings.TrimSpace(dir)
		if dir == "" {
			return false
		}
		if key == "." {
			return true
		}
		if dir == key {
			return true
		}
		return strings.HasPrefix(dir, key+"/")
	}

	out := []StructuralEvent{}
	for _, ev := range events {
		ok := false
		for _, d := range ev.AddedDirs {
			if matches(d) {
				ok = true
				break
			}
		}
		if !ok {
			for _, d := range ev.RemovedDirs {
				if matches(d) {
					ok = true
					break
				}
			}
		}
		if !ok {
			for _, r := range ev.RenamedDirs {
				if matches(r.From) || matches(r.To) {
					ok = true
					break
				}
			}
		}
		if !ok && ev.BigBang && key == "." {
			ok = true
		}
		if ok {
			out = append(out, ev)
		}
	}

	sort.Slice(out, func(i, j int) bool { return out[i].Date.After(out[j].Date) })
	if limit <= 0 {
		limit = 5
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

func (c *HistoryContext) Markdown() string {
	if c == nil {
		return ""
	}
	lines := []string{
		"# History Context",
		"",
		fmt.Sprintf("- Scope: `%s`", strings.TrimSpace(c.Scope)),
		fmt.Sprintf("- Key: `%s`", strings.TrimSpace(c.Key)),
		fmt.Sprintf("- Head: `%s`", strings.TrimSpace(c.Head)),
		fmt.Sprintf("- Generated: `%s`", c.GeneratedAt.UTC().Format(time.RFC3339)),
		"",
	}

	if len(c.CoChange) > 0 {
		lines = append(lines, "## Co-change Partners", "")
		for _, p := range c.CoChange {
			lines = append(lines, fmt.Sprintf("- `%s` (score=%.3f co=%d a=%d b=%d)", p.Dir, p.Score, p.Co, p.CountA, p.CountB))
		}
		lines = append(lines, "")
	}
	if c.Velocity != nil {
		lines = append(lines,
			"## Velocity",
			"",
			fmt.Sprintf("- 7d=%d 30d=%d 90d=%d all=%d (class=%s)", c.Velocity.Commits7d, c.Velocity.Commits30d, c.Velocity.Commits90d, c.Velocity.CommitsAll, c.Velocity.Class),
			"",
		)
	}
	if len(c.Events) > 0 {
		lines = append(lines, "## Structural Events", "")
		for _, ev := range c.Events {
			short := ev.Hash
			if len(short) > 8 {
				short = short[:8]
			}
			meta := []string{}
			if len(ev.AddedDirs) > 0 {
				meta = append(meta, "add:"+strings.Join(ev.AddedDirs, ","))
			}
			if len(ev.RemovedDirs) > 0 {
				meta = append(meta, "rm:"+strings.Join(ev.RemovedDirs, ","))
			}
			if len(ev.RenamedDirs) > 0 {
				ren := []string{}
				for _, r := range ev.RenamedDirs {
					ren = append(ren, r.From+"->"+r.To)
				}
				meta = append(meta, "ren:"+strings.Join(ren, ","))
			}
			if ev.BigBang {
				meta = append(meta, fmt.Sprintf("big_bang:%d", ev.FileChanges))
			}
			suffix := ""
			if len(meta) > 0 {
				suffix = " (" + strings.Join(meta, " ") + ")"
			}
			subj := strings.TrimSpace(ev.Subject)
			if subj != "" {
				lines = append(lines, fmt.Sprintf("- `%s` `%s` %s%s", ev.Date.UTC().Format("2006-01-02"), short, subj, suffix))
			} else {
				lines = append(lines, fmt.Sprintf("- `%s` `%s`%s", ev.Date.UTC().Format("2006-01-02"), short, suffix))
			}
		}
		lines = append(lines, "")
	}

	return strings.Join(lines, "\n")
}

func writeJSON(path string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return atomicWrite(path, b, 0o644)
}

func readJSON[T any](path string) (*T, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var out T
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func atomicWrite(path string, data []byte, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, mode); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func gitTopLevel(rootPath string) (string, error) {
	return gitOutput(strings.TrimSpace(rootPath), "rev-parse", "--show-toplevel")
}

func gitHeadCommit(gitRoot string) (string, error) {
	return gitOutput(strings.TrimSpace(gitRoot), "rev-parse", "HEAD")
}

func gitOutput(dir string, args ...string) (string, error) {
	out, err := gitExec(dir, args...)
	if err != nil {
		return "", err
	}
	s := strings.TrimSpace(string(out))
	if s == "" {
		return "", fmt.Errorf("empty git output")
	}
	return s, nil
}

func gitExec(dir string, args ...string) ([]byte, error) {
	cmd := execGit(args...)
	cmd.Dir = dir
	return cmd.Output()
}

func execGit(args ...string) *exec.Cmd {
	return exec.Command("git", args...)
}
