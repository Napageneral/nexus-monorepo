package main

import (
	"encoding/json"
	"os"
	"testing"
)

func TestAdapterVersionMatchesPackageManifest(t *testing.T) {
	raw, err := os.ReadFile("../../adapter.nexus.json")
	if err != nil {
		t.Fatalf("read adapter.nexus.json: %v", err)
	}
	var manifest struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatalf("parse adapter.nexus.json: %v", err)
	}
	if manifest.Version != adapterVersion {
		t.Fatalf("runtime adapter version %q does not match package manifest %q", adapterVersion, manifest.Version)
	}
}
