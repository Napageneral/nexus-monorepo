package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const setupDirEnvVar = "NEXUS_JIRA_SETUP_DIR"

var validSessionID = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

type setupSession struct {
	SessionID     string                                       `json:"session_id"`
	Account       string                                       `json:"account"`
	Site          string                                       `json:"site"`
	Email         string                                       `json:"email"`
	APIToken      string                                       `json:"api_token"`
	User          jiraUser                                     `json:"user"`
	ProjectMap    map[string]nexadapter.AdapterAuthFieldOption `json:"project_map"`
	Projects      []string                                     `json:"projects,omitempty"`
	Status        nexadapter.AdapterSetupStatus                `json:"status"`
	CreatedAtUnix int64                                        `json:"created_at_unix"`
	UpdatedAtUnix int64                                        `json:"updated_at_unix"`
}

func newSetupSessionID() (string, error) {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate session id: %w", err)
	}
	return "setup-" + hex.EncodeToString(buf), nil
}

func saveSetupSession(session setupSession) error {
	if !validSessionID.MatchString(session.SessionID) {
		return fmt.Errorf("invalid session id %q", session.SessionID)
	}
	if session.CreatedAtUnix == 0 {
		session.CreatedAtUnix = time.Now().Unix()
	}
	session.UpdatedAtUnix = time.Now().Unix()

	dir := setupSessionDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("create setup session dir: %w", err)
	}

	payload, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal setup session: %w", err)
	}

	tmpPath := filepath.Join(dir, session.SessionID+".tmp")
	finalPath := filepath.Join(dir, session.SessionID+".json")
	if err := os.WriteFile(tmpPath, payload, 0o600); err != nil {
		return fmt.Errorf("write setup session tmp file: %w", err)
	}
	if err := os.Rename(tmpPath, finalPath); err != nil {
		return fmt.Errorf("rename setup session file: %w", err)
	}
	return nil
}

func loadSetupSession(sessionID string) (*setupSession, error) {
	if !validSessionID.MatchString(sessionID) {
		return nil, fmt.Errorf("invalid session id %q", sessionID)
	}

	path := filepath.Join(setupSessionDir(), sessionID+".json")
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("setup session %q not found", sessionID)
		}
		return nil, fmt.Errorf("read setup session: %w", err)
	}

	var session setupSession
	if err := json.Unmarshal(raw, &session); err != nil {
		return nil, fmt.Errorf("decode setup session: %w", err)
	}
	return &session, nil
}

func setupSessionDir() string {
	if custom := os.Getenv(setupDirEnvVar); stringsTrimmed(custom) != "" {
		return custom
	}
	return filepath.Join(os.TempDir(), "nexus-adapter-jira", "setup-sessions")
}
