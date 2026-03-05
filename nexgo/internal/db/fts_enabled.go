//go:build fts5 || sqlite_fts5

package db

func init() {
	ftsEnabled = true
}
