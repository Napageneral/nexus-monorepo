package git

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// FileCommitInfo contains commit information for a file
type FileCommitInfo struct {
	Path       string
	LastCommit string
	LastDate   time.Time
}

// CommitInfo contains commit hash, subject, and date
type CommitInfo struct {
	Hash    string
	Subject string
	Date    time.Time
}

// GetLastCommit returns the last commit touching a file
func GetLastCommit(repoPath, filePath string) (string, time.Time, error) {
	absRepo, err := filepath.Abs(repoPath)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("failed to resolve repo path: %w", err)
	}

	// Find git root
	gitRoot, err := findGitRoot(absRepo)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("not a git repository: %w", err)
	}

	// Get relative path from git root
	relPath, err := filepath.Rel(gitRoot, filePath)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("failed to get relative path: %w", err)
	}

	// Run git log -1 --format="%H %aI" -- <file>
	cmd := exec.Command("git", "log", "-1", "--format=%H %aI", "--", relPath)
	cmd.Dir = gitRoot
	output, err := cmd.Output()
	if err != nil {
		// File might not be tracked
		if exitErr, ok := err.(*exec.ExitError); ok && exitErr.ExitCode() == 128 {
			return "", time.Time{}, fmt.Errorf("file not tracked in git: %w", err)
		}
		return "", time.Time{}, fmt.Errorf("git log failed: %w", err)
	}

	parts := strings.Fields(string(output))
	if len(parts) < 2 {
		return "", time.Time{}, fmt.Errorf("unexpected git log output format")
	}

	commitHash := parts[0]
	dateStr := parts[1]

	commitDate, err := time.Parse(time.RFC3339, dateStr)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("failed to parse commit date: %w", err)
	}

	return commitHash, commitDate, nil
}

// CountCommitsSince returns number of commits since baseCommit for path
func CountCommitsSince(repoPath, baseCommit, domainPath string) (int, error) {
	gitRoot, err := findGitRoot(repoPath)
	if err != nil {
		return 0, fmt.Errorf("not a git repository: %w", err)
	}

	relPath, err := filepath.Rel(gitRoot, domainPath)
	if err != nil {
		return 0, fmt.Errorf("failed to get relative path: %w", err)
	}

	// git rev-list --count <baseCommit>..HEAD -- <path>
	cmd := exec.Command("git", "rev-list", "--count", fmt.Sprintf("%s..HEAD", baseCommit), "--", relPath)
	cmd.Dir = gitRoot
	output, err := cmd.Output()
	if err != nil {
		return 0, fmt.Errorf("git rev-list failed: %w", err)
	}

	count := 0
	fmt.Sscanf(strings.TrimSpace(string(output)), "%d", &count)
	return count, nil
}

// GetModifiedFiles returns files modified (not added) since baseCommit
func GetModifiedFiles(repoPath, baseCommit, domainPath string) ([]string, error) {
	gitRoot, err := findGitRoot(repoPath)
	if err != nil {
		return nil, fmt.Errorf("not a git repository: %w", err)
	}

	relPath, err := filepath.Rel(gitRoot, domainPath)
	if err != nil {
		return nil, fmt.Errorf("failed to get relative path: %w", err)
	}

	// git diff --name-only --diff-filter=M <baseCommit> -- <path>
	cmd := exec.Command("git", "diff", "--name-only", "--diff-filter=M", baseCommit, "--", relPath)
	cmd.Dir = gitRoot
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git diff failed: %w", err)
	}

	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	var files []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// Convert to absolute path
		absFile := filepath.Join(gitRoot, line)
		files = append(files, absFile)
	}

	return files, nil
}

