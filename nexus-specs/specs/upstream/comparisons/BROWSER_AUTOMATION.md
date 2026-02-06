# Browser Automation Comparison

OpenClaw's browser subsystem vs Nexus's approach (to be specced).

---

## Status: Investigation Required

Browser automation is a significant subsystem in OpenClaw that requires full review before porting to Nexus. This document captures the current OpenClaw architecture for reference.

---

## OpenClaw Browser Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BROWSER SUBSYSTEM                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐ │
│  │   CLI Layer     │     │    Agent Tool    │     │  Gateway RPC     │ │
│  │ browser-cli.ts  │     │ browser-tool.ts  │     │ browser.request  │ │
│  └────────┬────────┘     └────────┬─────────┘     └────────┬─────────┘ │
│           │                       │                        │           │
│           └───────────────────────┼────────────────────────┘           │
│                                   │                                     │
│                          ┌────────▼─────────┐                          │
│                          │  Browser Client  │                          │
│                          │  client.ts       │                          │
│                          └────────┬─────────┘                          │
│                                   │                                     │
│            ┌──────────────────────┼──────────────────────┐             │
│            │                      │                      │             │
│     ┌──────▼──────┐       ┌───────▼───────┐      ┌───────▼──────┐     │
│     │ Host Browser│       │Sandbox Browser│      │ Node Browser │     │
│     │ Playwright  │       │Docker + CDP   │      │ Remote Node  │     │
│     └─────────────┘       └───────────────┘      └──────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Three Browser Targets

| Target | What It Is | Use Case | Isolation |
|--------|------------|----------|-----------|
| **host** | Playwright on local machine | Full control, visible | None |
| **sandbox** | Docker container + Chromium | Per-session, safe | Container |
| **node** | Remote node with browser | Phone, other machine | Network |

---

## Browser Tool Schema

### Actions (16 total)

| Action | Purpose | Key Parameters |
|--------|---------|----------------|
| `status` | Check if browser running | - |
| `start` | Launch browser | `profile` |
| `stop` | Close browser | - |
| `profiles` | List browser profiles | - |
| `tabs` | List open tabs | `limit` |
| `open` | Open new tab | `targetUrl` |
| `focus` | Focus existing tab | `targetId` |
| `close` | Close tab | `targetId` |
| `snapshot` | Get DOM snapshot | `snapshotFormat`, `maxChars`, `refs` |
| `screenshot` | Capture image | `fullPage`, `type`, `element` |
| `navigate` | Go to URL | `targetUrl` |
| `console` | Get console messages | `level`, `limit` |
| `pdf` | Save page as PDF | - |
| `upload` | Handle file upload | `paths`, `inputRef` |
| `dialog` | Handle alert/confirm | `accept`, `promptText` |
| `act` | Perform action | `request` (see below) |

### Act Kinds (11 total)

| Kind | Purpose | Key Parameters |
|------|---------|----------------|
| `click` | Click element | `targetId`, `ref`, `doubleClick`, `button`, `modifiers` |
| `type` | Type text | `ref`, `text`, `submit`, `slowly` |
| `press` | Press key | `key`, `modifiers` |
| `hover` | Hover over element | `ref` |
| `drag` | Drag and drop | `startRef`, `endRef` |
| `select` | Select dropdown | `ref`, `values` |
| `fill` | Fill form fields | `fields` |
| `resize` | Resize viewport | `width`, `height` |
| `wait` | Wait for condition | `timeMs`, `textGone` |
| `evaluate` | Run JavaScript | `fn` |
| `close` | Close element | `ref` |

### Snapshot Formats

| Format | What It Produces | Use Case |
|--------|------------------|----------|
| `aria` | Accessibility tree with refs | Structured interaction |
| `ai` | Simplified for AI consumption | Token-efficient context |

---

## Sandbox Browser (Docker)

### Container Setup

```typescript
// Key configuration
const cfg = {
  browser: {
    enabled: true,
    containerPrefix: "openclaw-browser-",
    image: "openclaw/sandbox-browser:latest",
    cdpPort: 9222,
    headless: false,
    enableNoVnc: true,  // VNC for visual debugging
    vncPort: 5900,
    noVncPort: 6080,
  },
  scope: "session",  // or "shared"
  workspaceAccess: "rw",  // or "ro" or "none"
};
```

### Isolation Model

- **Per-session containers**: Each session gets its own browser
- **Workspace mounting**: Agent workspace mounted (optionally read-only)
- **CDP exposure**: Chrome DevTools Protocol on localhost
- **VNC access**: Optional visual debugging via noVNC

