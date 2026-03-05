// Package cli implements CLI helpers for the nexus command-line interface.
// This file provides daemon connection and operation dispatch utilities.
package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// operationRequest is the JSON body sent to the daemon's operations endpoint.
type operationRequest struct {
	Operation string `json:"operation"`
	Payload   any    `json:"payload,omitempty"`
}

// DispatchOperation sends an operation request to the daemon's HTTP API
// and returns the parsed JSON response.
func DispatchOperation(host string, port int, operation string, payload any) (map[string]any, error) {
	url := fmt.Sprintf("%s/api/operations", DaemonURL(host, port))

	body, err := json.Marshal(operationRequest{
		Operation: operation,
		Payload:   payload,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("connect to daemon: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	if resp.StatusCode >= 400 {
		errMsg, _ := result["error"].(string)
		if errMsg == "" {
			errMsg = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		return result, fmt.Errorf("daemon error: %s", errMsg)
	}

	return result, nil
}

// DaemonURL returns the base URL for the daemon HTTP API.
func DaemonURL(host string, port int) string {
	if host == "" {
		host = "localhost"
	}
	return fmt.Sprintf("http://%s:%d", host, port)
}
