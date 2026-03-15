package cli

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/Napageneral/nexus/internal/config"
)

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

// HealthResult holds the aggregate health check results.
type HealthResult struct {
	Overall bool
	Checks  []HealthCheck
}

// HealthCheck is a single health check.
type HealthCheck struct {
	Name    string
	Status  bool
	Message string
}

// CheckHealth connects to the daemon and runs health checks.
func CheckHealth(host string, port int) (*HealthResult, error) {
	url := fmt.Sprintf("%s/health", DaemonURL(host, port))

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return &HealthResult{
			Overall: false,
			Checks: []HealthCheck{
				{Name: "daemon", Status: false, Message: "not reachable: " + err.Error()},
			},
		}, nil
	}
	defer resp.Body.Close()

	checks := []HealthCheck{
		{Name: "daemon", Status: true, Message: "reachable"},
	}

	if resp.StatusCode == http.StatusOK {
		checks = append(checks, HealthCheck{
			Name:    "http",
			Status:  true,
			Message: "healthy",
		})
	} else {
		checks = append(checks, HealthCheck{
			Name:    "http",
			Status:  false,
			Message: fmt.Sprintf("HTTP %d", resp.StatusCode),
		})
	}

	overall := true
	for _, c := range checks {
		if !c.Status {
			overall = false
			break
		}
	}

	return &HealthResult{Overall: overall, Checks: checks}, nil
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

// CheckStatus queries the daemon for runtime status.
func CheckStatus(host string, port int) (map[string]any, error) {
	result, err := DispatchOperation(host, port, "status", nil)
	if err != nil {
		return nil, fmt.Errorf("querying status: %w", err)
	}
	return result, nil
}

// ---------------------------------------------------------------------------
// Doctor
// ---------------------------------------------------------------------------

// DoctorReport is the result of a doctor check.
type DoctorReport struct {
	Issues   []DoctorIssue
	Warnings []DoctorIssue
	Passed   []string
}

// DoctorIssue describes a single problem found by doctor.
type DoctorIssue struct {
	Category string
	Message  string
	Fix      string
}

// RunDoctor performs diagnostic checks on the local nexus installation.
func RunDoctor(stateDir string, cfg *config.Config) (*DoctorReport, error) {
	report := &DoctorReport{}

	// Check 1: State directory exists.
	if _, err := os.Stat(stateDir); os.IsNotExist(err) {
		report.Issues = append(report.Issues, DoctorIssue{
			Category: "filesystem",
			Message:  fmt.Sprintf("state directory does not exist: %s", stateDir),
			Fix:      "Run 'nexus init' to create the state directory.",
		})
	} else {
		report.Passed = append(report.Passed, "state directory exists")
	}

	// Check 2: Data directory exists.
	dataDir := filepath.Join(stateDir, "data")
	if _, err := os.Stat(dataDir); os.IsNotExist(err) {
		report.Issues = append(report.Issues, DoctorIssue{
			Category: "filesystem",
			Message:  fmt.Sprintf("data directory does not exist: %s", dataDir),
			Fix:      "Run 'nexus init' to create the data directory.",
		})
	} else {
		report.Passed = append(report.Passed, "data directory exists")
	}

	// Check 3: Config file exists.
	configFile := filepath.Join(stateDir, "config.json")
	if _, err := os.Stat(configFile); os.IsNotExist(err) {
		report.Warnings = append(report.Warnings, DoctorIssue{
			Category: "config",
			Message:  fmt.Sprintf("config file not found: %s", configFile),
			Fix:      "Run 'nexus init' to create a default configuration.",
		})
	} else {
		report.Passed = append(report.Passed, "config file exists")
	}

	// Check 4: Config validation (only if cfg provided).
	if cfg != nil {
		issues := config.Validate(cfg)
		if len(issues) > 0 {
			for _, issue := range issues {
				report.Issues = append(report.Issues, DoctorIssue{
					Category: "config",
					Message:  issue,
					Fix:      "Edit your config file to fix this issue.",
				})
			}
		} else {
			report.Passed = append(report.Passed, "config validation passed")
		}
	}

	// Check 5: Port range.
	if cfg != nil {
		port := config.EffectivePort(cfg)
		if port < 1024 {
			report.Warnings = append(report.Warnings, DoctorIssue{
				Category: "network",
				Message:  fmt.Sprintf("port %d is a privileged port (< 1024)", port),
				Fix:      "Consider using a port >= 1024.",
			})
		} else {
			report.Passed = append(report.Passed, "port is in valid range")
		}
	}

	// Check 6: Credentials directory.
	credDir := filepath.Join(stateDir, "credentials")
	if _, err := os.Stat(credDir); os.IsNotExist(err) {
		report.Warnings = append(report.Warnings, DoctorIssue{
			Category: "filesystem",
			Message:  fmt.Sprintf("credentials directory not found: %s", credDir),
			Fix:      "Run 'nexus init' to create the credentials directory.",
		})
	} else {
		report.Passed = append(report.Passed, "credentials directory exists")
	}

	return report, nil
}
