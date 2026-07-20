package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	customerOrderBackfillVersion      = 1
	customerOrderBackfillBindingName  = "customer-orders-binding.json"
	customerOrderBackfillManifestName = "customer-orders-manifest.json"
	customerOrderBackfillMaxPageBytes = 64 << 20
	customerOrderBackfillMaxCustomers = 1000
)

type customerOrderBackfillBinding struct {
	Version      int    `json:"version"`
	ConnectionID string `json:"connection_id"`
	ShopDomain   string `json:"shop_domain"`
	Since        string `json:"since"`
	Through      string `json:"through"`
}

type customerOrderBackfillPage struct {
	Version       int                               `json:"version"`
	Family        string                            `json:"family"`
	PageIndex     int                               `json:"page_index"`
	Since         string                            `json:"since"`
	Through       string                            `json:"through"`
	RequestCursor string                            `json:"request_cursor"`
	NextCursor    string                            `json:"next_cursor,omitempty"`
	Complete      bool                              `json:"complete"`
	SourceRows    int                               `json:"source_rows"`
	Records       []nexadapter.AdapterInboundRecord `json:"records"`
	RecordsSHA256 string                            `json:"records_sha256"`
}

type customerOrderBackfillPageReceipt struct {
	Family        string `json:"family"`
	PageIndex     int    `json:"page_index"`
	Path          string `json:"path"`
	FileSHA256    string `json:"file_sha256"`
	Bytes         int64  `json:"bytes"`
	SourceRows    int    `json:"source_rows"`
	Records       int    `json:"records"`
	RequestCursor string `json:"request_cursor"`
	NextCursor    string `json:"next_cursor,omitempty"`
	Complete      bool   `json:"complete"`
}

type customerOrderBackfillTotals struct {
	OrderSourceRows    int `json:"order_source_rows"`
	CustomerSourceRows int `json:"customer_source_rows"`
	Records            int `json:"records"`
}

type customerOrderBackfillManifest struct {
	Version      int                                `json:"version"`
	State        string                             `json:"state"`
	ConnectionID string                             `json:"connection_id"`
	ShopDomain   string                             `json:"shop_domain"`
	Since        string                             `json:"since"`
	Through      string                             `json:"through"`
	StageDir     string                             `json:"stage_dir"`
	ManifestPath string                             `json:"manifest_path"`
	Pages        []customerOrderBackfillPageReceipt `json:"pages"`
	Totals       customerOrderBackfillTotals        `json:"totals"`
}

