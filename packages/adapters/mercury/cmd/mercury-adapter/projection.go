package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/nexus-project/adapter-mercury/internal/catalog"
	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	mercuryMonitorInterval      = 5 * time.Minute
	mercuryMonitorErrorBackoff  = 1 * time.Minute
	mercuryMonitorReplayWindow  = 24 * time.Hour
	mercuryProjectionPageLimit  = 100
	mercuryProjectionPageSize   = 1000
	mercuryCaptureContract      = "nex_mercury_api_capture_v1"
	mercuryRecordContract       = "nex_mercury_record_revision_v1"
	mercuryAttachmentIDContract = "nex_mercury_derived_attachment_identity_v1"
	mercuryProjectionRecordText = "Mercury immutable provider revision"
)

// Mercury filters its transaction list by creation time, and the poll cursor moves to each capture's time, so a
// transaction still open (pending) when the cursor passed its creation was never read again and its posting never
// reached Nex (W1-X89). The monitor reads the list again from the creation time of the oldest transaction it last
// read as open: at a run's first poll, back to the open-transaction window, and then at most once each re-read
// interval while one is open. A transaction still open after the window is no longer read again, and is said once.
const (
	mercuryMonitorOpenTransactionWindow = 45 * 24 * time.Hour
	mercuryMonitorOpenTransactionReread = time.Hour
)

type mercuryProjectionSource struct {
	OperationID  string
	Family       string
	ArrayField   string
	IDField      string
	TimestampKey []string
}

type mercuryProjectionFetch struct {
	Source         mercuryProjectionSource
	PathParameters map[string]any
	Query          map[string]any
}

type mercuryDateWindow struct {
	Start time.Time
	End   time.Time
}

var mercuryProjectionSources = map[string]mercuryProjectionSource{
	"getAccounts": {
		OperationID:  "getAccounts",
		Family:       "account_snapshot",
		ArrayField:   "accounts",
		IDField:      "id",
		TimestampKey: []string{"createdAt"},
	},
	"listCredit": {
		OperationID:  "listCredit",
		Family:       "account_snapshot",
		ArrayField:   "accounts",
		IDField:      "id",
		TimestampKey: []string{"createdAt"},
	},
	"listTransactions": {
		OperationID:  "listTransactions",
		Family:       "transaction_revision",
		ArrayField:   "transactions",
		IDField:      "id",
		TimestampKey: []string{"postedAt", "createdAt", "estimatedDeliveryDate"},
	},
	"getRecipients": {
		OperationID:  "getRecipients",
		Family:       "recipient_revision",
		ArrayField:   "recipients",
		IDField:      "id",
		TimestampKey: []string{"dateLastPaid"},
	},
	"listSendMoneyApprovalRequests": {
		OperationID:  "listSendMoneyApprovalRequests",
		Family:       "approval_request_revision",
		ArrayField:   "requests",
		IDField:      "requestId",
		TimestampKey: []string{"createdAt", "scheduledSendDate"},
	},
	"getAccountStatements": {
		OperationID:  "getAccountStatements",
		Family:       "statement_revision",
		ArrayField:   "statements",
		IDField:      "id",
		TimestampKey: []string{"endDate", "startDate"},
	},
}

func mercuryBackfill(ctx nexadapter.AdapterContext[*mercuryClient], window nexadapter.BackfillWindow, emit nexadapter.EmitFunc) error {
	if window.Since.IsZero() {
		return errors.New("Mercury backfill requires a nonzero start boundary")
	}
	if !window.To.IsZero() && window.To.Before(window.Since) {
		return errors.New("Mercury backfill end boundary precedes start boundary")
	}
	records, _, err := fetchMercuryProjection(ctx.Context, ctx.Client, window.Since.UTC(), window.To.UTC())
	if err != nil {
		return err
	}
	for _, record := range records {
		emit(record)
	}
	return nil
}

func mercuryMonitor(ctx nexadapter.AdapterContext[*mercuryClient], emit nexadapter.EmitFunc) error {
	transactions := newMercuryTransactionReads()
	poll := nexadapter.PollMonitor(nexadapter.PollConfig[nexadapter.AdapterInboundRecord]{
		Interval:      mercuryMonitorInterval,
		ErrorBackoff:  mercuryMonitorErrorBackoff,
		InitialCursor: time.Now().UTC().Add(-mercuryMonitorReplayWindow),
		Fetch: func(fetchContext context.Context, since time.Time) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
			return transactions.fetch(fetchContext, ctx.Client, since.UTC(), time.Now().UTC())
		},
		MaxConsecutiveErrors: 5,
	})
	return poll(ctx.Context, ctx.ConnectionID, emit)
}

