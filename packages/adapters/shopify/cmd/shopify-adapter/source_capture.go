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
var shopifyProviderCursorPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)$`)
var shopifyProjectionWorkIDPattern = regexp.MustCompile(`^channelprojection_[0-9a-f]{32}$`)
var shopifyObservationReceiptIDPattern = regexp.MustCompile(`^channelobs_[0-9a-f]{32}$`)
var shopifySHA256Pattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

const shopifyFinanceCheckpointConfirmation = "ADOPT_SHOPIFY_FINANCE_SINCE_ID_V1"

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
	CaptureID            string `json:"capture_id"`
	StartedAt            string `json:"started_at"`
	ExpiresAt            string `json:"expires_at"`
	RequestSince         string `json:"request_since"`
	WindowThrough        string `json:"window_through"`
	ProviderCursor       string `json:"provider_cursor,omitempty"`
	PageCursor           string `json:"page_cursor,omitempty"`
	NextCursor           string `json:"next_cursor,omitempty"`
	NextProviderCursor   string `json:"next_provider_cursor,omitempty"`
	Complete             bool   `json:"complete"`
	ObservationReceiptID string `json:"observation_receipt_id,omitempty"`
}

type shopifyImmutableObservation struct {
	ProjectionWorkID          string          `json:"projection_work_id"`
	ObservationReceiptID      string          `json:"observation_receipt_id"`
	ProjectionTarget          string          `json:"projection_target"`
	SourceSystem              string          `json:"source_system"`
	SourceAccountRef          string          `json:"source_account_ref"`
	SourceStream              string          `json:"source_stream"`
	ExternalReceiptID         string          `json:"external_receipt_id"`
	SemanticRevisionID        string          `json:"semantic_revision_id"`
	RawBodySHA256             string          `json:"raw_body_sha256"`
	VerificationIssuer        string          `json:"verification_issuer"`
	VerificationReceiptSHA256 string          `json:"verification_receipt_sha256"`
	ObservationSHA256         string          `json:"observation_sha256"`
	ImmutableFactsSHA256      string          `json:"immutable_facts_sha256"`
	ImmutableFacts            json.RawMessage `json:"immutable_facts"`
}

type shopifySourceFamilyState struct {
	CursorISO            string              `json:"cursor_iso,omitempty"`
	ProviderCursor       string              `json:"provider_cursor,omitempty"`
	WindowSince          string              `json:"window_since,omitempty"`
	WindowThrough        string              `json:"window_through,omitempty"`
	WindowProviderCursor string              `json:"window_provider_cursor,omitempty"`
	PageCursor           string              `json:"page_cursor,omitempty"`
	Lease                *shopifySourceLease `json:"lease,omitempty"`
}

type shopifySourceState struct {
	Version  int                                 `json:"version"`
	Families map[string]shopifySourceFamilyState `json:"families"`
}

type shopifySourceCaptureResult struct {
	Version            int                               `json:"version"`
	Family             string                            `json:"family"`
	ConnectionID       string                            `json:"connection_id"`
	ShopDomain         string                            `json:"shop_domain"`
	CaptureID          string                            `json:"capture_id"`
	RequestSince       string                            `json:"request_since"`
	WindowThrough      string                            `json:"window_through"`
	ProviderCursor     string                            `json:"provider_cursor,omitempty"`
	PageCursor         string                            `json:"page_cursor,omitempty"`
	NextCursor         string                            `json:"next_cursor,omitempty"`
	NextProviderCursor string                            `json:"next_provider_cursor,omitempty"`
	Complete           bool                              `json:"complete"`
	Records            []nexadapter.AdapterInboundRecord `json:"records"`
}

type shopifySourceCommitResult struct {
	Version        int    `json:"version"`
	Family         string `json:"family"`
	CaptureID      string `json:"capture_id"`
	CursorISO      string `json:"cursor_iso"`
	ProviderCursor string `json:"provider_cursor,omitempty"`
	PageCursor     string `json:"page_cursor,omitempty"`
	WindowThrough  string `json:"window_through,omitempty"`
	Complete       bool   `json:"complete"`
}

type shopifySourceCheckpointAdoptionResult struct {
	Version                int    `json:"version"`
	Family                 string `json:"family"`
	PreviousStateSHA256    string `json:"previous_state_sha256"`
	CurrentStateSHA256     string `json:"current_state_sha256"`
	PreviousProviderCursor string `json:"previous_provider_cursor"`
	ProviderCursor         string `json:"provider_cursor"`
	ClearedInProgress      bool   `json:"cleared_in_progress"`
	ProviderCalls          int    `json:"provider_calls"`
	ProviderWriteAuthority bool   `json:"provider_write_authority"`
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

func sourceFamilyStateSHA256(state shopifySourceFamilyState) (string, error) {
	encoded, err := json.Marshal(state)
	if err != nil {
		return "", fmt.Errorf("encode Shopify source family state: %w", err)
	}
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:]), nil
}

func normalizeShopifyProviderCursor(value string) (string, error) {
	value = strings.TrimSpace(value)
	if !shopifyProviderCursorPattern.MatchString(value) {
		return "", errors.New("Shopify provider cursor must be a canonical unsigned decimal integer")
	}
	return value, nil
}

func laterShopifyProviderCursor(left, right string) (string, error) {
	if strings.TrimSpace(left) == "" {
		return normalizeShopifyProviderCursor(right)
	}
	if strings.TrimSpace(right) == "" {
		return normalizeShopifyProviderCursor(left)
	}
	left, err := normalizeShopifyProviderCursor(left)
	if err != nil {
		return "", err
	}
	right, err = normalizeShopifyProviderCursor(right)
	if err != nil {
		return "", err
	}
	if len(right) > len(left) || (len(right) == len(left) && right > left) {
		return right, nil
	}
	return left, nil
}

func highestShopifyProviderCursor(records []nexadapter.AdapterInboundRecord) (string, error) {
	highest := ""
	for _, record := range records {
		providerIDs, ok := record.Payload.Metadata["provider_ids"].(map[string]any)
		if !ok {
			return "", errors.New("Shopify finance record omitted provider_ids metadata")
		}
		providerID, ok := providerIDs["provider_id"].(string)
		if !ok {
			return "", errors.New("Shopify finance record omitted provider_id metadata")
		}
		var err error
		highest, err = laterShopifyProviderCursor(highest, providerID)
		if err != nil {
			return "", err
		}
	}
	return highest, nil
}

func shopifyObservationFamily(stream string) string {
	switch strings.TrimSpace(stream) {
	case "orders/paid", "orders/updated", "orders/cancelled":
		return "orders.delta"
	case "customers/created", "customers/updated":
		return "customers.delta"
	default:
		return ""
	}
}

func shopifyImmutableObservationSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"projection_work_id":          map[string]any{"type": "string", "pattern": "^channelprojection_[0-9a-f]{32}$"},
			"observation_receipt_id":      map[string]any{"type": "string", "pattern": "^channelobs_[0-9a-f]{32}$"},
			"projection_target":           map[string]any{"type": "string", "enum": []string{"nex"}},
			"source_system":               map[string]any{"type": "string", "enum": []string{"shopify"}},
			"source_account_ref":          map[string]any{"type": "string", "enum": []string{"moonsleep"}},
			"source_stream":               map[string]any{"type": "string", "enum": []string{"orders/paid", "orders/updated", "orders/cancelled", "customers/created", "customers/updated"}},
			"external_receipt_id":         map[string]any{"type": "string", "minLength": 1, "maxLength": 512},
			"semantic_revision_id":        map[string]any{"type": "string", "minLength": 1, "maxLength": 512},
			"raw_body_sha256":             map[string]any{"type": "string", "pattern": "^[0-9a-f]{64}$"},
			"verification_issuer":         map[string]any{"type": "string", "enum": []string{"shopify-hmac-sha256"}},
			"verification_receipt_sha256": map[string]any{"type": "string", "pattern": "^[0-9a-f]{64}$"},
			"observation_sha256":          map[string]any{"type": "string", "pattern": "^[0-9a-f]{64}$"},
			"immutable_facts_sha256":      map[string]any{"type": "string", "pattern": "^[0-9a-f]{64}$"},
			"immutable_facts":             map[string]any{"type": "object", "minProperties": 1},
		},
		"required": []string{
			"projection_work_id", "observation_receipt_id", "projection_target",
			"source_system", "source_account_ref", "source_stream",
			"external_receipt_id", "semantic_revision_id", "raw_body_sha256",
			"verification_issuer", "verification_receipt_sha256", "observation_sha256",
			"immutable_facts_sha256", "immutable_facts",
		},
		"additionalProperties": false,
	}
}

func exactObservationText(value, field string, maximum int) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || trimmed != value || len([]byte(trimmed)) > maximum {
		return "", fmt.Errorf("Shopify observation %s must be a trimmed non-empty string", field)
	}
	return trimmed, nil
}

func parseShopifyImmutableObservation(value any, family string) (shopifyImmutableObservation, error) {
	if value == nil {
		return shopifyImmutableObservation{}, errors.New("Shopify immutable observation is absent")
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return shopifyImmutableObservation{}, fmt.Errorf("marshal Shopify immutable observation: %w", err)
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.DisallowUnknownFields()
	var observation shopifyImmutableObservation
	if err := decoder.Decode(&observation); err != nil {
		return shopifyImmutableObservation{}, fmt.Errorf("decode Shopify immutable observation: %w", err)
	}
	if !shopifyProjectionWorkIDPattern.MatchString(observation.ProjectionWorkID) {
		return shopifyImmutableObservation{}, errors.New("Shopify observation projection_work_id is malformed")
	}
	if !shopifyObservationReceiptIDPattern.MatchString(observation.ObservationReceiptID) {
		return shopifyImmutableObservation{}, errors.New("Shopify observation observation_receipt_id is malformed")
	}
	if observation.ProjectionTarget != "nex" {
		return shopifyImmutableObservation{}, errors.New("Shopify observation projection_target must be nex")
	}
	if observation.SourceSystem != "shopify" {
		return shopifyImmutableObservation{}, errors.New("Shopify observation source_system must be shopify")
	}
	if observation.SourceAccountRef != "moonsleep" {
		return shopifyImmutableObservation{}, errors.New("Shopify observation source_account_ref must be moonsleep")
	}
	if shopifyObservationFamily(observation.SourceStream) != family {
		return shopifyImmutableObservation{}, errors.New("Shopify observation source_stream does not match family")
	}
	if observation.ExternalReceiptID, err = exactObservationText(observation.ExternalReceiptID, "external_receipt_id", 512); err != nil {
		return shopifyImmutableObservation{}, err
	}
	if observation.SemanticRevisionID, err = exactObservationText(observation.SemanticRevisionID, "semantic_revision_id", 512); err != nil {
		return shopifyImmutableObservation{}, err
	}
	if observation.VerificationIssuer != "shopify-hmac-sha256" {
		return shopifyImmutableObservation{}, errors.New("Shopify observation verification_issuer must be shopify-hmac-sha256")
	}
	for field, digest := range map[string]string{
		"raw_body_sha256":             observation.RawBodySHA256,
		"verification_receipt_sha256": observation.VerificationReceiptSHA256,
		"observation_sha256":          observation.ObservationSHA256,
		"immutable_facts_sha256":      observation.ImmutableFactsSHA256,
	} {
		if !shopifySHA256Pattern.MatchString(digest) {
			return shopifyImmutableObservation{}, fmt.Errorf("Shopify observation %s must be a lowercase SHA-256 digest", field)
		}
	}
	var facts map[string]json.RawMessage
	if len(observation.ImmutableFacts) == 0 || json.Unmarshal(observation.ImmutableFacts, &facts) != nil || len(facts) == 0 {
		return shopifyImmutableObservation{}, errors.New("Shopify observation immutable_facts must be a non-empty object")
	}
	return observation, nil
}

func immutableObservationCaptureID(family string, observation shopifyImmutableObservation) string {
	digest := sha256.Sum256([]byte(strings.Join([]string{
		family,
		observation.ProjectionWorkID,
		observation.ObservationReceiptID,
		observation.ObservationSHA256,
		observation.ImmutableFactsSHA256,
	}, "\n")))
	return hex.EncodeToString(digest[:16])
}

func recoverExpiredSourceLease(familyState shopifySourceFamilyState) shopifySourceFamilyState {
	if familyState.Lease == nil {
		return familyState
	}
	if familyState.Lease.ObservationReceiptID == "" {
		familyState.WindowSince = familyState.Lease.RequestSince
		familyState.WindowThrough = familyState.Lease.WindowThrough
		familyState.PageCursor = familyState.Lease.PageCursor
		familyState.WindowProviderCursor = familyState.Lease.NextProviderCursor
	}
	familyState.Lease = nil
	return familyState
}

func beginObservationSourceCapture(connectionID string, spec shopifySourceFamilySpec, observation shopifyImmutableObservation, now time.Time) (shopifySourceLease, error) {
	return withLockedSourceState(connectionID, func(state *shopifySourceState) (shopifySourceLease, error) {
		familyState := state.Families[spec.Name]
		captureID := immutableObservationCaptureID(spec.Name, observation)
		if familyState.Lease != nil {
			expiresAt, err := time.Parse(time.RFC3339Nano, familyState.Lease.ExpiresAt)
			if err != nil || now.Before(expiresAt) {
				if familyState.Lease.CaptureID == captureID && familyState.Lease.ObservationReceiptID == observation.ObservationReceiptID {
					return *familyState.Lease, nil
				}
				return shopifySourceLease{}, fmt.Errorf("Shopify source family %s already has an active capture", spec.Name)
			}
			familyState = recoverExpiredSourceLease(familyState)
		}
		startedAt := now.UTC().Format(time.RFC3339Nano)
		lease := shopifySourceLease{
			CaptureID:            captureID,
			StartedAt:            startedAt,
			ExpiresAt:            now.UTC().Add(shopifySourceLeaseTTL).Format(time.RFC3339Nano),
			RequestSince:         startedAt,
			WindowThrough:        startedAt,
			ProviderCursor:       familyState.ProviderCursor,
			PageCursor:           familyState.PageCursor,
			Complete:             true,
			ObservationReceiptID: observation.ObservationReceiptID,
		}
		familyState.Lease = &lease
		state.Families[spec.Name] = familyState
		return lease, nil
	})
}

func beginSourceCapture(connectionID string, spec shopifySourceFamilySpec, now time.Time) (shopifySourceLease, error) {
	return withLockedSourceState(connectionID, func(state *shopifySourceState) (shopifySourceLease, error) {
		familyState := state.Families[spec.Name]
		if familyState.Lease != nil {
			expiresAt, err := time.Parse(time.RFC3339Nano, familyState.Lease.ExpiresAt)
			if err != nil || now.Before(expiresAt) {
				return shopifySourceLease{}, fmt.Errorf("Shopify source family %s already has an active capture", spec.Name)
			}
			familyState = recoverExpiredSourceLease(familyState)
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
			CaptureID:          captureID,
			StartedAt:          now.UTC().Format(time.RFC3339Nano),
			ExpiresAt:          now.UTC().Add(shopifySourceLeaseTTL).Format(time.RFC3339Nano),
			RequestSince:       requestSince.UTC().Format(time.RFC3339Nano),
			WindowThrough:      through.Format(time.RFC3339Nano),
			ProviderCursor:     familyState.ProviderCursor,
			PageCursor:         familyState.PageCursor,
			NextProviderCursor: familyState.WindowProviderCursor,
		}
		familyState.WindowSince = lease.RequestSince
		familyState.WindowThrough = lease.WindowThrough
		familyState.Lease = &lease
		state.Families[spec.Name] = familyState
		return lease, nil
	})
}

func finishSourceCapture(connectionID, family, captureID, nextCursor, nextProviderCursor string, complete bool) error {
	_, err := withLockedSourceState(connectionID, func(state *shopifySourceState) (struct{}, error) {
		familyState := state.Families[family]
		if familyState.Lease == nil || familyState.Lease.CaptureID != captureID {
			return struct{}{}, errors.New("Shopify source capture lease changed before result staging")
		}
		if family == "finance.transactions" {
			var err error
			nextProviderCursor, err = laterShopifyProviderCursor(familyState.Lease.ProviderCursor, nextProviderCursor)
			if err != nil {
				return struct{}{}, err
			}
		}
		familyState.Lease.NextCursor = strings.TrimSpace(nextCursor)
		familyState.Lease.NextProviderCursor = strings.TrimSpace(nextProviderCursor)
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
		if lease.ObservationReceiptID != "" {
			// Immutable observations share the same family lease only to serialize
			// ingest custody. They never own or advance the polling checkpoint.
		} else if lease.Complete {
			familyState.CursorISO = lease.WindowThrough
			if lease.NextProviderCursor != "" {
				familyState.ProviderCursor = lease.NextProviderCursor
			}
			familyState.WindowSince = ""
			familyState.PageCursor = ""
			familyState.WindowThrough = ""
			familyState.WindowProviderCursor = ""
		} else {
			if strings.TrimSpace(lease.NextCursor) == "" {
				return shopifySourceCommitResult{}, errors.New("incomplete Shopify source capture is missing next cursor")
			}
			familyState.PageCursor = lease.NextCursor
			familyState.WindowThrough = lease.WindowThrough
			familyState.WindowProviderCursor = lease.NextProviderCursor
		}
		familyState.Lease = nil
		state.Families[family] = familyState
		return shopifySourceCommitResult{
			Version:        shopifySourceStateVersion,
			Family:         family,
			CaptureID:      captureID,
			CursorISO:      familyState.CursorISO,
			ProviderCursor: familyState.ProviderCursor,
			PageCursor:     familyState.PageCursor,
			WindowThrough:  familyState.WindowThrough,
			Complete:       lease.Complete,
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
		if lease.ProviderCursor == "" {
			return nil, "", false, errors.New("Shopify finance source requires an adopted provider cursor before capture")
		}
		return captureShopifyPaymentsPage(ctx, state, shopifyPaymentsPageRequest{
			Family:              spec.Name,
			ContainerID:         "balance_transaction",
			Path:                "/shopify_payments/balance/transactions.json",
			ResponseField:       "transactions",
			ProviderCursorParam: "since_id",
			TimestampKeys:       []string{"processed_at", "payout_date"},
		}, since, through, lease.ProviderCursor, lease.PageCursor)

	case "disputes.delta":
		return captureShopifyPaymentsPage(ctx, state, shopifyPaymentsPageRequest{
			Family:        spec.Name,
			ContainerID:   "dispute",
			Path:          "/shopify_payments/disputes.json",
			ResponseField: "disputes",
			SinceParam:    "initiated_at_min",
			ThroughParam:  "initiated_at_max",
			TimestampKeys: []string{"initiated_at", "finalized_on"},
		}, since, through, "", lease.PageCursor)

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
		}, since, through, "", lease.PageCursor)
	default:
		return nil, "", false, fmt.Errorf("Shopify source family %s is not implemented", spec.Name)
	}
}

type shopifyObservedCustomerAddress struct {
	ID           any    `json:"id"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	Name         string `json:"name"`
	Company      string `json:"company"`
	Address1     string `json:"address1"`
	Address2     string `json:"address2"`
	City         string `json:"city"`
	Province     string `json:"province"`
	ProvinceCode string `json:"province_code"`
	Country      string `json:"country"`
	CountryCode  string `json:"country_code"`
	Zip          string `json:"zip"`
	Phone        string `json:"phone"`
}

