package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func cmdMCP(args []string) error {
	fs := flag.NewFlagSet("mcp", flag.ContinueOnError)
	upstream := fs.String("upstream", "http://localhost:7422", "Upstream oracle REST server URL")
	httpAddr := fs.String("http", "", "If set, serve MCP over streamable HTTP at this address (e.g. :7423)")
	askTimeout := fs.Duration("ask-timeout", 120*time.Minute, "Max duration per oracle_ask call")
	if err := fs.Parse(args); err != nil {
		return err
	}

	base := strings.TrimRight(strings.TrimSpace(*upstream), "/")

	mcpServer := server.NewMCPServer(
		"spike-oracle",
		"1.0.0",
		server.WithToolCapabilities(false),
	)

	registerProxyTools(mcpServer, base, *askTimeout)

	if addr := strings.TrimSpace(*httpAddr); addr != "" {
		fmt.Fprintf(flag.CommandLine.Output(), "spike MCP proxy listening on %s → %s\n", addr, base)
		httpSrv := server.NewStreamableHTTPServer(mcpServer, server.WithStateLess(true))
		return httpSrv.Start(addr)
	}

	// Default: stdio transport
	return server.ServeStdio(mcpServer)
}

func registerProxyTools(s *server.MCPServer, upstream string, askTimeout time.Duration) {
	httpClient := &http.Client{Timeout: askTimeout}

	// --- oracle_ask ---
	askTool := mcp.NewTool("oracle_ask",
		mcp.WithDescription(
			"Ask the oracle a question about the codebase. "+
				"The oracle is a tree of LLM agents, each specializing in a subsection of the code. "+
				"Your question is routed to the relevant agents who answer from deep context. "+
				"Use this for understanding architecture, finding implementations, debugging, "+
				"or any question about how the code works.",
		),
		mcp.WithString("query",
			mcp.Required(),
			mcp.Description("The question to ask the oracle about the codebase"),
		),
		mcp.WithString("index_id",
			mcp.Description("Agent index ID to query (defaults to the only served index)"),
		),
	)
	s.AddTool(askTool, func(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		query, err := request.RequireString("query")
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		query = strings.TrimSpace(query)
		if query == "" {
			return mcp.NewToolResultError("query is required"), nil
		}

		indexID := strings.TrimSpace(request.GetString("index_id", ""))

		// If no index_id provided, fetch status to find the default.
		if indexID == "" {
			id, err := fetchDefaultTreeID(ctx, httpClient, upstream)
			if err != nil {
				return mcp.NewToolResultError(fmt.Sprintf("failed to resolve index_id: %v", err)), nil
			}
			indexID = id
		}

		body, _ := json.Marshal(askRequest{
			IndexID: indexID,
			Query:   query,
		})

		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, upstream+"/ask", bytes.NewReader(body))
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("failed to build request: %v", err)), nil
		}
		httpReq.Header.Set("Content-Type", "application/json")

		resp, err := httpClient.Do(httpReq)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("upstream ask failed: %v", err)), nil
		}
		defer resp.Body.Close()

		raw, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != http.StatusOK {
			return mcp.NewToolResultError(fmt.Sprintf("upstream returned %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))), nil
		}

		var askResp askResponse
		if err := json.Unmarshal(raw, &askResp); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("failed to decode response: %v", err)), nil
		}

		content := strings.TrimSpace(askResp.Content)
		if content == "" {
			content = "(oracle returned empty response)"
		}
		return mcp.NewToolResultText(content), nil
	})

	// --- oracle_status ---
	statusTool := mcp.NewTool("oracle_status",
		mcp.WithDescription(
			"Get the status of oracle trees served by this server. "+
				"Returns tree IDs, node counts, corpus root paths, and checkpoint freshness.",
		),
	)
	s.AddTool(statusTool, func(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, upstream+"/status", nil)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("failed to build request: %v", err)), nil
		}
		resp, err := httpClient.Do(httpReq)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("upstream status failed: %v", err)), nil
		}
		defer resp.Body.Close()
		raw, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != http.StatusOK {
			return mcp.NewToolResultError(fmt.Sprintf("upstream returned %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))), nil
		}
		// Pretty-print the JSON for readability.
		var pretty bytes.Buffer
		if json.Indent(&pretty, raw, "", "  ") == nil {
			return mcp.NewToolResultText(pretty.String()), nil
		}
		return mcp.NewToolResultText(string(raw)), nil
	})
}

// fetchDefaultTreeID hits the upstream /status endpoint and returns the served
// index ID if exactly one index is available.
func fetchDefaultTreeID(ctx context.Context, client *http.Client, upstream string) (string, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, upstream+"/status", nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("status request failed: %w", err)
	}
	defer resp.Body.Close()
	var status statusResponse
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return "", fmt.Errorf("status decode failed: %w", err)
	}
	if len(status.Trees) == 1 {
		return status.Trees[0].TreeID, nil
	}
	return "", fmt.Errorf("multiple indexes served, index_id is required")
}
