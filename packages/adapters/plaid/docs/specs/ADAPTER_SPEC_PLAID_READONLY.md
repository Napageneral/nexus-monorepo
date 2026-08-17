# Plaid Read-Only Adapter Specification

Status: live-monitor candidate

Version: 0.3.1

## Objective

Provide a canonical Nex provider adapter that can supply current card-account
balances, liabilities, and transaction changes to an owned accounting system
without relying on QuickBooks UI automation or bank-login scraping.

## Authority

This adapter owns read-only provider access and immutable source evidence. It
does not own:

- account classification
- journal construction or posting
- reconciliation approval
- payment or transfer authority
- Plaid Link authorization
- owned-accounting source-account bindings

## Credential Model

Plaid application credentials and Item access tokens have different lifecycles
and must remain separate.

Application credentials are referenced by environment variable names in runtime
configuration. A durable Nex connection credential contains only one Item
access token. The adapter exposes those references in readbacks but never the
values.

The adapter rejects unsupported environment names and permits only the official
sandbox, development, and production API hosts. Sandbox is the default.

## Method Contract

| Method | Connection required | Provider effect |
| --- | --- | --- |
| `plaid.institutions.coverage` | No | Read institution metadata |
| `plaid.item.get` | Yes | Read Item status |
| `plaid.accounts.list` | Yes | Read accounts |
| `plaid.accounts.balance.get` | Yes | Read a current balance snapshot |
| `plaid.liabilities.get` | Yes | Read liabilities |
| `plaid.transactions.sync` | Yes | Read cursor-based transaction changes |

Every method is declared as read-only with remote mutation disabled.

## Source Evidence

Every provider response returns:

- endpoint
- environment
- provider request id when present
- local fetch timestamp
- SHA-256 of the exact provider body
- exact provider body bytes encoded as base64, with encoding, byte-count, and
  capture-completeness metadata
- parsed raw JSON when the body is valid JSON

The transaction-sync method returns this evidence per successfully accepted page
and separately preserves pages discarded during a restart.

## Transaction State

The adapter never overwrites or deletes a prior transaction observation.

It emits transaction-change actions:

- `added`
- `modified`
- `removed`

Change identity is derived from provider transaction id, change action, and
canonical payload hash. Observation time is deliberately excluded so a repeated
provider payload remains idempotent.

When a posted transaction names a pending predecessor, the change carries an
explicit supersession relationship. A provider removal remains its own change.

## Pagination Consistency

Transaction sync begins from a caller-supplied committed cursor. If the provider
reports a concurrent mutation during pagination:

1. do not merge partial normalized rows into the result
2. preserve discarded page bodies and hashes
3. preserve the error body and hash
4. restart from the original committed cursor
5. cap restart attempts and fail closed if consistency cannot be obtained

The method returns `completion_state`, `cursor_commit_allowed`, and
`terminal_error`. A consumer may commit the returned final cursor only when the
state is `complete`, commit permission is true, the terminal error is null, and
it has durably accepted the complete evidence packet. Any provider,
normalization, pagination, page-limit, or cursor-validation failure observed
after a response returns a terminal evidence payload, retains the caller's
original cursor as `next_cursor`, clears partial normalized rows, and forbids
cursor commit.

A successful terminal provider page without a non-empty `next_cursor` is a
terminal error; it can never reset the consumer cursor. Credential-bearing HTTP
redirects are never followed.

## Money

Provider numeric JSON is decoded as an exact base-10 lexeme. Normalized values
contain:

- exact decimal string
- currency code
- currency exponent when known
- exact minor-unit integer string when representable without rounding
- an explicit exactness flag

Unknown currencies and values with precision beyond the currency exponent stay
decimal-only. The adapter never silently rounds.

## Freshness

Health checks read the Item and accounts. The last event timestamp comes from
the provider's transaction update status. A local successful fetch must not make
stale provider data appear fresh.

## Nex Live Monitor

The live monitor polls an already-authorized Item and emits canonical Nex
records for:

1. Item health and consent state
2. the provider account snapshot
3. the complete Transactions Sync packet
4. every added, modified, or removed transaction change

The complete packet is the consumer authority. It preserves raw page evidence,
normalized arrays, and the provider cursor decision as one immutable record.
Transaction-change records are linked projections and never replace the
packet.

The monitor keeps its committed cursor only in process memory. Restart begins
from the initial cursor and replays deterministic record ids. This is the
adapter's fail-safe recovery strategy because the current stdout monitor
protocol does not acknowledge individual durable record commits back to the
adapter process. No host cursor file can therefore advance ahead of Nex.

A terminal sync packet is emitted as evidence, but the cursor is not advanced
and the monitor exits. Nex supervision may then restart from the initial
cursor.

## Deferred Work

- target-host package installation and secret-safe Item connection creation
- verified Plaid webhook ingress as a monitor wake-up hint
- owned-accounting consumer and reviewed provider-account bindings
- browser-source parity proof and staged retirement
