# Algo Trading Platform — Project Specification

Version 1.0 · 2026-11-20 · PoC phase

---

## 1. Goal

Build a multi-broker algorithmic trading platform for Indian markets.

**PoC deliverable:** a system that computes RSI divergence signals on Bajaj
Housing Finance (NSE: BAJAJHFL), on demand and on a schedule, and — in later
phases, behind explicit gates — places orders based on those signals.

**Success criteria for the PoC:**

1. A signal can be produced on demand and matches a hand-verified calculation.
2. The same signal is produced automatically on a schedule without human
   intervention for token management.
3. Adding a third broker requires writing one adapter and changing nothing else.
4. Orders can be placed, and the system can be stopped instantly at any moment.

**Non-goals for the PoC:** backtesting, multi-user order routing, crypto,
portfolio optimisation, a strategy marketplace, tick-level data storage.

---

## 2. The constraint that shapes everything

Broker support is not a feature to be added later. It is the architecture.

The list today is **Dhan** and **Kotak Neo**. It will grow — Zerodha, Angel One,
Fyers, Upstox, and eventually crypto venues like Delta Exchange. Those venues
differ in ways that will break naive abstractions:

| Dimension | Variation across brokers |
|---|---|
| Auth | Headless TOTP (Dhan), daily browser OAuth (Upstox), refresh token (Angel One), manual only (Zerodha) |
| Instrument identity | `securityId`, `instrument_token`, `instrument_key`, symbol strings — all different |
| Static IP | Required for orders at some, not at others, not at all for crypto |
| Data cost | Free (Angel One, Fyers), paid (Dhan ₹499/mo, Zerodha ₹500/mo) |
| Sandbox | Exists (Dhan, Upstox), does not (Zerodha, Angel One) |
| Market hours | 09:15–15:30 IST for NSE; 24/7 for crypto |
| Rate limits | Different shapes and units at every venue |

**Therefore:** the `BrokerAdapter` interface is written first, and every other
module depends only on it. A capability model handles the differences rather
than lowest-common-denominator flattening.

---

## 3. Stack

- **Runtime:** Node.js 22, TypeScript strict, ESM
- **API:** Express
- **DB:** PostgreSQL 16. No TimescaleDB — not needed at this volume, and
  unavailable on RDS. Market data is fetched per run and discarded.
- **UI:** React + Vite
- **Numbers:** `decimal.js`. Never floats for prices or quantities.
- **Scheduling:** `node-cron` with an explicit market calendar
- **Deployment:** single always-on instance (Oracle Cloud ARM Always Free, or
  AWS Lightsail). Postgres on the same box.

---

## 4. Regulatory boundaries

These are constraints on what gets built, not legal advice.

**Permitted, no registration:** the operator running self-built algos on their
own account, below 10 orders/second. Orders carry a generic algo ID the broker
handles.

**Not permitted without exchange empanelment:** placing orders in other people's
accounts. SEBI's retail algo framework (circular 4 Feb 2025, mandatory at all
brokers since 1 April 2026) makes anyone doing this an algo provider. Brokers
may only deal with empanelled providers.

**Design consequences:**
- The system is single-operator. Build users/auth, but **no multi-user order
  routing**.
- Static IP whitelisting is required for order placement at Indian brokers. On
  Dhan it is required only for order placement, not for fetching data or order
  details. Note: once set, a Dhan IP cannot be changed for 7 days — decide
  hosting before setting it.
- If a requirement starts drifting toward placing orders for others, stop and
  raise it.

---

## 5. Broker adapter layer

### 5.1 Capability model

Every adapter declares what it can do. Callers check capabilities instead of
branching on broker name. A `switch (brokerId)` outside `src/brokers/` is a
design failure.

```ts
export interface BrokerCapabilities {
  auth: {
    headless: boolean;          // can renew without a human
    mechanism: 'totp' | 'oauth-browser' | 'refresh-token' | 'manual';
    tokenLifetimeHours: number;
  };
  data: {
    historical: boolean;
    intradayCandles: boolean;
    liveStream: boolean;
    requiresPaidSubscription: boolean;
    supportedIntervals: Interval[];
  };
  trading: {
    supported: boolean;
    sandbox: boolean;
    requiresStaticIpForOrders: boolean;
    orderTypes: OrderType[];
    productTypes: ProductType[];
  };
  market: {
    venue: 'NSE' | 'BSE' | 'MCX' | 'CRYPTO';
    alwaysOpen: boolean;        // true for crypto
  };
}
```

