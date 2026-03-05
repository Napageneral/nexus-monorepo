package main

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	adapterName            = "device-headless-adapter"
	adapterVersion         = "0.1.0"
	platformID             = "headless"
	defaultRunTimeoutMilli = 30_000
)

func main() {
	nexadapter.Run(nexadapter.Adapter{
		Operations: nexadapter.AdapterOperations{
			AdapterInfo:         info,
			AdapterHealth:       health,
			AdapterAccountsList: accounts,
			AdapterControlStart: controlStart,
			AdapterSetupStart:   setupStart,
			AdapterSetupSubmit:  setupSubmit,
			AdapterSetupStatus:  setupStatus,
			AdapterSetupCancel:  setupCancel,
		},
	})
}

func info(_ context.Context) (*nexadapter.AdapterInfo, error) {
	return &nexadapter.AdapterInfo{
		Platform: platformID,
		Name:     adapterName,
		Version:  adapterVersion,
		Operations: []nexadapter.AdapterOperation{
			nexadapter.OpAdapterInfo,
			nexadapter.OpAdapterHealth,
			nexadapter.OpAdapterAccountsList,
			nexadapter.OpAdapterControlStart,
			nexadapter.OpAdapterSetupStart,
			nexadapter.OpAdapterSetupSubmit,
			nexadapter.OpAdapterSetupStatus,
			nexadapter.OpAdapterSetupCancel,
		},
		CredentialService: "device",
		MultiAccount:      true,
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					Type:    "custom_flow",
					Label:   "Connect Headless Host",
					Icon:    "terminal",
					Service: "device-headless",
					Fields:  setupFields(),
				},
			},
			SetupGuide: "Run the headless companion host process on the target machine, then approve pairing before invoking system/browser commands.",
		},
		PlatformCapabilities: nexadapter.ChannelCapabilities{
			TextLimit:             20000,
			SupportsMarkdown:      false,
			MarkdownFlavor:        "standard",
			SupportsTables:        false,
			SupportsCodeBlocks:    false,
			SupportsEmbeds:        false,
			SupportsThreads:       false,
			SupportsReactions:     false,
			SupportsPolls:         false,
			SupportsButtons:       false,
			SupportsEdit:          false,
			SupportsDelete:        false,
			SupportsMedia:         false,
			SupportsVoiceNotes:    false,
			SupportsStreamingEdit: false,
		},
	}, nil
}

func accounts(_ context.Context) ([]nexadapter.AdapterAccount, error) {
	return []nexadapter.AdapterAccount{
		{
			ID:            "default",
			DisplayName:   "Default headless host",
			CredentialRef: "device/default",
			Status:        "ready",
		},
	}, nil
}

func health(_ context.Context, account string) (*nexadapter.AdapterHealth, error) {
	commands := headlessCommands()
	caps := headlessCaps()
	return &nexadapter.AdapterHealth{
		Connected:   envBool("NEXUS_DEVICE_HEADLESS_CONNECTED", true),
		Account:     fallbackAccount(account),
		LastEventAt: time.Now().UnixMilli(),
		Details: map[string]any{
			"platform":   platformID,
			"mode":       "device_control",
			"caps":       caps,
			"commands":   len(commands),
			"adapter_id": platformID,
		},
	}, nil
}

