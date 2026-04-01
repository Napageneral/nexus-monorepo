package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestRunEdgeSessionRegistersAndHeartbeats(t *testing.T) {
	upgrader := websocket.Upgrader{}
	var registerCalls atomic.Int32
	var heartbeatCalls atomic.Int32

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade websocket: %v", err)
			return
		}
		defer conn.Close()

		if err := conn.WriteJSON(map[string]any{
			"type":    "event",
			"event":   "connect.challenge",
			"payload": map[string]any{"nonce": "test"},
		}); err != nil {
			t.Errorf("write challenge: %v", err)
			return
		}

		connectReq := readRuntimeRequest(t, conn)
		if connectReq.Method != "connect" {
			t.Fatalf("expected connect request, got %q", connectReq.Method)
		}
		if connectReq.Params["minProtocol"] != float64(runtimeProtocolVersion) {
			t.Fatalf("expected minProtocol %d, got %#v", runtimeProtocolVersion, connectReq.Params["minProtocol"])
		}
		if connectReq.Params["maxProtocol"] != float64(runtimeProtocolVersion) {
			t.Fatalf("expected maxProtocol %d, got %#v", runtimeProtocolVersion, connectReq.Params["maxProtocol"])
		}
		if auth, _ := connectReq.Params["auth"].(map[string]any); strings.TrimSpace(stringFromAny(auth["token"])) != "runtime-token" {
			t.Fatalf("expected runtime token in connect request, got %#v", connectReq.Params["auth"])
		}
		if client, _ := connectReq.Params["client"].(map[string]any); strings.TrimSpace(stringFromAny(client["instanceId"])) != "edge-1" {
			t.Fatalf("expected edge instance id, got %#v", connectReq.Params["client"])
		}
		writeRuntimeResponse(t, conn, connectReq.ID, map[string]any{
			"type": "hello-ok",
		})

		registerReq := readRuntimeRequest(t, conn)
		if registerReq.Method != "adapters.edges.register" {
			t.Fatalf("expected register request, got %q", registerReq.Method)
		}
		registerCalls.Add(1)
		if strings.TrimSpace(stringFromAny(registerReq.Params["connectionId"])) != "conn-test" {
			t.Fatalf("expected connectionId conn-test, got %#v", registerReq.Params["connectionId"])
		}
		if capabilities, _ := registerReq.Params["capabilities"].(map[string]any); !containsString(methodsFromAny(capabilities["methods"]), "imessage.send") {
			t.Fatalf("expected imessage.send capability, got %#v", registerReq.Params["capabilities"])
		} else {
			if containsString(methodsFromAny(capabilities["methods"]), "imessage.reply") {
				t.Fatalf("did not expect imessage.reply to be advertised as supported, got %#v", registerReq.Params["capabilities"])
			}
			if !containsString(methodsFromAny(capabilities["declared_methods"]), "imessage.reply") {
				t.Fatalf("expected imessage.reply to remain declared, got %#v", registerReq.Params["capabilities"])
			}
			if stringFromAny(capabilities["action_executor"]) != actionExecutorAppleScriptSendOnly {
				t.Fatalf("expected applescript executor snapshot, got %#v", capabilities["action_executor"])
			}
			if capabilities["supports_inline_media"] != true {
				t.Fatalf("expected inline media parity to be advertised, got %#v", capabilities["supports_inline_media"])
			}
			if capabilities["supports_file_attachments"] != true {
				t.Fatalf("expected file attachment support to remain true, got %#v", capabilities["supports_file_attachments"])
			}
		}
		if health, _ := registerReq.Params["health"].(map[string]any); health["connected"] != true {
			t.Fatalf("expected connected health snapshot, got %#v", registerReq.Params["health"])
		}
		writeRuntimeResponse(t, conn, registerReq.ID, map[string]any{
			"sessionId":           "session-1",
			"status":              "paired",
			"heartbeatIntervalMs": 10,
		})

		heartbeatReq := readRuntimeRequest(t, conn)
		if heartbeatReq.Method != "adapters.edges.heartbeat" {
			t.Fatalf("expected heartbeat request, got %q", heartbeatReq.Method)
		}
		heartbeatCalls.Add(1)
		if strings.TrimSpace(stringFromAny(heartbeatReq.Params["sessionId"])) != "session-1" {
			t.Fatalf("expected session-1 heartbeat sessionId, got %#v", heartbeatReq.Params["sessionId"])
		}
		writeRuntimeResponse(t, conn, heartbeatReq.ID, map[string]any{
			"status": "paired",
		})
		cancel()
	}))
	defer server.Close()

	opts := edgeConnectOptions{
		ConnectionID: "conn-test",
		RuntimeURL:   strings.Replace(server.URL, "http://", "ws://", 1),
		RuntimeToken: "runtime-token",
		EdgeID:       "edge-1",
		DisplayName:  "Eve Test Edge",
		HealthFn: func(context.Context, string) (*nexadapter.AdapterHealth, error) {
			return &nexadapter.AdapterHealth{
				ConnectionID: "conn-test",
				Account:      "eve@example.test",
				Connected:    true,
				LastEventAt:  12345,
				Details: map[string]any{
					"warehouse": "ready",
				},
			}, nil
		},
		StreamFn: func(streamCtx context.Context, _ string, _ *edgeSessionTransport) error {
			<-streamCtx.Done()
			return nil
		},
	}

	if err := runEdgeSession(ctx, opts); err != nil {
		t.Fatalf("runEdgeSession returned error: %v", err)
	}
	if registerCalls.Load() != 1 {
		t.Fatalf("expected 1 register call, got %d", registerCalls.Load())
	}
	if heartbeatCalls.Load() != 1 {
		t.Fatalf("expected 1 heartbeat call, got %d", heartbeatCalls.Load())
	}
}

