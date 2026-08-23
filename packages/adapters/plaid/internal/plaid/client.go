package plaid

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

const (
	maxProviderResponseBytes  = 32 << 20
	plaidAPIVersion           = "2020-09-14"
	maxRequestCollectionSize  = 100
	maxInstitutionQueryRunes  = 100
	maxInstitutionSearchCount = 10
)

type CredentialBindings struct {
	AppClientIDRef     string `json:"app_client_id_ref"`
	AppSecretRef       string `json:"app_secret_ref"`
	ItemAccessTokenRef string `json:"item_access_token_ref,omitempty"`
}

type Config struct {
	BaseURL     string
	Environment string
	ClientID    string
	Secret      string
	AccessToken string
	Bindings    CredentialBindings
	HTTPClient  *http.Client
	Now         func() time.Time
}

type Client struct {
	baseURL     string
	environment string
	clientID    string
	secret      string
	accessToken string
	bindings    CredentialBindings
	httpClient  *http.Client
	now         func() time.Time
}

func NewClient(config Config) (*Client, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(config.BaseURL), "/")
	if baseURL == "" {
		return nil, fmt.Errorf("Plaid base URL is required")
	}
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil, fmt.Errorf("invalid Plaid base URL")
	}
	if parsed.Scheme != "https" && parsed.Hostname() != "127.0.0.1" && parsed.Hostname() != "localhost" {
		return nil, fmt.Errorf("Plaid base URL must use HTTPS")
	}
	httpClient := config.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 30 * time.Second}
	}
	// Clone caller configuration so the adapter can impose its credential
	// boundary without mutating a shared client. Plaid requests contain app and
	// Item credentials in the body, so no redirect may ever be followed.
	failClosedHTTPClient := *httpClient
	failClosedHTTPClient.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}
	now := config.Now
	if now == nil {
		now = time.Now
	}
	return &Client{
		baseURL:     baseURL,
		environment: strings.TrimSpace(config.Environment),
		clientID:    strings.TrimSpace(config.ClientID),
		secret:      strings.TrimSpace(config.Secret),
		accessToken: strings.TrimSpace(config.AccessToken),
		bindings:    config.Bindings,
		httpClient:  &failClosedHTTPClient,
		now:         now,
	}, nil
}

func (c *Client) Bindings() CredentialBindings {
	return c.bindings
}

func (c *Client) Environment() string {
	return c.environment
}

func (c *Client) HasItemCredential() bool {
	return c.accessToken != ""
}

func (c *Client) HasAppCredentials() bool {
	return c.clientID != "" && c.secret != ""
}

func (c *Client) validateAppCredentials() error {
	if c.clientID == "" {
		return fmt.Errorf("missing Plaid app client credential at %s", fallbackRef(c.bindings.AppClientIDRef, "configured app client reference"))
	}
	if c.secret == "" {
		return fmt.Errorf("missing Plaid app secret credential at %s", fallbackRef(c.bindings.AppSecretRef, "configured app secret reference"))
	}
	return nil
}

func (c *Client) validateItemCredential() error {
	if err := c.validateAppCredentials(); err != nil {
		return err
	}
	if c.accessToken == "" {
		return fmt.Errorf("missing Plaid Item access token at %s", fallbackRef(c.bindings.ItemAccessTokenRef, "runtime connection credential"))
	}
	return nil
}

func fallbackRef(value string, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}

type SourceEvidence struct {
	Provider          string `json:"provider"`
	Environment       string `json:"environment,omitempty"`
	Endpoint          string `json:"endpoint"`
	FetchedAt         string `json:"fetched_at"`
	PayloadSHA256     string `json:"payload_sha256"`
	PayloadEncoding   string `json:"payload_encoding"`
	PayloadBodyBase64 string `json:"payload_body_base64"`
	PayloadComplete   bool   `json:"payload_complete"`
	PayloadBytes      int    `json:"payload_bytes"`
	RequestID         string `json:"request_id,omitempty"`
}

