package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"sort"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	edgeConnectCommand           = "edge.connect.start"
	defaultEdgeHeartbeatInterval = 30 * time.Second
	defaultEdgeReconnectMinDelay = 1 * time.Second
	defaultEdgeReconnectMaxDelay = 30 * time.Second
	runtimeRequestTimeout        = 30 * time.Second
	runtimeProtocolVersion       = 3
	runtimeClientID              = "runtime-client"
	runtimeClientMode            = "backend"
)

type edgeConnectOptions struct {
	ConnectionID      string
	RuntimeURL        string
	RuntimeToken      string
	EdgeID            string
	DisplayName       string
	ReconnectMinDelay time.Duration
	ReconnectMaxDelay time.Duration
	Dialer            *websocket.Dialer
	HealthFn          func(context.Context, string) (*nexadapter.AdapterHealth, error)
	StreamFn          func(context.Context, string, *edgeSessionTransport) error
	SendFn            func(context.Context, imessageSendRequest) (*imessageMethodResult, error)
	StageBackfillFn   func(context.Context, string, map[string]any) (any, error)
}

type runtimeRequestFrame struct {
	Type   string         `json:"type"`
	ID     string         `json:"id"`
	Method string         `json:"method"`
	Params map[string]any `json:"params,omitempty"`
}

type runtimeErrorShape struct {
	Message string `json:"message"`
}

type runtimeResponseFrame struct {
	Type    string             `json:"type"`
	ID      string             `json:"id"`
	OK      bool               `json:"ok"`
	Payload json.RawMessage    `json:"payload,omitempty"`
	Error   *runtimeErrorShape `json:"error,omitempty"`
}

type edgeRegisterResponse struct {
	SessionID           string `json:"sessionId"`
	Status              string `json:"status"`
	HeartbeatIntervalMs int64  `json:"heartbeatIntervalMs"`
}

func maybeRunEdgeConnectCommand() (bool, int) {
	if len(os.Args) < 2 || strings.TrimSpace(os.Args[1]) != edgeConnectCommand {
		return false, 0
	}

	opts, err := parseEdgeConnectOptions(os.Args[2:])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return true, 2
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := runEdgeConnector(ctx, opts); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return true, 1
	}
	return true, 0
}