func stageCustomerOrderBackfill(ctx nexadapter.AdapterContext[struct{}], payload map[string]any) (any, error) {
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
	manifestPath := filepath.Join(stageDir, customerOrderBackfillManifestName)
	if manifest, err := loadCompletedCustomerOrderManifest(manifestPath, state, since, through, stageDir); err != nil {
		return nil, err
	} else if manifest != nil {
		return manifest, nil
	}

	orderSource, initialOrderCursor := shopifyOrdersWindowRequest(state, since, true, &through)
	orderReceipts, orderCursor, ordersComplete, err := loadCustomerOrderPageChain(stageDir, "orders", since, through, initialOrderCursor)
	if err != nil {
		return nil, err
	}
	customerReceipts, customerCursor, customersComplete, err := loadCustomerOrderPageChain(stageDir, "customers", since, through, "")
	if err != nil {
		return nil, err
	}
	if !ordersComplete && len(customerReceipts) > 0 {
		return nil, errors.New("customer pages exist before the order page chain completed")
	}

	if !ordersComplete {
		accessToken, err := fetchShopifyAccessToken(customerOrderBackfillContext(ctx), state)
		if err != nil {
			return nil, err
		}
		for pageIndex := len(orderReceipts); pageIndex < maxOrdersPages; pageIndex++ {
			page, err := fetchOrderPage(customerOrderBackfillContext(ctx), state, accessToken, orderCursor)
			if err != nil {
				return nil, err
			}
			records := make([]nexadapter.AdapterInboundRecord, 0, len(page.Orders)*2)
			for _, order := range page.Orders {
				if record := buildOrderRecord(state, order, orderSource); record.Operation != "" {
					records = append(records, record)
				}
				for _, lineItem := range order.LineItems {
					if record := buildLineItemRecord(state, order, lineItem, orderSource); record.Operation != "" {
						records = append(records, record)
					}
				}
			}
			artifact := newCustomerOrderBackfillPage("orders", pageIndex, since, through, page.RequestCursor, page.NextCursor, page.Complete, len(page.Orders), records)
			receipt, err := persistCustomerOrderPage(stageDir, artifact)
			if err != nil {
				return nil, err
			}
			orderReceipts = append(orderReceipts, receipt)
			orderCursor = page.NextCursor
			if page.Complete {
				ordersComplete = true
				break
			}
		}
		if !ordersComplete {
			return nil, fmt.Errorf("exceeded Shopify order pagination guard (%d pages)", maxOrdersPages)
		}
	}

	customerQuery := shopifyUpdatedWindowFilter(since, through)
	if !customersComplete {
		for pageIndex := len(customerReceipts); pageIndex < customerOrderBackfillMaxCustomers; pageIndex++ {
			page, err := fetchCustomerPage(customerOrderBackfillContext(ctx), state, customerQuery, customerCursor)
			if err != nil {
				return nil, err
			}
			records := make([]nexadapter.AdapterInboundRecord, 0, len(page.Customers))
			for _, customer := range page.Customers {
				if record := buildCustomerRecord(state, customer, shopifyCustomerSourceRequest(state, since, through)); record.Operation != "" {
					records = append(records, record)
				}
			}
			artifact := newCustomerOrderBackfillPage("customers", pageIndex, since, through, page.RequestCursor, page.NextCursor, page.Complete, len(page.Customers), records)
			receipt, err := persistCustomerOrderPage(stageDir, artifact)
			if err != nil {
				return nil, err
			}
			customerReceipts = append(customerReceipts, receipt)
			customerCursor = page.NextCursor
			if page.Complete {
				customersComplete = true
				break
			}
		}
		if !customersComplete {
			return nil, fmt.Errorf("exceeded Shopify customer pagination guard (%d pages)", customerOrderBackfillMaxCustomers)
		}
	}

	manifest := &customerOrderBackfillManifest{
		Version:      customerOrderBackfillVersion,
		State:        "succeeded",
		ConnectionID: state.ConnectionID,
		ShopDomain:   state.ShopDomain,
		Since:        since.UTC().Format(time.RFC3339),
		Through:      through.UTC().Format(time.RFC3339),
		StageDir:     stageDir,
		ManifestPath: manifestPath,
		Pages:        append(orderReceipts, customerReceipts...),
	}
	manifest.Totals = summarizeCustomerOrderBackfillPages(manifest.Pages)
	if err := persistImmutableJSON(manifestPath, manifest); err != nil {
		return nil, err
	}
	return manifest, nil
}

func resolveCustomerOrderBackfillWindow(payload map[string]any) (time.Time, time.Time, error) {
	if payload == nil {
		return time.Time{}, time.Time{}, errors.New("customer/order backfill requires since and through")
	}
	rawSince, sinceOK := payload["since"].(string)
	rawThrough, throughOK := payload["through"].(string)
	sinceText := strings.TrimSpace(rawSince)
	throughText := strings.TrimSpace(rawThrough)
	if !sinceOK || !throughOK || sinceText == "" || throughText == "" {
		return time.Time{}, time.Time{}, errors.New("customer/order backfill requires RFC3339 since and through")
	}
	since, err := time.Parse(time.RFC3339, sinceText)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid customer/order backfill since %q: %w", sinceText, err)
	}
	through, err := time.Parse(time.RFC3339, throughText)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid customer/order backfill through %q: %w", throughText, err)
	}
	since = since.UTC()
	through = through.UTC()
	if !through.After(since) {
		return time.Time{}, time.Time{}, errors.New("customer/order backfill through must be after since")
	}
	if through.After(time.Now().UTC()) {
		return time.Time{}, time.Time{}, errors.New("customer/order backfill through must not be in the future")
	}
	return since, through, nil
}

