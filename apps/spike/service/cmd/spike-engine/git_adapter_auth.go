package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	spikegit "github.com/Napageneral/spike/internal/git"
)

const runtimeCredentialGetOperation = "adapters.connections.credentials.get"

type runtimeOperationEnvelope struct {
	OK      bool            `json:"ok"`
	Payload json.RawMessage `json:"payload"`
	Error   *runtimeError   `json:"error"`
}

type runtimeError struct {
	Message string `json:"message"`
}

type runtimeCredentialPayload struct {
	ConnectionID string `json:"connection_id"`
	Adapter      string `json:"adapter"`
	Service      string `json:"service"`
	Credential   struct {
		Fields   map[string]string      `json:"fields"`
		Metadata map[string]interface{} `json:"metadata"`
	} `json:"credential"`
}

func newNexConnectionAuthResolver() spikegit.AuthResolver {
	runtimeURL := strings.TrimSpace(os.Getenv("NEX_RUNTIME_HTTP_URL"))
	serviceToken := strings.TrimSpace(os.Getenv("NEX_RUNTIME_SERVICE_TOKEN"))
	if runtimeURL == "" || serviceToken == "" {
		return nil
	}

	httpClient := &http.Client{
		Timeout: 15 * time.Second,
	}

	return func(ctx context.Context, remoteURL string) (*spikegit.BasicAuth, error) {
		connectionID := spikegit.ConnectionIDFromContext(ctx)
		if connectionID == "" {
			return nil, nil
		}
		return loadNexConnectionAuth(ctx, httpClient, runtimeURL, serviceToken, connectionID, remoteURL)
	}
}

func loadNexConnectionAuth(
	ctx context.Context,
	httpClient *http.Client,
	runtimeURL string,
	serviceToken string,
	connectionID string,
	remoteURL string,
) (*spikegit.BasicAuth, error) {
	if _, err := normalizeGitAdapterRemote(remoteURL); err != nil {
		return nil, err
	}

	payload, err := fetchRuntimeCredentialPayload(ctx, httpClient, runtimeURL, serviceToken, connectionID)
	if err != nil {
		return nil, err
	}
	if payload == nil {
		return nil, nil
	}
	if !isGitAdapterID(payload.Adapter) {
		return nil, nil
	}

	password := firstNonEmpty(
		payload.Credential.Fields["accessToken"],
		payload.Credential.Fields["access_token"],
		payload.Credential.Fields["token"],
		payload.Credential.Fields["api_key"],
		payload.Credential.Fields["key"],
		payload.Credential.Fields["value"],
	)
	if password == "" {
		return nil, nil
	}

	username := providerGitUsername(
		payload.Service,
		firstNonEmpty(
			payload.Credential.Fields["username"],
			payload.Credential.Fields["user"],
			payload.Credential.Fields["login"],
		),
	)
	if username == "" {
		return nil, nil
	}

	return &spikegit.BasicAuth{
		Username: username,
		Password: password,
	}, nil
}

func fetchRuntimeCredentialPayload(
	ctx context.Context,
	httpClient *http.Client,
	runtimeURL string,
	serviceToken string,
	connectionID string,
) (*runtimeCredentialPayload, error) {
	requestBody, err := json.Marshal(map[string]string{
		"connection_id": strings.TrimSpace(connectionID),
	})
	if err != nil {
		return nil, fmt.Errorf("encode credential request: %w", err)
	}

	endpoint := strings.TrimRight(strings.TrimSpace(runtimeURL), "/") + "/runtime/operations/" + runtimeCredentialGetOperation
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(requestBody))
	if err != nil {
		return nil, fmt.Errorf("build credential request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Nexus-Service-Token", strings.TrimSpace(serviceToken))

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call runtime credential endpoint: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("runtime credential endpoint returned %d", resp.StatusCode)
	}

	var envelope runtimeOperationEnvelope
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		return nil, fmt.Errorf("decode credential response: %w", err)
	}
	if !envelope.OK {
		message := "runtime credential request failed"
		if envelope.Error != nil && strings.TrimSpace(envelope.Error.Message) != "" {
			message = strings.TrimSpace(envelope.Error.Message)
		}
		return nil, fmt.Errorf("%s", message)
	}
	if len(envelope.Payload) == 0 || bytes.Equal(envelope.Payload, []byte("null")) {
		return nil, nil
	}

	var payload runtimeCredentialPayload
	if err := json.Unmarshal(envelope.Payload, &payload); err != nil {
		return nil, fmt.Errorf("decode credential payload: %w", err)
	}
	if strings.TrimSpace(payload.ConnectionID) == "" {
		return nil, nil
	}
	return &payload, nil
}

func normalizeGitAdapterRemote(remoteURL string) (string, error) {
	return spikegit.NormalizeRemoteURL(remoteURL)
}

func isGitAdapterID(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "git", "nexus-adapter-git":
		return true
	default:
		return false
	}
}

func providerGitUsername(provider string, storedUsername string) string {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case "bitbucket":
		return "x-bitbucket-api-token-auth"
	case "github":
		if storedUsername != "" {
			return storedUsername
		}
		return "x-access-token"
	case "gitlab":
		if storedUsername != "" {
			return storedUsername
		}
		return "oauth2"
	default:
		return storedUsername
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}
