package plaid

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type Transaction struct {
	ProviderTransactionID        string          `json:"provider_transaction_id"`
	ProviderAccountID            string          `json:"provider_account_id"`
	Pending                      bool            `json:"pending"`
	ProviderPendingTransactionID string          `json:"provider_pending_transaction_id,omitempty"`
	Date                         string          `json:"date,omitempty"`
	AuthorizedDate               string          `json:"authorized_date,omitempty"`
	Datetime                     string          `json:"datetime,omitempty"`
	Name                         string          `json:"name,omitempty"`
	MerchantName                 string          `json:"merchant_name,omitempty"`
	Amount                       *ExactMoney     `json:"amount,omitempty"`
	Raw                          json.RawMessage `json:"raw"`
}

type RemovedTransaction struct {
	ProviderTransactionID string          `json:"provider_transaction_id"`
	Raw                   json.RawMessage `json:"raw"`
}

type TransactionChange struct {
	ProviderEventID                 string          `json:"provider_event_id"`
	ChangeAction                    string          `json:"change_action"`
	ProviderTransactionID           string          `json:"provider_transaction_id"`
	ProviderPendingTransactionID    string          `json:"provider_pending_transaction_id,omitempty"`
	SupersedesProviderTransactionID string          `json:"supersedes_provider_transaction_id,omitempty"`
	ProviderAccountID               string          `json:"provider_account_id,omitempty"`
	Pending                         bool            `json:"pending,omitempty"`
	Amount                          *ExactMoney     `json:"amount,omitempty"`
	SourcePayloadSHA256             string          `json:"source_payload_sha256"`
	ChangeIdentitySHA256            string          `json:"change_identity_sha256"`
	ObservedAt                      string          `json:"observed_at"`
	Raw                             json.RawMessage `json:"raw"`
}

type SyncOptions struct {
	Cursor      string
	Count       int
	MaxPages    int
	MaxRestarts int
}

type SyncRestartEvidence struct {
	Attempt               int               `json:"attempt"`
	Reason                string            `json:"reason"`
	OriginalCursor        string            `json:"original_cursor,omitempty"`
	DiscardedPageEvidence []SourceEvidence  `json:"discarded_page_evidence"`
	DiscardedRawPages     []json.RawMessage `json:"discarded_raw_pages"`
	ErrorEvidence         SourceEvidence    `json:"error_evidence"`
	ErrorPayloadSHA256    string            `json:"error_payload_sha256"`
	ErrorRequestID        string            `json:"error_request_id,omitempty"`
	ErrorRaw              json.RawMessage   `json:"error_raw"`
}

type SyncTerminalError struct {
	Stage           string          `json:"stage"`
	Message         string          `json:"message"`
	StatusCode      int             `json:"status_code,omitempty"`
	ErrorType       string          `json:"error_type,omitempty"`
	ErrorCode       string          `json:"error_code,omitempty"`
	PageNumber      int             `json:"page_number,omitempty"`
	AttemptedCursor string          `json:"attempted_cursor,omitempty"`
	Evidence        *SourceEvidence `json:"evidence,omitempty"`
	Raw             json.RawMessage `json:"raw,omitempty"`
}

type TransactionSyncResult struct {
	CredentialBindings  CredentialBindings    `json:"credential_bindings"`
	CompletionState     string                `json:"completion_state"`
	CursorCommitAllowed bool                  `json:"cursor_commit_allowed"`
	StartingCursor      string                `json:"starting_cursor,omitempty"`
	NextCursor          string                `json:"next_cursor"`
	Pages               int                   `json:"pages"`
	Restarts            int                   `json:"restarts"`
	Added               []Transaction         `json:"added"`
	Modified            []Transaction         `json:"modified"`
	Removed             []RemovedTransaction  `json:"removed"`
	Changes             []TransactionChange   `json:"changes"`
	PageEvidence        []SourceEvidence      `json:"page_evidence"`
	RawPages            []json.RawMessage     `json:"raw_pages"`
	RestartEvidence     []SyncRestartEvidence `json:"restart_evidence"`
	TerminalError       *SyncTerminalError    `json:"terminal_error"`
}