func controlStart(ctx context.Context, account string, session *nexadapter.ControlSession) error {
	commands := headlessCommands()
	endpoint := nexadapter.AdapterControlEndpoint{
		EndpointID:  endpointID("NEXUS_DEVICE_HEADLESS_ENDPOINT_ID", "headless", account),
		DisplayName: "Headless Host",
		Platform:    platformID,
		Caps:        headlessCaps(),
		Commands:    commands,
		Permissions: map[string]bool{},
	}
	if err := session.UpsertEndpoint(endpoint); err != nil {
		return err
	}

	allowed := make(map[string]struct{}, len(endpoint.Commands))
	for _, command := range endpoint.Commands {
		allowed[command] = struct{}{}
	}

	return session.Serve(ctx, nexadapter.ControlServeHandlers{
		OnInvoke: func(callCtx context.Context, frame nexadapter.AdapterControlInvokeRequestFrame) (*nexadapter.AdapterControlInvokeResultFrame, error) {
			command := strings.TrimSpace(frame.Command)
			if _, ok := allowed[command]; !ok {
				return &nexadapter.AdapterControlInvokeResultFrame{
					Type:      "invoke.result",
					RequestID: frame.RequestID,
					OK:        false,
					Error: &nexadapter.AdapterControlInvokeError{
						Code:    "INVALID_REQUEST",
						Message: "unknown headless device command",
					},
				}, nil
			}

			var (
				resultPayload any
				handleErr     error
			)
			switch command {
			case "system.which":
				resultPayload, handleErr = handleSystemWhich(frame.Payload)
			case "system.run":
				resultPayload, handleErr = handleSystemRun(callCtx, frame.Payload)
			case "browser.proxy":
				resultPayload, handleErr = handleBrowserProxy(frame.Payload)
			default:
				handleErr = fmt.Errorf("unhandled command: %s", command)
			}
			if handleErr != nil {
				return &nexadapter.AdapterControlInvokeResultFrame{
					Type:      "invoke.result",
					RequestID: frame.RequestID,
					OK:        false,
					Error: &nexadapter.AdapterControlInvokeError{
						Code:    "UNAVAILABLE",
						Message: handleErr.Error(),
					},
				}, nil
			}

			return &nexadapter.AdapterControlInvokeResultFrame{
				Type:      "invoke.result",
				RequestID: frame.RequestID,
				OK:        true,
				Payload: map[string]any{
					"platform":    platformID,
					"endpoint_id": endpoint.EndpointID,
					"command":     command,
					"account":     fallbackAccount(account),
					"result":      resultPayload,
				},
			}, nil
		},
	})
}

func handleSystemWhich(payload any) (any, error) {
	record := asRecord(payload)
	bins := stringArray(record["bins"])
	if len(bins) == 0 {
		return nil, fmt.Errorf("system.which requires payload.bins")
	}

	rows := make([]map[string]any, 0, len(bins))
	for _, bin := range bins {
		path, err := exec.LookPath(bin)
		if err != nil {
			rows = append(rows, map[string]any{
				"name":  bin,
				"found": false,
			})
			continue
		}
		rows = append(rows, map[string]any{
			"name":  bin,
			"found": true,
			"path":  path,
		})
	}
	return map[string]any{"bins": rows}, nil
}