### 5.2 The interface

```ts
export interface BrokerAdapter {
  readonly id: string;                    // 'dhan' | 'kotak-neo'
  readonly displayName: string;
  readonly capabilities: BrokerCapabilities;

  // --- auth ---
  authenticate(creds: BrokerCredentials): Promise<AuthSession>;
  isSessionValid(session: AuthSession): Promise<boolean>;
  renewSession(session: AuthSession, creds: BrokerCredentials): Promise<AuthSession>;

  // --- instruments ---
  searchInstrument(query: InstrumentQuery): Promise<Instrument[]>;
  resolveInstrument(symbol: string, exchange: Exchange): Promise<Instrument | null>;

  // --- market data ---
  getCandles(req: CandleRequest): Promise<Candle[]>;
  getQuote(instrument: Instrument): Promise<Quote>;

  // --- trading (Phase 5+; guarded by capabilities.trading.supported) ---
  placeOrder(order: OrderRequest): Promise<OrderResponse>;
  getOrder(orderId: string): Promise<Order>;
  getOrders(): Promise<Order[]>;
  cancelOrder(orderId: string): Promise<void>;
  getPositions(): Promise<Position[]>;
}
```

### 5.3 Canonical domain types

Adapters translate into these. Nothing outside an adapter sees a broker's own
field names.

```ts
export interface Instrument {
  id: string;              // our internal stable ID, never the broker's
  symbol: string;          // 'BAJAJHFL'
  exchange: Exchange;      // 'NSE'
  name: string;
  instrumentType: 'EQ' | 'FUT' | 'OPT' | 'CRYPTO';
  tickSize: Decimal;
  lotSize: number;
  brokerRefs: Record<string, string>;  // { dhan: '15083', 'kotak-neo': '...' }
}

export interface Candle {
  openTime: Date;          // UTC, bucket start
  open: Decimal; high: Decimal; low: Decimal; close: Decimal;
  volume: Decimal;
}

export type Interval = '1m' | '5m' | '15m' | '30m' | '1h' | '1d';
```

**`brokerRefs` is the key design decision.** One `Instrument` row carries each
broker's own identifier. Cross-broker logic uses our `id`; adapters look up
their own ref. This also handles NSE symbol renames and reuse, which will matter
once more instruments are added.

### 5.4 Error taxonomy

Adapters translate broker errors into these. Callers never parse a broker's
error string.

```ts
export type BrokerErrorCode =
  | 'AUTH_EXPIRED'        // token dead, renewable
  | 'AUTH_FAILED'         // credentials wrong, needs human
  | 'RATE_LIMITED'        // includes retryAfterMs
  | 'STATIC_IP_REJECTED'  // IP not whitelisted
  | 'INSTRUMENT_UNKNOWN'
  | 'MARKET_CLOSED'
  | 'INSUFFICIENT_FUNDS'
  | 'ORDER_REJECTED'
  | 'SUBSCRIPTION_REQUIRED'  // data plan not active
  | 'BROKER_UNAVAILABLE'
  | 'UNKNOWN';

export class BrokerError extends Error {
  code: BrokerErrorCode;
  brokerId: string;
  retryable: boolean;
  retryAfterMs?: number;
  raw?: unknown;          // never logged if it may contain credentials
}
```

`AUTH_EXPIRED` vs `AUTH_FAILED` is the distinction the scheduler depends on:
the first triggers an automatic renewal, the second notifies a human and stops.

### 5.5 Adding a broker

The checklist, which should stay this short:

1. `docs/brokers/<id>.md` with VERIFIED endpoint details.
2. `src/brokers/<id>/` implementing `BrokerAdapter`.
3. Register in `registry.ts`.
4. Contract tests (§5.6) pass.