// mercuryTransactionFinalStatuses are the statuses after which the monitor stops reading a transaction again: sent (the
// bank's posted), cancelled, failed and reversed. Any other status, pending or one this code does not know, is open.
var mercuryTransactionFinalStatuses = map[string]bool{
	"sent":      true,
	"cancelled": true,
	"failed":    true,
	"reversed":  true,
}

func mercuryTransactionStatus(object map[string]any) string {
	status, _ := object["status"].(string)
	return strings.ToLower(strings.TrimSpace(status))
}

// mercuryTransactionChangeDigest is the SHA-256 of a transaction row with its attachments' URLs left out: Mercury signs
// those again on every read, so they are no change of the transaction.
func mercuryTransactionChangeDigest(object map[string]any) (string, error) {
	stable := make(map[string]any, len(object))
	for key, value := range object {
		stable[key] = value
	}
	if items, ok := object["attachments"].([]any); ok {
		attachments := make([]any, 0, len(items))
		for _, item := range items {
			attachment, ok := item.(map[string]any)
			if !ok {
				attachments = append(attachments, item)
				continue
			}
			trimmed := make(map[string]any, len(attachment))
			for key, value := range attachment {
				if key != "url" {
					trimmed[key] = value
				}
			}
			attachments = append(attachments, trimmed)
		}
		stable["attachments"] = attachments
	}
	canonical, err := json.Marshal(stable)
	if err != nil {
		return "", fmt.Errorf("canonicalize Mercury transaction for change: %w", err)
	}
	return sha256Hex(canonical), nil
}

// mercuryTransactionRow is what one read saw of a transaction, kept until the whole fetch has succeeded.
type mercuryTransactionRow struct {
	createdAt time.Time
	open      bool
	digest    string
}

// mercuryTransactionReads is the monitor's memory of Mercury's transactions for one run (W1-X89). It decides where each
// poll's transaction read starts and which rows of it are recorded: a row is recorded when it is new to this run or
// Mercury changed it, never again unchanged (each record carries its capture time, so an unchanged row read again would
// be a new record). Nothing is kept across runs: a run's first read reaches back over the open-transaction window.
type mercuryTransactionReads struct {
	open     map[string]time.Time // transaction id -> its creation time, for each transaction last read as open
	digests  map[string]string    // transaction id -> its change digest when this run last read it
	started  bool                 // this run's first read has succeeded
	rereadAt time.Time            // when the read last reached back to the oldest open transaction
}

func newMercuryTransactionReads() *mercuryTransactionReads {
	return &mercuryTransactionReads{open: map[string]time.Time{}, digests: map[string]string{}}
}

// fetch is one poll. Its transaction read starts at the poll cursor, as before, except at the run's first poll, which
// reaches back over the open-transaction window, and once each re-read interval while a transaction is open, when it
// reaches back to the oldest open one. Memory changes only when the whole fetch succeeds, so a failed fetch is read again
// whole at the next poll.
func (reads *mercuryTransactionReads) fetch(
	ctx context.Context,
	client *mercuryClient,
	since time.Time,
	now time.Time,
) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
	floor := now.Add(-mercuryMonitorOpenTransactionWindow)
	reread := !reads.started || (len(reads.open) > 0 && now.Sub(reads.rereadAt) >= mercuryMonitorOpenTransactionReread)
	transactionsSince := since
	if reread {
		from := floor
		if reads.started {
			from = now
			for _, createdAt := range reads.open {
				if createdAt.Before(from) {
					from = createdAt
				}
			}
			if from.Before(floor) {
				from = floor
			}
		}
		if from.Before(transactionsSince) {
			transactionsSince = from
		}
	}
	firstRead := !reads.started
	seen := map[string]mercuryTransactionRow{}
	keep := func(object map[string]any) (bool, error) {
		id, err := requiredProviderID(object, "id")
		if err != nil {
			return false, err
		}
		digest, err := mercuryTransactionChangeDigest(object)
		if err != nil {
			return false, err
		}
		status := mercuryTransactionStatus(object)
		row := mercuryTransactionRow{
			createdAt: providerTimestamp(object, []string{"createdAt"}, transactionsSince),
			open:      !mercuryTransactionFinalStatuses[status],
			digest:    digest,
		}
		seen[id] = row
		if previous, known := reads.digests[id]; known {
			return previous != digest, nil
		}
		if !firstRead || !row.createdAt.Before(since) || row.open || status != "sent" {
			return true, nil
		}
		// The run's first read reaches back over the window: a transaction created before the cursor and posted before it
		// was read by an earlier run (or is the backfill's to catch up), so it is not recorded again.
		postedAt := providerTimestamp(object, []string{"postedAt"}, time.Time{})
		return !postedAt.IsZero() && !postedAt.Before(since), nil
	}
	records, capturedAt, err := fetchMercuryProjectionReading(ctx, client, since, time.Time{}, transactionsSince, keep)
	if err != nil {
		return nil, time.Time{}, err
	}
	for id, row := range seen {
		reads.digests[id] = row.digest
		if row.open {
			reads.open[id] = row.createdAt
		} else {
			delete(reads.open, id)
		}
	}
	if reread && client != nil && client.role == rolePrimaryRead {
		// The read covered every transaction created since it began: an open one it did not return began before the
		// window (or is gone) and is no longer read again; the rest of the memory is what the window holds.
		for id, createdAt := range reads.open {
			if _, returned := seen[id]; !returned {
				delete(reads.open, id)
				nexadapter.LogInfo(
					"Mercury transaction %s, open since %s, is older than the %d-day window and is no longer read again",
					id,
					createdAt.Format(time.RFC3339),
					int(mercuryMonitorOpenTransactionWindow/(24*time.Hour)),
				)
			}
		}
		for id := range reads.digests {
			if _, returned := seen[id]; !returned {
				delete(reads.digests, id)
			}
		}
		reads.rereadAt = now
	}
	reads.started = true
	return records, capturedAt, nil
}

