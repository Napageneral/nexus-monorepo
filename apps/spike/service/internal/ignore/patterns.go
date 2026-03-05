package ignore

// DefaultPatterns returns the baseline ignore patterns used for surveying and
// token-counting "raw domain" code. These should exclude generated artifacts
// and common dependency/build outputs that have little navigational value.
//
// Note: survey's matcher is basename-oriented; directory names work well because
// the walker will SkipDir when encountering that directory.
func DefaultPatterns() []string {
	return []string{
		// Cartographer / VCS artifacts
		".intent",
		".tldr",
		".git",
		".DS_Store",

		// Dependency / build outputs
		"node_modules",
		"vendor",
		"dist",
		"build",
		".next",
		"__pycache__",
		".venv",
		"target", // Rust

		// Common generated/minified assets
		"*.min.js",
		"*.min.css",
		"*.bundle.js",

		// Virtualenvs / caches
		"venv",
		".mypy_cache",
		".pytest_cache",

		// Lockfiles (machine-generated; should not drive plan/map structure)
		"*.lock",
		"uv.lock",
		"pnpm-lock.yaml",
		"package-lock.json",
		"yarn.lock",
		"bun.lockb",
		"poetry.lock",
		"Pipfile.lock",
		"composer.lock",
		"Gemfile.lock",
		"Cargo.lock",

		// Compiled/binary artifacts
		"*.so",
		"*.dylib",
		"*.a",
		"*.o",
		"*.pyc",
		// Large binaries without extensions
		"node",

		// Database files
		"*.db",
		"*.db-wal",
		"*.db-shm",
		"*.db-journal",
		"*.sqlite",
		"*.sqlite3",
		"*.sqlite3-journal",

		// Data blobs
		"*.npz",
		"*.npy",
		"*.dat",
		"*.pkl",
		"*.sav",
		"*.csv",
		"*.pdf",
		"*.html",
		"*.htm",

		// Media
		"*.png",
		"*.jpg",
		"*.jpeg",
		"*.gif",
		"*.ico",
		"*.icns",
		"*.svg",
		"*.ttf",
		"*.node",
		"*.jar",
		"*.webp",
		"*.wav",
		"*.mp3",
		"*.mp4",

		// Archives
		"*.gz",
		"*.bz2",
		"*.xz",
		"*.lzma",
		"*.zip",
		"*.tar",
		"*.tgz",
		"*.7z",
	}
}
