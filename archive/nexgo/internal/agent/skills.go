package agent

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/Napageneral/nexus/internal/config"
)

// SkillsManager loads skill files from bundled and workspace directories,
// parses their optional JSON front-matter, and filters them by OS and
// required binaries.
type SkillsManager struct {
	bundledDir   string
	workspaceDir string
	logger       *slog.Logger
}

// Skill is a parsed skill file with optional front-matter metadata.
type Skill struct {
	Name        string           `json:"name"`
	Content     string           `json:"content"`
	Frontmatter SkillFrontmatter `json:"frontmatter"`
	Source      string           `json:"source"` // "bundled" or "workspace"
}

// SkillFrontmatter is optional metadata at the top of a skill file,
// enclosed in a JSON block delimited by --- lines.
type SkillFrontmatter struct {
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	OS           []string `json:"os"`
	RequiredBins []string `json:"required_bins"`
	Disabled     bool     `json:"disabled"`
}

// NewSkillsManager creates a SkillsManager that scans bundledDir and
// workspaceDir for .md skill files.
func NewSkillsManager(bundledDir, workspaceDir string, logger *slog.Logger) *SkillsManager {
	if logger == nil {
		logger = slog.Default()
	}
	return &SkillsManager{
		bundledDir:   bundledDir,
		workspaceDir: workspaceDir,
		logger:       logger,
	}
}

// LoadAll scans both directories, parses front-matter, and filters by OS.
// Workspace skills with the same name override bundled ones.
func (m *SkillsManager) LoadAll() ([]Skill, error) {
	byName := make(map[string]Skill)

	// Load bundled first so workspace can override.
	if m.bundledDir != "" {
		skills, err := loadSkillsFromDir(m.bundledDir, "bundled", m.logger)
		if err != nil {
			m.logger.Warn("failed to load bundled skills", "dir", m.bundledDir, "error", err)
		}
		for _, s := range skills {
			byName[s.Name] = s
		}
	}

	if m.workspaceDir != "" {
		skills, err := loadSkillsFromDir(m.workspaceDir, "workspace", m.logger)
		if err != nil {
			m.logger.Warn("failed to load workspace skills", "dir", m.workspaceDir, "error", err)
		}
		for _, s := range skills {
			byName[s.Name] = s
		}
	}

	// Filter and collect.
	currentOS := runtime.GOOS
	var out []Skill
	for _, s := range byName {
		if s.Frontmatter.Disabled {
			continue
		}
		if !matchesOS(s.Frontmatter.OS, currentOS) {
			continue
		}
		if !hasBinaries(s.Frontmatter.RequiredBins) {
			m.logger.Debug("skipping skill due to missing binaries",
				"skill", s.Name,
				"required", s.Frontmatter.RequiredBins)
			continue
		}
		out = append(out, s)
	}
	return out, nil
}

// LoadForPrompt loads skills filtered by the Nexus config's allowBundled
// list and disabled entries, returning them as SkillContent slices suitable
// for BuildSystemPrompt.
func (m *SkillsManager) LoadForPrompt(cfg *config.Config) []SkillContent {
	all, err := m.LoadAll()
	if err != nil {
		m.logger.Warn("failed to load skills for prompt", "error", err)
		return nil
	}

	allowed := make(map[string]bool)
	if len(cfg.Skills.AllowBundled) > 0 {
		for _, name := range cfg.Skills.AllowBundled {
			allowed[name] = true
		}
	}

	disabled := make(map[string]bool)
	for name, entry := range cfg.Skills.Entries {
		if entry.Enabled != nil && !*entry.Enabled {
			disabled[name] = true
		}
	}

	var out []SkillContent
	for _, s := range all {
		if disabled[s.Name] {
			continue
		}
		// If an allow-list is set, only bundled skills in the list pass.
		if len(allowed) > 0 && s.Source == "bundled" && !allowed[s.Name] {
			continue
		}
		out = append(out, SkillContent{
			Name:    s.Name,
			Content: s.Content,
		})
	}
	return out
}

// loadSkillsFromDir reads all .md files in dir and parses them as skills.
func loadSkillsFromDir(dir, source string, logger *slog.Logger) ([]Skill, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var skills []Skill
	for _, de := range entries {
		if de.IsDir() || !strings.HasSuffix(de.Name(), ".md") {
			continue
		}
		path := filepath.Join(dir, de.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			logger.Warn("failed to read skill file", "path", path, "error", err)
			continue
		}

		name := strings.TrimSuffix(de.Name(), ".md")
		fm, content := parseFrontmatter(string(data))
		if fm.Name != "" {
			name = fm.Name
		}

		skills = append(skills, Skill{
			Name:        name,
			Content:     content,
			Frontmatter: fm,
			Source:      source,
		})
	}
	return skills, nil
}

// parseFrontmatter splits a skill file into its front-matter and body.
// Front-matter is a JSON block between --- delimiters at the top of the file.
func parseFrontmatter(raw string) (SkillFrontmatter, string) {
	var fm SkillFrontmatter
	trimmed := strings.TrimSpace(raw)
	if !strings.HasPrefix(trimmed, "---") {
		return fm, raw
	}

	// Find closing ---.
	rest := trimmed[3:]
	idx := strings.Index(rest, "---")
	if idx < 0 {
		return fm, raw
	}

	jsonBlock := strings.TrimSpace(rest[:idx])
	body := strings.TrimSpace(rest[idx+3:])

	if err := json.Unmarshal([]byte(jsonBlock), &fm); err != nil {
		// Not valid JSON front-matter; treat entire file as content.
		return SkillFrontmatter{}, raw
	}

	return fm, body
}

// matchesOS returns true if the skill's OS list is empty (runs everywhere)
// or contains the current OS.
func matchesOS(osList []string, currentOS string) bool {
	if len(osList) == 0 {
		return true
	}
	for _, o := range osList {
		if strings.EqualFold(o, currentOS) {
			return true
		}
	}
	return false
}

// hasBinaries returns true if every required binary is found on PATH.
func hasBinaries(bins []string) bool {
	for _, bin := range bins {
		if _, err := lookPath(bin); err != nil {
			return false
		}
	}
	return true
}

// lookPath is a variable so tests can override it.
var lookPath = defaultLookPath

func defaultLookPath(name string) (string, error) {
	// Use os/exec.LookPath semantics without importing os/exec at module level.
	// We do a simple PATH search.
	pathEnv := os.Getenv("PATH")
	for _, dir := range filepath.SplitList(pathEnv) {
		full := filepath.Join(dir, name)
		info, err := os.Stat(full)
		if err != nil {
			continue
		}
		if info.Mode().IsRegular() && info.Mode()&0111 != 0 {
			return full, nil
		}
	}
	return "", os.ErrNotExist
}
