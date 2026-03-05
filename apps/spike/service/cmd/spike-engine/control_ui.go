package main

import (
	"net/http"
)

func (s *oracleServer) handleControlRoot(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	target := "/control/ask-inspector"
	if q := r.URL.RawQuery; q != "" {
		target += "?" + q
	}
	http.Redirect(w, r, target, http.StatusTemporaryRedirect)
}

func (s *oracleServer) handleControlAskInspector(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Serve the inspector HTML from the dist/ directory on disk.
	s.serveUIFile(w, r, "inspector.html")
}