func handleSystemRun(parent context.Context, payload any) (any, error) {
	record := asRecord(payload)
	command := stringArray(record["command"])
	rawCommand := asString(record["rawCommand"])
	if rawCommand == "" {
		rawCommand = asString(record["raw_command"])
	}
	cwd := asString(record["cwd"])
	env := asStringMap(record["env"])
	timeoutMs := asInt(record["timeoutMs"])
	if timeoutMs <= 0 {
		timeoutMs = asInt(record["timeout_ms"])
	}
	if timeoutMs <= 0 {
		timeoutMs = defaultRunTimeoutMilli
	}

	if len(command) == 0 && rawCommand == "" {
		return nil, fmt.Errorf("system.run requires payload.command or payload.rawCommand")
	}

	ctx, cancel := context.WithTimeout(parent, time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()

	var cmd *exec.Cmd
	if rawCommand != "" {
		cmd = exec.CommandContext(ctx, "sh", "-lc", rawCommand)
	} else {
		cmd = exec.CommandContext(ctx, command[0], command[1:]...)
	}
	if cwd != "" {
		cmd.Dir = cwd
	}
	if len(env) > 0 {
		merged := append([]string{}, os.Environ()...)
		keys := make([]string, 0, len(env))
		for key := range env {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			merged = append(merged, fmt.Sprintf("%s=%s", key, env[key]))
		}
		cmd.Env = merged
	}

	var stdoutBuf bytes.Buffer
	var stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	runErr := cmd.Run()
	timedOut := ctx.Err() == context.DeadlineExceeded
	exitCode := 0
	if runErr != nil {
		if exitErr, ok := runErr.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else if timedOut {
			exitCode = -1
		} else {
			return nil, fmt.Errorf("system.run failed: %w", runErr)
		}
	}

	result := map[string]any{
		"stdout":    stdoutBuf.String(),
		"stderr":    stderrBuf.String(),
		"exit_code": exitCode,
		"timed_out": timedOut,
	}
	if rawCommand != "" {
		result["raw_command"] = rawCommand
	} else {
		result["command"] = command
	}
	if cwd != "" {
		result["cwd"] = cwd
	}
	return result, nil
}

func handleBrowserProxy(payload any) (any, error) {
	if !envBool("NEXUS_DEVICE_HEADLESS_BROWSER_PROXY_ENABLED", true) {
		return nil, fmt.Errorf("browser.proxy is disabled")
	}
	return map[string]any{
		"status":           "stubbed",
		"browser_proxy":    true,
		"received_payload": payload,
	}, nil
}

func setupStart(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return requiresSetupInput(req, "Confirm headless host process is running and pairing is approved."), nil
}

func setupSubmit(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	if !payloadConfirmed(req.Payload, "confirm_service_running") ||
		!payloadConfirmed(req.Payload, "confirm_paired") {
		return requiresSetupInput(req, "Setup incomplete: start host process and approve pairing first."), nil
	}
	return &nexadapter.AdapterSetupResult{
		Status:    nexadapter.SetupStatusCompleted,
		SessionID: setupSessionID(req.SessionID),
		Account:   fallbackAccount(req.Account),
		Service:   "device-headless",
		Message:   "Headless host setup completed.",
		Metadata: map[string]any{
			"platform":  platformID,
			"endpoint":  endpointID("NEXUS_DEVICE_HEADLESS_ENDPOINT_ID", "headless", req.Account),
			"completed": true,
		},
	}, nil
}

func setupStatus(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusPending,
		SessionID:    setupSessionID(req.SessionID),
		Account:      fallbackAccount(req.Account),
		Service:      "device-headless",
		Message:      "Awaiting setup confirmation.",
		Instructions: "Submit confirm_service_running=yes and confirm_paired=yes.",
		Fields:       setupFields(),
	}, nil
}

func setupCancel(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return &nexadapter.AdapterSetupResult{
		Status:    nexadapter.SetupStatusCancelled,
		SessionID: setupSessionID(req.SessionID),
		Account:   fallbackAccount(req.Account),
		Service:   "device-headless",
		Message:   "Headless host setup cancelled.",
	}, nil
}

func requiresSetupInput(req nexadapter.AdapterSetupRequest, message string) *nexadapter.AdapterSetupResult {
	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusRequiresInput,
		SessionID:    setupSessionID(req.SessionID),
		Account:      fallbackAccount(req.Account),
		Service:      "device-headless",
		Message:      message,
		Instructions: "Run headless host process, verify reachability, then approve pairing.",
		Fields:       setupFields(),
	}
}

func setupFields() []nexadapter.AdapterAuthField {
	return []nexadapter.AdapterAuthField{
		{
			Name:        "endpoint_hint",
			Label:       "Expected endpoint ID (optional)",
			Type:        "text",
			Required:    false,
			Placeholder: "headless-my-host",
		},
		{
			Name:     "confirm_service_running",
			Label:    "Headless host process running",
			Type:     "select",
			Required: true,
			Options: []nexadapter.AdapterAuthFieldOption{
				{Label: "Yes", Value: "yes"},
				{Label: "Not yet", Value: "no"},
			},
		},
		{
			Name:     "confirm_paired",
			Label:    "Device pairing approved",
			Type:     "select",
			Required: true,
			Options: []nexadapter.AdapterAuthFieldOption{
				{Label: "Yes", Value: "yes"},
				{Label: "Not yet", Value: "no"},
			},
		},
	}
}