func TestRunEdgeSessionHandlesInboundImessageSendRequest(t *testing.T) {
	upgrader := websocket.Upgrader{}
	var sendCalls atomic.Int32

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade websocket: %v", err)
			return
		}
		defer conn.Close()

		if err := conn.WriteJSON(map[string]any{
			"type":    "event",
			"event":   "connect.challenge",
			"payload": map[string]any{"nonce": "test"},
		}); err != nil {
			t.Errorf("write challenge: %v", err)
			return
		}

		connectReq := readRuntimeRequest(t, conn)
		writeRuntimeResponse(t, conn, connectReq.ID, map[string]any{"type": "hello-ok"})

		registerReq := readRuntimeRequest(t, conn)
		writeRuntimeResponse(t, conn, registerReq.ID, map[string]any{
			"sessionId":           "session-1",
			"status":              "paired",
			"heartbeatIntervalMs": 5000,
		})

		sendReqID := "server-send-1"
		if err := conn.WriteJSON(runtimeRequestFrame{
			Type:   "req",
			ID:     sendReqID,
			Method: "imessage.send",
			Params: map[string]any{
				"connection_id": "conn-test",
				"text":          "Hello from Nex",
				"target": map[string]any{
					"connection_id": "conn-test",
					"channel": map[string]any{
						"platform":     "imessage",
						"container_id": "+14155551234",
					},
				},
			},
		}); err != nil {
			t.Fatalf("write inbound send request: %v", err)
		}

		response := readRuntimeResponse(t, conn)
		if response.ID != sendReqID {
			t.Fatalf("expected matching response id, got %q want %q", response.ID, sendReqID)
		}
		if !response.OK {
			t.Fatalf("expected successful send response, got %#v", response)
		}
		var payload map[string]any
		if err := json.Unmarshal(response.Payload, &payload); err != nil {
			t.Fatalf("decode send response payload: %v", err)
		}
		if payload["success"] != true {
			t.Fatalf("expected success receipt, got %#v", payload)
		}
		if ids, _ := payload["message_ids"].([]any); len(ids) != 0 {
			t.Fatalf("unexpected message_ids receipt: %#v", payload["message_ids"])
		}
		if stringFromAny(payload["attempt_id"]) != "attempt-send-1" {
			t.Fatalf("expected attempt id receipt, got %#v", payload)
		}
		if payload["confirmed"] != false {
			t.Fatalf("expected unconfirmed send receipt, got %#v", payload)
		}
		if stringFromAny(payload["executor"]) != actionExecutorAppleScriptSendOnly {
			t.Fatalf("expected executor in send receipt, got %#v", payload)
		}
		cancel()
	}))
	defer server.Close()

	opts := edgeConnectOptions{
		ConnectionID: "conn-test",
		RuntimeURL:   strings.Replace(server.URL, "http://", "ws://", 1),
		RuntimeToken: "runtime-token",
		EdgeID:       "edge-1",
		DisplayName:  "Eve Test Edge",
		HealthFn: func(context.Context, string) (*nexadapter.AdapterHealth, error) {
			return &nexadapter.AdapterHealth{
				ConnectionID: "conn-test",
				Connected:    true,
			}, nil
		},
		SendFn: func(_ context.Context, request imessageSendRequest) (*imessageMethodResult, error) {
			sendCalls.Add(1)
			if strings.TrimSpace(request.Target.ConnectionID) != "conn-test" {
				t.Fatalf("unexpected connection id in send request: %#v", request.Target.ConnectionID)
			}
			if strings.TrimSpace(request.Target.Channel.Platform) != "imessage" {
				t.Fatalf("unexpected channel platform in send request: %#v", request.Target.Channel.Platform)
			}
			if strings.TrimSpace(request.Target.Channel.ContainerID) != "+14155551234" {
				t.Fatalf("unexpected channel container in send request: %#v", request.Target.Channel.ContainerID)
			}
			if strings.TrimSpace(request.Text) != "Hello from Nex" {
				t.Fatalf("unexpected send text in request: %#v", request.Text)
			}
			return &imessageMethodResult{
				Success:    true,
				MessageIDs: []string{},
				ChunksSent: 1,
				AttemptID:  "attempt-send-1",
				Confirmed:  false,
				Executor:   actionExecutorAppleScriptSendOnly,
			}, nil
		},
		StreamFn: func(streamCtx context.Context, _ string, _ *edgeSessionTransport) error {
			<-streamCtx.Done()
			return nil
		},
	}

	if err := runEdgeSession(ctx, opts); err != nil {
		t.Fatalf("runEdgeSession returned error: %v", err)
	}
	if sendCalls.Load() != 1 {
		t.Fatalf("expected 1 send call, got %d", sendCalls.Load())
	}
}