type APIError struct {
	StatusCode       int             `json:"status_code"`
	ErrorType        string          `json:"error_type,omitempty"`
	ErrorCode        string          `json:"error_code,omitempty"`
	ErrorMessage     string          `json:"error_message,omitempty"`
	RequestID        string          `json:"request_id,omitempty"`
	DocumentationURL string          `json:"documentation_url,omitempty"`
	Evidence         SourceEvidence  `json:"evidence"`
	Raw              json.RawMessage `json:"raw"`
}

// providerAPIError is deliberately separate from APIError. Provider JSON is
// untrusted and must never be able to populate or replace the locally computed
// raw body and evidence fields.
type providerAPIError struct {
	ErrorType        string `json:"error_type"`
	ErrorCode        string `json:"error_code"`
	ErrorMessage     string `json:"error_message"`
	RequestID        string `json:"request_id"`
	DocumentationURL string `json:"documentation_url"`
}

func (e *APIError) Error() string {
	message := strings.TrimSpace(e.ErrorMessage)
	if message == "" {
		message = http.StatusText(e.StatusCode)
	}
	if e.ErrorCode != "" {
		return fmt.Sprintf("Plaid %s: %s", e.ErrorCode, message)
	}
	return fmt.Sprintf("Plaid HTTP %d: %s", e.StatusCode, message)
}

func (e *APIError) IsPaginationMutation() bool {
	return e != nil && e.ErrorCode == "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION"
}

func (c *Client) post(ctx context.Context, endpoint string, payload map[string]any, output any) (json.RawMessage, SourceEvidence, error) {
	if err := c.validateAppCredentials(); err != nil {
		return nil, SourceEvidence{}, err
	}
	body := make(map[string]any, len(payload)+2)
	for key, value := range payload {
		body[key] = value
	}
	body["client_id"] = c.clientID
	body["secret"] = c.secret
	encoded, err := json.Marshal(body)
	if err != nil {
		return nil, SourceEvidence{}, fmt.Errorf("encode Plaid request: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+endpoint, bytes.NewReader(encoded))
	if err != nil {
		return nil, SourceEvidence{}, fmt.Errorf("create Plaid request: %w", err)
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Plaid-Version", plaidAPIVersion)
	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, SourceEvidence{}, fmt.Errorf("Plaid request %s: %w", endpoint, err)
	}
	defer response.Body.Close()
	raw, readErr := io.ReadAll(io.LimitReader(response.Body, maxProviderResponseBytes+1))
	if readErr != nil {
		evidence := c.evidence(endpoint, raw, false)
		return raw, evidence, fmt.Errorf("read Plaid response %s: %w", endpoint, readErr)
	}
	if len(raw) > maxProviderResponseBytes {
		evidence := c.evidence(endpoint, raw, false)
		return raw, evidence, fmt.Errorf("Plaid response %s exceeds %d bytes", endpoint, maxProviderResponseBytes)
	}
	evidence := c.evidence(endpoint, raw, true)
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		var wireError providerAPIError
		_ = decodeProviderJSON(raw, &wireError)
		apiError := &APIError{
			StatusCode:       response.StatusCode,
			ErrorType:        wireError.ErrorType,
			ErrorCode:        wireError.ErrorCode,
			ErrorMessage:     wireError.ErrorMessage,
			RequestID:        wireError.RequestID,
			DocumentationURL: wireError.DocumentationURL,
			Evidence:         evidence,
			Raw:              copyValidRaw(raw),
		}
		return raw, evidence, apiError
	}
	if output != nil {
		if err := decodeProviderJSON(raw, output); err != nil {
			return raw, evidence, fmt.Errorf("decode Plaid response %s: %w", endpoint, err)
		}
	}
	return append(json.RawMessage(nil), raw...), evidence, nil
}

func (c *Client) evidence(endpoint string, raw []byte, complete bool) SourceEvidence {
	digest := sha256.Sum256(raw)
	var common struct {
		RequestID string `json:"request_id"`
	}
	_ = decodeProviderJSON(raw, &common)
	return SourceEvidence{
		Provider:          "plaid",
		Environment:       c.environment,
		Endpoint:          endpoint,
		FetchedAt:         c.now().UTC().Format(time.RFC3339Nano),
		PayloadSHA256:     hex.EncodeToString(digest[:]),
		PayloadEncoding:   "base64",
		PayloadBodyBase64: base64.StdEncoding.EncodeToString(raw),
		PayloadComplete:   complete,
		PayloadBytes:      len(raw),
		RequestID:         common.RequestID,
	}
}

func decodeProviderJSON(raw []byte, output any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(output); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return fmt.Errorf("provider response contains multiple JSON values")
		}
		return fmt.Errorf("provider response has trailing non-JSON data: %w", err)
	}
	return nil
}

