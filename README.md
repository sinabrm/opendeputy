# OpenDeputy

![OpenDeputy logo](docs/brand/open-deputy-logo.svg)

OpenDeputy is an open-source AI coworker for Windows. It combines OpenCode agents with a visual workspace for projects, files, terminals, websites, and desktop applications.

OpenDeputy is based on the MIT-licensed [OpenChamber](https://github.com/openchamber/openchamber) project. Compatibility identifiers such as `@openchamber/*`, `OPENCHAMBER_*`, and existing configuration directories remain intentionally unchanged where renaming them would break upgrades.

## What it can do

- Run agents with any provider and model supported by OpenCode.
- Read and change project files, run terminal commands, use Git, and keep project notes.
- Browse real websites using DOM and accessibility information, then click, type, scroll, and take screenshots.
- Control Windows applications through the bundled, approval-gated Open Computer Use runtime.
- Continue in the tray when **Minimize to tray** is enabled.
- Add optional document conversion, local speech, and ActivityWatch history integrations.

OpenDeputy does not bundle an AI model or provider account. On first run, connect a provider in **Settings → Providers** and select one of that provider's models. Credentials are handled by OpenCode.

## Install on Windows

Download the `.exe` from the repository's Releases page and run it. The installer contains OpenDeputy, Electron, the matching OpenCode CLI, Open Computer Use, and the web interface. End users do not need Node.js, Bun, or a separate OpenCode installation.

The first public release candidate is unsigned, so Windows may show a SmartScreen warning. Verify its SHA-256 checksum against `SHA256SUMS.txt` before running it.

See [Windows installation](docs/WINDOWS_INSTALL.md), [optional tools](docs/OPTIONAL_TOOLS.md), and [safety and privacy](docs/SAFETY_AND_PRIVACY.md).

## Develop on Windows

Clone the repository, then run one idempotent setup command from PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-windows.ps1 -InstallMissing
```

To set up and launch in one command:

```powershell
bun run setup:windows:launch
```

Common checks:

```powershell
bun run type-check
bun run lint
bun run test
bun run build
bun run electron:build
bun run test:windows-package
```

## Optional local capabilities

Run `bun run tools:windows` to choose optional tools interactively. Nothing is installed silently. Environment overrides are available for advanced setups:

- `OPENDEPUTY_LIBREOFFICE_BINARY`
- `OPENDEPUTY_PIPER_BINARY`
- `OPENDEPUTY_PIPER_VOICES_DIR`
- `OPENDEPUTY_ACTIVITYWATCH_BINARY`

## Security

Computer and browser actions are approval-gated. Browser pages do not receive privileged Electron APIs, remote access binds to localhost by default, and ActivityWatch integration remains opt-in. Never commit provider keys, tokens, personal data, local memory databases, or browser data.

Report vulnerabilities privately through GitHub's security advisory form. See [SECURITY.md](SECURITY.md).

## Attribution and license

OpenDeputy is a modified distribution of OpenChamber. The original MIT copyright notice remains in [LICENSE](LICENSE), upstream history is preserved in [UPSTREAM_CHANGELOG.md](UPSTREAM_CHANGELOG.md), and bundled components are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

OpenDeputy is released under the MIT License.
