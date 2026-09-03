# OpenDeputy Desktop

This package owns the OpenDeputy Electron shell on Windows and Linux: windows,
tray behavior, menus, notifications, updates, deep links, privileged IPC,
native child processes, and desktop installers.

The shared UI lives in `packages/ui`; the in-process backend and OpenCode lifecycle live in `packages/web`. Electron imports the web server directly and loads packaged UI assets through `openchamber-ui://`. The `@openchamber/*`, `OPENCHAMBER_*`, and preload names remain compatibility contracts.

## Development

From the repository root on Windows:

```powershell
bun run setup:windows
bun run electron:dev
```

On Linux, use the same development command after `bun install`:

```bash
bun run electron:dev
```

The Linux launcher uses the local Electron binary and runs the API with Node so
the `node:sqlite` workspace tools work correctly. If the host has exhausted its
inotify watcher limit, set `OPENCHAMBER_HMR_POLLING=1`.

Packaging the self-contained Windows installer also requires Python 3.12 x64 on the build machine. End users do not need Python installed.

Use `bun run electron:dev:bundled` to validate staged web assets. Development uses a separate `OpenDeputy Dev` data directory.

## Packaging

`bun run electron:build` builds the web UI, stages the matching OpenCode CLI, bundles the main process, rebuilds native modules for Electron, and creates an NSIS installer in `packages/electron/dist`.

On Linux, `bun run electron:build:linux` creates an AppImage and a Debian
package in `packages/electron/dist`. Linux packages reuse the published
Node-API `node-pty` prebuild and include Linux-native managed-agent helpers;
they do not stage the Windows-only TouchPoint runtime. See
[`docs/LINUX_INSTALL.md`](../../docs/LINUX_INSTALL.md) for install and build
requirements. `bun run electron:install:linux` registers a portable AppImage
in the current user's application menu, including a FUSE-free extraction
fallback for minimal Linux hosts.

The Windows installer includes Electron, compiled OpenDeputy web assets, the
pinned OpenCode CLI, all eight enabled managed MCPs, four managed skills, Open
Computer Use, a portable Python 3.12/TouchPoint runtime, Windows/tray icons,
and generated and manually retained third-party legal notices under
`resources/legal`. Linux artifacts include the matching Linux OpenCode CLI,
Linux native helpers, and the same managed agent kit; TouchPoint is omitted.
End users do not install the bundled runtime components separately.

Unsigned local builds are supported and must be labeled clearly. The release
workflow publishes Windows installers as GitHub drafts; Linux AppImage and
Debian artifacts are built and validated by the Linux desktop CI job.

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

Linux checks:

```bash
bun run type-check:electron
bun run electron:dev:bundled
bun run electron:build:linux
bun run test:linux-package
```
