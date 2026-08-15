# Contributing to OpenDeputy

OpenDeputy 1.19.0 ships as a Windows desktop application. The web and shared UI packages remain because they power the desktop runtime; mobile and VS Code products are outside the current release scope.

## Setup

From PowerShell:

```powershell
git clone https://github.com/sinabrm/open-deputy.git
Set-Location open-deputy
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-windows.ps1 -InstallMissing
```

The script installs missing Git/Bun only after `-InstallMissing` is supplied, installs locked dependencies, and runs repository checks. It does not change provider credentials.

Launch with `bun run electron:dev`. Build the Windows installer with `bun run electron:build`.

After validation passes on a push to `main`, GitHub Actions builds the unsigned Windows installer and keeps the private artifact for 7 days. Tags and official GitHub releases remain manual approval steps.

## Before submitting

Cross-workspace or release changes require:

```powershell
bun run type-check
bun run lint
bun run test
bun run build
bun run test:release-contract
```

After packaging, also run `bun run test:windows-package`. Source deletions or entry-point changes require `bun run dead-code` and review of its non-blocking report.

Follow [AGENTS.md](AGENTS.md), relevant local skills, and the nearest package documentation. Preserve internal `@openchamber/*`, `OPENCHAMBER_*`, and configuration-path identifiers when they are compatibility contracts rather than visible branding.

## Pull requests

Use the pull-request template. Include intent, affected surfaces, exact validation, risks, and current visual evidence for user-visible changes. Release pull requests remain reviewable and GitHub releases are drafts until a maintainer approves publication.

## Code style

- Use strict TypeScript and existing component patterns.
- Use semantic theme tokens and shared UI primitives.
- Localize every new user-facing string in every shipped locale.
- Keep Electron privileged operations in the main process and approval-gated.
- Never commit secrets or user data.

Open an issue at [sinabrm/open-deputy](https://github.com/sinabrm/open-deputy/issues) for bugs or proposals.
