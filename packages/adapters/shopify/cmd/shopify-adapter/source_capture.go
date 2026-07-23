package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"

	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	shopifySourceStateVersion = 1
	shopifySourceLeaseTTL     = 10 * time.Minute
	shopifySourceMaxRecords   = 500
)

var safeShopifyStateToken = regexp.MustCompile(`^[a-zA-Z0-9._-]+$`)

type shopifySourceFamilySpec struct {
	Name            string
	CadenceSeconds  int
	Overlap         time.Duration
	InitialLookback time.Duration
	Priority        int
}

var shopifySourceFamilies = map[string]shopifySourceFamilySpec{
	"orders.delta": {
		Name:            "orders.delta",
		CadenceSeconds:  60,
		Overlap:         10 * time.Minute,
		InitialLookback: 72 * time.Hour,
		Priority:        100,
	},
	"customers.delta": {
		Name:            "customers.delta",
		CadenceSeconds:  60,
		Overlap:         10 * time.Minute,
		InitialLookback: 24 * time.Hour,
		Priority:        95,
	},
	"inventory.hot": {
		Name:            "inventory.hot",
		CadenceSeconds:  60,
		Overlap:         5 * time.Minute,
		InitialLookback: 24 * time.Hour,
		Priority:        100,
	},
	"inventory.reconcile": {
		Name:            "inventory.reconcile",
		CadenceSeconds:  300,
		Overlap:         0,
		InitialLookback: 0,
		Priority:        65,
	},
	"fulfillment.delta": {
		Name:            "fulfillment.delta",
		CadenceSeconds:  300,
		Overlap:         10 * time.Minute,
		InitialLookback: 24 * time.Hour,
		Priority:        80,
	},
	"discounts.delta": {
		Name:            "discounts.delta",
		CadenceSeconds:  300,
		Overlap:         10 * time.Minute,
		InitialLookback: 24 * time.Hour,
		Priority:        75,
	},
	"finance.transactions": {
		Name:            "finance.transactions",
		CadenceSeconds:  300,
		Overlap:         24 * time.Hour,
		InitialLookback: 7 * 24 * time.Hour,
		Priority:        70,
	},
	"disputes.delta": {
		Name:            "disputes.delta",
		CadenceSeconds:  300,
		Overlap:         24 * time.Hour,
		InitialLookback: 30 * 24 * time.Hour,
		Priority:        70,
	},
	"products.delta": {
		Name:            "products.delta",
		CadenceSeconds:  900,
		Overlap:         15 * time.Minute,
		InitialLookback: 7 * 24 * time.Hour,
		Priority:        60,
	},
	"catalog.delta": {
		Name:            "catalog.delta",
		CadenceSeconds:  900,
		Overlap:         15 * time.Minute,
		InitialLookback: 7 * 24 * time.Hour,
		Priority:        55,
	},
	"marketing.delta": {
		Name:            "marketing.delta",
		CadenceSeconds:  3600,
		Overlap:         30 * time.Minute,
		InitialLookback: 7 * 24 * time.Hour,
		Priority:        20,
	},
	"payouts.delta": {
		Name:            "payouts.delta",
		CadenceSeconds:  21600,
		Overlap:         48 * time.Hour,
		InitialLookback: 30 * 24 * time.Hour,
		Priority:        10,
	},
}

var shopifySourceFamilyValues = []string{
	"orders.delta",
	"customers.delta",
	"inventory.hot",
	"inventory.reconcile",
	"fulfillment.delta",
	"discounts.delta",
	"finance.transactions",
	"disputes.delta",
	"products.delta",
	"catalog.delta",
	"marketing.delta",
	"payouts.delta",
}

type shopifySourceLease struct {
	CaptureID     string `json:"capture_id"`
	StartedAt     string `json:"started_at"`
	ExpiresAt     string `json:"expires_at"`
	RequestSince  string `json:"request_since"`
	WindowThrough string `json:"window_through"`
	PageCursor    string `json:"page_cursor,omitempty"`
	NextCursor    string `json:"next_cursor,omitempty"`
	Complete      bool   `json:"complete"`
}

type shopifySourceFamilyState struct {
	CursorISO     string              `json:"cursor_iso,omitempty"`
	WindowSince   string              `json:"window_since,omitempty"`
	WindowThrough string              `json:"window_through,omitempty"`
	PageCursor    string              `json:"page_cursor,omitempty"`
	Lease         *shopifySourceLease `json:"lease,omitempty"`
}

