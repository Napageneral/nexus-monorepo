package monitor

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/nexus-project/adapter-confluence/internal/atlassian"
	"github.com/nexus-project/adapter-confluence/internal/config"
	"github.com/nexus-project/adapter-confluence/internal/record"
	"github.com/nexus-project/adapter-confluence/internal/storage"
)

func TestWatermarkStoreLifecycle(t *testing.T) {
	t.Parallel()

	store := NewWatermarkStore(t.TempDir())
	now := time.Now().UTC()
	store.Advance("ENG", now)
	store.Advance("PROD", now.Add(time.Hour))
	if err := store.Save(); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	loaded := NewWatermarkStore(filepath.Dir(filepath.Dir(store.filePath)))
	if err := loaded.Load(); err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if !loaded.Get("ENG").Equal(now) {
		t.Fatalf("ENG watermark mismatch")
	}
	if !loaded.LatestAcrossSpaces().Equal(now.Add(time.Hour)) {
		t.Fatalf("LatestAcrossSpaces mismatch")
	}
}

func TestMonitorFetchEmitsAndPersists(t *testing.T) {
	tempDir := t.TempDir()
	pageStore := storage.NewPageStore(tempDir)
	watermarks := NewWatermarkStore(tempDir)
	account := config.AccountConfig{
		ID:              "vrtly-confluence",
		Site:            "vrtly-cloud",
		SiteDisplayName: "Vrtly Cloud",
		Spaces: []config.SpaceOption{
			{ID: "1", Key: "ENG", Name: "Engineering"},
		},
		Sync: config.DefaultSyncConfig(),
	}
	createdAt := time.Now().UTC().Add(-time.Minute)
	client := &fakeMonitorClient{
		pagesBySpace: map[string][]atlassian.Page{
			"1": {
				{
					ID:      "123",
					Title:   "Doc",
					SpaceID: "1",
					Version: atlassian.PageVersion{Number: 2, AuthorID: "u1", CreatedAt: createdAt},
					Body:    atlassian.PageBody{Storage: atlassian.StorageBody{Value: "<p>Hello</p>", Representation: "storage"}},
				},
			},
		},
		labels: map[string][]atlassian.Label{"123": {{Name: "architecture"}}},
		users:  map[string]*atlassian.User{"u1": {AccountID: "u1", DisplayName: "Alice"}},
	}
	monitor := New(client, account, pageStore, watermarks, record.NewUserCache())

	events, cursor, err := monitor.fetch(context.Background(), time.Now().UTC().Add(-2*time.Minute))
	if err != nil {
		t.Fatalf("fetch() error = %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("len(events) = %d", len(events))
	}
	if cursor.IsZero() || !cursor.Equal(createdAt) {
		t.Fatalf("cursor = %v", cursor)
	}
	if watermarks.Get("ENG").IsZero() {
		t.Fatalf("watermark not advanced")
	}
	bodyPath := filepath.Join(tempDir, "confluence", "pages", "123", "v2", "body.html")
	if _, err := os.Stat(bodyPath); err != nil {
		t.Fatalf("body file missing: %v", err)
	}
}

type fakeMonitorClient struct {
	pagesBySpace map[string][]atlassian.Page
	labels       map[string][]atlassian.Label
	users        map[string]*atlassian.User
}

func (f *fakeMonitorClient) ListSpacePages(_ context.Context, spaceID, _ string, _ int, _ string) ([]atlassian.Page, string, error) {
	return f.pagesBySpace[spaceID], "", nil
}

func (f *fakeMonitorClient) GetPage(_ context.Context, pageID string) (*atlassian.Page, error) {
	for _, pages := range f.pagesBySpace {
		for _, page := range pages {
			if page.ID == pageID {
				copy := page
				return &copy, nil
			}
		}
	}
	return nil, os.ErrNotExist
}

func (f *fakeMonitorClient) GetPageLabels(_ context.Context, pageID string) ([]atlassian.Label, error) {
	return f.labels[pageID], nil
}

func (f *fakeMonitorClient) GetUser(_ context.Context, userID string) (*atlassian.User, error) {
	return f.users[userID], nil
}
