package agent

import (
	"strings"
	"time"
)

// PromptContext holds all contextual data used to build the system prompt
// for an agent run.
type PromptContext struct {
	AgentName        string
	AgentPersonality string
	Skills           []SkillContent
	MemoryContext    string
	UserIdentity     string
	DateTime         string
	WorkspaceNotes   string
	ToolSummary      string
}

// SkillContent is a named block of skill instructions to inject into the prompt.
type SkillContent struct {
	Name    string
	Content string
}

// BuildSystemPrompt assembles a complete system prompt from the given context.
// Sections are emitted in order: identity, skills, memory, tools, user context,
// time, and workspace notes. Empty sections are silently skipped.
func BuildSystemPrompt(ctx PromptContext) string {
	var sections []string

	// --- Identity ---
	sections = append(sections, buildIdentitySection(ctx))

	// --- Skills ---
	if len(ctx.Skills) > 0 {
		sections = append(sections, buildSkillsSection(ctx.Skills))
	}

	// --- Memory ---
	if strings.TrimSpace(ctx.MemoryContext) != "" {
		sections = append(sections, buildSection("MEMORY CONTEXT", ctx.MemoryContext))
	}

	// --- Tools ---
	if strings.TrimSpace(ctx.ToolSummary) != "" {
		sections = append(sections, buildSection("AVAILABLE TOOLS", ctx.ToolSummary))
	}

	// --- User context ---
	if strings.TrimSpace(ctx.UserIdentity) != "" {
		sections = append(sections, buildSection("USER", ctx.UserIdentity))
	}

	// --- Date/time ---
	dt := ctx.DateTime
	if dt == "" {
		dt = time.Now().Format(time.RFC1123)
	}
	sections = append(sections, buildSection("CURRENT DATE/TIME", dt))

	// --- Workspace notes ---
	if strings.TrimSpace(ctx.WorkspaceNotes) != "" {
		sections = append(sections, buildSection("WORKSPACE NOTES", ctx.WorkspaceNotes))
	}

	return strings.Join(sections, "\n\n")
}

func buildIdentitySection(ctx PromptContext) string {
	name := ctx.AgentName
	if name == "" {
		name = "Nexus"
	}
	personality := ctx.AgentPersonality
	if personality == "" {
		personality = "You are a helpful coding agent. Use the provided tools to accomplish tasks. Prefer correct and minimal changes."
	}
	return "# " + name + "\n\n" + personality
}

func buildSkillsSection(skills []SkillContent) string {
	var b strings.Builder
	b.WriteString("# SKILLS\n")
	for _, s := range skills {
		b.WriteString("\n## ")
		b.WriteString(s.Name)
		b.WriteString("\n\n")
		b.WriteString(strings.TrimSpace(s.Content))
		b.WriteString("\n")
	}
	return b.String()
}

func buildSection(heading, body string) string {
	return "# " + heading + "\n\n" + strings.TrimSpace(body)
}
