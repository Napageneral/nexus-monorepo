package media

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// createTestPNG creates a minimal valid PNG image of the given dimensions.
func createTestPNG(width, height int) []byte {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y % 256), B: 128, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		panic(fmt.Sprintf("createTestPNG: %v", err))
	}
	return buf.Bytes()
}

// createTestJPEG creates a minimal valid JPEG image of the given dimensions.
func createTestJPEG(width, height int) []byte {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: 200, G: 100, B: 50, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}); err != nil {
		panic(fmt.Sprintf("createTestJPEG: %v", err))
	}
	return buf.Bytes()
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
}

func TestStoreInitialize(t *testing.T) {
	tmpDir := t.TempDir()
	mediaDir := filepath.Join(tmpDir, "media")

	store := NewStore(mediaDir, testLogger())
	if err := store.Initialize(); err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}

	// Verify directories were created.
	info, err := os.Stat(mediaDir)
	if err != nil {
		t.Fatalf("media dir not created: %v", err)
	}
	if !info.IsDir() {
		t.Fatal("media path is not a directory")
	}

	filesDir := filepath.Join(mediaDir, "files")
	info, err = os.Stat(filesDir)
	if err != nil {
		t.Fatalf("files dir not created: %v", err)
	}
	if !info.IsDir() {
		t.Fatal("files path is not a directory")
	}
}

func TestStoreSave(t *testing.T) {
	tmpDir := t.TempDir()
	store := NewStore(tmpDir, testLogger())
	if err := store.Initialize(); err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}

	data := []byte("hello world")
	mf, err := store.Save(context.Background(), data, "text/plain", "hello.txt")
	if err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	if mf.ID == "" {
		t.Fatal("expected non-empty ID")
	}
	if mf.Filename != "hello.txt" {
		t.Fatalf("expected filename 'hello.txt', got %q", mf.Filename)
	}
	if mf.MimeType != "text/plain" {
		t.Fatalf("expected MIME 'text/plain', got %q", mf.MimeType)
	}
	if mf.Size != int64(len(data)) {
		t.Fatalf("expected size %d, got %d", len(data), mf.Size)
	}

	// Verify file exists on disk.
	if _, err := os.Stat(mf.Path); err != nil {
		t.Fatalf("saved file does not exist: %v", err)
	}

	// Verify file content.
	content, err := os.ReadFile(mf.Path)
	if err != nil {
		t.Fatalf("reading saved file: %v", err)
	}
	if !bytes.Equal(content, data) {
		t.Fatal("saved file content does not match")
	}
}

func TestStoreGet(t *testing.T) {
	tmpDir := t.TempDir()
	store := NewStore(tmpDir, testLogger())
	if err := store.Initialize(); err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}

	data := []byte("test content for get")
	saved, err := store.Save(context.Background(), data, "text/plain", "test.txt")
	if err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	got, err := store.Get(saved.ID)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}

	if got.ID != saved.ID {
		t.Fatalf("expected ID %q, got %q", saved.ID, got.ID)
	}
	if got.Size != saved.Size {
		t.Fatalf("expected size %d, got %d", saved.Size, got.Size)
	}
}

func TestStoreGetNotFound(t *testing.T) {
	tmpDir := t.TempDir()
	store := NewStore(tmpDir, testLogger())
	if err := store.Initialize(); err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}

	_, err := store.Get("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent ID")
	}
}

func TestStoreServe(t *testing.T) {
	tmpDir := t.TempDir()
	store := NewStore(tmpDir, testLogger())
	if err := store.Initialize(); err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}

	data := createTestPNG(10, 10)
	saved, err := store.Save(context.Background(), data, "image/png", "test.png")
	if err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	// Create test HTTP request/response.
	req := httptest.NewRequest(http.MethodGet, "/media/"+saved.ID, nil)
	w := httptest.NewRecorder()

	if err := store.Serve(w, req, saved.ID); err != nil {
		t.Fatalf("Serve failed: %v", err)
	}

	resp := w.Result()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	ct := resp.Header.Get("Content-Type")
	if ct != "image/png" {
		t.Fatalf("expected Content-Type 'image/png', got %q", ct)
	}
}