func TestRunEdgeSessionRejectsMismatchedConnectionID(t *testing.T) {
	upgrader := websocket.Upgrader{}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade websocket: %v", err)
			return
		}
		defer conn.Close()

		if err := conn.WriteJSON(map[string]any{
			"type":    "event",
			"event":   "connect.challenge",
			"payload": map[string]any{"nonce": "test"},
		}); err != nil {
			t.Errorf("write challenge: %v", err)
			return
		}

		connectReq := readRuntimeRequest(t, conn)
		writeRuntimeResponse(t, conn, connectReq.ID, map[string]any{"type": "hello-ok"})

		registerReq := readRuntimeRequest(t, conn)
		writeRuntimeResponse(t, conn, registerReq.ID, map[string]any{
			"sessionId":           "session-1",
			"status":              "paired",
			"heartbeatIntervalMs": 5000,
		})

		requestID := "server-send-mismatch-1"
		if err := conn.WriteJSON(runtimeRequestFrame{
			Type:   "req",
			ID:     requestID,
			Method: "imessage.send",
			Params: map[string]any{
				"connection_id": "conn-other",
				"text":          "Hello from Nex",
				"target": map[string]any{
					"connection_id": "conn-other",
					"channel": map[string]any{
						"platform":     "imessage",
						"container_id": "+14155551234",
					},
				},
			},
		}); err != nil {
			t.Fatalf("write mismatched send request: %v", err)
		}

		response := readRuntimeResponse(t, conn)
		if response.ID != requestID {
			t.Fatalf("expected matching response id, got %q want %q", response.ID, requestID)
		}
		if response.OK {
			t.Fatalf("expected mismatched connection request to fail, got %#v", response)
		}
		if response.Error == nil || !strings.Contains(response.Error.Message, "conn-test") || !strings.Contains(response.Error.Message, "conn-other") {
			t.Fatalf("expected mismatch error message, got %#v", response.Error)
		}
		cancel()
	}))
	defer server.Close()

	opts := edgeConnectOptions{
		ConnectionID: "conn-test",
		RuntimeURL:   strings.Replace(server.URL, "http://", "ws://", 1),
		RuntimeToken: "runtime-token",
		EdgeID:       "edge-1",
		DisplayName:  "Eve Test Edge",
		HealthFn: func(context.Context, string) (*nexadapter.AdapterHealth, error) {
			return &nexadapter.AdapterHealth{
				ConnectionID: "conn-test",
				Connected:    true,
			}, nil
		},
		SendFn: func(_ context.Context, _ imessageSendRequest) (*imessageMethodResult, error) {
			t.Fatal("expected mismatched request to be rejected before send execution")
			return nil, nil
		},
		StreamFn: func(streamCtx context.Context, _ string, _ *edgeSessionTransport) error {
			<-streamCtx.Done()
			return nil
		},
	}

	if err := runEdgeSession(ctx, opts); err != nil {
		t.Fatalf("runEdgeSession returned error: %v", err)
	}
}