func observedCustomerAddress(address shopifyObservedCustomerAddress) shopifyGraphQLCustomerAddress {
	return shopifyGraphQLCustomerAddress{
		ID:            rawScalarString(address.ID),
		FirstName:     address.FirstName,
		LastName:      address.LastName,
		Name:          address.Name,
		Company:       address.Company,
		Address1:      address.Address1,
		Address2:      address.Address2,
		City:          address.City,
		Province:      address.Province,
		ProvinceCode:  address.ProvinceCode,
		Country:       address.Country,
		CountryCodeV2: address.CountryCode,
		Zip:           address.Zip,
		Phone:         address.Phone,
	}
}

func observedCustomerTags(value any) []string {
	switch typed := value.(type) {
	case string:
		parts := strings.Split(typed, ",")
		out := make([]string, 0, len(parts))
		for _, part := range parts {
			if tag := strings.TrimSpace(part); tag != "" {
				out = append(out, tag)
			}
		}
		return out
	case []any:
		out := make([]string, 0, len(typed))
		for _, value := range typed {
			if tag := strings.TrimSpace(rawScalarString(value)); tag != "" {
				out = append(out, tag)
			}
		}
		return out
	default:
		return nil
	}
}

func decodeObservedCustomer(raw json.RawMessage) (shopifyGraphQLCustomer, error) {
	providerPayload, err := decodeProviderJSONObject(raw)
	if err != nil {
		return shopifyGraphQLCustomer{}, err
	}
	providerID := rawScalarString(providerPayload["id"])
	if providerID == "" {
		return shopifyGraphQLCustomer{}, errors.New("Shopify customer observation omitted id")
	}
	if strings.HasPrefix(providerID, "gid://shopify/Customer/") {
		var customer shopifyGraphQLCustomer
		if err := json.Unmarshal(raw, &customer); err != nil {
			return shopifyGraphQLCustomer{}, err
		}
		return customer, nil
	}
	var rest struct {
		DisplayName    string                           `json:"display_name"`
		FirstName      string                           `json:"first_name"`
		LastName       string                           `json:"last_name"`
		Email          string                           `json:"email"`
		Phone          string                           `json:"phone"`
		CreatedAt      string                           `json:"created_at"`
		UpdatedAt      string                           `json:"updated_at"`
		Tags           any                              `json:"tags"`
		State          string                           `json:"state"`
		VerifiedEmail  bool                             `json:"verified_email"`
		DefaultAddress *shopifyObservedCustomerAddress  `json:"default_address"`
		Addresses      []shopifyObservedCustomerAddress `json:"addresses"`
	}
	if err := json.Unmarshal(raw, &rest); err != nil {
		return shopifyGraphQLCustomer{}, err
	}
	addresses := make([]shopifyGraphQLCustomerAddress, 0, len(rest.Addresses))
	for _, address := range rest.Addresses {
		addresses = append(addresses, observedCustomerAddress(address))
	}
	var defaultAddress *shopifyGraphQLCustomerAddress
	if rest.DefaultAddress != nil {
		converted := observedCustomerAddress(*rest.DefaultAddress)
		defaultAddress = &converted
	}
	displayName := strings.TrimSpace(rest.DisplayName)
	if displayName == "" {
		displayName = strings.TrimSpace(strings.Join([]string{rest.FirstName, rest.LastName}, " "))
	}
	return shopifyGraphQLCustomer{
		ID:                 "gid://shopify/Customer/" + providerID,
		DisplayName:        displayName,
		FirstName:          rest.FirstName,
		LastName:           rest.LastName,
		Email:              rest.Email,
		Phone:              rest.Phone,
		CreatedAt:          rest.CreatedAt,
		UpdatedAt:          rest.UpdatedAt,
		Tags:               observedCustomerTags(rest.Tags),
		State:              rest.State,
		VerifiedEmail:      rest.VerifiedEmail,
		DefaultAddress:     defaultAddress,
		Addresses:          addresses,
		rawProviderJSON:    append(json.RawMessage(nil), raw...),
		rawProviderPayload: providerPayload,
	}, nil
}