func shopifyCustomerSourceRequest(state *shopifyState, since time.Time, through time.Time) shopifySourceRequest {
	query := shopifyUpdatedWindowFilter(since, through)
	return shopifySourceRequest{
		APIBaseURL: fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion),
		Path:       shopifyGraphQLProjectionPath,
		Request: map[string]any{
			"operation":      "Tier1Customers",
			"document":       tier1CustomersDocument,
			"query":          emptyToNil(query),
			"sortKey":        "UPDATED_AT",
			"reverse":        false,
			"page_size":      shopifyGraphQLPageSize,
			"api_version":    state.APIVersion,
			"cursor_since":   since.UTC().Format(time.RFC3339),
			"cursor_through": through.UTC().Format(time.RFC3339),
		},
	}
}

func newCustomerOrderBackfillPage(family string, pageIndex int, since time.Time, through time.Time, requestCursor string, nextCursor string, complete bool, sourceRows int, records []nexadapter.AdapterInboundRecord) customerOrderBackfillPage {
	recordBytes, _ := json.Marshal(records)
	digest := sha256.Sum256(recordBytes)
	return customerOrderBackfillPage{
		Version:       customerOrderBackfillVersion,
		Family:        family,
		PageIndex:     pageIndex,
		Since:         since.UTC().Format(time.RFC3339),
		Through:       through.UTC().Format(time.RFC3339),
		RequestCursor: requestCursor,
		NextCursor:    nextCursor,
		Complete:      complete,
		SourceRows:    sourceRows,
		Records:       records,
		RecordsSHA256: hex.EncodeToString(digest[:]),
	}
}

func persistCustomerOrderPage(stageDir string, page customerOrderBackfillPage) (customerOrderBackfillPageReceipt, error) {
	if page.Family != "orders" && page.Family != "customers" {
		return customerOrderBackfillPageReceipt{}, errors.New("unsupported Shopify backfill page family")
	}
	path := filepath.Join(stageDir, fmt.Sprintf("%s-page-%06d.json", page.Family, page.PageIndex))
	if err := persistImmutableJSON(path, page); err != nil {
		return customerOrderBackfillPageReceipt{}, err
	}
	return inspectCustomerOrderPage(path, page.Family, page.PageIndex, page.Since, page.Through, page.RequestCursor)
}

func loadCustomerOrderPageChain(stageDir string, family string, since time.Time, through time.Time, initialCursor string) ([]customerOrderBackfillPageReceipt, string, bool, error) {
	receipts := make([]customerOrderBackfillPageReceipt, 0)
	expectedCursor := initialCursor
	complete := false
	for pageIndex := 0; ; pageIndex++ {
		path := filepath.Join(stageDir, fmt.Sprintf("%s-page-%06d.json", family, pageIndex))
		if _, err := os.Lstat(path); errors.Is(err, os.ErrNotExist) {
			break
		} else if err != nil {
			return nil, "", false, err
		}
		receipt, err := inspectCustomerOrderPage(path, family, pageIndex, since.UTC().Format(time.RFC3339), through.UTC().Format(time.RFC3339), expectedCursor)
		if err != nil {
			return nil, "", false, err
		}
		if complete {
			return nil, "", false, fmt.Errorf("%s page exists after a complete page", family)
		}
		receipts = append(receipts, receipt)
		expectedCursor = receipt.NextCursor
		complete = receipt.Complete
	}
	if err := rejectGappedCustomerOrderPages(stageDir, family, len(receipts)); err != nil {
		return nil, "", false, err
	}
	return receipts, expectedCursor, complete, nil
}

