# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read `docs/PROJECT_SPEC.md` in full before starting any phase. It is the source
of truth; this file only orients you.

## Current state

**Pre-Phase 1. No code exists yet** — the repo is `docs/` and this file. There
is no `package.json`, so the commands below do not work until the Phase 1
scaffold lands. Phase 1 cannot finish until open decision #6 (hosting) is made,
because the Dhan static IP locks for 7 days once set.

## What this is

A multi-broker algorithmic trading platform for Indian markets. PoC scope: RSI
divergence signals on a single stock (Bajaj Housing Finance, NSE: BAJAJHFL),
with order placement added in later phases.

**The defining design constraint: broker-agnostic from day one.** Dhan and Kotak
Neo are the first two adapters. More will follow (Zerodha, Angel One, Fyers,
Upstox) and crypto venues (Delta Exchange) later. No broker-specific type, field
name, or assumption may leak outside its adapter directory.

## Stack

- Node.js 22, TypeScript (strict), ESM
- Express for the API
- PostgreSQL 16 — **no TimescaleDB**. Not needed at PoC volume and unavailable
  on RDS. Do not add it.
- React + Vite for the UI
- `decimal.js` for all money/quantity arithmetic; `node-cron` for scheduling
- Deployed as a single always-on instance (Oracle Cloud ARM or AWS Lightsail)

## Hard rules

1. **Never place a live order before Phase 6 is complete and signed off.**
   Until then the system is read-only. There is no "just to test it" exception.
   The order-placement code path does not exist before Phase 5.
2. **Never log, print, or return a credential** — PINs, TOTP secrets, API
   secrets, access tokens. Redact in error paths and exception messages too.
   Credentials must never appear in a stack trace. `BrokerError.raw` can carry
   them — scrub before logging.
3. **No secrets in the repo.** No `.env`, no credentials in fixtures or tests.
4. **Prices and quantities are never JavaScript floats.** Use `decimal.js`
   throughout. Float arithmetic on money is a bug, not a style choice.
5. **Do not invent broker API details.** If an endpoint, field name, parameter,
   or auth step is not recorded as VERIFIED in `docs/brokers/<broker>.md`, stop
   and ask. Kotak Neo is currently UNVERIFIED in its entirety. Dhan is verified
   for auth, profile and static-IP endpoints only; historical data, instruments,
   orders and quotes are listed as "Not yet verified" in `docs/brokers/dhan.md`.
6. **Ask before adding a dependency.** Prefer the standard library.
7. **Every broker API call goes through an adapter.** No `fetch` to a broker
   host from `src/strategy/`, `src/scheduler/`, or `src/api/`. A
   `switch (brokerId)` anywhere outside `src/brokers/` is a design failure —
   branch on `capabilities` instead.

## Working style

- Question-first. Before writing code for a phase, confirm the approach in
  conversation. Do not produce a large implementation unprompted.
- Each phase has acceptance criteria in the spec (§10). Do not begin phase N+1
  until phase N meets them.
- Tests alongside the code, not after. The strategy engine especially must be
  tested against hand-built fixtures with known-correct answers (spec §7.6).
- Small commits, conventional commit messages.

## Commands

Planned for the Phase 1 scaffold; keep this block accurate when `package.json`
is created.

```bash
npm run dev          # API with hot reload
npm run dev:ui       # Vite dev server
npm run test         # vitest, whole suite
npx vitest run src/strategy/indicators/rsi.test.ts   # single file
npx vitest run -t "regular bullish"                  # single test by name
npm run typecheck    # tsc --noEmit
npm run lint
npm run migrate      # apply DB migrations
npm run migrate:new  # scaffold a new migration
```

## Architecture

The dependency direction is the architecture. Everything points at the adapter
interface; nothing points at a specific broker.

```
api / ui  ──►  scheduler  ──►  brokers (BrokerAdapter)  ──►  dhan | kotak-neo
                   │
                   └──►  strategy (pure: Candle[] in, Signal out)
```

- **`src/brokers/`** (spec §5) — `BrokerAdapter` interface, `BrokerCapabilities`
  model, canonical domain types (`Instrument`, `Candle`, `Quote`, `Order`...),
  `BrokerError` taxonomy, and the registry. Adapters translate their broker's
  field names and errors into these; nothing outside sees the broker's own
  shapes. `Instrument.brokerRefs` maps our stable internal id to each broker's
  identifier. Adding a broker = one doc, one adapter dir, one registry line,
  contract tests pass — nothing else changes.
- **`src/strategy/`** (spec §7) — pure functions, zero I/O, no clock reads, no
  broker types. Wilder's RSI (not SMA), fractal pivots, regular divergence
  (hidden behind a flag, off). Pivots confirm `pivotRight` bars late; signals
  carry `barsLagged` so the UI shows it. Too few candles throws
  `InsufficientDataError`, never a silent NEUTRAL.
- **`src/scheduler/`** (spec §9) — `node-cron` in `Asia/Kolkata`, market
  calendar check, token-freshness check, overlap guard. Every run writes a
  `runs` row, including skips. The `AUTH_EXPIRED` vs `AUTH_FAILED` split is what
  it keys on: the first triggers renewal if `capabilities.auth.headless`, the
  second notifies a human and stops.
- **`src/execution/`** (spec §10, Phase 5+) — does not exist until Phase 5.
  Position state machine FLAT → PENDING_ENTRY → LONG → PENDING_EXIT → FLAT.
- **`src/crypto/`** (spec §8.1) — AES-256-GCM envelope encryption; master key
  outside the repo. Holds PIN + TOTP secret together, i.e. the full 2FA.
- **`src/db/`** (spec §8) — migrations and repositories. No market data is
  stored; candles are fetched per run and discarded.
- **`docs/brokers/<id>.md`** — per-broker VERIFIED API notes. The gate for
  writing any adapter code.

## Context worth knowing

- Market: NSE, 09:15–15:30 IST, Mon–Fri, exchange holidays apply. All
  timestamps stored UTC; all session logic in IST.
- **Regulatory: this trades the operator's own account only.** Placing orders in
  other people's accounts makes us an algo provider requiring exchange
  empanelment under SEBI's framework. Do not build multi-user order routing, and
  flag it if a requirement starts drifting that way.
- Broker auth tokens expire daily at every Indian broker. This is an exchange
  2FA mandate, not a broker limitation. Brokers differ in whether renewal can be
  automated; the adapter abstracts over that difference. On Dhan, use
  `generateAccessToken` with TOTP each morning; `RenewToken` is a dead end.
- Static IP is needed only for order placement (Phase 5+), not for data.
- An order-placement timeout does not mean the order failed. Query by client
  tag before retrying — that is how duplicate positions happen.
- The RSI divergence logic is roughly 200 lines. The machinery that stops it
  doing something expensive while nobody is watching is most of the project.
  Weight effort accordingly.
- Spec §11 lists open decisions with the phase each blocks; §12 lists known
  pitfalls. Check both before starting a phase.

## Session bookkeeping

`last_work.md` (history, newest first) and `reminders.md` (upcoming work) live
at the repo root. Read `last_work.md` at the start of a session; update both at
the end of meaningful work.
