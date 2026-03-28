# Operator Console — Development Guidelines

## Hard Rules

1. **Never paper over errors with mock/fallback data.** If an RPC call or API request fails, show a loud error state (red banner, actual error message, retry button). NEVER silently substitute mock data. Mock data is ONLY used when explicitly opted in via `NEXT_PUBLIC_USE_MOCK=true` or equivalent — never as a catch-block fallback.

2. **Follow the style guide.** See `STYLE-GUIDE.md` for the complete design system. No exceptions.

3. **Fail loud, debug fast.** Console.error with context, not console.log with vague messages. Error states must show the actual error, not "Something went wrong."

## V2 UI Architecture

The v2 UI lives in `app/src/v2/` and is a complete view layer rebuild on top of the existing controller/types/runtime data layer.

### File Structure
```
v2/
├── app-render-v2.ts          # Main render, nav, routing, state wiring
├── navigation.ts             # Tab definitions, legacy tab mapping
├── styles.css                # CSS barrel import
├── styles/
│   ├── tokens.css            # Design tokens (colors, spacing, typography)
│   ├── shell.css             # Nav, layout, settings, dropdowns
│   └── components.css        # All component styles
├── components/
│   ├── modals.ts             # Modal components
│   ├── dropdowns.ts          # User menu, workspace switcher, provisioning
│   └── platform-icons.ts     # SVG platform logos
└── pages/
    ├── apps.ts               # Connectors (platform picker + connected list)
    ├── agents.ts             # Agent cards + empty state
    ├── agent-create.ts       # 4-step creation wizard
    ├── agent-detail.ts       # Split-panel (settings + chat)
    ├── monitor.ts            # Agent activity monitoring
    ├── jobs.ts               # Work runtime (definitions, queue, runs, schedules)
    ├── records.ts            # Ingested external data (browse, channels, search)
    ├── identity.ts           # Entities, contacts, channels, groups, policies, merges
    └── memory.ts             # Library, search, quality review
```

### Key Principles

1. **Reuse the data layer** — Controllers in `ui/controllers/`, types in `ui/types.ts`, and the runtime client in `ui/runtime.ts` are shared between v1 and v2. Never duplicate controller logic.

2. **Follow the style guide** — See `STYLE-GUIDE.md` for the complete design system. Key rules:
   - Use CSS custom properties from `tokens.css`, never hard-coded colors
   - Sub-tabs are text with gold underline, NOT bordered buttons
   - Only one gold primary button per visible section
   - All inputs get gold focus ring
   - Badges use semantic color tokens

3. **Navigation** — 7 top-level tabs: Connectors, Agents, Monitor, Jobs, Records, Identity, Memory. Plus Settings as a page overlay.

4. **Tab naming** — The v2 "Connectors" tab maps to the runtime's "adapters/integrations" domain. "Jobs" maps to "operations/schedules". This mapping is in `navigation.ts`.

5. **State** — V2 state is stored on the AppViewState via `(state as any)._v2*` properties. Sub-tab state, modal state, and wizard state all follow this pattern.

6. **Testing** — Controller tests in `ui/controllers/*.test.ts`, view tests in `v2/pages/*.test.ts`. Run with `npx vitest run` from the package directory.

### Adding a New Page

1. Create `v2/pages/my-page.ts` with a `renderMyPage(props: MyPageProps)` function
2. Add the tab to `navigation.ts` (V2Tab type, V2_TABS, icon, title)
3. Wire it into `app-render-v2.ts` (import, render block, legacy tab mapping)
4. Use existing controllers for data, or add new controller functions following existing patterns
5. Follow `STYLE-GUIDE.md` for all visual elements
