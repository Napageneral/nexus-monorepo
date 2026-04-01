# EAP-004 Edit And Unsend Parity

## Goal

Add provider-native edit and unsend behavior and prove that Eve's message-update
pipeline confirms those actions durably.

## Execution Class

private-API-required

## Blocker

This ticket is blocked until a dedicated private-API parity host is available.

Edit and unsend require mutation of an existing provider message, which the
Messages AppleScript surface does not expose truthfully.

## Scope

- edit execution for eligible outbound messages
- unsend execution for eligible outbound messages
- durable confirmation through message-update ingest
- truthful capability and eligibility failure surfaces

## Acceptance

- `imessage.message.edit` works for eligible messages
- `imessage.message.unsend` works for eligible messages
- the resulting edit or retract event lands through the message-update ingest
  path
- failed edits or unsends return truthful eligibility errors

## Validation

- real self-loop edit proof
- real self-loop unsend proof
- message-update canonical record proof
- `git diff --check`