func fetchMercuryProjection(
	ctx context.Context,
	client *mercuryClient,
	since time.Time,
	to time.Time,
) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
	return fetchMercuryProjectionReading(ctx, client, since, to, since, nil)
}

// fetchMercuryProjectionReading is fetchMercuryProjection whose transaction read starts at transactionsSince (no later
// than since), and records only the transaction rows keepTransaction keeps (all of them when it is nil). The capture
// receipts always hold every row read.
func fetchMercuryProjectionReading(
	ctx context.Context,
	client *mercuryClient,
	since time.Time,
	to time.Time,
	transactionsSince time.Time,
	keepTransaction func(object map[string]any) (bool, error),
) ([]nexadapter.AdapterInboundRecord, time.Time, error) {
	if client == nil {
		return nil, time.Time{}, errors.New("missing Mercury client")
	}
	if since.IsZero() {
		return nil, time.Time{}, errors.New("Mercury projection requires a nonzero cursor")
	}
	if !to.IsZero() && to.Before(since) {
		return nil, time.Time{}, errors.New("Mercury projection end boundary precedes cursor")
	}
	if transactionsSince.IsZero() || transactionsSince.After(since) {
		transactionsSince = since
	}
	capturedAt := time.Now().UTC()
	fetches := []mercuryProjectionFetch{}
	if client.role == rolePrimaryRead {
		fetches = append(fetches,
			mercuryProjectionFetch{
				Source: mercuryProjectionSources["getAccounts"],
				Query: map[string]any{
					"limit": mercuryProjectionPageSize,
					"order": "asc",
				},
			},
			mercuryProjectionFetch{
				Source: mercuryProjectionSources["listCredit"],
				Query: map[string]any{
					"limit": mercuryProjectionPageSize,
					"order": "asc",
				},
			},
			mercuryProjectionFetch{
				Source: mercuryProjectionSources["listTransactions"],
				Query: map[string]any{
					"start": transactionsSince.UTC().Format(time.RFC3339),
					"limit": mercuryProjectionPageSize,
					"order": "asc",
				},
			},
		)
		if !to.IsZero() {
			fetches[len(fetches)-1].Query["end"] = to.UTC().Format(time.RFC3339)
		}
	}
	fetches = append(fetches,
		mercuryProjectionFetch{
			Source: mercuryProjectionSources["getRecipients"],
			Query: map[string]any{
				"limit": mercuryProjectionPageSize,
				"order": "asc",
			},
		},
		mercuryProjectionFetch{
			Source: mercuryProjectionSources["listSendMoneyApprovalRequests"],
			Query: map[string]any{
				"limit": mercuryProjectionPageSize,
			},
		},
	)

	records := []nexadapter.AdapterInboundRecord{}
	accountIDs := []string{}
	accountStatementStarts := map[string]time.Time{}
	for _, fetch := range fetches {
		response, err := invokeProjectionSource(ctx, client, fetch)
		if err != nil {
			return nil, time.Time{}, err
		}
		captureScopeSHA256, scopeErr := mercuryCaptureScopeSHA256(fetch.PathParameters)
		if scopeErr != nil {
			return nil, time.Time{}, scopeErr
		}
		var keepRow func(object map[string]any) (bool, error)
		if fetch.Source.OperationID == "listTransactions" {
			keepRow = keepTransaction
		}
		projected, err := projectMercuryResponseKeeping(
			client,
			fetch.Source,
			response,
			capturedAt,
			keepRow,
			captureScopeSHA256,
		)
		if err != nil {
			return nil, time.Time{}, err
		}
		records = append(records, projected...)
		if fetch.Source.OperationID == "getAccounts" {
			accountIDs, err = projectionProviderIDs(response, fetch.Source)
			if err != nil {
				return nil, time.Time{}, err
			}
			accountStatementStarts, err = projectionProviderTimestamps(response, fetch.Source, "createdAt", since)
			if err != nil {
				return nil, time.Time{}, err
			}
		}
	}

	if client.role == rolePrimaryRead {
		statementEnd := capturedAt
		if !to.IsZero() {
			statementEnd = to
		}
		for _, accountID := range accountIDs {
			statementStart := since
			if createdAt := accountStatementStarts[accountID]; createdAt.After(statementStart) {
				statementStart = createdAt
			}
			for _, statementWindow := range mercuryStatementDateWindows(statementStart, statementEnd) {
				fetch := mercuryProjectionFetch{
					Source: mercuryProjectionSources["getAccountStatements"],
					PathParameters: map[string]any{
						"accountId": accountID,
					},
					Query: map[string]any{
						"start": statementWindow.Start.Format("2006-01-02"),
						"end":   statementWindow.End.Format("2006-01-02"),
						"limit": mercuryProjectionPageSize,
						"order": "asc",
					},
				}
				response, err := invokeProjectionSource(ctx, client, fetch)
				if err != nil {
					return nil, time.Time{}, err
				}
				captureScopeSHA256, scopeErr := mercuryCaptureScopeSHA256(fetch.PathParameters)
				if scopeErr != nil {
					return nil, time.Time{}, scopeErr
				}
				projected, err := projectMercuryResponse(
					client,
					fetch.Source,
					response,
					capturedAt,
					captureScopeSHA256,
				)
				if err != nil {
					return nil, time.Time{}, err
				}
				records = append(records, projected...)
			}
		}
	}

	return records, capturedAt, nil
}

