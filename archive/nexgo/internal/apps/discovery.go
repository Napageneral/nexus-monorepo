package apps

import (
	"os"
	"path/filepath"
)

// manifestFilename is the expected name for app manifest files.
const manifestFilename = "app.nexus.json"

// Discover scans appsDir for directories containing app.nexus.json,
// parses each manifest, validates them, and returns all valid ones.
// Invalid manifests are skipped with a best-effort approach.
func Discover(appsDir string) ([]AppManifest, error) {
	entries, err := os.ReadDir(appsDir)
	if err != nil {
		return nil, err
	}

	var manifests []AppManifest
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		manifestPath := filepath.Join(appsDir, entry.Name(), manifestFilename)
		if _, err := os.Stat(manifestPath); os.IsNotExist(err) {
			continue
		}

		m, err := ParseManifest(manifestPath)
		if err != nil {
			// Skip invalid manifests.
			continue
		}

		errs := ValidateManifest(m)
		if len(errs) > 0 {
			// Skip manifests with validation errors.
			continue
		}

		manifests = append(manifests, *m)
	}

	return manifests, nil
}
