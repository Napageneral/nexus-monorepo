package cron

import (
	"context"
	"log/slog"
	"time"

	"github.com/Napageneral/nexus/internal/pipeline"
)

// EventDispatcher processes cron-fired events.
type EventDispatcher interface {
	HandleEvent(ctx context.Context, req *pipeline.NexusRequest) error
}

// Service is the cron/clock service that periodically checks for due schedules.
type Service struct {
	store      *Store
	dispatcher EventDispatcher
	ticker     *time.Ticker
	done       chan struct{}
	logger     *slog.Logger
}

// NewService creates a new cron Service.
func NewService(store *Store, dispatcher EventDispatcher, logger *slog.Logger) *Service {
	if logger == nil {
		logger = slog.Default()
	}
	return &Service{
		store:      store,
		dispatcher: dispatcher,
		done:       make(chan struct{}),
		logger:     logger,
	}
}

// Name returns the service name.
func (s *Service) Name() string { return "cron" }

// Start begins the ticker loop that checks for due schedules.
func (s *Service) Start(ctx context.Context) error {
	s.ticker = time.NewTicker(30 * time.Second)
	s.logger.Info("cron service started", "interval", "30s")

	go func() {
		for {
			select {
			case <-s.ticker.C:
				s.tick(ctx)
			case <-s.done:
				return
			case <-ctx.Done():
				return
			}
		}
	}()

	return nil
}

// Stop halts the ticker loop.
func (s *Service) Stop(_ context.Context) error {
	if s.ticker != nil {
		s.ticker.Stop()
	}
	close(s.done)
	s.logger.Info("cron service stopped")
	return nil
}

// tick checks all enabled schedules for ones that are due and fires them.
func (s *Service) tick(ctx context.Context) {
	schedules, err := s.store.List(ctx)
	if err != nil {
		s.logger.Error("cron tick: list schedules", "error", err)
		return
	}

	now := time.Now()
	for _, sched := range schedules {
		if !sched.Enabled {
			continue
		}
		if sched.NextRun == nil {
			continue
		}
		if sched.NextRun.After(now) {
			continue
		}

		if err := s.fireSchedule(ctx, sched); err != nil {
			s.logger.Error("cron tick: fire schedule",
				"schedule_id", sched.ID,
				"name", sched.Name,
				"error", err,
			)
		}
	}
}

// fireSchedule executes a due schedule by dispatching its operation
// and updating the run record.
func (s *Service) fireSchedule(ctx context.Context, sched Schedule) error {
	s.logger.Info("cron: firing schedule",
		"id", sched.ID,
		"name", sched.Name,
		"operation", sched.Operation,
	)

	req := pipeline.NewRequest(pipeline.NexusInput{
		Operation: sched.Operation,
		Routing: pipeline.Routing{
			Adapter:  "cron",
			Platform: "system",
			Sender: pipeline.RoutingParticipant{
				ID:   "cron",
				Name: "cron-scheduler",
			},
		},
		Payload: sched.Payload,
	})

	if s.dispatcher != nil {
		if err := s.dispatcher.HandleEvent(ctx, req); err != nil {
			s.logger.Warn("cron: dispatch error",
				"schedule_id", sched.ID,
				"error", err,
			)
		}
	}

	// Calculate next run time.
	nextRun, err := NextRun(sched.Expression, time.Now())
	if err != nil {
		s.logger.Warn("cron: next run calculation failed",
			"schedule_id", sched.ID,
			"error", err,
		)
		// Use a fallback of now + 1 hour.
		nextRun = time.Now().Add(time.Hour)
	}

	return s.store.MarkRun(ctx, sched.ID, nextRun)
}
