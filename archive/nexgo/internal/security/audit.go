// Package security provides security auditing, auto-fixing, and skill scanning.
package security

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/Napageneral/nexus/internal/config"
)

// AuditReport contains the results of a security audit.
type AuditReport struct {
	Score    int          `json:"score"` // 0-100
	Issues   []AuditIssue `json:"issues"`
	Warnings []AuditIssue `json:"warnings"`
	Passed   []string     `json:"passed"`
}

// AuditIssue describes a single security finding.
type AuditIssue struct {
	Category string `json:"category"` // "permissions", "config", "credentials", "network"
	Severity string `json:"severity"` // "critical", "high", "medium", "low"
	Message  string `json:"message"`
	Fix      string `json:"fix,omitempty"`
}

// RunAudit performs all security checks on the given state directory and config.
func RunAudit(ctx context.Context, stateDir string, cfg *config.Config) (*AuditReport, error) {
	_ = ctx

	report := &AuditReport{}

	// Run all checks.
	permIssues := checkFilePermissions(stateDir)
	configIssues := checkConfigSecurity(cfg)
	credIssues := checkCredentials(stateDir)
	netIssues := checkNetworkSecurity(cfg)

	// Categorize issues.
	allIssues := make([]AuditIssue, 0, len(permIssues)+len(configIssues)+len(credIssues)+len(netIssues))
	allIssues = append(allIssues, permIssues...)
	allIssues = append(allIssues, configIssues...)
	allIssues = append(allIssues, credIssues...)
	allIssues = append(allIssues, netIssues...)

	for _, issue := range allIssues {
		switch issue.Severity {
		case "critical", "high":
			report.Issues = append(report.Issues, issue)
		default:
			report.Warnings = append(report.Warnings, issue)
		}
	}

	// Track passed checks.
	if len(permIssues) == 0 {
		report.Passed = append(report.Passed, "file permissions are secure")
	}
	if len(configIssues) == 0 {
		report.Passed = append(report.Passed, "configuration settings are secure")
	}
	if len(credIssues) == 0 {
		report.Passed = append(report.Passed, "no credential issues found")
	}
	if len(netIssues) == 0 {
		report.Passed = append(report.Passed, "network configuration is secure")
	}

	// Calculate score.
	report.Score = calculateScore(report)

	return report, nil
}

// calculateScore computes a security score from 0-100.
func calculateScore(report *AuditReport) int {
	score := 100

	for _, issue := range report.Issues {
		switch issue.Severity {
		case "critical":
			score -= 25
		case "high":
			score -= 15
		}
	}

	for _, w := range report.Warnings {
		switch w.Severity {
		case "medium":
			score -= 5
		case "low":
			score -= 2
		}
	}

	if score < 0 {
		score = 0
	}
	return score
}

// checkFilePermissions checks file and directory permissions in the state directory.
func checkFilePermissions(stateDir string) []AuditIssue {
	var issues []AuditIssue

	// Check if state directory exists.
	info, err := os.Stat(stateDir)
	if err != nil {
		if os.IsNotExist(err) {
			return issues // Nothing to check.
		}
		issues = append(issues, AuditIssue{
			Category: "permissions",
			Severity: "medium",
			Message:  fmt.Sprintf("cannot stat state directory: %v", err),
		})
		return issues
	}

	// Check state directory permissions.
	mode := info.Mode().Perm()
	if mode&0o077 != 0 {
		issues = append(issues, AuditIssue{
			Category: "permissions",
			Severity: "high",
			Message:  fmt.Sprintf("state directory %s has permissive permissions: %o", stateDir, mode),
			Fix:      fmt.Sprintf("chmod 700 %s", stateDir),
		})
	}

	// Check sensitive files within state directory.
	sensitiveFiles := []string{
		"config.json",
		"nex.pid",
		"nexus.log",
	}

	for _, name := range sensitiveFiles {
		path := filepath.Join(stateDir, name)
		finfo, err := os.Stat(path)
		if err != nil {
			continue // File doesn't exist, skip.
		}
		fmode := finfo.Mode().Perm()
		if fmode&0o077 != 0 {
			issues = append(issues, AuditIssue{
				Category: "permissions",
				Severity: "high",
				Message:  fmt.Sprintf("file %s has permissive permissions: %o", name, fmode),
				Fix:      fmt.Sprintf("chmod 600 %s", path),
			})
		}
	}

	// Check database files in data directory.
	dataDir := filepath.Join(stateDir, "data")
	if _, err := os.Stat(dataDir); err == nil {
		filepath.WalkDir(dataDir, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				return nil
			}
			if strings.HasSuffix(d.Name(), ".db") || strings.HasSuffix(d.Name(), ".sqlite") {
				dinfo, err := d.Info()
				if err != nil {
					return nil
				}
				dmode := dinfo.Mode().Perm()
				if dmode&0o077 != 0 {
					relPath, _ := filepath.Rel(stateDir, path)
					issues = append(issues, AuditIssue{
						Category: "permissions",
						Severity: "high",
						Message:  fmt.Sprintf("database file %s has permissive permissions: %o", relPath, dmode),
						Fix:      fmt.Sprintf("chmod 600 %s", path),
					})
				}
			}
			return nil
		})
	}

	// Check credentials directory.
	credDir := filepath.Join(stateDir, "credentials")
	if cinfo, err := os.Stat(credDir); err == nil {
		cmode := cinfo.Mode().Perm()
		if cmode&0o077 != 0 {
			issues = append(issues, AuditIssue{
				Category: "permissions",
				Severity: "critical",
				Message:  fmt.Sprintf("credentials directory has permissive permissions: %o", cmode),
				Fix:      fmt.Sprintf("chmod 700 %s", credDir),
			})
		}
	}

	return issues
}

