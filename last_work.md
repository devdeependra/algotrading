# Last work

## 2026-11-20 — Phase 1 scaffold

**Done**
- `git init` on `main`. Commits are the author's own; no AI attribution.
- Root `package.json` with npm workspaces (`ui/`), strict ESM `tsconfig`,
  ESLint flat config, Vitest.
- `src/config/`: stdlib `.env` loader and `loadConfig()` with fail-fast
  validation that never echoes values.
- `src/crypto/`: AES-256-GCM envelope encryption with optional context AAD,
  scrypt password hashing, `npm run keygen`.
- `src/db/`: `pg` pool, forward-only SQL migration runner with
  `schema_migrations`, `users` migration, `PgUserRepository`.
- `src/api/`: Express 5 app factory, `GET /api/health`, register / login /
  logout / me with HMAC-signed HttpOnly session cookies, SPA static serving.
- `ui/`: Vite + React 19 shell showing health and a sign-in / register form.
- 34 tests passing (31 unit, 3 against Postgres). Typecheck and lint clean.
- Smoke-tested the compiled server: health 200, register 201, me 200, UI 200.
- Local DB: `algotrading` role + `algotrading` / `algotrading_test` databases on
  the `navodaya-postgres` Docker container (it was paused; unpaused it).
  `.env` written with fresh keys. Not committed.
- Surveyed `../navodaya-network` for reusable patterns; it is a NestJS/turbo
  monorepo by a different author. Takeaways recorded in `reminders.md`.

**Current state**
- Phase 1 gate partially met: register, login, health green **locally**.
  Remaining: CI workflow, GitHub remote, deploy to production host.

**Next step**
- Hosting decision (Oracle ARM vs Lightsail), then GitHub remote + CI, then
  deploy. After that, confirm Phase 2 approach (BrokerAdapter interface) in
  conversation before writing it.
