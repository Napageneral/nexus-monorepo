package pipeline

// Entity is the canonical identity object from identity.db.
// It represents both senders (humans, adapters) and receivers (the runtime, agents).
type Entity struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Type         string   `json:"type"`
	Normalized   string   `json:"normalized,omitempty"`
	IsUser       bool     `json:"is_user"`
	Origin       string   `json:"origin,omitempty"`
	PersonaPath  string   `json:"persona_path,omitempty"`
	Tags         []string `json:"tags"`
	MergedInto   string   `json:"merged_into,omitempty"`
	MentionCount int      `json:"mention_count,omitempty"`
	CreatedAt    int64    `json:"created_at"`
	UpdatedAt    int64    `json:"updated_at,omitempty"`
}
