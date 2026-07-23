package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func sourceStateFixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	t.Setenv(nexadapter.AdapterStateDirEnvVar, root)
	return root
}

func TestSourceCaptureCommitsPagesOnlyAfterExplicitReceipt(t *testing.T) {
	root := sourceStateFixture(t)
	spec := shopifySourceFamilies["orders.delta"]
	now := time.Date(2026, 7, 22, 12, 0, 0, 0, time.UTC)

	first, err := beginSourceCapture("moonsleep-production", spec, now)
	if err != nil {
		t.Fatalf("begin first capture: %v", err)
	}
	if first.PageCursor != "" || first.WindowThrough != now.Format(time.RFC3339Nano) {
		t.Fatalf("unexpected first capture: %#v", first)
	}
	if _, err := beginSourceCapture("moonsleep-production", spec, now.Add(time.Minute)); err == nil {
		t.Fatal("expected an overlapping capture to fail closed")
	}
	if err := finishSourceCapture("moonsleep-production", spec.Name, first.CaptureID, "page-2", false); err != nil {
		t.Fatalf("stage first capture: %v", err)
	}
	commit, err := commitSourceCapture("moonsleep-production", spec.Name, first.CaptureID)
	if err != nil {
		t.Fatalf("commit first capture: %v", err)
	}
	if commit.Complete || commit.PageCursor != "page-2" || commit.CursorISO != "" {
		t.Fatalf("unexpected partial commit: %#v", commit)
	}
	if _, err := commitSourceCapture("moonsleep-production", spec.Name, first.CaptureID); err == nil {
		t.Fatal("expected replayed commit to fail closed")
	}

	second, err := beginSourceCapture("moonsleep-production", spec, now.Add(2*time.Minute))
	if err != nil {
		t.Fatalf("begin second capture: %v", err)
	}
	if second.PageCursor != "page-2" || second.WindowThrough != first.WindowThrough || second.RequestSince != first.RequestSince {
		t.Fatalf("pagination window drifted: first=%#v second=%#v", first, second)
	}
	if err := finishSourceCapture("moonsleep-production", spec.Name, second.CaptureID, "", true); err != nil {
		t.Fatalf("stage second capture: %v", err)
	}
	commit, err = commitSourceCapture("moonsleep-production", spec.Name, second.CaptureID)
	if err != nil {
		t.Fatalf("commit second capture: %v", err)
	}
	if !commit.Complete || commit.CursorISO != first.WindowThrough || commit.PageCursor != "" || commit.WindowThrough != "" {
		t.Fatalf("unexpected terminal commit: %#v", commit)
	}

	raw, err := os.ReadFile(filepath.Join(root, "source-observation", "moonsleep-production", "state.json"))
	if err != nil {
		t.Fatalf("read state: %v", err)
	}
	var state shopifySourceState
	if err := json.Unmarshal(raw, &state); err != nil {
		t.Fatalf("parse state: %v", err)
	}
	row := state.Families[spec.Name]
	if row.Lease != nil || row.CursorISO != first.WindowThrough || row.PageCursor != "" {
		t.Fatalf("unexpected durable state: %#v", row)
	}
}

func TestSourceCaptureExpiredLeaseRepeatsWithoutAdvancingCursor(t *testing.T) {
	sourceStateFixture(t)
	spec := shopifySourceFamilies["customers.delta"]
	now := time.Date(2026, 7, 22, 12, 0, 0, 0, time.UTC)
	first, err := beginSourceCapture("moonsleep-production", spec, now)
	if err != nil {
		t.Fatalf("begin first capture: %v", err)
	}
	second, err := beginSourceCapture("moonsleep-production", spec, now.Add(shopifySourceLeaseTTL+time.Second))
	if err != nil {
		t.Fatalf("replace expired capture: %v", err)
	}
	if first.CaptureID == second.CaptureID {
		t.Fatal("expired capture id was reused")
	}
	if first.RequestSince != second.RequestSince {
		t.Fatalf("expired capture advanced source cursor: %s != %s", first.RequestSince, second.RequestSince)
	}
	if err := finishSourceCapture("moonsleep-production", spec.Name, first.CaptureID, "", true); err == nil {
		t.Fatal("stale capture unexpectedly replaced the current lease")
	}
}

func TestSourceMethodCatalogIsBoundedAndRemoteReadOnly(t *testing.T) {
	adapter := adapterConfig()
	capture, ok := adapter.Methods["shopify.source.capture"]
	if !ok {
		t.Fatal("missing shopify.source.capture")
	}
	if capture.MutatesRemote == nil || *capture.MutatesRemote {
		t.Fatal("source capture must be provider read-only")
	}
	if capture.ConnectionRequired == nil || !*capture.ConnectionRequired {
		t.Fatal("source capture must require a connection")
	}
	commit, ok := adapter.Methods["shopify.source.commit"]
	if !ok {
		t.Fatal("missing shopify.source.commit")
	}
	if commit.MutatesRemote == nil || *commit.MutatesRemote {
		t.Fatal("source commit must not mutate Shopify")
	}
}
