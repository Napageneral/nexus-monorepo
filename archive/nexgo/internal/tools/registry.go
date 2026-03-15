// Package tools provides Nexus-specific tool executors for agent runs.
// Each tool implements the go-coding-agent ToolExecutor interface, providing
// capabilities like memory recall, web search, web fetch, and command execution.
package tools

import (
	"github.com/Napageneral/nexus/internal/config"
	"github.com/Napageneral/nexus/internal/db"
	gcatypes "github.com/badlogic/pi-mono/go-coding-agent/pkg/types"
)

// ToolContext holds the dependencies required by Nexus tools during an agent run.
type ToolContext struct {
	Ledgers    *db.Ledgers
	Config     *config.Config
	SessionKey string
	AgentID    string
	StateDir   string
}

// BuildNexusTools returns all Nexus-specific tools for an agent run.
// The returned executors are ready to be registered with the go-coding-agent runtime.
func BuildNexusTools(ctx ToolContext) []gcatypes.ToolExecutor {
	var tools []gcatypes.ToolExecutor

	// Memory tools require a valid Memory database connection.
	if ctx.Ledgers != nil && ctx.Ledgers.Memory != nil {
		tools = append(tools,
			&CortexRecallTool{db: ctx.Ledgers.Memory},
			&CortexRememberTool{db: ctx.Ledgers.Memory},
			&CortexForgetTool{db: ctx.Ledgers.Memory},
		)
	}

	// Web search tool (stub until API key is configured).
	tools = append(tools, &WebSearchTool{config: ctx.Config})

	// Web fetch tool.
	tools = append(tools, &WebFetchTool{config: ctx.Config})

	// Exec tool for sandboxed command execution.
	tools = append(tools, &ExecTool{
		stateDir: ctx.StateDir,
		config:   ctx.Config,
	})

	return tools
}
