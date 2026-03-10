package delivery

import (
	"context"
	"errors"
	"strings"
	"testing"

	nexadapter "github.com/nexus-project/adapter-sdk-go"

	"github.com/nexus-project/adapter-confluence/internal/atlassian"
	"github.com/nexus-project/adapter-confluence/internal/config"
)

func TestParseTarget(t *testing.T) {
	t.Parallel()

	target, err := ParseTarget("space:ENG/parent:456789")
	if err != nil {
		t.Fatalf("ParseTarget() error = %v", err)
	}
	if target.Action != "create_page" || target.SpaceKey != "ENG" || target.ParentPageID != "456789" {
		t.Fatalf("target = %#v", target)
	}
	if _, err := ParseTarget("channel:ENG"); err == nil {
		t.Fatalf("expected error for invalid target")
	}
}

func TestMarkdownHelpers(t *testing.T) {
	t.Parallel()

	title, body := ExtractTitle("# My New Page\n\nBody content here")
	if title != "My New Page" || body != "Body content here" {
		t.Fatalf("ExtractTitle() = %q / %q", title, body)
	}
	html := MarkdownToStorageFormat("## Sub Heading\n\n**bold**\n\n- item\n\n[link](https://example.com)")
	if html == "" || !contains(html, "<h2>Sub Heading</h2>", "<strong>bold</strong>", "<ul><li>item</li></ul>", `<a href="https://example.com">link</a>`) {
		t.Fatalf("MarkdownToStorageFormat() = %q", html)
	}
}

func TestDeliveryActions(t *testing.T) {
	account := config.AccountConfig{
		ID:     "vrtly-confluence",
		Site:   "vrtly-cloud",
		Spaces: []config.SpaceOption{{ID: "1", Key: "ENG", Name: "Engineering"}},
	}
	client := &fakeDeliveryClient{
		page: &atlassian.Page{
			ID:    "123456",
			Title: "Existing",
			Version: atlassian.PageVersion{
				Number: 3,
			},
		},
	}
	handler := New(client, account).Handler()

	createResult, err := handler(context.Background(), sendRequest("space:ENG", "# New Page\n\nContent"))
	if err != nil || !createResult.Success {
		t.Fatalf("create = %#v, err=%v", createResult, err)
	}

	updateResult, err := handler(context.Background(), sendRequest("page:123456", "# Updated Page\n\nBody"))
	if err != nil || !updateResult.Success {
		t.Fatalf("update = %#v, err=%v", updateResult, err)
	}

	commentResult, err := handler(context.Background(), sendRequest("page:123456/comment", "Comment"))
	if err != nil || !commentResult.Success {
		t.Fatalf("comment = %#v, err=%v", commentResult, err)
	}
}

func TestDeliveryUsesCanonicalTarget(t *testing.T) {
	account := config.AccountConfig{
		ID:     "vrtly-confluence",
		Site:   "vrtly-cloud",
		Spaces: []config.SpaceOption{{ID: "1", Key: "ENG", Name: "Engineering"}},
	}
	client := &fakeDeliveryClient{}

	result, err := New(client, account).Handler()(context.Background(), nexadapter.SendRequest{
		Account: "vrtly-confluence",
		Target: nexadapter.DeliveryTarget{
			ConnectionID: "vrtly-confluence",
			Channel: nexadapter.ChannelRef{
				Platform:    "confluence",
				ContainerID: "space:ENG",
			},
		},
		Text: "# New Page\n\nContent",
	})
	if err != nil || !result.Success {
		t.Fatalf("result = %#v err=%v", result, err)
	}
}

func TestUpdateRetriesConflict(t *testing.T) {
	account := config.AccountConfig{ID: "vrtly-confluence", Site: "vrtly-cloud"}
	client := &fakeDeliveryClient{
		page: &atlassian.Page{ID: "123456", Title: "Existing", Version: atlassian.PageVersion{Number: 3}},
		updateErrors: []error{
			&atlassian.StatusError{StatusCode: 409, Status: "409 Conflict"},
			nil,
		},
	}
	handler := New(client, account).Handler()
	result, err := handler(context.Background(), sendRequest("page:123456", "# Updated\n\nBody"))
	if err != nil || !result.Success {
		t.Fatalf("result = %#v err=%v", result, err)
	}
}

func TestUpdateTitleOnlyPreservesBody(t *testing.T) {
	account := config.AccountConfig{ID: "vrtly-confluence", Site: "vrtly-cloud"}
	client := &fakeDeliveryClient{
		page: &atlassian.Page{
			ID:    "123456",
			Title: "Existing",
			Body:  atlassian.PageBody{Storage: atlassian.StorageBody{Value: "<p>Keep me</p>", Representation: "storage"}},
			Version: atlassian.PageVersion{
				Number: 3,
			},
		},
	}

	result, err := New(client, account).Handler()(context.Background(), sendRequest("page:123456", "# Updated Title"))
	if err != nil || !result.Success {
		t.Fatalf("result = %#v err=%v", result, err)
	}
	if client.lastUpdate.BodyHTML != "<p>Keep me</p>" {
		t.Fatalf("BodyHTML = %q, want existing body preserved", client.lastUpdate.BodyHTML)
	}
	if client.lastUpdate.Title != "Updated Title" {
		t.Fatalf("Title = %q", client.lastUpdate.Title)
	}
}