No changes anywhere else. If a new broker forces a change to shared code, the
abstraction is wrong — fix the abstraction.

### 5.6 Contract tests

A shared suite every adapter must pass, run against recorded fixtures:

- `resolveInstrument('BAJAJHFL', 'NSE')` returns an instrument with a non-empty
  `brokerRefs[thisBroker]`
- `getCandles` returns chronologically ascending candles with no duplicate
  `openTime`
- Candle OHLC invariants hold: `high >= max(open, close)`, `low <= min(open, close)`
- All prices are `Decimal`, never `number`
- An expired token produces `AUTH_EXPIRED`, not a generic failure
- A rate-limit response produces `RATE_LIMITED` with `retryAfterMs` set

---

## 6. Broker notes

### 6.1 Dhan — primary, VERIFIED

Source: https://dhanhq.co/docs/v2/authentication/ (read 2026-11-20).

**Headless auth — the reason Dhan is primary:**

```
POST https://auth.dhan.co/app/generateAccessToken
     ?dhanClientId={id}&pin={6-digit}&totp={code}
```

Returns `accessToken` and `expiryTime`, valid 24 hours. TOTP is generated
server-side from a stored secret (RFC 6238). No browser, no human. Dhan's docs
describe TOTP setup explicitly as being for API-only flows.

**Do not use `RenewToken`.** It only works for tokens generated from Dhan Web,
and only on tokens that are still active — it cannot resurrect an expired one.
Generate fresh each morning instead.

Other verified facts:
- Trading APIs free; Data APIs ₹499/month. Check `dataPlan` / `dataValidity` via
  `GET /v2/profile`.
- API key and secret valid 12 months.
- **Static IP required only for order placement** (Orders, Super Order, Forever
  Order). Not required for fetching order or trade details, and not for data.
- Once set, an IP cannot be modified for 7 days. Primary and secondary slots
  available — set primary to the main host, keep secondary in reserve.
- Sandbox available.
- `GET /v2/profile` is the cheap liveness/validity check.

### 6.2 Kotak Neo — secondary, UNVERIFIED

**Nothing about Kotak Neo's API has been verified for this project.** Known only
that it is session-based and that at least one third-party tool reports it
reconnects automatically with no token for the user to manage.

Before writing the adapter: read the official Kotak Neo API documentation and
record verified endpoints, auth flow, token lifetime, instrument identifiers,
rate limits, and static-IP requirements in `docs/brokers/kotak-neo.md`. **Do not
write adapter code from inference.**

### 6.3 Universal constraints

- Daily token expiry is an exchange 2FA mandate. Every Indian broker has it.
- Static IP whitelisting for order placement is a SEBI/exchange requirement.
- Market hours 09:15–15:30 IST, Mon–Fri, minus exchange holidays.

---

## 7. Strategy engine

Pure functions. No I/O, no clock reads, no broker types. Candles in, signal out.

### 7.1 RSI

Wilder's smoothing, not a simple moving average. Period 14 default.

Wilder's matters: most charting platforms use it, and an SMA-based RSI produces
visibly different values. Signals would not match what the operator sees on a
chart, which destroys trust in the system.

### 7.2 Pivot detection

Fractal method. A bar is a swing high if its high exceeds the `pivotLeft` bars
before and `pivotRight` bars after. Inverted for swing lows. Default 5 and 5.

**A pivot is only confirmed `pivotRight` bars after it occurs.** Signals are
therefore lagged by that many bars. This is inherent, not a bug. Surface the lag
in the UI so it is never a surprise.

### 7.3 Divergence rules

Compare the two most recent confirmed pivots of the same kind.

**Regular (reversal):**
- Bullish: price lower low + RSI higher low → BUY
- Bearish: price higher high + RSI lower high → SELL

**Hidden (continuation):**
- Bullish: price higher low + RSI lower low → BUY
- Bearish: price lower high + RSI higher high → SELL

PoC ships regular divergence only. Hidden is behind a config flag, off by
default.

### 7.4 Parameters

