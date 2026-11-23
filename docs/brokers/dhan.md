# Dhan — API notes

Status: **VERIFIED**. Auth, profile and static-IP sections read from
https://dhanhq.co/docs/v2/authentication/ on 2026-11-20. Historical data,
instruments, market quote, rate limits and error codes read from the official
docs (`/docs/v2/`, `historical-data/`, `instruments/`, `market-quote/`,
`annexure/`) and the live instrument CSV on 2026-11-23. Endpoints below were
read from the official docs, not inferred.

Anything not recorded here is unverified. Check the docs and add it, rather than
guessing from a pattern.

---

## Auth

### Headless token generation — use this one

```
POST https://auth.dhan.co/app/generateAccessToken
     ?dhanClientId={clientId}&pin={6-digit-pin}&totp={6-digit-code}
```

Requires TOTP enabled on the account (Dhan Web → DhanHQ Trading APIs → Setup
TOTP). The docs describe TOTP as being for API-only flows, so this is a
sanctioned path, not a workaround.

Response:

```json
{
  "dhanClientId": "1000000401",
  "dhanClientName": "JOHN DOE",
  "dhanClientUcc": "ABCD12345E",
  "givenPowerOfAttorney": false,
  "accessToken": "eyJ...",
  "expiryTime": "2026-01-01T00:00:00.000"
}
```

`expiryTime` is 24 hours from generation, IST.

TOTP is standard RFC 6238 — 6 digits, 30-second step. Generate server-side from
the stored secret.

### RenewToken — do not use

```
POST https://api.dhan.co/v2/RenewToken
```

Two limits make it unsuitable for unattended operation:
- Only works for tokens generated from **Dhan Web**, not from
  `generateAccessToken` or the OAuth flow.
- Only renews **active** tokens. An expired token returns an error.

Miss one renewal and the chain is broken with no automatic recovery. Generate
fresh with TOTP each morning instead.

### API key + secret OAuth — browser step, avoid for automation

Three steps: generate consent → browser login with 2FA → consume consent.
Step 2 requires a real browser. Limit of 25 consent IDs per day. Only one token
active at a time.

API key and secret are valid **12 months**.

---

## Session validity

```
GET https://api.dhan.co/v2/profile
Header: access-token: {JWT}
```

Cheap liveness check. Returns:

- `tokenValidity` — token expiry
- `dataPlan` — `Active` / `Deactive`, Data API subscription
- `dataValidity` — data subscription expiry
- `activeSegment`, `ddpi`, `mtf`

Use this for `isSessionValid()`. Also check `dataPlan` before a data call and
raise `SUBSCRIPTION_REQUIRED` rather than letting the data call fail obscurely.

---

## Static IP

**Required only for order placement** — Orders, Super Order, Forever Order.
Not required for fetching order details, trade details, or market data.

So the signal-only phases need no static IP at all.

```
POST   https://api.dhan.co/v2/ip/setIP      { dhanClientId, ip, ipFlag }
PUT    https://api.dhan.co/v2/ip/modifyIP   { dhanClientId, ip, ipFlag }
GET    https://api.dhan.co/v2/ip/getIP
```

- `ipFlag` is `PRIMARY` or `SECONDARY`. Both IPv4 and IPv6 accepted.
- **Once set, an IP cannot be modified for 7 days.** `getIP` returns
  `modifyDatePrimary` / `modifyDateSecondary`.
- Each individual needs a unique static IP.

Operational note: decide hosting before setting this. Set primary to the main
host and keep the secondary slot in reserve for a migration.

---

## Pricing

- Trading APIs: free for all Dhan users.
- Data APIs: paid (~₹499/month). Verify current price on the platform.

---

## Sandbox

Dhan provides a sandbox. Details not yet recorded — **document the base URL,
credential flow, and behavioural differences from production here before Phase
5**, rather than discovering them during execution testing.

---

## Request conventions

- Base URL `https://api.dhan.co/v2/`.
- Headers: `access-token: {JWT}` on every call, `Content-Type: application/json`.
  Market Quote additionally requires `client-id: {dhanClientId}`.
- Error body shape: `{ "errorType": "", "errorCode": "", "errorMessage": "" }`.
  Docs say "standard HTTP response codes" and do not list which status goes
  with which code. **Map on `errorCode`, not on HTTP status.**

## Rate limits (from `/docs/v2/#rate-limit`)

| | Order APIs | Data APIs | Quote APIs | Non Trading APIs |
|---|---|---|---|---|
| per second | 10 | 5 | 1 | 20 |
| per minute | 250 | - | Unlimited | Unlimited |
| per hour | 1000 | - | Unlimited | Unlimited |
| per day | 7000 | 100000 | Unlimited | Unlimited |

Order modifications are capped at 25 per order. Historical data counts as a
Data API; `marketfeed/*` counts as a Quote API (1 req/s). No `Retry-After`
header is documented, so `retryAfterMs` must come from our own backoff.

## Error codes (from `/docs/v2/annexure/`)

Trading API errors (`errorCode` values):

