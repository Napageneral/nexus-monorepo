package record

import (
	"fmt"
	"strings"

	nexadapter "github.com/nexus-project/adapter-sdk-go"

	"github.com/nexus-project/adapter-confluence/internal/atlassian"
)

func BuildPageRecord(page atlassian.Page, space atlassian.Space, connectionID, siteID, siteName, bodyPath, senderName string) nexadapter.AdapterInboundRecord {
	parentPageID := any(nil)
	if parent := page.EffectiveParentID(); strings.TrimSpace(parent) != "" {
		parentPageID = "page/" + parent
	}

	content := strings.TrimSpace(page.Title)
	if excerpt := ExtractExcerpt(page.Body.Storage.Value, 500); excerpt != "" {
		content += "\n\n" + excerpt
	}

	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Platform:      "confluence",
			ConnectionID:  connectionID,
			SenderID:      strings.TrimSpace(page.Version.AuthorID),
			SenderName:    strings.TrimSpace(senderName),
			SpaceID:       strings.TrimSpace(siteID),
			SpaceName:     strings.TrimSpace(siteName),
			ContainerKind: "group",
			ContainerID:   strings.TrimSpace(space.Key),
			ContainerName: strings.TrimSpace(space.Name),
			ThreadID:      "page/" + strings.TrimSpace(page.ID),
			ThreadName:    strings.TrimSpace(page.Title),
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("confluence:%s:page/%s:v%d", siteID, page.ID, page.Version.Number),
			Timestamp:        page.Version.CreatedAt.UnixMilli(),
			Content:          content,
			ContentType:      "text",
			Attachments: []nexadapter.Attachment{
				{
					ID:        fmt.Sprintf("page-%s-v%d:body", page.ID, page.Version.Number),
					Filename:  Slugify(page.Title) + ".html",
					MIMEType:  "text/html",
					LocalPath: bodyPath,
				},
			},
			Metadata: map[string]any{
				"version":        page.Version.Number,
				"parent_page_id": parentPageID,
				"labels":         labelNames(page.Labels),
			},
		},
	}
}

func labelNames(labels []atlassian.Label) []string {
	values := make([]string, 0, len(labels))
	for _, label := range labels {
		if trimmed := strings.TrimSpace(label.Name); trimmed != "" {
			values = append(values, trimmed)
		}
	}
	return values
}
