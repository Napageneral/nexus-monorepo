package media

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// MediaFile represents a stored media file.
type MediaFile struct {
	ID        string    `json:"id"`
	Filename  string    `json:"filename"`
	MimeType  string    `json:"mime_type"`
	Size      int64     `json:"size"`
	Path      string    `json:"path"`
	CreatedAt time.Time `json:"created_at"`
}

// Store manages media file storage on the filesystem.
type Store struct {
	baseDir string
	logger  *slog.Logger
}

// NewStore creates a new media Store rooted at baseDir.
func NewStore(baseDir string, logger *slog.Logger) *Store {
	if logger == nil {
		logger = slog.Default()
	}
	return &Store{
		baseDir: baseDir,
		logger:  logger,
	}
}

// Initialize creates the media directories needed for storage.
func (s *Store) Initialize() error {
	dirs := []string{
		s.baseDir,
		filepath.Join(s.baseDir, "files"),
	}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return fmt.Errorf("creating media directory %s: %w", dir, err)
		}
	}
	s.logger.Info("media store initialized", "dir", s.baseDir)
	return nil
}

// Download fetches media from a URL and saves it locally.
func (s *Store) Download(ctx context.Context, url string) (*MediaFile, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("downloading %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("downloading %s: status %d", url, resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response body: %w", err)
	}

	// Extract filename from URL path.
	filename := filepath.Base(url)
	if filename == "" || filename == "." || filename == "/" {
		filename = "download"
	}
	// Remove query strings from filename.
	if idx := strings.IndexByte(filename, '?'); idx >= 0 {
		filename = filename[:idx]
	}

	// Detect MIME type from content and filename.
	mimeType := DetectMIME(data, filename)

	return s.Save(ctx, data, mimeType, filename)
}

// Save stores raw bytes as a media file.
func (s *Store) Save(ctx context.Context, data []byte, mimeType string, filename string) (*MediaFile, error) {
	_ = ctx // reserved for future use

	// Generate ID from content hash.
	hash := sha256.Sum256(data)
	id := hex.EncodeToString(hash[:16])

	// Determine extension.
	ext := filepath.Ext(filename)
	if ext == "" {
		ext = Extension(mimeType)
	}
	if ext == "" {
		ext = ".bin"
	}

	storedName := id + ext
	filePath := filepath.Join(s.baseDir, "files", storedName)

	if err := os.WriteFile(filePath, data, 0o600); err != nil {
		return nil, fmt.Errorf("writing media file: %w", err)
	}

	mf := &MediaFile{
		ID:        id,
		Filename:  filename,
		MimeType:  mimeType,
		Size:      int64(len(data)),
		Path:      filePath,
		CreatedAt: time.Now(),
	}

	s.logger.Debug("media saved", "id", id, "filename", filename, "mime", mimeType, "size", len(data))
	return mf, nil
}

// Get retrieves a media file by ID.
func (s *Store) Get(id string) (*MediaFile, error) {
	filesDir := filepath.Join(s.baseDir, "files")
	entries, err := os.ReadDir(filesDir)
	if err != nil {
		return nil, fmt.Errorf("reading media directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		// Files are stored as <id><ext>.
		if strings.HasPrefix(name, id) {
			info, err := entry.Info()
			if err != nil {
				return nil, fmt.Errorf("getting file info: %w", err)
			}
			filePath := filepath.Join(filesDir, name)
			mimeType := DetectMIME(nil, name)

			return &MediaFile{
				ID:        id,
				Filename:  name,
				MimeType:  mimeType,
				Size:      info.Size(),
				Path:      filePath,
				CreatedAt: info.ModTime(),
			}, nil
		}
	}

	return nil, fmt.Errorf("media file not found: %s", id)
}

// Serve writes a media file to an HTTP response.
func (s *Store) Serve(w http.ResponseWriter, r *http.Request, id string) error {
	mf, err := s.Get(id)
	if err != nil {
		http.NotFound(w, r)
		return err
	}

	w.Header().Set("Content-Type", mf.MimeType)
	http.ServeFile(w, r, mf.Path)
	return nil
}

// Cleanup removes media files older than the given duration.
// Returns the number of files removed.
func (s *Store) Cleanup(ctx context.Context, olderThan time.Duration) (int, error) {
	_ = ctx
	filesDir := filepath.Join(s.baseDir, "files")
	entries, err := os.ReadDir(filesDir)
	if err != nil {
		return 0, fmt.Errorf("reading media directory: %w", err)
	}

	cutoff := time.Now().Add(-olderThan)
	removed := 0

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			filePath := filepath.Join(filesDir, entry.Name())
			if err := os.Remove(filePath); err != nil {
				s.logger.Warn("failed to remove old media file", "path", filePath, "error", err)
				continue
			}
			removed++
		}
	}

	if removed > 0 {
		s.logger.Info("media cleanup completed", "removed", removed)
	}
	return removed, nil
}

// List returns all media files.
func (s *Store) List() ([]MediaFile, error) {
	filesDir := filepath.Join(s.baseDir, "files")
	entries, err := os.ReadDir(filesDir)
	if err != nil {
		return nil, fmt.Errorf("reading media directory: %w", err)
	}

	var files []MediaFile
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		name := entry.Name()
		ext := filepath.Ext(name)
		id := strings.TrimSuffix(name, ext)
		filePath := filepath.Join(filesDir, name)
		mimeType := DetectMIME(nil, name)

		files = append(files, MediaFile{
			ID:        id,
			Filename:  name,
			MimeType:  mimeType,
			Size:      info.Size(),
			Path:      filePath,
			CreatedAt: info.ModTime(),
		})
	}

	// Sort by creation time, newest first.
	sort.Slice(files, func(i, j int) bool {
		return files[i].CreatedAt.After(files[j].CreatedAt)
	})

	return files, nil
}
