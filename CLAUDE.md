# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`dbt-column-lineage` is a web tool that visualizes **column-level lineage** of dbt models. It parses dbt's `manifest.json` and `catalog.json` (plus each model's `compiled_code`) with [sqlglot](https://github.com/tobymao/sqlglot) to build a graph of how columns flow through models. It is published to PyPI and ships the built frontend as static assets inside the Python package.

- **Backend**: FastAPI (`src/dbt_column_lineage/`), served by uvicorn, exposed via a Typer CLI.
- **Frontend**: Next.js 16 (App Router) + React 19 + `@xyflow/react` (React Flow v12), statically exported (`output: 'export'`).
- **Optional Looker integration**: maps dbt tables/columns to Looker dashboards that consume them.

**`docs/ui-guide.md`** (linked from the README) is the user-facing guide to every UI operation — including the **design snapshot JSON spec** (`?design=` format, handle conventions, lz-string URL encoding) that external tools/LLM agents author against. Keep it in sync when changing UI behavior, the snapshot format, or query params; its example JSON and one-liners are meant to stay copy-paste runnable.

## Development

Backend and frontend run as separate dev servers.

```bash
# Backend (port 5000) — from repo root, with venv activated
pip install -e ".[dev]"   # deps are declared only in pyproject.toml (no requirements.txt)
uvicorn --app-dir src dbt_column_lineage.main:app --port=5000 --reload

# Frontend (port 3000) — from frontend/
npm install
npm run dev          # dev server
npm run build        # static export to frontend/out/
npm run lint         # eslint (flat config: eslint.config.mjs)
```

The frontend reaches the backend via `process.env.NEXT_PUBLIC_API_HOSTNAME` (empty by default → same origin). In dev, set it to `http://localhost:5000`. All API calls hit `${hostname}/api/v1/...`.

### Required environment

- `SQLGLOT_DIALECT` — sqlglot dialect for parsing compiled SQL (default `snowflake`). Must match the dbt warehouse.
- A dbt project with `target/manifest.json` and `target/catalog.json` (run `dbt docs generate`). The backend locates it via `DBT_PROJECT_DIR`, else auto-detects (`dbt_project.yml` in cwd / common locations — see `utils.find_dbt_project`).

Other env flags (see `constants.py`): `USE_OAUTH`, `DEBUG_MODE`, `NEXT_PUBLIC_USE_LOOKER`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `DBT_DOCS_BASE_URL`, `SESSION_SECRET`, `MAX_LINEAGE_SECONDS`.

- `DBT_DOCS_BASE_URL` — base URL of a dbt-docs site (e.g. `https://docs.example.com/dbt/latest`).
  - When set, each table node's menu gains an **"Open in dbt docs"** item linking to `{base}/#!/{resource_type}/{unique_id}`.
  - The full URL is built **server-side** in `lineage.py` (`__dbt_docs_url`, read from the manifest node — not reconstructed) and attached as `node.data.docsUrl`, so this is a true **runtime** env var (unlike `NEXT_PUBLIC_*`, which bake into the static frontend at build time).
  - Unset → no `docsUrl` → the menu item is hidden.

