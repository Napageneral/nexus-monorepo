# Operator Console: Tab Reorganization + Adapters Redesign

**Status:** IMPLEMENTATION SPEC
**Date:** 2026-02-27

---

## 1. Tab Reorganization

### Current Structure

```
Workspace: Command Center, Agents, Directory
Operations: Access, Work, Adapters, Memory, Automations
```

### New Structure

```
Workspace: Command Center, Agents, Entities
Operations: Adapters, Access, Work, Memory, Automations
```

### Changes

**Rename `directory` → `entities`:**

- Path: `/entities` (was `/directory`)
- Legacy redirect: `/directory` → `entities`
- Title: "Entities"
- Subtitle: "Knowledge graph — people, organizations, groups, and their contacts."
- Icon: `users` (unchanged)
- Content: Same entity search + detail views (unchanged for now)

**Reorder Operations group:**

- Move Adapters to first position (most-used config surface)
- Order: Adapters, Access, Work, Memory, Automations

**Future tabs (not in this PR):**

- **Conversations** — Channel directory (sendable targets across platforms). Needs `channel_directory.list` runtime API. Placeholder only if time permits.

### Files Modified

- `navigation.ts` — Tab type, paths, groups, legacy redirect
- `app-settings.ts` — `refreshActiveTab` references
- `app-render.ts` — Template `directory` → `entities` guard
- `app-view-state.ts` — State field references
- `navigation.test.ts` — Update assertions
- `navigation.browser.test.ts` — No changes needed (doesn't test directory directly)

---

## 2. Adapters Overview Redesign

### Current Problems

- Cards are tall/verbose with 4 status rows + embedded account table
- Grid forces `grid-cols-4` but cards are too wide for that
- Auth row shows method labels ("Connect Google Account") instead of credential status
- Last sync shows full `toLocaleString()` timestamp — wastes space
- No visual distinction between connected/disconnected at a glance
- Credential inventory table columns truncate on smaller viewports

### Redesigned Adapter Cards

**Layout:** Compact horizontal card with left status border

- Green left border = connected
- Gray left border = disconnected
- Red left border = error/expired

**Card content (single card, ~3 lines):**

```
[Icon] Adapter Name                    [status pill]
       adapter-id · 4 accounts · 2m ago
       [OAuth badge] [Bot Token badge]
```

**Grid:** `repeat(auto-fit, minmax(320px, 1fr))` — 2-3 columns depending on viewport

**Relative time helper:**

```typescript
function relativeTime(ts: number | null): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}
```

**Expandable account list:** Click card to toggle account details (collapsed by default)

### Redesigned Credential Inventory

**Horizontal table with fixed column widths:**

| Adapter (100px) | Account (flex) | Credential (flex) | Type (100px) | Status (90px) |
| --------------- | -------------- | ----------------- | ------------ | ------------- |

- Type column: pill badges — "oauth2" green, "bot_token" blue, "api_key" purple, "custom" gray
- Status column: colored dot + label — green "ready", red "expired", gray "n/a"
- Proper `overflow-x: auto` wrapper for narrow viewports

### CSS Changes

- New `.adapter-card` replacing `.adapter-card-compact`
- `.adapter-card--connected`, `.adapter-card--error`, `.adapter-card--disconnected` border variants
- `.adapters-grid` replacing `.adapters-overview-grid`
- `.credential-type-pill` with color variants
- `.credential-status` with dot indicator

---

## 3. Connect Sub-tab Improvements

### Current Problems

- Flat list with separate "Select" buttons
- Raw JSON payload textarea is prominent
- Too many action buttons visible at once
- Setup guide text is buried

### Changes

- Card-based adapter selection (click card = select, highlighted state)
- Show auth method buttons directly on selected card
- Group: primary action (OAuth / Start Setup) prominent, secondary (Test / Disconnect) subdued
- JSON payload hidden behind "Advanced" toggle
- Setup instructions rendered more prominently above actions

---

## Verification

1. `npx tsc --noEmit` — zero errors
2. `npx vitest run` — all tests pass
3. `npx vite build` — production build succeeds
4. Visual: Navigate all tabs, verify entities loads, adapter cards render correctly