type providerBalances struct {
	Available              DecimalNumber `json:"available"`
	Current                DecimalNumber `json:"current"`
	Limit                  DecimalNumber `json:"limit"`
	ISOCurrencyCode        string        `json:"iso_currency_code"`
	UnofficialCurrencyCode string        `json:"unofficial_currency_code"`
}

type providerAccount struct {
	AccountID    string           `json:"account_id"`
	Name         string           `json:"name"`
	OfficialName string           `json:"official_name"`
	Mask         string           `json:"mask"`
	AccountType  string           `json:"type"`
	Subtype      string           `json:"subtype"`
	Balances     providerBalances `json:"balances"`
}

type AccountSnapshot struct {
	ProviderAccountID string      `json:"provider_account_id"`
	Name              string      `json:"name"`
	OfficialName      string      `json:"official_name,omitempty"`
	Mask              string      `json:"mask,omitempty"`
	AccountType       string      `json:"account_type"`
	Subtype           string      `json:"subtype,omitempty"`
	Available         *ExactMoney `json:"available,omitempty"`
	Current           *ExactMoney `json:"current,omitempty"`
	Limit             *ExactMoney `json:"limit,omitempty"`
}

func normalizeAccount(account providerAccount) (AccountSnapshot, error) {
	available, err := exactMoney(account.Balances.Available, account.Balances.ISOCurrencyCode, account.Balances.UnofficialCurrencyCode)
	if err != nil {
		return AccountSnapshot{}, err
	}
	current, err := exactMoney(account.Balances.Current, account.Balances.ISOCurrencyCode, account.Balances.UnofficialCurrencyCode)
	if err != nil {
		return AccountSnapshot{}, err
	}
	limit, err := exactMoney(account.Balances.Limit, account.Balances.ISOCurrencyCode, account.Balances.UnofficialCurrencyCode)
	if err != nil {
		return AccountSnapshot{}, err
	}
	return AccountSnapshot{
		ProviderAccountID: account.AccountID,
		Name:              account.Name,
		OfficialName:      account.OfficialName,
		Mask:              account.Mask,
		AccountType:       account.AccountType,
		Subtype:           account.Subtype,
		Available:         available,
		Current:           current,
		Limit:             limit,
	}, nil
}

func normalizeAccounts(accounts []providerAccount) ([]AccountSnapshot, error) {
	result := make([]AccountSnapshot, 0, len(accounts))
	seenAccountIDs := make(map[string]struct{}, len(accounts))
	for _, account := range accounts {
		accountID := strings.TrimSpace(account.AccountID)
		if accountID == "" {
			return nil, fmt.Errorf("provider account missing account_id")
		}
		if _, exists := seenAccountIDs[accountID]; exists {
			return nil, fmt.Errorf("duplicate provider account_id %q", accountID)
		}
		seenAccountIDs[accountID] = struct{}{}
		normalized, err := normalizeAccount(account)
		if err != nil {
			return nil, fmt.Errorf("normalize account %s: %w", account.AccountID, err)
		}
		result = append(result, normalized)
	}
	return result, nil
}

type providerItemStatusTransactions struct {
	LastSuccessfulUpdate string `json:"last_successful_update"`
	LastFailedUpdate     string `json:"last_failed_update"`
}

type providerItemStatus struct {
	Transactions providerItemStatusTransactions `json:"transactions"`
}