type shopifySourceState struct {
	Version  int                                 `json:"version"`
	Families map[string]shopifySourceFamilyState `json:"families"`
}

type shopifySourceCaptureResult struct {
	Version       int                               `json:"version"`
	Family        string                            `json:"family"`
	ConnectionID  string                            `json:"connection_id"`
	ShopDomain    string                            `json:"shop_domain"`
	CaptureID     string                            `json:"capture_id"`
	RequestSince  string                            `json:"request_since"`
	WindowThrough string                            `json:"window_through"`
	PageCursor    string                            `json:"page_cursor,omitempty"`
	NextCursor    string                            `json:"next_cursor,omitempty"`
	Complete      bool                              `json:"complete"`
	Records       []nexadapter.AdapterInboundRecord `json:"records"`
}

type shopifySourceCommitResult struct {
	Version       int    `json:"version"`
	Family        string `json:"family"`
	CaptureID     string `json:"capture_id"`
	CursorISO     string `json:"cursor_iso"`
	PageCursor    string `json:"page_cursor,omitempty"`
	WindowThrough string `json:"window_through,omitempty"`
	Complete      bool   `json:"complete"`
}

func sourceFamilySpec(name string) (shopifySourceFamilySpec, error) {
	spec, ok := shopifySourceFamilies[strings.TrimSpace(name)]
	if !ok {
		return shopifySourceFamilySpec{}, fmt.Errorf("unsupported Shopify source family %q", name)
	}
	return spec, nil
}

func sourceStatePaths(connectionID string) (statePath string, lockPath string, err error) {
	connectionID = strings.TrimSpace(connectionID)
	if connectionID == "" || !safeShopifyStateToken.MatchString(connectionID) {
		return "", "", errors.New("Shopify source state requires a safe connection id")
	}
	root, err := nexadapter.LoadAdapterStateDirFromEnv()
	if err != nil {
		return "", "", err
	}
	dir := filepath.Join(root, "source-observation", connectionID)
	if err := secureShopifyStateDirectory(dir); err != nil {
		return "", "", fmt.Errorf("create Shopify source state directory: %w", err)
	}
	return filepath.Join(dir, "state.json"), filepath.Join(dir, "state.lock"), nil
}

func withLockedSourceState[T any](connectionID string, fn func(*shopifySourceState) (T, error)) (T, error) {
	var zero T
	statePath, lockPath, err := sourceStatePaths(connectionID)
	if err != nil {
		return zero, err
	}
	lock, err := openShopifyPrivateFile(lockPath, syscall.O_RDWR, true)
	if err != nil {
		return zero, fmt.Errorf("open Shopify source state lock: %w", err)
	}
	defer lock.Close()
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX); err != nil {
		return zero, fmt.Errorf("lock Shopify source state: %w", err)
	}
	defer syscall.Flock(int(lock.Fd()), syscall.LOCK_UN) //nolint:errcheck

	state := &shopifySourceState{Version: shopifySourceStateVersion, Families: map[string]shopifySourceFamilyState{}}
	if raw, readErr := readShopifyPrivateFile(statePath); readErr == nil {
		if err := json.Unmarshal(raw, state); err != nil {
			return zero, fmt.Errorf("parse Shopify source state: %w", err)
		}
		if state.Version != shopifySourceStateVersion || state.Families == nil {
			return zero, errors.New("unsupported Shopify source state version")
		}
	} else if !errors.Is(readErr, os.ErrNotExist) {
		return zero, fmt.Errorf("read Shopify source state: %w", readErr)
	}

	result, err := fn(state)
	if err != nil {
		return zero, err
	}
	encoded, err := json.Marshal(state)
	if err != nil {
		return zero, fmt.Errorf("encode Shopify source state: %w", err)
	}
	if err := writeShopifyPrivateFileAtomic(statePath, append(encoded, '\n')); err != nil {
		return zero, fmt.Errorf("commit Shopify source state: %w", err)
	}
	return result, nil
}

func newCaptureID() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("create Shopify source capture id: %w", err)
	}
	return hex.EncodeToString(raw), nil
}

