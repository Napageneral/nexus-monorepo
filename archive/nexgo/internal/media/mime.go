// Package media handles media storage, processing, and understanding.
package media

import (
	"net/http"
	"path/filepath"
	"strings"
)

// mimeExtensions maps MIME types to file extensions.
var mimeExtensions = map[string]string{
	"image/jpeg":      ".jpg",
	"image/png":       ".png",
	"image/gif":       ".gif",
	"image/webp":      ".webp",
	"image/svg+xml":   ".svg",
	"image/bmp":       ".bmp",
	"image/tiff":      ".tiff",
	"audio/mpeg":      ".mp3",
	"audio/ogg":       ".ogg",
	"audio/wav":       ".wav",
	"audio/webm":      ".weba",
	"audio/flac":      ".flac",
	"audio/aac":       ".aac",
	"video/mp4":       ".mp4",
	"video/webm":      ".webm",
	"video/ogg":       ".ogv",
	"video/quicktime": ".mov",
	"video/x-msvideo": ".avi",
	"application/pdf": ".pdf",
	"text/plain":      ".txt",
	"text/html":       ".html",
	"application/json": ".json",
}

// extMIME maps file extensions to MIME types.
var extMIME = map[string]string{
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".png":  "image/png",
	".gif":  "image/gif",
	".webp": "image/webp",
	".svg":  "image/svg+xml",
	".bmp":  "image/bmp",
	".tiff": "image/tiff",
	".tif":  "image/tiff",
	".mp3":  "audio/mpeg",
	".ogg":  "audio/ogg",
	".wav":  "audio/wav",
	".weba": "audio/webm",
	".flac": "audio/flac",
	".aac":  "audio/aac",
	".mp4":  "video/mp4",
	".webm": "video/webm",
	".ogv":  "video/ogg",
	".mov":  "video/quicktime",
	".avi":  "video/x-msvideo",
	".pdf":  "application/pdf",
	".txt":  "text/plain",
	".html": "text/html",
	".htm":  "text/html",
	".json": "application/json",
}

// DetectMIME detects the MIME type of data using content sniffing and filename extension.
// It uses net/http.DetectContentType for binary detection and falls back to
// the file extension if the result is too generic.
func DetectMIME(data []byte, filename string) string {
	// Try content-based detection first.
	detected := http.DetectContentType(data)

	// If detection returned a specific type (not application/octet-stream),
	// use it unless the extension gives us something more specific.
	if detected != "application/octet-stream" && detected != "text/plain; charset=utf-8" {
		// Normalize: http.DetectContentType may return e.g. "text/html; charset=utf-8"
		// For our purposes, strip parameters for matching.
		base := strings.SplitN(detected, ";", 2)[0]
		base = strings.TrimSpace(base)
		return base
	}

	// Fall back to extension-based detection.
	if filename != "" {
		ext := strings.ToLower(filepath.Ext(filename))
		if mime, ok := extMIME[ext]; ok {
			return mime
		}
	}

	// Strip charset from text/plain detection if data is indeed text.
	if strings.HasPrefix(detected, "text/plain") {
		return "text/plain"
	}

	return "application/octet-stream"
}

// IsImage returns true if the MIME type represents an image.
func IsImage(mimeType string) bool {
	return strings.HasPrefix(mimeType, "image/")
}

// IsAudio returns true if the MIME type represents audio.
func IsAudio(mimeType string) bool {
	return strings.HasPrefix(mimeType, "audio/")
}

// IsVideo returns true if the MIME type represents video.
func IsVideo(mimeType string) bool {
	return strings.HasPrefix(mimeType, "video/")
}

// Extension returns the file extension for a MIME type.
// Returns an empty string if the MIME type is unknown.
func Extension(mimeType string) string {
	if ext, ok := mimeExtensions[mimeType]; ok {
		return ext
	}
	return ""
}