// GetAddedFiles returns files added since baseCommit (blindspots)
func GetAddedFiles(repoPath, baseCommit, domainPath string) ([]string, error) {
	gitRoot, err := findGitRoot(repoPath)
	if err != nil {
		return nil, fmt.Errorf("not a git repository: %w", err)
	}

	relPath, err := filepath.Rel(gitRoot, domainPath)
	if err != nil {
		return nil, fmt.Errorf("failed to get relative path: %w", err)
	}

	// git diff --name-only --diff-filter=A <baseCommit> -- <path>
	cmd := exec.Command("git", "diff", "--name-only", "--diff-filter=A", baseCommit, "--", relPath)
	cmd.Dir = gitRoot
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git diff failed: %w", err)
	}

	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	var files []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		absFile := filepath.Join(gitRoot, line)
		files = append(files, absFile)
	}

	return files, nil
}

// GetCommitsSince returns commit info since baseCommit
func GetCommitsSince(repoPath, baseCommit, domainPath string) ([]CommitInfo, error) {
	gitRoot, err := findGitRoot(repoPath)
	if err != nil {
		return nil, fmt.Errorf("not a git repository: %w", err)
	}

	relPath, err := filepath.Rel(gitRoot, domainPath)
	if err != nil {
		return nil, fmt.Errorf("failed to get relative path: %w", err)
	}

	// git log --format="%H|%s|%aI" <baseCommit>..HEAD -- <path>
	cmd := exec.Command("git", "log", "--format=%H|%s|%aI", fmt.Sprintf("%s..HEAD", baseCommit), "--", relPath)
	cmd.Dir = gitRoot
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git log failed: %w", err)
	}

	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	var commits []CommitInfo
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, "|")
		if len(parts) < 3 {
			continue
		}
		hash := parts[0]
		subject := parts[1]
		dateStr := parts[2]

		commitDate, err := time.Parse(time.RFC3339, dateStr)
		if err != nil {
			continue // Skip malformed dates
		}

		commits = append(commits, CommitInfo{
			Hash:    hash,
			Subject: subject,
			Date:    commitDate,
		})
	}

	return commits, nil
}

// IsGitRepo checks if path is inside a git repository
func IsGitRepo(path string) bool {
	_, err := findGitRoot(path)
	return err == nil
}

// GetFilesInCommit returns the list of files changed in a specific commit
func GetFilesInCommit(repoPath, commitHash string) ([]string, error) {
	gitRoot, err := findGitRoot(repoPath)
	if err != nil {
		return nil, fmt.Errorf("not a git repository: %w", err)
	}

	// git diff-tree --no-commit-id --name-only -r <commit>
	cmd := exec.Command("git", "diff-tree", "--no-commit-id", "--name-only", "-r", commitHash)
	cmd.Dir = gitRoot
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git diff-tree failed: %w", err)
	}

	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	var files []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// Convert to absolute path
		absFile := filepath.Join(gitRoot, line)
		files = append(files, absFile)
	}

	return files, nil
}

// GetCommitHashesSince returns just the commit hashes since baseCommit for a path
func GetCommitHashesSince(repoPath, baseCommit, domainPath string) ([]string, error) {
	gitRoot, err := findGitRoot(repoPath)
	if err != nil {
		return nil, fmt.Errorf("not a git repository: %w", err)
	}

	relPath, err := filepath.Rel(gitRoot, domainPath)
	if err != nil {
		return nil, fmt.Errorf("failed to get relative path: %w", err)
	}

	// git rev-list <baseCommit>..HEAD -- <path>
	cmd := exec.Command("git", "rev-list", fmt.Sprintf("%s..HEAD", baseCommit), "--", relPath)
	cmd.Dir = gitRoot
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git rev-list failed: %w", err)
	}

	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	var hashes []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		hashes = append(hashes, line)
	}

	return hashes, nil
}

// findGitRoot walks up from path to find .git directory
func findGitRoot(startPath string) (string, error) {
	absPath, err := filepath.Abs(startPath)
	if err != nil {
		return "", err
	}

	current := absPath
	for {
		gitDir := filepath.Join(current, ".git")
		if info, err := os.Stat(gitDir); err == nil && info.IsDir() {
			return current, nil
		}

		parent := filepath.Dir(current)
		if parent == current {
			// Reached filesystem root
			break
		}
		current = parent
	}

	return "", fmt.Errorf("no .git directory found")
}