func beginSourceCapture(connectionID string, spec shopifySourceFamilySpec, now time.Time) (shopifySourceLease, error) {
	return withLockedSourceState(connectionID, func(state *shopifySourceState) (shopifySourceLease, error) {
		familyState := state.Families[spec.Name]
		if familyState.Lease != nil {
			expiresAt, err := time.Parse(time.RFC3339Nano, familyState.Lease.ExpiresAt)
			if err != nil || now.Before(expiresAt) {
				return shopifySourceLease{}, fmt.Errorf("Shopify source family %s already has an active capture", spec.Name)
			}
			familyState.WindowSince = familyState.Lease.RequestSince
			familyState.WindowThrough = familyState.Lease.WindowThrough
			familyState.PageCursor = familyState.Lease.PageCursor
			familyState.Lease = nil
		}

		requestSince := now.Add(-spec.InitialLookback)
		if familyState.WindowSince != "" {
			parsed, err := time.Parse(time.RFC3339Nano, familyState.WindowSince)
			if err != nil {
				return shopifySourceLease{}, fmt.Errorf("parse Shopify source window start: %w", err)
			}
			requestSince = parsed
		} else if familyState.CursorISO != "" {
			parsed, err := time.Parse(time.RFC3339Nano, familyState.CursorISO)
			if err != nil {
				return shopifySourceLease{}, fmt.Errorf("parse Shopify source cursor: %w", err)
			}
			requestSince = parsed.Add(-spec.Overlap)
		}
		through := now.UTC()
		if familyState.WindowThrough != "" {
			parsed, err := time.Parse(time.RFC3339Nano, familyState.WindowThrough)
			if err != nil {
				return shopifySourceLease{}, fmt.Errorf("parse Shopify source window: %w", err)
			}
			through = parsed
		}
		captureID, err := newCaptureID()
		if err != nil {
			return shopifySourceLease{}, err
		}
		lease := shopifySourceLease{
			CaptureID:     captureID,
			StartedAt:     now.UTC().Format(time.RFC3339Nano),
			ExpiresAt:     now.UTC().Add(shopifySourceLeaseTTL).Format(time.RFC3339Nano),
			RequestSince:  requestSince.UTC().Format(time.RFC3339Nano),
			WindowThrough: through.Format(time.RFC3339Nano),
			PageCursor:    familyState.PageCursor,
		}
		familyState.WindowSince = lease.RequestSince
		familyState.WindowThrough = lease.WindowThrough
		familyState.Lease = &lease
		state.Families[spec.Name] = familyState
		return lease, nil
	})
}

func finishSourceCapture(connectionID, family, captureID, nextCursor string, complete bool) error {
	_, err := withLockedSourceState(connectionID, func(state *shopifySourceState) (struct{}, error) {
		familyState := state.Families[family]
		if familyState.Lease == nil || familyState.Lease.CaptureID != captureID {
			return struct{}{}, errors.New("Shopify source capture lease changed before result staging")
		}
		familyState.Lease.NextCursor = strings.TrimSpace(nextCursor)
		familyState.Lease.Complete = complete
		state.Families[family] = familyState
		return struct{}{}, nil
	})
	return err
}

func abandonSourceCapture(connectionID, family, captureID string) {
	_, _ = withLockedSourceState(connectionID, func(state *shopifySourceState) (struct{}, error) {
		familyState := state.Families[family]
		if familyState.Lease != nil && familyState.Lease.CaptureID == captureID {
			familyState.Lease = nil
			state.Families[family] = familyState
		}
		return struct{}{}, nil
	})
}

func commitSourceCapture(connectionID, family, captureID string) (shopifySourceCommitResult, error) {
	return withLockedSourceState(connectionID, func(state *shopifySourceState) (shopifySourceCommitResult, error) {
		familyState := state.Families[family]
		lease := familyState.Lease
		if lease == nil || lease.CaptureID != captureID {
			return shopifySourceCommitResult{}, errors.New("Shopify source capture is absent or no longer current")
		}
		if lease.Complete {
			familyState.CursorISO = lease.WindowThrough
			familyState.WindowSince = ""
			familyState.PageCursor = ""
			familyState.WindowThrough = ""
		} else {
			if strings.TrimSpace(lease.NextCursor) == "" {
				return shopifySourceCommitResult{}, errors.New("incomplete Shopify source capture is missing next cursor")
			}
			familyState.PageCursor = lease.NextCursor
			familyState.WindowThrough = lease.WindowThrough
		}
		familyState.Lease = nil
		state.Families[family] = familyState
		return shopifySourceCommitResult{
			Version:       shopifySourceStateVersion,
			Family:        family,
			CaptureID:     captureID,
			CursorISO:     familyState.CursorISO,
			PageCursor:    familyState.PageCursor,
			WindowThrough: familyState.WindowThrough,
			Complete:      lease.Complete,
		}, nil
	})
}

