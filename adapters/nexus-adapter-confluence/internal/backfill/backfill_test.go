package backfill

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"

	"github.com/nexus-project/adapter-confluence/internal/atlassian"
	"github.com/nexus-project/adapter-confluence/internal/config"
	"github.com/nexus-project/adapter-confluence/internal/record"
	"github.com/nexus-project/adapter-confluence/internal/storage"
)

func TestBuildCQL(t *testing.T) {
	t.Parallel()

	since := time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC)
	if got := BuildCQL("ENG", since); got != `space="ENG" AND type="page" AND lastModified >= "2026-01-15"` {
		t.Fatalf("BuildCQL() = %q", got)
	}
	if got := BuildCQL("ENG", time.Time{}); got != `space="ENG" AND type="page"` {
		t.Fatalf("BuildCQL(zero) = %q", got)
	}
}

func TestBackfillHandler(t *testing.T) {
	tempDir := t.TempDir()
	account := config.AccountConfig{
		ID:              "vrtly-confluence",
		Site:            "vrtly-cloud",
		SiteDisplayName: "Vrtly Cloud",
		Spaces:          []config.SpaceOption{{ID: "1", Key: "ENG", Name: "Engineering"}},
		Sync:            config.DefaultSyncConfig(),
	}
	client := &fakeBackfillClient{
		pages: []atlassian.Page{
			{
				ID:      "123",
				Title:   "Doc",
				SpaceID: "1",
				Version: atlassian.PageVersion{Number: 1, AuthorID: "u1", CreatedAt: time.Now().UTC()},
				Body:    atlassian.PageBody{Storage: atlassian.StorageBody{Value: "<p>Hello</p>", Representation: "storage"}},
				Labels:  []atlassian.Label{{Name: "architecture"}},
			},
		},
		users: map[string]*atlassian.User{"u1": {AccountID: "u1", DisplayName: "Alice"}},
	}
	var events []nexadapter.AdapterInboundRecord

	err := New(client, account, storage.NewPageStore(tempDir), record.NewUserCache()).Handler()(context.Background(), account.ID, time.Time{}, func(event any) {
		typed, ok := event.(nexadapter.AdapterInboundRecord)
		if !ok {
			t.Fatalf("emit type = %T, want nexadapter.AdapterInboundRecord", event)
		}
		events = append(events, typed)
	})
	if err != nil {
		t.Fatalf("Handler() error = %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("len(events) = %d", len(events))
	}
	if _, err := os.Stat(filepath.Join(tempDir, "confluence", "pages", "123", "v1", "body.html")); err != nil {
		t.Fatalf("body file missing: %v", err)
	}
}

type fakeBackfillClient struct {
	pages []atlassian.Page
	users map[string]*atlassian.User
}

func (f *fakeBackfillClient) SearchCQL(_ context.Context, _ string, _ string, start, limit int) ([]atlassian.Page, int, int, int, error) {
	if start >= len(f.pages) {
		return nil, start, limit, len(f.pages), nil
	}
	end := start + limit
	if end > len(f.pages) {
		end = len(f.pages)
	}
	return f.pages[start:end], start, limit, len(f.pages), nil
}

func (f *fakeBackfillClient) GetPageVersions(_ context.Context, _ string) ([]atlassian.PageVersion, error) {
	return nil, nil
}

func (f *fakeBackfillClient) GetUser(_ context.Context, userID string) (*atlassian.User, error) {
	return f.users[userID], nil
}