type providerItem struct {
	ItemID                string             `json:"item_id"`
	InstitutionID         string             `json:"institution_id"`
	AvailableProducts     []string           `json:"available_products"`
	BilledProducts        []string           `json:"billed_products"`
	Products              []string           `json:"products"`
	ConsentExpirationTime string             `json:"consent_expiration_time"`
	UpdateType            string             `json:"update_type"`
	Error                 json.RawMessage    `json:"error"`
	Status                providerItemStatus `json:"status"`
}

type ItemSummary struct {
	ProviderItemID        string          `json:"provider_item_id"`
	InstitutionID         string          `json:"institution_id,omitempty"`
	AvailableProducts     []string        `json:"available_products"`
	BilledProducts        []string        `json:"billed_products"`
	Products              []string        `json:"products"`
	ConsentExpirationTime string          `json:"consent_expiration_time,omitempty"`
	UpdateType            string          `json:"update_type,omitempty"`
	LastSuccessfulUpdate  string          `json:"last_successful_update,omitempty"`
	LastFailedUpdate      string          `json:"last_failed_update,omitempty"`
	ProviderError         json.RawMessage `json:"provider_error,omitempty"`
}

func summarizeItem(item providerItem) ItemSummary {
	return ItemSummary{
		ProviderItemID:        item.ItemID,
		InstitutionID:         item.InstitutionID,
		AvailableProducts:     nonNilStrings(item.AvailableProducts),
		BilledProducts:        nonNilStrings(item.BilledProducts),
		Products:              nonNilStrings(item.Products),
		ConsentExpirationTime: item.ConsentExpirationTime,
		UpdateType:            item.UpdateType,
		LastSuccessfulUpdate:  item.Status.Transactions.LastSuccessfulUpdate,
		LastFailedUpdate:      item.Status.Transactions.LastFailedUpdate,
		ProviderError:         copyRaw(item.Error),
	}
}

func nonNilStrings(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func copyRaw(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil
	}
	return append(json.RawMessage(nil), raw...)
}

func copyValidRaw(raw json.RawMessage) json.RawMessage {
	if !json.Valid(raw) {
		return nil
	}
	return copyRaw(raw)
}

type ItemResult struct {
	Evidence           SourceEvidence     `json:"evidence"`
	CredentialBindings CredentialBindings `json:"credential_bindings"`
	Item               ItemSummary        `json:"item"`
	Raw                json.RawMessage    `json:"raw"`
}

func (c *Client) GetItem(ctx context.Context) (ItemResult, error) {
	if err := c.validateItemCredential(); err != nil {
		return ItemResult{}, err
	}
	var response struct {
		Item providerItem `json:"item"`
	}
	raw, evidence, err := c.post(ctx, "/item/get", map[string]any{"access_token": c.accessToken}, &response)
	if err != nil {
		return ItemResult{}, err
	}
	if strings.TrimSpace(response.Item.ItemID) == "" {
		return ItemResult{}, fmt.Errorf("Plaid Item response missing item_id")
	}
	return ItemResult{
		Evidence:           evidence,
		CredentialBindings: c.bindings,
		Item:               summarizeItem(response.Item),
		Raw:                raw,
	}, nil
}

type AccountsResult struct {
	Evidence           SourceEvidence     `json:"evidence"`
	CredentialBindings CredentialBindings `json:"credential_bindings"`
	Accounts           []AccountSnapshot  `json:"accounts"`
	Raw                json.RawMessage    `json:"raw"`
}

func (c *Client) GetAccounts(ctx context.Context) (AccountsResult, error) {
	return c.getAccountsAtEndpoint(ctx, "/accounts/get", nil)
}

func (c *Client) GetBalance(ctx context.Context, providerAccountIDs []string) (AccountsResult, error) {
	if err := validateRequestCollection("provider_account_ids", providerAccountIDs); err != nil {
		return AccountsResult{}, err
	}
	options := map[string]any{}
	if len(providerAccountIDs) > 0 {
		options["account_ids"] = providerAccountIDs
	}
	return c.getAccountsAtEndpoint(ctx, "/accounts/balance/get", options)
}