func mercuryStatementDateWindows(start, end time.Time) []mercuryDateWindow {
	start = time.Date(start.UTC().Year(), start.UTC().Month(), start.UTC().Day(), 0, 0, 0, 0, time.UTC)
	end = time.Date(end.UTC().Year(), end.UTC().Month(), end.UTC().Day(), 0, 0, 0, 0, time.UTC)
	if start.After(end) {
		return nil
	}
	windows := []mercuryDateWindow{}
	for !start.After(end) {
		windowEnd := start.AddDate(0, 3, -1)
		if windowEnd.After(end) {
			windowEnd = end
		}
		windows = append(windows, mercuryDateWindow{Start: start, End: windowEnd})
		start = windowEnd.AddDate(0, 0, 1)
	}
	return windows
}

func invokeProjectionSource(
	ctx context.Context,
	client *mercuryClient,
	fetch mercuryProjectionFetch,
) (*mercuryMethodResponse, error) {
	operation, err := mercuryOperation(fetch.Source.OperationID)
	if err != nil {
		return nil, err
	}
	payload := map[string]any{
		"path_parameters": fetch.PathParameters,
		"query":           fetch.Query,
		"auto_paginate":   true,
		"max_pages":       mercuryProjectionPageLimit,
	}
	if payload["path_parameters"] == nil {
		payload["path_parameters"] = map[string]any{}
	}
	if payload["query"] == nil {
		payload["query"] = map[string]any{}
	}
	response, err := client.invoke(ctx, operation, payload)
	if err != nil {
		return nil, fmt.Errorf("capture Mercury %s: %w", fetch.Source.OperationID, err)
	}
	if !response.Complete {
		return nil, fmt.Errorf("capture Mercury %s exceeded %d pages", fetch.Source.OperationID, mercuryProjectionPageLimit)
	}
	return response, nil
}

func mercuryOperation(operationID string) (catalog.Operation, error) {
	for _, operation := range catalog.MustOperations() {
		if operation.OperationID == operationID && operation.Visibility == "public" {
			return operation, nil
		}
	}
	return catalog.Operation{}, fmt.Errorf("Mercury operation %s is absent", operationID)
}

func projectMercuryResponse(
	client *mercuryClient,
	source mercuryProjectionSource,
	response *mercuryMethodResponse,
	capturedAt time.Time,
	captureScopeSHA256Values ...string,
) ([]nexadapter.AdapterInboundRecord, error) {
	return projectMercuryResponseKeeping(client, source, response, capturedAt, nil, captureScopeSHA256Values...)
}

