package broker

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Store handles file-based persistence for broker state
// All state is stored in .intent/state/broker/ directory
type Store struct {
	brokerDir string // path to .intent/state/broker/
	db        *sql.DB
	mu        sync.Mutex
}

// Dir returns the broker's root directory (e.g., <root>/.intent/state/broker).
func (s *Store) Dir() string {
	if s == nil || s.db != nil {
		return ""
	}
	return s.brokerDir
}

// AgentStore represents the persisted agent registry
type AgentStore struct {
	Agents map[string]*Agent `json:"agents"` // agent ID -> Agent
}

// MessageStore represents persisted messages for an agent
type MessageStore struct {
	Messages []*Message `json:"messages"`
}

// NewStore creates a new file-based store for the broker
// brokerDir should point to .intent/state/broker/
func NewStore(brokerDir string) *Store {
	return &Store{
		brokerDir: brokerDir,
	}
}

// NewSQLiteStore creates a SQLite-backed store for the broker.
// When configured, no .intent/state/broker files are written.
func NewSQLiteStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// Initialize creates the broker directory structure if it doesn't exist
func (s *Store) Initialize() error {
	if s.db != nil {
		// Schema migrations are owned by the PRLM sqlite store.
		return nil
	}
	// Create broker directory
	if err := os.MkdirAll(s.brokerDir, 0755); err != nil {
		return fmt.Errorf("failed to create broker dir: %w", err)
	}

	// Create messages subdirectory
	messagesDir := filepath.Join(s.brokerDir, "messages")
	if err := os.MkdirAll(messagesDir, 0755); err != nil {
		return fmt.Errorf("failed to create messages dir: %w", err)
	}

	// Create agents.json if it doesn't exist
	agentsPath := filepath.Join(s.brokerDir, "agents.json")
	if _, err := os.Stat(agentsPath); os.IsNotExist(err) {
		emptyStore := &AgentStore{
			Agents: make(map[string]*Agent),
		}
		if err := s.SaveAgents(emptyStore); err != nil {
			return fmt.Errorf("failed to initialize agents.json: %w", err)
		}
	}

	return nil
}

func (s *Store) loadAgentsUnlocked() (*AgentStore, error) {
	if s.db != nil {
		rows, err := s.db.Query(`SELECT id, role, scope, parent_id, child_ids, status, error, result, metadata, created_at, started_at, finished_at, last_seen FROM agents`)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		out := &AgentStore{Agents: make(map[string]*Agent)}
		for rows.Next() {
			var (
				id, role, scope, parentID, childIDs, status, errMsg, resultJSON, metadataJSON string
				createdAt, startedAt, finishedAt, lastSeen                                    string
			)
			if err := rows.Scan(&id, &role, &scope, &parentID, &childIDs, &status, &errMsg, &resultJSON, &metadataJSON, &createdAt, &startedAt, &finishedAt, &lastSeen); err != nil {
				return nil, err
			}
			var children []string
			_ = json.Unmarshal([]byte(childIDs), &children)
			var result map[string]interface{}
			_ = json.Unmarshal([]byte(resultJSON), &result)
			var metadata map[string]interface{}
			_ = json.Unmarshal([]byte(metadataJSON), &metadata)

			out.Agents[id] = &Agent{
				ID:         id,
				Role:       AgentRole(role),
				Scope:      scope,
				ParentID:   parentID,
				ChildIDs:   children,
				Status:     AgentStatus(status),
				Error:      errMsg,
				Result:     result,
				Metadata:   metadata,
				CreatedAt:  parseTime(createdAt),
				StartedAt:  parseTime(startedAt),
				FinishedAt: parseTime(finishedAt),
				LastSeen:   parseTime(lastSeen),
			}
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return out, nil
	}

	agentsPath := filepath.Join(s.brokerDir, "agents.json")

	data, err := os.ReadFile(agentsPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &AgentStore{
				Agents: make(map[string]*Agent),
			}, nil
		}
		return nil, fmt.Errorf("failed to read agents file: %w", err)
	}

	var store AgentStore
	if err := json.Unmarshal(data, &store); err != nil {
		return nil, fmt.Errorf("failed to parse agents file: %w", err)
	}
	if store.Agents == nil {
		store.Agents = make(map[string]*Agent)
	}
	return &store, nil
}

func (s *Store) saveAgentsUnlocked(store *AgentStore) error {
	if s.db != nil {
		if store == nil {
			return nil
		}
		tx, err := s.db.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`DELETE FROM agents`); err != nil {
			_ = tx.Rollback()
			return err
		}
		for _, agent := range store.Agents {
			if agent == nil {
				continue
			}
			if err := upsertAgent(tx, agent); err != nil {
				_ = tx.Rollback()
				return err
			}
		}
		return tx.Commit()
	}

	agentsPath := filepath.Join(s.brokerDir, "agents.json")

	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal agents: %w", err)
	}

	tmpPath := agentsPath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write temp file: %w", err)
	}
	if err := os.Rename(tmpPath, agentsPath); err != nil {
		return fmt.Errorf("failed to rename temp file: %w", err)
	}
	return nil
}

