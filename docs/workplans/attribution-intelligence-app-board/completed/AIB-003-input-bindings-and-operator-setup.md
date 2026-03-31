# AIB-003 Input Bindings And Operator Setup

## Goal

Implement the app-owned input-binding model that connects acquisition inputs,
website installations, and backend outcome inputs to one business scope.

## Acceptance

1. operators can bind shared inputs to one business scope explicitly
2. the app can distinguish acquisition, website, and backend roles cleanly
3. one website input is bound through `website_installation_id`
4. bindings are durable app-owned state, not inferred ad hoc from records
