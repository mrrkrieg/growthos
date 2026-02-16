# Security Policy

## Supported Versions

This project is currently pre-1.0. Security fixes are applied on the `main` branch.

## Reporting a Vulnerability

Please report security issues privately to project maintainers and include:
- Reproduction steps
- Impact analysis
- Suggested remediation (if available)

Do not disclose secrets in issues or pull requests.

## Security Defaults

- GrowthOS uses draft-first execution by default.
- No secrets are stored in repository files.
- Paid API write actions are disabled unless explicitly configured.
- Cron and workflow installers avoid embedding credentials.
- Dashboard binds to `127.0.0.1` by default; optional basic auth can be enabled with:
  - `GROWTHOS_DASHBOARD_BASIC_AUTH=1`
  - `GROWTHOS_DASHBOARD_USER=<user>`
  - `GROWTHOS_DASHBOARD_PASS=<pass>`
