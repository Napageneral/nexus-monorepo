package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sort"
	"sync"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

// transactionsMercury is a primary-read Mercury with no accounts, recipients or approval requests, whose transaction list
// returns the rows the test sets that were created at or after the read's start, as Mercury filters by creation time.
type transactionsMercury struct {
	t              *testing.T
	server         *httptest.Server
	lock           sync.Mutex
	rows           []map[string]any
	starts         []string
	failRecipients bool
}

func newTransactionsMercury(t *testing.T) *transactionsMercury {
	t.Helper()
	mercury := &transactionsMercury{t: t}
	mercury.server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		mercury.lock.Lock()
		defer mercury.lock.Unlock()
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/accounts", "/credit":
			_, _ = writer.Write([]byte(`{"accounts":[],"page":{"nextPage":null}}`))
		case "/transactions":
			start := request.URL.Query().Get("start")
			mercury.starts = append(mercury.starts, start)
			from, err := time.Parse(time.RFC3339, start)
			if err != nil {
				t.Errorf("transaction start %q: %v", start, err)
			}
			returned := []map[string]any{}
			for _, row := range mercury.rows {
				createdAt, _ := time.Parse(time.RFC3339, row["createdAt"].(string))
				if !createdAt.Before(from) {
					returned = append(returned, row)
				}
			}
			body, _ := json.Marshal(map[string]any{"transactions": returned, "page": map[string]any{"nextPage": nil}})
			_, _ = writer.Write(body)
		case "/recipients":
			if mercury.failRecipients {
				writer.WriteHeader(http.StatusBadRequest)
				_, _ = writer.Write([]byte(`{"errors":{"message":"refused"}}`))
				return
			}
			_, _ = writer.Write([]byte(`{"recipients":[],"page":{"nextPage":null}}`))
		case "/request-send-money":
			_, _ = writer.Write([]byte(`{"requests":[],"page":{"nextPage":null}}`))
		default:
			t.Errorf("unexpected path %s", request.URL.Path)
			writer.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(mercury.server.Close)
	return mercury
}

func (mercury *transactionsMercury) set(rows ...map[string]any) {
	mercury.lock.Lock()
	defer mercury.lock.Unlock()
	mercury.rows = rows
}

func (mercury *transactionsMercury) lastStart() string {
	mercury.lock.Lock()
	defer mercury.lock.Unlock()
	if len(mercury.starts) == 0 {
		return ""
	}
	return mercury.starts[len(mercury.starts)-1]
}

func mercuryTransactionRowAt(id string, createdAt time.Time, status string, postedAt time.Time) map[string]any {
	row := map[string]any{
		"id":        id,
		"amount":    -125.5,
		"createdAt": createdAt.UTC().Format(time.RFC3339),
		"status":    status,
	}
	if !postedAt.IsZero() {
		row["postedAt"] = postedAt.UTC().Format(time.RFC3339)
	}
	return row
}

// recordedTransactions lists the transaction revisions a poll recorded, as "id status", in order.
func recordedTransactions(t *testing.T, records []nexadapter.AdapterInboundRecord) []string {
	t.Helper()
	recorded := []string{}
	for _, record := range recordsForFamily(records, "transaction_revision") {
		payload, _ := record.Payload.Metadata["provider_payload"].(map[string]any)
		status, _ := payload["status"].(string)
		recorded = append(recorded, record.Payload.Metadata["provider_object_id"].(string)+" "+status)
	}
	sort.Strings(recorded)
	return recorded
}

func pollTransactions(
	t *testing.T,
	reads *mercuryTransactionReads,
	mercury *transactionsMercury,
	since time.Time,
	now time.Time,
) []string {
	t.Helper()
	records, cursor, err := reads.fetch(context.Background(), testMercuryClient(mercury.server, rolePrimaryRead), since, now)
	if err != nil {
		t.Fatal(err)
	}
	if cursor.IsZero() {
		t.Fatal("the poll cursor did not advance")
	}
	return recordedTransactions(t, records)
}