func (c *Client) getAccountsAtEndpoint(ctx context.Context, endpoint string, options map[string]any) (AccountsResult, error) {
	if err := c.validateItemCredential(); err != nil {
		return AccountsResult{}, err
	}
	payload := map[string]any{"access_token": c.accessToken}
	if len(options) > 0 {
		payload["options"] = options
	}
	var response struct {
		Accounts []providerAccount `json:"accounts"`
	}
	raw, evidence, err := c.post(ctx, endpoint, payload, &response)
	if err != nil {
		return AccountsResult{}, err
	}
	accounts, err := normalizeAccounts(response.Accounts)
	if err != nil {
		return AccountsResult{}, err
	}
	return AccountsResult{
		Evidence:           evidence,
		CredentialBindings: c.bindings,
		Accounts:           accounts,
		Raw:                raw,
	}, nil
}

type providerCreditAPR struct {
	APRPercentage        DecimalNumber `json:"apr_percentage"`
	APRType              string        `json:"apr_type"`
	BalanceSubjectToAPR  DecimalNumber `json:"balance_subject_to_apr"`
	InterestChargeAmount DecimalNumber `json:"interest_charge_amount"`
}

type providerCreditLiability struct {
	AccountID              string              `json:"account_id"`
	APRs                   []providerCreditAPR `json:"aprs"`
	IsOverdue              bool                `json:"is_overdue"`
	LastPaymentAmount      DecimalNumber       `json:"last_payment_amount"`
	LastPaymentDate        string              `json:"last_payment_date"`
	LastStatementBalance   DecimalNumber       `json:"last_statement_balance"`
	LastStatementIssueDate string              `json:"last_statement_issue_date"`
	MinimumPaymentAmount   DecimalNumber       `json:"minimum_payment_amount"`
	NextPaymentDueDate     string              `json:"next_payment_due_date"`
}

type CreditLiability struct {
	ProviderAccountID      string      `json:"provider_account_id"`
	APRs                   []CreditAPR `json:"aprs"`
	IsOverdue              bool        `json:"is_overdue"`
	LastPaymentAmount      *ExactMoney `json:"last_payment_amount,omitempty"`
	LastPaymentDate        string      `json:"last_payment_date,omitempty"`
	LastStatementBalance   *ExactMoney `json:"last_statement_balance,omitempty"`
	LastStatementIssueDate string      `json:"last_statement_issue_date,omitempty"`
	MinimumPaymentAmount   *ExactMoney `json:"minimum_payment_amount,omitempty"`
	NextPaymentDueDate     string      `json:"next_payment_due_date,omitempty"`
}

type CreditAPR struct {
	APRPercentageDecimal string      `json:"apr_percentage_decimal,omitempty"`
	APRType              string      `json:"apr_type,omitempty"`
	BalanceSubjectToAPR  *ExactMoney `json:"balance_subject_to_apr,omitempty"`
	InterestChargeAmount *ExactMoney `json:"interest_charge_amount,omitempty"`
}

type LiabilitiesResult struct {
	Evidence           SourceEvidence     `json:"evidence"`
	CredentialBindings CredentialBindings `json:"credential_bindings"`
	Credit             []CreditLiability  `json:"credit"`
	Raw                json.RawMessage    `json:"raw"`
}

