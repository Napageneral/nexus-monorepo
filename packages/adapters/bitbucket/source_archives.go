package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

func persistPullRequestSourceArchive(
	stateDir string,
	provider Provider,
	repo Repository,
	pr PullRequest,
	archive *SourceArchive,
) (*nexadapter.Attachment, error) {
	if archive == nil || (len(archive.Data) == 0 && strings.TrimSpace(archive.LocalPath) == "") {
		return nil, nil
	}
	headCommitSHA := strings.TrimSpace(pr.HeadCommitSHA)
	if headCommitSHA == "" {
		return nil, fmt.Errorf("pull request %s is missing head_commit_sha", pr.ID)
	}
	archiveFormat := strings.TrimSpace(archive.ArchiveFormat)
	if archiveFormat == "" {
		return nil, fmt.Errorf("pull request %s source archive is missing archive format", pr.ID)
	}

	extension := archiveExtension(archiveFormat)
	if extension == "" {
		return nil, fmt.Errorf("unsupported source archive format %q", archiveFormat)
	}

	filename := strings.TrimSpace(archive.Filename)
	if filename == "" {
		filename = fmt.Sprintf("pr-%s-%s%s", pr.ID, headCommitSHA, extension)
	}

	repoSegments := strings.Split(strings.TrimSpace(repo.FullName), "/")
	safeSegments := make([]string, 0, len(repoSegments)+2)
	safeSegments = append(safeSegments, sanitizeArchivePathSegment(provider.ID()))
	for _, segment := range repoSegments {
		safe := sanitizeArchivePathSegment(segment)
		if safe != "" {
			safeSegments = append(safeSegments, safe)
		}
	}
	safeSegments = append(safeSegments, sanitizeArchivePathSegment(pr.ID))

	targetDir := filepath.Join(append([]string{sourceArchivesDir(stateDir)}, safeSegments...)...)
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return nil, fmt.Errorf("create source archive directory: %w", err)
	}
	targetPath := filepath.Join(targetDir, filename)
	size, contentHash, err := persistArchiveData(targetPath, archive)
	if err != nil {
		return nil, err
	}
	return &nexadapter.Attachment{
		ID:          fmt.Sprintf("pr/%s:source_archive", pr.ID),
		Filename:    filename,
		MIMEType:    sourceArchiveMimeType(archive),
		MediaType:   "file",
		Size:        size,
		LocalPath:   targetPath,
		ContentHash: contentHash,
		Metadata: map[string]any{
			"artifact_kind":   "source_archive",
			"entity_type":     "pull_request",
			"forge_provider":  provider.ID(),
			"remote_url":      repo.RemoteURL,
			"head_commit_sha": headCommitSHA,
			"archive_format":  archiveFormat,
			"root_prefix":     strings.TrimSpace(archive.RootPrefix),
		},
	}, nil
}

func persistArchiveData(targetPath string, archive *SourceArchive) (int64, string, error) {
	if archive == nil {
		return 0, "", nil
	}
	if sourcePath := strings.TrimSpace(archive.LocalPath); sourcePath != "" {
		source, err := os.Open(sourcePath)
		if err != nil {
			return 0, "", fmt.Errorf("open source archive: %w", err)
		}
		defer source.Close()
		defer func() { _ = os.Remove(sourcePath) }()

		target, err := os.Create(targetPath)
		if err != nil {
			return 0, "", fmt.Errorf("create source archive: %w", err)
		}
		defer target.Close()

		hasher := sha256.New()
		written, err := io.Copy(io.MultiWriter(target, hasher), source)
		if err != nil {
			return 0, "", fmt.Errorf("copy source archive: %w", err)
		}
		return written, hex.EncodeToString(hasher.Sum(nil)), nil
	}

	if err := os.WriteFile(targetPath, archive.Data, 0o600); err != nil {
		return 0, "", fmt.Errorf("write source archive: %w", err)
	}
	hash := sha256.Sum256(archive.Data)
	return int64(len(archive.Data)), hex.EncodeToString(hash[:]), nil
}

func sanitizeArchivePathSegment(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(value))
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
		case r >= 'A' && r <= 'Z':
			b.WriteRune(r)
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == '_' || r == '.':
			b.WriteRune(r)
		default:
			b.WriteByte('_')
		}
	}
	return strings.Trim(strings.TrimSpace(b.String()), "._")
}

func archiveExtension(format string) string {
	switch strings.TrimSpace(format) {
	case "zip":
		return ".zip"
	case "tar.gz":
		return ".tar.gz"
	case "tar":
		return ".tar"
	default:
		return ""
	}
}

func sourceArchiveMimeType(archive *SourceArchive) string {
	if archive == nil {
		return "application/octet-stream"
	}
	if value := strings.TrimSpace(archive.MIMEType); value != "" {
		return value
	}
	switch strings.TrimSpace(archive.ArchiveFormat) {
	case "zip":
		return "application/zip"
	case "tar.gz":
		return "application/gzip"
	case "tar":
		return "application/x-tar"
	default:
		return "application/octet-stream"
	}
}