// projectMercuryResponseKeeping is projectMercuryResponse that makes revision records only of the rows keepRow keeps
// (every row when it is nil); each page's capture receipt still holds and counts every row of the page.
func projectMercuryResponseKeeping(
	client *mercuryClient,
	source mercuryProjectionSource,
	response *mercuryMethodResponse,
	capturedAt time.Time,
	keepRow func(object map[string]any) (bool, error),
	captureScopeSHA256Values ...string,
) ([]nexadapter.AdapterInboundRecord, error) {
	if client == nil || response == nil {
		return nil, errors.New("Mercury projection requires client and response")
	}
	if response.ProviderWriteAttempted {
		return nil, errors.New("Mercury read projection observed a provider write attempt")
	}
	if response.ProviderOperationID != source.OperationID {
		return nil, errors.New("Mercury response operation mismatch")
	}
	if response.ConnectionRole != string(client.role) {
		return nil, errors.New("Mercury response connection-role mismatch")
	}
	if !response.Complete {
		return nil, errors.New("Mercury projection refuses an incomplete provider capture")
	}
	if response.PageCount != len(response.Pages) || response.ProviderCalls < len(response.Pages) {
		return nil, errors.New("Mercury response page inventory is inconsistent")
	}
	captureScopeSHA256, err := mercuryCaptureScopeSHA256(nil)
	if err != nil {
		return nil, err
	}
	if len(captureScopeSHA256Values) > 0 {
		captureScopeSHA256 = strings.TrimSpace(captureScopeSHA256Values[0])
	}
	if len(captureScopeSHA256Values) > 1 || len(captureScopeSHA256) != 64 {
		return nil, errors.New("Mercury capture scope SHA-256 is invalid")
	}
	if _, err := hex.DecodeString(captureScopeSHA256); err != nil {
		return nil, errors.New("Mercury capture scope SHA-256 is invalid")
	}
	records := []nexadapter.AdapterInboundRecord{}
	for pageIndex, page := range response.Pages {
		if page.HTTPStatus != http.StatusOK {
			return nil, fmt.Errorf("Mercury %s page %d is not HTTP 200", source.OperationID, pageIndex+1)
		}
		if !strings.HasPrefix(strings.ToLower(page.ContentType), "application/json") {
			return nil, fmt.Errorf("Mercury %s page %d is not JSON", source.OperationID, pageIndex+1)
		}
		if page.BodyEncoding != "utf8_json" {
			return nil, fmt.Errorf("Mercury %s projection requires JSON UTF-8", source.OperationID)
		}
		if page.RequestAttempts < 1 || page.RequestAttempts > maxGETAttempts {
			return nil, fmt.Errorf("Mercury %s page %d has invalid attempt count", source.OperationID, pageIndex+1)
		}
		bodyBytes := []byte(page.Body)
		digest := sha256.Sum256(bodyBytes)
		if hex.EncodeToString(digest[:]) != page.BodySHA256 {
			return nil, fmt.Errorf("Mercury %s page %d digest mismatch", source.OperationID, pageIndex+1)
		}
		rows, err := projectionRows(bodyBytes, source.ArrayField)
		if err != nil {
			return nil, fmt.Errorf("Mercury %s page %d: %w", source.OperationID, pageIndex+1, err)
		}
		for _, row := range rows {
			if keepRow != nil {
				object, _, err := canonicalProviderObject(row)
				if err != nil {
					return nil, fmt.Errorf("Mercury %s page %d: %w", source.OperationID, pageIndex+1, err)
				}
				keep, err := keepRow(object)
				if err != nil {
					return nil, fmt.Errorf("Mercury %s page %d: %w", source.OperationID, pageIndex+1, err)
				}
				if !keep {
					continue
				}
			}
			rowRecords, err := buildMercuryRevisionRecords(client, source, row, capturedAt)
			if err != nil {
				return nil, fmt.Errorf("Mercury %s page %d: %w", source.OperationID, pageIndex+1, err)
			}
			records = append(records, rowRecords...)
		}
		receipt, err := buildMercuryCaptureReceipt(
			client,
			source,
			page,
			pageIndex+1,
			len(rows),
			capturedAt,
			captureScopeSHA256,
		)
		if err != nil {
			return nil, err
		}
		records = append(records, receipt)
	}
	return records, nil
}

func mercuryCaptureScopeSHA256(pathParameters map[string]any) (string, error) {
	if pathParameters == nil {
		pathParameters = map[string]any{}
	}
	canonical, err := json.Marshal(pathParameters)
	if err != nil {
		return "", fmt.Errorf("canonicalize Mercury capture scope: %w", err)
	}
	return sha256Hex(canonical), nil
}