func (c *Client) GetLiabilities(ctx context.Context, providerAccountIDs []string) (LiabilitiesResult, error) {
	if err := c.validateItemCredential(); err != nil {
		return LiabilitiesResult{}, err
	}
	if err := validateRequestCollection("provider_account_ids", providerAccountIDs); err != nil {
		return LiabilitiesResult{}, err
	}
	payload := map[string]any{"access_token": c.accessToken}
	if len(providerAccountIDs) > 0 {
		payload["options"] = map[string]any{"account_ids": providerAccountIDs}
	}
	var response struct {
		Accounts    []providerAccount `json:"accounts"`
		Liabilities struct {
			Credit []providerCreditLiability `json:"credit"`
		} `json:"liabilities"`
	}
	raw, evidence, err := c.post(ctx, "/liabilities/get", payload, &response)
	if err != nil {
		return LiabilitiesResult{}, err
	}
	currencies := make(map[string]providerBalances, len(response.Accounts))
	for _, account := range response.Accounts {
		accountID := strings.TrimSpace(account.AccountID)
		if accountID == "" {
			return LiabilitiesResult{}, fmt.Errorf("liabilities response account missing account_id")
		}
		if _, exists := currencies[accountID]; exists {
			return LiabilitiesResult{}, fmt.Errorf("duplicate liabilities response account_id %q", accountID)
		}
		currencies[accountID] = account.Balances
	}
	credit := make([]CreditLiability, 0, len(response.Liabilities.Credit))
	for _, provider := range response.Liabilities.Credit {
		providerAccountID := strings.TrimSpace(provider.AccountID)
		if providerAccountID == "" {
			return LiabilitiesResult{}, fmt.Errorf("credit liability missing account_id")
		}
		currency, exists := currencies[providerAccountID]
		if !exists {
			return LiabilitiesResult{}, fmt.Errorf("credit liability account_id %q is absent from returned account currency map", providerAccountID)
		}
		aprs := make([]CreditAPR, 0, len(provider.APRs))
		for _, providerAPR := range provider.APRs {
			balanceSubject, aprErr := exactMoney(providerAPR.BalanceSubjectToAPR, currency.ISOCurrencyCode, currency.UnofficialCurrencyCode)
			if aprErr != nil {
				return LiabilitiesResult{}, aprErr
			}
			interestCharge, aprErr := exactMoney(providerAPR.InterestChargeAmount, currency.ISOCurrencyCode, currency.UnofficialCurrencyCode)
			if aprErr != nil {
				return LiabilitiesResult{}, aprErr
			}
			aprPercentage := ""
			if providerAPR.APRPercentage.Valid() {
				aprPercentage = providerAPR.APRPercentage.String()
			}
			aprs = append(aprs, CreditAPR{
				APRPercentageDecimal: aprPercentage,
				APRType:              providerAPR.APRType,
				BalanceSubjectToAPR:  balanceSubject,
				InterestChargeAmount: interestCharge,
			})
		}
		lastPayment, err := exactMoney(provider.LastPaymentAmount, currency.ISOCurrencyCode, currency.UnofficialCurrencyCode)
		if err != nil {
			return LiabilitiesResult{}, err
		}
		lastStatement, err := exactMoney(provider.LastStatementBalance, currency.ISOCurrencyCode, currency.UnofficialCurrencyCode)
		if err != nil {
			return LiabilitiesResult{}, err
		}
		minimumPayment, err := exactMoney(provider.MinimumPaymentAmount, currency.ISOCurrencyCode, currency.UnofficialCurrencyCode)
		if err != nil {
			return LiabilitiesResult{}, err
		}
		credit = append(credit, CreditLiability{
			ProviderAccountID:      providerAccountID,
			APRs:                   aprs,
			IsOverdue:              provider.IsOverdue,
			LastPaymentAmount:      lastPayment,
			LastPaymentDate:        provider.LastPaymentDate,
			LastStatementBalance:   lastStatement,
			LastStatementIssueDate: provider.LastStatementIssueDate,
			MinimumPaymentAmount:   minimumPayment,
			NextPaymentDueDate:     provider.NextPaymentDueDate,
		})
	}
	if credit == nil {
		credit = []CreditLiability{}
	}
	return LiabilitiesResult{
		Evidence:           evidence,
		CredentialBindings: c.bindings,
		Credit:             credit,
		Raw:                raw,
	}, nil
}

type InstitutionCoverageRequest struct {
	InstitutionIDs    []string
	Query             string
	CountryCodes      []string
	RequestedProducts []string
	Count             int
}

type InstitutionCoverage struct {
	InstitutionID            string          `json:"institution_id"`
	Name                     string          `json:"name"`
	CountryCodes             []string        `json:"country_codes"`
	SupportedProducts        []string        `json:"supported_products"`
	RequestedProducts        []string        `json:"requested_products"`
	MissingRequestedProducts []string        `json:"missing_requested_products"`
	CoverageConfirmed        bool            `json:"coverage_confirmed"`
	Evidence                 SourceEvidence  `json:"evidence"`
	Raw                      json.RawMessage `json:"raw"`
}

