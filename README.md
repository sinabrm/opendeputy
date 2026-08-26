<p align="center">
  <img src="docs/brand/opendeputy-logo.svg" width="112" height="112" alt="OpenDeputy logo">
</p>

<h1 align="center">OpenDeputy</h1>

<p align="center">
  A Windows-first, open-source AI coworker for projects, files, terminals, websites, and desktop applications.
</p>

<p align="center">
  <a href="https://github.com/sinabrm/opendeputy/actions/workflows/ci.yml"><img alt="Windows CI" src="https://github.com/sinabrm/opendeputy/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Windows x64" src="https://img.shields.io/badge/platform-Windows%20x64-0078D4.svg">
</p>

OpenDeputy combines [OpenCode](https://github.com/anomalyco/opencode) agents with a visual workspace and a managed set of browser, terminal, file, and approval-gated desktop tools. It is a modified distribution of the MIT-licensed [OpenChamber](https://github.com/openchamber/openchamber) project, not an official OpenChamber or OpenCode release.

> [!IMPORTANT]
> OpenDeputy is currently pre-release software. The source is ready for contributors, but no public installer has been published yet. Until the first release is available, build and run it from source. The first Windows installer will be unsigned.

## What it can do

- Run agents with any provider and model supported by OpenCode.
- Read and change project files, run terminal commands, use Git, and keep project notes.
- Browse real websites using DOM and accessibility information, then click, type, scroll, and take screenshots.
- Control Windows applications through the bundled, approval-gated Open Computer Use runtime.
- Route task-relevant text, code, images, screenshots, audio, video, PDFs, and documents to the configured model for analysis.
- Continue in the tray when **Minimize to tray** is enabled.
- Add optional document conversion, local speech, and ActivityWatch history integrations.

OpenDeputy does not bundle model weights. The default configuration uses OpenCode's hosted `opencode/muse-spark-1.2-contributor-free` model; other providers can be connected in **Settings > Providers**, with credentials handled by OpenCode. Model availability, limits, privacy terms, and attachment support depend on the selected provider.

## How it differs

| Project | Main role | Platforms and focus |
| --- | --- | --- |
| [OpenCode](https://github.com/anomalyco/opencode) | The open-source coding-agent runtime, CLI, provider layer, and SDK. | Agent execution and developer workflows. OpenDeputy uses and bundles a matching OpenCode CLI. |
| [OpenChamber](https://github.com/openchamber/openchamber) | A broad visual workspace around OpenCode. | Desktop, web/PWA, VS Code, mobile, CLI/server, remote access, and multi-device workflows. |
| **OpenDeputy** | A modified OpenChamber distribution focused on an integrated AI coworker. | Windows x64 first, with a bundled managed agent kit, browser automation, approval-gated Windows control, and optional local document, speech, and activity tools. |

Choose OpenCode if you primarily want the agent runtime and terminal workflow. Choose OpenChamber if you want its wider cross-platform and multi-device workspace. Choose OpenDeputy if you want the Windows-first packaged experience and its additional managed tools.

Compatibility identifiers such as `@openchamber/*`, `OPENCHAMBER_*`, and existing configuration directories remain intentionally unchanged where renaming them would break upgrades.

## Run from source on Windows

Requirements: Windows x64 and PowerShell. The setup script can install missing Git and Bun only when `-InstallMissing` is supplied.

Keep the checkout path short (for example, `C:\src\opendeputy`); deeply nested Windows paths can exceed dependency-tool path limits.

```powershell
git clone https://github.com/sinabrm/opendeputy.git
Set-Location opendeputy
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-windows.ps1 -InstallMissing
bun run electron:dev
```

To set up and launch in one command after cloning:

```powershell
bun run setup:windows:launch
```

To create a local unsigned installer:

```powershell
bun run electron:build
```

To run OpenDeputy continuously on a private Linux server or VPS, use the
included Docker deployment. It persists projects, sessions, scheduled tasks,
and a server-owned Chromium profile so browser work does not require a desktop
window to remain open. See [Self-host OpenDeputy](docs/SELF_HOSTING.md).

When public binaries are available, they will appear on the [Releases page](https://github.com/sinabrm/opendeputy/releases) with a `SHA256SUMS.txt` file. See [Windows installation](docs/WINDOWS_INSTALL.md), [optional tools](docs/OPTIONAL_TOOLS.md), and [safety and privacy](docs/SAFETY_AND_PRIVACY.md).

## Contribute

Contributions are welcome: bug reports, feature proposals, documentation, tests, accessibility improvements, and focused code changes all help.

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).
2. Search [existing issues](https://github.com/sinabrm/opendeputy/issues) before opening a new one.
3. Use the issue forms for reproducible bugs and well-scoped proposals. For usage help, see [SUPPORT.md](SUPPORT.md).
4. Fork the repository, create a focused branch, run the required checks, and open a pull request.

See the [roadmap](ROADMAP.md) and [OpenDeputy project](https://github.com/users/sinabrm/projects/9) for planned work and current delivery status.

Good first contributions should stay small enough to review but solve a real user or maintainer problem. Larger changes should start with an issue so the approach can be agreed before implementation.

Common checks:

```powershell
bun run type-check
bun run lint
bun run test
bun run build
bun run test:release-contract
```

## What is included

The Windows installer contains the OpenDeputy application and web interface, Electron, a matching OpenCode CLI, and a managed agent kit. The agent kit supplies eight enabled default MCP servers, including TouchPoint through a bundled portable Python runtime, plus four packaged skills; OpenCode supplies the built-in `customize-opencode` skill.

LibreOffice, Piper, ActivityWatch, tunnel clients, local speech models, provider plugins, and additional user-configured skills or MCP servers remain optional. Nothing in the optional Windows tools flow is installed silently.

OpenDeputy uses many open-source projects. Its main foundations are:

| Project | How OpenDeputy uses it |
| --- | --- |
| [OpenChamber](https://github.com/openchamber/openchamber) | Original application foundation; OpenDeputy contains modifications and is not an official OpenChamber release. |
| [OpenCode](https://github.com/anomalyco/opencode) | Agent runtime, provider integration, SDK, and bundled CLI. |
| [Open Computer Use](https://github.com/iFurySt/open-codex-computer-use) | Bundled MCP runtime for approval-gated desktop inspection and control. |
| [Electron](https://github.com/electron/electron) | Windows desktop shell. |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | Local speech-to-text and text-to-speech runtime; model archives download separately on demand. |

See [Open-source components](docs/OPEN_SOURCE_COMPONENTS.md) for the complete distribution map, including versions, licenses, optional integrations, plugins, skills, model downloads, Docker-only software, development tools, and items that are not shipped.

## Security and privacy

Computer and browser actions are approval-gated. Browser pages do not receive privileged Electron APIs, remote access binds to localhost by default, and ActivityWatch integration remains opt-in. Never commit provider keys, tokens, personal data, local memory databases, or browser data.

Report vulnerabilities privately through [GitHub's security advisory form](https://github.com/sinabrm/opendeputy/security/advisories/new), not a public issue. See [SECURITY.md](SECURITY.md) for scope and reporting guidance.

## License and attribution

OpenDeputy is released under the [MIT License](LICENSE). The original OpenChamber copyright notice remains in the license, and upstream history is preserved in [UPSTREAM_CHANGELOG.md](UPSTREAM_CHANGELOG.md).

Third-party distribution details are recorded in [Open-source components](docs/OPEN_SOURCE_COMPONENTS.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), the retained [`legal/third-party`](legal/third-party/README.md) license texts, and the generated Windows-x64 dependency inventory in [`THIRD_PARTY_LICENSES.txt`](THIRD_PARTY_LICENSES.txt).