type providerTransaction struct {
	TransactionID          string        `json:"transaction_id"`
	AccountID              string        `json:"account_id"`
	Pending                bool          `json:"pending"`
	PendingTransactionID   string        `json:"pending_transaction_id"`
	Date                   string        `json:"date"`
	AuthorizedDate         string        `json:"authorized_date"`
	Datetime               string        `json:"datetime"`
	Name                   string        `json:"name"`
	MerchantName           string        `json:"merchant_name"`
	Amount                 DecimalNumber `json:"amount"`
	ISOCurrencyCode        string        `json:"iso_currency_code"`
	UnofficialCurrencyCode string        `json:"unofficial_currency_code"`
}

type providerRemovedTransaction struct {
	TransactionID string `json:"transaction_id"`
}

type providerSyncPage struct {
	Added      []json.RawMessage `json:"added"`
	Modified   []json.RawMessage `json:"modified"`
	Removed    []json.RawMessage `json:"removed"`
	NextCursor string            `json:"next_cursor"`
	HasMore    bool              `json:"has_more"`
	RequestID  string            `json:"request_id"`
}

func (c *Client) SyncTransactions(ctx context.Context, options SyncOptions) (TransactionSyncResult, error) {
	if err := c.validateItemCredential(); err != nil {
		return TransactionSyncResult{}, err
	}
	if options.Count == 0 {
		options.Count = 500
	}
	if options.MaxPages == 0 {
		options.MaxPages = 1000
	}
	if options.Count < 1 || options.Count > 500 {
		return TransactionSyncResult{}, fmt.Errorf("count must be between 1 and 500")
	}
	if options.MaxPages < 1 || options.MaxPages > 1000 {
		return TransactionSyncResult{}, fmt.Errorf("max_pages must be between 1 and 1000")
	}
	if options.MaxRestarts < 0 || options.MaxRestarts > 10 {
		return TransactionSyncResult{}, fmt.Errorf("max_restarts must be between 0 and 10")
	}

	startingCursor := strings.TrimSpace(options.Cursor)
	restartEvidence := []SyncRestartEvidence{}
	for attempt := 0; ; attempt++ {
		result := TransactionSyncResult{
			CredentialBindings:  c.bindings,
			CompletionState:     "in_progress",
			CursorCommitAllowed: false,
			StartingCursor:      startingCursor,
			NextCursor:          startingCursor,
			Added:               []Transaction{},
			Modified:            []Transaction{},
			Removed:             []RemovedTransaction{},
			Changes:             []TransactionChange{},
			PageEvidence:        []SourceEvidence{},
			RawPages:            []json.RawMessage{},
			RestartEvidence:     restartEvidence,
		}
		cursor := startingCursor
		seenCursors := map[string]struct{}{cursor: {}}
		restart := false

		for pageNumber := 1; pageNumber <= options.MaxPages; pageNumber++ {
			payload := map[string]any{
				"access_token": c.accessToken,
				"count":        options.Count,
			}
			if cursor != "" {
				payload["cursor"] = cursor
			}
			var page providerSyncPage
			raw, evidence, err := c.post(ctx, "/transactions/sync", payload, &page)
			if err != nil {
				apiError, ok := IsAPIError(err)
				if ok && apiError.IsPaginationMutation() {
					digest := sha256.Sum256(apiError.Raw)
					restartEvidence = append(restartEvidence, SyncRestartEvidence{
						Attempt:               attempt + 1,
						Reason:                apiError.ErrorCode,
						OriginalCursor:        startingCursor,
						DiscardedPageEvidence: append([]SourceEvidence(nil), result.PageEvidence...),
						DiscardedRawPages:     copyRawPages(result.RawPages),
						ErrorEvidence:         apiError.Evidence,
						ErrorPayloadSHA256:    hex.EncodeToString(digest[:]),
						ErrorRequestID:        apiError.RequestID,
						ErrorRaw:              copyRaw(apiError.Raw),
					})
					if attempt >= options.MaxRestarts {
						result.Restarts = len(restartEvidence)
						result.RestartEvidence = restartEvidence
						return terminateSyncResult(result, "pagination_mutation", apiError.Error(), pageNumber, cursor, apiError), nil
					}
					restart = true
					break
				}
				result.Restarts = len(restartEvidence)
				result.RestartEvidence = restartEvidence
				if evidence.Endpoint != "" {
					return terminateSyncResultWithResponse(result, "provider_response", err.Error(), pageNumber, cursor, raw, evidence, apiError), nil
				}
				if result.Pages > 0 {
					return terminateSyncResultWithoutResponse(result, "provider_request", err.Error(), pageNumber, cursor), nil
				}
				return result, err
			}

			// Capture every fetched page before normalization. If the provider
			// payload is malformed, callers still receive the exact response bytes
			// and hash-bound evidence in a terminal, non-committable result.
			result.PageEvidence = append(result.PageEvidence, evidence)
			result.RawPages = append(result.RawPages, raw)
			result.Pages++

			added, err := normalizeTransactions(page.Added)
			if err != nil {
				return terminateSyncResultWithResponse(result, "normalize_added", fmt.Sprintf("normalize added transactions: %v", err), pageNumber, cursor, raw, evidence, nil), nil
			}
			modified, err := normalizeTransactions(page.Modified)
			if err != nil {
				return terminateSyncResultWithResponse(result, "normalize_modified", fmt.Sprintf("normalize modified transactions: %v", err), pageNumber, cursor, raw, evidence, nil), nil
			}
			removed, err := normalizeRemovedTransactions(page.Removed)
			if err != nil {
				return terminateSyncResultWithResponse(result, "normalize_removed", fmt.Sprintf("normalize removed transactions: %v", err), pageNumber, cursor, raw, evidence, nil), nil
			}
			result.Added = append(result.Added, added...)
			result.Modified = append(result.Modified, modified...)
			result.Removed = append(result.Removed, removed...)

			if strings.TrimSpace(page.NextCursor) == "" {
				return terminateSyncResultWithResponse(result, "cursor_validation", "Plaid transaction sync returned an empty next_cursor", pageNumber, cursor, raw, evidence, nil), nil
			}

			if !page.HasMore {
				result.Restarts = len(restartEvidence)
				result.RestartEvidence = restartEvidence
				changes, changeErr := buildTransactionChanges(c.now, result.Added, result.Modified, result.Removed)
				if changeErr != nil {
					return terminateSyncResultWithResponse(result, "change_build", changeErr.Error(), pageNumber, cursor, raw, evidence, nil), nil
				}
				result.Changes = changes
				result.NextCursor = page.NextCursor
				result.CompletionState = "complete"
				result.CursorCommitAllowed = true
				return result, nil
			}
			if _, exists := seenCursors[page.NextCursor]; exists {
				return terminateSyncResultWithResponse(result, "cursor_validation", fmt.Sprintf("Plaid transaction sync repeated cursor %q", page.NextCursor), pageNumber, cursor, raw, evidence, nil), nil
			}
			seenCursors[page.NextCursor] = struct{}{}
			cursor = page.NextCursor
		}

		if restart {
			continue
		}
		result.Restarts = len(restartEvidence)
		result.RestartEvidence = restartEvidence
		return terminateSyncResultWithResponse(
			result,
			"page_limit",
			fmt.Sprintf("Plaid transaction sync exceeded max_pages=%d", options.MaxPages),
			options.MaxPages,
			cursor,
			result.RawPages[len(result.RawPages)-1],
			result.PageEvidence[len(result.PageEvidence)-1],
			nil,
		), nil
	}
}

