package main

import "testing"

func TestBuildRepoKey(t *testing.T) {
	got := buildRepoKey("https://github.com/kovidgoyal/kitty", "815df1e210e0a9ab4622f5c7f2d6891d7dbeddf1")
	want := "kovidgoyal-kitty-815df1e210e0"
	if got != want {
		t.Fatalf("buildRepoKey() = %q, want %q", got, want)
	}
}

func TestSanitizeName(t *testing.T) {
	got := sanitizeName(" Owner/Repo Name ")
	want := "owner-repo-name"
	if got != want {
		t.Fatalf("sanitizeName() = %q, want %q", got, want)
	}
}

func TestAllNodesReady(t *testing.T) {
	ready := &spikeStatus{
		Nodes: []struct {
			Status string `json:"status"`
		}{
			{Status: "ready"},
			{Status: "ready"},
		},
	}
	if !allNodesReady(ready) {
		t.Fatalf("expected ready status to be true")
	}

	notReady := &spikeStatus{
		Nodes: []struct {
			Status string `json:"status"`
		}{
			{Status: "ready"},
			{Status: "created"},
		},
	}
	if allNodesReady(notReady) {
		t.Fatalf("expected mixed status to be false")
	}
}