func TestRunEdgeSessionReturnsUnsupportedResultForRichAction(t *testing.T) {
	upgrader := websocket.Upgrader{}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade websocket: %v", err)
			return
		}
		defer conn.Close()

		if err := conn.WriteJSON(map[string]any{
			"type":    "event",
			"event":   "connect.challenge",
			"payload": map[string]any{"nonce": "test"},
		}); err != nil {
			t.Errorf("write challenge: %v", err)
			return
		}

		connectReq := readRuntimeRequest(t, conn)
		writeRuntimeResponse(t, conn, connectReq.ID, map[string]any{"type": "hello-ok"})

		registerReq := readRuntimeRequest(t, conn)
		writeRuntimeResponse(t, conn, registerReq.ID, map[string]any{
			"sessionId":           "session-1",
			"status":              "paired",
			"heartbeatIntervalMs": 5000,
		})

		replyReqID := "server-reply-1"
		if err := conn.WriteJSON(runtimeRequestFrame{
			Type:   "req",
			ID:     replyReqID,
			Method: "imessage.reply",
			Params: map[string]any{
				"connection_id": "conn-test",
				"reply_to_id":   "imessage:message-1",
				"target": map[string]any{
					"connection_id": "conn-test",
					"channel": map[string]any{
						"platform":     "imessage",
						"container_id": "+14155551234",
					},
				},
				"text": "reply body",
			},
		}); err != nil {
			t.Fatalf("write inbound reply request: %v", err)
		}

		response := readRuntimeResponse(t, conn)
		if response.ID != replyReqID {
			t.Fatalf("expected matching response id, got %q want %q", response.ID, replyReqID)
		}
		if !response.OK {
			t.Fatalf("expected successful transport response, got %#v", response)
		}
		var payload map[string]any
		if err := json.Unmarshal(response.Payload, &payload); err != nil {
			t.Fatalf("decode reply response payload: %v", err)
		}
		if payload["success"] != false {
			t.Fatalf("expected unsupported rich action to fail truthfully, got %#v", payload)
		}
		errorPayload, _ := payload["error"].(map[string]any)
		if stringFromAny(errorPayload["type"]) != "unavailable" {
			t.Fatalf("expected unavailable delivery error, got %#v", payload["error"])
		}
		if !strings.Contains(stringFromAny(errorPayload["message"]), "imessage.reply") {
			t.Fatalf("expected rich action error to name the method, got %#v", payload["error"])
		}
		cancel()
	}))
	defer server.Close()

	opts := edgeConnectOptions{
		ConnectionID: "conn-test",
		RuntimeURL:   strings.Replace(server.URL, "http://", "ws://", 1),
		RuntimeToken: "runtime-token",
		EdgeID:       "edge-1",
		DisplayName:  "Eve Test Edge",
		HealthFn: func(context.Context, string) (*nexadapter.AdapterHealth, error) {
			return &nexadapter.AdapterHealth{
				ConnectionID: "conn-test",
				Connected:    true,
			}, nil
		},
		StreamFn: func(streamCtx context.Context, _ string, _ *edgeSessionTransport) error {
			<-streamCtx.Done()
			return nil
		},
	}

	if err := runEdgeSession(ctx, opts); err != nil {
		t.Fatalf("runEdgeSession returned error: %v", err)
	}
}

func TestParseEdgeConnectOptionsDefaultsConnectionAndEdgeIdentity(t *testing.T) {
	t.Setenv("NEXUS_RUNTIME_URL", "ws://127.0.0.1:18789/runtime")
	t.Setenv("NEXUS_RUNTIME_TOKEN", "token-1")
	t.Setenv("EVE_EDGE_CONNECTION_ID", "")
	t.Setenv("EVE_EDGE_ID", "")
	t.Setenv("EVE_EDGE_DISPLAY_NAME", "")

	opts, err := parseEdgeConnectOptions(nil)
	if err != nil {
		t.Fatalf("parseEdgeConnectOptions returned error: %v", err)
	}
	if strings.TrimSpace(opts.ConnectionID) == "" {
		t.Fatal("expected derived default connection id")
	}
	if opts.ConnectionID == "default" {
		t.Fatalf("expected derived non-default connection id, got %q", opts.ConnectionID)
	}
	if strings.TrimSpace(opts.EdgeID) == "" {
		t.Fatal("expected default edge id")
	}
	if strings.TrimSpace(opts.DisplayName) == "" {
		t.Fatal("expected default display name")
	}
}

