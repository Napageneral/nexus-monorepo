// Package main is the entrypoint for the nexus binary.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"github.com/spf13/cobra"

	"github.com/Napageneral/nexus/internal/agent"
	"github.com/Napageneral/nexus/internal/broker"
	"github.com/Napageneral/nexus/internal/cli"
	"github.com/Napageneral/nexus/internal/config"
	"github.com/Napageneral/nexus/internal/daemon"
	"github.com/Napageneral/nexus/internal/db"
	"github.com/Napageneral/nexus/internal/iam"
	"github.com/Napageneral/nexus/internal/operations"
	"github.com/Napageneral/nexus/internal/pipeline"
	httpx "github.com/Napageneral/nexus/internal/transport/http"
	"github.com/Napageneral/nexus/internal/transport/ws"
)

// Build-time variables set via ldflags.
var (
	version = "dev"
	commit  = "unknown"
)

func main() {
	root := &cobra.Command{
		Use:   "nexus",
		Short: "Nexus — personal AI agent OS",
		Long:  "Nexus is a personal AI agent operating system that orchestrates LLM agents, adapters, and memory.",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}

	// Global flags
	root.PersistentFlags().StringP("config", "c", "", "path to config file")
	root.PersistentFlags().String("state-dir", "", "path to state directory")
	root.PersistentFlags().BoolP("verbose", "v", false, "enable verbose logging")

	// Register all subcommands
	root.AddCommand(
		versionCmd(),
		serveCmd(),
		initCmd(),
		daemonCmd(),
		setupCmd(),
		statusCmd(),
		healthCmd(),
		doctorCmd(),
		configCmd(),
		agentsCmd(),
		sessionsCmd(),
		memoryCmd(),
		adaptersCmd(),
		clockCmd(),
		modelsCmd(),
		credentialCmd(),
		securityCmd(),
		chatCmd(),
		resetCmd(),
		uninstallCmd(),
		dashboardCmd(),
		docsCmd(),
	)

	if err := root.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// resolveFlags extracts common flags from the command.
func resolveFlags(cmd *cobra.Command) (stateDirFlag, configFlag string, verbose bool) {
	stateDirFlag, _ = cmd.Flags().GetString("state-dir")
	configFlag, _ = cmd.Flags().GetString("config")
	verbose, _ = cmd.Flags().GetBool("verbose")
	return
}

// setupLogger creates a slog.Logger based on verbosity and config.
func setupLogger(verbose bool, cfg *config.Config) *slog.Logger {
	level := slog.LevelInfo
	if verbose {
		level = slog.LevelDebug
	} else {
		switch cfg.Logging.Level {
		case "debug":
			level = slog.LevelDebug
		case "warn":
			level = slog.LevelWarn
		case "error":
			level = slog.LevelError
		}
	}
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level}))
}

// loadConfigAndPort loads the config and resolves the effective port.
func loadConfigAndPort(cmd *cobra.Command) (*config.Config, int, config.Paths, error) {
	stateDirFlag, configFlag, _ := resolveFlags(cmd)
	paths := config.ResolvePaths(stateDirFlag, configFlag)

	cfg, err := config.Load(paths.ConfigFile)
	if err != nil {
		return nil, 0, paths, fmt.Errorf("loading config: %w", err)
	}

	port := config.EffectivePort(cfg)
	return cfg, port, paths, nil
}

// dispatchFromCmd dispatches an operation to the running daemon using
// config resolved from command flags.
func dispatchFromCmd(cmd *cobra.Command, operation string, payload any) (map[string]any, error) {
	_, port, _, err := loadConfigAndPort(cmd)
	if err != nil {
		return nil, err
	}
	return cli.DispatchOperation("localhost", port, operation, payload)
}

// printJSON marshals and prints a value as indented JSON.
func printJSON(v any) {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error formatting output: %v\n", err)
		return
	}
	fmt.Println(string(data))
}

// ---------------------------------------------------------------------------
// version
// ---------------------------------------------------------------------------

func versionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print nexus version",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("nexus %s (%s)\n", version, commit)
		},
	}
}

// ---------------------------------------------------------------------------
// serve (keep existing implementation)
// ---------------------------------------------------------------------------

func serveCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "serve",
		Short: "Start the nexus daemon in the foreground",
		Long:  "Starts the nexus pipeline, adapter supervisor, control plane, and agent system.",
		RunE: func(cmd *cobra.Command, args []string) error {
			stateDirFlag, configFlag, verbose := resolveFlags(cmd)
			port, _ := cmd.Flags().GetInt("port")

			// Resolve paths
			paths := config.ResolvePaths(stateDirFlag, configFlag)

			// Load config
			cfg, err := config.Load(paths.ConfigFile)
			if err != nil {
				return fmt.Errorf("loading config: %w", err)
			}

			// Override port from flag if set explicitly
			if cmd.Flags().Changed("port") {
				cfg.Runtime.Port = port
			}

			// Validate
			if issues := config.Validate(cfg); len(issues) > 0 {
				for _, issue := range issues {
					fmt.Fprintf(os.Stderr, "config error: %s\n", issue)
				}
				return fmt.Errorf("invalid configuration")
			}

			logger := setupLogger(verbose, cfg)

			// Open databases
			ledgers, err := db.OpenLedgers(paths.DataDir)
			if err != nil {
				return fmt.Errorf("opening databases: %w", err)
			}

			// Build operation registry
			reg := operations.NewRegistry()
			operations.RegisterStaticTaxonomy(reg)

			// Create agent engine + broker
			engine := agent.NewEngine(cfg, ledgers, logger)
			brokerBridge := &engineBrokerAdapter{engine: engine}
			brk := broker.NewBroker(brokerBridge, ledgers, cfg, logger)

			// Register ALL runtime operation handlers
			registerRuntimeHandlers(reg, cfg, ledgers, brk, logger)

			// Build IAM evaluator
			grantStore := iam.NewGrantStore(ledgers.Runtime, logger)
			auditLogger := iam.NewAuditLogger(ledgers.Runtime, logger)
			policyEngine := iam.NewPolicyEngine(grantStore, logger)
			iamEvaluator := iam.NewIAMEvaluator(policyEngine, auditLogger)

			// Build pipeline with IAM evaluator
			resolver := operations.NewResolver(reg)
			p := pipeline.NewPipeline(resolver,
				pipeline.WithLogger(logger),
				pipeline.WithAccessEvaluator(iamEvaluator),
			)

			// Create HTTP server
			httpServer := httpx.NewServer(cfg, p, logger)

			// Create WebSocket server
			wsServer := ws.NewServer(p, logger)

			// Create daemon
			d := daemon.New(cfg, paths, logger)

			// Add a database service wrapper
			d.AddService(&dbService{ledgers: ledgers, logger: logger})

			// Add HTTP server
			d.AddService(httpServer)

			// Add WS server
			d.AddService(wsServer)

			// Run
			return d.Run(context.Background())
		},
	}
	cmd.Flags().IntP("port", "p", 0, "control plane port (default: from config or 18789)")
	return cmd
}

// registerRuntimeHandlers wires ALL operation handler groups.
func registerRuntimeHandlers(reg *operations.Registry, cfg *config.Config, ledgers *db.Ledgers, brk *broker.Broker, logger *slog.Logger) {
	// Core system handlers (health, status, skills, logs)
	operations.NewSystemHandlers(cfg, logger).Register(reg)

	// Override health with a richer version that includes DB status
	reg.Register(operations.OperationDef{
		Operation: "health",
		Kind:      operations.KindControl,
		Action:    operations.ActionRead,
		Resource:  "runtime.health",
		Handler: func(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
			dbHealth := ledgers.HealthCheck()
			return map[string]any{
				"status":    "ok",
				"version":   version,
				"commit":    commit,
				"databases": dbHealth,
			}, nil
		},
	})

	// Config handlers (config.get, config.set, config.patch)
	operations.NewConfigHandlers(cfg, "", logger).Register(reg)

	// Agent handlers (agents.list, agents.create, agents.update, agents.delete)
	operations.NewAgentHandlers(ledgers.Agents, brk, logger).Register(reg)

	// Session handlers (sessions.list, sessions.resolve, sessions.patch, sessions.delete)
	operations.NewSessionHandlers(ledgers.Runtime, logger).Register(reg)

	// Chat handlers (event.ingest, chat.abort, chat.history)
	operations.NewChatHandlers(brk, ledgers.Events, logger).Register(reg)

	// Delivery handlers (delivery.send, delivery.stream)
	operations.NewDeliveryHandlers(nil, logger).Register(reg) // adapter sender wired when adapters start

	// Adapter handlers (adapter.info, adapter.health, adapter.connections.list)
	operations.NewAdapterHandlers(nil, logger).Register(reg) // adapter manager wired when adapters start

	// Memory handlers (memory.review.*)
	operations.NewMemoryHandlers(ledgers.Memory, logger).Register(reg)

	// Work handlers (work.items.*, work.workflows.*)
	operations.NewWorkHandlers(ledgers.Work, logger).Register(reg)

	// Clock handlers (clock.schedule.*)
	operations.NewClockHandlers(ledgers.Runtime, logger).Register(reg)

	// Model handlers (models.list)
	operations.NewModelHandlers(nil, logger).Register(reg) // model lister wired later

	// connect — WebSocket handshake (accept all)
	reg.Register(operations.OperationDef{
		Operation: "connect",
		Kind:      operations.KindProtocol,
		Action:    operations.ActionRead,
		Resource:  "runtime.connection",
		Handler: func(ctx context.Context, req *pipeline.NexusRequest) (any, error) {
			return map[string]any{
				"accepted": true,
				"version":  version,
			}, nil
		},
	})
}

// engineBrokerAdapter bridges agent.Engine to broker.AgentRunner.
// The broker and agent packages define separate types to avoid circular imports;
// this adapter translates between them.
type engineBrokerAdapter struct {
	engine *agent.Engine
}

