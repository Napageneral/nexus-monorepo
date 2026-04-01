package livewatch

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"time"
)

const (
	defaultPollInterval = 50 * time.Millisecond
	defaultDebounce     = 50 * time.Millisecond
)

// Event reports a coalesced file-state change observed by the watcher.
type Event struct {
	DBPath  string
	WALPath string
	SHMPath string

	DBChanged  bool
	WALChanged bool
	SHMChanged bool

	DBExists  bool
	WALExists bool
	SHMExists bool

	DBModTime  time.Time
	WALModTime time.Time
	SHMModTime time.Time

	ChangedPaths []string
	ObservedAt   time.Time
}

// Watcher polls chat.db, chat.db-wal, and chat.db-shm for mtime changes and
// emits coalesced events after a debounce window.
type Watcher struct {
	dbPath       string
	pollInterval time.Duration
	debounce     time.Duration
	now          func() time.Time
	stat         func(string) (os.FileInfo, error)
}

// Option configures a Watcher.
type Option func(*Watcher)

// WithPollInterval overrides the polling interval.
func WithPollInterval(d time.Duration) Option {
	return func(w *Watcher) {
		if d > 0 {
			w.pollInterval = d
		}
	}
}

// WithDebounce overrides the debounce window.
func WithDebounce(d time.Duration) Option {
	return func(w *Watcher) {
		if d >= 0 {
			w.debounce = d
		}
	}
}

// WithClock overrides the clock used for event timestamps.
func WithClock(now func() time.Time) Option {
	return func(w *Watcher) {
		if now != nil {
			w.now = now
		}
	}
}

// WithStat overrides the file-stat function used by the watcher.
func WithStat(stat func(string) (os.FileInfo, error)) Option {
	return func(w *Watcher) {
		if stat != nil {
			w.stat = stat
		}
	}
}

// New constructs a watcher for the provided chat.db path.
func New(dbPath string, opts ...Option) *Watcher {
	w := &Watcher{
		dbPath:       filepath.Clean(dbPath),
		pollInterval: defaultPollInterval,
		debounce:     defaultDebounce,
		now:          time.Now,
		stat:         os.Stat,
	}
	for _, opt := range opts {
		opt(w)
	}
	return w
}

// Events starts the watcher and returns a context-aware event channel.
func (w *Watcher) Events(ctx context.Context) <-chan Event {
	out := make(chan Event, 1)
	baseline := w.capture()
	go w.run(ctx, out, baseline)
	return out
}

func (w *Watcher) run(ctx context.Context, out chan<- Event, baseline snapshot) {
	defer close(out)

	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	state := baseline
	var pending *Event
	var debounceTimer *time.Timer
	var debounceC <-chan time.Time

	stopTimer := func() {
		if debounceTimer == nil {
			debounceC = nil
			return
		}
		if !debounceTimer.Stop() {
			select {
			case <-debounceTimer.C:
			default:
			}
		}
		debounceTimer = nil
		debounceC = nil
	}

	resetTimer := func() {
		if w.debounce <= 0 {
			stopTimer()
			debounceTimer = time.NewTimer(0)
			debounceC = debounceTimer.C
			return
		}
		if debounceTimer == nil {
			debounceTimer = time.NewTimer(w.debounce)
			debounceC = debounceTimer.C
			return
		}
		if !debounceTimer.Stop() {
			select {
			case <-debounceTimer.C:
			default:
			}
		}
		debounceTimer.Reset(w.debounce)
		debounceC = debounceTimer.C
	}

	emitPending := func() bool {
		if pending == nil || len(pending.ChangedPaths) == 0 {
			return true
		}
		select {
		case out <- *pending:
			return true
		case <-ctx.Done():
			return false
		}
	}

	for {
		select {
		case <-ctx.Done():
			stopTimer()
			return
		case <-ticker.C:
			next := w.capture()
			diff := state.diff(next, w.now())
			state = next
			if diff == nil {
				continue
			}
			if pending == nil {
				pending = diff
			} else {
				pending.merge(diff)
			}
			resetTimer()
		case <-debounceC:
			stopTimer()
			if !emitPending() {
				return
			}
			pending = nil
		}
	}
}

type fileState struct {
	path    string
	exists  bool
	modTime time.Time
}

type snapshot struct {
	db  fileState
	wal fileState
	shm fileState
}

func (s snapshot) diff(next snapshot, observedAt time.Time) *Event {
	event := &Event{
		DBPath:     next.db.path,
		WALPath:    next.wal.path,
		SHMPath:    next.shm.path,
		ObservedAt: observedAt,
		DBExists:   next.db.exists,
		WALExists:  next.wal.exists,
		SHMExists:  next.shm.exists,
		DBModTime:  next.db.modTime,
		WALModTime: next.wal.modTime,
		SHMModTime: next.shm.modTime,
	}

	if s.db.changed(next.db) {
		event.DBChanged = true
		event.ChangedPaths = append(event.ChangedPaths, next.db.path)
	}
	if s.wal.changed(next.wal) {
		event.WALChanged = true
		event.ChangedPaths = append(event.ChangedPaths, next.wal.path)
	}
	if s.shm.changed(next.shm) {
		event.SHMChanged = true
		event.ChangedPaths = append(event.ChangedPaths, next.shm.path)
	}

	if len(event.ChangedPaths) == 0 {
		return nil
	}
	return event
}

func (s fileState) changed(next fileState) bool {
	if s.exists != next.exists {
		return true
	}
	if !s.exists && !next.exists {
		return false
	}
	return !s.modTime.Equal(next.modTime)
}

func (e *Event) merge(other *Event) {
	if other == nil {
		return
	}
	e.DBChanged = e.DBChanged || other.DBChanged
	e.WALChanged = e.WALChanged || other.WALChanged
	e.SHMChanged = e.SHMChanged || other.SHMChanged
	e.DBExists = other.DBExists
	e.WALExists = other.WALExists
	e.SHMExists = other.SHMExists
	e.DBModTime = other.DBModTime
	e.WALModTime = other.WALModTime
	e.SHMModTime = other.SHMModTime
	e.ObservedAt = other.ObservedAt
	e.ChangedPaths = uniquePaths(append(e.ChangedPaths, other.ChangedPaths...))
}

func uniquePaths(paths []string) []string {
	if len(paths) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(paths))
	out := make([]string, 0, len(paths))
	for _, path := range paths {
		if path == "" {
			continue
		}
		if _, ok := seen[path]; ok {
			continue
		}
		seen[path] = struct{}{}
		out = append(out, path)
	}
	sort.Strings(out)
	return out
}

func (w *Watcher) capture() snapshot {
	return snapshot{
		db:  w.capturePath(w.dbPath),
		wal: w.capturePath(w.dbPath + "-wal"),
		shm: w.capturePath(w.dbPath + "-shm"),
	}
}

func (w *Watcher) capturePath(path string) fileState {
	state := fileState{path: path}
	info, err := w.stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return state
		}
		return state
	}
	state.exists = true
	state.modTime = info.ModTime()
	return state
}
