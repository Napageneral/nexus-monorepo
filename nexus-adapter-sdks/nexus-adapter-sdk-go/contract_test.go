package nexadapter

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/santhosh-tekuri/jsonschema/v5"
)

func contractDir(t *testing.T) string {
	t.Helper()

	if dir := strings.TrimSpace(os.Getenv("NEXUS_ADAPTER_PROTOCOL_CONTRACT_DIR")); dir != "" {
		abs, err := filepath.Abs(dir)
		if err != nil {
			t.Fatalf("abs(%s): %v", dir, err)
		}
		return abs
	}

	// Default assumes this repo is checked out next to `nexus-specs`.
	// Workspace-relative: nexus-adapter-sdks/nexus-adapter-sdk-go/../../nexus-specs/specs/runtime/adapters/contract
	p := filepath.Join("..", "..", "nexus-specs", "specs", "runtime", "adapters", "contract")
	abs, err := filepath.Abs(p)
	if err != nil {
		t.Fatalf("abs(%s): %v", p, err)
	}
	return abs
}

func contractSchemaFile(t *testing.T) string {
	t.Helper()
	p := filepath.Join(contractDir(t), "adapter-protocol.schema.json")
	abs, err := filepath.Abs(p)
	if err != nil {
		t.Fatalf("abs(%s): %v", p, err)
	}
	return abs
}

func compileContractRef(t *testing.T, def string) *jsonschema.Schema {
	t.Helper()
	abs := contractSchemaFile(t)
	url := "file://" + filepath.ToSlash(abs) + "#/$defs/" + def
	c := jsonschema.NewCompiler()
	s, err := c.Compile(url)
	if err != nil {
		t.Fatalf("compile %s: %v", url, err)
	}
	return s
}

func loadFixtureJSON(t *testing.T, name string) any {
	t.Helper()
	p := filepath.Join(contractDir(t), "fixtures", name)
	raw, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("read fixture %s: %v", p, err)
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatalf("parse fixture %s: %v", p, err)
	}
	return v
}

func loadFixtureJSONL(t *testing.T, name string) []any {
	t.Helper()
	p := filepath.Join(contractDir(t), "fixtures", name)
	f, err := os.Open(p)
	if err != nil {
		t.Fatalf("open fixture %s: %v", p, err)
	}
	defer f.Close()

	var out []any
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var v any
		if err := json.Unmarshal([]byte(line), &v); err != nil {
			t.Fatalf("parse jsonl line in %s: %v", p, err)
		}
		out = append(out, v)
	}
	if err := sc.Err(); err != nil {
		t.Fatalf("scan jsonl %s: %v", p, err)
	}
	return out
}

func requireValid(t *testing.T, schema *jsonschema.Schema, v any) {
	t.Helper()
	if err := schema.Validate(v); err != nil {
		t.Fatalf("schema validation failed: %v", err)
	}
}

func TestAdapterProtocolContract_FixturesValidate(t *testing.T) {
	// Validate fixtures against the canonical schema.
	requireValid(t, compileContractRef(t, "AdapterInfo"), loadFixtureJSON(t, "adapter_info.json"))
	requireValid(t, compileContractRef(t, "NexusEvent"), loadFixtureJSON(t, "nexus_event.json"))
	requireValid(t, compileContractRef(t, "DeliveryResult"), loadFixtureJSON(t, "delivery_result_success.json"))
	requireValid(t, compileContractRef(t, "DeliveryResult"), loadFixtureJSON(t, "delivery_result_rate_limited.json"))
	requireValid(t, compileContractRef(t, "AdapterHealth"), loadFixtureJSON(t, "adapter_health.json"))
	requireValid(t, compileContractRef(t, "AdapterAccount"), loadFixtureJSON(t, "adapter_account.json"))
	requireValid(t, compileContractRef(t, "RuntimeContext"), loadFixtureJSON(t, "runtime_context.json"))

	for _, e := range loadFixtureJSONL(t, "stream_events.jsonl") {
		requireValid(t, compileContractRef(t, "StreamEvent"), e)
	}
	for _, s := range loadFixtureJSONL(t, "stream_statuses.jsonl") {
		requireValid(t, compileContractRef(t, "AdapterStreamStatus"), s)
	}
}

func TestAdapterProtocolContract_GoTypesRoundTrip(t *testing.T) {
	// Ensure Go SDK structs can round-trip fixture JSON without losing conformance.
	roundTrip := func(def string, name string, dst any) {
		t.Helper()
		raw, err := json.Marshal(loadFixtureJSON(t, name))
		if err != nil {
			t.Fatalf("marshal fixture %s: %v", name, err)
		}
		if err := json.Unmarshal(raw, dst); err != nil {
			t.Fatalf("unmarshal into go type for %s: %v", name, err)
		}
		encoded, err := json.Marshal(dst)
		if err != nil {
			t.Fatalf("re-marshal go type for %s: %v", name, err)
		}
		var v any
		if err := json.Unmarshal(encoded, &v); err != nil {
			t.Fatalf("re-parse marshaled json for %s: %v", name, err)
		}
		requireValid(t, compileContractRef(t, def), v)
	}

	roundTrip("AdapterInfo", "adapter_info.json", &AdapterInfo{})
	roundTrip("NexusEvent", "nexus_event.json", &NexusEvent{})
	roundTrip("DeliveryResult", "delivery_result_success.json", &DeliveryResult{})
	roundTrip("DeliveryResult", "delivery_result_rate_limited.json", &DeliveryResult{})
	roundTrip("AdapterHealth", "adapter_health.json", &AdapterHealth{})
	roundTrip("AdapterAccount", "adapter_account.json", &AdapterAccount{})
	roundTrip("RuntimeContext", "runtime_context.json", &RuntimeContext{})
}
