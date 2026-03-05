package main

import (
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type runtimeAppDescriptor struct {
	AppID       string `json:"app_id"`
	DisplayName string `json:"display_name"`
	EntryPath   string `json:"entry_path"`
	TreeID      string `json:"tree_id,omitempty"`
}

func (s *oracleServer) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Only handle exact root path. The "/" mux pattern matches everything
	// unmatched, so reject anything that isn't literally "/".
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	// Serve the runtime app HTML — same content as /app/spike/.
	// This is needed for nex proxy compatibility: the proxy strips /app/spike
	// and forwards "/" to the engine.
	s.serveUIFile(w, r, "index.html")
}

func (s *oracleServer) handleApps(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	items, err := s.buildRuntimeAppDescriptors(strings.TrimSpace(r.URL.Query().Get("tree_id")))
	if err != nil {
		writeControlPlaneError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":    true,
		"items": items,
	})
}

func (s *oracleServer) buildRuntimeAppDescriptors(requestedTreeID string) ([]runtimeAppDescriptor, error) {
	requestedTreeID = strings.TrimSpace(requestedTreeID)
	s.mu.RLock()
	treeIDs := make([]string, 0, len(s.trees))
	for treeID := range s.trees {
		if strings.TrimSpace(treeID) == "" {
			continue
		}
		treeIDs = append(treeIDs, treeID)
	}
	s.mu.RUnlock()
	sort.Strings(treeIDs)

	if requestedTreeID != "" {
		found := false
		for _, treeID := range treeIDs {
			if treeID == requestedTreeID {
				found = true
				break
			}
		}
		if !found {
			return nil, errServeTreeNotFound
		}
		treeIDs = []string{requestedTreeID}
	}

	out := make([]runtimeAppDescriptor, 0, len(treeIDs))
	for _, treeID := range treeIDs {
		values := url.Values{}
		values.Set("tree_id", treeID)
		entryPath := "/app/spike"
		if encoded := values.Encode(); encoded != "" {
			entryPath += "?" + encoded
		}
		appID := "spike-runtime"
		displayName := "Spike Runtime"
		if len(treeIDs) > 1 {
			appID = "spike-runtime-" + sanitizeRuntimeAppID(treeID)
			displayName = "Spike Runtime (" + treeID + ")"
		}
		out = append(out, runtimeAppDescriptor{
			AppID:       appID,
			DisplayName: displayName,
			EntryPath:   entryPath,
			TreeID:      treeID,
		})
	}
	return out, nil
}

func sanitizeRuntimeAppID(raw string) string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		return "tree"
	}
	var b strings.Builder
	for _, ch := range raw {
		switch {
		case ch >= 'a' && ch <= 'z':
			b.WriteRune(ch)
		case ch >= '0' && ch <= '9':
			b.WriteRune(ch)
		default:
			b.WriteByte('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "tree"
	}
	return out
}

func (s *oracleServer) handleRuntimeApp(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	path := strings.TrimSpace(r.URL.Path)
	if path == "/app" || path == "/app/" {
		target := "/app/spike"
		if raw := strings.TrimSpace(r.URL.RawQuery); raw != "" {
			target += "?" + raw
		}
		http.Redirect(w, r, target, http.StatusTemporaryRedirect)
		return
	}

	// Strip the /app/spike prefix and resolve to a file in dist/.
	relPath := strings.TrimPrefix(path, "/app/spike")
	relPath = strings.TrimPrefix(relPath, "/")
	if relPath == "" {
		relPath = "index.html"
	}

	// Try serving the exact file first.
	if s.uiDir != "" {
		clean := filepath.Clean(relPath)
		if !strings.Contains(clean, "..") {
			candidate := filepath.Join(s.uiDir, filepath.FromSlash(clean))
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
				s.serveUIFile(w, r, clean)
				return
			}
		}
	}

	// SPA fallback — serve index.html for unmatched paths.
	s.serveUIFile(w, r, "index.html")
}

// ---------------------------------------------------------------------------
// UI file serving — reads from the dist/ directory on disk
// ---------------------------------------------------------------------------

// serveUIFile serves a named file from the configured UI directory (dist/).
// In nex mode the nex runtime serves the UI directly from the package dist/
// directory; the engine only needs to serve UI in standalone mode.
func (s *oracleServer) serveUIFile(w http.ResponseWriter, r *http.Request, name string) {
	if s.uiDir == "" {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(uiNotAvailableHTML))
		return
	}
	clean := filepath.Clean(name)
	if strings.Contains(clean, "..") {
		http.NotFound(w, r)
		return
	}
	target := filepath.Join(s.uiDir, clean)
	if _, err := os.Stat(target); err != nil {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, target)
}

// resolveUIDir auto-detects the UI directory from the binary location.
// The binary lives at app/bin/spike-engine and the UI files live at
// app/dist/ — i.e. ../dist relative to the binary.
func resolveUIDir() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return ""
	}
	candidate := filepath.Join(filepath.Dir(exe), "..", "dist")
	abs, err := filepath.Abs(candidate)
	if err != nil {
		return ""
	}
	if info, err := os.Stat(abs); err == nil && info.IsDir() {
		return abs
	}
	return ""
}

// uiNotAvailableHTML is a minimal fallback page shown when the dist/
// directory cannot be found relative to the engine binary.
const uiNotAvailableHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Spike — UI Not Available</title>
<style>
body { font-family: system-ui, -apple-system, sans-serif; display: flex;
  justify-content: center; align-items: center; min-height: 100vh;
  margin: 0; background: #0f172a; color: #e2e8f0; }
.box { text-align: center; max-width: 440px; padding: 2rem; }
h1 { font-size: 1.5rem; margin: 0 0 1rem; }
p { color: #94a3b8; line-height: 1.6; }
code { background: #1e293b; padding: 0.15em 0.4em; border-radius: 4px;
  font-size: 0.9em; color: #7dd3fc; }
</style>
</head>
<body>
<div class="box">
  <h1>Spike UI Not Available</h1>
  <p>The <code>dist/</code> directory was not found relative to the engine binary.
     Ensure the UI files are built and placed in the <code>dist/</code> directory
     adjacent to the <code>bin/</code> directory.</p>
  <p style="color:#64748b;font-size:.85rem">Expected layout:
     <code>&lt;app&gt;/bin/spike-engine</code> +
     <code>&lt;app&gt;/dist/index.html</code></p>
</div>
</body>
</html>`
