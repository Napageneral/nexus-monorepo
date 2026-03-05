package nexadapter

import "testing"

func TestSafeIDToken(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"empty string", "", "na"},
		{"whitespace only", "   ", "na"},
		{"simple lowercase", "hello", "hello"},
		{"preserves case", "ChIJN1t_tDeuEmsR", "ChIJN1t_tDeuEmsR"},
		{"preserves email", "user@example.com", "user@example.com"},
		{"replaces spaces", "hello world", "hello-world"},
		{"replaces colons", "foo:bar:baz", "foo-bar-baz"},
		{"preserves hyphens", "my-token-123", "my-token-123"},
		{"preserves underscores", "my_token_123", "my_token_123"},
		{"preserves dots", "v1.2.3", "v1.2.3"},
		{"preserves at sign", "user@domain", "user@domain"},
		{"iso date unchanged", "2026-03-05", "2026-03-05"},
		{"snake_case unchanged", "ad_spend", "ad_spend"},
		{"numeric id unchanged", "12345678901", "12345678901"},
		{"trims leading hyphens", "---hello", "hello"},
		{"trims trailing dots", "hello...", "hello"},
		{"replaces special chars", "hello!world#test", "hello-world-test"},
		{"google place id", "ChIJN1t_tDeuEmsRUsoyG83frY4", "ChIJN1t_tDeuEmsRUsoyG83frY4"},
		{"all special chars", "!!!@@@", "@@@"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := SafeIDToken(tt.input)
			if got != tt.want {
				t.Errorf("SafeIDToken(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestFirstNonBlank(t *testing.T) {
	tests := []struct {
		name   string
		values []string
		want   string
	}{
		{"all empty", []string{"", "", ""}, ""},
		{"first is value", []string{"hello", "", "world"}, "hello"},
		{"second is value", []string{"", "hello", "world"}, "hello"},
		{"whitespace is blank", []string{"   ", "hello"}, "hello"},
		{"trims result", []string{"  hello  "}, "hello"},
		{"no args", nil, ""},
		{"single value", []string{"only"}, "only"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := FirstNonBlank(tt.values...)
			if got != tt.want {
				t.Errorf("FirstNonBlank(%v) = %q, want %q", tt.values, got, tt.want)
			}
		})
	}
}

func TestFieldValue(t *testing.T) {
	fields := map[string]string{
		"api_key":    "  abc123  ",
		"empty_key":  "",
		"normal_key": "value",
	}

	tests := []struct {
		name   string
		fields map[string]string
		key    string
		want   string
	}{
		{"trims whitespace", fields, "api_key", "abc123"},
		{"empty value", fields, "empty_key", ""},
		{"normal value", fields, "normal_key", "value"},
		{"missing key", fields, "nonexistent", ""},
		{"nil map", nil, "any_key", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := FieldValue(tt.fields, tt.key)
			if got != tt.want {
				t.Errorf("FieldValue(fields, %q) = %q, want %q", tt.key, got, tt.want)
			}
		})
	}
}

func TestRequireAccount(t *testing.T) {
	tests := []struct {
		name    string
		account string
		want    string
		wantErr bool
	}{
		{"normal account", "user@example.com", "user@example.com", false},
		{"trims whitespace", "  user@example.com  ", "user@example.com", false},
		{"empty string errors", "", "", true},
		{"whitespace only errors", "   ", "", true},
		{"simple id", "default-account", "default-account", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := RequireAccount(tt.account)
			if (err != nil) != tt.wantErr {
				t.Errorf("RequireAccount(%q) error = %v, wantErr %v", tt.account, err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("RequireAccount(%q) = %q, want %q", tt.account, got, tt.want)
			}
		})
	}
}