func projectionRows(body []byte, arrayField string) ([]json.RawMessage, error) {
	var page map[string]json.RawMessage
	if err := json.Unmarshal(body, &page); err != nil {
		return nil, fmt.Errorf("parse provider page: %w", err)
	}
	rawRows, exists := page[arrayField]
	if !exists {
		return nil, fmt.Errorf("provider page omitted %s", arrayField)
	}
	var rows []json.RawMessage
	if err := json.Unmarshal(rawRows, &rows); err != nil {
		return nil, fmt.Errorf("parse provider rows: %w", err)
	}
	return rows, nil
}

func projectionProviderIDs(response *mercuryMethodResponse, source mercuryProjectionSource) ([]string, error) {
	ids := []string{}
	for _, page := range response.Pages {
		if page.BodyEncoding != "utf8_json" {
			return nil, errors.New("provider identifiers require JSON UTF-8")
		}
		rows, err := projectionRows([]byte(page.Body), source.ArrayField)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			object, _, err := canonicalProviderObject(row)
			if err != nil {
				return nil, err
			}
			id, err := requiredProviderID(object, source.IDField)
			if err != nil {
				return nil, err
			}
			ids = append(ids, id)
		}
	}
	return ids, nil
}

func projectionProviderTimestamps(
	response *mercuryMethodResponse,
	source mercuryProjectionSource,
	timestampField string,
	fallback time.Time,
) (map[string]time.Time, error) {
	result := map[string]time.Time{}
	for _, page := range response.Pages {
		if page.BodyEncoding != "utf8_json" {
			return nil, errors.New("provider timestamps require JSON UTF-8")
		}
		rows, err := projectionRows([]byte(page.Body), source.ArrayField)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			object, _, err := canonicalProviderObject(row)
			if err != nil {
				return nil, err
			}
			id, err := requiredProviderID(object, source.IDField)
			if err != nil {
				return nil, err
			}
			result[id] = providerTimestamp(object, []string{timestampField}, fallback)
		}
	}
	return result, nil
}

func buildMercuryRevisionRecords(
	client *mercuryClient,
	source mercuryProjectionSource,
	raw json.RawMessage,
	capturedAt time.Time,
) ([]nexadapter.AdapterInboundRecord, error) {
	object, canonical, err := canonicalProviderObject(raw)
	if err != nil {
		return nil, err
	}
	providerID, err := requiredProviderID(object, source.IDField)
	if err != nil {
		return nil, err
	}
	occurredAt := providerTimestamp(object, source.TimestampKey, capturedAt)
	records := []nexadapter.AdapterInboundRecord{
		newMercuryRevisionRecord(client, source.Family, providerID, canonical, object, source.OperationID, occurredAt, capturedAt, nil),
	}
	if source.Family == "transaction_revision" {
		if requestID := optionalProviderID(object, "requestId"); requestID != "" {
			records = append(records, newMercuryRevisionRecord(
				client,
				"payment_revision",
				requestID,
				canonical,
				object,
				source.OperationID,
				occurredAt,
				capturedAt,
				nil,
			))
		}
	}
	if source.Family == "approval_request_revision" {
		if scheduledDate := optionalProviderID(object, "scheduledSendDate"); scheduledDate != "" {
			records = append(records, newMercuryRevisionRecord(
				client,
				"scheduled_payment_observation",
				providerID,
				canonical,
				object,
				source.OperationID,
				occurredAt,
				capturedAt,
				nil,
			))
		}
	}
	attachmentOccurrences := map[string]int{}
	for _, attachment := range embeddedAttachments(object) {
		attachmentObject, attachmentCanonical, err := canonicalProviderObject(attachment)
		if err != nil {
			return nil, err
		}
		attachmentID, identityMetadata, err := mercuryAttachmentProviderID(
			providerID,
			attachmentObject,
			attachmentOccurrences,
		)
		if err != nil {
			return nil, err
		}
		records = append(records, newMercuryRevisionRecord(
			client,
			"attachment_revision",
			attachmentID,
			attachmentCanonical,
			attachmentObject,
			source.OperationID,
			occurredAt,
			capturedAt,
			identityMetadata,
		))
	}
	return records, nil
}

func mercuryAttachmentProviderID(
	parentProviderID string,
	attachment map[string]any,
	occurrences map[string]int,
) (string, map[string]any, error) {
	if providerID := optionalProviderID(attachment, "id"); providerID != "" {
		return providerID, nil, nil
	}
	fileName := firstNonBlank(
		stringValue(attachment["fileName"]),
		stringValue(attachment["filename"]),
	)
	attachmentType := stringValue(attachment["attachmentType"])
	if fileName == "" && attachmentType == "" {
		return "", nil, errors.New("embedded Mercury attachment omitted id, filename, and attachmentType")
	}
	if strings.TrimSpace(parentProviderID) == "" {
		return "", nil, errors.New("embedded Mercury attachment requires its parent provider id")
	}
	identityBasis := strings.Join([]string{
		strings.TrimSpace(parentProviderID),
		strings.TrimSpace(attachmentType),
		strings.TrimSpace(fileName),
	}, "\x00")
	occurrences[identityBasis]++
	occurrence := occurrences[identityBasis]
	identityDigest := sha256Hex([]byte(fmt.Sprintf("%s\x00%d", identityBasis, occurrence)))
	return "derived_attachment_" + identityDigest, map[string]any{
		"provider_object_identity_contract": mercuryAttachmentIDContract,
		"parent_provider_object_id":         strings.TrimSpace(parentProviderID),
		"attachment_occurrence":             occurrence,
	}, nil
}