### Container Lifecycle

1. Session starts → Check if container exists
2. If not → Create container with sandbox image
3. If exists but stopped → Start container
4. Wait for CDP ready (poll `/json/version`)
5. Return CDP connection details
6. Session ends → Container persists (manual cleanup)

---

## Node Browser Proxy

For using a browser on a remote device (phone, another machine):

```typescript
async function callBrowserProxy(params: {
  nodeId: string;
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  profile?: string;
}): Promise<BrowserProxyResult> {
  return await callGatewayTool("node.invoke", {
    nodeId: params.nodeId,
    command: "browser.proxy",
    params: { ... },
  });
}
```

### Node Selection

1. Check `gateway.nodes.browser.mode` (auto/manual/off)
2. If manual → require explicit node selection
3. If auto → use single connected browser node
4. If multiple nodes → require explicit selection

---

## CLI Examples

```bash
# Lifecycle
openclaw browser status
openclaw browser start
openclaw browser start --browser-profile work
openclaw browser stop

# Navigation
openclaw browser open https://example.com
openclaw browser navigate https://another.com
openclaw browser tabs

# Observation
openclaw browser screenshot
openclaw browser screenshot --full-page
openclaw browser snapshot --format ai
openclaw browser console --level error

# Actions
openclaw browser act click --ref "Submit button"
openclaw browser act type --ref "Search input" --text "hello"
openclaw browser act press --key "Enter"
openclaw browser act fill --fields '[{"ref":"email","value":"test@example.com"}]'

# Profiles
openclaw browser profiles
```

---

## Nexus Approach (TBD)

### Open Questions

1. **Subsystem vs Adapter?**
   - Should browser be a first-class NEX subsystem?
   - Or should it be an adapter that NEX communicates with?

2. **Isolation Model**
   - Require Docker for all browser use?
   - Allow host browser with warnings?
   - Sandboxing strategy for tool execution?

3. **State Persistence**
   - How does browser state persist across sessions?
   - Cookie/localStorage management?
   - Profile switching?

4. **Security**
   - Prevent malicious navigation/scraping
   - Restrict file access from browser
   - Sanitize URLs before navigation

5. **Integration Points**
   - Agent tool interface
   - CLI interface
   - NEX event integration (page load events, etc.)

### Possible Nexus Architecture

```
Option A: Browser as Subsystem
┌──────────────────────────────────────┐
│              NEX Daemon              │
│  ┌────────────────────────────────┐  │
│  │     Browser Subsystem          │  │
│  │  ┌──────────────────────────┐  │  │
│  │  │  Playwright Controller   │  │  │
│  │  │  Container Manager       │  │  │
│  │  │  CDP Bridge              │  │  │
│  │  └──────────────────────────┘  │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘

Option B: Browser as Adapter
┌──────────────────────────────────────┐
│              NEX Daemon              │
│  ┌────────────────────────────────┐  │
│  │       Adapter Manager          │  │
│  └───────────────┬────────────────┘  │
└──────────────────┼───────────────────┘
                   │
        ┌──────────▼──────────┐
        │   Browser Adapter   │  (separate process)
        │   - Playwright      │
        │   - Container mgmt  │
        └─────────────────────┘
```

**Recommendation:** Option A (subsystem) seems more appropriate given:
- Browser is a core capability, not just another channel
- Low latency requirements for interactive use
- Tight integration with agent tool execution
- State sharing across sessions

---

## What to Port

| Feature | Port? | Priority | Notes |
|---------|-------|----------|-------|
| CDP abstraction | Yes | High | Playwright is excellent |
| Host browser | Yes | High | For interactive use |
| Sandbox containers | Yes | High | For agent execution |
| Node proxy | Maybe | Medium | Depends on node system |
| Snapshot formats | Yes | High | `aria` and `ai` |
| Act system | Yes | High | Core interaction model |
| Profile support | Yes | Medium | Work vs personal |
| VNC debugging | Maybe | Low | Nice to have |

---

## Security Considerations

From OpenClaw v2026.2.1 release:
- "Secure Chrome extension relay CDP sessions"
- CDP sessions need authentication/isolation
- Prevent cross-session CDP access

Additional Nexus considerations:
- URL allowlisting for automated navigation
- File path sanitization for uploads/downloads
- JavaScript execution restrictions
- Network access controls

---

*This document captures OpenClaw browser architecture for reference. Full Nexus browser spec requires dedicated investigation session.*