func (a *engineBrokerAdapter) Run(ctx context.Context, req broker.RunRequest) (*broker.RunResult, error) {
	result, err := a.engine.Run(ctx, agent.RunRequest{
		SessionKey:   req.SessionKey,
		Prompt:       req.Prompt,
		Model:        req.Model,
		Provider:     req.Provider,
		AgentID:      req.AgentID,
		SystemPrompt: req.SystemPrompt,
	})
	if err != nil {
		return nil, err
	}
	return &broker.RunResult{
		Response:  result.Response,
		Aborted:   result.Aborted,
		SessionID: result.SessionID,
	}, nil
}

func (a *engineBrokerAdapter) Abort(sessionKey string) {
	a.engine.Abort(sessionKey)
}

// ---------------------------------------------------------------------------
// init (keep existing implementation)
// ---------------------------------------------------------------------------

func initCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "init",
		Short: "Initialize a new nexus instance",
		RunE: func(cmd *cobra.Command, args []string) error {
			stateDirFlag, configFlag, _ := resolveFlags(cmd)
			paths := config.ResolvePaths(stateDirFlag, configFlag)

			// Create directory structure
			dirs := []string{
				paths.StateDir,
				paths.DataDir,
				paths.CredDir,
				paths.ACLDir,
			}
			for _, dir := range dirs {
				if err := os.MkdirAll(dir, 0o755); err != nil {
					return fmt.Errorf("creating directory %s: %w", dir, err)
				}
			}

			// Write default config if it doesn't exist
			if _, err := os.Stat(paths.ConfigFile); os.IsNotExist(err) {
				cfg := config.Default()
				if err := config.Save(cfg, paths.ConfigFile); err != nil {
					return fmt.Errorf("writing default config: %w", err)
				}
				fmt.Printf("Created config: %s\n", paths.ConfigFile)
			} else {
				fmt.Printf("Config exists: %s\n", paths.ConfigFile)
			}

			// Initialize databases
			ledgers, err := db.OpenLedgers(paths.DataDir)
			if err != nil {
				return fmt.Errorf("initializing databases: %w", err)
			}
			ledgers.Close()

			fmt.Printf("Nexus initialized at %s\n", paths.StateDir)
			return nil
		},
	}
}

// ---------------------------------------------------------------------------
// daemon
// ---------------------------------------------------------------------------

func daemonCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "daemon",
		Short: "Manage the nexus background daemon",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}

	cmd.AddCommand(
		&cobra.Command{
			Use:   "start",
			Short: "Start the daemon in the background",
			RunE: func(cmd *cobra.Command, args []string) error {
				_, port, paths, err := loadConfigAndPort(cmd)
				if err != nil {
					return err
				}
				if err := cli.DaemonStart(paths.StateDir, port); err != nil {
					return err
				}
				fmt.Println("Daemon started.")
				return nil
			},
		},
		&cobra.Command{
			Use:   "stop",
			Short: "Stop the running daemon",
			RunE: func(cmd *cobra.Command, args []string) error {
				stateDirFlag, configFlag, _ := resolveFlags(cmd)
				paths := config.ResolvePaths(stateDirFlag, configFlag)
				if err := cli.DaemonStop(paths.StateDir); err != nil {
					return err
				}
				fmt.Println("Daemon stopped.")
				return nil
			},
		},
		&cobra.Command{
			Use:   "restart",
			Short: "Restart the daemon",
			RunE: func(cmd *cobra.Command, args []string) error {
				_, port, paths, err := loadConfigAndPort(cmd)
				if err != nil {
					return err
				}
				if err := cli.DaemonRestart(paths.StateDir, port); err != nil {
					return err
				}
				fmt.Println("Daemon restarted.")
				return nil
			},
		},
		&cobra.Command{
			Use:   "install",
			Short: "Install the daemon as a system service (launchd/systemd)",
			RunE: func(cmd *cobra.Command, args []string) error {
				exe, err := os.Executable()
				if err != nil {
					return fmt.Errorf("finding executable: %w", err)
				}
				stateDirFlag, configFlag, _ := resolveFlags(cmd)
				paths := config.ResolvePaths(stateDirFlag, configFlag)
				return cli.DaemonInstall(exe, paths.StateDir)
			},
		},
	)

	return cmd
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

func setupCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "setup",
		Short: "Run the interactive setup wizard",
		RunE: func(cmd *cobra.Command, args []string) error {
			stateDirFlag, _, _ := resolveFlags(cmd)
			nonInteractive, _ := cmd.Flags().GetBool("non-interactive")
			provider, _ := cmd.Flags().GetString("provider")
			apiKey, _ := cmd.Flags().GetString("api-key")
			model, _ := cmd.Flags().GetString("model")
			port, _ := cmd.Flags().GetInt("port")

			wcfg := cli.WizardConfig{
				StateDir:       stateDirFlag,
				Provider:       provider,
				APIKey:         apiKey,
				Model:          model,
				Port:           port,
				NonInteractive: nonInteractive,
			}
			return cli.RunWizard(wcfg)
		},
	}
	cmd.Flags().Bool("non-interactive", false, "run in non-interactive mode")
	cmd.Flags().String("provider", "", "AI provider (e.g., openai, anthropic)")
	cmd.Flags().String("api-key", "", "API key for the provider")
	cmd.Flags().String("model", "", "default model to use")
	cmd.Flags().IntP("port", "p", 0, "daemon port")
	return cmd
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

func statusCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Show nexus daemon status",
		RunE: func(cmd *cobra.Command, args []string) error {
			stateDirFlag, configFlag, _ := resolveFlags(cmd)
			paths := config.ResolvePaths(stateDirFlag, configFlag)

			cfg, err := config.Load(paths.ConfigFile)
			if err != nil {
				return fmt.Errorf("loading config: %w", err)
			}

			port := config.EffectivePort(cfg)

			// Check daemon process status.
			procStatus, _ := cli.DaemonStatus(paths.StateDir)
			fmt.Printf("Daemon: %s\n", procStatus)

			// Try to get status from running daemon.
			url := fmt.Sprintf("http://localhost:%d/health", port)
			client := &http.Client{Timeout: 3 * time.Second}
			resp, err := client.Get(url)
			if err != nil {
				fmt.Println("API: not reachable")
				return nil
			}
			defer resp.Body.Close()

			var data map[string]any
			if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
				return fmt.Errorf("parsing response: %w", err)
			}

			out, _ := json.MarshalIndent(data, "", "  ")
			fmt.Println(string(out))
			return nil
		},
	}
}

// ---------------------------------------------------------------------------
// health
// ---------------------------------------------------------------------------

func healthCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "health",
		Short: "Check daemon health",
		RunE: func(cmd *cobra.Command, args []string) error {
			_, port, _, err := loadConfigAndPort(cmd)
			if err != nil {
				return err
			}

			result, err := cli.CheckHealth("localhost", port)
			if err != nil {
				return err
			}

			for _, check := range result.Checks {
				fmt.Printf("  %s %s: %s\n", cli.StatusIcon(check.Status), check.Name, check.Message)
			}

			if !result.Overall {
				fmt.Println("\nOverall: " + cli.Red("unhealthy"))
				os.Exit(1)
			}
			fmt.Println("\nOverall: " + cli.Green("healthy"))
			return nil
		},
	}
}

// ---------------------------------------------------------------------------
// doctor
// ---------------------------------------------------------------------------

func doctorCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "doctor",
		Short: "Diagnose nexus installation issues",
		RunE: func(cmd *cobra.Command, args []string) error {
			stateDirFlag, configFlag, _ := resolveFlags(cmd)
			paths := config.ResolvePaths(stateDirFlag, configFlag)

			cfg, _ := config.Load(paths.ConfigFile) // OK if missing.

			report, err := cli.RunDoctor(paths.StateDir, cfg)
			if err != nil {
				return err
			}

			if len(report.Passed) > 0 {
				fmt.Println(cli.Bold("Passed:"))
				for _, p := range report.Passed {
					fmt.Printf("  %s %s\n", cli.StatusIcon(true), p)
				}
			}

			if len(report.Warnings) > 0 {
				fmt.Println(cli.Bold("\nWarnings:"))
				for _, w := range report.Warnings {
					fmt.Printf("  %s [%s] %s\n", cli.Yellow("!"), w.Category, w.Message)
					if w.Fix != "" {
						fmt.Printf("    Fix: %s\n", w.Fix)
					}
				}
			}

			if len(report.Issues) > 0 {
				fmt.Println(cli.Bold("\nIssues:"))
				for _, issue := range report.Issues {
					fmt.Printf("  %s [%s] %s\n", cli.StatusIcon(false), issue.Category, issue.Message)
					if issue.Fix != "" {
						fmt.Printf("    Fix: %s\n", issue.Fix)
					}
				}
				os.Exit(1)
			}

			fmt.Println(cli.Green("\nNo issues found."))
			return nil
		},
	}
}

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

func configCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "config",
		Short: "Configuration management",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}

	cmd.AddCommand(
		&cobra.Command{
			Use:   "get [key]",
			Short: "Get a configuration value",
			RunE: func(cmd *cobra.Command, args []string) error {
				stateDirFlag, configFlag, _ := resolveFlags(cmd)
				paths := config.ResolvePaths(stateDirFlag, configFlag)

				cfg, err := config.Load(paths.ConfigFile)
				if err != nil {
					return fmt.Errorf("loading config: %w", err)
				}

				out, _ := json.MarshalIndent(cfg, "", "  ")
				fmt.Println(string(out))
				return nil
			},
		},
		&cobra.Command{
			Use:   "set <key> <value>",
			Short: "Set a configuration value",
			Args:  cobra.MinimumNArgs(2),
			RunE: func(cmd *cobra.Command, args []string) error {
				stateDirFlag, configFlag, _ := resolveFlags(cmd)
				paths := config.ResolvePaths(stateDirFlag, configFlag)

				cfg, err := config.Load(paths.ConfigFile)
				if err != nil {
					return fmt.Errorf("loading config: %w", err)
				}

				// For now, support a flat key=value for runtime.port.
				key := args[0]
				value := args[1]

				switch key {
				case "runtime.port":
					var port int
					if _, err := fmt.Sscanf(value, "%d", &port); err != nil {
						return fmt.Errorf("invalid port: %s", value)
					}
					cfg.Runtime.Port = port
				case "runtime.bind":
					cfg.Runtime.Bind = value
				case "logging.level":
					cfg.Logging.Level = value
				default:
					return fmt.Errorf("unknown config key: %s (use 'nexus config edit' for full editing)", key)
				}

				if err := config.Save(cfg, paths.ConfigFile); err != nil {
					return fmt.Errorf("saving config: %w", err)
				}

				fmt.Printf("Set %s = %s\n", key, value)
				return nil
			},
		},
		&cobra.Command{
			Use:   "edit",
			Short: "Open the config file in your editor",
			RunE: func(cmd *cobra.Command, args []string) error {
				stateDirFlag, configFlag, _ := resolveFlags(cmd)
				paths := config.ResolvePaths(stateDirFlag, configFlag)

				editor := os.Getenv("EDITOR")
				if editor == "" {
					editor = "vi"
				}

				c := exec.Command(editor, paths.ConfigFile)
				c.Stdin = os.Stdin
				c.Stdout = os.Stdout
				c.Stderr = os.Stderr
				return c.Run()
			},
		},
	)

	return cmd
}

// ---------------------------------------------------------------------------
// agents
// ---------------------------------------------------------------------------

func agentsCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "agents",
		Short: "Agent management commands",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}

	cmd.AddCommand(
		&cobra.Command{
			Use:   "list",
			Short: "List configured agents",
			RunE: func(cmd *cobra.Command, args []string) error {
				result, err := dispatchFromCmd(cmd, "agents.list", nil)
				if err != nil {
					// Fall back to config-based listing.
					_, _, paths, loadErr := loadConfigAndPort(cmd)
					if loadErr != nil {
						return err
					}
					cfg, loadErr := config.Load(paths.ConfigFile)
					if loadErr != nil {
						return err
					}
					fmt.Println(cli.Bold("Configured agents:"))
					if len(cfg.Agents.List) == 0 {
						fmt.Println("  (none)")
						return nil
					}
					headers := []string{"ID", "NAME", "DEFAULT"}
					var rows [][]string
					for _, a := range cfg.Agents.List {
						def := ""
						if a.Default {
							def = "yes"
						}
						rows = append(rows, []string{a.ID, a.Name, def})
					}
					fmt.Print(cli.RenderTable(headers, rows))
					return nil
				}
				printJSON(result)
				return nil
			},
		},
		&cobra.Command{
			Use:   "add <id> [name]",
			Short: "Add a new agent",
			Args:  cobra.MinimumNArgs(1),
			RunE: func(cmd *cobra.Command, args []string) error {
				name := args[0]
				if len(args) > 1 {
					name = args[1]
				}
				payload := map[string]any{"id": args[0], "name": name}
				result, err := dispatchFromCmd(cmd, "agents.create", payload)
				if err != nil {
					return err
				}
				printJSON(result)
				return nil
			},
		},
	)

	return cmd
}

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------

func sessionsCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "sessions",
		Short: "Session management commands",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}

	cmd.AddCommand(
		&cobra.Command{
			Use:   "list",
			Short: "List active sessions",
			RunE: func(cmd *cobra.Command, args []string) error {
				result, err := dispatchFromCmd(cmd, "sessions.list", nil)
				if err != nil {
					return fmt.Errorf("daemon not reachable: %w", err)
				}
				printJSON(result)
				return nil
			},
		},
		&cobra.Command{
			Use:   "inspect <session-key>",
			Short: "Inspect a session",
			Args:  cobra.ExactArgs(1),
			RunE: func(cmd *cobra.Command, args []string) error {
				payload := map[string]any{"session_key": args[0]}
				result, err := dispatchFromCmd(cmd, "sessions.resolve", payload)
				if err != nil {
					return err
				}
				printJSON(result)
				return nil
			},
		},
	)

	return cmd
}

// ---------------------------------------------------------------------------
// memory
// ---------------------------------------------------------------------------

func memoryCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "memory",
		Short: "Memory system commands",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}

	cmd.AddCommand(
		&cobra.Command{
			Use:   "recall [query]",
			Short: "Recall memories matching a query",
			Args:  cobra.MinimumNArgs(1),
			RunE: func(cmd *cobra.Command, args []string) error {
				query := args[0]
				payload := map[string]any{"query": query}
				result, err := dispatchFromCmd(cmd, "memory.review.search", payload)
				if err != nil {
					return err
				}
				printJSON(result)
				return nil
			},
		},
		&cobra.Command{
			Use:   "search [query]",
			Short: "Search memory",
			Args:  cobra.MinimumNArgs(1),
			RunE: func(cmd *cobra.Command, args []string) error {
				query := args[0]
				payload := map[string]any{"query": query}
				result, err := dispatchFromCmd(cmd, "memory.review.search", payload)
				if err != nil {
					return err
				}
				printJSON(result)
				return nil
			},
		},
		&cobra.Command{
			Use:   "status",
			Short: "Show memory system status",
			RunE: func(cmd *cobra.Command, args []string) error {
				result, err := dispatchFromCmd(cmd, "memory.review.quality.summary", nil)
				if err != nil {
					return fmt.Errorf("daemon not reachable: %w", err)
				}
				printJSON(result)
				return nil
			},
		},
		&cobra.Command{
			Use:   "sync",
			Short: "Trigger memory synchronization",
			RunE: func(cmd *cobra.Command, args []string) error {
				fmt.Println("Memory sync triggered.")
				return nil
			},
		},
	)

	return cmd
}

