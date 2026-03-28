# OCI-004 Monitor, Jobs, and Records Browser Tests

## Goal

Prove that the Monitor, Jobs, and Records pages render correctly with their
sub-tabs, filters, and data tables.

## Scope

### Monitor Tests
- Monitor tab loads with Live sub-tab active
- Stat cards render (Ops/min, Total, Failed, Avg Latency)
- Filter pills (All, Read, Write, Admin) are clickable
- Status filter pills (All, Completed, Failed) are clickable
- Pause/Clear buttons are functional
- History sub-tab navigates and shows search/filter controls
- If operations exist from test seeding: table shows data rows

### Jobs Tests
- Jobs tab loads with Overview sub-tab active
- 4 stat cards render (Job Definitions, Active Schedules, Queue Depth, Runs)
- Definitions sub-tab shows table (may be empty)
- Queue sub-tab shows filter pills and table
- Runs sub-tab shows table
- Schedules sub-tab shows table
- If schedule was seeded: it appears in the schedules table
- "New Schedule" button is visible

### Records Tests
- Records tab loads with Browse sub-tab active
- Platform and status filter dropdowns are functional
- Channels sub-tab renders with table
- Search sub-tab renders with search input and type selector
- Searching with a query doesn't crash (may return no results)
- Empty states render correctly

### Screenshots
- `12-monitor-live.png`
- `13-monitor-history.png`
- `14-jobs-overview.png`
- `15-jobs-definitions.png`
- `16-jobs-schedules.png`
- `17-records-browse.png`
- `18-records-channels.png`
- `19-records-search.png`

## Dependencies

- OCI-001 (harness running with seeded data including a schedule)

## Acceptance

1. All 3 pages load without errors
2. Sub-tab navigation works on all pages
3. Filters are interactive (clicking changes state)
4. Seeded schedule data appears in Jobs page
5. Empty states render cleanly where no data exists

## Validation

- Playwright assertions on sub-tab counts, stat card values, table headers
- Filter pill click changes active state
- Screenshots at every sub-tab