// W1-X89: a transaction still pending when the poll cursor passed its creation was never read again, so its posting never
// reached Nex (V05 finding 5: 58 lines). Before this change the third poll read from the cursor and recorded nothing.
func TestMonitorReadsAPendingTransactionAgainUntilItPosts(t *testing.T) {
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	since := now.Add(-mercuryMonitorReplayWindow)
	mercury := newTransactionsMercury(t)
	pendingCreated := now.Add(-10 * 24 * time.Hour)
	mercury.set(
		mercuryTransactionRowAt("txn_wire", pendingCreated, "pending", time.Time{}),
		mercuryTransactionRowAt("txn_posted_before", now.Add(-6*24*time.Hour), "sent", now.Add(-5*24*time.Hour)),
		mercuryTransactionRowAt("txn_posted_since", now.Add(-3*24*time.Hour), "sent", now.Add(-2*time.Hour)),
		mercuryTransactionRowAt("txn_failed", now.Add(-3*24*time.Hour), "failed", time.Time{}),
		mercuryTransactionRowAt("txn_today", now.Add(-time.Hour), "sent", now.Add(-30*time.Minute)),
	)
	reads := newMercuryTransactionReads()

	// The run's first poll reaches back over the window. It records what is open, what posted since the cursor, what is
	// final another way, and what is new; not a line posted before the cursor (an earlier run recorded it).
	first := pollTransactions(t, reads, mercury, since, now)
	if got, want := mercury.lastStart(), now.Add(-mercuryMonitorOpenTransactionWindow).Format(time.RFC3339); got != want {
		t.Fatalf("first transaction start = %q, want the window's %q", got, want)
	}
	if want := []string{"txn_failed failed", "txn_posted_since sent", "txn_today sent", "txn_wire pending"}; !reflect.DeepEqual(first, want) {
		t.Fatalf("first poll recorded %v, want %v", first, want)
	}

	// Five minutes on, nothing is due again: the read starts at the cursor.
	if got := pollTransactions(t, reads, mercury, now, now.Add(5*time.Minute)); len(got) != 0 {
		t.Fatalf("second poll recorded %v", got)
	}
	if got, want := mercury.lastStart(), now.Format(time.RFC3339); got != want {
		t.Fatalf("second transaction start = %q, want the cursor %q", got, want)
	}

	// The bank posts the wire. The re-read reaches back to it and records it once, posted, and nothing it read unchanged.
	mercury.set(
		mercuryTransactionRowAt("txn_wire", pendingCreated, "sent", now.Add(30*time.Minute)),
		mercuryTransactionRowAt("txn_posted_before", now.Add(-6*24*time.Hour), "sent", now.Add(-5*24*time.Hour)),
		mercuryTransactionRowAt("txn_posted_since", now.Add(-3*24*time.Hour), "sent", now.Add(-2*time.Hour)),
		mercuryTransactionRowAt("txn_failed", now.Add(-3*24*time.Hour), "failed", time.Time{}),
		mercuryTransactionRowAt("txn_today", now.Add(-time.Hour), "sent", now.Add(-30*time.Minute)),
	)
	third := pollTransactions(t, reads, mercury, now.Add(60*time.Minute), now.Add(65*time.Minute))
	if got, want := mercury.lastStart(), pendingCreated.Format(time.RFC3339); got != want {
		t.Fatalf("re-read transaction start = %q, want the open wire's creation %q", got, want)
	}
	if want := []string{"txn_wire sent"}; !reflect.DeepEqual(third, want) {
		t.Fatalf("re-read recorded %v, want %v", third, want)
	}

	// Nothing is open now: two hours on, the read starts at the cursor again.
	if got := pollTransactions(t, reads, mercury, now.Add(170*time.Minute), now.Add(175*time.Minute)); len(got) != 0 {
		t.Fatalf("fourth poll recorded %v", got)
	}
	if got, want := mercury.lastStart(), now.Add(170*time.Minute).Format(time.RFC3339); got != want {
		t.Fatalf("fourth transaction start = %q, want the cursor %q", got, want)
	}
}