func immutableObservationSourceRequest(observation shopifyImmutableObservation) shopifySourceRequest {
	return shopifySourceRequest{
		Path: "/events/" + observation.SourceStream,
		Request: map[string]any{
			"projection_work_id":          observation.ProjectionWorkID,
			"observation_receipt_id":      observation.ObservationReceiptID,
			"projection_target":           observation.ProjectionTarget,
			"source_system":               observation.SourceSystem,
			"source_account_ref":          observation.SourceAccountRef,
			"source_stream":               observation.SourceStream,
			"external_receipt_id":         observation.ExternalReceiptID,
			"semantic_revision_id":        observation.SemanticRevisionID,
			"raw_body_sha256":             observation.RawBodySHA256,
			"verification_issuer":         observation.VerificationIssuer,
			"verification_receipt_sha256": observation.VerificationReceiptSHA256,
			"observation_sha256":          observation.ObservationSHA256,
			"immutable_facts_sha256":      observation.ImmutableFactsSHA256,
		},
	}
}

func captureShopifyImmutableObservation(state *shopifyState, spec shopifySourceFamilySpec, observation shopifyImmutableObservation) ([]nexadapter.AdapterInboundRecord, error) {
	sourceRequest := immutableObservationSourceRequest(observation)
	switch spec.Name {
	case "orders.delta":
		var order shopifyOrder
		if err := json.Unmarshal(observation.ImmutableFacts, &order); err != nil {
			return nil, fmt.Errorf("decode Shopify order observation: %w", err)
		}
		if int64String(order.ID) == "" {
			return nil, errors.New("Shopify order observation omitted facts id")
		}
		records := make([]nexadapter.AdapterInboundRecord, 0, 1+len(order.LineItems))
		if record := buildOrderRecord(state, order, sourceRequest); record.Operation != "" {
			records = append(records, record)
		}
		for _, lineItem := range order.LineItems {
			if record := buildLineItemRecord(state, order, lineItem, sourceRequest); record.Operation != "" {
				records = append(records, record)
			}
		}
		if len(records) == 0 || len(records) > shopifySourceMaxRecords {
			return nil, fmt.Errorf("Shopify order observation expanded to %d records", len(records))
		}
		return records, nil
	case "customers.delta":
		customer, err := decodeObservedCustomer(observation.ImmutableFacts)
		if err != nil {
			return nil, fmt.Errorf("decode Shopify customer observation: %w", err)
		}
		if shopifyNumericGID(customer.ID) == "" {
			return nil, errors.New("Shopify customer observation omitted facts id")
		}
		record := buildCustomerRecord(state, customer, sourceRequest)
		if record.Operation == "" {
			return nil, errors.New("Shopify customer observation did not produce a canonical Record")
		}
		return []nexadapter.AdapterInboundRecord{record}, nil
	default:
		return nil, errors.New("Shopify immutable observations support only orders.delta and customers.delta")
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
	observationValue, hasObservation := payload["observation"]
	if hasObservation {
		observation, err := parseShopifyImmutableObservation(observationValue, spec.Name)
		if err != nil {
			return nil, err
		}
		lease, err := beginObservationSourceCapture(state.ConnectionID, spec, observation, time.Now().UTC())
		if err != nil {
			return nil, err
		}
		records, err := captureShopifyImmutableObservation(state, spec, observation)
		if err != nil {
			abandonSourceCapture(state.ConnectionID, spec.Name, lease.CaptureID)
			return nil, err
		}
		if err := finishSourceCapture(state.ConnectionID, spec.Name, lease.CaptureID, "", lease.NextProviderCursor, true); err != nil {
			return nil, err
		}
		return shopifySourceCaptureResult{
			Version:        shopifySourceStateVersion,
			Family:         spec.Name,
			ConnectionID:   state.ConnectionID,
			ShopDomain:     state.ShopDomain,
			CaptureID:      lease.CaptureID,
			RequestSince:   lease.RequestSince,
			WindowThrough:  lease.WindowThrough,
			ProviderCursor: lease.ProviderCursor,
			PageCursor:     lease.PageCursor,
			Complete:       true,
			Records:        records,
		}, nil
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
	nextProviderCursor := lease.NextProviderCursor
	if spec.Name == "finance.transactions" && len(records) > 0 {
		pageProviderCursor, err := highestShopifyProviderCursor(records)
		if err != nil {
			abandonSourceCapture(state.ConnectionID, spec.Name, lease.CaptureID)
			return nil, err
		}
		nextProviderCursor, err = laterShopifyProviderCursor(nextProviderCursor, pageProviderCursor)
		if err != nil {
			abandonSourceCapture(state.ConnectionID, spec.Name, lease.CaptureID)
			return nil, err
		}
	}
	if spec.Name == "finance.transactions" {
		nextProviderCursor, err = laterShopifyProviderCursor(lease.ProviderCursor, nextProviderCursor)
		if err != nil {
			abandonSourceCapture(state.ConnectionID, spec.Name, lease.CaptureID)
			return nil, err
		}
	}
	if err := finishSourceCapture(state.ConnectionID, spec.Name, lease.CaptureID, nextCursor, nextProviderCursor, complete); err != nil {
		return nil, err
	}
	return shopifySourceCaptureResult{
		Version:            shopifySourceStateVersion,
		Family:             spec.Name,
		ConnectionID:       state.ConnectionID,
		ShopDomain:         state.ShopDomain,
		CaptureID:          lease.CaptureID,
		RequestSince:       lease.RequestSince,
		WindowThrough:      lease.WindowThrough,
		ProviderCursor:     lease.ProviderCursor,
		PageCursor:         lease.PageCursor,
		NextCursor:         nextCursor,
		NextProviderCursor: nextProviderCursor,
		Complete:           complete,
		Records:            records,
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

func adoptShopifyFinanceCheckpoint(connectionID, providerCursor, expectedStateSHA256 string) (shopifySourceCheckpointAdoptionResult, error) {
	providerCursor, err := normalizeShopifyProviderCursor(providerCursor)
	if err != nil {
		return shopifySourceCheckpointAdoptionResult{}, err
	}
	expectedStateSHA256 = strings.TrimSpace(expectedStateSHA256)
	if !regexp.MustCompile(`^[0-9a-f]{64}$`).MatchString(expectedStateSHA256) {
		return shopifySourceCheckpointAdoptionResult{}, errors.New("Shopify checkpoint adoption requires an exact state SHA-256")
	}
	return withLockedSourceState(connectionID, func(state *shopifySourceState) (shopifySourceCheckpointAdoptionResult, error) {
		const family = "finance.transactions"
		familyState := state.Families[family]
		if familyState.Lease != nil {
			return shopifySourceCheckpointAdoptionResult{}, errors.New("Shopify finance checkpoint cannot be adopted during an active capture")
		}
		previousStateSHA256, err := sourceFamilyStateSHA256(familyState)
		if err != nil {
			return shopifySourceCheckpointAdoptionResult{}, err
		}
		if previousStateSHA256 != expectedStateSHA256 {
			return shopifySourceCheckpointAdoptionResult{}, errors.New("Shopify finance checkpoint state changed before adoption")
		}
		previousProviderCursor := familyState.ProviderCursor
		clearedInProgress := familyState.WindowSince != "" ||
			familyState.WindowThrough != "" ||
			familyState.WindowProviderCursor != "" ||
			familyState.PageCursor != ""
		familyState.ProviderCursor = providerCursor
		familyState.WindowSince = ""
		familyState.WindowThrough = ""
		familyState.WindowProviderCursor = ""
		familyState.PageCursor = ""
		state.Families[family] = familyState
		currentStateSHA256, err := sourceFamilyStateSHA256(familyState)
		if err != nil {
			return shopifySourceCheckpointAdoptionResult{}, err
		}
		return shopifySourceCheckpointAdoptionResult{
			Version:                shopifySourceStateVersion,
			Family:                 family,
			PreviousStateSHA256:    previousStateSHA256,
			CurrentStateSHA256:     currentStateSHA256,
			PreviousProviderCursor: previousProviderCursor,
			ProviderCursor:         providerCursor,
			ClearedInProgress:      clearedInProgress,
			ProviderCalls:          0,
			ProviderWriteAuthority: false,
		}, nil
	})
}

func handleShopifySourceCheckpointAdopt(ctx nexadapter.AdapterContext[struct{}], payload map[string]any) (any, error) {
	state, err := loadShopifyState(ctx)
	if err != nil {
		return nil, err
	}
	family, _ := payload["family"].(string)
	if strings.TrimSpace(family) != "finance.transactions" {
		return nil, errors.New("Shopify checkpoint adoption supports only finance.transactions")
	}
	confirmation, _ := payload["confirmation"].(string)
	if confirmation != shopifyFinanceCheckpointConfirmation {
		return nil, errors.New("Shopify finance checkpoint confirmation is invalid")
	}
	providerCursor, _ := payload["provider_cursor"].(string)
	expectedStateSHA256, _ := payload["expected_state_sha256"].(string)
	return adoptShopifyFinanceCheckpoint(state.ConnectionID, providerCursor, expectedStateSHA256)
}
