package delivery

import (
	"context"
	"errors"
	"fmt"
	"strings"

	nexadapter "github.com/nexus-project/adapter-sdk-go"

	"github.com/nexus-project/adapter-confluence/internal/atlassian"
	"github.com/nexus-project/adapter-confluence/internal/config"
)

type apiClient interface {
	CreatePage(ctx context.Context, req atlassian.CreatePageRequest) (*atlassian.Page, error)
	GetPage(ctx context.Context, pageID string) (*atlassian.Page, error)
	UpdatePage(ctx context.Context, pageID string, req atlassian.UpdatePageRequest) (*atlassian.Page, error)
	CreateFooterComment(ctx context.Context, pageID string, bodyHTML string) (*atlassian.Comment, error)
	DeletePage(ctx context.Context, pageID string) error
	DeleteFooterComment(ctx context.Context, commentID string) error
}

type Delivery struct {
	client  apiClient
	account config.AccountConfig
}

func New(client apiClient, account config.AccountConfig) *Delivery {
	return &Delivery{client: client, account: account}
}

func (d *Delivery) Handler() func(ctx context.Context, req nexadapter.SendRequest) (*nexadapter.DeliveryResult, error) {
	return d.send
}

func (d *Delivery) DeleteHandler() func(ctx context.Context, req nexadapter.DeleteRequest) (*nexadapter.DeliveryResult, error) {
	return d.delete
}

func (d *Delivery) send(ctx context.Context, req nexadapter.SendRequest) (*nexadapter.DeliveryResult, error) {
	if strings.TrimSpace(req.Media) != "" {
		return unsupportedMediaResult(), nil
	}

	target, err := parseSendTarget(req)
	if err != nil {
		return nil, err
	}

	switch target.Action {
	case "create_page":
		return d.createPage(ctx, target, req.Text)
	case "update_page":
		return d.updatePage(ctx, target, req.Text)
	case "add_comment":
		return d.addComment(ctx, target, req.Text)
	default:
		return nil, fmt.Errorf("unsupported delivery action %q", target.Action)
	}
}

func (d *Delivery) delete(ctx context.Context, req nexadapter.DeleteRequest) (*nexadapter.DeliveryResult, error) {
	resource, err := parseMessageID(req.MessageID)
	if err != nil {
		return nil, err
	}

	switch resource.Kind {
	case "page":
		if err := d.client.DeletePage(ctx, resource.PageID); err != nil {
			return deliveryFailure(err), nil
		}
	case "comment":
		if err := d.client.DeleteFooterComment(ctx, resource.CommentID); err != nil {
			return deliveryFailure(err), nil
		}
	default:
		return nil, fmt.Errorf("unsupported delete resource %q", resource.Kind)
	}

	return &nexadapter.DeliveryResult{
		Success:    true,
		MessageIDs: []string{req.MessageID},
		ChunksSent: 1,
	}, nil
}

func (d *Delivery) createPage(ctx context.Context, target Target, text string) (*nexadapter.DeliveryResult, error) {
	title, body := ExtractTitle(text)
	if strings.TrimSpace(title) == "" {
		return nil, fmt.Errorf("page title is required; start the text with a '# Title' heading")
	}

	space := d.account.SpaceByKey(target.SpaceKey)
	if space == nil {
		return nil, fmt.Errorf("unknown configured space %q", target.SpaceKey)
	}

	page, err := d.client.CreatePage(ctx, atlassian.CreatePageRequest{
		SpaceID:  space.ID,
		Title:    title,
		ParentID: target.ParentPageID,
		BodyHTML: MarkdownToStorageFormat(body),
	})
	if err != nil {
		return deliveryFailure(err), nil
	}

	return &nexadapter.DeliveryResult{
		Success:    true,
		MessageIDs: []string{fmt.Sprintf("confluence:%s:page/%s:v%d", d.account.Site, page.ID, page.Version.Number)},
		ChunksSent: 1,
		TotalChars: len(text),
	}, nil
}

func (d *Delivery) updatePage(ctx context.Context, target Target, text string) (*nexadapter.DeliveryResult, error) {
	current, err := d.client.GetPage(ctx, target.PageID)
	if err != nil {
		return deliveryFailure(err), nil
	}

	title, body := ExtractTitle(text)
	if strings.TrimSpace(title) == "" {
		title = current.Title
	}
	bodyHTML := current.Body.Storage.Value
	switch {
	case strings.TrimSpace(title) != current.Title && strings.TrimSpace(body) == "":
		// Title-only updates should preserve the existing body.
	case strings.TrimSpace(body) != "":
		bodyHTML = MarkdownToStorageFormat(body)
	case strings.TrimSpace(text) != "":
		bodyHTML = MarkdownToStorageFormat(text)
	}
	request := atlassian.UpdatePageRequest{
		Title:          title,
		VersionNumber:  current.Version.Number + 1,
		VersionMessage: "Updated by nex agent",
		BodyHTML:       bodyHTML,
	}

	page, err := d.client.UpdatePage(ctx, target.PageID, request)
	if statusConflict(err) {
		refreshed, refreshErr := d.client.GetPage(ctx, target.PageID)
		if refreshErr != nil {
			return deliveryFailure(refreshErr), nil
		}
		request.VersionNumber = refreshed.Version.Number + 1
		page, err = d.client.UpdatePage(ctx, target.PageID, request)
	}
	if err != nil {
		return deliveryFailure(err), nil
	}

	return &nexadapter.DeliveryResult{
		Success:    true,
		MessageIDs: []string{fmt.Sprintf("confluence:%s:page/%s:v%d", d.account.Site, page.ID, page.Version.Number)},
		ChunksSent: 1,
		TotalChars: len(text),
	}, nil
}

