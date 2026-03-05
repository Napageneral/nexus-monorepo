package main

import (
	"testing"
	"time"
)

func TestGitHubInstallStateRoundTrip(t *testing.T) {
	payload := githubInstallStatePayload{
		IssuedAt: time.Now().UTC().Unix(),
		Nonce:    "nonce-123",
	}
	state, err := encodeGitHubInstallState(payload, "state-secret")
	if err != nil {
		t.Fatalf("encode state: %v", err)
	}
	decoded, err := decodeGitHubInstallState(state, "state-secret", 20*time.Minute, time.Now().UTC())
	if err != nil {
		t.Fatalf("decode state: %v", err)
	}
	if decoded.Nonce != payload.Nonce {
		t.Fatalf("unexpected decoded payload: %#v", decoded)
	}
}

func TestGitHubInstallStateRejectsTamperingAndExpiry(t *testing.T) {
	payload := githubInstallStatePayload{
		IssuedAt: time.Now().UTC().Add(-30 * time.Minute).Unix(),
		Nonce:    "nonce-123",
	}
	state, err := encodeGitHubInstallState(payload, "state-secret")
	if err != nil {
		t.Fatalf("encode state: %v", err)
	}
	if _, err := decodeGitHubInstallState(state, "state-secret", 20*time.Minute, time.Now().UTC()); err == nil {
		t.Fatalf("expected expired state error")
	}
	tampered := state + "x"
	if _, err := decodeGitHubInstallState(tampered, "state-secret", 20*time.Minute, time.Now().UTC()); err == nil {
		t.Fatalf("expected invalid signature error")
	}
	badBody := state[:len(state)-1] + "a"
	if _, err := decodeGitHubInstallState(badBody, "state-secret", 20*time.Minute, time.Now().UTC()); err == nil {
		t.Fatalf("expected tampered payload rejection")
	}
}