type InstitutionCoverageResult struct {
	CredentialBindings CredentialBindings    `json:"credential_bindings"`
	Institutions       []InstitutionCoverage `json:"institutions"`
}

type providerInstitution struct {
	InstitutionID string   `json:"institution_id"`
	Name          string   `json:"name"`
	CountryCodes  []string `json:"country_codes"`
	Products      []string `json:"products"`
}

func (c *Client) ProbeInstitutionCoverage(ctx context.Context, request InstitutionCoverageRequest) (InstitutionCoverageResult, error) {
	if err := c.validateAppCredentials(); err != nil {
		return InstitutionCoverageResult{}, err
	}
	if len(request.InstitutionIDs) > 0 && strings.TrimSpace(request.Query) != "" {
		return InstitutionCoverageResult{}, fmt.Errorf("provide institution_ids or query, not both")
	}
	if len(request.InstitutionIDs) == 0 && strings.TrimSpace(request.Query) == "" {
		return InstitutionCoverageResult{}, fmt.Errorf("institution_ids or query is required")
	}
	if err := validateRequestCollection("institution_ids", request.InstitutionIDs); err != nil {
		return InstitutionCoverageResult{}, err
	}
	if err := validateRequestCollection("country_codes", request.CountryCodes); err != nil {
		return InstitutionCoverageResult{}, err
	}
	if err := validateRequestCollection("requested_products", request.RequestedProducts); err != nil {
		return InstitutionCoverageResult{}, err
	}
	query := strings.TrimSpace(request.Query)
	if len([]rune(query)) > maxInstitutionQueryRunes {
		return InstitutionCoverageResult{}, fmt.Errorf("query must not exceed %d characters", maxInstitutionQueryRunes)
	}
	if request.Count < 0 || request.Count > maxInstitutionSearchCount {
		return InstitutionCoverageResult{}, fmt.Errorf("count must be between 1 and %d when provided", maxInstitutionSearchCount)
	}
	countries := normalizedStrings(request.CountryCodes)
	if len(countries) == 0 {
		countries = []string{"US"}
	}
	requestedProducts := normalizedStrings(request.RequestedProducts)
	result := InstitutionCoverageResult{
		CredentialBindings: c.bindings,
		Institutions:       []InstitutionCoverage{},
	}

	if len(request.InstitutionIDs) > 0 {
		for _, institutionID := range normalizedStrings(request.InstitutionIDs) {
			var response struct {
				Institution providerInstitution `json:"institution"`
			}
			raw, evidence, err := c.post(ctx, "/institutions/get_by_id", map[string]any{
				"institution_id": institutionID,
				"country_codes":  countries,
				"options": map[string]any{
					"include_optional_metadata": true,
				},
			}, &response)
			if err != nil {
				return InstitutionCoverageResult{}, err
			}
			result.Institutions = append(result.Institutions, buildInstitutionCoverage(response.Institution, requestedProducts, evidence, raw))
		}
		return result, nil
	}

	count := request.Count
	if count == 0 {
		count = maxInstitutionSearchCount
	}
	if count < 1 || count > maxInstitutionSearchCount {
		return InstitutionCoverageResult{}, fmt.Errorf("count must be between 1 and %d", maxInstitutionSearchCount)
	}
	var response struct {
		Institutions []providerInstitution `json:"institutions"`
	}
	payload := map[string]any{
		"query":         query,
		"country_codes": countries,
		"options": map[string]any{
			"include_optional_metadata": true,
		},
	}
	if len(requestedProducts) > 0 {
		payload["products"] = requestedProducts
	}
	raw, evidence, err := c.post(ctx, "/institutions/search", payload, &response)
	if err != nil {
		return InstitutionCoverageResult{}, err
	}
	if len(response.Institutions) > count {
		response.Institutions = response.Institutions[:count]
	}
	for _, institution := range response.Institutions {
		result.Institutions = append(result.Institutions, buildInstitutionCoverage(institution, requestedProducts, evidence, raw))
	}
	return result, nil
}

