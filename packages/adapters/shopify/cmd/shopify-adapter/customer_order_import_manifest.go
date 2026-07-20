package main

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	customerOrderImportManifestVersion = 2
	customerOrderImportManifestName    = "customer-orders-import-manifest-v2.json"
	customerOrderImportChunkPrefix     = "customer-orders-import-"
)

type customerOrderImportChunk struct {
	Path             string `json:"path"`
	Records          int    `json:"records"`
	FirstRecordID    string `json:"first_record_id"`
	LastRecordID     string `json:"last_record_id"`
	FirstTimestampMs int64  `json:"first_timestamp_ms"`
	LastTimestampMs  int64  `json:"last_timestamp_ms"`
	ByteCount        int64  `json:"byte_count"`
	SHA256           string `json:"sha256"`
	SourcePagePath   string `json:"source_page_path"`
	SourcePageSHA256 string `json:"source_page_sha256"`
}

type customerOrderImportTotals struct {
	Records int `json:"records"`
}

type customerOrderImportManifest struct {
	Version              int                        `json:"version"`
	Format               string                     `json:"format"`
	StageDir             string                     `json:"stage_dir"`
	ManifestPath         string                     `json:"manifest_path"`
	ConnectionID         string                     `json:"connection_id"`
	ShopDomain           string                     `json:"shop_domain"`
	Since                string                     `json:"since"`
	Through              string                     `json:"through"`
	SourceManifestPath   string                     `json:"source_manifest_path"`
	SourceManifestSHA256 string                     `json:"source_manifest_sha256"`
	Chunks               []customerOrderImportChunk `json:"chunks"`
	Totals               customerOrderImportTotals  `json:"totals"`
}

func exportCustomerOrderBackfill(ctx nexadapter.AdapterContext[struct{}], payload map[string]any) (any, error) {
	since, through, err := resolveCustomerOrderBackfillWindow(payload)
	if err != nil {
		return nil, err
	}
	stageDir, err := resolvePrivateCustomerOrderStageDir(payload)
	if err != nil {
		return nil, err
	}
	state, err := loadShopifyState(ctx)
	if err != nil {
		return nil, err
	}
	if err := ensureCustomerOrderBackfillBinding(stageDir, state, since, through); err != nil {
		return nil, err
	}
	sourceManifestPath := filepath.Join(stageDir, customerOrderBackfillManifestName)
	sourceManifest, err := loadCompletedCustomerOrderManifest(sourceManifestPath, state, since, through, stageDir)
	if err != nil {
		return nil, err
	}
	if sourceManifest == nil {
		return nil, errors.New("customer/order import requires a completed source manifest")
	}
	return buildCustomerOrderImportManifest(sourceManifest)
}

func buildCustomerOrderImportManifest(source *customerOrderBackfillManifest) (*customerOrderImportManifest, error) {
	sourceRaw, err := os.ReadFile(source.ManifestPath)
	if err != nil {
		return nil, err
	}
	sourceDigest := sha256.Sum256(sourceRaw)
	manifestPath := filepath.Join(source.StageDir, customerOrderImportManifestName)
	want := &customerOrderImportManifest{
		Version:              customerOrderImportManifestVersion,
		Format:               "jsonl_files_sha256",
		StageDir:             source.StageDir,
		ManifestPath:         manifestPath,
		ConnectionID:         source.ConnectionID,
		ShopDomain:           source.ShopDomain,
		Since:                source.Since,
		Through:              source.Through,
		SourceManifestPath:   source.ManifestPath,
		SourceManifestSHA256: hex.EncodeToString(sourceDigest[:]),
		Chunks:               make([]customerOrderImportChunk, 0, len(source.Pages)),
	}

	for _, pageReceipt := range source.Pages {
		chunk, raw, err := buildCustomerOrderImportChunk(source.StageDir, len(want.Chunks), pageReceipt)
		if err != nil {
			return nil, err
		}
		if chunk == nil {
			continue
		}
		if _, err := os.Lstat(chunk.Path); errors.Is(err, os.ErrNotExist) {
			if err := persistImmutableBytes(chunk.Path, raw); err != nil {
				return nil, err
			}
		} else if err != nil {
			return nil, err
		}
		if err := verifyCustomerOrderImportChunk(*chunk); err != nil {
			return nil, err
		}
		want.Chunks = append(want.Chunks, *chunk)
		want.Totals.Records += chunk.Records
	}
	if err := rejectForeignCustomerOrderImportChunks(source.StageDir, len(want.Chunks)); err != nil {
		return nil, err
	}

	if info, err := os.Lstat(manifestPath); errors.Is(err, os.ErrNotExist) {
		if err := persistImmutableJSON(manifestPath, want); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	} else if !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 || info.Size() > customerOrderBackfillMaxPageBytes {
		return nil, errors.New("unsafe customer/order import manifest metadata")
	}
	raw, err := os.ReadFile(manifestPath)
	if err != nil {
		return nil, err
	}
	var got customerOrderImportManifest
	if err := json.Unmarshal(raw, &got); err != nil {
		return nil, err
	}
	wantRaw, _ := json.Marshal(want)
	gotRaw, _ := json.Marshal(&got)
	if !bytes.Equal(gotRaw, wantRaw) {
		return nil, errors.New("customer/order import manifest binding mismatch")
	}
	return want, nil
}