func terminateSyncResult(result TransactionSyncResult, stage string, message string, pageNumber int, cursor string, apiError *APIError) TransactionSyncResult {
	if apiError == nil {
		return terminateSyncResultWithoutResponse(result, stage, message, pageNumber, cursor)
	}
	return terminateSyncResultWithResponse(result, stage, message, pageNumber, cursor, apiError.Raw, apiError.Evidence, apiError)
}

func terminateSyncResultWithResponse(result TransactionSyncResult, stage string, message string, pageNumber int, cursor string, raw json.RawMessage, evidence SourceEvidence, apiError *APIError) TransactionSyncResult {
	evidenceCopy := evidence
	terminal := &SyncTerminalError{
		Stage:           stage,
		Message:         message,
		PageNumber:      pageNumber,
		AttemptedCursor: cursor,
		Evidence:        &evidenceCopy,
		Raw:             copyValidRaw(raw),
	}
	if apiError != nil {
		terminal.StatusCode = apiError.StatusCode
		terminal.ErrorType = apiError.ErrorType
		terminal.ErrorCode = apiError.ErrorCode
	}
	return finalizeTerminalSyncResult(result, terminal)
}

func terminateSyncResultWithoutResponse(result TransactionSyncResult, stage string, message string, pageNumber int, cursor string) TransactionSyncResult {
	return finalizeTerminalSyncResult(result, &SyncTerminalError{
		Stage:           stage,
		Message:         message,
		PageNumber:      pageNumber,
		AttemptedCursor: cursor,
	})
}

