package adapters

import (
	"crypto/rand"
	"fmt"
	"sync"
	"time"
)

// ValidateInbound checks that a ProtocolMessage has all required fields.
func ValidateInbound(msg ProtocolMessage) error {
	if msg.ID == "" {
		return fmt.Errorf("message ID is required")
	}
	if msg.Verb == "" {
		return fmt.Errorf("message verb is required")
	}

	// Validate that the verb is one of the known verbs.
	switch msg.Verb {
	case VerbInfo, VerbMonitor, VerbBackfill, VerbSend, VerbStream, VerbHealth, VerbAccounts:
		// valid
	default:
		return fmt.Errorf("unknown verb: %s", msg.Verb)
	}

	return nil
}

// Deduplicator tracks recently seen event IDs to prevent duplicate processing.
type Deduplicator struct {
	seen map[string]time.Time
	mu   sync.Mutex
	ttl  time.Duration
}

// NewDeduplicator creates a new Deduplicator with the given TTL for entries.
func NewDeduplicator(ttl time.Duration) *Deduplicator {
	return &Deduplicator{
		seen: make(map[string]time.Time),
		ttl:  ttl,
	}
}

// IsDuplicate returns true if the given eventID has been seen within the TTL window.
// If the eventID is new, it is recorded and false is returned.
func (d *Deduplicator) IsDuplicate(eventID string) bool {
	d.mu.Lock()
	defer d.mu.Unlock()

	if ts, exists := d.seen[eventID]; exists {
		if time.Since(ts) < d.ttl {
			return true
		}
	}

	d.seen[eventID] = time.Now()
	return false
}

// Cleanup removes expired entries from the deduplication map.
func (d *Deduplicator) Cleanup() {
	d.mu.Lock()
	defer d.mu.Unlock()

	now := time.Now()
	for id, ts := range d.seen {
		if now.Sub(ts) >= d.ttl {
			delete(d.seen, id)
		}
	}
}

// newUUID generates a random UUID v4.
func newUUID() string {
	var buf [16]byte
	_, _ = rand.Read(buf[:])
	buf[6] = (buf[6] & 0x0f) | 0x40 // version 4
	buf[8] = (buf[8] & 0x3f) | 0x80 // variant 2
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		buf[0:4], buf[4:6], buf[6:8], buf[8:10], buf[10:16])
}
