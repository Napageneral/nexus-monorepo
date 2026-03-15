package daemon

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/Napageneral/nexus/internal/config"
)

// Service is something the daemon manages (HTTP server, WS server, etc.).
type Service interface {
	// Start launches the service. It should return quickly and run in the background.
	Start(ctx context.Context) error
	// Stop gracefully shuts down the service.
	Stop(ctx context.Context) error
	// Name returns a human-readable service name.
	Name() string
}

// Daemon is the main nexus process manager.
type Daemon struct {
	cfg      *config.Config
	paths    config.Paths
	pidLock  *PIDLock
	services []Service
	logger   *slog.Logger
	startAt  time.Time
	mu       sync.Mutex
}

// New creates a new Daemon with the given config and paths.
func New(cfg *config.Config, paths config.Paths, logger *slog.Logger) *Daemon {
	return &Daemon{
		cfg:    cfg,
		paths:  paths,
		logger: logger,
	}
}

// Config returns the daemon's config.
func (d *Daemon) Config() *config.Config {
	return d.cfg
}

// Paths returns the daemon's resolved paths.
func (d *Daemon) Paths() config.Paths {
	return d.paths
}

// Uptime returns how long the daemon has been running.
func (d *Daemon) Uptime() time.Duration {
	if d.startAt.IsZero() {
		return 0
	}
	return time.Since(d.startAt)
}

// AddService registers a service to be managed by the daemon.
func (d *Daemon) AddService(svc Service) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.services = append(d.services, svc)
}

// Run starts the daemon and blocks until shutdown.
// It acquires the PID lock, starts all services, waits for a signal, then shuts down.
func (d *Daemon) Run(ctx context.Context) error {
	d.startAt = time.Now()

	// Acquire PID lock
	lock, err := AcquirePIDLock(d.paths.PIDFile)
	if err != nil {
		return fmt.Errorf("acquiring pid lock: %w", err)
	}
	d.pidLock = lock
	d.logger.Info("pid lock acquired", "path", lock.Path(), "pid", os.Getpid())

	// Set up signal handling
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT, syscall.SIGUSR1)

	// Start all services
	for _, svc := range d.services {
		d.logger.Info("starting service", "name", svc.Name())
		if err := svc.Start(ctx); err != nil {
			d.logger.Error("failed to start service", "name", svc.Name(), "error", err)
			d.shutdown()
			return fmt.Errorf("starting %s: %w", svc.Name(), err)
		}
	}

	d.logger.Info("nexus ready",
		"port", config.EffectivePort(d.cfg),
		"pid", os.Getpid(),
	)

	// Wait for signal
	for {
		select {
		case sig := <-sigCh:
			switch sig {
			case syscall.SIGUSR1:
				d.logger.Info("received SIGUSR1 — config reload requested (stub)")
				// Phase 3: implement hot-reload
				continue
			case syscall.SIGTERM, syscall.SIGINT:
				d.logger.Info("received shutdown signal", "signal", sig)
				d.shutdown()
				return nil
			}
		case <-ctx.Done():
			d.logger.Info("context cancelled, shutting down")
			d.shutdown()
			return ctx.Err()
		}
	}
}

// shutdown performs graceful shutdown: stop services, close DBs, release PID lock.
func (d *Daemon) shutdown() {
	d.logger.Info("starting graceful shutdown")

	// Create a shutdown context with timeout
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Stop services in reverse order
	d.mu.Lock()
	services := make([]Service, len(d.services))
	copy(services, d.services)
	d.mu.Unlock()

	for i := len(services) - 1; i >= 0; i-- {
		svc := services[i]
		d.logger.Info("stopping service", "name", svc.Name())
		if err := svc.Stop(shutdownCtx); err != nil {
			d.logger.Error("error stopping service", "name", svc.Name(), "error", err)
		}
	}

	// Release PID lock
	if d.pidLock != nil {
		if err := d.pidLock.Release(); err != nil {
			d.logger.Error("error releasing pid lock", "error", err)
		}
		d.logger.Info("pid lock released")
	}

	d.logger.Info("nexus shutdown complete",
		"uptime", d.Uptime().String(),
	)
}

// Shutdown triggers a graceful shutdown from outside (e.g., from tests).
func (d *Daemon) Shutdown() {
	d.shutdown()
}
