# OpenDeputy

![OpenDeputy logo](docs/brand/open-deputy-logo.svg)

OpenDeputy is an open-source AI coworker for Windows. It combines OpenCode agents with a visual workspace for projects, files, terminals, websites, and desktop applications.

OpenDeputy is a modified distribution of the MIT-licensed [OpenChamber](https://github.com/openchamber/openchamber) project. Compatibility identifiers such as `@openchamber/*`, `OPENCHAMBER_*`, and existing configuration directories remain intentionally unchanged where renaming them would break upgrades.

## What it can do

- Run agents with any provider and model supported by OpenCode.
- Read and change project files, run terminal commands, use Git, and keep project notes.
- Browse real websites using DOM and accessibility information, then click, type, scroll, and take screenshots.
- Control Windows applications through the bundled, approval-gated Open Computer Use runtime.
- Route task-relevant images, screenshots, audio, video, and PDFs to the hosted Muse Spark model, whose catalog advertises those input types and text-only output.
- Continue in the tray when **Minimize to tray** is enabled.
- Add optional document conversion, local speech, and ActivityWatch history integrations.

OpenDeputy does not bundle model weights. It is configured to use OpenCode's hosted `opencode/muse-spark-1.2-contributor-free` model by default; other providers can be connected in **Settings → Providers**, with credentials handled by OpenCode. The managed visual-grounding tool also uses Muse Spark for multimodal understanding. It returns text or code and does not generate media. If the installed OpenCode runtime cannot transport an advertised attachment type, the agent must report that limitation instead of inferring content from the filename.

## What is included

The Windows installer contains the OpenDeputy application and web interface, Electron, a matching OpenCode CLI, and a managed agent kit. The agent kit supplies eight enabled default MCPs, including TouchPoint through a bundled portable Python runtime, plus four packaged skills; OpenCode supplies the built-in `customize-opencode` skill. Local speech models download only when selected. LibreOffice, Piper, ActivityWatch, tunnel clients, provider plugins, and additional user-configured skills or MCP servers remain optional.

OpenDeputy uses many open-source projects. The main foundations are:

| Project | How OpenDeputy uses it |
| --- | --- |
| [OpenChamber](https://github.com/openchamber/openchamber) | Original application foundation; OpenDeputy contains modifications and is not an official OpenChamber release. |
| [OpenCode](https://github.com/anomalyco/opencode) | Agent runtime, provider integration, SDK, and bundled CLI. |
| [Open Computer Use](https://github.com/iFurySt/open-codex-computer-use) | Bundled MCP runtime for approval-gated desktop inspection and control. |
| [Electron](https://github.com/electron/electron) | Windows desktop shell. |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | Local speech-to-text and text-to-speech runtime; model archives are downloaded separately on demand. |

See [Open-source components](docs/OPEN_SOURCE_COMPONENTS.md) for the complete distribution map, including versions, licenses, optional integrations, plugins, skills, model downloads, Docker-only software, development tools, and items that are **not** shipped. Legal notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), the generated Windows-x64 packaged dependency inventory is in [`THIRD_PARTY_LICENSES.txt`](THIRD_PARTY_LICENSES.txt), and manually retained upstream texts are in [`legal/third-party`](legal/third-party/README.md).

## Install on Windows

Download the `.exe` from the repository's Releases page and run it. End users do not need Node.js, Bun, or a separate OpenCode installation.

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

Provider plugins and any skills or MCP servers beyond the managed agent kit are user-selected extensions. Each extension's own license, privacy policy, service terms, and security behavior apply.

## Security

Computer and browser actions are approval-gated. Browser pages do not receive privileged Electron APIs, remote access binds to localhost by default, and ActivityWatch integration remains opt-in. Never commit provider keys, tokens, personal data, local memory databases, or browser data.

Report vulnerabilities privately through GitHub's security advisory form. See [SECURITY.md](SECURITY.md).

## Attribution and license

OpenDeputy is a modified distribution of OpenChamber. The original MIT copyright notice remains in [LICENSE](LICENSE), upstream history is preserved in [UPSTREAM_CHANGELOG.md](UPSTREAM_CHANGELOG.md), and third-party distribution details are recorded in [Open-source components](docs/OPEN_SOURCE_COMPONENTS.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), the retained [`legal/third-party`](legal/third-party/README.md) license texts, and the Windows-x64 packaged dependency inventory in [`THIRD_PARTY_LICENSES.txt`](THIRD_PARTY_LICENSES.txt).

OpenDeputy is released under the MIT License.
