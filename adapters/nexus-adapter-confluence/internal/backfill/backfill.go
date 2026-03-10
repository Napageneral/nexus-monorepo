package backfill

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
	SearchCQL(ctx context.Context, cql, expand string, start, limit int) ([]atlassian.Page, int, int, int, error)
	GetPageVersions(ctx context.Context, pageID string) ([]atlassian.PageVersion, error)
	GetUser(ctx context.Context, userID string) (*atlassian.User, error)
}

type Backfill struct {
	client    apiClient
	account   config.AccountConfig
	pageStore *storage.PageStore
	users     *record.UserCache
}

func New(client apiClient, account config.AccountConfig, pageStore *storage.PageStore, users *record.UserCache) *Backfill {
	return &Backfill{client: client, account: account, pageStore: pageStore, users: users}
}

func (b *Backfill) Handler() func(ctx context.Context, account string, since time.Time, emit nexadapter.EmitFunc) error {
	return func(ctx context.Context, account string, since time.Time, emit nexadapter.EmitFunc) error {
		started := time.Now()
		total := 0

		for _, space := range b.account.Spaces {
			spaceCount := 0
			for offset := 0; ; {
				cql := BuildCQL(space.Key, since)
				pages, start, limit, totalSize, err := b.client.SearchCQL(ctx, cql, "version,ancestors,metadata.labels,body.storage", offset, 250)
				if err != nil {
					return err
				}

				for _, page := range pages {
					bodyPath, err := b.pageStore.WritePage(page.ID, page.Version.Number, page.Body.Storage.Value)
					if err != nil {
						return err
					}
					senderName := b.users.Resolve(ctx, b.client, page.Version.AuthorID)
					event := record.BuildPageRecord(page, atlassian.Space{ID: space.ID, Key: space.Key, Name: space.Name}, b.account.ID, b.account.Site, siteDisplayName(b.account), bodyPath, senderName)
					emit(event)
					spaceCount++
					total++

					if b.account.Sync.Versions {
						versions, err := b.client.GetPageVersions(ctx, page.ID)
						if err != nil {
							return err
						}
						for _, version := range versions {
							if version.Number == page.Version.Number {
								continue
							}
							versionPage := page
							versionPage.Version = version
							if version.Page != nil {
								versionPage = *version.Page
								versionPage.Version = version
							}
							versionPath, err := b.pageStore.WritePage(versionPage.ID, versionPage.Version.Number, versionPage.Body.Storage.Value)
							if err != nil {
								return err
							}
							emit(record.BuildPageRecord(versionPage, atlassian.Space{ID: space.ID, Key: space.Key, Name: space.Name}, b.account.ID, b.account.Site, siteDisplayName(b.account), versionPath, b.users.Resolve(ctx, b.client, versionPage.Version.AuthorID)))
							spaceCount++
							total++
						}
					}
				}

				nexadapter.LogInfo("Space %s: emitted %d pages", space.Key, spaceCount)

				if start+limit >= totalSize || len(pages) == 0 {
					break
				}
				offset = start + limit
			}
		}

		nexadapter.LogInfo("Backfill complete: emitted %d pages in %s", total, time.Since(started))
		return nil
	}
}

func BuildCQL(spaceKey string, since time.Time) string {
	query := fmt.Sprintf(`space="%s" AND type="page"`, spaceKey)
	if !since.IsZero() {
		query += fmt.Sprintf(` AND lastModified >= "%s"`, since.UTC().Format("2006-01-02"))
	}
	return query
}

func siteDisplayName(account config.AccountConfig) string {
	if account.SiteDisplayName != "" {
		return account.SiteDisplayName
	}
	return account.Site
}
