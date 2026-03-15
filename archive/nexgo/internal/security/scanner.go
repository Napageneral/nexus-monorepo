package security

import (
	"bufio"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
)

// ScanResult contains the results of scanning a single file.
type ScanResult struct {
	File   string
	Issues []ScanIssue
}

// ScanIssue describes a potentially dangerous pattern found in a file.
type ScanIssue struct {
	Line    int
	Pattern string
	Risk    string
}

// dangerousPatterns defines patterns to check for in skill files.
var dangerousPatterns = []struct {
	re   *regexp.Regexp
	name string
	risk string
}{
	// Shell injection patterns.
	{
		re:   regexp.MustCompile(`\$\(.*\)`),
		name: "shell command substitution",
		risk: "shell injection: command substitution $(...) can execute arbitrary commands",
	},
	{
		re:   regexp.MustCompile("`[^`]+`"),
		name: "backtick command substitution",
		risk: "shell injection: backtick command substitution can execute arbitrary commands",
	},
	{
		re:   regexp.MustCompile(`\beval\b`),
		name: "eval",
		risk: "shell injection: eval can execute arbitrary code",
	},

	// Data exfiltration patterns.
	{
		re:   regexp.MustCompile(`\bcurl\b.*\s(-d|--data|--data-raw|--data-binary|-F|--form)\s`),
		name: "curl with data",
		risk: "data exfiltration: curl sending data to external server",
	},
	{
		re:   regexp.MustCompile(`\bwget\b.*--post`),
		name: "wget with POST",
		risk: "data exfiltration: wget sending POST data to external server",
	},
	{
		re:   regexp.MustCompile(`\bnc\b|\bnetcat\b`),
		name: "netcat",
		risk: "data exfiltration: netcat can be used for unauthorized network connections",
	},

	// Privilege escalation patterns.
	{
		re:   regexp.MustCompile(`\bsudo\b`),
		name: "sudo",
		risk: "privilege escalation: sudo executes commands as root",
	},
	{
		re:   regexp.MustCompile(`\bchmod\b.*\+s`),
		name: "setuid",
		risk: "privilege escalation: setting setuid bit on files",
	},
	{
		re:   regexp.MustCompile(`\bchown\b.*root`),
		name: "chown to root",
		risk: "privilege escalation: changing file ownership to root",
	},

	// Filesystem danger patterns.
	{
		re:   regexp.MustCompile(`\brm\b.*-rf?\s+/`),
		name: "recursive delete root",
		risk: "destructive: recursive deletion starting from root",
	},
	{
		re:   regexp.MustCompile(`\b(mkfifo|mknod)\b`),
		name: "special files",
		risk: "suspicious: creating special filesystem entries",
	},
}

// ScanSkillFile checks a file for dangerous patterns.
func ScanSkillFile(path string) (*ScanResult, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("opening file %s: %w", path, err)
	}
	defer f.Close()

	result := &ScanResult{
		File: path,
	}

	scanner := bufio.NewScanner(f)
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		line := scanner.Text()

		for _, p := range dangerousPatterns {
			if p.re.MatchString(line) {
				result.Issues = append(result.Issues, ScanIssue{
					Line:    lineNum,
					Pattern: p.name,
					Risk:    p.risk,
				})
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scanning file %s: %w", path, err)
	}

	return result, nil
}

// ScanDirectory scans all files in a directory for dangerous patterns.
func ScanDirectory(dir string) ([]ScanResult, error) {
	var results []ScanResult

	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // Skip entries we can't read.
		}
		if d.IsDir() {
			return nil
		}

		result, err := ScanSkillFile(path)
		if err != nil {
			return nil // Skip files we can't scan.
		}

		if len(result.Issues) > 0 {
			results = append(results, *result)
		}
		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("walking directory %s: %w", dir, err)
	}

	return results, nil
}