func TestEdgeSessionTransportUploadsAttachmentsAndBatchesRecords(t *testing.T) {
	upgrader := websocket.Upgrader{}
	uploadCount := 0
	batchCount := 0

	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	attachmentPath := filepath.Join(homeDir, "Library", "Messages", "Attachments", "photo.jpg")
	attachmentBytes := []byte("attachment-bytes")
	if err := os.MkdirAll(filepath.Dir(attachmentPath), 0o755); err != nil {
		t.Fatalf("create attachment fixture dir: %v", err)
	}
	if err := os.WriteFile(attachmentPath, attachmentBytes, 0o600); err != nil {
		t.Fatalf("write attachment fixture: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade websocket: %v", err)
			return
		}
		defer conn.Close()

		if err := conn.WriteJSON(map[string]any{
			"type":    "event",
			"event":   "connect.challenge",
			"payload": map[string]any{"nonce": "test"},
		}); err != nil {
			t.Errorf("write challenge: %v", err)
			return
		}

		connectReq := readRuntimeRequest(t, conn)
		if connectReq.Method != "connect" {
			t.Fatalf("expected connect request, got %q", connectReq.Method)
		}
		writeRuntimeResponse(t, conn, connectReq.ID, map[string]any{"type": "hello-ok"})

		registerReq := readRuntimeRequest(t, conn)
		if registerReq.Method != "adapters.edges.register" {
			t.Fatalf("expected register request, got %q", registerReq.Method)
		}
		writeRuntimeResponse(t, conn, registerReq.ID, map[string]any{
			"sessionId":           "session-1",
			"status":              "paired",
			"heartbeatIntervalMs": 10,
		})

		uploadReq := readRuntimeRequest(t, conn)
		if uploadReq.Method != "adapters.edges.attachments.put" {
			t.Fatalf("expected attachment upload, got %q", uploadReq.Method)
		}
		uploadCount++
		if body, _ := uploadReq.Params["blobBase64"].(string); body == "" {
			t.Fatal("expected blobBase64 payload")
		} else {
			decoded, err := base64.StdEncoding.DecodeString(body)
			if err != nil {
				t.Fatalf("decode blobBase64: %v", err)
			}
			if string(decoded) != string(attachmentBytes) {
				t.Fatalf("unexpected attachment bytes: %q", string(decoded))
			}
		}
		if att, _ := uploadReq.Params["attachment"].(map[string]any); att["local_path"] != nil {
			t.Fatalf("expected local_path to be stripped before upload, got %#v", att["local_path"])
		}
		writeRuntimeResponse(t, conn, uploadReq.ID, map[string]any{
			"attachment": map[string]any{
				"id":           "imessage:attachment:1",
				"filename":     "photo.jpg",
				"mime_type":    "image/jpeg",
				"size":         len(attachmentBytes),
				"content_hash": "hash-1",
				"url":          "https://nex.example/media/imessage:attachment:1",
			},
		})

		batchReq := readRuntimeRequest(t, conn)
		if batchReq.Method != "adapters.edges.records.ingest_batch" {
			t.Fatalf("expected batch ingest, got %q", batchReq.Method)
		}
		batchCount++

		recordsRaw, err := json.Marshal(batchReq.Params["records"])
		if err != nil {
			t.Fatalf("marshal records payload: %v", err)
		}
		var records []map[string]any
		if err := json.Unmarshal(recordsRaw, &records); err != nil {
			t.Fatalf("decode records payload: %v", err)
		}
		if len(records) != 2 {
			t.Fatalf("expected 2 batched records, got %d", len(records))
		}
		for _, record := range records {
			if record["operation"] != "record.ingest" {
				t.Fatalf("expected canonical operation, got %#v", record["operation"])
			}
			routing, _ := record["routing"].(map[string]any)
			if routing["adapter"] != "eve" {
				t.Fatalf("expected canonical adapter, got %#v", routing["adapter"])
			}
			sender, _ := routing["sender"].(map[string]any)
			if sender["id"] != "sender-1" || sender["name"] != "Sender One" {
				t.Fatalf("expected canonical sender, got %#v", routing["sender"])
			}
			receiver, _ := routing["receiver"].(map[string]any)
			if receiver["id"] != "conn-test" {
				t.Fatalf("expected canonical receiver, got %#v", routing["receiver"])
			}
			if routing["container_kind"] != "direct" || routing["container_id"] != "chat-1" {
				t.Fatalf("expected canonical container, got %#v", routing)
			}

			payload, _ := record["payload"].(map[string]any)
			if payload["content_type"] != "text" {
				t.Fatalf("expected canonical content type, got %#v", payload["content_type"])
			}
			if payload["id"] == nil {
				t.Fatalf("expected canonical payload id, got %#v", payload)
			}
			recipientsRaw, _ := payload["recipients"].([]any)
			if len(recipientsRaw) != 1 {
				t.Fatalf("expected 1 recipient, got %#v", payload["recipients"])
			}
			recipient, _ := recipientsRaw[0].(map[string]any)
			if recipient["id"] != "recipient-1" {
				t.Fatalf("expected canonical recipient id, got %#v", payload["recipients"])
			}
			metadata, _ := payload["metadata"].(map[string]any)
			if metadata["external_record_id"] == nil {
				t.Fatalf("expected external_record_id metadata, got %#v", payload["metadata"])
			}
			attachmentsRaw, _ := payload["attachments"].([]any)
			if len(attachmentsRaw) != 1 {
				t.Fatalf("expected 1 attachment, got %#v", payload["attachments"])
			}
			attachment, _ := attachmentsRaw[0].(map[string]any)
			if attachment["url"] != "https://nex.example/media/imessage:attachment:1" {
				t.Fatalf("expected attachment URL to be rewritten, got %#v", attachment["url"])
			}
			if attachment["local_path"] != nil {
				t.Fatalf("expected local_path to be stripped, got %#v", attachment["local_path"])
			}
		}
		writeRuntimeResponse(t, conn, batchReq.ID, map[string]any{
			"accepted": 2,
		})
	}))
	defer server.Close()

	opts := edgeConnectOptions{
		ConnectionID: "conn-test",
		RuntimeURL:   strings.Replace(server.URL, "http://", "ws://", 1),
		RuntimeToken: "runtime-token",
		EdgeID:       "edge-1",
		DisplayName:  "Eve Test Edge",
		HealthFn: func(context.Context, string) (*nexadapter.AdapterHealth, error) {
			return &nexadapter.AdapterHealth{
				ConnectionID: "conn-test",
				Connected:    true,
			}, nil
		},
	}

	transport, _, err := connectEdgeSession(ctx, opts)
	if err != nil {
		t.Fatalf("connectEdgeSession returned error: %v", err)
	}
	defer transport.close()

	attachment := nexadapter.Attachment{
		ID:        "imessage:attachment:1",
		Filename:  "photo.jpg",
		MIMEType:  "image/jpeg",
		Size:      int64(len(attachmentBytes)),
		LocalPath: "~/Library/Messages/Attachments/photo.jpg",
	}
	records := []nexadapter.AdapterInboundRecord{
		nexadapter.NewRecord("imessage", "imessage:1").
			WithConnection("conn-test").
			WithSender("sender-1", "Sender One").
			WithContainer("chat-1", "direct").
			WithContent("hello").
			WithRecipient("recipient-1").
			WithAttachment(attachment).
			Build(),
		nexadapter.NewRecord("imessage", "imessage:2").
			WithConnection("conn-test").
			WithSender("sender-1", "Sender One").
			WithContainer("chat-1", "direct").
			WithContent("hello again").
			WithRecipient("recipient-1").
			WithAttachment(attachment).
			Build(),
	}

	if err := transport.sendCanonicalRecords(ctx, records); err != nil {
		t.Fatalf("sendCanonicalRecords returned error: %v", err)
	}
	if uploadCount != 1 {
		t.Fatalf("expected 1 attachment upload, got %d", uploadCount)
	}
	if batchCount != 1 {
		t.Fatalf("expected 1 batch ingest, got %d", batchCount)
	}
}

