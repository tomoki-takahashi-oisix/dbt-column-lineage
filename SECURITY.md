# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report privately via one of:

- GitHub's [private vulnerability reporting](https://github.com/tomoki-takahashi-oisix/dbt-column-lineage/security/advisories/new)
  (Security → Report a vulnerability), or
- email **takahashi_tomoki@oisixradaichi.co.jp**.

Please include reproduction steps and the affected version. We aim to
acknowledge reports within a few business days.

## Supported versions

This project follows a rolling release model: only the **latest** version
published on PyPI is supported. Please upgrade before reporting.

## Notes for operators

- **Credentials are never committed.** `.envrc` is gitignored; keep OAuth
  (`GOOGLE_CLIENT_*`), `SESSION_SECRET`, and Looker SDK secrets out of the repo
  and out of logs. In hosted deployments, inject them via your platform's secret
  manager.
- **`SESSION_SECRET`** must be a fixed value when `USE_OAUTH=true` and you run
  more than one process/instance, or signed-cookie sessions break across
  processes. See the README and `CLAUDE.md` for details.
- The app trusts the dbt artifacts (`manifest.json`/`catalog.json`) and
  `compiled_code` it parses. Only point it at projects you trust.
