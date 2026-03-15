package security

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/Napageneral/nexus/internal/config"
)

// FixResult contains the results of auto-fix operations.
type FixResult struct {
	Fixed   []string
	Skipped []string
	Errors  []string
}

// AutoFix corrects common security issues in the state directory.
// It fixes file permissions: 0700 for directories, 0600 for files.
func AutoFix(ctx context.Context, stateDir string, cfg *config.Config) (*FixResult, error) {
	_ = ctx
	_ = cfg

	result := &FixResult{}

	// Check if state directory exists.
	if _, err := os.Stat(stateDir); os.IsNotExist(err) {
		result.Skipped = append(result.Skipped, fmt.Sprintf("state directory does not exist: %s", stateDir))
		return result, nil
	}

	// Fix state directory permissions.
	if err := fixDirPermissions(stateDir, result); err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("fixing state directory: %v", err))
	}

	// Walk the state directory and fix all file/directory permissions.
	err := filepath.WalkDir(stateDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("walking %s: %v", path, err))
			return nil
		}

		if d.IsDir() {
			return fixDirPermissions(path, result)
		}
		return fixFilePermissions(path, result)
	})
	if err != nil {
		return result, fmt.Errorf("walking state directory: %w", err)
	}

	return result, nil
}

// fixDirPermissions sets directory permissions to 0700 if they are too permissive.
func fixDirPermissions(path string, result *FixResult) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}

	mode := info.Mode().Perm()
	if mode&0o077 != 0 {
		if err := os.Chmod(path, 0o700); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("chmod %s: %v", path, err))
			return nil
		}
		result.Fixed = append(result.Fixed, fmt.Sprintf("set directory permissions to 700: %s", path))
	}
	return nil
}

// fixFilePermissions sets file permissions to 0600 if they are too permissive.
func fixFilePermissions(path string, result *FixResult) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}

	mode := info.Mode().Perm()
	if mode&0o077 != 0 {
		if err := os.Chmod(path, 0o600); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("chmod %s: %v", path, err))
			return nil
		}
		result.Fixed = append(result.Fixed, fmt.Sprintf("set file permissions to 600: %s", path))
	}
	return nil
}
