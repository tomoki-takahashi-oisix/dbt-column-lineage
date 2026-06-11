# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions are derived from git tags via `setuptools_scm`; see the
[releases](https://github.com/tomoki-takahashi-oisix/dbt-column-lineage/releases)
and [git tags](https://github.com/tomoki-takahashi-oisix/dbt-column-lineage/tags)
for the full history prior to this file.

## [Unreleased]

## [0.6.1] - 2026-06-11

### Changed
- Home landing page: clearer hero copy ("Column-level lineage for dbt") with a
  one-line value prop and an "Open the graph" CTA.

### Fixed
- Browser tab title typo: "dbt column linage" → "dbt column lineage".

## [0.6.0] - 2026-06-11

First release published with its runtime dependencies declared — earlier
versions (0.5.x) install without them and are effectively broken; use 0.6.0+.

### Fixed
- **Packaging: declare runtime dependencies.** `sqlglot`, `fastapi`, `uvicorn`,
  `requests`, `pytz`, `itsdangerous`, and `typer` are now listed in
  `[project.dependencies]`. Previously they lived only in `requirements.txt`, so
  `pip install dbt-column-lineage` installed the package without its
  dependencies. **Upgrade strongly recommended.**

### Added
- **Edit mode: edit existing models.** Each analysis model now has an
  **"Edit (design)"** item in its node menu (edit mode only) that converts it
  into an editable design node — name, columns, materialization, and PKs become
  editable. Column edges are preserved (handle IDs are unchanged).
- **Editable materialization type** (`table` / `view` / `incremental` /
  `snapshot` / `seed`) on design nodes, via a selector in the node header. The
  header color follows the type (matching the legend); the dashed border keeps
  signalling "editable". New nodes default to `table`. Round-trips through the
  `?design=` snapshot / Export.
- Replaced the default Next.js favicon with a lineage-themed `icon.svg`.
- `LICENSE` file (MIT) — the license was declared in metadata but the text was
  missing.
- `looker` optional extra for `looker-sdk` (only needed to run the offline
  `tools/looker_analyzer.py`; the runtime never calls the SDK).
- Project metadata: richer `description`, `keywords`, and `Homepage`/`Issues`/
  `Changelog` URLs.
- GitHub Actions CI: backend tests (Python 3.11/3.12) + frontend lint/build.
- Community docs: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue
  and pull-request templates.
- README demo GIF and a synthetic, warehouse-free demo project under `demo/`.
