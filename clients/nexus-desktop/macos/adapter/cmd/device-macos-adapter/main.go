package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	adapterName    = "device-macos-adapter"
	adapterVersion = "0.1.0"
	platformID     = "macos"
)

var macosCaps = []string{
	"canvas",
	"camera",
	"screen",
	"location",
}

var macosCommands = []string{
	"canvas.present",
	"canvas.hide",
	"canvas.navigate",
	"canvas.eval",
	"canvas.snapshot",
	"canvas.a2ui.push",
	"canvas.a2ui.pushJSONL",
	"canvas.a2ui.reset",
	"camera.list",
	"camera.snap",
	"camera.clip",
	"location.get",
	"screen.record",
	"system.notify",
	"system.which",
	"system.run",
}

func main() {
	nexadapter.Run(nexadapter.DefineAdapter(adapterConfig()))
}

func adapterConfig() nexadapter.DefineAdapterConfig[struct{}] {
	return nexadapter.DefineAdapterConfig[struct{}]{
		Platform: platformID,
		Name:     adapterName,
		Version:  adapterVersion,
		Connection: nexadapter.ConnectionHandlers[struct{}]{
			Accounts: func(ctx nexadapter.AdapterContext[struct{}]) ([]nexadapter.AdapterAccount, error) {
				return accounts(ctx.Context)
			},
			Health: func(ctx nexadapter.AdapterContext[struct{}]) (*nexadapter.AdapterHealth, error) {
				return health(ctx.Context, ctx.ConnectionID)
			},
		},
		Setup: nexadapter.SetupHandlers[struct{}]{
			Start: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
				return setupStart(ctx.Context, req)
			},
			Submit: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
				return setupSubmit(ctx.Context, req)
			},
			Status: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
				return setupStatus(ctx.Context, req)
			},
			Cancel: func(ctx nexadapter.AdapterContext[struct{}], req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
				return setupCancel(ctx.Context, req)
			},
		},
		ServeStart: func(ctx context.Context, connectionID string, session *nexadapter.ServeSession) error {
			return serveStart(ctx, connectionID, session)
		},
		Methods:           map[string]nexadapter.DeclaredMethod[struct{}]{},
		CredentialService: "device",
		MultiAccount:      true,
		Auth: &nexadapter.AdapterAuthManifest{
			Methods: []nexadapter.AdapterAuthMethod{
				{
					ID:      "device_macos_pairing",
					Type:    "custom_flow",
					Label:   "Connect macOS Companion",
					Icon:    "laptop",
					Service: "device-macos",
					Fields:  setupFields(),
				},
			},
			SetupGuide: "Install Nexus macOS app, enable required system permissions (camera/screen/location/full disk where applicable), then approve device pairing.",
		},
		Capabilities: nexadapter.ChannelCapabilities{
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
	}
}

func info(ctx context.Context) (*nexadapter.AdapterInfo, error) {
	adapter := nexadapter.DefineAdapter(adapterConfig())
	return adapter.Operations.AdapterInfo(ctx)
}

func accounts(_ context.Context) ([]nexadapter.AdapterAccount, error) {
	return []nexadapter.AdapterAccount{
		{
			ID:            "default",
			DisplayName:   "Default macOS host",
			CredentialRef: "device/default",
			Status:        "ready",
		},
	}, nil
}

func health(_ context.Context, connectionID string) (*nexadapter.AdapterHealth, error) {
	return &nexadapter.AdapterHealth{
		Connected:    envBool("NEXUS_DEVICE_MACOS_CONNECTED", true),
		ConnectionID: fallbackConnectionID(connectionID),
		LastEventAt:  time.Now().UnixMilli(),
		Details: map[string]any{
			"platform":   platformID,
			"mode":       "device_control",
			"caps":       macosCaps,
			"commands":   len(macosCommands),
			"adapter_id": platformID,
		},
	}, nil
}

