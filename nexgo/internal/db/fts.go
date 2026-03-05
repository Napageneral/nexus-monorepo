package db

// ftsEnabled is set to true at init time when the fts5 build tag is active.
// See fts_enabled.go.
var ftsEnabled bool

// FTSEnabled reports whether FTS5 support was compiled in.
func FTSEnabled() bool {
	return ftsEnabled
}
