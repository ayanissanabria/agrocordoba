# AGENTS.md

Spanish-language marketplace for Córdoba, Colombia. React 19 + TypeScript + Vite 6 + Tailwind 4 frontend (`src/`) and a single-file Flask 3 + SQLAlchemy + Socket.IO backend (`backend/app.py`).

`README.md` and `backend/README.md` are detailed and generally current; prefer `app.py`, `package.json`, and the Dockerfiles when they conflict.

## Architecture

- `src/main.tsx` → `src/App.tsx` is the frontend shell. There is no router: navigation is state-driven, and only `/producto/<slug>/<id>` is read from `window.location`/`popstate`. Heavy panels are lazy-loaded.
- `backend/app.py` contains the models, all API routes, Socket.IO handlers, startup migrations, and the `create-admin` CLI. There are no blueprints or `migrations/` directory.
- Local mode: Vite on :3000 + Flask on :5000 + SQLite at `backend/instance/agrocordoba.db`.
- Compose mode: nginx frontend + Flask + PostgreSQL 17. Root `Dockerfile` is the single-origin Render image (Flask serves `dist/`, API, `/producto/...`, `/sitemap.xml`); Compose uses `Dockerfile.frontend` and `Dockerfile.backend`.

## Commands

From the repo root:

- `npm ci` — npm/`package-lock.json` is the package source of truth; `bun.lock` is unused.
- `npm run dev` — Vite on :3000; proxies `/api`, `/auth`, `/socket.io` to :5000.
- `npm run lint` — only `tsc --noEmit`; there is no ESLint, Prettier, or CI workflow.
- `npm run build` — typecheck plus production build into `dist/`.

Backend (Python 3.13, commands from `backend`):

```sh
python3.13 -m venv .venv && source .venv/bin/activate
python -m pip install -r requirements.txt
python app.py                                  # API on :5000
python -m pytest -q -p no:cacheprovider        # full suite
python -m pytest -q tests/test_api.py::test_health_reports_ok   # one test
```

Docker/Make: `make` (start), `make logs`, `make test` (tests in container), `make fixtures` (sample SQLite into an empty PostgreSQL only), `make down`. Use `make down`, not `docker compose down -v`, unless deleting the PostgreSQL volume is intended.

## Gotchas

- Configuration lives only in the root `.env` (`app.py` loads `PROJECT_ROOT / ".env"`). `backend/.env.example` is intentionally inert; do not create `backend/.env`. Compose creates `.env` only when missing and never overwrites it.
- `FLASK_SECRET_KEY` is required at import time: any script or test importing `app` fails without it. `backend/tests/conftest.py` sets the test env before importing; keep that ordering.
- Backend tests use in-memory SQLite (`DATABASE_URL=sqlite://`) and must run from `backend`, because they import `app` directly. The frontend has no test suite.
- No Alembic. Startup runs `db.create_all()` plus hand-written `_migrate_*` functions. Model changes may require updating those migrations, `backend/database/schema.sql`, and the sample-database generation scripts together.
- Socket.IO uses `async_mode="threading"` with in-memory presence/socket maps, and Gunicorn is intentionally configured as one worker with many threads. Do not increase worker count without adding shared state or a message queue.
- The frontend has a demo path: `INITIAL_PRODUCTS`/`INITIAL_QUOTATIONS` from `src/data/mockData.ts` and localStorage are merged with `/api/products`. Demo entries lack `producerId` and cannot start real backend chat; keep both demo and authenticated flows working.
- `src/types.ts` is hand-maintained against Flask payloads (no codegen); update both sides together.
- Render deployment is defined in `render.yaml` (free web service + free Postgres). `_get_database_url()` explicitly rewrites `postgresql://` to `postgresql+psycopg2://`; SQLAlchemy 2.1 would otherwise look for psycopg v3, which the requirements do not install.
- User-facing copy, documentation, and API errors are Spanish; keep new user-facing text in Spanish.
- Legacy/decoy files: root `index.css` is empty (real styles are `src/index.css`), and `server.cjs` and committed `assets/` are not used by the current scripts or Docker build.
- Admin accounts: `flask --app app create-admin` from `backend`, or `ADMIN_EMAIL` + `ADMIN_PASSWORD` (both required; password at least 12 characters).