func finalizeTerminalSyncResult(result TransactionSyncResult, terminal *SyncTerminalError) TransactionSyncResult {
	result.CompletionState = "terminal_error"
	result.CursorCommitAllowed = false
	result.NextCursor = result.StartingCursor
	// Partial normalized rows are never authoritative. Exact fetched bytes and
	// page evidence remain available for investigation, but no consumer should
	// mistake a partial projection for a completed sync.
	result.Added = []Transaction{}
	result.Modified = []Transaction{}
	result.Removed = []RemovedTransaction{}
	result.Changes = []TransactionChange{}
	result.TerminalError = terminal
	return result
}

func normalizeTransactions(rawTransactions []json.RawMessage) ([]Transaction, error) {
	result := make([]Transaction, 0, len(rawTransactions))
	for _, raw := range rawTransactions {
		var provider providerTransaction
		if err := decodeProviderJSON(raw, &provider); err != nil {
			return nil, err
		}
		if strings.TrimSpace(provider.TransactionID) == "" {
			return nil, fmt.Errorf("provider transaction missing transaction_id")
		}
		if strings.TrimSpace(provider.AccountID) == "" {
			return nil, fmt.Errorf("provider transaction %s missing account_id", provider.TransactionID)
		}
		if !provider.Amount.Valid() {
			return nil, fmt.Errorf("provider transaction %s missing amount", provider.TransactionID)
		}
		amount, err := exactMoney(provider.Amount, provider.ISOCurrencyCode, provider.UnofficialCurrencyCode)
		if err != nil {
			return nil, err
		}
		result = append(result, Transaction{
			ProviderTransactionID:        provider.TransactionID,
			ProviderAccountID:            provider.AccountID,
			Pending:                      provider.Pending,
			ProviderPendingTransactionID: provider.PendingTransactionID,
			Date:                         provider.Date,
			AuthorizedDate:               provider.AuthorizedDate,
			Datetime:                     provider.Datetime,
			Name:                         provider.Name,
			MerchantName:                 provider.MerchantName,
			Amount:                       amount,
			Raw:                          copyRaw(raw),
		})
	}
	return result, nil
}