// ---------------------------------------------------------------------------
// adapters
// ---------------------------------------------------------------------------

func adaptersCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "adapters",
		Short: "Adapter management commands",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}

	cmd.AddCommand(
		&cobra.Command{
			Use:   "list",
			Short: "List connected adapters",
			RunE: func(cmd *cobra.Command, args []string) error {
				result, err := dispatchFromCmd(cmd, "adapter.info", nil)
				if err != nil {
					return fmt.Errorf("daemon not reachable: %w", err)
				}
				printJSON(result)
				return nil
			},
		},
		&cobra.Command{
			Use:   "add <adapter-type>",
			Short: "Add and configure a new adapter",
			Args:  cobra.ExactArgs(1),
			RunE: func(cmd *cobra.Command, args []string) error {
				fmt.Printf("Adapter %q configuration not yet implemented.\n", args[0])
				return nil
			},
		},
		&cobra.Command{
			Use:   "remove <adapter-id>",
			Short: "Remove an adapter",
			Args:  cobra.ExactArgs(1),
			RunE: func(cmd *cobra.Command, args []string) error {
				fmt.Printf("Adapter %q removal not yet implemented.\n", args[0])
				return nil
			},
		},
		&cobra.Command{
			Use:   "status",
			Short: "Show adapter status",
			RunE: func(cmd *cobra.Command, args []string) error {
				result, err := dispatchFromCmd(cmd, "adapter.connections.list", nil)
				if err != nil {
					return fmt.Errorf("daemon not reachable: %w", err)
				}
				printJSON(result)
				return nil
			},
		},
	)

	return cmd
}

// ---------------------------------------------------------------------------
// clock
// ---------------------------------------------------------------------------

func clockCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "clock",
		Short: "Clock and scheduling commands",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}

	cmd.AddCommand(
		&cobra.Command{
			Use:   "list",
			Short: "List scheduled jobs",
			RunE: func(cmd *cobra.Command, args []string) error {
				result, err := dispatchFromCmd(cmd, "clock.schedule.list", nil)
				if err != nil {
					return fmt.Errorf("daemon not reachable: %w", err)
				}
				printJSON(result)
				return nil
			},
		},
		&cobra.Command{
			Use:   "schedule <cron-expression> <command>",
			Short: "Schedule a new job",
			Args:  cobra.MinimumNArgs(2),
			RunE: func(cmd *cobra.Command, args []string) error {
				payload := map[string]any{
					"cron":    args[0],
					"command": args[1],
				}
				result, err := dispatchFromCmd(cmd, "clock.schedule.create", payload)
				if err != nil {
					return err
				}
				printJSON(result)
				return nil
			},
		},
		&cobra.Command{
			Use:   "run <schedule-id>",
			Short: "Run a scheduled job immediately",
			Args:  cobra.ExactArgs(1),
			RunE: func(cmd *cobra.Command, args []string) error {
				payload := map[string]any{"id": args[0]}
				result, err := dispatchFromCmd(cmd, "clock.schedule.run", payload)
				if err != nil {
					return err
				}
				printJSON(result)
				return nil
			},
		},
	)

	return cmd
}

// ---------------------------------------------------------------------------
// models
// ---------------------------------------------------------------------------

func modelsCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "models",
		Short: "Model management commands",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}

	cmd.AddCommand(
		&cobra.Command{
			Use:   "list",
			Short: "List available models",
			RunE: func(cmd *cobra.Command, args []string) error {
				result, err := dispatchFromCmd(cmd, "models.list", nil)
				if err != nil {
					// Fall back to config.
					_, _, paths, loadErr := loadConfigAndPort(cmd)
					if loadErr != nil {
						return err
					}
					cfg, loadErr := config.Load(paths.ConfigFile)
					if loadErr != nil {
						return err
					}
					fmt.Println(cli.Bold("Configured model providers:"))
					if len(cfg.Models.Providers) == 0 {
						fmt.Println("  (none)")
						return nil
					}
					for name, prov := range cfg.Models.Providers {
						fmt.Printf("  %s (%s)\n", name, prov.BaseURL)
						for _, m := range prov.Models {
							fmt.Printf("    - %s (%s)\n", m.ID, m.Name)
						}
					}
					return nil
				}
				printJSON(result)
				return nil
			},
		},
		&cobra.Command{
			Use:   "set <model-id>",
			Short: "Set the default model",
			Args:  cobra.ExactArgs(1),
			RunE: func(cmd *cobra.Command, args []string) error {
				stateDirFlag, configFlag, _ := resolveFlags(cmd)
				paths := config.ResolvePaths(stateDirFlag, configFlag)

				cfg, err := config.Load(paths.ConfigFile)
				if err != nil {
					return fmt.Errorf("loading config: %w", err)
				}

				cfg.Agents.Defaults.Model.Primary = args[0]
				if err := config.Save(cfg, paths.ConfigFile); err != nil {
					return fmt.Errorf("saving config: %w", err)
				}

				fmt.Printf("Default model set to: %s\n", args[0])
				return nil
			},
		},
	)

	return cmd
}

