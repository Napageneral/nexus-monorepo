package apps

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
}

// writeManifest writes a JSON manifest file to the given path.
func writeManifest(t *testing.T, dir string, m AppManifest) {
	t.Helper()
	data, err := json.Marshal(m)
	if err != nil {
		t.Fatalf("marshal manifest: %v", err)
	}
	path := filepath.Join(dir, manifestFilename)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("write manifest: %v", err)
	}
}

func validManifest() AppManifest {
	return AppManifest{
		ID:          "test-app",
		Name:        "Test App",
		Version:     "1.0.0",
		Description: "A test application",
		Services: []ServiceDef{
			{
				Name:   "main",
				Binary: "echo",
				Args:   []string{"hello"},
				Port:   8080,
			},
		},
		Methods: []MethodDef{
			{
				Name:        "greet",
				Description: "Says hello",
				Service:     "main",
			},
		},
		Hooks: []HookDef{
			{
				Hookpoint: "on.startup",
				Handler:   "greet",
			},
		},
	}
}

func TestParseManifest(t *testing.T) {
	dir := t.TempDir()
	appDir := filepath.Join(dir, "myapp")
	if err := os.Mkdir(appDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	expected := validManifest()
	writeManifest(t, appDir, expected)

	path := filepath.Join(appDir, manifestFilename)
	got, err := ParseManifest(path)
	if err != nil {
		t.Fatalf("ParseManifest: %v", err)
	}

	if got.ID != expected.ID {
		t.Errorf("ID = %q, want %q", got.ID, expected.ID)
	}
	if got.Name != expected.Name {
		t.Errorf("Name = %q, want %q", got.Name, expected.Name)
	}
	if got.Version != expected.Version {
		t.Errorf("Version = %q, want %q", got.Version, expected.Version)
	}
	if got.Description != expected.Description {
		t.Errorf("Description = %q, want %q", got.Description, expected.Description)
	}
	if len(got.Services) != 1 {
		t.Fatalf("Services count = %d, want 1", len(got.Services))
	}
	if got.Services[0].Name != "main" {
		t.Errorf("Services[0].Name = %q, want main", got.Services[0].Name)
	}
	if got.Services[0].Binary != "echo" {
		t.Errorf("Services[0].Binary = %q, want echo", got.Services[0].Binary)
	}
	if got.Services[0].Port != 8080 {
		t.Errorf("Services[0].Port = %d, want 8080", got.Services[0].Port)
	}
	if len(got.Methods) != 1 {
		t.Fatalf("Methods count = %d, want 1", len(got.Methods))
	}
	if got.Methods[0].Name != "greet" {
		t.Errorf("Methods[0].Name = %q, want greet", got.Methods[0].Name)
	}
	if len(got.Hooks) != 1 {
		t.Fatalf("Hooks count = %d, want 1", len(got.Hooks))
	}
	if got.Hooks[0].Hookpoint != "on.startup" {
		t.Errorf("Hooks[0].Hookpoint = %q, want on.startup", got.Hooks[0].Hookpoint)
	}
}

func TestParseManifestInvalid(t *testing.T) {
	// Non-existent file.
	_, err := ParseManifest("/nonexistent/path/app.nexus.json")
	if err == nil {
		t.Error("expected error for non-existent file")
	}

	// Invalid JSON.
	dir := t.TempDir()
	badPath := filepath.Join(dir, "app.nexus.json")
	if err := os.WriteFile(badPath, []byte("{invalid json"), 0o644); err != nil {
		t.Fatalf("write bad json: %v", err)
	}
	_, err = ParseManifest(badPath)
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestValidateManifest(t *testing.T) {
	// Valid manifest should have no errors.
	m := validManifest()
	errs := ValidateManifest(&m)
	if len(errs) != 0 {
		t.Errorf("valid manifest has errors: %v", errs)
	}

	// Missing required fields.
	empty := &AppManifest{}
	errs = ValidateManifest(empty)
	if len(errs) != 3 {
		t.Errorf("empty manifest: got %d errors, want 3 (id, name, version); errors: %v", len(errs), errs)
	}

	// Missing service fields.
	withBadService := &AppManifest{
		ID:      "test",
		Name:    "test",
		Version: "1.0.0",
		Services: []ServiceDef{
			{Name: "", Binary: ""},
		},
	}
	errs = ValidateManifest(withBadService)
	if len(errs) != 2 {
		t.Errorf("bad service: got %d errors, want 2; errors: %v", len(errs), errs)
	}

	// Missing method fields.
	withBadMethod := &AppManifest{
		ID:      "test",
		Name:    "test",
		Version: "1.0.0",
		Methods: []MethodDef{
			{Name: "", Service: ""},
		},
	}
	errs = ValidateManifest(withBadMethod)
	if len(errs) != 2 {
		t.Errorf("bad method: got %d errors, want 2; errors: %v", len(errs), errs)
	}

	// Missing hook fields.
	withBadHook := &AppManifest{
		ID:      "test",
		Name:    "test",
		Version: "1.0.0",
		Hooks: []HookDef{
			{Hookpoint: "", Handler: ""},
		},
	}
	errs = ValidateManifest(withBadHook)
	if len(errs) != 2 {
		t.Errorf("bad hook: got %d errors, want 2; errors: %v", len(errs), errs)
	}
}

func TestRegistryCreation(t *testing.T) {
	r := NewRegistry(testLogger())
	if r == nil {
		t.Fatal("NewRegistry returned nil")
	}
	list := r.List()
	if len(list) != 0 {
		t.Errorf("List() has %d entries, want 0", len(list))
	}
}

func TestRegistryRegisterAndList(t *testing.T) {
	r := NewRegistry(testLogger())

	m := validManifest()
	if err := r.Register(m); err != nil {
		t.Fatalf("Register: %v", err)
	}

	list := r.List()
	if len(list) != 1 {
		t.Fatalf("List() has %d entries, want 1", len(list))
	}
	if list[0].Manifest.ID != "test-app" {
		t.Errorf("Manifest.ID = %q, want test-app", list[0].Manifest.ID)
	}
	if list[0].State != AppDiscovered {
		t.Errorf("State = %q, want discovered", list[0].State)
	}

	// Get by ID.
	record, err := r.Get("test-app")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if record.Manifest.Name != "Test App" {
		t.Errorf("Name = %q, want Test App", record.Manifest.Name)
	}

	// Duplicate registration should fail.
	if err := r.Register(m); err == nil {
		t.Error("expected error for duplicate registration")
	}

	// Empty ID should fail.
	emptyID := AppManifest{ID: ""}
	if err := r.Register(emptyID); err == nil {
		t.Error("expected error for empty ID")
	}

	// Get non-existent should fail.
	_, err = r.Get("nonexistent")
	if err == nil {
		t.Error("expected error for non-existent app")
	}
}

func TestRegistrySetState(t *testing.T) {
	r := NewRegistry(testLogger())

	m := validManifest()
	if err := r.Register(m); err != nil {
		t.Fatalf("Register: %v", err)
	}

	// Set state to installed.
	if err := r.SetState("test-app", AppInstalled); err != nil {
		t.Fatalf("SetState(installed): %v", err)
	}
	record, _ := r.Get("test-app")
	if record.State != AppInstalled {
		t.Errorf("State = %q, want installed", record.State)
	}

	// Set state to active should set StartedAt.
	if err := r.SetState("test-app", AppActive); err != nil {
		t.Fatalf("SetState(active): %v", err)
	}
	record, _ = r.Get("test-app")
	if record.State != AppActive {
		t.Errorf("State = %q, want active", record.State)
	}
	if record.StartedAt == nil {
		t.Error("StartedAt is nil after setting state to active")
	}

	// Set state on non-existent app should fail.
	if err := r.SetState("nonexistent", AppActive); err == nil {
		t.Error("expected error for non-existent app")
	}
}

func TestRegistryUnregister(t *testing.T) {
	r := NewRegistry(testLogger())

	m := validManifest()
	if err := r.Register(m); err != nil {
		t.Fatalf("Register: %v", err)
	}

	if err := r.Unregister("test-app"); err != nil {
		t.Fatalf("Unregister: %v", err)
	}

	list := r.List()
	if len(list) != 0 {
		t.Errorf("List() after unregister has %d entries, want 0", len(list))
	}

	// Unregister non-existent should fail.
	if err := r.Unregister("test-app"); err == nil {
		t.Error("expected error for non-existent unregister")
	}
}

func TestDiscovery(t *testing.T) {
	appsDir := t.TempDir()

	// Create two valid app directories.
	app1Dir := filepath.Join(appsDir, "app1")
	app2Dir := filepath.Join(appsDir, "app2")
	invalidDir := filepath.Join(appsDir, "invalid-app")
	noManifestDir := filepath.Join(appsDir, "no-manifest")

	for _, d := range []string{app1Dir, app2Dir, invalidDir, noManifestDir} {
		if err := os.Mkdir(d, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", d, err)
		}
	}

	writeManifest(t, app1Dir, AppManifest{
		ID:      "app-1",
		Name:    "App One",
		Version: "1.0.0",
	})
	writeManifest(t, app2Dir, AppManifest{
		ID:      "app-2",
		Name:    "App Two",
		Version: "2.0.0",
		Services: []ServiceDef{
			{Name: "svc", Binary: "echo"},
		},
	})

	// Write invalid JSON to the invalid app directory.
	invalidPath := filepath.Join(invalidDir, manifestFilename)
	if err := os.WriteFile(invalidPath, []byte("{bad json"), 0o644); err != nil {
		t.Fatalf("write invalid manifest: %v", err)
	}

	// noManifestDir has no app.nexus.json.

	// Also create a regular file (not a directory) to ensure it's skipped.
	regularFile := filepath.Join(appsDir, "not-a-dir.txt")
	if err := os.WriteFile(regularFile, []byte("hello"), 0o644); err != nil {
		t.Fatalf("write regular file: %v", err)
	}

	manifests, err := Discover(appsDir)
	if err != nil {
		t.Fatalf("Discover: %v", err)
	}

	if len(manifests) != 2 {
		t.Fatalf("Discover found %d manifests, want 2", len(manifests))
	}

	// Verify we got the right apps (order may vary).
	ids := make(map[string]bool)
	for _, m := range manifests {
		ids[m.ID] = true
	}
	if !ids["app-1"] {
		t.Error("app-1 not found in discovered manifests")
	}
	if !ids["app-2"] {
		t.Error("app-2 not found in discovered manifests")
	}
}

func TestDiscoveryNonExistentDir(t *testing.T) {
	_, err := Discover("/nonexistent/apps/dir")
	if err == nil {
		t.Error("expected error for non-existent directory")
	}
}

func TestServiceManagerCreation(t *testing.T) {
	r := NewRegistry(testLogger())
	sm := NewServiceManager(r, testLogger())
	if sm == nil {
		t.Fatal("NewServiceManager returned nil")
	}

	// Status for non-existent app should fail.
	_, err := sm.Status("nonexistent")
	if err == nil {
		t.Error("expected error for non-existent app status")
	}

	// Register an app and check its status.
	m := validManifest()
	if err := r.Register(m); err != nil {
		t.Fatalf("Register: %v", err)
	}

	state, err := sm.Status("test-app")
	if err != nil {
		t.Fatalf("Status: %v", err)
	}
	if state != AppDiscovered {
		t.Errorf("State = %q, want discovered", state)
	}
}
