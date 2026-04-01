package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveAppleScriptSendTargetRecognizesHandlesAndChats(t *testing.T) {
	t.Run("handle from container id", func(t *testing.T) {
		target, err := resolveAppleScriptSendTarget("+17072876731", "")
		if err != nil {
			t.Fatalf("resolveAppleScriptSendTarget returned error: %v", err)
		}
		if target.UseChat {
			t.Fatalf("expected direct handle target, got %#v", target)
		}
		if target.Recipient != "+17072876731" {
			t.Fatalf("unexpected recipient: %#v", target)
		}
	})

	t.Run("chat target from thread id", func(t *testing.T) {
		target, err := resolveAppleScriptSendTarget("", "imessage:chat317946084881474359")
		if err != nil {
			t.Fatalf("resolveAppleScriptSendTarget returned error: %v", err)
		}
		if !target.UseChat {
			t.Fatalf("expected chat target, got %#v", target)
		}
		if target.ChatTarget != "chat317946084881474359" {
			t.Fatalf("unexpected chat target: %#v", target)
		}
	})

	t.Run("chat id thread fails clearly", func(t *testing.T) {
		_, err := resolveAppleScriptSendTarget("", "imessage:chat_id:105")
		if err == nil || !strings.Contains(err.Error(), "chat_id thread targets require") {
			t.Fatalf("expected chat_id failure, got %v", err)
		}
	})
}

func TestBuildAppleScriptSendScriptSkipsEmptyTextAndUsesRecipient(t *testing.T) {
	script := buildAppleScriptSendScript(appleScriptSendTarget{Recipient: "+17072876731"}, "", "/tmp/example.png")
	if strings.Contains(script, `send ""`) {
		t.Fatalf("expected empty text send to be skipped, got script:\n%s", script)
	}
	if !strings.Contains(script, `participant "+17072876731"`) {
		t.Fatalf("expected direct participant target, got script:\n%s", script)
	}
	if !strings.Contains(script, `send theFile to targetBuddy`) {
		t.Fatalf("expected file send clause, got script:\n%s", script)
	}
}

func TestStageAppleScriptAttachmentCopiesIntoMessagesAttachmentRoot(t *testing.T) {
	tempRoot := t.TempDir()
	originalRootFn := appleScriptAttachmentRoot
	appleScriptAttachmentRoot = func() (string, error) { return tempRoot, nil }
	t.Cleanup(func() {
		appleScriptAttachmentRoot = originalRootFn
	})

	sourceDir := t.TempDir()
	sourcePath := filepath.Join(sourceDir, "sample.png")
	if err := os.WriteFile(sourcePath, []byte("png-data"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	stagedPath, err := stageAppleScriptAttachment(sourcePath)
	if err != nil {
		t.Fatalf("stageAppleScriptAttachment returned error: %v", err)
	}
	if stagedPath == sourcePath {
		t.Fatalf("expected staged path to differ from source path")
	}
	if !strings.HasPrefix(stagedPath, tempRoot) {
		t.Fatalf("expected staged path under temp root, got %q", stagedPath)
	}
	data, err := os.ReadFile(stagedPath)
	if err != nil {
		t.Fatalf("read staged file: %v", err)
	}
	if string(data) != "png-data" {
		t.Fatalf("unexpected staged file contents: %q", string(data))
	}
}

func TestDefaultAppleScriptAttachmentRootHonorsOverride(t *testing.T) {
	overrideRoot := filepath.Join(t.TempDir(), "messages-attachments")
	t.Setenv("EVE_APPLESCRIPT_ATTACHMENT_ROOT", overrideRoot)

	got, err := defaultAppleScriptAttachmentRoot()
	if err != nil {
		t.Fatalf("defaultAppleScriptAttachmentRoot returned error: %v", err)
	}
	if got != overrideRoot {
		t.Fatalf("expected override root %q, got %q", overrideRoot, got)
	}
}

func TestSendAppleScriptStagesMediaBeforeExecution(t *testing.T) {
	tempRoot := t.TempDir()
	originalRootFn := appleScriptAttachmentRoot
	appleScriptAttachmentRoot = func() (string, error) { return tempRoot, nil }
	t.Cleanup(func() {
		appleScriptAttachmentRoot = originalRootFn
	})

	var capturedScript string
	originalRunner := runAppleScriptCommand
	runAppleScriptCommand = func(_ context.Context, script string) error {
		capturedScript = script
		return nil
	}
	t.Cleanup(func() {
		runAppleScriptCommand = originalRunner
	})

	sourcePath := filepath.Join(t.TempDir(), "sample.png")
	if err := os.WriteFile(sourcePath, []byte("png-data"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	if err := sendAppleScript(
		context.Background(),
		appleScriptSendTarget{Recipient: "+17072876731"},
		"",
		sourcePath,
	); err != nil {
		t.Fatalf("sendAppleScript returned error: %v", err)
	}

	if capturedScript == "" {
		t.Fatalf("expected AppleScript runner to capture a script")
	}
	if strings.Contains(capturedScript, sourcePath) {
		t.Fatalf("expected staged media path in script, got original source path:\n%s", capturedScript)
	}
	if !strings.Contains(capturedScript, tempRoot) {
		t.Fatalf("expected staged media path under temp root, got script:\n%s", capturedScript)
	}
}
