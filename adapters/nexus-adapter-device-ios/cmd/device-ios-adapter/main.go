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
	adapterName    = "device-ios-adapter"
	adapterVersion = "0.1.0"
	platformID     = "ios"
)

var iosCaps = []string{
	"canvas",
	"camera",
	"screen",
	"voiceWake",
	"location",
	"device",
	"photos",
	"contacts",
	"calendar",
	"reminders",
	"motion",
}

var iosCommands = []string{
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
	"chat.push",
	"talk.ptt.start",
	"talk.ptt.stop",
	"talk.ptt.cancel",
	"talk.ptt.once",
	"device.status",
	"device.info",
	"photos.latest",
	"contacts.search",
	"contacts.add",
	"calendar.events",
	"calendar.add",
	"reminders.list",
	"reminders.add",
	"motion.activity",
	"motion.pedometer",
}

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
					Label:   "Connect iOS Companion",
					Icon:    "phone",
					Service: "device-ios",
					Fields:  setupFields(),
				},
			},
			SetupGuide: "Install Nexus iOS app, connect it to your runtime, then approve pairing via device.pair.* before invoking commands.",
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
			DisplayName:   "Default iOS host",
			CredentialRef: "device/default",
			Status:        "ready",
		},
	}, nil
}

func health(_ context.Context, account string) (*nexadapter.AdapterHealth, error) {
	return &nexadapter.AdapterHealth{
		Connected:   envBool("NEXUS_DEVICE_IOS_CONNECTED", true),
		Account:     fallbackAccount(account),
		LastEventAt: time.Now().UnixMilli(),
		Details: map[string]any{
			"platform":   platformID,
			"mode":       "device_control",
			"caps":       iosCaps,
			"commands":   len(iosCommands),
			"adapter_id": platformID,
		},
	}, nil
}

func controlStart(ctx context.Context, account string, session *nexadapter.ControlSession) error {
	endpoint := nexadapter.AdapterControlEndpoint{
		EndpointID:  endpointID("NEXUS_DEVICE_IOS_ENDPOINT_ID", "ios", account),
		DisplayName: "iOS Companion",
		Platform:    platformID,
		Caps:        append([]string{}, iosCaps...),
		Commands:    append([]string{}, iosCommands...),
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
		OnInvoke: func(_ context.Context, frame nexadapter.AdapterControlInvokeRequestFrame) (*nexadapter.AdapterControlInvokeResultFrame, error) {
			if _, ok := allowed[strings.TrimSpace(frame.Command)]; !ok {
				return &nexadapter.AdapterControlInvokeResultFrame{
					Type:      "invoke.result",
					RequestID: frame.RequestID,
					OK:        false,
					Error: &nexadapter.AdapterControlInvokeError{
						Code:    "INVALID_REQUEST",
						Message: "unknown iOS device command",
					},
				}, nil
			}
			return &nexadapter.AdapterControlInvokeResultFrame{
				Type:      "invoke.result",
				RequestID: frame.RequestID,
				OK:        true,
				Payload: map[string]any{
					"platform":         platformID,
					"endpoint_id":      endpoint.EndpointID,
					"command":          frame.Command,
					"account":          fallbackAccount(account),
					"received_payload": frame.Payload,
					"status":           "stubbed",
				},
			}, nil
		},
	})
}

func setupStart(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return requiresSetupInput(req, "Confirm iOS companion install and pairing to complete setup."), nil
}

func setupSubmit(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	if !payloadConfirmed(req.Payload, "confirm_companion_installed") ||
		!payloadConfirmed(req.Payload, "confirm_paired") {
		return requiresSetupInput(req, "Setup incomplete: install companion and approve pairing first."), nil
	}
	return &nexadapter.AdapterSetupResult{
		Status:    nexadapter.SetupStatusCompleted,
		SessionID: setupSessionID(req.SessionID),
		Account:   fallbackAccount(req.Account),
		Service:   "device-ios",
		Message:   "iOS companion setup completed.",
		Metadata: map[string]any{
			"platform":  platformID,
			"endpoint":  endpointID("NEXUS_DEVICE_IOS_ENDPOINT_ID", "ios", req.Account),
			"completed": true,
		},
	}, nil
}

func setupStatus(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusPending,
		SessionID:    setupSessionID(req.SessionID),
		Account:      fallbackAccount(req.Account),
		Service:      "device-ios",
		Message:      "Awaiting setup confirmation.",
		Instructions: "Submit confirm_companion_installed=yes and confirm_paired=yes to complete setup.",
		Fields:       setupFields(),
	}, nil
}

func setupCancel(_ context.Context, req nexadapter.AdapterSetupRequest) (*nexadapter.AdapterSetupResult, error) {
	return &nexadapter.AdapterSetupResult{
		Status:    nexadapter.SetupStatusCancelled,
		SessionID: setupSessionID(req.SessionID),
		Account:   fallbackAccount(req.Account),
		Service:   "device-ios",
		Message:   "iOS companion setup cancelled.",
	}, nil
}

func requiresSetupInput(req nexadapter.AdapterSetupRequest, message string) *nexadapter.AdapterSetupResult {
	return &nexadapter.AdapterSetupResult{
		Status:       nexadapter.SetupStatusRequiresInput,
		SessionID:    setupSessionID(req.SessionID),
		Account:      fallbackAccount(req.Account),
		Service:      "device-ios",
		Message:      message,
		Instructions: "Install the iOS companion app, connect it to runtime, then approve device pairing.",
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
			Placeholder: "ios-my-device",
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
		return fmt.Sprintf("ios-setup-%d", time.Now().UnixNano())
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