```ts
interface DivergenceConfig {
  rsiPeriod: number;        // 14
  pivotLeft: number;        // 5
  pivotRight: number;       // 5
  minBarsBetween: number;   // 5
  maxBarsBetween: number;   // 60
  lookback: number;         // 200 candles fetched
  includeHidden: boolean;   // false
}
```

### 7.5 Signal output

```ts
interface Signal {
  type: 'BUY' | 'SELL' | 'NEUTRAL';
  divergenceType: 'REGULAR_BULLISH' | 'REGULAR_BEARISH'
                | 'HIDDEN_BULLISH' | 'HIDDEN_BEARISH' | null;
  instrumentId: string;
  interval: Interval;
  generatedAt: Date;
  priceAtSignal: Decimal;
  rsiAtSignal: Decimal;
  pivots: { priceA: PivotPoint; priceB: PivotPoint; rsiA: PivotPoint; rsiB: PivotPoint } | null;
  barsLagged: number;       // = pivotRight
}
```

### 7.6 Testing

Hand-built fixture series with known-correct answers, committed as JSON:

- A clean regular bullish divergence → BUY
- A clean regular bearish divergence → SELL
- No divergence → NEUTRAL
- Pivots closer than `minBarsBetween` → NEUTRAL
- Pivots further apart than `maxBarsBetween` → NEUTRAL
- Fewer candles than `rsiPeriod + pivotLeft + pivotRight` → explicit
  `InsufficientDataError`, never a silent NEUTRAL

RSI values verified against an independent implementation.

---

## 8. Database schema

PostgreSQL. No market data is stored — candles are fetched per run and discarded.

| Table | Purpose |
|---|---|
| `users` | id, email, password_hash, created_at |
| `broker_accounts` | user_id, broker_id, label, encrypted_credentials, status |
| `broker_sessions` | broker_account_id, encrypted_access_token, expires_at, last_renewed_at |
| `instruments` | internal id, symbol, exchange, name, instrument_type, tick_size, lot_size |
| `instrument_broker_refs` | instrument_id, broker_id, broker_ref — the `brokerRefs` map, normalised |
| `strategy_configs` | user_id, broker_account_id, instrument_id, interval, params JSONB, schedule_cron, enabled, dry_run |
| `runs` | config_id, started_at, finished_at, status (OK/SKIPPED_NO_TOKEN/ERROR), error_code, error_message |
| `signals` | run_id, config_id, type, divergence_type, price, rsi, pivots JSONB, bars_lagged, generated_at |
| `orders` | **Phase 5+.** signal_id, broker_account_id, broker_order_id, client_tag, side, qty, order_type, status, filled_qty, avg_price, timestamps |
| `positions` | **Phase 5+.** config_id, instrument_id, state, qty, avg_entry_price, opened_at, closed_at |
| `risk_events` | **Phase 6+.** type, details JSONB, created_at — every limit breach and kill-switch activation |
| `audit_log` | actor, action, entity, before/after JSONB, created_at |

### 8.1 Credential encryption

AES-256-GCM envelope encryption. Data key encrypted by a master key held outside
the repo (environment variable at minimum; a secrets manager preferably).

Encrypted fields: Dhan PIN, TOTP secret, API secret, access tokens, and every
equivalent for future brokers.

**Unattended auth means the server holds everything needed to access the trading
account** — the PIN and the TOTP secret together are the full second factor.
This is the deliberate cost of removing the daily login. Treat that host
accordingly: no shared access, no credentials in logs, encrypted at rest.

---

## 9. Scheduler

- `node-cron`, timezone `Asia/Kolkata`.
- **Market calendar table** with NSE holidays. Check before every run. A run
  outside market hours is skipped and logged as such, not treated as an error.
  Crypto venues set `capabilities.market.alwaysOpen` and bypass this.
- **Token freshness check before every run.** If expired and
  `capabilities.auth.headless` → renew automatically. If not headless → skip the
  run, log `SKIPPED_NO_TOKEN`, notify once per day (not once per run).
- **Overlap guard.** A run never starts while the previous one for the same
  config is in flight.
- **Every run writes a `runs` row**, including skips and failures. A scheduler
  that silently does nothing is the failure mode to design against.

---

## 10. Phases