func canonicalProviderObject(raw json.RawMessage) (map[string]any, []byte, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var object map[string]any
	if err := decoder.Decode(&object); err != nil {
		return nil, nil, fmt.Errorf("parse provider object: %w", err)
	}
	if len(object) == 0 {
		return nil, nil, errors.New("provider object is empty")
	}
	canonical, err := json.Marshal(object)
	if err != nil {
		return nil, nil, fmt.Errorf("canonicalize provider object: %w", err)
	}
	return object, canonical, nil
}

func requiredProviderID(object map[string]any, field string) (string, error) {
	id := optionalProviderID(object, field)
	if id == "" {
		return "", fmt.Errorf("provider object omitted %s", field)
	}
	return id, nil
}

func optionalProviderID(object map[string]any, field string) string {
	value, exists := object[field]
	if !exists || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case json.Number:
		return strings.TrimSpace(typed.String())
	default:
		return ""
	}
}

func providerTimestamp(object map[string]any, keys []string, fallback time.Time) time.Time {
	for _, key := range keys {
		value, ok := object[key].(string)
		if !ok || strings.TrimSpace(value) == "" {
			continue
		}
		if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
			return parsed.UTC()
		}
		if parsed, err := time.Parse("2006-01-02", value); err == nil {
			return parsed.UTC()
		}
	}
	return fallback.UTC()
}

func embeddedAttachments(object map[string]any) []json.RawMessage {
	raw, exists := object["attachments"]
	if !exists || raw == nil {
		return nil
	}
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	attachments := make([]json.RawMessage, 0, len(items))
	for _, item := range items {
		encoded, err := json.Marshal(item)
		if err == nil {
			attachments = append(attachments, encoded)
		}
	}
	return attachments
}

func newMercuryRevisionRecord(
	client *mercuryClient,
	family string,
	providerID string,
	canonical []byte,
	object map[string]any,
	operationID string,
	occurredAt time.Time,
	capturedAt time.Time,
	identityMetadata map[string]any,
) nexadapter.AdapterInboundRecord {
	digest := sha256.Sum256(canonical)
	revision := hex.EncodeToString(digest[:])
	safeConnection := nexadapter.SafeIDToken(client.connectionID)
	safeProviderID := nexadapter.SafeIDToken(providerID)
	evidenceMetadata := map[string]any{
		"contract":                        mercuryRecordContract,
		"provider":                        "mercury",
		"environment":                     "production",
		"connection_role":                 string(client.role),
		"record_family":                   family,
		"provider_object_id":              providerID,
		"provider_object_id_sha256":       sha256Hex([]byte(providerID)),
		"provider_operation_id":           operationID,
		"provider_payload":                object,
		"provider_payload_canonical_json": string(canonical),
		"provider_payload_sha256":         revision,
		"captured_at":                     capturedAt.Format(time.RFC3339Nano),
		"provider_write_authority":        false,
		"journal_authority":               false,
		"payment_authority":               false,
		"tax_authority":                   false,
		"distribution_authority":          false,
		"cutover_authority":               false,
		"connection_id":                   client.connectionID,
		"credential_ref":                  client.credentialRef,
		"logical_row_id":                  providerID,
		"revision_hash":                   revision,
	}
	for key, value := range identityMetadata {
		evidenceMetadata[key] = value
	}
	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Adapter:       platformID,
			Platform:      platformID,
			ConnectionID:  client.connectionID,
			SenderID:      "mercury",
			SenderName:    "Mercury",
			ReceiverID:    client.connectionID,
			SpaceID:       "moonsleep",
			SpaceName:     "MoonSleep",
			ContainerKind: "group",
			ContainerID:   family,
			ContainerName: family,
			ThreadID:      fmt.Sprintf("mercury:%s:%s", family, safeProviderID),
			ThreadName:    providerID,
			Metadata: map[string]any{
				"family":                family,
				"provider_operation_id": operationID,
				"connection_role":       string(client.role),
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("mercury:%s:%s:%s:%s", safeConnection, family, safeProviderID, revision),
			Timestamp:        occurredAt.UnixMilli(),
			Content:          fmt.Sprintf("%s family=%s provider_id=%s", mercuryProjectionRecordText, family, providerID),
			ContentType:      "text",
			// Payload is retained for direct adapter consumers. Metadata carries
			// the same hash-bound evidence through the canonical record.ingest
			// boundary, whose public record row persists payload metadata.
			Payload:  evidenceMetadata,
			Metadata: evidenceMetadata,
		},
	}
}