func TestEdgeSessionTransportChunksLargeAttachments(t *testing.T) {
	upgrader := websocket.Upgrader{}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	attachmentBytes := []byte(strings.Repeat("A", maxEdgeAttachmentChunkBytes*2+123))
	var uploadCount atomic.Int32
	var uploadedBytes atomic.Int32
	var batchCount atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade websocket: %v", err)
			return
		}
		defer conn.Close()

		if err := conn.WriteJSON(map[string]any{
			"type":    "event",
			"event":   "connect.challenge",
			"payload": map[string]any{"nonce": "test"},
		}); err != nil {
			t.Errorf("write challenge: %v", err)
			return
		}

		connectReq := readRuntimeRequest(t, conn)
		writeRuntimeResponse(t, conn, connectReq.ID, map[string]any{"type": "hello-ok"})

		registerReq := readRuntimeRequest(t, conn)
		writeRuntimeResponse(t, conn, registerReq.ID, map[string]any{
			"sessionId":           "session-1",
			"status":              "paired",
			"heartbeatIntervalMs": 5000,
		})

		for {
			req := readRuntimeRequest(t, conn)
			switch req.Method {
			case "adapters.edges.attachments.put":
				uploadCount.Add(1)
				if stringFromAny(req.Params["uploadId"]) == "" {
					t.Fatalf("expected chunked upload id, got %#v", req.Params)
				}
				chunkTotal := int(numberFromAny(req.Params["chunkTotal"]))
				chunkIndex := int(numberFromAny(req.Params["chunkIndex"]))
				if chunkTotal < 2 {
					t.Fatalf("expected multi-chunk upload, got %#v", req.Params)
				}
				data, err := base64.StdEncoding.DecodeString(stringFromAny(req.Params["blobBase64"]))
				if err != nil {
					t.Fatalf("decode chunk payload: %v", err)
				}
				uploadedBytes.Add(int32(len(data)))
				payload := map[string]any{
					"acceptedChunks": chunkIndex + 1,
				}
				if chunkIndex == chunkTotal-1 {
					payload["attachment"] = map[string]any{
						"id":        "imessage:attachment:chunked",
						"url":       "https://nex.example/media/imessage:attachment:chunked",
						"mime_type": "image/jpeg",
					}
				}
				writeRuntimeResponse(t, conn, req.ID, payload)
			case "adapters.edges.records.ingest_batch":
				batchCount.Add(1)
				writeRuntimeResponse(t, conn, req.ID, map[string]any{"accepted": 1})
				return
			default:
				t.Fatalf("unexpected request method %q", req.Method)
			}
		}
	}))
	defer server.Close()

	opts := edgeConnectOptions{
		ConnectionID: "conn-test",
		RuntimeURL:   strings.Replace(server.URL, "http://", "ws://", 1),
		RuntimeToken: "runtime-token",
		EdgeID:       "edge-1",
		DisplayName:  "Eve Test Edge",
		HealthFn: func(context.Context, string) (*nexadapter.AdapterHealth, error) {
			return &nexadapter.AdapterHealth{ConnectionID: "conn-test", Connected: true}, nil
		},
	}

	transport, _, err := connectEdgeSession(ctx, opts)
	if err != nil {
		t.Fatalf("connectEdgeSession returned error: %v", err)
	}
	defer transport.close()

	attachmentPath := filepath.Join(t.TempDir(), "photo.jpg")
	if err := os.WriteFile(attachmentPath, attachmentBytes, 0o644); err != nil {
		t.Fatalf("write attachment fixture: %v", err)
	}

	record := nexadapter.NewRecord("imessage", "imessage:chunked").
		WithConnection("conn-test").
		WithSender("sender-1", "Sender One").
		WithContainer("chat-1", "direct").
		WithContent("hello chunked world").
		WithRecipient("recipient-1").
		WithAttachment(nexadapter.Attachment{
			ID:        "imessage:attachment:chunked",
			Filename:  "photo.jpg",
			MIMEType:  "image/jpeg",
			Size:      int64(len(attachmentBytes)),
			LocalPath: attachmentPath,
		}).
		Build()

	if err := transport.sendCanonicalRecords(ctx, []nexadapter.AdapterInboundRecord{record}); err != nil {
		t.Fatalf("sendCanonicalRecords returned error: %v", err)
	}
	if uploadCount.Load() < 2 {
		t.Fatalf("expected multiple upload chunks, got %d", uploadCount.Load())
	}
	if int(uploadedBytes.Load()) != len(attachmentBytes) {
		t.Fatalf("expected %d uploaded bytes, got %d", len(attachmentBytes), uploadedBytes.Load())
	}
	if batchCount.Load() != 1 {
		t.Fatalf("expected exactly one record batch, got %d", batchCount.Load())
	}
}

