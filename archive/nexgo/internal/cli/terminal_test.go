package cli

import (
	"strings"
	"testing"
	"time"
)

func TestRenderTable(t *testing.T) {
	headers := []string{"NAME", "STATUS", "PORT"}
	rows := [][]string{
		{"nexus", "running", "18789"},
		{"agent", "stopped", "0"},
	}

	result := RenderTable(headers, rows)

	if result == "" {
		t.Fatal("RenderTable returned empty string")
	}

	// Check headers are present.
	if !strings.Contains(result, "NAME") {
		t.Error("missing NAME header")
	}
	if !strings.Contains(result, "STATUS") {
		t.Error("missing STATUS header")
	}

	// Check data.
	if !strings.Contains(result, "nexus") {
		t.Error("missing 'nexus' in table")
	}
	if !strings.Contains(result, "running") {
		t.Error("missing 'running' in table")
	}

	// Check separator.
	if !strings.Contains(result, "---") {
		t.Error("missing separator line")
	}

	// Count lines: header + separator + 2 data rows = 4 lines.
	lines := strings.Split(strings.TrimRight(result, "\n"), "\n")
	if len(lines) != 4 {
		t.Errorf("expected 4 lines, got %d", len(lines))
	}
}

func TestRenderTableEmpty(t *testing.T) {
	result := RenderTable([]string{}, nil)
	if result != "" {
		t.Errorf("expected empty string for no headers, got %q", result)
	}
}

func TestRenderTableNoRows(t *testing.T) {
	result := RenderTable([]string{"A", "B"}, nil)
	lines := strings.Split(strings.TrimRight(result, "\n"), "\n")
	if len(lines) != 2 { // header + separator
		t.Errorf("expected 2 lines for header-only table, got %d", len(lines))
	}
}

func TestColorFunctions(t *testing.T) {
	tests := []struct {
		name string
		fn   func(string) string
	}{
		{"Bold", Bold},
		{"Green", Green},
		{"Red", Red},
		{"Yellow", Yellow},
		{"Cyan", Cyan},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.fn("hello")
			if result == "" {
				t.Errorf("%s returned empty string", tt.name)
			}
			// Should contain the original text.
			if !strings.Contains(result, "hello") {
				t.Errorf("%s result does not contain 'hello': %q", tt.name, result)
			}
			// Should contain ANSI escape.
			if !strings.Contains(result, "\033[") {
				t.Errorf("%s result does not contain ANSI escape: %q", tt.name, result)
			}
			// Should end with reset.
			if !strings.HasSuffix(result, ansiReset) {
				t.Errorf("%s result does not end with reset: %q", tt.name, result)
			}
		})
	}
}

func TestStatusIcon(t *testing.T) {
	ok := StatusIcon(true)
	fail := StatusIcon(false)

	if ok == "" {
		t.Error("StatusIcon(true) is empty")
	}
	if fail == "" {
		t.Error("StatusIcon(false) is empty")
	}
	if ok == fail {
		t.Error("StatusIcon(true) and StatusIcon(false) should differ")
	}
}

func TestFormatDuration(t *testing.T) {
	tests := []struct {
		d    time.Duration
		want string
	}{
		{500 * time.Millisecond, "500ms"},
		{1500 * time.Millisecond, "1.5s"},
		{90 * time.Second, "1m30s"},
		{3661 * time.Second, "1h1m"},
	}

	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			got := FormatDuration(tt.d)
			if got != tt.want {
				t.Errorf("FormatDuration(%v) = %q, want %q", tt.d, got, tt.want)
			}
		})
	}
}

func TestFormatBytes(t *testing.T) {
	tests := []struct {
		b    int64
		want string
	}{
		{0, "0 B"},
		{512, "512 B"},
		{1024, "1.0 KB"},
		{1536, "1.5 KB"},
		{1048576, "1.0 MB"},
		{1073741824, "1.0 GB"},
		{1099511627776, "1.0 TB"},
	}

	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			got := FormatBytes(tt.b)
			if got != tt.want {
				t.Errorf("FormatBytes(%d) = %q, want %q", tt.b, got, tt.want)
			}
		})
	}
}