func buildInstitutionCoverage(institution providerInstitution, requested []string, evidence SourceEvidence, raw json.RawMessage) InstitutionCoverage {
	supported := normalizedStrings(institution.Products)
	supportedSet := make(map[string]struct{}, len(supported))
	for _, product := range supported {
		supportedSet[product] = struct{}{}
	}
	missing := make([]string, 0)
	for _, product := range requested {
		if _, ok := supportedSet[product]; !ok {
			missing = append(missing, product)
		}
	}
	return InstitutionCoverage{
		InstitutionID:            institution.InstitutionID,
		Name:                     institution.Name,
		CountryCodes:             nonNilStrings(institution.CountryCodes),
		SupportedProducts:        supported,
		RequestedProducts:        requested,
		MissingRequestedProducts: missing,
		CoverageConfirmed:        len(missing) == 0,
		Evidence:                 evidence,
		Raw:                      raw,
	}
}

func normalizedStrings(values []string) []string {
	seen := map[string]struct{}{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	sort.Strings(result)
	return result
}

func validateRequestCollection(name string, values []string) error {
	if len(values) > maxRequestCollectionSize {
		return fmt.Errorf("%s must contain at most %d values", name, maxRequestCollectionSize)
	}
	return nil
}

type HealthProbe struct {
	Connected            bool               `json:"connected"`
	ProviderItemID       string             `json:"provider_item_id,omitempty"`
	InstitutionID        string             `json:"institution_id,omitempty"`
	LastSuccessfulUpdate string             `json:"last_successful_update,omitempty"`
	LastFailedUpdate     string             `json:"last_failed_update,omitempty"`
	LastEventAtMS        int64              `json:"last_event_at_ms,omitempty"`
	FreshnessState       string             `json:"freshness_state"`
	ProviderError        json.RawMessage    `json:"provider_error,omitempty"`
	CredentialBindings   CredentialBindings `json:"credential_bindings"`
}

func (c *Client) ProbeHealth(ctx context.Context) (HealthProbe, error) {
	item, err := c.GetItem(ctx)
	if err != nil {
		return HealthProbe{}, err
	}
	probe := HealthProbe{
		Connected:            len(item.Item.ProviderError) == 0,
		ProviderItemID:       item.Item.ProviderItemID,
		InstitutionID:        item.Item.InstitutionID,
		LastSuccessfulUpdate: item.Item.LastSuccessfulUpdate,
		LastFailedUpdate:     item.Item.LastFailedUpdate,
		FreshnessState:       "unknown",
		ProviderError:        copyRaw(item.Item.ProviderError),
		CredentialBindings:   c.bindings,
	}
	successTime, successValid := parseProviderTime(item.Item.LastSuccessfulUpdate)
	failureTime, failureValid := parseProviderTime(item.Item.LastFailedUpdate)
	latestTime := successTime
	if failureValid && (!successValid || failureTime.After(successTime)) {
		latestTime = failureTime
		probe.Connected = false
		probe.FreshnessState = "failed_after_last_success"
	}
	if !latestTime.IsZero() {
		probe.LastEventAtMS = latestTime.UnixMilli()
	}
	if len(probe.ProviderError) > 0 {
		probe.Connected = false
		probe.FreshnessState = "provider_attention_required"
	} else if probe.FreshnessState != "failed_after_last_success" && successValid {
		age := c.now().UTC().Sub(successTime.UTC())
		if age < -5*time.Minute {
			probe.Connected = false
			probe.FreshnessState = "provider_clock_invalid"
		} else if age <= 24*time.Hour {
			probe.FreshnessState = "fresh"
		} else {
			probe.FreshnessState = "stale"
		}
	}
	return probe, nil
}

func parseProviderTime(value string) (time.Time, bool) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return time.Time{}, false
	}
	parsed, err := time.Parse(time.RFC3339Nano, trimmed)
	if err != nil {
		return time.Time{}, false
	}
	return parsed.UTC(), true
}

func IsAPIError(err error) (*APIError, bool) {
	var target *APIError
	if errors.As(err, &target) {
		return target, true
	}
	return nil, false
}