func buildMercuryCaptureReceipt(
	client *mercuryClient,
	source mercuryProjectionSource,
	page mercuryMethodPage,
	pageNumber int,
	rowCount int,
	capturedAt time.Time,
	captureScopeSHA256 string,
) (nexadapter.AdapterInboundRecord, error) {
	if strings.TrimSpace(page.BodySHA256) == "" {
		return nexadapter.AdapterInboundRecord{}, errors.New("Mercury capture receipt requires page SHA-256")
	}
	if len(strings.TrimSpace(captureScopeSHA256)) != 64 {
		return nexadapter.AdapterInboundRecord{}, errors.New("Mercury capture receipt requires scope SHA-256")
	}
	if _, err := hex.DecodeString(captureScopeSHA256); err != nil {
		return nexadapter.AdapterInboundRecord{}, errors.New("Mercury capture receipt requires scope SHA-256")
	}
	// A response body may be byte-identical on consecutive polls.  The capture
	// receipt represents an observation occurrence, so its immutable external
	// identity must bind the capture clock as well as operation, page and body.
	receiptID := fmt.Sprintf(
		"%s:%s:%s:%03d:%s",
		capturedAt.UTC().Format(time.RFC3339Nano),
		source.OperationID,
		captureScopeSHA256,
		pageNumber,
		page.BodySHA256,
	)
	safeConnection := nexadapter.SafeIDToken(client.connectionID)
	evidenceMetadata := map[string]any{
		"contract":                 mercuryCaptureContract,
		"provider":                 "mercury",
		"environment":              "production",
		"connection_role":          string(client.role),
		"record_family":            "api_capture_receipt",
		"provider_operation_id":    source.OperationID,
		"capture_scope_sha256":     captureScopeSHA256,
		"page_number":              pageNumber,
		"row_count":                rowCount,
		"http_status":              page.HTTPStatus,
		"content_type":             page.ContentType,
		"body_encoding":            page.BodyEncoding,
		"provider_response_body":   page.Body,
		"provider_response_sha256": page.BodySHA256,
		"next_page":                page.NextPage,
		"request_attempts":         page.RequestAttempts,
		"captured_at":              capturedAt.Format(time.RFC3339Nano),
		"provider_write_attempted": false,
		"provider_write_authority": false,
		"journal_authority":        false,
		"payment_authority":        false,
		"tax_authority":            false,
		"distribution_authority":   false,
		"cutover_authority":        false,
		"connection_id":            client.connectionID,
		"credential_ref":           client.credentialRef,
		"revision_hash":            page.BodySHA256,
	}
	return nexadapter.AdapterInboundRecord{
		Operation: "record.ingest",
		Routing: nexadapter.AdapterInboundRouting{
			Adapter:       platformID,
			Platform:      platformID,
			ConnectionID:  client.connectionID,
			SenderID:      "mercury",
			SenderName:    "Mercury",
			ReceiverID:    client.connectionID,
			SpaceID:       "moonsleep",
			SpaceName:     "MoonSleep",
			ContainerKind: "group",
			ContainerID:   "api_capture_receipt",
			ContainerName: "API capture receipts",
			ThreadID: fmt.Sprintf(
				"mercury:api_capture_receipt:%s:%s",
				source.OperationID,
				captureScopeSHA256,
			),
			ThreadName: source.OperationID,
			Metadata: map[string]any{
				"family":                "api_capture_receipt",
				"provider_operation_id": source.OperationID,
				"connection_role":       string(client.role),
			},
		},
		Payload: nexadapter.AdapterInboundPayload{
			ExternalRecordID: fmt.Sprintf("mercury:%s:api_capture_receipt:%s", safeConnection, nexadapter.SafeIDToken(receiptID)),
			Timestamp:        capturedAt.UnixMilli(),
			Content:          fmt.Sprintf("Mercury API capture operation=%s page=%d rows=%d", source.OperationID, pageNumber, rowCount),
			ContentType:      "text",
			Payload:          evidenceMetadata,
			Metadata:         evidenceMetadata,
		},
	}, nil
}

func sha256Hex(value []byte) string {
	digest := sha256.Sum256(value)
	return hex.EncodeToString(digest[:])
}