func (d *Delivery) addComment(ctx context.Context, target Target, text string) (*nexadapter.DeliveryResult, error) {
	comment, err := d.client.CreateFooterComment(ctx, target.PageID, MarkdownToStorageFormat(text))
	if err != nil {
		return deliveryFailure(err), nil
	}
	return &nexadapter.DeliveryResult{
		Success:    true,
		MessageIDs: []string{fmt.Sprintf("confluence:%s:page/%s/comment/%s", d.account.Site, target.PageID, comment.ID)},
		ChunksSent: 1,
		TotalChars: len(text),
	}, nil
}

func deliveryFailure(err error) *nexadapter.DeliveryResult {
	return &nexadapter.DeliveryResult{
		Success: false,
		Error:   mapDeliveryError(err),
	}
}

func unsupportedMediaResult() *nexadapter.DeliveryResult {
	return &nexadapter.DeliveryResult{
		Success: false,
		Error: &nexadapter.DeliveryError{
			Type:    "content_rejected",
			Message: "media upload is not supported by the Confluence adapter",
			Retry:   false,
		},
	}
}

func mapDeliveryError(err error) *nexadapter.DeliveryError {
	var statusErr *atlassian.StatusError
	if errors.As(err, &statusErr) {
		switch statusErr.StatusCode {
		case 401, 403:
			return &nexadapter.DeliveryError{Type: "permission_denied", Message: err.Error(), Retry: false}
		case 404:
			return &nexadapter.DeliveryError{Type: "not_found", Message: err.Error(), Retry: false}
		case 409:
			return &nexadapter.DeliveryError{Type: "content_rejected", Message: err.Error(), Retry: true}
		case 429:
			return &nexadapter.DeliveryError{Type: "rate_limited", Message: err.Error(), Retry: true, RetryAfterMs: int(statusErr.RetryAfter / 1e6)}
		default:
			if statusErr.StatusCode >= 500 {
				return &nexadapter.DeliveryError{Type: "network", Message: err.Error(), Retry: true}
			}
		}
	}
	return &nexadapter.DeliveryError{Type: "unknown", Message: err.Error(), Retry: false}
}

func statusConflict(err error) bool {
	var statusErr *atlassian.StatusError
	return errors.As(err, &statusErr) && statusErr.StatusCode == 409
}

func parseSendTarget(req nexadapter.SendRequest) (Target, error) {
	if target, err := ParseTarget(strings.TrimSpace(req.Target.Channel.ContainerID)); err == nil {
		return target, nil
	}
	return ParseTarget(req.To)
}

type messageResource struct {
	Kind      string
	PageID    string
	CommentID string
}

func parseMessageID(raw string) (messageResource, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return messageResource{}, fmt.Errorf("message_id is required")
	}

	parts := strings.Split(trimmed, ":")
	if len(parts) < 3 || parts[0] != "confluence" {
		return messageResource{}, fmt.Errorf("unsupported confluence message_id %q", raw)
	}

	pathPart := strings.Join(parts[2:], ":")
	switch {
	case strings.HasPrefix(pathPart, "page/") && strings.Contains(pathPart, "/comment/"):
		tokens := strings.Split(pathPart, "/")
		if len(tokens) != 4 || tokens[0] != "page" || tokens[2] != "comment" || strings.TrimSpace(tokens[1]) == "" || strings.TrimSpace(tokens[3]) == "" {
			return messageResource{}, fmt.Errorf("invalid confluence comment message_id %q", raw)
		}
		return messageResource{Kind: "comment", PageID: tokens[1], CommentID: tokens[3]}, nil
	case strings.HasPrefix(pathPart, "page/"):
		pagePart := strings.TrimPrefix(pathPart, "page/")
		pageID := pagePart
		if idx := strings.Index(pagePart, ":"); idx >= 0 {
			pageID = pagePart[:idx]
		}
		pageID = strings.TrimSpace(pageID)
		if pageID == "" {
			return messageResource{}, fmt.Errorf("invalid confluence page message_id %q", raw)
		}
		return messageResource{Kind: "page", PageID: pageID}, nil
	default:
		return messageResource{}, fmt.Errorf("unsupported confluence message_id %q", raw)
	}
}
