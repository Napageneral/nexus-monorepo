// Package apps implements the Nexus app platform for discovering, registering,
// and managing app lifecycle.
package apps

import (
	"encoding/json"
	"fmt"
	"os"
)

// AppManifest describes an app's metadata, services, methods, and hook bindings.
type AppManifest struct {
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Version     string       `json:"version"`
	Description string       `json:"description"`
	Services    []ServiceDef `json:"services"`
	Methods     []MethodDef  `json:"methods"`
	Hooks       []HookDef    `json:"hooks"`
}

// ServiceDef describes a process that the app runs.
type ServiceDef struct {
	Name   string   `json:"name"`
	Binary string   `json:"binary"`
	Args   []string `json:"args"`
	Port   int      `json:"port,omitempty"`
}

// MethodDef describes an operation exposed by the app.
type MethodDef struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Service     string `json:"service"`
}

// HookDef binds an app handler to a hookpoint.
type HookDef struct {
	Hookpoint string `json:"hookpoint"`
	Handler   string `json:"handler"` // method name
}

// ParseManifest reads and parses an app manifest from the given file path.
func ParseManifest(path string) (*AppManifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("parse manifest: read %s: %w", path, err)
	}

	var m AppManifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse manifest: unmarshal %s: %w", path, err)
	}

	return &m, nil
}

// ValidateManifest checks a manifest for required fields and returns
// a list of validation error messages. An empty slice means the manifest is valid.
func ValidateManifest(m *AppManifest) []string {
	var errs []string

	if m.ID == "" {
		errs = append(errs, "id is required")
	}
	if m.Name == "" {
		errs = append(errs, "name is required")
	}
	if m.Version == "" {
		errs = append(errs, "version is required")
	}

	for i, svc := range m.Services {
		if svc.Name == "" {
			errs = append(errs, fmt.Sprintf("services[%d].name is required", i))
		}
		if svc.Binary == "" {
			errs = append(errs, fmt.Sprintf("services[%d].binary is required", i))
		}
	}

	for i, method := range m.Methods {
		if method.Name == "" {
			errs = append(errs, fmt.Sprintf("methods[%d].name is required", i))
		}
		if method.Service == "" {
			errs = append(errs, fmt.Sprintf("methods[%d].service is required", i))
		}
	}

	for i, hook := range m.Hooks {
		if hook.Hookpoint == "" {
			errs = append(errs, fmt.Sprintf("hooks[%d].hookpoint is required", i))
		}
		if hook.Handler == "" {
			errs = append(errs, fmt.Sprintf("hooks[%d].handler is required", i))
		}
	}

	return errs
}
