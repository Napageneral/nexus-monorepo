package monitor

import (
	"context"
	"fmt"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"

	"github.com/nexus-project/adapter-confluence/internal/atlassian"
	"github.com/nexus-project/adapter-confluence/internal/config"
	"github.com/nexus-project/adapter-confluence/internal/record"
	"github.com/nexus-project/adapter-confluence/internal/storage"
)

type apiClient interface {
	ListSpacePages(ctx context.Context, spaceID, sortBy string, limit int, cursor string) ([]atlassian.Page, string, error)
	GetPage(ctx context.Context, pageID string) (*atlassian.Page, error)
	GetPageLabels(ctx context.Context, pageID string) ([]atlassian.Label, error)
	GetUser(ctx context.Context, userID string) (*atlassian.User, error)
}

type Monitor struct {
	client    apiClient
	account   config.AccountConfig
	pageStore *storage.PageStore
	watermark *WatermarkStore
	users     *record.UserCache
}

func New(client apiClient, account config.AccountConfig, pageStore *storage.PageStore, watermark *WatermarkStore, users *record.UserCache) *Monitor {
	return &Monitor{
		client:    client,
		account:   account,
		pageStore: pageStore,
		watermark: watermark,
		users:     users,
	}
}

func (m *Monitor) Handler() func(ctx context.Context, account string, emit nexadapter.EmitFunc) error {
	return func(ctx context.Context, account string, emit nexadapter.EmitFunc) error {
		interval := m.account.PollInterval()
		cursor := time.Now()
		consecutiveErrors := 0

		for {
			select {
			case <-ctx.Done():
				nexadapter.LogInfo("monitor shutting down (context cancelled)")
				return nil
			default:
			}

			records, newCursor, err := m.fetch(ctx, cursor)
			if err != nil {
				consecutiveErrors++
				nexadapter.LogError("poll fetch error (%d consecutive): %v", consecutiveErrors, err)
				if consecutiveErrors >= 10 {
					return fmt.Errorf("too many consecutive errors (%d): %w", consecutiveErrors, err)
				}

				select {
				case <-ctx.Done():
					nexadapter.LogInfo("monitor shutting down (context cancelled)")
					return nil
				case <-time.After(interval):
					continue
				}
			}

			consecutiveErrors = 0
			for _, record := range records {
				emit(record)
			}
			if !newCursor.IsZero() {
				cursor = newCursor
			}

			select {
			case <-ctx.Done():
				nexadapter.LogInfo("monitor shutting down (context cancelled)")
				return nil
			case <-time.After(interval):
			}
		}
	}
}

func (m *Monitor) fetch(ctx context.Context, since time.Time) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
	var records []nexadapter.AdapterInboundRecord
	if err := m.watermark.Load(); err != nil {
		return nil, time.Time{}, err
	}

	for _, space := range m.account.Spaces {
		spaceWatermark := m.watermark.Get(space.Key)
		if spaceWatermark.IsZero() {
			spaceWatermark = since
		}

		nextCursor := ""
		var latestForSpace time.Time
		stopPaging := false

		for !stopPaging {
			pages, next, err := m.client.ListSpacePages(ctx, space.ID, "-modified-date", 250, nextCursor)
			if err != nil {
				return nil, time.Time{}, err
			}

			for _, page := range pages {
				if !page.Version.CreatedAt.After(spaceWatermark) {
					stopPaging = true
					break
				}

				if page.Body.Storage.Value == "" {
					fullPage, err := m.client.GetPage(ctx, page.ID)
					if err != nil {
						return nil, time.Time{}, err
					}
					page = *fullPage
				}

				if m.account.Sync.Labels || (!m.account.Sync.Labels && m.account.Sync == (config.SyncConfig{})) {
					labels, err := m.client.GetPageLabels(ctx, page.ID)
					if err != nil {
						return nil, time.Time{}, err
					}
					page.Labels = labels
				}

				bodyPath, err := m.pageStore.WritePage(page.ID, page.Version.Number, page.Body.Storage.Value)
				if err != nil {
					return nil, time.Time{}, err
				}

				senderName := m.users.Resolve(ctx, m.client, page.Version.AuthorID)
				row := record.BuildPageRecord(page, atlassian.Space{ID: space.ID, Key: space.Key, Name: space.Name}, m.account.ID, m.account.Site, siteDisplayName(m.account), bodyPath, senderName)
				records = append(records, row)

				if page.Version.CreatedAt.After(latestForSpace) {
					latestForSpace = page.Version.CreatedAt
				}
			}

			if next == "" || stopPaging {
				break
			}
			nextCursor = next
		}

		if !latestForSpace.IsZero() {
			m.watermark.Advance(space.Key, latestForSpace)
			if err := m.watermark.Save(); err != nil {
				return nil, time.Time{}, err
			}
		}
	}

	return records, m.watermark.LatestAcrossSpaces(), nil
}

func siteDisplayName(account config.AccountConfig) string {
	if account.SiteDisplayName != "" {
		return account.SiteDisplayName
	}
	return account.Site
}
