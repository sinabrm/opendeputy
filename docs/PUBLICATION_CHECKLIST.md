# Public repository review

This checklist records the gates for publishing OpenDeputy source. It contains no credentials or private scan output.

## Source and history

- The current tree and all Git refs were scanned with Gitleaks using redacted output.
- Twenty-one exact historical findings were reviewed. They are public OpenChamber upstream OAuth client constants, a generated UI-password character set, CocoaPods package metadata, and Android Firebase configuration already present in the public upstream repository.
- The reviewed fingerprints are recorded narrowly in `.gitleaksignore`; new findings remain blocking.
- The historical `.env` contained only `NODE_ENV`, and `.env` remains ignored and untracked.
- No private-key files, credential files, provider tokens, or personal workspace paths are tracked.

## Dependency and legal gates

- `bun audit --audit-level=high` is required by CI and release preparation.
- `bun audit --audit-level=low` must report no known advisories for publication.
- The Windows x64 third-party license inventory must be regenerated and pass its exact check.
- MIT fork attribution and manually retained upstream license texts must remain present.

## GitHub gates

- The default branch requires successful validation and container checks before merge.
- Workflow actions use immutable commit SHAs and the default workflow token is read-only.
- Private vulnerability reporting, dependency alerts, automated security updates, and secret scanning are enabled where GitHub supports them.
- The issue forms, support route, Code of Conduct, roadmap, labels, milestones, and project workflow are visible without authentication after publication.

## Windows verification

- A fresh clone completes the documented PowerShell setup path.
- Type-check, lint, dependency audit, tests, production build, and release-contract checks pass.
- A Windows installer is built and passes `bun run test:windows-package` before the first public binary is released.
