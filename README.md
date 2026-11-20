# Algotrading

Multi-broker algorithmic trading platform for Indian markets. PoC: RSI
divergence signals on BAJAJHFL (NSE), broker-agnostic from day one.

Read `docs/PROJECT_SPEC.md` before changing anything.

## Setup

Requires Node 22+ and PostgreSQL 16.

```bash
npm install
cp .env.example .env
npm run keygen            # paste output into MASTER_KEY in .env
npm run keygen            # paste output into SESSION_SECRET in .env
# set DATABASE_URL to a dedicated database owned by a dedicated role
npm run migrate
npm run dev               # API on http://localhost:3000
npm run dev:ui            # UI on http://localhost:5173, proxies /api to 3000
```

Set `TEST_DATABASE_URL` in `.env` to a **scratch** database to run the
migration tests. Those tests drop and recreate the `public` schema.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API with hot reload |
| `npm run dev:ui` | Vite dev server |
| `npm test` | Vitest, whole suite |
| `npx vitest run src/crypto/envelope.test.ts` | One file |
| `npx vitest run -t "round-trips"` | Tests matching a name |
| `npm run typecheck` | `tsc --noEmit` for API and UI |
| `npm run lint` | ESLint |
| `npm run migrate` | Apply pending migrations |
| `npm run migrate:status` | Show applied and pending |
| `npm run migrate:new <name>` | Scaffold a migration file |
| `npm run build` | Compile API to `dist/` and UI to `ui/dist/` |
| `npm start` | Run the compiled API, serving `ui/dist/` |
| `npm run keygen` | Print a fresh 32-byte base64 key |

## Layout

See `CLAUDE.md` for the architecture summary and `docs/PROJECT_SPEC.md` §5
onward for the design. Per-broker API notes live in `docs/brokers/`.
