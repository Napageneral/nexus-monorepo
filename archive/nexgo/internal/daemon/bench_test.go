package daemon

import (
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/Napageneral/nexus/internal/config"
	"github.com/Napageneral/nexus/internal/db"
	"github.com/Napageneral/nexus/internal/operations"
	"github.com/Napageneral/nexus/internal/pipeline"
)

// BenchmarkStartup measures the time to create daemon, open databases, and set up pipeline.
func BenchmarkStartup(b *testing.B) {
	for i := 0; i < b.N; i++ {
		tmpDir := b.TempDir()

		// Create config.
		cfg := config.Default()

		// Open ledgers.
		ledgers, err := db.OpenLedgers(filepath.Join(tmpDir, "data"))
		if err != nil {
			b.Fatalf("OpenLedgers: %v", err)
		}

		// Create pipeline.
		reg := operations.NewRegistry()
		resolver := operations.NewResolver(reg)
		p := pipeline.NewPipeline(resolver)

		// Create daemon.
		paths := config.Paths{
			StateDir: tmpDir,
			DataDir:  filepath.Join(tmpDir, "data"),
			PIDFile:  filepath.Join(tmpDir, "nex.pid"),
		}
		logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
		d := New(cfg, paths, logger)

		// Close everything.
		ledgers.Close()
		_ = p
		_ = d
	}
}

// BenchmarkStartupParallel measures startup performance under concurrent load.
func BenchmarkStartupParallel(b *testing.B) {
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			tmpDir := b.TempDir()
			cfg := config.Default()
			ledgers, err := db.OpenLedgers(filepath.Join(tmpDir, "data"))
			if err != nil {
				b.Fatalf("OpenLedgers: %v", err)
			}
			reg := operations.NewRegistry()
			resolver := operations.NewResolver(reg)
			p := pipeline.NewPipeline(resolver)
			ledgers.Close()
			_ = p
			_ = cfg
		}
	})
}