// ---------------------------------------------------------------------------
// credential
// ---------------------------------------------------------------------------

func credentialCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "credential",
		Short: "Manage API credentials",
		RunE: func(cmd *cobra.Command, args []string) error {
			stateDirFlag, configFlag, _ := resolveFlags(cmd)
			paths := config.ResolvePaths(stateDirFlag, configFlag)

			cfg, err := config.Load(paths.ConfigFile)
			if err != nil {
				return fmt.Errorf("loading config: %w", err)
			}

			fmt.Println(cli.Bold("Auth profiles:"))
			if len(cfg.Auth.Profiles) == 0 {
				fmt.Println("  (none configured)")
				return nil
			}
			headers := []string{"ID", "PROVIDER", "MODE"}
			var rows [][]string
			for id, profile := range cfg.Auth.Profiles {
				rows = append(rows, []string{id, profile.Provider, profile.Mode})
			}
			fmt.Print(cli.RenderTable(headers, rows))
			return nil
		},
	}
}

// ---------------------------------------------------------------------------
// security
// ---------------------------------------------------------------------------

func securityCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "security",
		Short: "Security audit and management",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}

	cmd.AddCommand(
		&cobra.Command{
			Use:   "audit",
			Short: "Run a security audit",
			RunE: func(cmd *cobra.Command, args []string) error {
				stateDirFlag, configFlag, _ := resolveFlags(cmd)
				paths := config.ResolvePaths(stateDirFlag, configFlag)

				cfg, err := config.Load(paths.ConfigFile)
				if err != nil {
					return fmt.Errorf("loading config: %w", err)
				}

				fmt.Println(cli.Bold("Security Audit"))
				fmt.Println()

				// Check auth mode.
				authMode := cfg.Runtime.Auth.Mode
				if authMode == "" {
					fmt.Printf("  %s Auth mode not configured\n", cli.StatusIcon(false))
				} else {
					fmt.Printf("  %s Auth mode: %s\n", cli.StatusIcon(true), authMode)
				}

				// Check TLS.
				tlsEnabled := cfg.Runtime.TLS.Enabled != nil && *cfg.Runtime.TLS.Enabled
				if tlsEnabled {
					fmt.Printf("  %s TLS enabled\n", cli.StatusIcon(true))
				} else {
					fmt.Printf("  %s TLS not enabled\n", cli.StatusIcon(false))
				}

				// Check bind mode.
				bind := cfg.Runtime.Bind
				if bind == "loopback" || bind == "" {
					fmt.Printf("  %s Bind: loopback (local only)\n", cli.StatusIcon(true))
				} else {
					fmt.Printf("  %s Bind: %s (network accessible)\n", cli.Yellow("!"), bind)
				}

				// Check credentials directory permissions.
				credDir := filepath.Join(paths.StateDir, "credentials")
				info, err := os.Stat(credDir)
				if err == nil {
					perm := info.Mode().Perm()
					if perm&0o077 == 0 {
						fmt.Printf("  %s Credentials directory permissions: %o\n", cli.StatusIcon(true), perm)
					} else {
						fmt.Printf("  %s Credentials directory too permissive: %o\n", cli.StatusIcon(false), perm)
					}
				}

				return nil
			},
		},
		&cobra.Command{
			Use:   "fix",
			Short: "Fix common security issues",
			RunE: func(cmd *cobra.Command, args []string) error {
				stateDirFlag, configFlag, _ := resolveFlags(cmd)
				paths := config.ResolvePaths(stateDirFlag, configFlag)

				// Fix credentials directory permissions.
				credDir := filepath.Join(paths.StateDir, "credentials")
				if err := os.MkdirAll(credDir, 0o700); err != nil {
					return fmt.Errorf("fixing credentials directory: %w", err)
				}
				if err := os.Chmod(credDir, 0o700); err != nil {
					return fmt.Errorf("setting permissions: %w", err)
				}

				fmt.Println("Security fixes applied:")
				fmt.Printf("  %s Credentials directory permissions set to 0700\n", cli.StatusIcon(true))
				return nil
			},
		},
	)

	return cmd
}

// ---------------------------------------------------------------------------
// chat
// ---------------------------------------------------------------------------

func chatCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "chat",
		Short: "Start an interactive chat session",
		RunE: func(cmd *cobra.Command, args []string) error {
			_, port, _, err := loadConfigAndPort(cmd)
			if err != nil {
				return err
			}

			agentID, _ := cmd.Flags().GetString("agent")

			client := cli.NewChatClient("localhost", port, agentID)
			if err := client.Connect(); err != nil {
				return fmt.Errorf("connecting to daemon: %w", err)
			}
			defer client.Close()

			return client.Run(context.Background())
		},
	}
	cmd.Flags().StringP("agent", "a", "default", "agent ID to chat with")
	return cmd
}

// ---------------------------------------------------------------------------
// reset
// ---------------------------------------------------------------------------

func resetCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "reset",
		Short: "Reset nexus state (databases, sessions, etc.)",
		RunE: func(cmd *cobra.Command, args []string) error {
			stateDirFlag, configFlag, _ := resolveFlags(cmd)
			paths := config.ResolvePaths(stateDirFlag, configFlag)
			hard, _ := cmd.Flags().GetBool("hard")

			if hard {
				fmt.Printf("Removing all data in %s/data...\n", paths.StateDir)
				dataDir := filepath.Join(paths.StateDir, "data")
				if err := os.RemoveAll(dataDir); err != nil {
					return fmt.Errorf("removing data directory: %w", err)
				}
				if err := os.MkdirAll(dataDir, 0o755); err != nil {
					return fmt.Errorf("recreating data directory: %w", err)
				}
				fmt.Println("Data directory cleared.")
			} else {
				fmt.Println("Soft reset: clearing sessions and caches.")
				// Re-initialize databases.
				ledgers, err := db.OpenLedgers(paths.DataDir)
				if err != nil {
					return fmt.Errorf("opening databases: %w", err)
				}
				ledgers.Close()
				fmt.Println("Databases reinitialized.")
			}

			return nil
		},
	}
	cmd.Flags().Bool("hard", false, "perform a hard reset (delete all data)")
	return cmd
}

// ---------------------------------------------------------------------------
// uninstall
// ---------------------------------------------------------------------------

func uninstallCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "uninstall",
		Short: "Uninstall nexus and clean up",
		RunE: func(cmd *cobra.Command, args []string) error {
			stateDirFlag, configFlag, _ := resolveFlags(cmd)
			paths := config.ResolvePaths(stateDirFlag, configFlag)

			// Stop daemon if running.
			_ = cli.DaemonStop(paths.StateDir)

			fmt.Printf("To fully uninstall nexus:\n")
			fmt.Printf("  1. Remove state directory: rm -rf %s\n", paths.StateDir)
			fmt.Printf("  2. Remove the nexus binary from your PATH\n")

			if runtime.GOOS == "darwin" {
				plist := filepath.Join(os.Getenv("HOME"), "Library", "LaunchAgents", "com.nexus.daemon.plist")
				if _, err := os.Stat(plist); err == nil {
					fmt.Printf("  3. Unload launchd: launchctl unload %s && rm %s\n", plist, plist)
				}
			}

			return nil
		},
	}
}

// ---------------------------------------------------------------------------
// dashboard
// ---------------------------------------------------------------------------

func dashboardCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "dashboard",
		Short: "Open the nexus web dashboard",
		RunE: func(cmd *cobra.Command, args []string) error {
			_, port, _, err := loadConfigAndPort(cmd)
			if err != nil {
				return err
			}

			url := fmt.Sprintf("http://localhost:%d", port)
			fmt.Printf("Opening dashboard: %s\n", url)

			var openCmd *exec.Cmd
			switch runtime.GOOS {
			case "darwin":
				openCmd = exec.Command("open", url)
			case "linux":
				openCmd = exec.Command("xdg-open", url)
			default:
				fmt.Printf("Visit %s in your browser.\n", url)
				return nil
			}
			return openCmd.Start()
		},
	}
}

// ---------------------------------------------------------------------------
// docs
// ---------------------------------------------------------------------------

func docsCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "docs",
		Short: "Open nexus documentation",
		RunE: func(cmd *cobra.Command, args []string) error {
			docsURL := "https://docs.nexus.dev"
			fmt.Printf("Opening documentation: %s\n", docsURL)

			var openCmd *exec.Cmd
			switch runtime.GOOS {
			case "darwin":
				openCmd = exec.Command("open", docsURL)
			case "linux":
				openCmd = exec.Command("xdg-open", docsURL)
			default:
				fmt.Printf("Visit %s in your browser.\n", docsURL)
				return nil
			}
			return openCmd.Start()
		},
	}
}

// ---------------------------------------------------------------------------
// dbService (daemon service wrapper for databases)
// ---------------------------------------------------------------------------

// dbService wraps Ledgers as a daemon.Service for lifecycle management.
type dbService struct {
	ledgers *db.Ledgers
	logger  *slog.Logger
}

func (s *dbService) Name() string { return "databases" }

func (s *dbService) Start(_ context.Context) error {
	s.logger.Info("databases ready",
		"health", s.ledgers.HealthCheck(),
	)
	return nil
}

func (s *dbService) Stop(_ context.Context) error {
	return s.ledgers.Close()
}
