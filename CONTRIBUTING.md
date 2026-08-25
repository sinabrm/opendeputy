# Contributing to OpenDeputy

OpenDeputy 1.19.0 targets a Windows desktop release. The web and shared UI packages remain because they power the desktop runtime; mobile and VS Code products are outside the current release scope.

Contributions are welcome. Helpful contributions include reproducible bug reports, focused feature proposals, documentation, tests, accessibility improvements, dependency maintenance, and code changes within the current Windows-first scope.

Before participating, read the [Code of Conduct](CODE_OF_CONDUCT.md). For setup questions and reporting routes, see [SUPPORT.md](SUPPORT.md).

## Choose an issue

Search [existing issues](https://github.com/sinabrm/opendeputy/issues) before starting. Small, self-contained fixes can go directly to a pull request. For a new feature, architectural change, new dependency, or work that crosses several packages, open an issue first so maintainers and contributors can agree on scope.

If you are new to the project, look for focused issues whose expected result and affected area are clear. Comment before starting larger work to reduce duplicated effort.

## Setup

From PowerShell:

```powershell
git clone https://github.com/sinabrm/opendeputy.git
Set-Location opendeputy
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-windows.ps1 -InstallMissing
```

The script installs missing Git/Bun only after `-InstallMissing` is supplied, installs locked dependencies, and runs repository checks. It does not change provider credentials.

Launch with `bun run electron:dev`. Build the Windows installer with `bun run electron:build`.

After validation passes on a push to `main`, GitHub Actions builds the unsigned Windows installer and retains the workflow artifact for 7 days. Tags and official GitHub releases remain manual approval steps.

## Before submitting

Cross-workspace or release changes require:

```powershell
bun run type-check
bun run lint
bun run audit:dependencies
bun run test
bun run build
bun run test:release-contract
```

After packaging, also run `bun run test:windows-package`. Source deletions or entry-point changes require `bun run dead-code` and review of its non-blocking report.

Dependency updates must keep `bun audit --audit-level=high` clean. A temporary exception requires a linked security issue, a reachability explanation, an owner, and an expiry date; do not suppress advisories without that record.

Follow [AGENTS.md](AGENTS.md), relevant local skills, and the nearest package documentation. Preserve internal `@openchamber/*`, `OPENCHAMBER_*`, and configuration-path identifiers when they are compatibility contracts rather than visible branding.

## Pull requests

Fork the repository, create a focused branch, and keep unrelated changes out of the same pull request. Use the pull-request template. Include intent, affected surfaces, exact validation, risks, and current visual evidence for user-visible changes. Link the issue the change resolves when one exists.

Pull requests should be small enough to review as one coherent change. Maintainers may ask for tests, documentation, localization, or a narrower scope before merging. Release pull requests remain reviewable and GitHub releases are drafts until a maintainer approves publication.

## Project triage

Repository issues are tracked in the [OpenDeputy project](https://github.com/users/sinabrm/projects/9). New issues begin in Backlog. Maintainers move reviewed work through Ready, In progress, In review, and Done, with no more than two items normally In progress at once.

Use repository labels for the affected area or contribution route. Priority, Size, and Status belong in project fields and should not be duplicated as labels. Closed project items may be archived after 30 days; archiving removes board clutter without deleting the issue or its field history.

## Code style

- Use strict TypeScript and existing component patterns.
- Use semantic theme tokens and shared UI primitives.
- Localize every new user-facing string in every shipped locale.
- Keep Electron privileged operations in the main process and approval-gated.
- Never commit secrets or user data.

Open an issue at [sinabrm/opendeputy](https://github.com/sinabrm/opendeputy/issues) for bugs or proposals.
