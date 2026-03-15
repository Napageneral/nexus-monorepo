package agent

import (
	"strings"
	"testing"
)

func TestBuildSystemPrompt(t *testing.T) {
	prompt := BuildSystemPrompt(PromptContext{
		AgentName:        "TestAgent",
		AgentPersonality: "You are a test agent.",
		Skills: []SkillContent{
			{Name: "go-expert", Content: "You know Go deeply."},
		},
		MemoryContext:  "User prefers concise answers.",
		UserIdentity:   "tyler",
		DateTime:       "2026-03-03T12:00:00Z",
		WorkspaceNotes: "Monorepo with Go and TypeScript.",
		ToolSummary:    "read, write, edit, bash, ls, find, grep",
	})

	if prompt == "" {
		t.Fatal("expected non-empty prompt")
	}

	// Check that all sections are present.
	for _, want := range []string{
		"TestAgent",
		"You are a test agent.",
		"go-expert",
		"You know Go deeply.",
		"MEMORY CONTEXT",
		"User prefers concise answers.",
		"AVAILABLE TOOLS",
		"read, write, edit, bash, ls, find, grep",
		"USER",
		"tyler",
		"CURRENT DATE/TIME",
		"2026-03-03T12:00:00Z",
		"WORKSPACE NOTES",
		"Monorepo with Go and TypeScript.",
	} {
		if !strings.Contains(prompt, want) {
			t.Errorf("prompt missing expected content: %q", want)
		}
	}
}

func TestSystemPromptSections(t *testing.T) {
	// Minimal context should still produce a valid prompt.
	prompt := BuildSystemPrompt(PromptContext{})
	if prompt == "" {
		t.Fatal("expected non-empty prompt with empty context")
	}
	if !strings.Contains(prompt, "Nexus") {
		t.Error("expected default agent name 'Nexus'")
	}
	if !strings.Contains(prompt, "CURRENT DATE/TIME") {
		t.Error("expected date/time section even with empty context")
	}
	// Should NOT contain optional sections.
	for _, absent := range []string{
		"MEMORY CONTEXT",
		"AVAILABLE TOOLS",
		"WORKSPACE NOTES",
		"# SKILLS",
	} {
		if strings.Contains(prompt, absent) {
			t.Errorf("prompt should not contain %q when context field is empty", absent)
		}
	}
}

func TestBuildSystemPromptSkillsOnly(t *testing.T) {
	prompt := BuildSystemPrompt(PromptContext{
		Skills: []SkillContent{
			{Name: "skill-a", Content: "Content A"},
			{Name: "skill-b", Content: "Content B"},
		},
	})
	if !strings.Contains(prompt, "## skill-a") {
		t.Error("expected skill-a heading")
	}
	if !strings.Contains(prompt, "## skill-b") {
		t.Error("expected skill-b heading")
	}
	if !strings.Contains(prompt, "Content A") {
		t.Error("expected Content A body")
	}
}

func TestBuildSystemPromptUserSection(t *testing.T) {
	prompt := BuildSystemPrompt(PromptContext{
		UserIdentity: "  ",
	})
	// Whitespace-only user identity should be skipped.
	if strings.Contains(prompt, "# USER") {
		t.Error("expected USER section to be skipped for whitespace-only identity")
	}
}
