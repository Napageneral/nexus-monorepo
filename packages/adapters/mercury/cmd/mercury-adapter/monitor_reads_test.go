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

func mercuryFailedRowAt(id string, createdAt time.Time, failedAt time.Time) map[string]any {
	row := mercuryTransactionRowAt(id, createdAt, "failed", time.Time{})
	row["failedAt"] = failedAt.UTC().Format(time.RFC3339)
	return row
}

// recordedTransactions lists the transaction revisions a poll recorded, as "id status", in order.
func recordedTransactions(t *testing.T, records []nexadapter.AdapterInboundRecord) []string {
	t.Helper()
	recorded := []string{}
	for _, record := range recordsForFamily(records, mercuryProjectionSources["listTransactions"].Family) {
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
	pendingCreated := now.Add(-3 * 24 * time.Hour)
	rows := func(wire map[string]any) []map[string]any {
		return []map[string]any{
			wire,
			mercuryTransactionRowAt("txn_posted_before", now.Add(-6*24*time.Hour), "sent", now.Add(-5*24*time.Hour)),
			mercuryTransactionRowAt("txn_posted_since", now.Add(-3*24*time.Hour), "sent", now.Add(-2*time.Hour)),
			mercuryFailedRowAt("txn_failed_before", now.Add(-4*24*time.Hour), now.Add(-3*24*time.Hour)),
			mercuryFailedRowAt("txn_failed_since", now.Add(-2*24*time.Hour), now.Add(-time.Hour)),
			mercuryTransactionRowAt("txn_today", now.Add(-time.Hour), "sent", now.Add(-30*time.Minute)),
		}
	}
	mercury.set(rows(mercuryTransactionRowAt("txn_wire", pendingCreated, "pending", time.Time{}))...)
	reads := newMercuryTransactionReads()

	// The run's first poll reaches back over the window. It records what is new and what may have changed after an earlier
	// run read it (posted or failed since the cursor); not a line posted or failed before the cursor, and not the open
	// wire, which it remembers.
	first := pollTransactions(t, reads, mercury, since, now)
	if got, want := mercury.lastStart(), now.Add(-mercuryMonitorOpenTransactionWindow).Format(time.RFC3339); got != want {
		t.Fatalf("first transaction start = %q, want the window's %q", got, want)
	}
	if want := []string{"txn_failed_since failed", "txn_posted_since sent", "txn_today sent"}; !reflect.DeepEqual(first, want) {
		t.Fatalf("first poll recorded %v, want %v", first, want)
	}

	// Five minutes on, nothing is due again: the read starts at the cursor.
	if got := pollTransactions(t, reads, mercury, now, now.Add(5*time.Minute)); len(got) != 0 {
		t.Fatalf("second poll recorded %v", got)
	}
	if got, want := mercury.lastStart(), now.Format(time.RFC3339); got != want {
		t.Fatalf("second transaction start = %q, want the cursor %q", got, want)
	}

	// The bank posts the wire. The hourly re-read reaches back to it and records it once, posted, and nothing it read
	// unchanged.
	mercury.set(rows(mercuryTransactionRowAt("txn_wire", pendingCreated, "sent", now.Add(30*time.Minute)))...)
	third := pollTransactions(t, reads, mercury, now.Add(60*time.Minute), now.Add(65*time.Minute))
	if got, want := mercury.lastStart(), pendingCreated.Add(-mercuryMonitorOpenTransactionMargin).Format(time.RFC3339); got != want {
		t.Fatalf("re-read transaction start = %q, want a margin before the open wire's creation %q", got, want)
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

// A restart records again only what may have changed after an earlier run read it. Unchanged old rows are not recorded
// again, open ones included; a cancelled or reversed row, or a posted one with no posting time, carries no time to
// judge by, so each run records it.
func TestMonitorRestartRecordsAgainOnlyWhatMayHaveChanged(t *testing.T) {
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	mercury := newTransactionsMercury(t)
	mercury.set(
		mercuryFailedRowAt("txn_failed", now.Add(-30*24*time.Hour), now.Add(-29*24*time.Hour)),
		mercuryTransactionRowAt("txn_reversed", now.Add(-40*24*time.Hour), "reversed", now.Add(-39*24*time.Hour)),
		mercuryTransactionRowAt("txn_cancelled", now.Add(-20*24*time.Hour), "cancelled", time.Time{}),
		mercuryTransactionRowAt("txn_pending", now.Add(-10*24*time.Hour), "pending", time.Time{}),
		mercuryTransactionRowAt("txn_blocked", now.Add(-10*24*time.Hour), "blocked", time.Time{}),
		mercuryTransactionRowAt("txn_posted", now.Add(-12*24*time.Hour), "sent", now.Add(-11*24*time.Hour)),
		mercuryTransactionRowAt("txn_sent_untimed", now.Add(-12*24*time.Hour), "sent", time.Time{}),
	)
	for run := 0; run < 3; run++ {
		start := now.Add(time.Duration(run) * 6 * time.Hour)
		got := pollTransactions(t, newMercuryTransactionReads(), mercury, start.Add(-mercuryMonitorReplayWindow), start)
		if want := []string{"txn_cancelled cancelled", "txn_reversed reversed", "txn_sent_untimed sent"}; !reflect.DeepEqual(got, want) {
			t.Fatalf("run %d's first poll recorded %v, want %v", run+1, got, want)
		}
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
	if got := pollTransactions(t, reads, mercury, now.Add(-mercuryMonitorReplayWindow), now); len(got) != 0 {
		t.Fatalf("first poll recorded the old open row: %v", got)
	}
	mercury.set(withAttachment("https://files.example.test/rotated", -40))
	if got := pollTransactions(t, reads, mercury, now, now.Add(61*time.Minute)); len(got) != 0 {
		t.Fatalf("a re-read with only a rotated attachment URL recorded %v", got)
	}
	if got, want := mercury.lastStart(), created.Add(-mercuryMonitorOpenTransactionMargin).Format(time.RFC3339); got != want {
		t.Fatalf("re-read start = %q, want %q", got, want)
	}
	mercury.set(withAttachment("https://files.example.test/again", -42.75))
	if got := pollTransactions(t, reads, mercury, now.Add(61*time.Minute), now.Add(122*time.Minute)); !reflect.DeepEqual(got, []string{"txn_card pending"}) {
		t.Fatalf("a re-read of a changed amount recorded %v", got)
	}
}

// An open transaction older than a week is read again once a day, not every hour (a read back weeks holds every row
// since in a receipt that is kept), and its posting is recorded at that read.
func TestMonitorReadsAnOldOpenTransactionOnceADay(t *testing.T) {
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	mercury := newTransactionsMercury(t)
	created := now.Add(-10 * 24 * time.Hour)
	mercury.set(mercuryTransactionRowAt("txn_hold", created, "pending", time.Time{}))
	reads := newMercuryTransactionReads()
	pollTransactions(t, reads, mercury, now.Add(-mercuryMonitorReplayWindow), now)
	mercury.set(mercuryTransactionRowAt("txn_hold", created, "sent", now.Add(2*time.Hour)))
	if got := pollTransactions(t, reads, mercury, now.Add(3*time.Hour), now.Add(3*time.Hour+5*time.Minute)); len(got) != 0 {
		t.Fatalf("an hourly poll reached the week-old row: %v", got)
	}
	if got, want := mercury.lastStart(), now.Add(3*time.Hour).Format(time.RFC3339); got != want {
		t.Fatalf("hourly poll start = %q, want the cursor %q", got, want)
	}
	day := now.Add(24*time.Hour + 5*time.Minute)
	if got := pollTransactions(t, reads, mercury, day.Add(-5*time.Minute), day); !reflect.DeepEqual(got, []string{"txn_hold sent"}) {
		t.Fatalf("the daily read recorded %v", got)
	}
	if got, want := mercury.lastStart(), created.Add(-mercuryMonitorOpenTransactionMargin).Format(time.RFC3339); got != want {
		t.Fatalf("daily read start = %q, want %q", got, want)
	}
}

// One read that leaves out an open transaction younger than the window does not drop it: it stays open and its posting
// is recorded at a later read.
func TestMonitorKeepsAnOpenTransactionAReadDidNotReturn(t *testing.T) {
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	mercury := newTransactionsMercury(t)
	created := now.Add(-3 * 24 * time.Hour)
	mercury.set(mercuryTransactionRowAt("txn_ach", created, "pending", time.Time{}))
	reads := newMercuryTransactionReads()
	pollTransactions(t, reads, mercury, now.Add(-mercuryMonitorReplayWindow), now)
	mercury.set()
	pollTransactions(t, reads, mercury, now.Add(55*time.Minute), now.Add(61*time.Minute))
	if _, open := reads.open["txn_ach"]; !open {
		t.Fatal("an open transaction one read left out was dropped")
	}
	mercury.set(mercuryTransactionRowAt("txn_ach", created, "sent", now.Add(90*time.Minute)))
	if got := pollTransactions(t, reads, mercury, now.Add(115*time.Minute), now.Add(122*time.Minute)); !reflect.DeepEqual(got, []string{"txn_ach sent"}) {
		t.Fatalf("the next re-read recorded %v", got)
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
	if got, want := mercury.lastStart(), created.Add(-mercuryMonitorOpenTransactionMargin).Format(time.RFC3339); got != want {
		t.Fatalf("the poll after a failed fetch started at %q, want %q", got, want)
	}
}

// A transaction still open at the window's edge is no longer read again: the daily read starts at the edge and drops it.
func TestMonitorStopsReadingATransactionOpenPastTheWindow(t *testing.T) {
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	mercury := newTransactionsMercury(t)
	mercury.set(mercuryTransactionRowAt("txn_held", now.Add(-44*24*time.Hour), "pending", time.Time{}))
	reads := newMercuryTransactionReads()
	if got := pollTransactions(t, reads, mercury, now.Add(-mercuryMonitorReplayWindow), now); len(got) != 0 {
		t.Fatalf("first poll recorded %v", got)
	}
	if _, open := reads.open["txn_held"]; !open {
		t.Fatal("the first poll did not remember the open row")
	}
	later := now.Add(2 * 24 * time.Hour)
	pollTransactions(t, reads, mercury, later.Add(-5*time.Minute), later)
	if got, want := mercury.lastStart(), later.Add(-mercuryMonitorOpenTransactionWindow).Format(time.RFC3339); got != want {
		t.Fatalf("daily read start = %q, want the window's edge %q", got, want)
	}
	if len(reads.open) != 0 {
		t.Fatalf("open after the window = %v", reads.open)
	}
	pollTransactions(t, reads, mercury, later, later.Add(2*time.Hour))
	if got, want := mercury.lastStart(), later.Format(time.RFC3339); got != want {
		t.Fatalf("with nothing open the read starts at %q, want the cursor %q", got, want)
	}
}