// An open transaction read again unchanged is not recorded again (each record carries its capture time, so it would be
// a new record), nor when only its attachments' signed URLs changed; a real change is recorded.
func TestMonitorRecordsAnOpenTransactionAgainOnlyWhenItChanges(t *testing.T) {
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	mercury := newTransactionsMercury(t)
	created := now.Add(-2 * 24 * time.Hour)
	withAttachment := func(url string, amount float64) map[string]any {
		row := mercuryTransactionRowAt("txn_card", created, "pending", time.Time{})
		row["amount"] = amount
		row["attachments"] = []any{map[string]any{"attachmentType": "receipt", "fileName": "receipt.pdf", "url": url}}
		return row
	}
	mercury.set(withAttachment("https://files.example.test/first", -40))
	reads := newMercuryTransactionReads()
	if got := pollTransactions(t, reads, mercury, now.Add(-mercuryMonitorReplayWindow), now); !reflect.DeepEqual(got, []string{"txn_card pending"}) {
		t.Fatalf("first poll recorded %v", got)
	}
	mercury.set(withAttachment("https://files.example.test/rotated", -40))
	if got := pollTransactions(t, reads, mercury, now, now.Add(61*time.Minute)); len(got) != 0 {
		t.Fatalf("a re-read with only a rotated attachment URL recorded %v", got)
	}
	if got, want := mercury.lastStart(), created.Format(time.RFC3339); got != want {
		t.Fatalf("re-read start = %q, want %q", got, want)
	}
	mercury.set(withAttachment("https://files.example.test/again", -42.75))
	if got := pollTransactions(t, reads, mercury, now.Add(61*time.Minute), now.Add(122*time.Minute)); !reflect.DeepEqual(got, []string{"txn_card pending"}) {
		t.Fatalf("a re-read of a changed amount recorded %v", got)
	}
}

// A fetch that fails after the transaction read changes nothing in the monitor's memory, so the next poll reads and
// records the same change.
func TestMonitorKeepsItsMemoryWhenAFetchFails(t *testing.T) {
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	mercury := newTransactionsMercury(t)
	created := now.Add(-4 * 24 * time.Hour)
	mercury.set(mercuryTransactionRowAt("txn_ach", created, "pending", time.Time{}))
	reads := newMercuryTransactionReads()
	pollTransactions(t, reads, mercury, now.Add(-mercuryMonitorReplayWindow), now)

	mercury.set(mercuryTransactionRowAt("txn_ach", created, "sent", now.Add(40*time.Minute)))
	mercury.lock.Lock()
	mercury.failRecipients = true
	mercury.lock.Unlock()
	if records, _, err := reads.fetch(context.Background(), testMercuryClient(mercury.server, rolePrimaryRead), now.Add(55*time.Minute), now.Add(61*time.Minute)); err == nil {
		t.Fatalf("a fetch whose recipients read failed succeeded with %d records", len(records))
	}
	mercury.lock.Lock()
	mercury.failRecipients = false
	mercury.lock.Unlock()
	if got := pollTransactions(t, reads, mercury, now.Add(55*time.Minute), now.Add(62*time.Minute)); !reflect.DeepEqual(got, []string{"txn_ach sent"}) {
		t.Fatalf("the poll after a failed fetch recorded %v", got)
	}
	if got, want := mercury.lastStart(), created.Format(time.RFC3339); got != want {
		t.Fatalf("the poll after a failed fetch started at %q, want %q", got, want)
	}
}

// A transaction still open after the window is no longer read again: the re-read starts at the window's edge.
func TestMonitorStopsReadingATransactionOpenPastTheWindow(t *testing.T) {
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	mercury := newTransactionsMercury(t)
	mercury.set(mercuryTransactionRowAt("txn_held", now.Add(-44*24*time.Hour), "pending", time.Time{}))
	reads := newMercuryTransactionReads()
	if got := pollTransactions(t, reads, mercury, now.Add(-mercuryMonitorReplayWindow), now); !reflect.DeepEqual(got, []string{"txn_held pending"}) {
		t.Fatalf("first poll recorded %v", got)
	}
	later := now.Add(2 * 24 * time.Hour)
	pollTransactions(t, reads, mercury, later.Add(-5*time.Minute), later)
	if got, want := mercury.lastStart(), later.Add(-mercuryMonitorOpenTransactionWindow).Format(time.RFC3339); got != want {
		t.Fatalf("re-read start = %q, want the window's edge %q", got, want)
	}
	if len(reads.open) != 0 {
		t.Fatalf("open after the window = %v", reads.open)
	}
	pollTransactions(t, reads, mercury, later, later.Add(2*time.Hour))
	if got, want := mercury.lastStart(), later.Format(time.RFC3339); got != want {
		t.Fatalf("with nothing open the read starts at %q, want the cursor %q", got, want)
	}
}