func (s *Store) loadMessagesUnlocked(agentID string) (*MessageStore, error) {
	if s.db != nil {
		rows, err := s.db.Query(`SELECT id, from_id, to_id, type, payload, timestamp, delivered FROM agent_messages WHERE to_id=? ORDER BY timestamp`, agentID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		out := &MessageStore{Messages: []*Message{}}
		for rows.Next() {
			var (
				id, fromID, toID, typ, payloadJSON, ts string
				delivered                              int
			)
			if err := rows.Scan(&id, &fromID, &toID, &typ, &payloadJSON, &ts, &delivered); err != nil {
				return nil, err
			}
			var payload map[string]interface{}
			_ = json.Unmarshal([]byte(payloadJSON), &payload)
			out.Messages = append(out.Messages, &Message{
				ID:        id,
				From:      fromID,
				To:        toID,
				Type:      MessageType(typ),
				Payload:   payload,
				Timestamp: parseTime(ts),
				Delivered: delivered != 0,
			})
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return out, nil
	}

	messagesPath := filepath.Join(s.brokerDir, "messages", agentID+".json")

	data, err := os.ReadFile(messagesPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &MessageStore{
				Messages: []*Message{},
			}, nil
		}
		return nil, fmt.Errorf("failed to read messages file: %w", err)
	}

	var store MessageStore
	if err := json.Unmarshal(data, &store); err != nil {
		return nil, fmt.Errorf("failed to parse messages file: %w", err)
	}
	if store.Messages == nil {
		store.Messages = []*Message{}
	}
	return &store, nil
}

func (s *Store) saveMessagesUnlocked(agentID string, store *MessageStore) error {
	if s.db != nil {
		if store == nil {
			return nil
		}
		tx, err := s.db.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`DELETE FROM agent_messages WHERE to_id=?`, agentID); err != nil {
			_ = tx.Rollback()
			return err
		}
		for _, msg := range store.Messages {
			if msg == nil || strings.TrimSpace(msg.ID) == "" {
				continue
			}
			payloadRaw, _ := json.Marshal(msg.Payload)
			_, err := tx.Exec(
				`INSERT INTO agent_messages (id, from_id, to_id, type, payload, timestamp, delivered) VALUES (?, ?, ?, ?, ?, ?, ?)`,
				msg.ID,
				msg.From,
				msg.To,
				string(msg.Type),
				string(payloadRaw),
				formatTime(msg.Timestamp),
				boolToInt(msg.Delivered),
			)
			if err != nil {
				_ = tx.Rollback()
				return err
			}
		}
		return tx.Commit()
	}

	messagesDir := filepath.Join(s.brokerDir, "messages")
	messagesPath := filepath.Join(messagesDir, agentID+".json")

	if err := os.MkdirAll(messagesDir, 0755); err != nil {
		return fmt.Errorf("failed to create messages dir: %w", err)
	}

	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal messages: %w", err)
	}

	tmpPath := messagesPath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write temp file: %w", err)
	}
	if err := os.Rename(tmpPath, messagesPath); err != nil {
		return fmt.Errorf("failed to rename temp file: %w", err)
	}
	return nil
}

// LoadAgents reads the agent registry from disk
func (s *Store) LoadAgents() (*AgentStore, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadAgentsUnlocked()
}

// SaveAgents writes the agent registry to disk atomically
func (s *Store) SaveAgents(store *AgentStore) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveAgentsUnlocked(store)
}

// LoadMessages reads messages for a specific agent from disk
func (s *Store) LoadMessages(agentID string) (*MessageStore, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadMessagesUnlocked(agentID)
}

// SaveMessages writes messages for a specific agent to disk atomically
func (s *Store) SaveMessages(agentID string, store *MessageStore) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveMessagesUnlocked(agentID, store)
}

// DeleteMessages removes the message file for an agent (e.g., after termination)
func (s *Store) DeleteMessages(agentID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db != nil {
		_, err := s.db.Exec(`DELETE FROM agent_messages WHERE to_id=?`, agentID)
		return err
	}

	messagesPath := filepath.Join(s.brokerDir, "messages", agentID+".json")

	if err := os.Remove(messagesPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete messages file: %w", err)
	}

	return nil
}

// ListAgentIDs returns all agent IDs currently in the registry
func (s *Store) ListAgentIDs() ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db != nil {
		rows, err := s.db.Query(`SELECT id FROM agents ORDER BY id`)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var ids []string
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				return nil, err
			}
			if strings.TrimSpace(id) != "" {
				ids = append(ids, strings.TrimSpace(id))
			}
		}
		return ids, rows.Err()
	}

	store, err := s.loadAgentsUnlocked()
	if err != nil {
		return nil, err
	}

	ids := make([]string, 0, len(store.Agents))
	for id := range store.Agents {
		ids = append(ids, id)
	}

	return ids, nil
}

