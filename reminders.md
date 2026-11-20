# Reminders

## Blocking
- [ ] Hosting decision: Oracle Cloud ARM vs AWS Lightsail (spec §11 #6). Needed
      before deploy and before setting the Dhan static IP (locks 7 days).
- [ ] Push to GitHub. Remote `origin` is set to
      `git@github.com:devdeependra/algotrading.git` and CI workflow is
      committed; the repo itself must be created first (website, or
      `brew install gh && gh auth login`). Then `git push -u origin main`.
- [ ] Deployment deferred, but it must land before Phase 4: that gate needs
      five unattended trading days on an always-on host.
- [ ] Phase 1b (proposed 2026-11-20, awaiting confirmation): roles + approval
      workflow + admin panel. See last_work.md for the proposal summary.

## Phase 1 follow-ups
- [ ] Rate-limit `/api/auth/login` and `/api/auth/register` (stdlib, in-memory
      is fine for a single instance).
- [ ] Decide on `helmet` and a structured logger (`pino`) — both are new
      dependencies, ask first. Logger must redact credential fields.
- [ ] Node 22.5.1 locally pins Vite to 6.x; upgrading Node to ≥22.12 allows
      Vite 8 and the current `@vitejs/plugin-react`.
- [ ] Docker Desktop paused `navodaya-postgres`; if it keeps happening,
      consider a native Postgres 16 or a dedicated container for this project.

## Patterns worth borrowing from navodaya-network (already in place or cheap)
- Refuse to start in production with missing/default secrets — done via
  `loadConfig()`.
- One global error handler, no stacks to clients — done.
- Conventional Commits, snake_case plural tables, validate at the boundary,
  audit-log sensitive actions (spec §8 `audit_log` table, Phase 4).
- CI order: `npm ci`, typecheck, lint, test, advisory `npm audit`.
- Not copying: turbo, NestJS DI, TypeORM `synchronize`, Redis/OpenSearch,
  jest.

## Before Phase 2
- [ ] Verify and record in `docs/brokers/dhan.md`: historical-data endpoint,
      instrument list / `securityId`, market-quote shape, rate limits, error
      code catalogue.
- [ ] Lint rule enforcing hard rule 7 (no `fetch` to broker hosts outside
      `src/brokers/`).

## Before Phase 4
- [ ] Candle interval: daily vs intraday (spec §11 #1).
- [ ] Notification channel: email / Telegram / UI only (spec §11 #2).

## Before Phase 5
- [ ] Document Dhan sandbox (base URL, credential flow, differences).
- [ ] Verify Dhan orders endpoint, order/product types, client-tag field.
- [ ] Position sizing, exit rules, intraday vs positional (spec §11 #3–5).

## Phase 9
- [ ] Verify Kotak Neo API end to end; fill `docs/brokers/kotak-neo.md`.
