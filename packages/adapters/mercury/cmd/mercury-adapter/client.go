package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/nexus-project/adapter-mercury/internal/catalog"
	nexadapter "github.com/nexus-project/adapter-sdk-go"
)

const (
	officialMercuryBaseURL = "https://api.mercury.com/api/v1"
	maxResponseBodyBytes   = 16 << 20
	maxPages               = 100
	maxGETAttempts         = 3
)

type mercuryConnectionRole string

const (
	rolePrimaryRead mercuryConnectionRole = "primary_read"
	roleAPRequest   mercuryConnectionRole = "ap_request"
)

var (
	pathParameterPattern = regexp.MustCompile(`\{([A-Za-z0-9_]+)\}`)
	apReadOperations     = map[string]struct{}{
		"getRecipient":                  {},
		"getRecipientInvite":            {},
		"getRecipients":                 {},
		"getSendMoneyApprovalRequest":   {},
		"listRecipientInvites":          {},
		"listRecipientsAttachments":     {},
		"listSendMoneyApprovalRequests": {},
	}
	apWriteOperations = map[string]struct{}{
		"createRecipient":           {},
		"createRecipientInvite":     {},
		"deleteRecipient":           {},
		"deleteRecipientInvite":     {},
		"requestSendMoney":          {},
		"updateRecipient":           {},
		"uploadRecipientAttachment": {},
	}
	sensitiveExcludedOperations = map[string]struct{}{
		"revealCardPan": {},
	}
)

type mercuryClient struct {
	connectionID  string
	credentialRef string
	role          mercuryConnectionRole
	token         string
	baseURL       string
	httpClient    *http.Client
	sleep         func(context.Context, time.Duration) error
}

type mercuryMethodPage struct {
	HTTPStatus      int    `json:"http_status"`
	ContentType     string `json:"content_type"`
	BodyEncoding    string `json:"body_encoding"`
	Body            string `json:"body"`
	BodySHA256      string `json:"body_sha256"`
	NextPage        string `json:"next_page,omitempty"`
	RequestAttempts int    `json:"request_attempts"`
}

type mercuryMethodResponse struct {
	ProviderOperationID    string              `json:"provider_operation_id"`
	ConnectionRole         string              `json:"connection_role"`
	Pages                  []mercuryMethodPage `json:"pages"`
	PageCount              int                 `json:"page_count"`
	Complete               bool                `json:"complete"`
	ProviderCalls          int                 `json:"provider_calls"`
	ProviderWriteAttempted bool                `json:"provider_write_attempted"`
}

type mercuryHTTPError struct {
	OperationID       string
	Status            int
	ProviderErrorCode string
	Retryable         bool
	Attempts          int
}

func (err *mercuryHTTPError) Error() string {
	detail := ""
	if err.ProviderErrorCode != "" {
		detail = fmt.Sprintf(" (%s)", err.ProviderErrorCode)
	}
	return fmt.Sprintf(
		"Mercury GET %s failed with HTTP %d%s after %d attempt(s)",
		err.OperationID,
		err.Status,
		detail,
		err.Attempts,
	)
}

func loadMercuryClient(ctx nexadapter.AdapterRuntimeContext) (*mercuryClient, error) {
	connectionID, err := nexadapter.RequireConnection(ctx.ConnectionID)
	if err != nil {
		return nil, err
	}
	if ctx.Runtime == nil {
		return nil, errors.New("missing Mercury runtime context")
	}

	roleText := firstNonBlank(
		stringValue(ctx.Runtime.Config["connection_role"]),
		credentialField(ctx.Runtime, "connection_role"),
		os.Getenv("NEXUS_MERCURY_CONNECTION_ROLE"),
	)
	role := mercuryConnectionRole(roleText)
	if role != rolePrimaryRead && role != roleAPRequest {
		return nil, errors.New("Mercury connection_role must be primary_read or ap_request")
	}

	envName := "MERCURY_API_TOKEN"
	if role == roleAPRequest {
		envName = "MERCURY_CREATOR_PAYOUTS_API_TOKEN"
	}
	token := strings.TrimSpace(firstNonBlank(
		credentialField(ctx.Runtime, "api_token"),
		runtimeCredentialValue(ctx.Runtime),
		os.Getenv(envName),
	))
	if token == "" {
		return nil, fmt.Errorf("missing Mercury token for %s connection", role)
	}

	baseURL, err := validatedMercuryBaseURL(
		firstNonBlank(
			stringValue(ctx.Runtime.Config["base_url"]),
			os.Getenv("NEXUS_MERCURY_BASE_URL"),
			officialMercuryBaseURL,
		),
		os.Getenv("NEXUS_ADAPTER_TEST_MODE") == "1",
	)
	if err != nil {
		return nil, err
	}

	credentialRef := ""
	if ctx.Runtime.Credential != nil {
		credentialRef = strings.TrimSpace(ctx.Runtime.Credential.Ref)
	}
	if credentialRef == "" {
		credentialRef = "mercury/" + connectionID
	}

	return &mercuryClient{
		connectionID:  connectionID,
		credentialRef: credentialRef,
		role:          role,
		token:         token,
		baseURL:       baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return errors.New("Mercury redirects are refused")
			},
		},
		sleep: sleepContext,
	}, nil
}