func buildCustomerOrderImportChunk(stageDir string, index int, receipt customerOrderBackfillPageReceipt) (*customerOrderImportChunk, []byte, error) {
	pageRaw, err := os.ReadFile(receipt.Path)
	if err != nil {
		return nil, nil, err
	}
	pageDigest := sha256.Sum256(pageRaw)
	if hex.EncodeToString(pageDigest[:]) != receipt.FileSHA256 || int64(len(pageRaw)) != receipt.Bytes {
		return nil, nil, fmt.Errorf("customer/order source page changed before import export: %s", receipt.Path)
	}
	var exact struct {
		Records []json.RawMessage `json:"records"`
	}
	if err := json.Unmarshal(pageRaw, &exact); err != nil {
		return nil, nil, err
	}
	if len(exact.Records) != receipt.Records {
		return nil, nil, fmt.Errorf("customer/order source page record count changed: %s", receipt.Path)
	}
	if len(exact.Records) == 0 {
		return nil, nil, nil
	}

	var output bytes.Buffer
	firstRecordID := ""
	lastRecordID := ""
	firstTimestamp := int64(0)
	lastTimestamp := int64(0)
	for recordIndex, raw := range exact.Records {
		var record nexadapter.AdapterInboundRecord
		if err := json.Unmarshal(raw, &record); err != nil {
			return nil, nil, fmt.Errorf("decode customer/order import record %d: %w", recordIndex, err)
		}
		recordID := strings.TrimSpace(record.Payload.ExternalRecordID)
		timestamp := record.Payload.Timestamp
		if record.Operation != "record.ingest" || recordID == "" || timestamp < 0 {
			return nil, nil, fmt.Errorf("invalid customer/order import record %d", recordIndex)
		}
		if recordIndex == 0 {
			firstRecordID = recordID
			firstTimestamp = timestamp
			lastTimestamp = timestamp
		}
		lastRecordID = recordID
		if timestamp < firstTimestamp {
			firstTimestamp = timestamp
		}
		if timestamp > lastTimestamp {
			lastTimestamp = timestamp
		}
		output.Write(raw)
		output.WriteByte('\n')
	}
	raw := output.Bytes()
	digest := sha256.Sum256(raw)
	chunk := &customerOrderImportChunk{
		Path:             filepath.Join(stageDir, fmt.Sprintf("%s%06d.jsonl", customerOrderImportChunkPrefix, index)),
		Records:          len(exact.Records),
		FirstRecordID:    firstRecordID,
		LastRecordID:     lastRecordID,
		FirstTimestampMs: firstTimestamp,
		LastTimestampMs:  lastTimestamp,
		ByteCount:        int64(len(raw)),
		SHA256:           hex.EncodeToString(digest[:]),
		SourcePagePath:   receipt.Path,
		SourcePageSHA256: receipt.FileSHA256,
	}
	return chunk, raw, nil
}

func verifyCustomerOrderImportChunk(chunk customerOrderImportChunk) error {
	info, err := os.Lstat(chunk.Path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 || info.Size() != chunk.ByteCount || info.Size() > customerOrderBackfillMaxPageBytes {
		return fmt.Errorf("unsafe customer/order import chunk metadata: %s", chunk.Path)
	}
	raw, err := os.ReadFile(chunk.Path)
	if err != nil {
		return err
	}
	digest := sha256.Sum256(raw)
	if hex.EncodeToString(digest[:]) != chunk.SHA256 {
		return fmt.Errorf("customer/order import chunk digest mismatch: %s", chunk.Path)
	}
	return nil
}

func rejectForeignCustomerOrderImportChunks(stageDir string, expected int) error {
	entries, err := os.ReadDir(stageDir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasPrefix(name, customerOrderImportChunkPrefix) || !strings.HasSuffix(name, ".jsonl") {
			continue
		}
		var index int
		if _, err := fmt.Sscanf(name, customerOrderImportChunkPrefix+"%06d.jsonl", &index); err != nil || index < 0 || index >= expected {
			return fmt.Errorf("foreign customer/order import chunk: %s", name)
		}
	}
	return nil
}

func persistImmutableBytes(path string, raw []byte) error {
	if _, err := os.Lstat(path); err == nil {
		return fmt.Errorf("immutable Shopify backfill artifact already exists: %s", path)
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	random := make([]byte, 12)
	if _, err := rand.Read(random); err != nil {
		return err
	}
	tempPath := filepath.Join(filepath.Dir(path), ".backfill-"+hex.EncodeToString(random)+".tmp")
	file, err := os.OpenFile(tempPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	removeTemp := true
	defer func() {
		if removeTemp {
			_ = os.Remove(tempPath)
		}
	}()
	if _, err := file.Write(raw); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Link(tempPath, path); err != nil {
		return err
	}
	if err := os.Remove(tempPath); err != nil {
		return err
	}
	removeTemp = false
	directory, err := os.Open(filepath.Dir(path))
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}