func TestStoreServeNotFound(t *testing.T) {
	tmpDir := t.TempDir()
	store := NewStore(tmpDir, testLogger())
	if err := store.Initialize(); err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/media/nonexistent", nil)
	w := httptest.NewRecorder()

	err := store.Serve(w, req, "nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent media")
	}
}

func TestStoreDownload(t *testing.T) {
	// Set up a test HTTP server that serves a PNG image.
	pngData := createTestPNG(5, 5)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		w.Write(pngData)
	}))
	defer server.Close()

	tmpDir := t.TempDir()
	store := NewStore(tmpDir, testLogger())
	if err := store.Initialize(); err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}

	mf, err := store.Download(context.Background(), server.URL+"/test.png")
	if err != nil {
		t.Fatalf("Download failed: %v", err)
	}

	if mf.ID == "" {
		t.Fatal("expected non-empty ID")
	}
	if mf.Size != int64(len(pngData)) {
		t.Fatalf("expected size %d, got %d", len(pngData), mf.Size)
	}

	// Verify file exists.
	if _, err := os.Stat(mf.Path); err != nil {
		t.Fatalf("downloaded file does not exist: %v", err)
	}
}

func TestStoreDownloadNotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer server.Close()

	tmpDir := t.TempDir()
	store := NewStore(tmpDir, testLogger())
	if err := store.Initialize(); err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}

	_, err := store.Download(context.Background(), server.URL+"/missing.png")
	if err == nil {
		t.Fatal("expected error for 404 response")
	}
}

func TestStoreCleanup(t *testing.T) {
	tmpDir := t.TempDir()
	store := NewStore(tmpDir, testLogger())
	if err := store.Initialize(); err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}

	// Save a file.
	data := []byte("old file")
	mf, err := store.Save(context.Background(), data, "text/plain", "old.txt")
	if err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	// Set the file's modification time to 2 hours ago.
	oldTime := time.Now().Add(-2 * time.Hour)
	if err := os.Chtimes(mf.Path, oldTime, oldTime); err != nil {
		t.Fatalf("Chtimes failed: %v", err)
	}

	// Save a recent file.
	_, err = store.Save(context.Background(), []byte("new file"), "text/plain", "new.txt")
	if err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	// Cleanup files older than 1 hour.
	removed, err := store.Cleanup(context.Background(), 1*time.Hour)
	if err != nil {
		t.Fatalf("Cleanup failed: %v", err)
	}

	if removed != 1 {
		t.Fatalf("expected 1 file removed, got %d", removed)
	}

	// The old file should be gone.
	if _, err := os.Stat(mf.Path); !os.IsNotExist(err) {
		t.Fatal("old file should have been removed")
	}

	// The new file should still exist.
	files, err := store.List()
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(files) != 1 {
		t.Fatalf("expected 1 file remaining, got %d", len(files))
	}
}

func TestStoreList(t *testing.T) {
	tmpDir := t.TempDir()
	store := NewStore(tmpDir, testLogger())
	if err := store.Initialize(); err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}

	// Empty list initially.
	files, err := store.List()
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(files) != 0 {
		t.Fatalf("expected 0 files, got %d", len(files))
	}

	// Save multiple files.
	for i := 0; i < 3; i++ {
		data := []byte(fmt.Sprintf("file content %d", i))
		_, err := store.Save(context.Background(), data, "text/plain", fmt.Sprintf("file%d.txt", i))
		if err != nil {
			t.Fatalf("Save %d failed: %v", i, err)
		}
	}

	files, err = store.List()
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(files) != 3 {
		t.Fatalf("expected 3 files, got %d", len(files))
	}
}

// --- MIME tests ---