func credentialField(runtime *nexadapter.RuntimeContext, name string) string {
	if runtime == nil || runtime.Credential == nil {
		return ""
	}
	return strings.TrimSpace(runtime.Credential.Fields[name])
}

func runtimeCredentialValue(runtime *nexadapter.RuntimeContext) string {
	if runtime == nil || runtime.Credential == nil {
		return ""
	}
	return strings.TrimSpace(runtime.Credential.Value)
}

func stringValue(value any) string {
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func validatedMercuryBaseURL(raw string, testMode bool) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", fmt.Errorf("parse Mercury base URL: %w", err)
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("Mercury base URL must not contain credentials, query or fragment")
	}
	official, _ := url.Parse(officialMercuryBaseURL)
	if parsed.Scheme == official.Scheme && parsed.Host == official.Host &&
		strings.TrimRight(parsed.Path, "/") == strings.TrimRight(official.Path, "/") {
		return strings.TrimRight(parsed.String(), "/"), nil
	}
	host := parsed.Hostname()
	if !testMode || (host != "localhost" && net.ParseIP(host) == nil) {
		return "", errors.New("non-official Mercury base URL is allowed only for a loopback cleanroom")
	}
	ip := net.ParseIP(host)
	if ip != nil && !ip.IsLoopback() {
		return "", errors.New("Mercury cleanroom base URL must be loopback")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", errors.New("Mercury base URL must use HTTP or HTTPS")
	}
	return strings.TrimRight(parsed.String(), "/"), nil
}

func (client *mercuryClient) invoke(
	ctx context.Context,
	operation catalog.Operation,
	payload map[string]any,
) (*mercuryMethodResponse, error) {
	if operation.Visibility != "public" {
		return nil, errors.New("Mercury internal operation is excluded")
	}
	if _, excluded := sensitiveExcludedOperations[operation.OperationID]; excluded {
		return nil, errors.New("Mercury card-PAN reveal is excluded from the canonical adapter")
	}
	if operation.HTTPMethod != http.MethodGet {
		if _, apWrite := apWriteOperations[operation.OperationID]; apWrite && client.role != roleAPRequest {
			return nil, fmt.Errorf("Mercury operation %s requires the ap_request connection", operation.OperationID)
		}
		return nil, errors.New("Mercury provider writes are disabled in the read-only adapter")
	}
	if err := client.authorizeRead(operation.OperationID); err != nil {
		return nil, err
	}

	pathParameters, err := objectValue(payload, "path_parameters")
	if err != nil {
		return nil, err
	}
	queryValues, err := objectValue(payload, "query")
	if err != nil {
		return nil, err
	}
	if body, ok := payload["body"]; ok && body != nil {
		return nil, errors.New("Mercury GET methods do not accept body")
	}
	autoPaginate, err := optionalBool(payload, "auto_paginate", false)
	if err != nil {
		return nil, err
	}
	pageLimit, err := optionalInt(payload, "max_pages", 1)
	if err != nil {
		return nil, err
	}
	if pageLimit < 1 || pageLimit > maxPages {
		return nil, fmt.Errorf("max_pages must be between 1 and %d", maxPages)
	}
	if !autoPaginate && pageLimit != 1 {
		return nil, errors.New("max_pages above 1 requires auto_paginate=true")
	}

	resolvedPath, err := resolvePath(operation.Path, pathParameters)
	if err != nil {
		return nil, err
	}
	query, err := encodeQuery(queryValues)
	if err != nil {
		return nil, err
	}
	if autoPaginate && (query.Has("start_after") || query.Has("end_before")) {
		return nil, errors.New("automatic pagination cannot start with start_after or end_before")
	}

	response := &mercuryMethodResponse{
		ProviderOperationID:    operation.OperationID,
		ConnectionRole:         string(client.role),
		Pages:                  []mercuryMethodPage{},
		Complete:               true,
		ProviderWriteAttempted: false,
	}
	seenCursors := map[string]struct{}{}
	for pageIndex := 0; pageIndex < pageLimit; pageIndex++ {
		page, calls, err := client.getPage(ctx, operation, resolvedPath, query)
		response.ProviderCalls += calls
		if err != nil {
			return nil, err
		}
		response.Pages = append(response.Pages, page)
		response.PageCount = len(response.Pages)
		if !autoPaginate || page.NextPage == "" {
			return response, nil
		}
		if _, exists := seenCursors[page.NextPage]; exists {
			return nil, errors.New("Mercury pagination cursor repeated")
		}
		seenCursors[page.NextPage] = struct{}{}
		query.Set("start_after", page.NextPage)
		if pageIndex == pageLimit-1 {
			response.Complete = false
		}
	}
	return response, nil
}