func TestRejectsMediaUploads(t *testing.T) {
	account := config.AccountConfig{ID: "vrtly-confluence", Site: "vrtly-cloud"}
	client := &fakeDeliveryClient{}

	result, err := New(client, account).Handler()(context.Background(), nexadapter.SendRequest{
		Account: "vrtly-confluence",
		To:      "page:123456",
		Text:    "# Updated\n\nBody",
		Media:   "/tmp/file.png",
	})
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if result.Success {
		t.Fatalf("expected media upload to be rejected: %#v", result)
	}
	if result.Error == nil || result.Error.Type != "content_rejected" {
		t.Fatalf("unexpected error: %#v", result.Error)
	}
}

func TestMapDeliveryError(t *testing.T) {
	t.Parallel()
	err := mapDeliveryError(&atlassian.StatusError{StatusCode: 404, Status: "404 Not Found"})
	if err.Type != "not_found" || err.Retry {
		t.Fatalf("err = %#v", err)
	}
}

func TestDeletePage(t *testing.T) {
	account := config.AccountConfig{ID: "vrtly-confluence", Site: "vrtly-cloud"}
	client := &fakeDeliveryClient{}

	result, err := New(client, account).DeleteHandler()(context.Background(), nexadapter.DeleteRequest{
		Account:   "vrtly-confluence",
		MessageID: "confluence:vrtly-cloud:page/123456:v1",
		Target: nexadapter.DeliveryTarget{
			ConnectionID: "vrtly-confluence",
			Channel: nexadapter.ChannelRef{
				Platform:    "confluence",
				ContainerID: "page:123456",
			},
		},
	})
	if err != nil || !result.Success {
		t.Fatalf("result = %#v err=%v", result, err)
	}
	if client.deletedPageID != "123456" {
		t.Fatalf("deletedPageID = %q", client.deletedPageID)
	}
}

func TestDeleteComment(t *testing.T) {
	account := config.AccountConfig{ID: "vrtly-confluence", Site: "vrtly-cloud"}
	client := &fakeDeliveryClient{}

	result, err := New(client, account).DeleteHandler()(context.Background(), nexadapter.DeleteRequest{
		Account:   "vrtly-confluence",
		MessageID: "confluence:vrtly-cloud:page/123456/comment/c1",
		Target: nexadapter.DeliveryTarget{
			ConnectionID: "vrtly-confluence",
			Channel: nexadapter.ChannelRef{
				Platform:    "confluence",
				ContainerID: "page:123456/comment",
			},
		},
	})
	if err != nil || !result.Success {
		t.Fatalf("result = %#v err=%v", result, err)
	}
	if client.deletedCommentID != "c1" {
		t.Fatalf("deletedCommentID = %q", client.deletedCommentID)
	}
}

type fakeDeliveryClient struct {
	page             *atlassian.Page
	comment          *atlassian.Comment
	updateErrors     []error
	updateCalls      int
	lastUpdate       atlassian.UpdatePageRequest
	deletedPageID    string
	deletedCommentID string
}

func (f *fakeDeliveryClient) CreatePage(_ context.Context, req atlassian.CreatePageRequest) (*atlassian.Page, error) {
	return &atlassian.Page{ID: "789", Title: req.Title, Version: atlassian.PageVersion{Number: 1}}, nil
}

func (f *fakeDeliveryClient) GetPage(_ context.Context, _ string) (*atlassian.Page, error) {
	if f.page == nil {
		return nil, errors.New("missing page")
	}
	copy := *f.page
	copy.Version.Number += f.updateCalls
	return &copy, nil
}

func (f *fakeDeliveryClient) UpdatePage(_ context.Context, pageID string, req atlassian.UpdatePageRequest) (*atlassian.Page, error) {
	f.lastUpdate = req
	if f.updateCalls < len(f.updateErrors) && f.updateErrors[f.updateCalls] != nil {
		err := f.updateErrors[f.updateCalls]
		f.updateCalls++
		return nil, err
	}
	f.updateCalls++
	return &atlassian.Page{ID: pageID, Title: req.Title, Version: atlassian.PageVersion{Number: req.VersionNumber}}, nil
}

func (f *fakeDeliveryClient) CreateFooterComment(_ context.Context, pageID string, _ string) (*atlassian.Comment, error) {
	return &atlassian.Comment{ID: "c1", PageID: pageID}, nil
}

func (f *fakeDeliveryClient) DeletePage(_ context.Context, pageID string) error {
	f.deletedPageID = pageID
	return nil
}

func (f *fakeDeliveryClient) DeleteFooterComment(_ context.Context, commentID string) error {
	f.deletedCommentID = commentID
	return nil
}

func sendRequest(to, text string) nexadapter.SendRequest {
	return nexadapter.SendRequest{
		Account: "vrtly-confluence",
		To:      to,
		Text:    text,
	}
}

func contains(value string, parts ...string) bool {
	for _, part := range parts {
		if !strings.Contains(value, part) {
			return false
		}
	}
	return true
}
