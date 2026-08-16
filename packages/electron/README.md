# OpenDeputy Desktop

This package owns the Windows Electron shell: windows, tray behavior, menus, notifications, updates, deep links, privileged IPC, native child processes, and the installer.

The shared UI lives in `packages/ui`; the in-process backend and OpenCode lifecycle live in `packages/web`. Electron imports the web server directly and loads packaged UI assets through `openchamber-ui://`. The `@openchamber/*`, `OPENCHAMBER_*`, and preload names remain compatibility contracts.

## Development

From the repository root:

```powershell
bun run setup:windows
bun run electron:dev
```

Use `bun run electron:dev:bundled` to validate staged web assets. Development uses a separate `OpenDeputy Dev` data directory.

## Packaging

`bun run electron:build` builds the web UI, stages the matching OpenCode CLI, bundles the main process, rebuilds native modules for Electron, and creates an NSIS installer in `packages/electron/dist`.

The installer includes Electron, compiled OpenDeputy web assets, the pinned OpenCode CLI, Open Computer Use, all Windows/tray/application icons, and generated and manually retained third-party legal notices under `resources/legal`. End users do not install the bundled runtime components separately.

Unsigned local builds are supported and must be labeled clearly. Releases are produced only by the Windows release workflow and are created as GitHub drafts.

## Runtime and security rules

- Privileged commands are checked in `main.mjs`; UI checks are not a security boundary.
- Remote pages never receive filesystem, shell, token, or host privileges.
- Background Windows child processes use `windowsHide: true` and direct executable spawning.
- The browser panel uses its own `persist:opendeputy-browser` session and denies camera, microphone, location, and device-picker requests.
- Packaged startup prefers a configured OpenCode path, then environment overrides, then the bundled CLI, then system installations.

## Checks

```powershell
bun run type-check:electron
bun run lint:electron
bun run --cwd packages/electron test
bun run electron:dev:bundled
bun run electron:build
bun run test:windows-package
```
