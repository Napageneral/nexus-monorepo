package history

import "time"

const (
	currentVersion = 1
)

type DirPairCount struct {
	A  string `json:"a"`
	B  string `json:"b"`
	Co int    `json:"co"`
}

type CoChangeStats struct {
	Version     int               `json:"version"`
	GeneratedAt time.Time         `json:"generated_at"`
	Head        string            `json:"head"`
	MaxDepth    int               `json:"max_depth"`

	DirCommitCounts map[string]int `json:"dir_commit_counts"`
	Pairs           []DirPairCount `json:"pairs"`
}

type VelocityDirStats struct {
	Commits7d  int    `json:"commits_7d"`
	Commits30d int    `json:"commits_30d"`
	Commits90d int    `json:"commits_90d"`
	CommitsAll int    `json:"commits_all"`
	Class      string `json:"class"`
}

type VelocityStats struct {
	Version     int                        `json:"version"`
	GeneratedAt time.Time                  `json:"generated_at"`
	Head        string                     `json:"head"`
	MaxDepth    int                        `json:"max_depth"`
	ByDir       map[string]VelocityDirStats `json:"by_dir"`
}

type DirRename struct {
	From  string `json:"from"`
	To    string `json:"to"`
	Score int    `json:"score,omitempty"`
}

type StructuralEvent struct {
	Hash        string      `json:"hash"`
	Date        time.Time   `json:"date"`
	Subject     string      `json:"subject,omitempty"`
	FileChanges int         `json:"file_changes"`
	AddedDirs   []string    `json:"added_dirs,omitempty"`
	RemovedDirs []string    `json:"removed_dirs,omitempty"`
	RenamedDirs []DirRename `json:"renamed_dirs,omitempty"`
	BigBang     bool        `json:"big_bang,omitempty"`
}

type StructuralEventsStats struct {
	Version     int              `json:"version"`
	GeneratedAt time.Time        `json:"generated_at"`
	Head        string           `json:"head"`
	Events      []StructuralEvent `json:"events"`
}

type CouplingPartner struct {
	Dir    string  `json:"dir"`
	Score  float64 `json:"score"`
	Co     int     `json:"co"`
	CountA int     `json:"count_a"`
	CountB int     `json:"count_b"`
}

type HistoryContext struct {
	Scope string `json:"scope"`
	Key   string `json:"key"`

	Head        string    `json:"head"`
	GeneratedAt time.Time `json:"generated_at"`

	CoChange []CouplingPartner  `json:"co_change,omitempty"`
	Velocity *VelocityDirStats  `json:"velocity,omitempty"`
	Events   []StructuralEvent  `json:"events,omitempty"`
}

