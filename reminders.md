# Reminders

## Blocking
- [ ] Hosting decision: Oracle Cloud ARM vs AWS Lightsail (spec §11 #6). Needed
      before Phase 1 and before setting the Dhan static IP (locks 7 days).
- [ ] `git init` the repo.

## Phase 1
- [ ] Create `package.json` and make the commands in `CLAUDE.md` real.

## Before Phase 2
- [ ] Verify and record in `docs/brokers/dhan.md`: historical-data endpoint,
      instrument list / `securityId`, market-quote shape, rate limits, error
      code catalogue.

## Before Phase 4
- [ ] Candle interval: daily vs intraday (spec §11 #1).
- [ ] Notification channel: email / Telegram / UI only (spec §11 #2).

## Before Phase 5
- [ ] Document Dhan sandbox (base URL, credential flow, differences).
- [ ] Verify Dhan orders endpoint, order/product types, client-tag field.
- [ ] Position sizing, exit rules, intraday vs positional (spec §11 #3–5).

## Phase 9
- [ ] Verify Kotak Neo API end to end; fill `docs/brokers/kotak-neo.md`.
