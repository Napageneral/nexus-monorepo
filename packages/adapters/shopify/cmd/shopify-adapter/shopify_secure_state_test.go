package main

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"
)

func TestShopifyPrivateStateRejectsLinksAndUnsafeModes(t *testing.T) {
	dir := t.TempDir()
	if err := os.Chmod(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	safePath := filepath.Join(dir, "safe.json")
	if err := writeShopifyPrivateFileAtomic(safePath, []byte("{}\n")); err != nil {
		t.Fatal(err)
	}
	file, err := openShopifyPrivateFile(safePath, syscall.O_RDONLY, false)
	if err != nil {
		t.Fatal(err)
	}
	_ = file.Close()

	linkPath := filepath.Join(dir, "link.json")
	if err := os.Symlink(safePath, linkPath); err != nil {
		t.Fatal(err)
	}
	if _, err := openShopifyPrivateFile(linkPath, syscall.O_RDONLY, false); err == nil {
		t.Fatal("symlinked Shopify state file unexpectedly opened")
	}

	unsafePath := filepath.Join(dir, "unsafe.json")
	if err := os.WriteFile(unsafePath, []byte("{}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := openShopifyPrivateFile(unsafePath, syscall.O_RDONLY, false); err == nil {
		t.Fatal("unsafe Shopify state file permissions unexpectedly passed")
	}
}

func TestShopifyPrivateStateAtomicReplacementIsDurableAndPrivate(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "private")
	if err := secureShopifyStateDirectory(dir); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "state.json")
	if err := writeShopifyPrivateFileAtomic(path, []byte("first\n")); err != nil {
		t.Fatal(err)
	}
	if err := writeShopifyPrivateFileAtomic(path, []byte("second\n")); err != nil {
		t.Fatal(err)
	}
	raw, err := readShopifyPrivateFile(path)
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Lstat(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "second\n" || !info.Mode().IsRegular() || info.Mode().Perm() != 0o600 {
		t.Fatalf("raw=%q mode=%v", raw, info.Mode())
	}
}