// checkConfigSecurity checks configuration for security issues.
func checkConfigSecurity(cfg *config.Config) []AuditIssue {
	var issues []AuditIssue

	if cfg == nil {
		return issues
	}

	// Check for permissive CORS (wildcard origins in control UI).
	if cfg.Runtime.ControlUI.AllowedOrigins != nil {
		for _, origin := range cfg.Runtime.ControlUI.AllowedOrigins {
			if origin == "*" {
				issues = append(issues, AuditIssue{
					Category: "config",
					Severity: "high",
					Message:  "control UI allows all CORS origins (*)",
					Fix:      "restrict allowedOrigins to specific domains",
				})
				break
			}
		}
	}

	// Check for weak/missing auth.
	if cfg.Runtime.Auth.Mode == "" {
		issues = append(issues, AuditIssue{
			Category: "config",
			Severity: "medium",
			Message:  "no authentication mode configured",
			Fix:      "set runtime.auth.mode to 'token' or 'trusted_token'",
		})
	}

	// Check for plaintext password in config.
	if cfg.Runtime.Auth.Password != "" {
		issues = append(issues, AuditIssue{
			Category: "config",
			Severity: "high",
			Message:  "plaintext password found in configuration",
			Fix:      "use token-based auth instead of password",
		})
	}

	// Check for API keys in provider configs.
	for name, provider := range cfg.Models.Providers {
		if provider.APIKey != "" && !strings.HasPrefix(provider.APIKey, "${") {
			issues = append(issues, AuditIssue{
				Category: "config",
				Severity: "medium",
				Message:  fmt.Sprintf("API key for provider %q is set in plaintext", name),
				Fix:      "use environment variable reference (e.g., ${MY_API_KEY})",
			})
		}
	}

	return issues
}

// checkCredentials checks for credential-related security issues.
func checkCredentials(stateDir string) []AuditIssue {
	var issues []AuditIssue

	credDir := filepath.Join(stateDir, "credentials")
	if _, err := os.Stat(credDir); os.IsNotExist(err) {
		return issues
	}

	// Walk credential files looking for issues.
	filepath.WalkDir(credDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}

		// Check for world-readable credential files.
		info, err := d.Info()
		if err != nil {
			return nil
		}
		mode := info.Mode().Perm()
		if mode&0o044 != 0 {
			relPath, _ := filepath.Rel(stateDir, path)
			issues = append(issues, AuditIssue{
				Category: "credentials",
				Severity: "critical",
				Message:  fmt.Sprintf("credential file %s is world-readable: %o", relPath, mode),
				Fix:      fmt.Sprintf("chmod 600 %s", path),
			})
		}

		// Check for plaintext token patterns in files.
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		content := string(data)

		// Look for common credential patterns stored in plaintext.
		dangerousPatterns := []struct {
			pattern string
			name    string
		}{
			{"BEGIN RSA PRIVATE KEY", "RSA private key"},
			{"BEGIN PRIVATE KEY", "private key"},
			{"AKIA", "AWS access key"},
		}

		for _, p := range dangerousPatterns {
			if strings.Contains(content, p.pattern) {
				relPath, _ := filepath.Rel(stateDir, path)
				issues = append(issues, AuditIssue{
					Category: "credentials",
					Severity: "critical",
					Message:  fmt.Sprintf("found %s in %s", p.name, relPath),
					Fix:      "move sensitive credentials to a secure vault or use environment variables",
				})
			}
		}

		return nil
	})

	return issues
}

// checkNetworkSecurity checks network-related configuration.
func checkNetworkSecurity(cfg *config.Config) []AuditIssue {
	var issues []AuditIssue

	if cfg == nil {
		return issues
	}

	// Check bind address.
	switch cfg.Runtime.Bind {
	case "lan":
		issues = append(issues, AuditIssue{
			Category: "network",
			Severity: "medium",
			Message:  "server binds to LAN interface, accessible from local network",
			Fix:      "use 'loopback' bind mode for local-only access",
		})
	case "custom":
		// Custom bind is user's responsibility, but warn.
		issues = append(issues, AuditIssue{
			Category: "network",
			Severity: "low",
			Message:  "server uses custom bind address, verify it is not publicly accessible",
		})
	}

	// Check TLS configuration.
	if cfg.Runtime.TLS.Enabled != nil && *cfg.Runtime.TLS.Enabled {
		if cfg.Runtime.TLS.CertPath == "" || cfg.Runtime.TLS.KeyPath == "" {
			issues = append(issues, AuditIssue{
				Category: "network",
				Severity: "high",
				Message:  "TLS is enabled but cert/key paths are not configured",
				Fix:      "set runtime.tls.certPath and runtime.tls.keyPath",
			})
		}
	} else {
		// TLS not enabled - check if server is accessible externally.
		if cfg.Runtime.Bind == "lan" || cfg.Runtime.Bind == "custom" {
			issues = append(issues, AuditIssue{
				Category: "network",
				Severity: "high",
				Message:  "TLS is disabled but server is network-accessible",
				Fix:      "enable TLS (runtime.tls.enabled) or restrict to loopback",
			})
		}
	}

	// Check ingress configuration.
	if cfg.Runtime.Ingress.Enabled != nil && *cfg.Runtime.Ingress.Enabled {
		if cfg.Runtime.Ingress.Auth.Mode == "" {
			issues = append(issues, AuditIssue{
				Category: "network",
				Severity: "high",
				Message:  "ingress is enabled without authentication",
				Fix:      "configure ingress auth mode",
			})
		}
	}

	return issues
}