| Code | Type | Meaning | Our `BrokerErrorCode` |
|---|---|---|---|
| DH-901 | Invalid Authentication | Client ID or access token invalid or expired | `AUTH_EXPIRED` if we hold a session past `expiryTime`, else `AUTH_FAILED` |
| DH-902 | Invalid Access | Data APIs not subscribed / no Trading API access | `SUBSCRIPTION_REQUIRED` |
| DH-903 | User Account | Segment not activated etc. | `AUTH_FAILED` (needs a human) |
| DH-904 | Rate Limit | Too many requests | `RATE_LIMITED` |
| DH-905 | Input Exception | Missing fields, bad values | `UNKNOWN` (our bug) |
| DH-906 | Order Error | Bad order request | `ORDER_REJECTED` |
| DH-907 | Data Error | Bad params or no data present | `INSTRUMENT_UNKNOWN` when the securityId is at fault, else `UNKNOWN` |
| DH-908 | Internal Server Error | | `BROKER_UNAVAILABLE`, retryable |
| DH-909 | Network Error | Backend unreachable | `BROKER_UNAVAILABLE`, retryable |
| DH-910 | Others | | `UNKNOWN` |

Data API errors (numeric codes, returned by the data endpoints):

| Code | Meaning | Our `BrokerErrorCode` |
|---|---|---|
| 800 | Internal Server Error | `BROKER_UNAVAILABLE`, retryable |
| 804 | Requested number of instruments exceeds limit | `UNKNOWN` (our bug) |
| 805 | Too many requests or connections; may be blocked | `RATE_LIMITED` |
| 806 | Data APIs not subscribed | `SUBSCRIPTION_REQUIRED` |
| 807 | Access token is expired | `AUTH_EXPIRED` |
| 808 | Authentication Failed - Client ID or Access Token invalid | `AUTH_FAILED` |
| 809 | Access token is invalid | `AUTH_FAILED` |
| 810 | Client ID is invalid | `AUTH_FAILED` |
| 811 | Invalid Expiry Date | `UNKNOWN` |
| 812 | Invalid Date Format | `UNKNOWN` |
| 813 | Invalid SecurityId | `INSTRUMENT_UNKNOWN` |
| 814 | Invalid Request | `UNKNOWN` |

Note the asymmetry: the data endpoints distinguish expired (807) from invalid
(808/809), the trading endpoints collapse both into DH-901. The adapter must
consult the stored `expiryTime` to split DH-901.

## Enums (from `/docs/v2/annexure/`)

Exchange segment: `IDX_I` (0), `NSE_EQ` (1), `NSE_FNO` (2), `NSE_CURRENCY` (3),
`BSE_EQ` (4), `MCX_COMM` (5), `BSE_CURRENCY` (7), `BSE_FNO` (8).

Instrument: `INDEX`, `FUTIDX`, `OPTIDX`, `EQUITY`, `FUTSTK`, `OPTSTK`,
`FUTCOM`, `OPTFUT`, `FUTCUR`, `OPTCUR`.

Product type: `CNC`, `INTRADAY`, `MARGIN`, `CO`, `BO` (CO/BO intraday only).

Order status: `TRANSIT`, `PENDING`, `CLOSED`, `TRIGGERED`, `REJECTED`,
`CANCELLED`, `PART_TRADED`, `TRADED`.

Expiry code: `0` current/near, `1` next, `2` far.

## Instruments (from `/docs/v2/instruments/` and the live CSV, 2026-11-23)

Two public CSVs, no auth required:

- Compact: `https://images.dhan.co/api-data/api-scrip-master.csv`
  (~30 MB, ~237k rows on 2026-11-23)
- Detailed: `https://images.dhan.co/api-data/api-scrip-master-detailed.csv`

Refresh cadence is not documented. Treat as daily; re-fetch at most once a day.

Compact header, verbatim:

```
SEM_EXM_EXCH_ID,SEM_SEGMENT,SEM_SMST_SECURITY_ID,SEM_INSTRUMENT_NAME,
SEM_EXPIRY_CODE,SEM_TRADING_SYMBOL,SEM_LOT_UNITS,SEM_CUSTOM_SYMBOL,
SEM_EXPIRY_DATE,SEM_STRIKE_PRICE,SEM_OPTION_TYPE,SEM_TICK_SIZE,
SEM_EXPIRY_FLAG,SEM_EXCH_INSTRUMENT_TYPE,SEM_SERIES,SM_SYMBOL_NAME
```

Detailed header starts: `EXCH_ID,SEGMENT,SECURITY_ID,ISIN,INSTRUMENT,
UNDERLYING_SECURITY_ID,UNDERLYING_SYMBOL,SYMBOL_NAME,DISPLAY_NAME,
INSTRUMENT_TYPE,SERIES,LOT_SIZE,...,TICK_SIZE,...` and the row ends with a
trailing comma (empty last column), so the parser must tolerate that.

`SEM_SMST_SECURITY_ID` / `SECURITY_ID` is the `securityId` used by every data
and order endpoint. `SEM_SEGMENT` is a single letter (`E` equity, `D`
derivatives, `C` currency, `M` commodity); combine with `SEM_EXM_EXCH_ID` to get
the API's `exchangeSegment` (`NSE` + `E` → `NSE_EQ`).