func (client *mercuryClient) authorizeRead(operationID string) error {
	if _, apRead := apReadOperations[operationID]; apRead {
		if client.role == roleAPRequest || client.role == rolePrimaryRead {
			return nil
		}
		return fmt.Errorf("Mercury operation %s requires an AP-capable read connection", operationID)
	}
	if client.role != rolePrimaryRead {
		return fmt.Errorf("Mercury operation %s requires the primary_read connection", operationID)
	}
	return nil
}

func resolvePath(template string, parameters map[string]any) (string, error) {
	used := map[string]struct{}{}
	resolved := pathParameterPattern.ReplaceAllStringFunc(template, func(placeholder string) string {
		name := strings.TrimSuffix(strings.TrimPrefix(placeholder, "{"), "}")
		value, ok := parameters[name]
		if !ok {
			return placeholder
		}
		text, ok := scalarText(value)
		if !ok || text == "" {
			return placeholder
		}
		used[name] = struct{}{}
		return url.PathEscape(text)
	})
	if pathParameterPattern.MatchString(resolved) {
		return "", fmt.Errorf("missing or invalid Mercury path parameter for %s", resolved)
	}
	for name := range parameters {
		if _, ok := used[name]; !ok {
			return "", fmt.Errorf("unexpected Mercury path parameter %q", name)
		}
	}
	return resolved, nil
}

func encodeQuery(values map[string]any) (url.Values, error) {
	query := url.Values{}
	for name, value := range values {
		lower := strings.ToLower(name)
		if strings.Contains(lower, "token") || strings.Contains(lower, "authorization") {
			return nil, fmt.Errorf("credential-like query parameter %q is forbidden", name)
		}
		switch typed := value.(type) {
		case []any:
			for _, item := range typed {
				text, ok := scalarText(item)
				if !ok {
					return nil, fmt.Errorf("Mercury query parameter %q contains a non-scalar value", name)
				}
				query.Add(name, text)
			}
		default:
			text, ok := scalarText(value)
			if !ok {
				return nil, fmt.Errorf("Mercury query parameter %q must be scalar or an array of scalars", name)
			}
			query.Add(name, text)
		}
	}
	return query, nil
}

func scalarText(value any) (string, bool) {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed), true
	case json.Number:
		return typed.String(), true
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64), true
	case int:
		return strconv.Itoa(typed), true
	case int64:
		return strconv.FormatInt(typed, 10), true
	case bool:
		return strconv.FormatBool(typed), true
	default:
		return "", false
	}
}

func objectValue(payload map[string]any, name string) (map[string]any, error) {
	value, ok := payload[name]
	if !ok || value == nil {
		return map[string]any{}, nil
	}
	object, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("%s must be an object", name)
	}
	return object, nil
}

func optionalBool(payload map[string]any, name string, fallback bool) (bool, error) {
	value, ok := payload[name]
	if !ok || value == nil {
		return fallback, nil
	}
	typed, ok := value.(bool)
	if !ok {
		return false, fmt.Errorf("%s must be boolean", name)
	}
	return typed, nil
}

func optionalInt(payload map[string]any, name string, fallback int) (int, error) {
	value, ok := payload[name]
	if !ok || value == nil {
		return fallback, nil
	}
	switch typed := value.(type) {
	case int:
		return typed, nil
	case float64:
		if typed != float64(int(typed)) {
			return 0, fmt.Errorf("%s must be an integer", name)
		}
		return int(typed), nil
	case json.Number:
		parsed, err := strconv.Atoi(typed.String())
		if err != nil {
			return 0, fmt.Errorf("%s must be an integer", name)
		}
		return parsed, nil
	default:
		return 0, fmt.Errorf("%s must be an integer", name)
	}
}

