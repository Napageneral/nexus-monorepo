package spikedb

import (
	"context"
	"time"
)

// AgentConfig represents tuning parameters for building and querying indexes.
type AgentConfig struct {
	ConfigID     string `json:"config_id"`
	DisplayName  string `json:"display_name"`
	Capacity     int    `json:"capacity"`
	MaxChildren  int    `json:"max_children"`
	MaxParallel  int    `json:"max_parallel"`
	HydrateModel string `json:"hydrate_model"`
	AskModel     string `json:"ask_model"`
	CreatedAt    int64  `json:"created_at"`
	UpdatedAt    int64  `json:"updated_at"`
}

// GetConfig retrieves an AgentConfig by ID.
func (s *Store) GetConfig(ctx context.Context, configID string) (*AgentConfig, error) {
	var c AgentConfig
	err := s.db.QueryRowContext(ctx, `
		SELECT config_id, display_name, capacity, max_children, max_parallel,
		       hydrate_model, ask_model, created_at, updated_at
		FROM agent_configs WHERE config_id = ?
	`, configID).Scan(
		&c.ConfigID, &c.DisplayName, &c.Capacity, &c.MaxChildren, &c.MaxParallel,
		&c.HydrateModel, &c.AskModel, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// GetDefaultConfig retrieves the default AgentConfig.
func (s *Store) GetDefaultConfig(ctx context.Context) (*AgentConfig, error) {
	return s.GetConfig(ctx, "default")
}

// ListConfigs returns all AgentConfig rows.
func (s *Store) ListConfigs(ctx context.Context) ([]AgentConfig, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT config_id, display_name, capacity, max_children, max_parallel,
		       hydrate_model, ask_model, created_at, updated_at
		FROM agent_configs ORDER BY config_id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var configs []AgentConfig
	for rows.Next() {
		var c AgentConfig
		if err := rows.Scan(
			&c.ConfigID, &c.DisplayName, &c.Capacity, &c.MaxChildren, &c.MaxParallel,
			&c.HydrateModel, &c.AskModel, &c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, err
		}
		configs = append(configs, c)
	}
	return configs, rows.Err()
}

// UpsertConfig creates or updates an AgentConfig.
func (s *Store) UpsertConfig(ctx context.Context, c AgentConfig) error {
	now := time.Now().Unix()
	if c.CreatedAt == 0 {
		c.CreatedAt = now
	}
	c.UpdatedAt = now
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO agent_configs (config_id, display_name, capacity, max_children, max_parallel, hydrate_model, ask_model, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(config_id) DO UPDATE SET
			display_name=excluded.display_name,
			capacity=excluded.capacity,
			max_children=excluded.max_children,
			max_parallel=excluded.max_parallel,
			hydrate_model=excluded.hydrate_model,
			ask_model=excluded.ask_model,
			updated_at=excluded.updated_at
	`, c.ConfigID, c.DisplayName, c.Capacity, c.MaxChildren, c.MaxParallel,
		c.HydrateModel, c.AskModel, c.CreatedAt, c.UpdatedAt)
	return err
}
