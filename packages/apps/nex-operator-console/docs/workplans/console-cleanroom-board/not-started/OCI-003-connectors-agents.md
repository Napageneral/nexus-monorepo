# OCI-003 Connectors and Agents Browser Tests

## Goal

Prove that the Connectors page displays adapter data and that the full agent
lifecycle works through the browser: creation wizard → agent list → agent detail
with all sub-tabs and modals.

## Scope

### Connectors Tests
- Connectors tab shows platform picker empty state (or connected list if adapters exist)
- "Browse all connectors" link is visible
- Page title says "Connectors"
- If adapters are seeded: connected list table renders with correct columns

### Agents — List Tests
- Agents tab shows empty state or agent cards from seeded data
- "Create agent" button is visible and clickable

### Agents — Creation Wizard Tests
- Click "Create agent" → wizard opens at Step 1
- Fill agent name, select model → click Next
- Step 2 (Apps): renders, click Next
- Step 3 (Guardrails): renders, click Next
- Step 4 (Review): shows summary of entered data
- Click "Create agent" → wizard closes
- Agent list now includes the newly created agent

### Agents — Detail Tests
- Click an agent card → navigates to agent detail
- Settings tab renders with agent name, description, model
- Triggers section is visible
- Tools section with "Manage" button is visible
- Guardrails section with "Edit" button is visible
- Memory section with "Manage" button is visible
- Channels section is visible
- Persona section is visible
- Skills sub-tab renders (may be empty)
- Run History sub-tab renders (may be empty)
- Chat panel is visible on the right side

### Agents — Modal Tests
- Click "Manage" on Tools → manage tools modal opens and closes
- Click "Edit" on Guardrails → guardrails modal opens and closes
- Click "Manage" on Memory → memory modal opens and closes
- Modals dismiss on backdrop click

### Screenshots
- `02-connectors-empty-state.png`
- `03-agents-empty-state.png`
- `04-agents-wizard-step1.png`
- `05-agents-wizard-step2.png`
- `06-agents-wizard-step3.png`
- `07-agents-wizard-step4-review.png`
- `08-agents-wizard-created.png`
- `09-agent-detail-settings.png`
- `10-agent-detail-skills.png`
- `11-agent-detail-run-history.png`

## Dependencies

- OCI-001 (harness running with seeded test data)

## Acceptance

1. Agent creation wizard completes all 4 steps
2. Created agent appears in the list
3. Agent detail loads with real data from runtime
4. All 3 detail sub-tabs navigate correctly
5. At least 3 modals open and close without errors

## Validation

- Playwright assertions on wizard step progression, agent list content, detail data
- Screenshots at every wizard step and detail tab
- Video captures the full creation → detail flow
