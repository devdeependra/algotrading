# Last work

## 2026-11-20 (evening) — Phase 1b: roles, approval workflow, admin panel

**Done**
- Migration `20261120000002`: `role`, `status`, `approved_by`, `approved_at`,
  `updated_at` on `users`; new `audit_log` table.
- `SUPERADMIN_EMAIL` config. Registration with that email → superadmin +
  active; all others → pending member. `src/users/ensureSuperadmin.ts` runs
  at startup to re-bind if the email changes (and did so for the real
  account, which had registered before the migration).
- `src/api/authz.ts`: pure `canLogIn` / `canManage` rules, fully unit tested.
- Middleware `requireAuth` (blocks suspended/rejected), `requireActive`,
  `requireRole`. Routes: `POST /api/auth/password`, `GET /api/admin/users`,
  `POST /api/admin/users/:id/{approve,reject,suspend,reinstate}`,
  `PATCH /api/admin/users/:id/role`. Every transition writes `audit_log`.
- UI: tiny path router (`ui/src/router.ts`), layout with nav, pages Home
  (pending notice vs dashboard), Profile (change password), Admin Users
  (pending queue + all users with actions). No React Router yet.
- 47 tests passing. Typecheck + lint clean. Pushed to GitHub with CI.
- Smoke: a throwaway `smoke-member@example.com` was registered and left
  **pending** so the user can approve/reject it from the UI.

**Next step**
- User tries the approval in the UI, then confirms Phase 2 approach
  (BrokerAdapter interface, capability model, Dhan adapter) before code.

## 2026-11-20 (later) — Run, CI, repo, Phase 1b proposal

**Done**
- Ran the app: API on :3000 (`npm run dev`), UI on :5173 (`npm run dev:ui`).
  Verified health through the Vite proxy and the rendered sign-in page.
- Added `.github/workflows/ci.yml` (npm ci, typecheck, lint, test with a
  Postgres 16 service, build, advisory audit). Committed.
- Set `origin` to `git@github.com:devdeependra/algotrading.git`. Push failed
  because the repo does not exist yet; `gh` is not installed.
- User asked for roles + approval workflow + admin panel before Phase 2.
  Proposed as Phase 1b; awaiting confirmation on the open choices.

**Next step**
- User creates the GitHub repo (or installs/logs in `gh`), then push.
- Confirm Phase 1b design, then implement.

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
