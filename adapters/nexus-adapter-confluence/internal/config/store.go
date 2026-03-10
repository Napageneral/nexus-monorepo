package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	configPathEnv = "NEXUS_CONFLUENCE_CONFIG_PATH"
	stateDirEnv   = "NEXUS_CONFLUENCE_STATE_DIR"
)

type Store struct {
	path string
}

func NewStore(path string) (*Store, error) {
	if strings.TrimSpace(path) == "" {
		resolved, err := resolveConfigPath()
		if err != nil {
			return nil, err
		}
		path = resolved
	}
	return &Store{path: path}, nil
}

func (s *Store) Load() (*AdapterConfig, error) {
	raw, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return &AdapterConfig{Accounts: map[string]AccountConfig{}}, nil
		}
		return nil, fmt.Errorf("read config: %w", err)
	}

	var cfg AdapterConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	if cfg.Accounts == nil {
		cfg.Accounts = map[string]AccountConfig{}
	}
	return &cfg, nil
}

func (s *Store) Save(cfg *AdapterConfig) error {
	if cfg == nil {
		cfg = &AdapterConfig{Accounts: map[string]AccountConfig{}}
	}
	if cfg.Accounts == nil {
		cfg.Accounts = map[string]AccountConfig{}
	}
	return writeJSONFile(s.path, cfg)
}

type SessionStore struct {
	dir string
}

func NewSessionStore(dir string) (*SessionStore, error) {
	if strings.TrimSpace(dir) == "" {
		stateDir, err := resolveStateDir()
		if err != nil {
			return nil, err
		}
		dir = filepath.Join(stateDir, "setup-sessions")
	}
	return &SessionStore{dir: dir}, nil
}

func (s *SessionStore) Save(session SetupSession) error {
	if strings.TrimSpace(session.ID) == "" {
		return fmt.Errorf("setup session missing id")
	}
	return writeJSONFile(filepath.Join(s.dir, session.ID+".json"), session)
}

func (s *SessionStore) Load(sessionID string) (SetupSession, error) {
	if strings.TrimSpace(sessionID) == "" {
		return SetupSession{}, fmt.Errorf("setup session id is required")
	}
	path := filepath.Join(s.dir, sessionID+".json")
	raw, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return SetupSession{}, fmt.Errorf("unknown setup session %q", sessionID)
		}
		return SetupSession{}, fmt.Errorf("read setup session: %w", err)
	}

	var session SetupSession
	if err := json.Unmarshal(raw, &session); err != nil {
		return SetupSession{}, fmt.Errorf("parse setup session: %w", err)
	}
	return session, nil
}

func (s *SessionStore) Delete(sessionID string) error {
	if strings.TrimSpace(sessionID) == "" {
		return nil
	}
	path := filepath.Join(s.dir, sessionID+".json")
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func resolveConfigPath() (string, error) {
	if raw := strings.TrimSpace(os.Getenv(configPathEnv)); raw != "" {
		return raw, nil
	}
	stateDir, err := resolveStateDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(stateDir, "config.json"), nil
}

func resolveStateDir() (string, error) {
	if raw := strings.TrimSpace(os.Getenv(stateDirEnv)); raw != "" {
		return raw, nil
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home dir: %w", err)
	}
	return filepath.Join(homeDir, ".nexus", "adapters", "confluence"), nil
}

func ResolveStateDir() (string, error) {
	return resolveStateDir()
}

func writeJSONFile(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}

	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}

	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, append(payload, '\n'), 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	return nil
}
