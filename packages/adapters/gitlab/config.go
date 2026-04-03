package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	accountsFilename      = "accounts.json"
	credentialsFilename   = "credentials.json"
	setupSessionsFilename = "setup_sessions.json"
	sourceArchivesDirname = "source_archives"
)

type StoredCredential struct {
	Username string `json:"username,omitempty"`
	Token    string `json:"token"`
}

type SetupSessionsFile struct {
	Sessions map[string]setupSession `json:"sessions"`
}

func adapterStateDir() string {
	if raw := strings.TrimSpace(os.Getenv("NEXUS_ADAPTER_STATE_DIR")); raw != "" {
		return raw
	}
	return filepath.Clean("./state")
}

func accountsPath(stateDir string) string {
	return filepath.Join(stateDir, accountsFilename)
}

func credentialsPath(stateDir string) string {
	return filepath.Join(stateDir, credentialsFilename)
}

func setupSessionsPath(stateDir string) string {
	return filepath.Join(stateDir, setupSessionsFilename)
}

func sourceArchivesDir(stateDir string) string {
	return filepath.Join(stateDir, sourceArchivesDirname)
}

func LoadAccounts(stateDir string) (*AccountsFile, error) {
	path := accountsPath(stateDir)
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &AccountsFile{Accounts: map[string]AccountConfig{}}, nil
		}
		return nil, fmt.Errorf("read accounts.json: %w", err)
	}

	var accounts AccountsFile
	if err := json.Unmarshal(raw, &accounts); err != nil {
		return nil, fmt.Errorf("parse accounts.json: %w", err)
	}
	if accounts.Accounts == nil {
		accounts.Accounts = map[string]AccountConfig{}
	}
	return &accounts, nil
}

func SaveAccounts(stateDir string, accounts *AccountsFile) error {
	if accounts == nil {
		accounts = &AccountsFile{Accounts: map[string]AccountConfig{}}
	}
	if accounts.Accounts == nil {
		accounts.Accounts = map[string]AccountConfig{}
	}

	sanitized := &AccountsFile{Accounts: make(map[string]AccountConfig, len(accounts.Accounts))}
	for key, account := range accounts.Accounts {
		account.Token = ""
		account.Username = ""
		sanitized.Accounts[key] = account
	}

	return writeJSONAtomically(accountsPath(stateDir), sanitized)
}

func LoadCredentials(stateDir string) (map[string]StoredCredential, error) {
	path := credentialsPath(stateDir)
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]StoredCredential{}, nil
		}
		return nil, fmt.Errorf("read credentials.json: %w", err)
	}

	credentials := map[string]StoredCredential{}
	if err := json.Unmarshal(raw, &credentials); err != nil {
		return nil, fmt.Errorf("parse credentials.json: %w", err)
	}
	return credentials, nil
}

func SaveCredential(stateDir, credentialRef string, credential StoredCredential) error {
	credentials, err := LoadCredentials(stateDir)
	if err != nil {
		return err
	}
	credentials[credentialRef] = credential
	return writeJSONAtomically(credentialsPath(stateDir), credentials)
}

func LoadSetupSessions(stateDir string) (*SetupSessionsFile, error) {
	path := setupSessionsPath(stateDir)
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &SetupSessionsFile{Sessions: map[string]setupSession{}}, nil
		}
		return nil, fmt.Errorf("read setup_sessions.json: %w", err)
	}

	var sessions SetupSessionsFile
	if err := json.Unmarshal(raw, &sessions); err != nil {
		return nil, fmt.Errorf("parse setup_sessions.json: %w", err)
	}
	if sessions.Sessions == nil {
		sessions.Sessions = map[string]setupSession{}
	}
	return &sessions, nil
}

func SaveSetupSession(stateDir, sessionID string, session setupSession) error {
	sessions, err := LoadSetupSessions(stateDir)
	if err != nil {
		return err
	}
	sessions.Sessions[sessionID] = session
	return writeJSONAtomically(setupSessionsPath(stateDir), sessions)
}

func LoadSetupSession(stateDir, sessionID string) (setupSession, bool, error) {
	sessions, err := LoadSetupSessions(stateDir)
	if err != nil {
		return setupSession{}, false, err
	}
	session, ok := sessions.Sessions[sessionID]
	return session, ok, nil
}

func DeleteSetupSession(stateDir, sessionID string) error {
	sessions, err := LoadSetupSessions(stateDir)
	if err != nil {
		return err
	}
	delete(sessions.Sessions, sessionID)
	return writeJSONAtomically(setupSessionsPath(stateDir), sessions)
}

func ResolveAccountConfig(stateDir, accountID string) (AccountConfig, error) {
	accounts, err := LoadAccounts(stateDir)
	if err != nil {
		return AccountConfig{}, err
	}
	account, ok := accounts.Accounts[accountID]
	if !ok {
		return AccountConfig{}, fmt.Errorf("account %q not found", accountID)
	}
	if strings.TrimSpace(account.CredentialRef) == "" {
		return AccountConfig{}, fmt.Errorf("account %q missing credential_ref", accountID)
	}

	credentials, err := LoadCredentials(stateDir)
	if err != nil {
		return AccountConfig{}, err
	}
	credential, ok := credentials[account.CredentialRef]
	if !ok {
		return AccountConfig{}, fmt.Errorf("credential %q not found", account.CredentialRef)
	}

	account.Username = credential.Username
	account.Token = credential.Token
	return account, nil
}

func writeJSONAtomically(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create state directory: %w", err)
	}

	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal json: %w", err)
	}
	raw = append(raw, '\n')

	tmp, err := os.CreateTemp(filepath.Dir(path), ".tmp-*")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	tmpPath := tmp.Name()

	if _, err := tmp.Write(raw); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
		return fmt.Errorf("write temp file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("close temp file: %w", err)
	}
	if err := os.Chmod(tmpPath, 0o600); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("chmod temp file: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("rename temp file: %w", err)
	}
	return nil
}
