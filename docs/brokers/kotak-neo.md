# Kotak Neo — API notes

Status: **UNVERIFIED — do not write adapter code from this file.**

Nothing here has been checked against Kotak's official API documentation. It
exists to record what needs finding out, not to be built from.

---

## What is loosely known

From a third-party trading tool's knowledge base, not from Kotak:

- Session-based rather than a user-managed access token.
- Returns `401` / code `100008` when the session is no longer valid.
- That tool reports it reconnects on its own, with no token for the user to
  enter or renew.

Treat all of the above as hearsay until confirmed.

---

## To verify before Phase 9

Fill each in with a source link and the date checked. An item without those is
still unverified.

**Auth**
- [ ] Official API documentation URL
- [ ] Credential types (consumer key/secret, access code, MPIN, TOTP?)
- [ ] Full login flow — is any step browser-only?
- [ ] Token/session lifetime, and expiry time of day
- [ ] Is unattended renewal possible and sanctioned? → sets
      `capabilities.auth.headless` and `mechanism`
- [ ] Session validity check endpoint

**Instruments**
- [ ] Instrument master format and refresh cadence
- [ ] Identifier used in order and data calls → populates `brokerRefs`
- [ ] How BAJAJHFL specifically is identified

**Market data**
- [ ] Historical candle endpoint, params, interval strings
- [ ] Max range per request, available history depth
- [ ] Paid subscription required? → `requiresPaidSubscription`
- [ ] Rate limits

**Trading**
- [ ] Order placement endpoint and params
- [ ] Order types and product types supported
- [ ] Idempotency or client-tag field — **critical for safe retries**
- [ ] Order status values and lifecycle
- [ ] Sandbox available? → `capabilities.trading.sandbox`
- [ ] Static IP required for orders? → `requiresStaticIpForOrders`

**Errors**
- [ ] Error code catalogue, mapped onto `BrokerErrorCode`
- [ ] Rate-limit response shape and retry-after header

---

## Process note

Kotak Neo is Phase 9. Dhan must be working end to end first. When this adapter
is written, the measure of success is that **identical strategy configs produce
identical signals through both adapters** for the same instrument and interval.
If they differ, the abstraction is leaking and that is the bug to fix — not the
signal.
