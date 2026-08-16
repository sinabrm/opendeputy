# Third-Party Notices

OpenDeputy includes, derives from, or interoperates with third-party projects. Their names and trademarks belong to their respective owners. This document identifies the major projects and distribution boundaries; it does not replace the license text shipped by any project.

The generated [`THIRD_PARTY_LICENSES.txt`](THIRD_PARTY_LICENSES.txt) is the Windows x64 package-level inventory for JavaScript and npm-delivered native dependencies resolved by the release lockfile. Exact upstream texts for separately bundled binaries and adapted assets are retained in [`legal/third-party`](legal/third-party/README.md). [Open-source components](docs/OPEN_SOURCE_COMPONENTS.md) explains which components are bundled, downloaded on demand, optional, development-only, or supplied by the user.

## Derived application code

### OpenChamber

OpenDeputy is a modified distribution of [OpenChamber](https://github.com/openchamber/openchamber), originally copyright 2025 Bohdan Triapitsyn and licensed under the MIT License. The original notice is preserved in the repository's [`LICENSE`](LICENSE) file.

OpenDeputy-specific branding, bundled computer control, and local workspace tools are modifications of this fork and are not official OpenChamber releases. Compatibility identifiers such as `@openchamber/*`, `OPENCHAMBER_*`, and existing configuration directories are intentionally retained where changing them would break runtime or upgrade compatibility.

## Bundled runtime components

### OpenCode

The current OpenDeputy release uses the [OpenCode](https://github.com/anomalyco/opencode) SDK and CLI version 1.18.18 under the MIT License. The Windows package includes a matching CLI; the Docker image installs the same pinned version. OpenCode is an independent project, and OpenDeputy is not an official OpenCode distribution.

The exact OpenCode v1.18.18 notice is retained in [`legal/third-party/OpenCode-1.18.18-LICENSE.txt`](legal/third-party/OpenCode-1.18.18-LICENSE.txt).

An OpenCode-supported AI provider, model, account, API key, or subscription is not included. Provider licenses, pricing, privacy policies, acceptable-use policies, model terms, and service terms remain separate agreements between the user and that provider.

### Open Computer Use

Windows desktop packages include [Open Computer Use](https://github.com/iFurySt/open-codex-computer-use), version 0.3.1, licensed under the MIT License. OpenDeputy packages its `LICENSE` and `README.md` beside the runtime and exposes it as an approval-gated MCP computer-use capability.

### Electron

The Windows desktop shell includes [Electron](https://github.com/electron/electron), resolved from the release lockfile under the MIT License. Electron includes Chromium, Node.js, and other components whose notices are distributed with Electron, including Electron's generated Chromium license notice.

### sherpa-onnx

The web runtime includes [`sherpa-onnx-node`](https://github.com/k2-fsa/sherpa-onnx), version 1.12.28, under the Apache License 2.0, for local speech recognition and synthesis.

The exact upstream Apache License text is retained in [`legal/third-party/Apache-2.0-LICENSE.txt`](legal/third-party/Apache-2.0-LICENSE.txt) and applies to the pinned sherpa-onnx and cloudflared revisions listed here.

Speech model archives are not inside the installer. They are downloaded from sherpa-onnx releases only when selected. A runtime library's software license does not automatically establish the license for every model weight, tokenizer, voice, or dataset. OpenDeputy does not assign or represent a license for those downloaded artifacts; users should review the model archive, model card, and original publisher terms. The exact download sources are listed in [Open-source components](docs/OPEN_SOURCE_COMPONENTS.md#downloaded-on-demand-speech-models).

### cloudflared in Docker

The Docker image includes [cloudflared](https://github.com/cloudflare/cloudflared) version 2026.3.0, pinned by container digest, under the Apache License 2.0. It is not included in the Windows installer. Use of the Cloudflare service is governed separately by Cloudflare's service terms and account configuration.

## Major interface foundations

OpenDeputy's compiled interface includes many packages recorded in [`THIRD_PARTY_LICENSES.txt`](THIRD_PARTY_LICENSES.txt). Major user-visible foundations include:

| Project | Role | Version/source of truth | License |
| --- | --- | --- | --- |
| [React](https://github.com/facebook/react) | Interface runtime | Resolved from the release lockfile | MIT |
| [CodeMirror](https://github.com/codemirror) | File, prompt, and configuration editors | Resolved from the release lockfile | MIT |
| [Pierre Diffs](https://github.com/pierrecomputer/pierre) | File and diff rendering | Release lockfile | Apache-2.0 |
| [Shiki](https://github.com/shikijs/shiki) | Syntax highlighting | Release lockfile | MIT |
| [Ghostty Web](https://github.com/coder/ghostty-web) | Browser terminal renderer | `0.4.0` | MIT |
| [Flexoki](https://github.com/kepano/flexoki) | Color palette and theme foundation | Adapted in OpenDeputy themes | MIT |
| [Vitesse Theme](https://github.com/antfu/vscode-theme-vitesse) | Syntax-color inspiration in the OpenDeputy theme | Adapted in OpenDeputy themes | MIT |
| [Remix Icon](https://github.com/Remix-Design/RemixIcon) | Interface icons | Resolved from the release lockfile | Remix Icon License 1.0 |
| [Beautiful Mermaid](https://github.com/lukilabs/beautiful-mermaid) | Mermaid diagram rendering | Release lockfile | MIT |

Pinned Flexoki, Vitesse Theme, and Remix Icon texts are retained in the [`legal/third-party`](legal/third-party/README.md) manual bundle.

Thank you to these projects and to every transitive dependency and contributor represented in the generated license inventory.

## Separate, optional, or downloaded software

The following items are not redistributed in the Windows installer:

- [LibreOffice](https://www.libreoffice.org/) for optional document conversion.
- [`piper-tts`](https://pypi.org/project/piper-tts/1.7.0/) 1.7.0 and user-selected Piper voice models for optional speech synthesis.
- [ActivityWatch](https://github.com/ActivityWatch/activitywatch) for optional local activity history.
- `cloudflared` and [ngrok](https://ngrok.com/) tunnel clients on Windows.
- Optional OpenCode provider plugins, including [`@openchamber/opencode-claude`](https://github.com/openchamber/opencode-claude), [`@openchamber/opencode-commandcode`](https://github.com/openchamber/opencode-commandcode), and [`@openchamber/opencode-cursor`](https://github.com/openchamber/opencode-cursor).
- Optional skills selected from [Anthropic's public skills repository](https://github.com/anthropics/skills), [ClawdHub](https://clawdhub.com/), or another Git repository.
- MCP servers, plugins, commands, skills, models, themes, and executables added to a user's OpenCode or OpenDeputy configuration.

Each item remains subject to its own license and, where applicable, its publisher's privacy and service terms. Installing or configuring an item does not make it part of OpenDeputy or place it under OpenDeputy's MIT License.