func captureShopifySource(ctx context.Context, state *shopifyState, spec shopifySourceFamilySpec, lease shopifySourceLease) ([]nexadapter.AdapterInboundRecord, string, bool, error) {
	since, err := time.Parse(time.RFC3339Nano, lease.RequestSince)
	if err != nil {
		return nil, "", false, fmt.Errorf("parse capture since: %w", err)
	}
	through, err := time.Parse(time.RFC3339Nano, lease.WindowThrough)
	if err != nil {
		return nil, "", false, fmt.Errorf("parse capture through: %w", err)
	}

	switch spec.Name {
	case "orders.delta":
		accessToken, err := fetchShopifyAccessToken(ctx, state)
		if err != nil {
			return nil, "", false, err
		}
		sourceRequest, requestURL := shopifyOrdersWindowRequestWithLimit(state, since, true, &through, 100)
		if lease.PageCursor != "" {
			requestURL = lease.PageCursor
		}
		page, err := fetchOrderPage(ctx, state, accessToken, requestURL)
		if err != nil {
			return nil, "", false, err
		}
		records := make([]nexadapter.AdapterInboundRecord, 0, len(page.Orders)*2)
		for _, order := range page.Orders {
			if record := buildOrderRecord(state, order, sourceRequest); record.Operation != "" {
				records = append(records, record)
			}
			for _, lineItem := range order.LineItems {
				if record := buildLineItemRecord(state, order, lineItem, sourceRequest); record.Operation != "" {
					records = append(records, record)
				}
			}
		}
		if len(records) > shopifySourceMaxRecords {
			return nil, "", false, fmt.Errorf("Shopify order page expanded beyond %d source records", shopifySourceMaxRecords)
		}
		return records, page.NextCursor, page.Complete, nil

	case "customers.delta":
		query := shopifyUpdatedWindowFilter(since, through)
		page, err := fetchCustomerPage(ctx, state, query, lease.PageCursor)
		if err != nil {
			return nil, "", false, err
		}
		sourceRequest := shopifySourceRequest{
			APIBaseURL: fmt.Sprintf(defaultShopifyBaseURL, state.ShopDomain, state.APIVersion),
			Path:       shopifyGraphQLProjectionPath,
			Request: map[string]any{
				"operation":      "SourceCustomersDelta",
				"query":          query,
				"page_size":      shopifyGraphQLPageSize,
				"api_version":    state.APIVersion,
				"request_since":  since.UTC().Format(time.RFC3339Nano),
				"window_through": through.UTC().Format(time.RFC3339Nano),
				"request_cursor": emptyToNil(lease.PageCursor),
			},
		}
		records := make([]nexadapter.AdapterInboundRecord, 0, len(page.Customers))
		for _, customer := range page.Customers {
			if record := buildCustomerRecord(state, customer, sourceRequest); record.Operation != "" {
				records = append(records, record)
			}
		}
		return records, page.NextCursor, page.Complete, nil

	case "inventory.hot":
		return captureShopifyInventoryPage(ctx, state, since, through, lease.PageCursor, false)

	case "inventory.reconcile":
		return captureShopifyInventoryPage(ctx, state, since, through, lease.PageCursor, true)

	case "fulfillment.delta":
		return captureShopifyFulfillmentsPage(ctx, state, since, through, lease.PageCursor)

	case "discounts.delta":
		return captureShopifyDiscountsPage(ctx, state, since, through, lease.PageCursor)

	case "finance.transactions":
		return captureShopifyPaymentsPage(ctx, state, shopifyPaymentsPageRequest{
			Family:        spec.Name,
			ContainerID:   "balance_transaction",
			Path:          "/shopify_payments/balance/transactions.json",
			ResponseField: "transactions",
			SinceParam:    "payout_date_min",
			ThroughParam:  "payout_date_max",
			TimestampKeys: []string{"processed_at", "payout_date"},
		}, since, through, lease.PageCursor)

	case "disputes.delta":
		return captureShopifyPaymentsPage(ctx, state, shopifyPaymentsPageRequest{
			Family:        spec.Name,
			ContainerID:   "dispute",
			Path:          "/shopify_payments/disputes.json",
			ResponseField: "disputes",
			SinceParam:    "initiated_at_min",
			ThroughParam:  "initiated_at_max",
			TimestampKeys: []string{"initiated_at", "finalized_on"},
		}, since, through, lease.PageCursor)

	case "products.delta":
		return captureShopifyProductsPage(ctx, state, since, through, lease.PageCursor)

	case "catalog.delta":
		return captureShopifyCollectionsPage(ctx, state, since, through, lease.PageCursor)

	case "marketing.delta":
		return captureShopifyMarketingPage(ctx, state, since, through, lease.PageCursor)

	case "payouts.delta":
		return captureShopifyPaymentsPage(ctx, state, shopifyPaymentsPageRequest{
			Family:        spec.Name,
			ContainerID:   "payout",
			Path:          "/shopify_payments/payouts.json",
			ResponseField: "payouts",
			SinceParam:    "date_min",
			ThroughParam:  "date_max",
			TimestampKeys: []string{"date"},
		}, since, through, lease.PageCursor)
	default:
		return nil, "", false, fmt.Errorf("Shopify source family %s is not implemented", spec.Name)
	}
}

