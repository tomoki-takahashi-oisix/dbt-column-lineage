# Contributing

Thanks for your interest in improving **dbt-column-lineage**! This guide covers
the local setup, the checks we run, and how to propose changes.

## Development setup

The backend (FastAPI/uvicorn) and frontend (Next.js) run as separate dev servers.

```bash
# Backend — port 5000, from the repo root
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"          # runtime + test deps
uvicorn --app-dir src dbt_column_lineage.main:app --port=5000 --reload

# Frontend — port 3000, from frontend/
cd frontend
npm install
NEXT_PUBLIC_API_HOSTNAME=http://localhost:5000 npm run dev
```

You need a dbt project with `target/manifest.json` and `target/catalog.json`
(`dbt docs generate`). Point the backend at it via `DBT_PROJECT_DIR`, and set
`SQLGLOT_DIALECT` to match your warehouse (default `snowflake`).

No warehouse handy? The repo ships a synthetic project under [`demo/`](demo/):

```bash
python demo/build_demo_manifest.py
DBT_PROJECT_DIR="$PWD/demo/dbt_project" SQLGLOT_DIALECT=snowflake \
  uvicorn --app-dir src dbt_column_lineage.main:app --port=5000
```

## Checks (please run before opening a PR)

```bash
# Backend tests (27+; see pyproject testpaths)
pytest test/unit -q

# Frontend lint — baseline is 0 warnings — and build
cd frontend && npm run lint && npm run build
```

CI (`.github/workflows/ci.yml`) runs the same on every PR (Python 3.11/3.12 +
Node 20).

## Pull requests

- Branch from `main`; open the PR against `main`.
- Keep changes focused and describe the *why*, not just the *what*.
- Update `CHANGELOG.md` (the `[Unreleased]` section) for user-facing changes.
- Match the surrounding code style. Python is formatted with `black`/`isort`;
  the frontend follows the ESLint flat config.

## Releasing (maintainers)

Releases are cut with `just pypi <version>` — it rebuilds the frontend, tags
`v<version>`, builds the sdist/wheel, and uploads to PyPI. The version is
derived from the git tag via `setuptools_scm`.

## Reporting bugs / requesting features

Use the issue templates. For security issues, **do not** open a public issue —
see [SECURITY.md](SECURITY.md).
