package atlassian

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestListSpacesPaginates(t *testing.T) {
	t.Parallel()

	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		call := calls.Add(1)

		expectedAuth := "Basic " + base64.StdEncoding.EncodeToString([]byte("user@example.com:secret"))
		if got := r.Header.Get("Authorization"); got != expectedAuth {
			t.Fatalf("Authorization = %q, want %q", got, expectedAuth)
		}

		switch call {
		case 1:
			_, _ = w.Write([]byte(`{"results":[{"id":"1","key":"ENG","name":"Engineering"}],"_links":{"next":"/wiki/api/v2/spaces?cursor=2"}}`))
		case 2:
			_, _ = w.Write([]byte(`{"results":[{"id":"2","key":"PROD","name":"Product"}],"_links":{}}`))
		default:
			t.Fatalf("unexpected call %d", call)
		}
	}))
	defer server.Close()

	client := NewClient(server.URL, "user@example.com", "secret")
	spaces, err := client.ListSpaces(context.Background(), 250)
	if err != nil {
		t.Fatalf("ListSpaces() error = %v", err)
	}

	if len(spaces) != 2 {
		t.Fatalf("len(spaces) = %d, want 2", len(spaces))
	}
	if spaces[0].Key != "ENG" || spaces[1].Key != "PROD" {
		t.Fatalf("spaces = %#v", spaces)
	}
}

func TestListSpacesRetriesRateLimit(t *testing.T) {
	t.Parallel()

	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		call := calls.Add(1)
		if call == 1 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte("rate limited"))
			return
		}
		_, _ = w.Write([]byte(`{"results":[{"id":"1","key":"ENG","name":"Engineering"}],"_links":{}}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "user@example.com", "secret")
	client.SetHTTPClient(&http.Client{Timeout: 5 * time.Second})

	spaces, err := client.ListSpaces(context.Background(), 10)
	if err != nil {
		t.Fatalf("ListSpaces() error = %v", err)
	}
	if len(spaces) != 1 {
		t.Fatalf("len(spaces) = %d, want 1", len(spaces))
	}
	if calls.Load() != 2 {
		t.Fatalf("calls = %d, want 2", calls.Load())
	}
}

func TestDeletePageUsesV2Endpoint(t *testing.T) {
	t.Parallel()

	var gotPath string
	var gotMethod string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotMethod = r.Method
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	client := NewClient(server.URL, "user@example.com", "secret")
	if err := client.DeletePage(context.Background(), "123456"); err != nil {
		t.Fatalf("DeletePage() error = %v", err)
	}
	if gotMethod != http.MethodDelete {
		t.Fatalf("method = %q", gotMethod)
	}
	if gotPath != "/wiki/api/v2/pages/123456" {
		t.Fatalf("path = %q", gotPath)
	}
}

func TestDeleteFooterCommentUsesV2Endpoint(t *testing.T) {
	t.Parallel()

	var gotPath string
	var gotMethod string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotMethod = r.Method
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	client := NewClient(server.URL, "user@example.com", "secret")
	if err := client.DeleteFooterComment(context.Background(), "c1"); err != nil {
		t.Fatalf("DeleteFooterComment() error = %v", err)
	}
	if gotMethod != http.MethodDelete {
		t.Fatalf("method = %q", gotMethod)
	}
	if gotPath != "/wiki/api/v2/footer-comments/c1" {
		t.Fatalf("path = %q", gotPath)
	}
}
