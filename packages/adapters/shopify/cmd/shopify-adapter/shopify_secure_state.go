package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"syscall"
)

func secureShopifyStateDirectory(path string) error {
	if err := os.MkdirAll(path, 0o700); err != nil {
		return err
	}
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return errors.New("Shopify state directory metadata is unsafe")
	}
	if info.Mode().Perm() != 0o700 {
		if err := os.Chmod(path, 0o700); err != nil {
			return err
		}
		info, err = os.Lstat(path)
		if err != nil || !info.IsDir() || info.Mode().Perm() != 0o700 {
			return errors.New("Shopify state directory permissions are unsafe")
		}
	}
	return nil
}

func openShopifyPrivateFile(path string, flags int, create bool) (*os.File, error) {
	sysFlags := flags | syscall.O_CLOEXEC | syscall.O_NOFOLLOW
	if create {
		sysFlags |= syscall.O_CREAT
	}
	fd, err := syscall.Open(path, sysFlags, 0o600)
	if err != nil {
		return nil, err
	}
	file := os.NewFile(uintptr(fd), path)
	if file == nil {
		_ = syscall.Close(fd)
		return nil, errors.New("open Shopify private state file")
	}
	info, statErr := file.Stat()
	linkInfo, linkErr := os.Lstat(path)
	if statErr != nil || linkErr != nil || !info.Mode().IsRegular() || !linkInfo.Mode().IsRegular() || !os.SameFile(info, linkInfo) || info.Mode().Perm() != 0o600 {
		_ = file.Close()
		return nil, errors.New("Shopify private state file metadata is unsafe")
	}
	return file, nil
}

func readShopifyPrivateFile(path string) ([]byte, error) {
	file, err := openShopifyPrivateFile(path, syscall.O_RDONLY, false)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	return io.ReadAll(file)
}

func writeShopifyPrivateFileAtomic(path string, raw []byte) error {
	dirPath := filepath.Dir(path)
	if err := secureShopifyStateDirectory(dirPath); err != nil {
		return err
	}
	temp, err := os.CreateTemp(dirPath, ".shopify-state-*")
	if err != nil {
		return err
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath) //nolint:errcheck
	if err := temp.Chmod(0o600); err != nil {
		_ = temp.Close()
		return err
	}
	if _, err := temp.Write(raw); err != nil {
		_ = temp.Close()
		return err
	}
	if err := temp.Sync(); err != nil {
		_ = temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tempPath, path); err != nil {
		return err
	}
	dir, err := os.Open(dirPath)
	if err != nil {
		return err
	}
	defer dir.Close()
	if err := dir.Sync(); err != nil {
		return fmt.Errorf("sync Shopify state directory: %w", err)
	}
	return nil
}
