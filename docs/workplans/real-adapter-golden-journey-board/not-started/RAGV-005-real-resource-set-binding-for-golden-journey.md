# RAGV-005 Real Resource-Set Binding For Golden Journey

## Goal

Bind the golden journey to dedicated real review resources so repeated proof
runs stay safe, isolated, and easy to reason about.

## Scope

- define named review resource sets for:
  - Slack channels or workspaces
  - Jira projects, issue labels, or namespaces
  - Git or Bitbucket repositories and branch namespaces
- surface those resource sets in the validation-profile contract
- make the selected resource set visible in review receipts

## Acceptance

- the real-adapter golden journey runs against dedicated review-safe resources
- the selected Slack, Jira, and Git or Bitbucket targets are explicit in proof
  receipts
- ticket proof no longer depends on unspecified production surfaces
