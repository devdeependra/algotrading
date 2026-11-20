# Dhan — API notes

Status: **VERIFIED** against https://dhanhq.co/docs/v2/authentication/ on
2026-11-20. Endpoints below were read from the official docs, not inferred.

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

## Not yet verified

Read the docs and record before use:

- `docs/v2/historical-data/` — endpoint, params, interval strings, max range per
  request, response shape, rate limits
- `docs/v2/instruments/` — instrument list format, `securityId` semantics,
  refresh cadence
- `docs/v2/orders/` — order placement params, order types, product types, status
  values, idempotency/tag field
- `docs/v2/market-quote/` — quote shape
- `docs/v2/postback/` — order update webhooks
- Rate limits across all endpoint groups
- Error code catalogue (only `DH-906 Invalid Token` seen so far, and that from a
  third-party source rather than Dhan's own docs)
