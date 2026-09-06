# Security Policy

## Supported Versions

This repository does not publish versioned releases. Security updates are
supported on the current `main` branch only.

| Branch | Supported          |
| ------ | ------------------ |
| main   | :white_check_mark: |
| other  | :x:                |

## Reporting a Vulnerability

If you discover a potential security issue in this project, please notify
AWS/Amazon Security via the [vulnerability reporting page](https://aws.amazon.com/security/vulnerability-reporting/).
Please do **not** create a public GitHub issue.

## Temporary Audit Exceptions

This repository enforces CI blocking for **high/critical direct vulnerabilities**.

Temporary exceptions are tracked in:
- `.github/security/audit-exceptions.json`

There is currently **no active accepted risk**: the previous `brace-expansion`
exception (via `aws-cdk-lib`) was removed because the vulnerability no longer
appears in audit results.

Exception lifecycle requirements:
- Owner, advisory, linked issue, and expiration date are mandatory.
- Weekly monitoring checks upstream (`aws-cdk-lib`) and forces follow-up when a new version is available.
- If the targeted vulnerability disappears from audit results, the exception must be removed immediately.
- On expiry, CI fails until the exception is removed or renewed with explicit justification.
