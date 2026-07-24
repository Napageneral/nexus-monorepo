package main

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func TestAdapterReflectionMatchesReviewedCatalog(t *testing.T) {
	built := nexadapter.DefineAdapter(adapterConfig())
	info, err := built.Operations.AdapterInfo(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(info.Methods) != 72 {
		t.Fatalf("methods = %d, want 72", len(info.Methods))
	}
	reads := 0
	writes := 0
	for _, method := range info.Methods {
		operation, ok := operationForMethod(method.Name)
		if !ok {
			t.Fatalf("unbound reflected method %q", method.Name)
		}
		if operation.Visibility != "public" {
			t.Fatalf("internal method reflected: %s", method.Name)
		}
		if operation.HTTPMethod == http.MethodGet {
			reads++
			if method.Action != "read" || method.MutatesRemote {
				t.Fatalf("read method classification drift: %#v", method)
			}
		} else {
			writes++
			if method.Action != "write" || !method.MutatesRemote {
				t.Fatalf("write method classification drift: %#v", method)
			}
		}
	}
	if reads != 42 || writes != 30 {
		t.Fatalf("read/write counts = %d/%d, want 42/30", reads, writes)
	}
	if info.MethodCatalog == nil ||
		info.MethodCatalog.Source != "openapi" ||
		info.MethodCatalog.Document != "internal/catalog/operations.catalog.json" {
		t.Fatalf("method catalog = %#v", info.MethodCatalog)
	}
}

func TestProjectionDeclaresNineInactiveFamilies(t *testing.T) {
	projection := mercuryProjection()
	if len(projection.Families) != 9 {
		t.Fatalf("families = %d, want 9", len(projection.Families))
	}
	if projection.Backfill == nil || projection.Backfill.Supported {
		t.Fatal("MAP-002 backfill must remain inactive")
	}
	if projection.Monitor == nil || projection.Monitor.Supported {
		t.Fatal("MAP-002 monitor must remain inactive")
	}
}

func TestAuthManifestSeparatesRoleFromSecret(t *testing.T) {
	auth := adapterConfig().Auth
	if auth == nil || len(auth.Methods) != 1 {
		t.Fatalf("auth = %#v", auth)
	}
	fields := auth.Methods[0].Fields
	if len(fields) != 2 {
		t.Fatalf("fields = %#v", fields)
	}
	if fields[0].Name != "connection_role" || fields[0].Type != "select" {
		t.Fatalf("role field = %#v", fields[0])
	}
	if fields[1].Name != "api_token" || fields[1].Type != "secret" {
		t.Fatalf("token field = %#v", fields[1])
	}
}

func TestNewSchemasDoNotDeclareForbiddenField(t *testing.T) {
	built := nexadapter.DefineAdapter(adapterConfig())
	info, err := built.Operations.AdapterInfo(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(info)
	if err != nil {
		t.Fatal(err)
	}
	var decoded any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	if hasForbiddenSchemaField(decoded) {
		t.Fatal("adapter reflection contains forbidden schema field")
	}
}

func hasForbiddenSchemaField(value any) bool {
	forbiddenFieldName := "k" + "ind"
	switch typed := value.(type) {
	case map[string]any:
		for key, child := range typed {
			if key == forbiddenFieldName || hasForbiddenSchemaField(child) {
				return true
			}
		}
	case []any:
		for _, child := range typed {
			if hasForbiddenSchemaField(child) {
				return true
			}
		}
	}
	return false
}