func normalizeRemovedTransactions(rawTransactions []json.RawMessage) ([]RemovedTransaction, error) {
	result := make([]RemovedTransaction, 0, len(rawTransactions))
	for _, raw := range rawTransactions {
		var provider providerRemovedTransaction
		if err := decodeProviderJSON(raw, &provider); err != nil {
			return nil, err
		}
		if strings.TrimSpace(provider.TransactionID) == "" {
			return nil, fmt.Errorf("removed provider transaction missing transaction_id")
		}
		result = append(result, RemovedTransaction{
			ProviderTransactionID: provider.TransactionID,
			Raw:                   copyRaw(raw),
		})
	}
	return result, nil
}

func buildTransactionChanges(now func() time.Time, added []Transaction, modified []Transaction, removed []RemovedTransaction) ([]TransactionChange, error) {
	observedAt := now().UTC().Format(time.RFC3339Nano)
	changes := make([]TransactionChange, 0, len(added)+len(modified)+len(removed))
	for _, transaction := range added {
		change, err := transactionChange("added", transaction, observedAt)
		if err != nil {
			return nil, err
		}
		changes = append(changes, change)
	}
	for _, transaction := range modified {
		change, err := transactionChange("modified", transaction, observedAt)
		if err != nil {
			return nil, err
		}
		changes = append(changes, change)
	}
	for _, transaction := range removed {
		canonical, err := canonicalJSON(transaction.Raw)
		if err != nil {
			return nil, err
		}
		payloadSHA := payloadDigest(canonical)
		changeDigest := changeIdentityDigest("removed", canonical)
		changes = append(changes, TransactionChange{
			ProviderEventID:       changeEventID(transaction.ProviderTransactionID, "removed", changeDigest),
			ChangeAction:          "removed",
			ProviderTransactionID: transaction.ProviderTransactionID,
			SourcePayloadSHA256:   payloadSHA,
			ChangeIdentitySHA256:  changeDigest,
			ObservedAt:            observedAt,
			Raw:                   transaction.Raw,
		})
	}
	return changes, nil
}

func transactionChange(action string, transaction Transaction, observedAt string) (TransactionChange, error) {
	canonical, err := canonicalJSON(transaction.Raw)
	if err != nil {
		return TransactionChange{}, err
	}
	payloadSHA := payloadDigest(canonical)
	changeDigest := changeIdentityDigest(action, canonical)
	supersedes := ""
	if !transaction.Pending && transaction.ProviderPendingTransactionID != "" {
		supersedes = transaction.ProviderPendingTransactionID
	}
	return TransactionChange{
		ProviderEventID:                 changeEventID(transaction.ProviderTransactionID, action, changeDigest),
		ChangeAction:                    action,
		ProviderTransactionID:           transaction.ProviderTransactionID,
		ProviderPendingTransactionID:    transaction.ProviderPendingTransactionID,
		SupersedesProviderTransactionID: supersedes,
		ProviderAccountID:               transaction.ProviderAccountID,
		Pending:                         transaction.Pending,
		Amount:                          transaction.Amount,
		SourcePayloadSHA256:             payloadSHA,
		ChangeIdentitySHA256:            changeDigest,
		ObservedAt:                      observedAt,
		Raw:                             transaction.Raw,
	}, nil
}

func payloadDigest(canonical []byte) string {
	digest := sha256.Sum256(canonical)
	return hex.EncodeToString(digest[:])
}

func changeIdentityDigest(action string, canonical []byte) string {
	digest := sha256.Sum256(append(append([]byte(action), '\n'), canonical...))
	return hex.EncodeToString(digest[:])
}

func changeEventID(providerTransactionID string, action string, digest string) string {
	return fmt.Sprintf("plaid:transaction:%s:%s:%s", providerTransactionID, action, digest[:24])
}

func copyRawPages(pages []json.RawMessage) []json.RawMessage {
	result := make([]json.RawMessage, 0, len(pages))
	for _, page := range pages {
		result = append(result, copyRaw(page))
	}
	return result
}