func inspectCustomerOrderPage(path string, family string, pageIndex int, since string, through string, expectedCursor string) (customerOrderBackfillPageReceipt, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return customerOrderBackfillPageReceipt{}, err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 || info.Size() > customerOrderBackfillMaxPageBytes {
		return customerOrderBackfillPageReceipt{}, fmt.Errorf("unsafe Shopify backfill page metadata: %s", path)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return customerOrderBackfillPageReceipt{}, err
	}
	var page customerOrderBackfillPage
	if err := json.Unmarshal(raw, &page); err != nil {
		return customerOrderBackfillPageReceipt{}, fmt.Errorf("decode Shopify backfill page %s: %w", path, err)
	}
	if page.Version != customerOrderBackfillVersion || page.Family != family || page.PageIndex != pageIndex || page.Since != since || page.Through != through || page.RequestCursor != expectedCursor {
		return customerOrderBackfillPageReceipt{}, fmt.Errorf("Shopify backfill page binding mismatch: %s", path)
	}
	if page.Complete == (strings.TrimSpace(page.NextCursor) != "") {
		return customerOrderBackfillPageReceipt{}, fmt.Errorf("Shopify backfill page cursor completion mismatch: %s", path)
	}
	var exact struct {
		Records json.RawMessage `json:"records"`
	}
	if err := json.Unmarshal(raw, &exact); err != nil {
		return customerOrderBackfillPageReceipt{}, fmt.Errorf("decode exact Shopify backfill records %s: %w", path, err)
	}
	if len(exact.Records) == 0 {
		return customerOrderBackfillPageReceipt{}, fmt.Errorf("Shopify backfill page has no exact records array: %s", path)
	}
	recordDigest := sha256.Sum256(exact.Records)
	if page.RecordsSHA256 != hex.EncodeToString(recordDigest[:]) || page.SourceRows < 0 {
		return customerOrderBackfillPageReceipt{}, fmt.Errorf("Shopify backfill page record receipt mismatch: %s", path)
	}
	if family == "customers" && page.SourceRows != len(page.Records) {
		return customerOrderBackfillPageReceipt{}, fmt.Errorf("Shopify customer page source/record count mismatch: %s", path)
	}
	if family == "orders" && page.SourceRows > len(page.Records) {
		return customerOrderBackfillPageReceipt{}, fmt.Errorf("Shopify order page source/record count mismatch: %s", path)
	}
	for _, record := range page.Records {
		recordFamily, _ := record.Payload.Metadata["family"].(string)
		recordFamily = strings.TrimSpace(recordFamily)
		if (family == "customers" && recordFamily != "customer") || (family == "orders" && recordFamily != "order" && recordFamily != "line_item") {
			return customerOrderBackfillPageReceipt{}, fmt.Errorf("Shopify backfill page contains a foreign record family: %s", path)
		}
	}
	fileDigest := sha256.Sum256(raw)
	return customerOrderBackfillPageReceipt{
		Family:        family,
		PageIndex:     pageIndex,
		Path:          path,
		FileSHA256:    hex.EncodeToString(fileDigest[:]),
		Bytes:         info.Size(),
		SourceRows:    page.SourceRows,
		Records:       len(page.Records),
		RequestCursor: page.RequestCursor,
		NextCursor:    page.NextCursor,
		Complete:      page.Complete,
	}, nil
}

func ensureCustomerOrderBackfillBinding(stageDir string, state *shopifyState, since time.Time, through time.Time) error {
	path := filepath.Join(stageDir, customerOrderBackfillBindingName)
	want := customerOrderBackfillBinding{
		Version:      customerOrderBackfillVersion,
		ConnectionID: state.ConnectionID,
		ShopDomain:   state.ShopDomain,
		Since:        since.UTC().Format(time.RFC3339),
		Through:      through.UTC().Format(time.RFC3339),
	}
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return persistImmutableJSON(path, want)
	}
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 {
		return errors.New("unsafe customer/order backfill binding metadata")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var got customerOrderBackfillBinding
	if err := json.Unmarshal(raw, &got); err != nil {
		return err
	}
	if got != want {
		return errors.New("customer/order backfill binding mismatch")
	}
	return nil
}

