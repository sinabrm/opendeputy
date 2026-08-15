# OpenDeputy Agent Guide

## Purpose and scope

OpenDeputy 1.19.0 is a Windows desktop AI coworker. `packages/electron` is the release shell, `packages/web` supplies the in-process server and built UI, and `packages/ui` contains shared React behavior. Mobile, VS Code, and the upstream documentation package are not products in this repository.

OpenDeputy is derived from OpenChamber. Preserve internal `@openchamber/*`, `OPENCHAMBER_*`, deep-link, and configuration-directory identifiers when they are upgrade or runtime compatibility contracts. Visible product text, release metadata, ownership, and assets use OpenDeputy.

## Required workflow

Before editing:

1. Load every matching skill under `.agents/skills/*/SKILL.md` and every task-required reference it names.
2. Read the nearest `DOCUMENTATION.md` and package `README.md` for the changed behavior.
3. Inspect nearby code, callers, and tests.

The user must explicitly authorize Git or GitHub mutations. Preserve unrelated worktree changes and never commit secrets, credentials, personal paths, or user data.

## Runtime boundaries

- `packages/ui`: React UI, state, sync, and runtime contracts.
- `packages/web`: server, managed/external OpenCode lifecycle, browser automation, terminal/file integrations, and CLI compatibility.
- `packages/electron`: Windows shell, privileged IPC, native windows, updater, child processes, tray, and packaging.

Electron starts the web backend in-process. Renderer code uses narrow preload/runtime bridges; remote pages never receive desktop privileges. Security gates belong in Electron main or the owning server module, not only in UI visibility.

## Change routing

| Change | Required skill |
|---|---|
| Source, dependency, build, generated asset, package contract, or ownership | `openchamber-change-discipline` |
| CLI command, prompt, or terminal behavior | `clack-cli-patterns` |
| Shared UI API/runtime bridge | `ui-api-decoupling` |
| Electron, IPC, updater, packaging, child process, or Windows native behavior | `desktop-shell` |
| Sync, polling, optimistic state, lifecycle, or cache behavior | `sync-state-invariants` |
| Performance-sensitive path or regression | `performance-engineering` |
| Streaming, SSE, WebSocket, or relay | `relay-transport` |
| Component style, theme, button, animation, or icon | `theme-system` |
| User-facing or accessibility text | `locale-ui-patterns` |
| Settings UI or settings search | `settings-ui-patterns` |
| Changelog entries | `changelog-authoring` |
| Agent-facing guidance | `writing-for-agents` |

## Validation

Use `package.json` scripts as the command source of truth. Run focused tests plus package type-check/lint for executable changes; workspace checks for cross-workspace contracts; `bun run dead-code` for source/entry-point deletion; regeneration plus consumer builds for generated assets; and packaged Windows checks for release behavior. Report exactly what passed and what was not exercised.

Before a pull request, read `CONTRIBUTING.md` and `.github/PULL_REQUEST_TEMPLATE.md`, then provide current validation and visual evidence for the final HEAD.