func TestDetectMIME(t *testing.T) {
	tests := []struct {
		name     string
		data     []byte
		filename string
		want     string
	}{
		{
			name:     "PNG from content",
			data:     createTestPNG(1, 1),
			filename: "",
			want:     "image/png",
		},
		{
			name:     "JPEG from content",
			data:     createTestJPEG(1, 1),
			filename: "",
			want:     "image/jpeg",
		},
		{
			name:     "text from content",
			data:     []byte("Hello, world!\n"),
			filename: "",
			want:     "text/plain",
		},
		{
			name:     "MP3 from extension",
			data:     []byte{0x00, 0x00, 0x00},
			filename: "song.mp3",
			want:     "audio/mpeg",
		},
		{
			name:     "JSON from extension",
			data:     []byte{0x00},
			filename: "data.json",
			want:     "application/json",
		},
		{
			name:     "unknown binary",
			data:     []byte{0x00, 0x01, 0x02, 0x03},
			filename: "",
			want:     "application/octet-stream",
		},
		{
			name:     "HTML content",
			data:     []byte("<html><body>Hello</body></html>"),
			filename: "",
			want:     "text/html",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := DetectMIME(tt.data, tt.filename)
			if got != tt.want {
				t.Fatalf("DetectMIME(%q, %q) = %q, want %q", tt.data[:min(len(tt.data), 10)], tt.filename, got, tt.want)
			}
		})
	}
}

func TestMIMEHelpers(t *testing.T) {
	// IsImage
	if !IsImage("image/png") {
		t.Fatal("expected image/png to be image")
	}
	if !IsImage("image/jpeg") {
		t.Fatal("expected image/jpeg to be image")
	}
	if IsImage("text/plain") {
		t.Fatal("expected text/plain not to be image")
	}

	// IsAudio
	if !IsAudio("audio/mpeg") {
		t.Fatal("expected audio/mpeg to be audio")
	}
	if IsAudio("image/png") {
		t.Fatal("expected image/png not to be audio")
	}

	// IsVideo
	if !IsVideo("video/mp4") {
		t.Fatal("expected video/mp4 to be video")
	}
	if IsVideo("audio/mpeg") {
		t.Fatal("expected audio/mpeg not to be video")
	}

	// Extension
	if ext := Extension("image/jpeg"); ext != ".jpg" {
		t.Fatalf("expected .jpg for image/jpeg, got %q", ext)
	}
	if ext := Extension("image/png"); ext != ".png" {
		t.Fatalf("expected .png for image/png, got %q", ext)
	}
	if ext := Extension("audio/mpeg"); ext != ".mp3" {
		t.Fatalf("expected .mp3 for audio/mpeg, got %q", ext)
	}
	if ext := Extension("unknown/type"); ext != "" {
		t.Fatalf("expected empty string for unknown type, got %q", ext)
	}
}

// --- Image processing tests ---

func TestResizeImage(t *testing.T) {
	// Create a 100x80 PNG image.
	data := createTestPNG(100, 80)

	// Resize to fit within 50x50.
	resized, err := ResizeImage(data, 50, 50)
	if err != nil {
		t.Fatalf("ResizeImage failed: %v", err)
	}

	meta, err := ExtractImageMetadata(resized)
	if err != nil {
		t.Fatalf("ExtractImageMetadata failed: %v", err)
	}

	// Should maintain aspect ratio: 100x80 -> 50x40.
	if meta.Width != 50 {
		t.Fatalf("expected width 50, got %d", meta.Width)
	}
	if meta.Height != 40 {
		t.Fatalf("expected height 40, got %d", meta.Height)
	}
}

func TestResizeImageAlreadySmall(t *testing.T) {
	// Create a 10x10 PNG image.
	data := createTestPNG(10, 10)

	// Resize to fit within 50x50 - should return original.
	resized, err := ResizeImage(data, 50, 50)
	if err != nil {
		t.Fatalf("ResizeImage failed: %v", err)
	}

	if !bytes.Equal(resized, data) {
		t.Fatal("expected original data when image is already small enough")
	}
}

