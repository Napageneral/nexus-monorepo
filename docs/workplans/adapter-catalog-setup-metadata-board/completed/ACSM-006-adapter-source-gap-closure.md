# ACSM-006 Adapter Source Gap Closure

## Goal

Close adapter source gaps so every supported adapter has a valid setup
descriptor generated from its runtime declaration.

## Why

Most adapters already declare setup metadata, but this needs to be verified
against the shared descriptor contract and corrected where incomplete.

## Scope

- validate all adapter source declarations against the shared descriptor schema
- fix missing labels, field prompts, service names, and method ids
- decide whether the retired Git tombstone is intentionally setup-free
- verify LinkedIn, Telegram, and WhatsApp are publishable or explicitly held
  back
- update adapter tests where setup declarations are currently untested

## Acceptance

- every active adapter package either generates a valid setup descriptor or has
  an explicit documented holdback
- LinkedIn, Telegram, and WhatsApp have a publish decision recorded
- retired Git state is resolved without exposing a stale setup path
- adapter tests cover setup descriptor generation for representative providers
- gap matrix in the board is updated with the final source status

## Completion Notes

- Full `nexus package validate` sweep passes for 28 of 29 local adapter
  packages.
- The only validation failure is the retired `git` tombstone, which remains a
  local-only unpublished inventory entry after deployed Frontdoor cleanup.
- LinkedIn, Telegram, and WhatsApp now pass package validation.
- Telegram and WhatsApp build scripts now leave their Node entrypoints
  executable.
- Direct `adapter.info` checks confirmed Telegram and WhatsApp setup method
  metadata.