func handleShopifySourceCapture(ctx nexadapter.AdapterContext[struct{}], payload map[string]any) (any, error) {
	state, err := loadShopifyState(ctx)
	if err != nil {
		return nil, err
	}
	family, _ := payload["family"].(string)
	spec, err := sourceFamilySpec(family)
	if err != nil {
		return nil, err
	}
	lease, err := beginSourceCapture(state.ConnectionID, spec, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	records, nextCursor, complete, err := captureShopifySource(ctx.Context, state, spec, lease)
	if err != nil {
		abandonSourceCapture(state.ConnectionID, spec.Name, lease.CaptureID)
		return nil, err
	}
	if err := finishSourceCapture(state.ConnectionID, spec.Name, lease.CaptureID, nextCursor, complete); err != nil {
		return nil, err
	}
	return shopifySourceCaptureResult{
		Version:       shopifySourceStateVersion,
		Family:        spec.Name,
		ConnectionID:  state.ConnectionID,
		ShopDomain:    state.ShopDomain,
		CaptureID:     lease.CaptureID,
		RequestSince:  lease.RequestSince,
		WindowThrough: lease.WindowThrough,
		PageCursor:    lease.PageCursor,
		NextCursor:    nextCursor,
		Complete:      complete,
		Records:       records,
	}, nil
}

func handleShopifySourceCommit(ctx nexadapter.AdapterContext[struct{}], payload map[string]any) (any, error) {
	state, err := loadShopifyState(ctx)
	if err != nil {
		return nil, err
	}
	family, _ := payload["family"].(string)
	if _, err := sourceFamilySpec(family); err != nil {
		return nil, err
	}
	captureID, _ := payload["capture_id"].(string)
	if !regexp.MustCompile(`^[0-9a-f]{32}$`).MatchString(strings.TrimSpace(captureID)) {
		return nil, errors.New("Shopify source commit requires a valid capture id")
	}
	return commitSourceCapture(state.ConnectionID, family, captureID)
}

func handleShopifySourceAbort(ctx nexadapter.AdapterContext[struct{}], payload map[string]any) (any, error) {
	state, err := loadShopifyState(ctx)
	if err != nil {
		return nil, err
	}
	family, _ := payload["family"].(string)
	if _, err := sourceFamilySpec(family); err != nil {
		return nil, err
	}
	captureID, _ := payload["capture_id"].(string)
	if !regexp.MustCompile(`^[0-9a-f]{32}$`).MatchString(strings.TrimSpace(captureID)) {
		return nil, errors.New("Shopify source abort requires a valid capture id")
	}
	abandonSourceCapture(state.ConnectionID, family, captureID)
	return map[string]any{
		"version":    shopifySourceStateVersion,
		"family":     family,
		"capture_id": captureID,
		"aborted":    true,
	}, nil
}
