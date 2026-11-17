package main

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

var normalizedTime = time.Date(1980, time.January, 1, 0, 0, 0, 0, time.UTC)

func main() {
	if len(os.Args) != 3 {
		fatalf("usage: build-deterministic-archive <source-directory> <archive-path>")
	}
	sourceRoot, err := filepath.Abs(os.Args[1])
	if err != nil {
		fatalf("resolve source directory: %v", err)
	}
	archivePath, err := filepath.Abs(os.Args[2])
	if err != nil {
		fatalf("resolve archive path: %v", err)
	}

	entries := make([]string, 0)
	err = filepath.WalkDir(sourceRoot, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == sourceRoot || entry.IsDir() {
			return nil
		}
		info, infoErr := entry.Info()
		if infoErr != nil {
			return infoErr
		}
		if !info.Mode().IsRegular() && info.Mode()&os.ModeSymlink == 0 {
			return fmt.Errorf("unsupported archive entry %s", path)
		}
		relative, relErr := filepath.Rel(sourceRoot, path)
		if relErr != nil {
			return relErr
		}
		entries = append(entries, filepath.ToSlash(relative))
		return nil
	})
	if err != nil {
		fatalf("inventory archive source: %v", err)
	}
	sort.Strings(entries)

	output, err := os.OpenFile(archivePath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		fatalf("create archive: %v", err)
	}
	removeOutput := true
	defer func() {
		_ = output.Close()
		if removeOutput {
			_ = os.Remove(archivePath)
		}
	}()

	zipWriter := gzip.NewWriter(output)
	zipWriter.Header.ModTime = time.Unix(0, 0).UTC()
	zipWriter.Header.OS = 255
	tarWriter := tar.NewWriter(zipWriter)
	for _, relative := range entries {
		if err := addEntry(tarWriter, sourceRoot, relative); err != nil {
			fatalf("add %s: %v", relative, err)
		}
	}
	if err := tarWriter.Close(); err != nil {
		fatalf("finalize tar stream: %v", err)
	}
	if err := zipWriter.Close(); err != nil {
		fatalf("finalize gzip stream: %v", err)
	}
	if err := output.Sync(); err != nil {
		fatalf("sync archive: %v", err)
	}
	if err := output.Close(); err != nil {
		fatalf("close archive: %v", err)
	}
	removeOutput = false
}

func addEntry(writer *tar.Writer, sourceRoot string, relative string) error {
	path := filepath.Join(sourceRoot, filepath.FromSlash(relative))
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	header := &tar.Header{
		Name:       relative,
		Mode:       normalizedMode(relative, info),
		ModTime:    normalizedTime,
		AccessTime: time.Time{},
		ChangeTime: time.Time{},
		Uid:        0,
		Gid:        0,
		Uname:      "root",
		Gname:      "root",
		Format:     tar.FormatUSTAR,
	}
	if info.Mode()&os.ModeSymlink != 0 {
		header.Typeflag = tar.TypeSymlink
		header.Linkname, err = os.Readlink(path)
		if err != nil {
			return err
		}
		return writer.WriteHeader(header)
	}
	header.Typeflag = tar.TypeReg
	header.Size = info.Size()
	if err := writer.WriteHeader(header); err != nil {
		return err
	}
	input, err := os.Open(path)
	if err != nil {
		return err
	}
	defer input.Close()
	_, err = io.CopyN(writer, input, info.Size())
	return err
}

func normalizedMode(relative string, info os.FileInfo) int64 {
	if info.Mode()&os.ModeSymlink != 0 {
		return 0o777
	}
	if strings.HasPrefix(relative, "bin/") ||
		(strings.HasPrefix(relative, "scripts/") && strings.HasSuffix(relative, ".sh")) {
		return 0o755
	}
	return 0o644
}

func fatalf(format string, values ...any) {
	_, _ = fmt.Fprintf(os.Stderr, format+"\n", values...)
	os.Exit(1)
}