func TestConvertToJPEG(t *testing.T) {
	// Create a PNG image.
	pngData := createTestPNG(20, 20)

	// Convert to JPEG.
	jpegData, err := ConvertToJPEG(pngData, 80)
	if err != nil {
		t.Fatalf("ConvertToJPEG failed: %v", err)
	}

	// Verify the result is a valid JPEG.
	meta, err := ExtractImageMetadata(jpegData)
	if err != nil {
		t.Fatalf("ExtractImageMetadata failed: %v", err)
	}

	if meta.Format != "jpeg" {
		t.Fatalf("expected format 'jpeg', got %q", meta.Format)
	}
	if meta.Width != 20 {
		t.Fatalf("expected width 20, got %d", meta.Width)
	}
	if meta.Height != 20 {
		t.Fatalf("expected height 20, got %d", meta.Height)
	}
}

func TestExtractImageMetadata(t *testing.T) {
	// Test with PNG.
	pngData := createTestPNG(64, 32)
	meta, err := ExtractImageMetadata(pngData)
	if err != nil {
		t.Fatalf("ExtractImageMetadata PNG failed: %v", err)
	}
	if meta.Width != 64 {
		t.Fatalf("expected width 64, got %d", meta.Width)
	}
	if meta.Height != 32 {
		t.Fatalf("expected height 32, got %d", meta.Height)
	}
	if meta.Format != "png" {
		t.Fatalf("expected format 'png', got %q", meta.Format)
	}

	// Test with JPEG.
	jpegData := createTestJPEG(48, 24)
	meta, err = ExtractImageMetadata(jpegData)
	if err != nil {
		t.Fatalf("ExtractImageMetadata JPEG failed: %v", err)
	}
	if meta.Width != 48 {
		t.Fatalf("expected width 48, got %d", meta.Width)
	}
	if meta.Height != 24 {
		t.Fatalf("expected height 24, got %d", meta.Height)
	}
	if meta.Format != "jpeg" {
		t.Fatalf("expected format 'jpeg', got %q", meta.Format)
	}

	// Test with invalid data.
	_, err = ExtractImageMetadata([]byte("not an image"))
	if err == nil {
		t.Fatal("expected error for invalid image data")
	}
}

// --- Understanding service tests ---

func TestUnderstandingService(t *testing.T) {
	svc := NewUnderstandingService(testLogger())

	// With no providers, should return empty results.
	mf := &MediaFile{
		ID:       "test",
		MimeType: "image/png",
	}

	results, err := svc.Process(context.Background(), mf)
	if err != nil {
		t.Fatalf("Process failed: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("expected 0 results, got %d", len(results))
	}
}

func TestUnderstandingServiceWithProvider(t *testing.T) {
	svc := NewUnderstandingService(testLogger())
	svc.Register(&mockProvider{
		name:     "mock",
		supports: true,
		result: &Interpretation{
			Provider:    "mock",
			Description: "mock description",
			Text:        "mock text",
		},
	})

	mf := &MediaFile{
		ID:       "test",
		MimeType: "image/png",
	}

	results, err := svc.Process(context.Background(), mf)
	if err != nil {
		t.Fatalf("Process failed: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].Provider != "mock" {
		t.Fatalf("expected provider 'mock', got %q", results[0].Provider)
	}
	if results[0].Description != "mock description" {
		t.Fatalf("expected description 'mock description', got %q", results[0].Description)
	}
}

// mockProvider implements UnderstandingProvider for testing.
type mockProvider struct {
	name     string
	supports bool
	result   *Interpretation
}

func (m *mockProvider) Name() string { return m.name }

func (m *mockProvider) Process(_ context.Context, _ *MediaFile) (*Interpretation, error) {
	return m.result, nil
}

func (m *mockProvider) Supports(_ string) bool { return m.supports }

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
