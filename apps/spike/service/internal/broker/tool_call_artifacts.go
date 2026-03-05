package broker

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strings"
)

func (b *Broker) persistToolCallArtifacts(toolCallID string, call engineToolCallSnapshot, workDir string, createdAt int64) error {
	artifacts := buildToolCallArtifacts(toolCallID, call, workDir, createdAt)
	for _, artifact := range artifacts {
		if err := b.upsertArtifact(artifact); err != nil {
			return err
		}
		if err := b.linkToolCallArtifact(ToolCallArtifactWrite{
			ToolCallID: toolCallID,
			ArtifactID: artifact.ID,
			Kind:       artifact.Kind,
			CreatedAt:  artifact.CreatedAt,
		}); err != nil {
			return err
		}
	}
	return nil
}

func buildToolCallArtifacts(toolCallID string, call engineToolCallSnapshot, workDir string, createdAt int64) []ArtifactWrite {
	toolName := strings.ToLower(strings.TrimSpace(call.ToolName))
	if toolName != "read" && toolName != "write" && toolName != "edit" {
		return nil
	}
	if strings.TrimSpace(call.Status) == "failed" {
		return nil
	}

	agentPath := toolCallParamPath(call.ParamsJSON)
	if agentPath == "" {
		return nil
	}
	hostPath := resolveArtifactHostPath(workDir, agentPath)
	if hostPath == "" {
		return nil
	}
	info, err := os.Stat(hostPath)
	if err != nil || info.IsDir() {
		return nil
	}

	bytes := info.Size()
	sha := ""
	if sum, n, err := fileSHA256(hostPath); err == nil {
		sha = sum
		bytes = n
	}

	kind := "file"
	switch toolName {
	case "read":
		kind = "input_file"
	case "write", "edit":
		kind = "output_file"
	}
	if createdAt <= 0 {
		createdAt = nowUnixMilli()
	}

	artifactID := toolCallArtifactID(toolCallID, hostPath, kind)
	metadata := mustJSON(map[string]any{
		"tool_name": toolName,
		"status":    strings.TrimSpace(call.Status),
	}, "{}")

	return []ArtifactWrite{{
		ID:           artifactID,
		Kind:         kind,
		Storage:      "fs",
		CreatedAt:    createdAt,
		Bytes:        bytes,
		SHA256:       sha,
		HostPath:     hostPath,
		AgentPath:    strings.TrimSpace(agentPath),
		RelativePath: artifactRelativePath(workDir, hostPath),
		ContentType:  artifactContentType(hostPath),
		MetadataJSON: metadata,
	}}
}

func toolCallParamPath(paramsJSON string) string {
	paramsJSON = strings.TrimSpace(paramsJSON)
	if paramsJSON == "" {
		return ""
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(paramsJSON), &payload); err != nil {
		return ""
	}
	for _, key := range []string{"path", "filePath", "file_path"} {
		if v, ok := payload[key]; ok {
			if path := strings.TrimSpace(anyString(v)); path != "" {
				return path
			}
		}
	}
	return ""
}

func anyString(v any) string {
	switch typed := v.(type) {
	case string:
		return typed
	default:
		return ""
	}
}

func resolveArtifactHostPath(workDir string, agentPath string) string {
	agentPath = strings.TrimSpace(agentPath)
	if agentPath == "" {
		return ""
	}
	if filepath.IsAbs(agentPath) {
		return filepath.Clean(agentPath)
	}
	base := strings.TrimSpace(workDir)
	if base == "" {
		base = "."
	}
	return filepath.Clean(filepath.Join(base, agentPath))
}

func artifactRelativePath(workDir string, hostPath string) string {
	workDir = strings.TrimSpace(workDir)
	hostPath = strings.TrimSpace(hostPath)
	if workDir == "" || hostPath == "" {
		return ""
	}
	absBase, err := filepath.Abs(workDir)
	if err != nil {
		return ""
	}
	absHost, err := filepath.Abs(hostPath)
	if err != nil {
		return ""
	}
	rel, err := filepath.Rel(absBase, absHost)
	if err != nil {
		return ""
	}
	rel = filepath.ToSlash(strings.TrimSpace(rel))
	if rel == "." || rel == "" || strings.HasPrefix(rel, "../") {
		return ""
	}
	return rel
}

func artifactContentType(hostPath string) string {
	ext := strings.TrimSpace(filepath.Ext(hostPath))
	if ext == "" {
		return ""
	}
	return strings.TrimSpace(mime.TypeByExtension(strings.ToLower(ext)))
}

func fileSHA256(hostPath string) (sum string, bytes int64, err error) {
	file, err := os.Open(hostPath)
	if err != nil {
		return "", 0, err
	}
	defer file.Close()
	hasher := sha256.New()
	n, err := io.Copy(hasher, file)
	if err != nil {
		return "", n, err
	}
	return hex.EncodeToString(hasher.Sum(nil)), n, nil
}

func toolCallArtifactID(toolCallID string, hostPath string, kind string) string {
	raw := strings.TrimSpace(toolCallID) + "|" + strings.TrimSpace(hostPath) + "|" + strings.TrimSpace(kind)
	sum := sha256.Sum256([]byte(raw))
	return "artifact:" + hex.EncodeToString(sum[:16])
}