func TestEdgeSessionTransportSplitsLargeCanonicalRecordBatches(t *testing.T) {
	upgrader := websocket.Upgrader{}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var batchCount atomic.Int32
	var acceptedRecords atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade websocket: %v", err)
			return
		}
		defer conn.Close()

		if err := conn.WriteJSON(map[string]any{
			"type":    "event",
			"event":   "connect.challenge",
			"payload": map[string]any{"nonce": "test"},
		}); err != nil {
			t.Errorf("write challenge: %v", err)
			return
		}

		connectReq := readRuntimeRequest(t, conn)
		writeRuntimeResponse(t, conn, connectReq.ID, map[string]any{"type": "hello-ok"})

		registerReq := readRuntimeRequest(t, conn)
		writeRuntimeResponse(t, conn, registerReq.ID, map[string]any{
			"sessionId":           "session-1",
			"status":              "paired",
			"heartbeatIntervalMs": 5000,
		})

		for acceptedRecords.Load() < 3 {
			req := readRuntimeRequest(t, conn)
			if req.Method != "adapters.edges.records.ingest_batch" {
				t.Fatalf("unexpected request method %q", req.Method)
			}
			recordsRaw, _ := req.Params["records"].([]any)
			batchCount.Add(1)
			acceptedRecords.Add(int32(len(recordsRaw)))
			writeRuntimeResponse(t, conn, req.ID, map[string]any{"accepted": len(recordsRaw)})
		}
	}))
	defer server.Close()

	opts := edgeConnectOptions{
		ConnectionID: "conn-test",
		RuntimeURL:   strings.Replace(server.URL, "http://", "ws://", 1),
		RuntimeToken: "runtime-token",
		EdgeID:       "edge-1",
		DisplayName:  "Eve Test Edge",
		HealthFn: func(context.Context, string) (*nexadapter.AdapterHealth, error) {
			return &nexadapter.AdapterHealth{ConnectionID: "conn-test", Connected: true}, nil
		},
	}

	transport, _, err := connectEdgeSession(ctx, opts)
	if err != nil {
		t.Fatalf("connectEdgeSession returned error: %v", err)
	}
	defer transport.close()

	content := strings.Repeat("Z", maxEdgeRecordBatchBytes)
	records := []nexadapter.AdapterInboundRecord{
		nexadapter.NewRecord("imessage", "imessage:large:1").WithConnection("conn-test").WithSender("sender-1", "Sender One").WithContainer("chat-1", "direct").WithContent(content).WithRecipient("recipient-1").Build(),
		nexadapter.NewRecord("imessage", "imessage:large:2").WithConnection("conn-test").WithSender("sender-1", "Sender One").WithContainer("chat-1", "direct").WithContent(content).WithRecipient("recipient-1").Build(),
		nexadapter.NewRecord("imessage", "imessage:large:3").WithConnection("conn-test").WithSender("sender-1", "Sender One").WithContainer("chat-1", "direct").WithContent(content).WithRecipient("recipient-1").Build(),
	}

	if err := transport.sendCanonicalRecords(ctx, records); err != nil {
		t.Fatalf("sendCanonicalRecords returned error: %v", err)
	}
	if batchCount.Load() < 2 {
		t.Fatalf("expected split record batches, got %d", batchCount.Load())
	}
	if acceptedRecords.Load() != 3 {
		t.Fatalf("expected 3 accepted records, got %d", acceptedRecords.Load())
	}
}

