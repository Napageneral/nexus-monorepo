# OCI-002 Shell, Navigation, and Settings Browser Tests

## Goal

Prove that the console shell renders correctly, all 7 navigation tabs work, and
the settings page displays runtime identity data.

## Scope

### Shell and Navigation Tests
- Console loads without JS errors
- Top nav bar renders with brand logo and all 7 tab labels
- Clicking each tab navigates to the correct page with the right title
- Production toggle is visible in the top-right
- Settings gear icon is clickable
- Dark/light theme toggle works (if exposed)

### Settings Tests
- Settings page renders Profile section
- Profile shows user identity from the runtime (not hardcoded placeholder)
- API Keys section renders with table
- Auth section renders with integrations list
- Save button is present on editable sections

### Screenshots
- `01-shell-initial-load.png` — fresh page load
- `02-nav-each-tab.png` — after cycling through all tabs
- `22-settings-profile.png` — settings profile section
- `23-settings-api-keys.png` — settings API keys section

## Dependencies

- OCI-001 (harness running)

## Acceptance

1. All 7 nav tabs navigate without errors
2. Each page shows the correct title and subtitle
3. Settings profile displays data from the runtime
4. No console JS errors during navigation

## Validation

- Playwright assertions on nav tab count, page titles, profile content
- Screenshots captured at each key moment
- Video shows smooth navigation between all tabs