// GetAgent retrieves a single agent by ID
func (s *Store) GetAgent(agentID string) (*Agent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db != nil {
		var (
			id, role, scope, parentID, childIDs, status, errMsg, resultJSON, metadataJSON string
			createdAt, startedAt, finishedAt, lastSeen                                    string
		)
		err := s.db.QueryRow(
			`SELECT id, role, scope, parent_id, child_ids, status, error, result, metadata, created_at, started_at, finished_at, last_seen FROM agents WHERE id=?`,
			agentID,
		).Scan(&id, &role, &scope, &parentID, &childIDs, &status, &errMsg, &resultJSON, &metadataJSON, &createdAt, &startedAt, &finishedAt, &lastSeen)
		if err != nil {
			if err == sql.ErrNoRows {
				return nil, fmt.Errorf("agent not found: %s", agentID)
			}
			return nil, err
		}

		var children []string
		_ = json.Unmarshal([]byte(childIDs), &children)
		var result map[string]interface{}
		_ = json.Unmarshal([]byte(resultJSON), &result)
		var metadata map[string]interface{}
		_ = json.Unmarshal([]byte(metadataJSON), &metadata)

		return &Agent{
			ID:         id,
			Role:       AgentRole(role),
			Scope:      scope,
			ParentID:   parentID,
			ChildIDs:   children,
			Status:     AgentStatus(status),
			Error:      errMsg,
			Result:     result,
			Metadata:   metadata,
			CreatedAt:  parseTime(createdAt),
			StartedAt:  parseTime(startedAt),
			FinishedAt: parseTime(finishedAt),
			LastSeen:   parseTime(lastSeen),
		}, nil
	}

	store, err := s.loadAgentsUnlocked()
	if err != nil {
		return nil, err
	}

	agent, exists := store.Agents[agentID]
	if !exists {
		return nil, fmt.Errorf("agent not found: %s", agentID)
	}

	return agent, nil
}

// PutAgent saves or updates a single agent
func (s *Store) PutAgent(agent *Agent) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db != nil {
		tx, err := s.db.Begin()
		if err != nil {
			return err
		}
		if err := upsertAgent(tx, agent); err != nil {
			_ = tx.Rollback()
			return err
		}
		return tx.Commit()
	}

	store, err := s.loadAgentsUnlocked()
	if err != nil {
		return err
	}

	store.Agents[agent.ID] = agent

	return s.saveAgentsUnlocked(store)
}

// DeleteAgent removes an agent from the registry
func (s *Store) DeleteAgent(agentID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db != nil {
		_, err := s.db.Exec(`DELETE FROM agents WHERE id=?`, agentID)
		return err
	}

	store, err := s.loadAgentsUnlocked()
	if err != nil {
		return err
	}

	delete(store.Agents, agentID)

	return s.saveAgentsUnlocked(store)
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}

func formatTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339Nano)
}

func parseTime(raw string) time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}
	}
	t, err := time.Parse(time.RFC3339Nano, raw)
	if err == nil {
		return t
	}
	// Best effort for older RFC3339 timestamps.
	t, _ = time.Parse(time.RFC3339, raw)
	return t
}

func upsertAgent(tx *sql.Tx, agent *Agent) error {
	if tx == nil || agent == nil {
		return nil
	}
	childrenRaw, _ := json.Marshal(agent.ChildIDs)
	resultRaw, _ := json.Marshal(agent.Result)
	metadataRaw, _ := json.Marshal(agent.Metadata)

	_, err := tx.Exec(`
		INSERT INTO agents (id, role, scope, parent_id, child_ids, status, error, result, metadata, created_at, started_at, finished_at, last_seen)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			role=excluded.role,
			scope=excluded.scope,
			parent_id=excluded.parent_id,
			child_ids=excluded.child_ids,
			status=excluded.status,
			error=excluded.error,
			result=excluded.result,
			metadata=excluded.metadata,
			started_at=excluded.started_at,
			finished_at=excluded.finished_at,
			last_seen=excluded.last_seen;
	`,
		strings.TrimSpace(agent.ID),
		string(agent.Role),
		strings.TrimSpace(agent.Scope),
		strings.TrimSpace(agent.ParentID),
		string(childrenRaw),
		string(agent.Status),
		strings.TrimSpace(agent.Error),
		string(resultRaw),
		string(metadataRaw),
		formatTime(agent.CreatedAt),
		formatTime(agent.StartedAt),
		formatTime(agent.FinishedAt),
		formatTime(agent.LastSeen),
	)
	return err
}