BAJAJHFL rows observed on 2026-11-23 (compact file):

```
NSE,E,25270,EQUITY,0,BAJAJHFL,1.0,Bajaj Housing Finance,,,,1.0000,NA,ES,EQ,BAJAJ HOUSING FINANCE LTD
BSE,E,544252,EQUITY,0,BAJAJHFL,1.0,Bajaj Housing Finance,,,,1.0000,NA,ES,A,Bajaj Housing Finance Lim
```

So **BAJAJHFL on NSE_EQ is `securityId` 25270**, ISIN `INE377Y01014`, lot 1,
tick 1.00 (the CSV says `1.0000`; the quote API returns paise-precision
prices, so treat tick size from the CSV with suspicion and confirm against a
live quote before Phase 5). Match on `SEM_TRADING_SYMBOL` + `SEM_EXM_EXCH_ID` +
`SEM_SERIES = EQ` for cash equities; do not match on `SM_SYMBOL_NAME`.

There is also `GET https://api.dhan.co/v2/instrument/{exchangeSegment}` which
returns the detailed list for one segment. Response format is not documented;
prefer the CSV.

## Historical data (from `/docs/v2/historical-data/`)

Both are POST, `access-token` header, JSON body. Both are Data APIs
(5 req/s, 100k/day) and need the Data API subscription.

### Daily

```
POST https://api.dhan.co/v2/charts/historical
{
  "securityId": "25270",
  "exchangeSegment": "NSE_EQ",
  "instrument": "EQUITY",
  "expiryCode": 0,          // optional, derivatives only
  "oi": false,              // optional, F&O only
  "fromDate": "2022-01-08",
  "toDate": "2022-02-08"    // NON-inclusive
}
```

Available back to the instrument's inception. No maximum range documented.

### Intraday

```
POST https://api.dhan.co/v2/charts/intraday
{
  "securityId": "25270",
  "exchangeSegment": "NSE_EQ",
  "instrument": "EQUITY",
  "interval": "5",          // one of 1, 5, 15, 25, 60 (minutes)
  "oi": false,
  "fromDate": "2024-09-11 09:30:00",
  "toDate": "2024-09-15 13:00:00"
}
```

- Intervals: `1`, `5`, `15`, `25`, `60` minutes only. **No 30-minute
  interval.** Our `Interval` type's `30m` is not supported by Dhan; the
  adapter must reject it with `UNKNOWN`, and `capabilities.data.supportedIntervals`
  must omit it.
- Last 5 years available. **Max 90 days per request.**
- Whether `toDate` is inclusive is not stated for intraday.

### Response (both endpoints)

Parallel arrays, one element per candle:

```json
{
  "open": [..], "high": [..], "low": [..], "close": [..],
  "volume": [..], "timestamp": [..], "open_interest": [..]
}
```

- Prices arrive as JSON floats. **Parse the raw body text into `Decimal`**
  rather than going through `number`, or at minimum build `Decimal` from the
  float and accept the ~2 dp precision Dhan actually uses.
- `timestamp` is "Epoch timestamp"; the unit is not stated. The example value
  `1326220200` is 2012-01-10 18:30:00 UTC = 2012-01-11 00:00 IST, so it is
  **seconds**, and daily candles are stamped at IST midnight of the session
  date. Confirm on the first real call and record the result here.
- `open_interest` appears in the example response but not in the parameter
  table; ignore for equities.
- Ordering and uniqueness are not documented. The adapter sorts and dedupes
  before returning (the contract test requires it anyway).

## Market quote (from `/docs/v2/market-quote/`)

All POST, headers `access-token` and `client-id`. Body maps exchange segment to
an array of numeric security ids, up to 1000 instruments per call, **1 request
per second**.

```
POST https://api.dhan.co/v2/marketfeed/ltp     → data[seg][id].last_price
POST https://api.dhan.co/v2/marketfeed/ohlc    → + ohlc { open, high, low, close }
POST https://api.dhan.co/v2/marketfeed/quote   → + average_price, buy_quantity,
     sell_quantity, depth { buy[], sell[] } (quantity, orders, price),
     last_quantity, last_trade_time (string), lower_circuit_limit,
     upper_circuit_limit, net_change, volume, oi, oi_day_high, oi_day_low
```

Body example: `{ "NSE_EQ": [25270] }`. Response: `{ "data": { "NSE_EQ":
{ "25270": {...} } }, "status": "success" }`. Security ids are strings in the
response keys and numbers in the request.

## Not yet verified

Read the docs and record before use:

- `docs/v2/orders/` — order placement params, order types, validity values,
  idempotency/tag field (`correlationId`?), response shape. **Phase 5 gate.**
- `docs/v2/postback/` — order update webhooks. Phase 5.
- `docs/v2/portfolio/` — positions and holdings shape. Phase 5.
- Sandbox base URL and behaviour. Phase 5.
- Which HTTP status accompanies each `errorCode` (docs do not say).
- Historical `timestamp` unit and intraday `toDate` inclusivity: confirm
  empirically on the first authenticated call.