func (client *mercuryClient) getPage(
	ctx context.Context,
	operation catalog.Operation,
	resolvedPath string,
	query url.Values,
) (mercuryMethodPage, int, error) {
	endpoint := client.baseURL + resolvedPath
	if encoded := query.Encode(); encoded != "" {
		endpoint += "?" + encoded
	}

	var lastError *mercuryHTTPError
	for attempt := 1; attempt <= maxGETAttempts; attempt++ {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return mercuryMethodPage{}, attempt - 1, err
		}
		request.Header.Set("Authorization", "Bearer "+client.token)
		request.Header.Set("Accept", "application/json, application/pdf")
		request.Header.Set("User-Agent", "Nex-Mercury-Adapter/0.1.0")

		result, err := client.httpClient.Do(request)
		if err != nil {
			return mercuryMethodPage{}, attempt, fmt.Errorf("Mercury GET %s network failure", operation.OperationID)
		}
		body, readErr := io.ReadAll(io.LimitReader(result.Body, maxResponseBodyBytes+1))
		closeErr := result.Body.Close()
		if readErr != nil {
			return mercuryMethodPage{}, attempt, fmt.Errorf("Mercury GET %s response read failure", operation.OperationID)
		}
		if closeErr != nil {
			return mercuryMethodPage{}, attempt, fmt.Errorf("Mercury GET %s response close failure", operation.OperationID)
		}
		if len(body) > maxResponseBodyBytes {
			return mercuryMethodPage{}, attempt, fmt.Errorf("Mercury GET %s response exceeded %d bytes", operation.OperationID, maxResponseBodyBytes)
		}

		if result.StatusCode >= 200 && result.StatusCode <= 299 {
			page, err := methodPage(result.StatusCode, result.Header.Get("Content-Type"), body, attempt)
			return page, attempt, err
		}

		lastError = &mercuryHTTPError{
			OperationID:       operation.OperationID,
			Status:            result.StatusCode,
			ProviderErrorCode: extractProviderErrorCode(body),
			Retryable:         result.StatusCode == http.StatusTooManyRequests || result.StatusCode >= 500,
			Attempts:          attempt,
		}
		if !lastError.Retryable || attempt == maxGETAttempts {
			return mercuryMethodPage{}, attempt, lastError
		}
		if err := client.sleep(ctx, retryDelay(result.Header.Get("Retry-After"), attempt)); err != nil {
			return mercuryMethodPage{}, attempt, err
		}
	}
	return mercuryMethodPage{}, maxGETAttempts, lastError
}

func methodPage(status int, contentType string, body []byte, attempts int) (mercuryMethodPage, error) {
	digest := sha256.Sum256(body)
	page := mercuryMethodPage{
		HTTPStatus:      status,
		ContentType:     strings.TrimSpace(strings.Split(contentType, ";")[0]),
		BodySHA256:      hex.EncodeToString(digest[:]),
		RequestAttempts: attempts,
	}
	if json.Valid(body) {
		page.BodyEncoding = "utf8_json"
		page.Body = string(body)
		var cursor struct {
			Page struct {
				NextPage string `json:"nextPage"`
			} `json:"page"`
		}
		if err := json.Unmarshal(body, &cursor); err != nil {
			return mercuryMethodPage{}, errors.New("decode Mercury pagination envelope")
		}
		page.NextPage = strings.TrimSpace(cursor.Page.NextPage)
		return page, nil
	}
	page.BodyEncoding = "base64"
	page.Body = base64.StdEncoding.EncodeToString(body)
	return page, nil
}

func extractProviderErrorCode(body []byte) string {
	if !json.Valid(body) {
		return ""
	}
	var payload any
	decoder := json.NewDecoder(strings.NewReader(string(body)))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return ""
	}
	return findProviderErrorCode(payload)
}

func findProviderErrorCode(value any) string {
	switch typed := value.(type) {
	case map[string]any:
		for _, name := range []string{"errorCode", "code"} {
			if text, ok := typed[name].(string); ok && len(text) <= 80 {
				return text
			}
		}
		for _, child := range typed {
			if found := findProviderErrorCode(child); found != "" {
				return found
			}
		}
	case []any:
		for _, child := range typed {
			if found := findProviderErrorCode(child); found != "" {
				return found
			}
		}
	}
	return ""
}

func retryDelay(raw string, attempt int) time.Duration {
	if seconds, err := strconv.Atoi(strings.TrimSpace(raw)); err == nil && seconds >= 0 {
		delay := time.Duration(seconds) * time.Second
		if delay > 5*time.Second {
			return 5 * time.Second
		}
		return delay
	}
	if when, err := http.ParseTime(strings.TrimSpace(raw)); err == nil {
		delay := time.Until(when)
		if delay < 0 {
			return 0
		}
		if delay > 5*time.Second {
			return 5 * time.Second
		}
		return delay
	}
	return time.Duration(attempt*attempt) * 100 * time.Millisecond
}

func sleepContext(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
