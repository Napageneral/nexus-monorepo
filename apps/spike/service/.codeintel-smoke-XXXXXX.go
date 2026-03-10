package main

import (
  "context"
  "fmt"
  "os"
  "path/filepath"

  "github.com/Napageneral/spike/internal/codeintel"
  "github.com/Napageneral/spike/internal/spikedb"
)

func main() {
  repoRoot := "/Users/tyler/nexus/home/projects/spike-swe-atlas-lab/repos/simple-login-app-2cd6ee777f8c"
  dbPath := filepath.Join(os.TempDir(), "spike-codeintel-smoke.db")
  _ = os.Remove(dbPath)
  store, err := spikedb.Open(dbPath)
  if err != nil {
    panic(err)
  }
  defer func() {
    _ = store.Close()
    _ = os.Remove(dbPath)
  }()

  svc, err := codeintel.New(store.DB())
  if err != nil {
    panic(err)
  }
  result, err := svc.Build(context.Background(), codeintel.BuildRequest{RootPath: repoRoot})
  if err != nil {
    panic(err)
  }
  fmt.Printf("snapshot=%s files=%d chunks=%d symbols=%d\n", result.Snapshot.SnapshotID, result.Snapshot.FileCount, result.Snapshot.ChunkCount, result.Snapshot.SymbolCount)

  hits, err := svc.SearchSemantic(context.Background(), result.Snapshot.SnapshotID, "check_suffix_signature", 5)
  if err != nil {
    panic(err)
  }
  fmt.Printf("search_hits=%d first=%s\n", len(hits.Hits), firstHit(hits))

  symbols, err := svc.ResolveSymbol(context.Background(), result.Snapshot.SnapshotID, "check_suffix_signature", "python", 5)
  if err != nil {
    panic(err)
  }
  fmt.Printf("symbol_matches=%d first=%s\n", len(symbols), firstSymbol(symbols))

  imports, err := svc.GetImports(context.Background(), result.Snapshot.SnapshotID, "app/api/views/new_custom_alias.py")
  if err != nil {
    panic(err)
  }
  fmt.Printf("imports_for_new_custom_alias=%d\n", len(imports))
}

func firstHit(r *codeintel.SearchResult) string {
  if r == nil || len(r.Hits) == 0 {
    return ""
  }
  return r.Hits[0].FilePath
}

func firstSymbol(symbols []codeintel.SymbolRecord) string {
  if len(symbols) == 0 {
    return ""
  }
  return symbols[0].FilePath
}
