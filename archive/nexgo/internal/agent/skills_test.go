package agent

import (
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/Napageneral/nexus/internal/config"
)

func TestSkillsLoad(t *testing.T) {
	// Create a temp bundled dir with two skill files.
	bundledDir := t.TempDir()
	writeSkill(t, bundledDir, "greeting.md", "You greet users warmly.")
	writeSkill(t, bundledDir, "coding.md", "You help with code.")

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	sm := NewSkillsManager(bundledDir, "", logger)

	skills, err := sm.LoadAll()
	if err != nil {
		t.Fatalf("LoadAll: %v", err)
	}
	if len(skills) != 2 {
		t.Fatalf("expected 2 skills, got %d", len(skills))
	}

	names := map[string]bool{}
	for _, s := range skills {
		names[s.Name] = true
		if s.Source != "bundled" {
			t.Errorf("expected source 'bundled', got %q", s.Source)
		}
	}
	if !names["greeting"] || !names["coding"] {
		t.Errorf("expected skills named greeting and coding, got %v", names)
	}
}

func TestSkillsLoadWorkspaceOverride(t *testing.T) {
	bundledDir := t.TempDir()
	writeSkill(t, bundledDir, "coding.md", "bundled coding content")

	workspaceDir := t.TempDir()
	writeSkill(t, workspaceDir, "coding.md", "workspace coding content")

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	sm := NewSkillsManager(bundledDir, workspaceDir, logger)

	skills, err := sm.LoadAll()
	if err != nil {
		t.Fatalf("LoadAll: %v", err)
	}
	if len(skills) != 1 {
		t.Fatalf("expected 1 skill (workspace overrides bundled), got %d", len(skills))
	}
	if skills[0].Content != "workspace coding content" {
		t.Errorf("expected workspace content, got %q", skills[0].Content)
	}
	if skills[0].Source != "workspace" {
		t.Errorf("expected source 'workspace', got %q", skills[0].Source)
	}
}

func TestSkillFrontmatter(t *testing.T) {
	dir := t.TempDir()
	content := `---
{
  "name": "my-skill",
  "description": "A test skill",
  "os": ["darwin", "linux"],
  "required_bins": [],
  "disabled": false
}
---
This is the skill body.`
	writeSkill(t, dir, "my-skill.md", content)

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	sm := NewSkillsManager(dir, "", logger)

	skills, err := sm.LoadAll()
	if err != nil {
		t.Fatalf("LoadAll: %v", err)
	}
	if len(skills) != 1 {
		t.Fatalf("expected 1 skill, got %d", len(skills))
	}
	s := skills[0]
	if s.Name != "my-skill" {
		t.Errorf("expected name 'my-skill', got %q", s.Name)
	}
	if s.Frontmatter.Description != "A test skill" {
		t.Errorf("expected description 'A test skill', got %q", s.Frontmatter.Description)
	}
	if s.Content != "This is the skill body." {
		t.Errorf("unexpected content: %q", s.Content)
	}
}

func TestSkillFrontmatterDisabled(t *testing.T) {
	dir := t.TempDir()
	content := `---
{
  "name": "disabled-skill",
  "disabled": true
}
---
Should not be loaded.`
	writeSkill(t, dir, "disabled-skill.md", content)

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	sm := NewSkillsManager(dir, "", logger)

	skills, err := sm.LoadAll()
	if err != nil {
		t.Fatalf("LoadAll: %v", err)
	}
	if len(skills) != 0 {
		t.Fatalf("expected 0 skills (disabled), got %d", len(skills))
	}
}

func TestSkillFiltering(t *testing.T) {
	dir := t.TempDir()

	// Skill that only runs on an OS that does not exist.
	content := `---
{
  "name": "windows-only",
  "os": ["windows_99"]
}
---
Windows 99 only content.`
	writeSkill(t, dir, "windows-only.md", content)

	// Skill with no OS filter (runs everywhere).
	writeSkill(t, dir, "universal.md", "Runs everywhere.")

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	sm := NewSkillsManager(dir, "", logger)

	skills, err := sm.LoadAll()
	if err != nil {
		t.Fatalf("LoadAll: %v", err)
	}
	if len(skills) != 1 {
		t.Fatalf("expected 1 skill (filtered by OS), got %d", len(skills))
	}
	if skills[0].Name != "universal" {
		t.Errorf("expected 'universal' skill, got %q", skills[0].Name)
	}
}

func TestSkillsLoadForPrompt(t *testing.T) {
	dir := t.TempDir()
	writeSkill(t, dir, "alpha.md", "Alpha content")
	writeSkill(t, dir, "beta.md", "Beta content")

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	sm := NewSkillsManager(dir, "", logger)

	cfg := &config.Config{}
	skills := sm.LoadForPrompt(cfg)
	if len(skills) != 2 {
		t.Fatalf("expected 2 skills, got %d", len(skills))
	}

	// With allowBundled filter.
	cfg.Skills.AllowBundled = []string{"alpha"}
	skills = sm.LoadForPrompt(cfg)
	if len(skills) != 1 {
		t.Fatalf("expected 1 skill with allow filter, got %d", len(skills))
	}
	if skills[0].Name != "alpha" {
		t.Errorf("expected alpha, got %q", skills[0].Name)
	}
}

func TestSkillsLoadMissingDir(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	sm := NewSkillsManager("/nonexistent/bundled", "/nonexistent/workspace", logger)

	skills, err := sm.LoadAll()
	if err != nil {
		t.Fatalf("LoadAll should not error on missing dirs: %v", err)
	}
	if len(skills) != 0 {
		t.Fatalf("expected 0 skills from missing dirs, got %d", len(skills))
	}
}

func TestSkillsRequiredBinsFiltering(t *testing.T) {
	dir := t.TempDir()

	content := `---
{
  "name": "needs-missing-bin",
  "required_bins": ["__nonexistent_binary_xyz__"]
}
---
Should be filtered out.`
	writeSkill(t, dir, "needs-bin.md", content)

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	sm := NewSkillsManager(dir, "", logger)

	skills, err := sm.LoadAll()
	if err != nil {
		t.Fatalf("LoadAll: %v", err)
	}
	if len(skills) != 0 {
		t.Fatalf("expected 0 skills (missing binary), got %d", len(skills))
	}
}

// writeSkill creates a .md file in dir.
func writeSkill(t *testing.T, dir, filename, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, filename), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}