func serveStart(ctx context.Context, connectionID string, session *nexadapter.ServeSession) error {
	endpoint := nexadapter.AdapterServeEndpoint{
		EndpointID:  endpointID("NEXUS_DEVICE_MACOS_ENDPOINT_ID", "macos", connectionID),
		DisplayName: "macOS Companion",
		Platform:    platformID,
		Caps:        append([]string{}, macosCaps...),
		Commands:    append([]string{}, macosCommands...),
		Permissions: map[string]bool{},
	}
	if err := session.UpsertEndpoint(endpoint); err != nil {
		return err
	}

	allowed := make(map[string]struct{}, len(endpoint.Commands))
	for _, command := range endpoint.Commands {
		allowed[command] = struct{}{}
	}

	return session.Serve(ctx, nexadapter.ServeHandlers{
		OnInvoke: func(_ context.Context, frame nexadapter.AdapterServeInvokeRequestFrame) (*nexadapter.AdapterServeInvokeResultFrame, error) {
			if _, ok := allowed[strings.TrimSpace(frame.Command)]; !ok {
				return &nexadapter.AdapterServeInvokeResultFrame{
					Type:      "invoke.result",
					RequestID: frame.RequestID,
					OK:        false,
					Error: &nexadapter.AdapterServeInvokeError{
						Code:    "INVALID_REQUEST",
						Message: "unknown macOS device command",
					},
				}, nil
			}
			return &nexadapter.AdapterServeInvokeResultFrame{
				Type:      "invoke.result",
				RequestID: frame.RequestID,
				OK:        true,
				Payload: map[string]any{
					"platform":         platformID,
					"endpoint_id":      endpoint.EndpointID,
					"command":          frame.Command,
					"connection":       fallbackConnectionID(connectionID),
					"received_payload": frame.Payload,
					"status":           "stubbed",
				},
			}, nil
		},
	})
}

func setupStart(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return requiresSetupInput(req, "Confirm macOS companion install, permissions, and pairing to complete setup."), nil
}

func setupSubmit(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	if !payloadConfirmed(req.Payload, "confirm_companion_installed") ||
		!payloadConfirmed(req.Payload, "confirm_permissions_granted") ||
		!payloadConfirmed(req.Payload, "confirm_paired") {
		return requiresSetupInput(req, "Setup incomplete: install companion, grant permissions, and approve pairing first."), nil
	}
	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusCompleted,
		SessionID:    setupSessionID(req.SessionID),
		ConnectionID: fallbackConnectionID(req.ConnectionID),
		Service:      "device-macos",
		Message:      "macOS companion setup completed.",
		Metadata: map[string]any{
			"platform":  platformID,
			"endpoint":  endpointID("NEXUS_DEVICE_MACOS_ENDPOINT_ID", "macos", req.ConnectionID),
			"completed": true,
		},
	}, nil
}

func setupStatus(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusPending,
		SessionID:    setupSessionID(req.SessionID),
		ConnectionID: fallbackConnectionID(req.ConnectionID),
		Service:      "device-macos",
		Message:      "Awaiting setup confirmation.",
		Instructions: "Submit confirm_companion_installed=yes, confirm_permissions_granted=yes, and confirm_paired=yes.",
		Fields:       setupFields(),
	}, nil
}

func setupCancel(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusCancelled,
		SessionID:    setupSessionID(req.SessionID),
		ConnectionID: fallbackConnectionID(req.ConnectionID),
		Service:      "device-macos",
		Message:      "macOS companion setup cancelled.",
	}, nil
}

func requiresSetupInput(req nexadapter.AdapterSetupRequest, message string) *nexadapter.AdapterSetupResult {
	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusRequiresInput,
		SessionID:    setupSessionID(req.SessionID),
		ConnectionID: fallbackConnectionID(req.ConnectionID),
		Service:      "device-macos",
		Message:      message,
		Instructions: "Install the macOS companion app, grant required permissions, then approve pairing.",
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
			Placeholder: "macos-my-device",
		},
		{
			Name:     "confirm_companion_installed",
			Label:    "Companion app installed",
			Type:     "select",
			Required: true,
			Options: []nexadapter.AdapterAuthFieldOption{
				{Label: "Yes", Value: "yes"},
				{Label: "Not yet", Value: "no"},
			},
		},
		{
			Name:     "confirm_permissions_granted",
			Label:    "Permissions granted",
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

func setupSessionID(sessionID string) string {
	trimmed := strings.TrimSpace(sessionID)
	if trimmed == "" {
		return fmt.Sprintf("macos-setup-%d", time.Now().UnixNano())
	}
	return trimmed
}

func endpointID(envName, prefix, connectionID string) string {
	if value := strings.TrimSpace(os.Getenv(envName)); value != "" {
		return value
	}
	return fmt.Sprintf("%s-%s", prefix, sanitizeToken(fallbackConnectionID(connectionID)))
}

func fallbackConnectionID(connectionID string) string {
	trimmed := strings.TrimSpace(strings.ToLower(connectionID))
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