Each phase has an acceptance gate. Do not start the next until it passes.

### Phase 1 — Foundation
Express/TS scaffold, migrations, user auth, envelope encryption helpers,
config loading, CI, deployment to the target host.
**Gate:** register, log in, health endpoint green in production.

### Phase 2 — Broker abstraction + Dhan
`BrokerAdapter` interface, capability model, canonical types, error taxonomy,
registry, contract test suite. Dhan adapter: headless TOTP auth, session
storage and renewal, instrument resolution, historical candles.
**Gate:** fetch 200 BAJAJHFL daily candles through the adapter; contract tests
pass; token renews unattended across a real day boundary.

### Phase 3 — Strategy engine
Wilder RSI, pivot detection, divergence rules, signal type. Fixtures and tests.
**Gate:** all fixtures pass; RSI matches an independent implementation; a
hand-checked BAJAJHFL divergence is reproduced correctly.

### Phase 4 — Scheduling and signals
Market calendar, cron runner, run log, signal persistence, notifications,
signal history UI, config editing.
**Gate:** runs unattended for five consecutive trading days with no manual token
intervention and no missed runs.

### Phase 5 — Execution plumbing
`src/execution/` created here and not before. Order placement with client tags,
order state polling, position state machine
(FLAT → PENDING_ENTRY → LONG → PENDING_EXIT → FLAT), orders and positions
tables. Tested entirely against a zero-funds account and Dhan's sandbox.
**Gate:** full lifecycle exercised against sandbox and zero-funds rejections;
restart mid-order recovers correct state.

### Phase 6 — Safety layer
Risk limits (max position, max orders/day, max daily loss, per-order cap), kill
switch, startup reconciliation against broker state, alerts on every order
event, `risk_events` logging.
**Gate:** each limit demonstrably blocks an order; kill switch halts everything
within one second; reconciliation detects a deliberately introduced mismatch.

**Nothing goes live before this phase is complete.**

### Phase 7 — Supervised live
Signal fires → operator approves in the UI → order places. Minimum position
sizes. Run for several weeks.
**Gate:** no unexplained behaviour over the observation period.

### Phase 8 — Autonomous
Remove the approval step. Only after Phase 7 produces no surprises.

### Phase 9 — Kotak Neo
Verify the API, document it, write the adapter, pass contract tests.
**Gate:** identical strategy configs produce identical signals via Dhan and
Kotak Neo for the same instrument and interval.

---

## 11. Open decisions

Confirm before the phase that depends on each.

| # | Decision | Needed by |
|---|---|---|
| 1 | Candle interval — daily or intraday (15m/1h)? Changes scheduling entirely | Phase 4 |
| 2 | Notifications — email, Telegram, or UI only? | Phase 4 |
| 3 | Position sizing — fixed quantity, fixed rupee amount, or % of capital? | Phase 5 |
| 4 | Exits — stop-loss and target with each entry, or exit only on opposite divergence? The latter means unbounded holds with no downside protection | Phase 5 |
| 5 | Intraday or positional — square off before 15:30 or hold overnight? Affects margin and risk | Phase 5 |
| 6 | Hosting — Oracle Cloud ARM or AWS Lightsail? Decide before setting the Dhan static IP, which locks for 7 days | Phase 1 |

---

## 12. Things that are easy to get wrong

Collected so they are not rediscovered expensively.

- **Wilder's RSI, not SMA.** Signals must match the operator's charts.
- **Pivot lag is real.** `pivotRight` bars of delay, always. Show it.
- **Dhan's `RenewToken` is a dead end.** Web-generated tokens only, active
  tokens only. Use `generateAccessToken` with TOTP.
- **Decimal, not float**, everywhere money appears.
- **A skipped run is not a successful run.** Log every skip with a reason.
- **Never trust local state after a restart.** Reconcile against the broker.
- **An order-placement timeout does not mean the order failed.** Query by client
  tag before retrying. This is how duplicate positions happen.
- **The Dhan static IP locks for 7 days.** Choose hosting first.
- **Credentials in stack traces.** The `raw` field on `BrokerError` can carry
  them. Scrub before logging.