func TestEdgeSessionTransportKeepsMetadataWhenAttachmentFileIsMissing(t *testing.T) {
	transport := &edgeSessionTransport{
		attachmentByKey: map[string]nexadapter.Attachment{},
	}

	attachment, err := transport.uploadAttachment(
		context.Background(),
		"record-missing",
		nexadapter.Attachment{
			ID:        "attachment-missing",
			Filename:  "gone.bin",
			MIMEType:  "application/octet-stream",
			LocalPath: "/tmp/definitely-missing-edge-attachment.bin",
		},
	)
	if err != nil {
		t.Fatalf("uploadAttachment returned error: %v", err)
	}
	if attachment.LocalPath != "" {
		t.Fatalf("expected local path to be stripped, got %#v", attachment.LocalPath)
	}
	if attachment.URL != "" {
		t.Fatalf("did not expect uploaded URL for missing attachment, got %#v", attachment.URL)
	}
	if attachment.Metadata["local_path_missing"] != true {
		t.Fatalf("expected missing-file marker metadata, got %#v", attachment.Metadata)
	}
	if attachment.Metadata["original_local_path"] != "/tmp/definitely-missing-edge-attachment.bin" {
		t.Fatalf("expected original path metadata, got %#v", attachment.Metadata)
	}
}

func readRuntimeRequest(t *testing.T, conn *websocket.Conn) runtimeRequestFrame {
	t.Helper()
	if err := conn.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
		t.Fatalf("set read deadline: %v", err)
	}
	var frame runtimeRequestFrame
	if err := conn.ReadJSON(&frame); err != nil {
		t.Fatalf("read request frame: %v", err)
	}
	return frame
}

func numberFromAny(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	default:
		return 0
	}
}

func writeRuntimeResponse(t *testing.T, conn *websocket.Conn, id string, payload map[string]any) {
	t.Helper()
	if err := conn.SetWriteDeadline(time.Now().Add(2 * time.Second)); err != nil {
		t.Fatalf("set write deadline: %v", err)
	}
	if err := conn.WriteJSON(map[string]any{
		"type":    "res",
		"id":      id,
		"ok":      true,
		"payload": payload,
	}); err != nil {
		t.Fatalf("write response frame: %v", err)
	}
}

func readRuntimeResponse(t *testing.T, conn *websocket.Conn) runtimeResponseFrame {
	t.Helper()
	if err := conn.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
		t.Fatalf("set read deadline: %v", err)
	}
	var frame runtimeResponseFrame
	if err := conn.ReadJSON(&frame); err != nil {
		t.Fatalf("read response frame: %v", err)
	}
	return frame
}

func methodsFromAny(value any) []string {
	raw, ok := value.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, entry := range raw {
		text, ok := entry.(string)
		if !ok {
			continue
		}
		out = append(out, text)
	}
	return out
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
