# OCI-005 Identity and Memory Browser Tests

## Goal

Prove that the Identity and Memory pages render correctly with their sub-tabs,
display runtime data, and handle interactions.

## Scope

### Identity Tests
- Identity tab loads with Entities sub-tab active
- All 6 sub-tabs navigate: Entities, Contacts, Channels, Groups, Policies, Merge Queue
- Entities table shows at least the seeded entity (from onboard)
- Contacts table shows at least the seeded contact email
- Search input is functional on each sub-tab
- Merge Queue renders (may be empty)
- Refresh button triggers data reload

### Memory Tests
- Memory tab loads with Library sub-tab active
- Library shows runs panel (left) and episode inspector (right)
- Runs panel may be empty — empty state renders correctly
- Search sub-tab renders with type selector and search input
- Performing a search doesn't crash (may return no results)
- Quality sub-tab renders with summary cards
- Quality bucket selection is interactive

### Screenshots
- `20-identity-entities.png`
- `21-identity-contacts.png`
- `22-identity-channels.png`
- `23-identity-merge-queue.png`
- `24-memory-library.png`
- `25-memory-search.png`
- `26-memory-quality.png`

## Dependencies

- OCI-001 (harness with seeded identity data from onboard)

## Acceptance

1. All Identity sub-tabs render without errors
2. Seeded entity and contact data appear in the tables
3. All Memory sub-tabs render without errors
4. Search doesn't produce JS errors
5. Quality summary renders (may show zeros)

## Validation

- Playwright assertions on entity/contact presence in tables
- Sub-tab navigation assertions
- Screenshots at each sub-tab