func rejectGappedCustomerOrderPages(stageDir string, family string, nextIndex int) error {
	entries, err := os.ReadDir(stageDir)
	if err != nil {
		return err
	}
	prefix := family + "-page-"
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasPrefix(name, prefix) || !strings.HasSuffix(name, ".json") {
			continue
		}
		var index int
		if _, err := fmt.Sscanf(name, prefix+"%06d.json", &index); err != nil || index >= nextIndex {
			return fmt.Errorf("non-sequential Shopify backfill page: %s", name)
		}
	}
	return nil
}

func resolvePrivateCustomerOrderStageDir(payload map[string]any) (string, error) {
	raw, _ := payload["stage_dir"].(string)
	stageDir := strings.TrimSpace(raw)
	if stageDir == "" || !filepath.IsAbs(stageDir) {
		return "", errors.New("customer/order backfill stage_dir must be an absolute path")
	}
	info, err := os.Lstat(stageDir)
	if errors.Is(err, os.ErrNotExist) {
		if err := os.MkdirAll(stageDir, 0o700); err != nil {
			return "", err
		}
		info, err = os.Lstat(stageDir)
	}
	if err != nil {
		return "", err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 || info.Mode().Perm()&0o077 != 0 {
		return "", errors.New("customer/order backfill stage_dir must be a private real directory")
	}
	return filepath.Clean(stageDir), nil
}

func persistImmutableJSON(path string, value any) error {
	if _, err := os.Lstat(path); err == nil {
		return fmt.Errorf("immutable Shopify backfill artifact already exists: %s", path)
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
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

func loadCompletedCustomerOrderManifest(path string, state *shopifyState, since time.Time, through time.Time, stageDir string) (*customerOrderBackfillManifest, error) {
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 {
		return nil, errors.New("unsafe customer/order backfill manifest metadata")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var manifest customerOrderBackfillManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return nil, err
	}
	if manifest.Version != customerOrderBackfillVersion || manifest.State != "succeeded" || manifest.ConnectionID != state.ConnectionID || manifest.ShopDomain != state.ShopDomain || manifest.Since != since.UTC().Format(time.RFC3339) || manifest.Through != through.UTC().Format(time.RFC3339) || manifest.StageDir != stageDir || manifest.ManifestPath != path {
		return nil, errors.New("customer/order backfill manifest binding mismatch")
	}
	_, initialOrderCursor := shopifyOrdersWindowRequest(state, since, true, &through)
	orderReceipts, _, ordersComplete, err := loadCustomerOrderPageChain(stageDir, "orders", since, through, initialOrderCursor)
	if err != nil {
		return nil, err
	}
	customerReceipts, _, customersComplete, err := loadCustomerOrderPageChain(stageDir, "customers", since, through, "")
	if err != nil {
		return nil, err
	}
	wantPages := append(orderReceipts, customerReceipts...)
	wantBytes, _ := json.Marshal(wantPages)
	gotBytes, _ := json.Marshal(manifest.Pages)
	if !ordersComplete || !customersComplete || !strings.EqualFold(hex.EncodeToString(sha256Sum(gotBytes)), hex.EncodeToString(sha256Sum(wantBytes))) || manifest.Totals != summarizeCustomerOrderBackfillPages(wantPages) {
		return nil, errors.New("customer/order backfill manifest page inventory mismatch")
	}
	return &manifest, nil
}

func summarizeCustomerOrderBackfillPages(pages []customerOrderBackfillPageReceipt) customerOrderBackfillTotals {
	totals := customerOrderBackfillTotals{}
	for _, receipt := range pages {
		totals.Records += receipt.Records
		switch receipt.Family {
		case "orders":
			totals.OrderSourceRows += receipt.SourceRows
		case "customers":
			totals.CustomerSourceRows += receipt.SourceRows
		}
	}
	return totals
}

func sha256Sum(value []byte) []byte {
	digest := sha256.Sum256(value)
	return digest[:]
}

func customerOrderBackfillContext(ctx nexadapter.AdapterContext[struct{}]) context.Context {
	if ctx.Context != nil {
		return ctx.Context
	}
	return context.Background()
}