func payloadConfirmed(payload map[string]any, key string) bool {
	if payload == nil {
		return false
	}
	raw, ok := payload[key]
	if !ok {
		return false
	}
	switch value := raw.(type) {
	case bool:
		return value
	case string:
		normalized := strings.ToLower(strings.TrimSpace(value))
		return normalized == "yes" || normalized == "true" || normalized == "1"
	case float64:
		return value == 1
	case int:
		return value == 1
	default:
		return false
	}
}

func headlessCaps() []string {
	caps := []string{"system"}
	if envBool("NEXUS_DEVICE_HEADLESS_BROWSER_PROXY_ENABLED", true) {
		caps = append(caps, "browser")
	}
	return caps
}

func headlessCommands() []string {
	commands := []string{"system.run", "system.which"}
	if envBool("NEXUS_DEVICE_HEADLESS_BROWSER_PROXY_ENABLED", true) {
		commands = append(commands, "browser.proxy")
	}
	return commands
}

func asRecord(value any) map[string]any {
	record, ok := value.(map[string]any)
	if !ok || record == nil {
		return map[string]any{}
	}
	return record
}

func stringArray(value any) []string {
	array, ok := value.([]any)
	if !ok {
		return []string{}
	}
	out := make([]string, 0, len(array))
	for _, entry := range array {
		parsed := asString(entry)
		if parsed == "" {
			continue
		}
		out = append(out, parsed)
	}
	return out
}

func asString(value any) string {
	parsed, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(parsed)
}

func asStringMap(value any) map[string]string {
	raw, ok := value.(map[string]any)
	if !ok {
		return map[string]string{}
	}
	out := make(map[string]string)
	for key, entry := range raw {
		parsedKey := strings.TrimSpace(key)
		if parsedKey == "" {
			continue
		}
		parsedValue := asString(entry)
		if parsedValue == "" {
			continue
		}
		out[parsedKey] = parsedValue
	}
	return out
}

func asInt(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	default:
		return 0
	}
}

func setupSessionID(sessionID string) string {
	trimmed := strings.TrimSpace(sessionID)
	if trimmed == "" {
		return fmt.Sprintf("headless-setup-%d", time.Now().UnixNano())
	}
	return trimmed
}

func endpointID(envName, prefix, account string) string {
	if value := strings.TrimSpace(os.Getenv(envName)); value != "" {
		return value
	}
	return fmt.Sprintf("%s-%s", prefix, sanitizeToken(fallbackAccount(account)))
}

func fallbackAccount(account string) string {
	trimmed := strings.TrimSpace(strings.ToLower(account))
	if trimmed == "" {
		return "default"
	}
	return trimmed
}

func envBool(name string, fallback bool) bool {
	raw := strings.TrimSpace(strings.ToLower(os.Getenv(name)))
	if raw == "" {
		return fallback
	}
	return raw == "1" || raw == "true" || raw == "yes" || raw == "y"
}

func sanitizeToken(raw string) string {
	trimmed := strings.TrimSpace(strings.ToLower(raw))
	if trimmed == "" {
		return "default"
	}
	var b strings.Builder
	for _, ch := range trimmed {
		switch {
		case ch >= 'a' && ch <= 'z':
			b.WriteRune(ch)
		case ch >= '0' && ch <= '9':
			b.WriteRune(ch)
		case ch == '-', ch == '_', ch == '.':
			b.WriteRune(ch)
		default:
			b.WriteByte('-')
		}
	}
	value := strings.Trim(b.String(), "-._")
	if value == "" {
		return "default"
	}
	return value
}