func parseEdgeConnectOptions(args []string) (edgeConnectOptions, error) {
	fs := flag.NewFlagSet(edgeConnectCommand, flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	connectionID := fs.String("connection", strings.TrimSpace(os.Getenv("EVE_EDGE_CONNECTION_ID")), "Eve connection id")
	runtimeURL := fs.String("runtime-url", strings.TrimSpace(os.Getenv("NEXUS_RUNTIME_URL")), "Nex runtime websocket url")
	runtimeToken := fs.String("runtime-token", strings.TrimSpace(os.Getenv("NEXUS_RUNTIME_TOKEN")), "Nex runtime auth token")
	edgeID := fs.String("edge-id", strings.TrimSpace(os.Getenv("EVE_EDGE_ID")), "Stable Eve edge id")
	displayName := fs.String("display-name", strings.TrimSpace(os.Getenv("EVE_EDGE_DISPLAY_NAME")), "Eve edge display name")
	reconnectMin := fs.Duration("reconnect-min", defaultEdgeReconnectMinDelay, "Minimum reconnect delay")
	reconnectMax := fs.Duration("reconnect-max", defaultEdgeReconnectMaxDelay, "Maximum reconnect delay")

	if err := fs.Parse(args); err != nil {
		return edgeConnectOptions{}, err
	}

	surface := currentSessionSurface()
	connection := strings.TrimSpace(*connectionID)
	if connection == "" {
		connection = defaultConnectionIDFromSurface(surface)
	}

	wsURL := strings.TrimSpace(*runtimeURL)
	if wsURL == "" {
		return edgeConnectOptions{}, fmt.Errorf("%s requires --runtime-url or NEXUS_RUNTIME_URL", edgeConnectCommand)
	}

	token := strings.TrimSpace(*runtimeToken)
	if token == "" {
		return edgeConnectOptions{}, fmt.Errorf("%s requires --runtime-token or NEXUS_RUNTIME_TOKEN", edgeConnectCommand)
	}

	host, err := os.Hostname()
	if err != nil || strings.TrimSpace(host) == "" {
		host = strings.TrimSpace(surface.Hostname)
	}
	if strings.TrimSpace(host) == "" {
		host = "eve-edge"
	}

	parsedEdgeID := strings.TrimSpace(*edgeID)
	if parsedEdgeID == "" {
		parsedEdgeID = fmt.Sprintf("%s:%s", host, connection)
	}

	parsedDisplayName := strings.TrimSpace(*displayName)
	if parsedDisplayName == "" {
		parsedDisplayName = defaultDisplayNameFromSurface(surface)
	}

	minDelay := *reconnectMin
	maxDelay := *reconnectMax
	if minDelay <= 0 {
		minDelay = defaultEdgeReconnectMinDelay
	}
	if maxDelay < minDelay {
		maxDelay = minDelay
	}

	return edgeConnectOptions{
		ConnectionID:      connection,
		RuntimeURL:        wsURL,
		RuntimeToken:      token,
		EdgeID:            parsedEdgeID,
		DisplayName:       parsedDisplayName,
		ReconnectMinDelay: minDelay,
		ReconnectMaxDelay: maxDelay,
		Dialer:            websocket.DefaultDialer,
		HealthFn:          eveHealth,
	}, nil
}

func runEdgeConnector(ctx context.Context, opts edgeConnectOptions) error {
	if opts.HealthFn == nil {
		opts.HealthFn = eveHealth
	}
	if opts.ReconnectMinDelay <= 0 {
		opts.ReconnectMinDelay = defaultEdgeReconnectMinDelay
	}
	if opts.ReconnectMaxDelay < opts.ReconnectMinDelay {
		opts.ReconnectMaxDelay = opts.ReconnectMinDelay
	}

	reconnectDelay := opts.ReconnectMinDelay
	for {
		err := runEdgeSession(ctx, opts)
		if err == nil || errors.Is(err, context.Canceled) {
			return nil
		}
		if ctx.Err() != nil {
			return nil
		}

		nexadapter.LogError("edge session ended: %v", err)
		nexadapter.LogInfo("reconnecting Eve edge in %s", reconnectDelay)

		timer := time.NewTimer(reconnectDelay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil
		case <-timer.C:
		}

		reconnectDelay *= 2
		if reconnectDelay > opts.ReconnectMaxDelay {
			reconnectDelay = opts.ReconnectMaxDelay
		}
	}
}

func runEdgeSession(ctx context.Context, opts edgeConnectOptions) error {
	transport, registered, err := connectEdgeSession(ctx, opts)
	if err != nil {
		return err
	}
	defer transport.close()
	streamCtx := transport.context()
	streamFn := opts.StreamFn
	if streamFn == nil {
		streamFn = runEdgeMonitorStream
	}

	heartbeatEvery := defaultEdgeHeartbeatInterval
	if registered.HeartbeatIntervalMs > 0 {
		heartbeatEvery = time.Duration(registered.HeartbeatIntervalMs) * time.Millisecond
	}
	nexadapter.LogInfo(
		"edge paired session=%s status=%s heartbeat=%s connection=%s",
		registered.SessionID,
		registered.Status,
		heartbeatEvery,
		opts.ConnectionID,
	)

	ticker := time.NewTicker(heartbeatEvery)
	defer ticker.Stop()

	streamErrors := make(chan error, 1)
	go func() {
		streamErrors <- streamFn(streamCtx, opts.ConnectionID, transport)
	}()

	for {
		select {
		case <-streamCtx.Done():
			return nil
		case err := <-streamErrors:
			if err == nil || errors.Is(err, context.Canceled) {
				if streamCtx.Err() != nil {
					return nil
				}
				return err
			}
			return err
		case <-ticker.C:
			heartbeatPayload, err := buildEdgeHeartbeatPayload(streamCtx, opts, registered.SessionID)
			if err != nil {
				return err
			}
			if _, err := transport.call(streamCtx, "adapters.edges.heartbeat", heartbeatPayload); err != nil {
				if streamCtx.Err() != nil || errors.Is(err, context.Canceled) {
					return nil
				}
				return fmt.Errorf("edge heartbeat failed: %w", err)
			}
		}
	}
}

func connectEdgeSession(
	ctx context.Context,
	opts edgeConnectOptions,
) (*edgeSessionTransport, edgeRegisterResponse, error) {
	dialer := opts.Dialer
	if dialer == nil {
		dialer = websocket.DefaultDialer
	}

	header := http.Header{}
	conn, resp, err := dialer.DialContext(ctx, opts.RuntimeURL, header)
	if err != nil {
		if resp != nil {
			return nil, edgeRegisterResponse{}, fmt.Errorf("dial runtime websocket: %w (http %s)", err, resp.Status)
		}
		return nil, edgeRegisterResponse{}, fmt.Errorf("dial runtime websocket: %w", err)
	}

	sendFn := opts.SendFn
	if sendFn == nil {
		sendFn = eveSend
	}
	stageBackfillFn := opts.StageBackfillFn
	if stageBackfillFn == nil {
		stageBackfillFn = func(ctx context.Context, connectionID string, payload map[string]any) (any, error) {
			return eveStageBackfill(ctx, connectionID, payload)
		}
	}
	session := newEdgeRuntimeSession(ctx, conn, func(reqCtx context.Context, request runtimeRequestFrame) (any, error) {
		requestConnectionID := stringFromAny(request.Params["connection_id"])
		if strings.TrimSpace(requestConnectionID) == "" {
			requestConnectionID = opts.ConnectionID
		} else if requestConnectionID != opts.ConnectionID {
			return nil, fmt.Errorf(
				"edge session bound to connection %s, got request for %s",
				opts.ConnectionID,
				requestConnectionID,
			)
		}
		return handleEdgeRuntimeMethod(
			reqCtx,
			request.Method,
			requestConnectionID,
			request.Params,
			sendFn,
			stageBackfillFn,
		)
	})

	connectPayload := map[string]any{
		"minProtocol": runtimeProtocolVersion,
		"maxProtocol": runtimeProtocolVersion,
		"client": map[string]any{
			"id":          runtimeClientID,
			"displayName": opts.DisplayName,
			"version":     adapterVersion,
			"platform":    "darwin",
			"mode":        runtimeClientMode,
			"instanceId":  opts.EdgeID,
		},
		"role": "operator",
		"auth": map[string]any{
			"token": opts.RuntimeToken,
		},
	}

	if _, err := session.call(ctx, "connect", connectPayload); err != nil {
		session.close()
		return nil, edgeRegisterResponse{}, fmt.Errorf("runtime connect failed: %w", err)
	}
	session.setReady(true)

	registerPayload, err := buildEdgeRegisterPayload(ctx, opts)
	if err != nil {
		session.close()
		return nil, edgeRegisterResponse{}, err
	}
	registerBody, err := session.call(ctx, "adapters.edges.register", registerPayload)
	if err != nil {
		session.close()
		return nil, edgeRegisterResponse{}, fmt.Errorf("edge register failed: %w", err)
	}

	var registered edgeRegisterResponse
	if err := json.Unmarshal(registerBody, &registered); err != nil {
		session.close()
		return nil, edgeRegisterResponse{}, fmt.Errorf("decode edge register response: %w", err)
	}
	if strings.TrimSpace(registered.SessionID) == "" {
		session.close()
		return nil, edgeRegisterResponse{}, fmt.Errorf("edge register response missing sessionId")
	}

	session.setReady(true)
	return newEdgeSessionTransport(session, registered.SessionID), registered, nil
}

func buildEdgeRegisterPayload(ctx context.Context, opts edgeConnectOptions) (map[string]any, error) {
	health, err := opts.HealthFn(ctx, opts.ConnectionID)
	if err != nil {
		return nil, fmt.Errorf("collect Eve health: %w", err)
	}
	return map[string]any{
		"adapter":      adapterName,
		"connectionId": opts.ConnectionID,
		"edgeId":       opts.EdgeID,
		"displayName":  opts.DisplayName,
		"version":      adapterVersion,
		"platform":     platformID,
		"capabilities": edgeCapabilitiesSnapshot(),
		"health":       edgeHealthSnapshot(health),
	}, nil
}

func buildEdgeHeartbeatPayload(
	ctx context.Context,
	opts edgeConnectOptions,
	sessionID string,
) (map[string]any, error) {
	health, err := opts.HealthFn(ctx, opts.ConnectionID)
	if err != nil {
		return nil, fmt.Errorf("collect Eve health: %w", err)
	}
	return map[string]any{
		"sessionId":    sessionID,
		"capabilities": edgeCapabilitiesSnapshot(),
		"health":       edgeHealthSnapshot(health),
	}, nil
}

func edgeCapabilitiesSnapshot() map[string]any {
	discovered := currentActionCapabilities()
	caps := discovered.ChannelCapabilities
	methods := append([]string(nil), discovered.SupportedMethods...)
	sort.Strings(methods)
	declaredMethods := append([]string(nil), discovered.DeclaredMethods...)
	sort.Strings(declaredMethods)
	return map[string]any{
		"text_limit":           caps.TextLimit,
		"supports_markdown":    caps.SupportsMarkdown,
		"supports_tables":      caps.SupportsTables,
		"supports_code_blocks": caps.SupportsCodeBlocks,
		"supports_embeds":      caps.SupportsEmbeds,
		"supports_threads":     caps.SupportsThreads,
		"supports_reactions":   caps.SupportsReactions,
		"supports_polls":       caps.SupportsPolls,
		"supports_buttons":     caps.SupportsButtons,
		"supports_edit":        caps.SupportsEdit,
		"supports_delete":      caps.SupportsDelete,
		"supports_media":       caps.SupportsMedia,
		"supports_voice_notes": caps.SupportsVoiceNotes,
		"methods":              methods,
		"declared_methods":     declaredMethods,
		"action_executor":      discovered.Executor,
		"supports_inline_media":              discovered.DetailFields["supports_inline_media"],
		"supports_file_attachments":          discovered.DetailFields["supports_file_attachments"],
		"supports_reply":                     discovered.DetailFields["supports_reply"],
		"supports_reaction_add":              discovered.DetailFields["supports_reaction_add"],
		"supports_reaction_remove":           discovered.DetailFields["supports_reaction_remove"],
		"supports_edit_message":              discovered.DetailFields["supports_edit_message"],
		"supports_unsend_message":            discovered.DetailFields["supports_unsend_message"],
		"supports_thread_create":             discovered.DetailFields["supports_thread_create"],
		"supports_thread_rename":             discovered.DetailFields["supports_thread_rename"],
		"supports_thread_participants_add":   discovered.DetailFields["supports_thread_participants_add"],
		"supports_thread_participants_remove": discovered.DetailFields["supports_thread_participants_remove"],
	}
}

func edgeHealthSnapshot(health *nexadapter.AdapterHealth) map[string]any {
	if health == nil {
		return map[string]any{
			"connected": false,
			"error":     "health unavailable",
		}
	}
	out := map[string]any{
		"connected": health.Connected,
	}
	if health.ConnectionID != "" {
		out["connectionId"] = health.ConnectionID
	}
	if health.Account != "" {
		out["account"] = health.Account
	}
	if health.LastEventAt > 0 {
		out["lastEventAt"] = health.LastEventAt
	}
	if health.Error != "" {
		out["error"] = health.Error
	}
	if len(health.Details) > 0 {
		out["details"] = health.Details
	}
	return out
}
