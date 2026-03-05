package ignore

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	gitignore "github.com/sabhiram/go-gitignore"
)

// Spec encapsulates ignore matching with a shared root.
// All matches are evaluated against root-relative paths.
type Spec struct {
	root     string
	matcher  *gitignore.GitIgnore
	patterns []string
}

// LoadSpec builds a unified ignore spec rooted at scopeRoot.
// Sources: defaults + .intent/config.json (survey.ignorePatterns) + .cartographerignore + .gitignore.
func LoadSpec(scopeRoot string) (*Spec, error) {
	root, err := filepath.Abs(scopeRoot)
	if err != nil {
		return nil, err
	}

	patterns := DefaultPatterns()
	patterns = append(patterns, loadConfigPatterns(root)...)
	patterns = append(patterns, readIgnoreFile(filepath.Join(root, ".cartographerignore"))...)
	patterns = append(patterns, readIgnoreFile(filepath.Join(root, ".gitignore"))...)
	patterns = dedupePatterns(patterns)

	var matcher *gitignore.GitIgnore
	if len(patterns) > 0 {
		matcher = gitignore.CompileIgnoreLines(patterns...)
	}

	return &Spec{
		root:     root,
		matcher:  matcher,
		patterns: patterns,
	}, nil
}

// Root returns the root path used for ignore matching.
func (s *Spec) Root() string {
	if s == nil {
		return ""
	}
	return s.root
}

// Patterns returns a copy of the compiled ignore patterns.
func (s *Spec) Patterns() []string {
	if s == nil {
		return nil
	}
	out := make([]string, len(s.patterns))
	copy(out, s.patterns)
	return out
}

// MatchPath checks if an absolute path should be ignored.
func (s *Spec) MatchPath(absPath string, isDir bool) bool {
	if s == nil || s.matcher == nil {
		return false
	}
	rel, err := filepath.Rel(s.root, absPath)
	if err != nil {
		rel = absPath
	}
	rel = filepath.Clean(rel)
	if rel == "." || rel == "" {
		return false
	}
	rel = filepath.ToSlash(rel)
	if isDir && !strings.HasSuffix(rel, "/") {
		rel = rel + "/"
	}
	return s.matcher.MatchesPath(rel)
}

func loadConfigPatterns(root string) []string {
	configPath := filepath.Join(root, ".intent", "config.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil
	}
	var cfg struct {
		Survey struct {
			IgnorePatterns []string `json:"ignorePatterns"`
		} `json:"survey"`
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil
	}
	return cfg.Survey.IgnorePatterns
}

func readIgnoreFile(path string) []string {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	var out []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "#") {
			continue
		}
		out = append(out, line)
	}
	return out
}

func dedupePatterns(patterns []string) []string {
	seen := make(map[string]bool, len(patterns))
	out := make([]string, 0, len(patterns))
	for _, p := range patterns {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if seen[p] {
			continue
		}
		seen[p] = true
		out = append(out, p)
	}
	return out
}
