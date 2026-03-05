package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestServeFrontDoorAuthMiddleware(t *testing.T) {
	srv := &oracleServer{
		trees:                      map[string]*servedTree{},
		authToken:                  "secret-token",
		allowUnauthenticatedStatus: true,
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	statusResp, err := http.Get(httpSrv.URL + "/status")
	if err != nil {
		t.Fatalf("get /status: %v", err)
	}
	if statusResp.StatusCode != http.StatusOK {
		t.Fatalf("expected unauthenticated /status 200, got %d", statusResp.StatusCode)
	}
	_ = statusResp.Body.Close()

	unauthResp, err := http.Post(httpSrv.URL+"/jobs/list", "application/json", bytes.NewReader([]byte(`{}`)))
	if err != nil {
		t.Fatalf("post /jobs/list unauth: %v", err)
	}
	if unauthResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected unauthenticated /jobs/list 401, got %d", unauthResp.StatusCode)
	}
	_ = unauthResp.Body.Close()

	wrongReq, _ := http.NewRequest(http.MethodPost, httpSrv.URL+"/jobs/list", bytes.NewReader([]byte(`{}`)))
	wrongReq.Header.Set("Content-Type", "application/json")
	wrongReq.Header.Set("Authorization", "Bearer wrong-token")
	wrongResp, err := http.DefaultClient.Do(wrongReq)
	if err != nil {
		t.Fatalf("post /jobs/list wrong auth: %v", err)
	}
	if wrongResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected wrong token /jobs/list 401, got %d", wrongResp.StatusCode)
	}
	_ = wrongResp.Body.Close()

	authReq, _ := http.NewRequest(http.MethodPost, httpSrv.URL+"/jobs/list", bytes.NewReader([]byte(`{}`)))
	authReq.Header.Set("Content-Type", "application/json")
	authReq.Header.Set("Authorization", "Bearer secret-token")
	authResp, err := http.DefaultClient.Do(authReq)
	if err != nil {
		t.Fatalf("post /jobs/list auth: %v", err)
	}
	if authResp.StatusCode != http.StatusInternalServerError {
		t.Fatalf("expected authenticated /jobs/list to pass auth and hit control-store error 500, got %d", authResp.StatusCode)
	}
	_ = authResp.Body.Close()
}

func TestServeFrontDoorStatusAuthPolicyAndControlQueryToken(t *testing.T) {
	srv := &oracleServer{
		trees:                      map[string]*servedTree{},
		authToken:                  "secret-token",
		allowUnauthenticatedStatus: false,
		uiDir:                      testUIDir(t),
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	statusResp, err := http.Get(httpSrv.URL + "/status")
	if err != nil {
		t.Fatalf("get /status unauth: %v", err)
	}
	if statusResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected unauthenticated /status 401 when policy disabled, got %d", statusResp.StatusCode)
	}
	_ = statusResp.Body.Close()

	authReq, _ := http.NewRequest(http.MethodGet, httpSrv.URL+"/status", nil)
	authReq.Header.Set("Authorization", "Bearer secret-token")
	authResp, err := http.DefaultClient.Do(authReq)
	if err != nil {
		t.Fatalf("get /status with auth: %v", err)
	}
	if authResp.StatusCode != http.StatusOK {
		t.Fatalf("expected authenticated /status 200, got %d", authResp.StatusCode)
	}
	_ = authResp.Body.Close()

	controlResp, err := http.Get(httpSrv.URL + "/control/ask-inspector?auth_token=secret-token")
	if err != nil {
		t.Fatalf("get /control/ask-inspector with query token: %v", err)
	}
	if controlResp.StatusCode != http.StatusOK {
		t.Fatalf("expected query-token control UI access 200, got %d", controlResp.StatusCode)
	}
	_ = controlResp.Body.Close()

	controlUnauthResp, err := http.Get(httpSrv.URL + "/control/ask-inspector")
	if err != nil {
		t.Fatalf("get /control/ask-inspector unauth: %v", err)
	}
	if controlUnauthResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected unauthenticated control UI access 401, got %d", controlUnauthResp.StatusCode)
	}
	_ = controlUnauthResp.Body.Close()
}

func TestServeFrontDoorRateLimiter(t *testing.T) {
	srv := &oracleServer{
		trees:       map[string]*servedTree{},
		rateLimiter: newRequestRateLimiter(0.001, 1),
	}
	httpSrv := httptest.NewServer(srv.handler())
	defer httpSrv.Close()

	resp1, err := http.Get(httpSrv.URL + "/status")
	if err != nil {
		t.Fatalf("first get /status: %v", err)
	}
	if resp1.StatusCode != http.StatusOK {
		t.Fatalf("expected first request 200, got %d", resp1.StatusCode)
	}
	_ = resp1.Body.Close()

	resp2, err := http.Get(httpSrv.URL + "/status")
	if err != nil {
		t.Fatalf("second get /status: %v", err)
	}
	if resp2.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("expected second request to be rate-limited (429), got %d", resp2.StatusCode)
	}
	_ = resp2.Body.Close()
}

func TestTrustedProxyClientIPResolution(t *testing.T) {
	trusted, err := parseTrustedProxyList("127.0.0.1/32,10.0.0.1")
	if err != nil {
		t.Fatalf("parse trusted proxies: %v", err)
	}
	srv := &oracleServer{trustedProxies: trusted}

	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	req.RemoteAddr = "127.0.0.1:43210"
	req.Header.Set("X-Forwarded-For", "203.0.113.10, 127.0.0.1")
	if got := srv.requestClientIP(req); got != "203.0.113.10" {
		t.Fatalf("expected forwarded client IP, got %q", got)
	}

	reqUntrusted := httptest.NewRequest(http.MethodGet, "/status", nil)
	reqUntrusted.RemoteAddr = "198.51.100.9:52345"
	reqUntrusted.Header.Set("X-Forwarded-For", "203.0.113.12")
	if got := srv.requestClientIP(reqUntrusted); got != "198.51.100.9" {
		t.Fatalf("expected direct remote IP for untrusted proxy, got %q", got)
	}

	if _, err := parseTrustedProxyList("not-a-cidr"); err == nil {
		t.Fatalf("expected invalid trusted proxy list to fail")
	}
}
