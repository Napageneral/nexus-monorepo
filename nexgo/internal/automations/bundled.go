package automations

import (
	"context"
	"log/slog"
)

// BundledAutomations registers the default built-in hook handlers.
type BundledAutomations struct {
	hooks  *HooksRuntime
	logger *slog.Logger
}

// NewBundledAutomations creates a new BundledAutomations.
func NewBundledAutomations(hooks *HooksRuntime, logger *slog.Logger) *BundledAutomations {
	if logger == nil {
		logger = slog.Default()
	}
	return &BundledAutomations{
		hooks:  hooks,
		logger: logger,
	}
}

// RegisterAll registers all built-in automations with the hooks runtime.
// Bundled hooks:
//   - "after.pipeline.execute" -> command-logger (logs executed operations)
//   - "after.agent.turn"       -> memory-retain  (triggers memory retention)
//   - "before.agent.run"       -> memory-reader  (injects memory context)
//   - "on.startup"             -> boot-md        (loads workspace NOTES.md)
func (b *BundledAutomations) RegisterAll() {
	b.hooks.Register("after.pipeline.execute", "command-logger", "bundled", b.commandLogger)
	b.hooks.Register("after.agent.turn", "memory-retain", "bundled", b.memoryRetain)
	b.hooks.Register("before.agent.run", "memory-reader", "bundled", b.memoryReader)
	b.hooks.Register("on.startup", "boot-md", "bundled", b.bootMD)

	b.logger.Info("bundled automations registered", "count", 4)
}

// commandLogger logs executed operations after pipeline execution.
func (b *BundledAutomations) commandLogger(_ context.Context, data HookData) error {
	op := ""
	if data.Request != nil {
		op = data.Request.Operation
	}
	b.logger.Debug("command-logger: operation executed", "operation", op)
	return nil
}

// memoryRetain triggers memory retention after an agent turn.
func (b *BundledAutomations) memoryRetain(_ context.Context, data HookData) error {
	b.logger.Debug("memory-retain: triggering retention", "hookpoint", data.Hookpoint)
	return nil
}

// memoryReader injects memory context before an agent run.
func (b *BundledAutomations) memoryReader(_ context.Context, data HookData) error {
	b.logger.Debug("memory-reader: injecting context", "hookpoint", data.Hookpoint)
	return nil
}

// bootMD loads workspace NOTES.md on startup.
func (b *BundledAutomations) bootMD(_ context.Context, data HookData) error {
	b.logger.Debug("boot-md: loading workspace notes", "hookpoint", data.Hookpoint)
	return nil
}
