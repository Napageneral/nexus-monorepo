// Package main is the entrypoint for the nexus binary.
package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
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
	root.PersistentFlags().StringP("config", "c", "", "path to config.yaml")
	root.PersistentFlags().String("state-dir", "", "path to state directory")
	root.PersistentFlags().BoolP("verbose", "v", false, "enable verbose logging")

	// Register subcommands
	root.AddCommand(
		versionCmd(),
		serveCmd(),
		initCmd(),
		statusCmd(),
		agentCmd(),
		configCmd(),
		memoryCmd(),
		messageCmd(),
	)

	if err := root.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func versionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print nexus version",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("nexus %s (%s)\n", version, commit)
		},
	}
}

func serveCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "serve",
		Short: "Start the nexus daemon",
		Long:  "Starts the nexus pipeline, adapter supervisor, control plane, and agent system.",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Println("[nexus] serve: not yet implemented")
			return nil
		},
	}
	cmd.Flags().IntP("port", "p", 3284, "control plane port")
	return cmd
}

func initCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "init",
		Short: "Initialize a new nexus instance",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Println("[nexus] init: not yet implemented")
			return nil
		},
	}
}

func statusCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Show nexus status",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Println("[nexus] status: not yet implemented")
			return nil
		},
	}
}

func agentCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "agent",
		Short: "Agent management commands",
	}
	cmd.AddCommand(
		&cobra.Command{
			Use:   "run",
			Short: "Run an interactive agent session",
			RunE: func(cmd *cobra.Command, args []string) error {
				fmt.Println("[nexus] agent run: not yet implemented")
				return nil
			},
		},
		&cobra.Command{
			Use:   "list",
			Short: "List agent sessions",
			RunE: func(cmd *cobra.Command, args []string) error {
				fmt.Println("[nexus] agent list: not yet implemented")
				return nil
			},
		},
	)
	return cmd
}

func configCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "config",
		Short: "Configuration management",
	}
	cmd.AddCommand(
		&cobra.Command{
			Use:   "get [key]",
			Short: "Get a configuration value",
			RunE: func(cmd *cobra.Command, args []string) error {
				fmt.Println("[nexus] config get: not yet implemented")
				return nil
			},
		},
		&cobra.Command{
			Use:   "validate",
			Short: "Validate configuration",
			RunE: func(cmd *cobra.Command, args []string) error {
				fmt.Println("[nexus] config validate: not yet implemented")
				return nil
			},
		},
	)
	return cmd
}

func memoryCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "memory",
		Short: "Memory system commands",
	}
	cmd.AddCommand(
		&cobra.Command{
			Use:   "search [query]",
			Short: "Search memory",
			RunE: func(cmd *cobra.Command, args []string) error {
				fmt.Println("[nexus] memory search: not yet implemented")
				return nil
			},
		},
		&cobra.Command{
			Use:   "status",
			Short: "Show memory system status",
			RunE: func(cmd *cobra.Command, args []string) error {
				fmt.Println("[nexus] memory status: not yet implemented")
				return nil
			},
		},
	)
	return cmd
}

func messageCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "message [channel] [text]",
		Short: "Send a message via an adapter",
		Args:  cobra.MinimumNArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Println("[nexus] message: not yet implemented")
			return nil
		},
	}
}