- `SESSION_SECRET` — fixed signing key for the session cookie. Required when running more than one process (`uvicorn --workers`, or App Runner scaling out to >1 instance) **and** `USE_OAUTH=true`, otherwise each process generates a random key and signed-cookie sessions break across processes (login fails / API 401s). Unset → per-process random key (single-process default). The Docker image runs `uvicorn --workers 2`, so set this in the deploy env when OAuth is on.
- `MAX_LINEAGE_SECONDS` — per-request wall-clock budget for lineage traversal. `-1` (default) = unbounded (unchanged behavior); set `>0` to stop traversal / reverse-index build once it exceeds the budget, returning what was collected with `truncated: true` (the frontend shows a banner).
  - **Why it's the real protection for breadth-heavy requests**: e.g. reverse lineage of a hub column like `dim_calendar.week_ver`, whose cost is iterating every child model's `lineage()` — a node/depth cap does *not* bound that; only a time/iteration budget does.
  - **In production** set it **below the gateway request timeout** so the app returns `200 + truncated` instead of the gateway 504-ing.
  - **Where checked**: at each recursion entry and each reverse-index child iteration. The reverse index is cached only when built completely (a budget-truncated partial index is never cached, to avoid serving incomplete results for other columns of the same source).
  - **`truncated` semantics**: the flag (`lineage.py` `budget_truncated`) reflects **only this time-budget cut** — hitting a *requested* depth (e.g. the frontend's table-mode default `depth=1`) is by design and does **not** set it, so the banner no longer fires on the intentional default view.

> ⚠️ `.envrc` is gitignored but currently contains **real secrets** (Google OAuth + Looker SDK credentials). Do not commit it or echo its contents into other files; treat those values as compromised if exposed.

### CLI

The `dbt-column-lineage` entrypoint (`main.cli`, Typer) has commands: `run` (launch server), `run-params` (inspect `git diff` of model files, print a pre-filled lineage URL, then launch — this is the primary user-facing flow), and `version`.

### Tests

`pyproject.toml` declares a `dev` extra (`pytest`, `black`, `isort`). Note `.gitignore` has `test/*.py` (top-level only), so ad-hoc scratch scripts directly in `test/` are ignored — but the real unit suite lives in **`test/unit/`** (a subdir, tracked).

A local virtualenv lives at **`.venv/`** (gitignored) with the backend deps (`sqlglot`, `fastapi`, …) and `pytest` already installed. Run the suite through it — the system `python3` does **not** have `sqlglot`, so `python3 -m pytest` fails at import collection:

```bash
.venv/bin/python -m pytest test/unit -q   # 27 passing on sqlglot >=30.11 (26 + 1 skipped below); testpaths = ["test/unit"] (see pyproject)
# fresh env instead: pip install -e ".[dev]" then pytest
```

`test/unit/` runs without a real dbt project/warehouse: `conftest.py` points `DbtSqlglot` at a tiny synthetic `manifest.json`/`catalog.json` under `test/unit/fixtures/target/` via `DBT_PROJECT_DIR`, and resets the `DbtSqlglot._instance` singleton per test. Current coverage centers on the **phantom-CTE filter** (the UNPIVOT lineage workaround for sqlglot#7727). **sqlglot#7727 was fixed in sqlglot 30.11.0**: the regression guard (`test_sqlglot_unpivot_regression.py`) now asserts the *fixed* fan-out behavior (skipped on sqlglot <30.11), and the filter is kept only because `pyproject` still allows `sqlglot>=30,<31` — drop it when the lower bound moves past 30.11.

**CI** (`.github/workflows/ci.yml`) gates every PR and push to main: backend pytest on Python 3.11/3.12/3.13/3.14 (installed via `pip install -e ".[dev]"`, which also validates `[project.dependencies]` resolves) and frontend `npm run lint` + `npm run build`.

### Demo project — `demo/`

A second, larger synthetic dbt project (separate from the test fixtures) backs the README demo GIF (`docs/demo.gif`). It needs **no warehouse**: `demo/build_demo_manifest.py` hand-authors `demo/dbt_project/target/{manifest,catalog}.json` (run it to regenerate) — an e-commerce graph whose `compiled_code` is plain Snowflake SQL (no UNPIVOT, so column lineage traces cleanly). Point the backend at it with `DBT_PROJECT_DIR=$PWD/demo/dbt_project`. Note `demo/dbt_project/dbt_project.yml` is force-tracked (`git add -f`) despite the gitignore `dbt_project.yml` rule, since it's a fixture, not an environment-specific file.

## Architecture

### Lineage engine — `src/dbt_column_lineage/lineage.py`

`DbtSqlglot` is the core. Key things to know:

- **Singleton with per-request reset.** `__new__` caches one instance; `__init__` reloads `manifest.json`/`catalog.json` only once (guarded by `_initialized`) but resets `nodes`, `edges`, `target_dashboard_ids`, and `request_depth` on **every** instantiation. So `DbtSqlglot(logger, request_depth=...)` is created fresh per API call (cheap) while the parsed dbt files stay cached in memory.
- Two graph modes, both accumulating into `self.nodes` / `self.edges`, returned by `ret_edges_nodes()`:
  - **Table lineage** (`table_lineage` → `__table_dependencies_recursive`): walks `manifest` `parent_map`/`child_map`.
  - **Column lineage** (`column_lineage` → `__column_lineage_recursive` / `__reverse_column_lineage`): uses `sqlglot.lineage` over each model's `compiled_code`, building a sqlglot `Schema` from `depends_on` tables.
- **CTE view** (`cte_dependency` → `__cte_dependency_impl`): parses a single model's compiled SQL into its CTE graph for the `/cte` page.
- `reverse` flag flips direction (downstream vs upstream); `depth` limits recursion (`-1` = unlimited).
- Methods prefixed `__` are internal traversal/lookup helpers. Column matching is **case-insensitive and upper-cased internally** — be careful when comparing column names.

### API — `src/dbt_column_lineage/main.py`

FastAPI app. All data endpoints are under `BASE_ROUTE = /api/v1`: `schemas`, `sources`, `columns`, `lineage`, `dashboard_lineage`, `cte`, `dashboards`. Each instantiates a fresh `DbtSqlglot`. The built frontend is mounted as static files (`frontend_out/`), with `/`, `/cl`, `/cte`, `/login` serving exported HTML pages and 404 falling back to `404.html`.

Optional **Google OAuth** (when `USE_OAUTH=true`): `/login` → `/oauth` (PKCE) → `/callback`, token stored in the session; `get_current_user` dependency guards the API.

### Looker integration

- **Offline analysis**: `tools/looker_analyzer.py` (`LookerDashboardAnalyzer`) calls the Looker SDK, extracts SQL from each dashboard element, parses table/column usage with sqlglot, and writes `target/looker_analysis.json`. Run via `just analyze-looker` (needs `LOOKERSDK_*` env vars).
- **Runtime**: `looker.py` (`Looker`) only reads that JSON file (no live SDK calls) to answer `/dashboards` and to graft dashboard nodes onto lineage when `NEXT_PUBLIC_USE_LOOKER=true`.

### Frontend — `frontend/src/`

Next.js App Router. Two main pages: `/cl` (column/table lineage graph) and `/cte` (CTE breakdown of one model), rendered by `components/pages/Cl.tsx` and `Cte.tsx`. Graphs use **`@xyflow/react`** (React Flow v12) with **dagre** auto-layout. Global UI state is in `store/zustand.ts` (`useStore`) — `sourceMode` toggles `'dbt'` vs `'looker'`, `showColumn` toggles table- vs column-level, `editMode` toggles the design overlay. Components follow loose atomic structure (`ui/`, `molecules/`, `organisms/`, `pages/`).

**Edit / design mode** (the `/cl` page, design-phase support — color language: blue = analyze, violet = design).
- **Toggle**: bottom-right pencil FAB (`organisms/CanvasActions.tsx`).
- **Authoring**: a top-center toolbar (`organisms/EditToolbar.tsx`) lets you add **`editableTableNode`** (name + columns + composite PK, `molecules/EditableTableNode.tsx`) and **`noteNode`** (`molecules/NoteNode.tsx`), and draw edges (user-drawn edges are stamped `data.custom`; reuse the `${column}__source`/`${column}__target` handle convention so they serialize).
- **Snapshot**: `lib/design.ts` serializes the whole graph — nodes + edges + view (`showColumn`/`rankdir`/`sourceMode`) — via `lz-string` into `?design=...` (Share URL, with a size guard — warn >2KB, block >8KB → use Export) or a JSON file (Export/Import).
- **Restore**: on load a `?design` URL is restored **without hitting the API** (and `SchemaSourceColumnSelect` early-returns to skip the lineage fetch). Restored/custom/dragged nodes carry `data.manual` so dagre (`organisms/Sidebar.tsx`) skips re-positioning them — note the dagre `Math.random()` jitter was removed for reproducibility.

**Frontend toolchain.** Next 16 / React 19 / TypeScript 5.9 / Tailwind CSS v4 / ESLint 9 — kept roughly in line with what `create-next-app@latest` scaffolds. Notable v4-era specifics:
- **Tailwind v4 is CSS-first**: there is no `tailwind.config.*`. Config lives in `src/app/global.css` via `@import "tailwindcss"`, an `@theme` block (the one custom token `--color-primary`), and `@plugin "tailwind-scrollbar"`. PostCSS uses `@tailwindcss/postcss` (no `autoprefixer`). A compat `@layer base` pins the default border color back to `gray-200` (v4 changed it to `currentColor`).
- **ESLint uses flat config** (`eslint.config.mjs`, extends `eslint-config-next/core-web-vitals`); `next lint` was removed in Next 16, so the `lint` script is `eslint .`. Pinned to ESLint **9** — ESLint 10 is incompatible with `eslint-config-next` 16's bundled parser.
- **React-Compiler-oriented `react-hooks` rules** that ship with `eslint-config-next` 16 (`set-state-in-effect`, `immutability`, `refs`, `preserve-manual-memoization`) are downgraded to `warn` in the flat config; the lint baseline is **0 warnings**. Intentional `set-state-in-effect` / `exhaustive-deps` sites (mount-only inits, submit-only effects, the dagre layout/highlight effects in `Cl`/`Cte`/`Sidebar`/the search Selects) carry targeted `eslint-disable` comments with reasons — do not "fix" those by completing deps, it re-introduces refetch/relayout loops.
- `@xyflow/react` v12 vs old `reactflow` v11: store state is `nodeLookup` (was `nodeInternals`), measured node size is `node.measured?.{width,height}` (was `node.{width,height}` — used in the dagre layout in `Sidebar.tsx`/`Cte.tsx`), custom node data types use `NodeProps<Node<Data, 'type'>>`, and `node.data` is typed `unknown`.

## Build & release

`justfile` holds deploy/release recipes:

- `just pypi <version>` — builds the frontend, tags `v<version>`, builds the sdist/wheel (frontend `out/` is packaged as `frontend_out`), `twine upload`s to PyPI, pushes the tag, and creates a **GitHub Release** whose notes are extracted from the `## [version]` section of `CHANGELOG.md`. Version is derived from git tags via `setuptools_scm` (written to `_version.py`). Run it via `direnv exec . just pypi <ver>` from a non-interactive shell (the recipe relies on `.envrc` for the venv PATH and twine credentials).
- `just deploy-aws` — builds the multi-stage `Dockerfile` (node build → python deps → slim runtime) and pushes to ECR. The Docker deps layer installs `[project.dependencies]` extracted from `pyproject.toml` (single source; no `requirements.txt`), and deliberately omits `looker-sdk` (runtime never imports it).
- `just looker` — runs the Looker analysis and uploads the result to S3.

The packaged app serves the prebuilt frontend, so the published wheel needs no Node at runtime — but `just pypi` must rebuild `frontend/out` first or stale assets ship.

**CHANGELOG workflow** (`CHANGELOG.md` is human-curated, Keep-a-Changelog format): every PR adds its entries under `## [Unreleased]`; before a release, roll `[Unreleased]` up into `## [X.Y.Z] - date` via PR (main is branch-protected), then `just pypi X.Y.Z` publishes and reuses that section as the release notes. Don't skip the per-PR entry — it's easy to forget and the release notes depend on it.
