package main

import (
	"bufio"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"testing"
)

func TestCurrentActionCapabilitiesExposeDeclaredAndSupportedMethodsTruthfully(t *testing.T) {
	caps := currentActionCapabilities()

	if caps.Executor != actionExecutorAppleScriptSendOnly {
		t.Fatalf("expected applescript send-only executor, got %q", caps.Executor)
	}
	if !containsString(caps.DeclaredMethods, imessageReplyMethodID) {
		t.Fatalf("expected %s to remain declared, got %#v", imessageReplyMethodID, caps.DeclaredMethods)
	}
	if containsString(caps.SupportedMethods, imessageReplyMethodID) {
		t.Fatalf("did not expect %s to be supported, got %#v", imessageReplyMethodID, caps.SupportedMethods)
	}
	if !containsString(caps.SupportedMethods, imessageSendMethodID) {
		t.Fatalf("expected %s to stay supported, got %#v", imessageSendMethodID, caps.SupportedMethods)
	}
	if caps.ChannelCapabilities.SupportsReactions {
		t.Fatalf("expected reactions to be reported unsupported")
	}
	if caps.ChannelCapabilities.SupportsEdit {
		t.Fatalf("expected edit support to be reported unsupported")
	}
	if caps.ChannelCapabilities.SupportsDelete {
		t.Fatalf("expected delete support to be reported unsupported")
	}
	if got := caps.DetailFields["supports_inline_media"]; got != true {
		t.Fatalf("expected inline media parity to be reported supported, got %#v", got)
	}
	if got := caps.DetailFields["supports_file_attachments"]; got != true {
		t.Fatalf("expected generic file attachments to remain supported, got %#v", got)
	}
}

func TestDeclaredAdapterMethodsIncludeRichMethodSurface(t *testing.T) {
	methods := declaredAdapterMethods()
	for _, methodID := range []string{
		imessageSendMethodID,
		imessageReplyMethodID,
		imessageReactionAddMethodID,
		imessageReactionRemoveMethodID,
		imessageMessageEditMethodID,
		imessageMessageUnsendMethodID,
		imessageThreadCreateMethodID,
		imessageThreadRenameMethodID,
		imessageThreadParticipantsAddMethodID,
		imessageThreadParticipantsRemoveMethodID,
		recordsBackfillStageMethodID,
	} {
		if _, ok := methods[methodID]; !ok {
			t.Fatalf("expected declared method %s", methodID)
		}
	}
}

func TestPublishedOpenAPIMethodCatalogMatchesDeclaredActionMethods(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller(0) failed")
	}

	openAPIPath := filepath.Join(filepath.Dir(thisFile), "..", "..", "api", "openapi.yaml")
	file, err := os.Open(openAPIPath)
	if err != nil {
		t.Fatalf("open openapi contract: %v", err)
	}
	defer file.Close()

	re := regexp.MustCompile(`^\s*operationId:\s*([^\s]+)\s*$`)
	declared := append([]string(nil), currentActionCapabilities().DeclaredMethods...)
	slices.Sort(declared)

	var published []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		match := re.FindStringSubmatch(scanner.Text())
		if len(match) != 2 {
			continue
		}
		operationID := match[1]
		if operationID == recordsBackfillStageMethodID || len(operationID) >= len("imessage.") && operationID[:len("imessage.")] == "imessage." {
			published = append(published, operationID)
		}
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("scan openapi contract: %v", err)
	}

	slices.Sort(published)
	if !slices.Equal(declared, published) {
		t.Fatalf("declared methods do not match published openapi methods:\ndeclared=%v\npublished=%v", declared, published)
	}
}
