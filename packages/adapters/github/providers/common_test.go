package providers

import "testing"

func TestCanonicalRemoteURL_StripsUserinfo(t *testing.T) {
	got := canonicalRemoteURL("https://token-user:secret@bitbucket.org/fmcom/player-api.git?foo=bar#frag")
	want := "https://bitbucket.org/fmcom/player-api.git"
	if got != want {
		t.Fatalf("canonicalRemoteURL() = %q, want %q", got, want)
	}
}

func TestCanonicalRemoteURL_PreservesNonURLCloneSyntax(t *testing.T) {
	got := canonicalRemoteURL("git@github.com:acme/api.git")
	want := "git@github.com:acme/api.git"
	if got != want {
		t.Fatalf("canonicalRemoteURL() = %q, want %q", got, want)
	}
}
