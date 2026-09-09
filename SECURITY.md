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

There is currently **one temporary accepted risk**:

- `csv-parse` (`GHSA-8cw4-87c7-c6xx`) remains transitively pinned below the fixed
  range by the latest published `@aws-amplify/backend-cli` line through
  `@aws-amplify/graphql-schema-generator@0.11.16`.
- Dependabot ignores only `csv-parse` for this repository while follow-up issue
  `#98` tracks removal of the exception.
- The scheduled upstream monitor reports when a new published
  `@aws-amplify/backend-cli` version appears, and fails if the vulnerability
  disappears from `npm audit` or if the exception expires.

Exception lifecycle requirements:
- Owner, advisory, linked issue, and expiration date are mandatory.
- Weekly monitoring checks the blocked upstream package and reports when a new version should be evaluated.
- If the targeted vulnerability disappears from audit results, the exception must be removed immediately.
- On expiry, CI fails until the exception is removed or renewed with explicit justification.
