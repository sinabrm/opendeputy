# Open-source components and distribution map

This page explains what OpenDeputy is built from, what each release actually ships, what may be downloaded later, and what remains entirely user-supplied. Version and pin values come from the current source manifests, release lockfile, and runtime catalogs identified below.

## Reading the status column

- **Derived**: OpenDeputy contains modified source from the project.
- **Bundled**: the component is included in that release artifact.
- **Downloaded on demand**: it is absent from a fresh install and is fetched only when the user selects the feature.
- **Optional external**: OpenDeputy can use it, but the user installs or configures it separately.
- **Development only**: it helps build, test, or maintain OpenDeputy and is not an end-user feature.
- **User-added**: it is controlled by the user's OpenCode/OpenDeputy configuration and is not part of the OpenDeputy distribution.

[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) contains the major legal acknowledgements. The generated [`THIRD_PARTY_LICENSES.txt`](../THIRD_PARTY_LICENSES.txt) is the JavaScript and native-package dependency/license inventory for the packaged Windows-x64 application, resolved from the release lockfile. Exact upstream texts for separately bundled binaries and adapted assets are retained in [`legal/third-party`](../legal/third-party/README.md). It is not a general inventory of Docker operating-system packages, optional user-installed tools, downloaded models, or user-added extensions. These files complement, and do not replace, license files distributed by individual projects.

## Derived source

| Project | Role | Version | Status | License |
| --- | --- | --- | --- | --- |
| [OpenChamber](https://github.com/openchamber/openchamber) | Original application foundation for the desktop shell, web server, UI, OpenCode integration, and compatibility contracts | OpenDeputy preserves upstream Git history rather than presenting OpenChamber as a package version | Derived and modified | MIT; original notice is preserved in [`LICENSE`](../LICENSE) |

OpenDeputy is not an official OpenChamber release. Visible branding, Windows packaging, bundled computer control, and local workspace tools are OpenDeputy changes. Internal names such as `@openchamber/*`, `OPENCHAMBER_*`, and existing configuration directories remain where they are required for runtime or upgrade compatibility.

## Bundled Windows desktop components

The `.exe` installer is self-contained for OpenDeputy's core features. End users do not need a separate Node.js, Bun, OpenCode, or Open Computer Use installation.

| Project | Role | Version or pin | Status | License |
| --- | --- | --- | --- | --- |
| OpenDeputy web server and UI | In-process backend and compiled interface | Current source and release | Bundled | MIT, subject to third-party notices |
| [Electron](https://github.com/electron/electron) | Windows desktop shell and embedded Chromium/Node.js runtime | Release manifest and lockfile | Bundled | MIT; Chromium and other notices ship with Electron |
| [OpenCode](https://github.com/anomalyco/opencode) | Agent runtime and provider/plugin API | CLI and SDK `1.18.18` | Bundled | MIT |
| [Open Computer Use](https://github.com/iFurySt/open-codex-computer-use) | Approval-gated desktop inspection and control through MCP | `0.3.1` | Bundled | MIT |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | Isolated browser automation MCP | `0.0.79` | Bundled in the managed agent kit | Apache-2.0 |
| [Open Browser Use](https://github.com/iFurySt/open-browser-use) | MCP and CLI for a connected real Chrome profile | `0.1.41` | Bundled in the managed agent kit; Chrome extension connection is external | MIT |
| [`@zavora-ai/computer-use-mcp`](https://www.npmjs.com/package/@zavora-ai/computer-use-mcp) | Windows accessibility and coordinate-control compatibility MCP | `7.0.0` | Bundled in the managed agent kit | MIT |
| [TouchPoint](https://github.com/Touchpoint-Labs/touchpoint) | Windows UI Automation and CDP accessibility MCP | `touchpoint-py 0.3.0` on portable Python `3.12.10` | Bundled in the managed agent kit; Python packages retain their license metadata beside the runtime | MIT for TouchPoint; Python Software Foundation License for Python; transitive packages retain their own licenses |
| [Sharp](https://sharp.pixelplumbing.com/) | Image decoding for visual grounding | `0.35.3` | Bundled in the managed agent kit; Windows native package includes dynamically linked libvips | Apache-2.0; native package declares Apache-2.0 AND LGPL-3.0-or-later |
| OpenDeputy agent-kit adapters | Overlay, visual grounding, workspace MCP, and four managed skills | Current source | Bundled | MIT, subject to third-party notices |
| [`sherpa-onnx-node`](https://github.com/k2-fsa/sherpa-onnx) | Native local speech inference runtime | API package `1.12.28`; Windows-x64 native package `1.13.3` resolved through its upstream optional range | Bundled; model files are not | Apache-2.0 for the runtime |
| JavaScript/native packages | UI, server, terminal, Git, authentication, Markdown, diagrams, and other application functions | Exact versions in `bun.lock` | Bundled where reached by the packaged application | Per-package; see [`THIRD_PARTY_LICENSES.txt`](../THIRD_PARTY_LICENSES.txt) |

OpenDeputy's in-app browser is implemented with Electron's Chromium view and first-party `opendeputy_web` control plumbing. The desktop agent kit additionally bundles Playwright MCP and the Open Browser Use CLI/MCP. Open Browser Use needs its separately installed Chrome extension to control a real user profile.

Managed desktop OpenCode receives eight enabled MCP entries. TouchPoint uses its self-contained packaged Python runtime and does not rely on a system Python or another application installation. The `opendeputy`, `opendeputy_web`, and `opendeputy_workspace` tools are also materialized from OpenDeputy code; they are not separate third-party MCP projects.

## Major bundled interface foundations

This is a readable acknowledgement of prominent UI projects, not a substitute for the complete Windows-x64 packaged dependency inventory. Exact pinned texts for the adapted Flexoki and Vitesse data and the bundled Remix Icon package are in the [`legal/third-party`](../legal/third-party/README.md) manual bundle.

| Project | What users see | Version or source of truth | License |
| --- | --- | --- | --- |
| [React](https://github.com/facebook/react) | Interface rendering | Release lockfile | MIT |
| [CodeMirror](https://github.com/codemirror) | File, prompt, and configuration editing | Release lockfile | MIT |
| [Pierre Diffs](https://github.com/pierrecomputer/pierre) | File and code-diff rendering | Release lockfile (`@pierre/diffs`) | Apache-2.0 |
| [Shiki](https://github.com/shikijs/shiki) | Syntax highlighting | Release lockfile | MIT |
| [Ghostty Web](https://github.com/coder/ghostty-web) | Browser terminal rendering | Release lockfile | MIT |
| [Flexoki](https://github.com/kepano/flexoki) | Palette and theme foundation | Adapted theme data | [MIT; retained text](../legal/third-party/Flexoki-8d723bac-LICENSE.txt) |
| [Vitesse Theme](https://github.com/antfu/vscode-theme-vitesse) | Syntax-color inspiration used by the OpenDeputy theme | Adapted theme data | [MIT; retained text](../legal/third-party/Vitesse-2862595c-LICENSE.txt) |
| [Remix Icon](https://github.com/Remix-Design/RemixIcon) | Interface icons | Release lockfile | [Remix Icon License 1.0; retained text](../legal/third-party/Remix-Icon-4.9.0-LICENSE.txt) |
| [Beautiful Mermaid](https://github.com/lukilabs/beautiful-mermaid) | Mermaid diagram rendering | Release lockfile | MIT |

## Bundled web and Docker components

The standalone web/server build shares the OpenDeputy UI and backend dependencies. Its environment differs from the Windows installer.

| Project or layer | Role | Version or pin | Distribution | License |
| --- | --- | --- | --- | --- |
| [Bun](https://github.com/oven-sh/bun) | Package manager/build tool and Docker base runtime | `1.3.14` | Docker image and development environment; not bundled in the Windows installer | MIT for Bun; the base image contains separately licensed components |
| [Node.js](https://github.com/nodejs/node) | Runs the self-hosted web server and Playwright transport | `22` | Docker image and supported source runtime | MIT; Node.js includes separately licensed components |
| [OpenCode](https://github.com/anomalyco/opencode) | Managed agent runtime | `opencode-ai@1.18.18` | Installed in the Docker image; a non-Docker server may use a separately installed or externally managed OpenCode | MIT |
| [Playwright Core](https://github.com/microsoft/playwright) | Controls the persistent server-owned browser; its reviewed Docker seccomp profile enables Chromium's non-root sandbox | `1.62.1` | Bundled in the web/server dependency graph and Compose configuration | Apache-2.0 |
| [Chromium](https://www.chromium.org/) | Headless browser for self-hosted agent web actions | Debian package resolved during image build | Docker image only | BSD-3-Clause and other component licenses retained by the Debian package |
| [cloudflared](https://github.com/cloudflare/cloudflared) | Cloudflare Tunnel client | `2026.3.0`, pinned by container digest | Docker image only | Apache-2.0 |
| Debian system packages | Shell, certificates, fonts, Git, SSH, Python, and basic command-line utilities | Resolved by the pinned Bun base image and Debian repositories at image build time | Docker image only | Each package keeps its own license |

The Docker image does not include an AI account, model entitlement, Cloudflare account, domain, or provider subscription. Cloudflare service terms are separate from the Apache-2.0 license of the `cloudflared` client. Chromium's browser profile is user data stored in the mounted OpenDeputy configuration volume.

The reviewed container release target is Linux x64. Its build generates a separate `THIRD_PARTY_LICENSES.docker-linux-x64.txt` from the dependencies actually installed in the Linux image and places it under `/usr/share/licenses/opendeputy`; it does not reuse the Windows inventory. Builds for another architecture fail the inventory guard until that target and its native dependencies receive a separate review.

## Downloaded-on-demand speech models

OpenDeputy does not include speech model archives in the installer or source package. The local-speech downloader retrieves the selected archive from the [sherpa-onnx model releases](https://github.com/k2-fsa/sherpa-onnx/releases), validates its exact byte size and SHA-256 against `packages/web/server/lib/dictation/local/model-catalog.js`, and extracts it into the local OpenChamber-compatible speech-model directory. Corrupt cached or partial archives are discarded rather than extracted.

| OpenDeputy model ID | Purpose | Converted archive | Original publisher/model source | Publisher-declared model license |
| --- | --- | --- | --- | --- |
| `parakeet-tdt-0.6b-v2-int8` | English speech-to-text | [sherpa-onnx Parakeet TDT v2 archive](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2) | [NVIDIA Parakeet TDT 0.6B v2](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2) | [CC-BY-4.0](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2#license-terms-of-use) |
| `parakeet-tdt-0.6b-v3-int8` | Multilingual speech-to-text | [sherpa-onnx Parakeet TDT v3 archive](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2) | [NVIDIA Parakeet TDT 0.6B v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) | [CC-BY-4.0](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3#license-terms-of-use) |
| `whisper-base-int8` | Multilingual speech-to-text | [sherpa-onnx Whisper base archive](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-base.tar.bz2) | [OpenAI Whisper](https://github.com/openai/whisper) | [MIT](https://github.com/openai/whisper#license) |
| `whisper-tiny-int8` | Lightweight multilingual speech-to-text | [sherpa-onnx Whisper tiny archive](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.tar.bz2) | [OpenAI Whisper](https://github.com/openai/whisper) | [MIT](https://github.com/openai/whisper#license) |
| `kokoro-en-v0_19` | English local text-to-speech | [sherpa-onnx Kokoro archive](https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-en-v0_19.tar.bz2) | [Kokoro-82M v0.19](https://huggingface.co/hexgrad/Kokoro-82M/tree/e6a2633a608163a6383195168a1abf0c4b8aeaa7) | [Apache-2.0](https://huggingface.co/hexgrad/Kokoro-82M) |

These publisher-declared licenses describe the original model weights, not necessarily every tokenizer, vocabulary, phonemization asset, support file, conversion, or training dataset in a converted archive. The Apache-2.0 license of the sherpa-onnx runtime also does not license the models it runs. OpenDeputy does not redistribute these archives or assign a license beyond the publishers' declarations. Before using or redistributing a model, review the converted archive, original model card and source, and applicable dataset terms. The runtime catalog is the source of truth for each archive URL, expected byte size, SHA-256, checksum provenance, original project, and model-license link.

## Optional Windows tools

These are installed only when explicitly selected from a source checkout. None is in the Windows `.exe`.

| Project | Role | Installation/version policy | License note |
| --- | --- | --- | --- |
| [LibreOffice](https://www.libreoffice.org/) | Office document preview and conversion | `winget` package `TheDocumentFoundation.LibreOffice`; version selected by `winget` | MPL-2.0 with separately licensed components in its distribution |
| [Piper](https://github.com/OHF-Voice/piper1-gpl) | Local WAV speech synthesis | PyPI [`piper-tts==1.7.0`](https://pypi.org/project/piper-tts/1.7.0/) in a user-local virtual environment; installer supports Windows x64 | GPL-3.0-or-later; each separately downloaded voice has its own model card/license |
| [ActivityWatch](https://github.com/ActivityWatch/activitywatch) | Optional local application/window history | `winget` package `ActivityWatch.ActivityWatch`; version selected by `winget` | MPL-2.0 with separately licensed components in its distribution |

See [Optional Windows tools](OPTIONAL_TOOLS.md) for installation paths, privacy behavior, and environment overrides.

## Optional services and integrations

| Integration | What OpenDeputy provides | What the user supplies |
| --- | --- | --- |
| AI providers and models | OpenCode settings and provider flows | Account, API key or subscription, model access, and acceptance of provider/model terms |
| OpenAI-compatible speech endpoints | Configurable client/server integration | Endpoint, credentials, service availability, and applicable privacy/usage terms |
| GitHub | Repository, issue, pull-request, and authentication integration using Octokit | GitHub account/credentials and acceptance of GitHub terms |
| Cloudflare Tunnel | Tunnel orchestration; `cloudflared` is bundled only in Docker | Windows/macOS/Linux client when not using the Docker image, plus any account/domain configuration and service terms |
| ngrok | Tunnel orchestration | ngrok client, authentication where required, account, and service terms |

An open-source client license is not a license to a hosted service, model, subscription, or data. OpenDeputy's MIT License does not replace provider pricing, privacy, acceptable-use, trademark, or service terms.

## Optional OpenCode plugins

OpenDeputy shows these provider plugins in Settings, but does not preinstall or redistribute them. Installation occurs only after the user selects a plugin, and its version is resolved from npm at that time unless the user chooses a pinned spec.

| Plugin | Purpose | Source | License |
| --- | --- | --- | --- |
| `@openchamber/opencode-claude` | Claude Code/Anthropic Agent SDK provider bridge | [openchamber/opencode-claude](https://github.com/openchamber/opencode-claude) | MIT; Claude Code, Agent SDK, plan, and model terms are separate |
| `@openchamber/opencode-commandcode` | Command Code provider bridge | [openchamber/opencode-commandcode](https://github.com/openchamber/opencode-commandcode) | MIT; Command Code plan and service terms are separate |
| `@openchamber/opencode-cursor` | Cursor provider bridge | [openchamber/opencode-cursor](https://github.com/openchamber/opencode-cursor) | MIT; Cursor account and service terms are separate |

OpenDeputy also supports arbitrary OpenCode plugin package specs and local plugin files. Those are user-added code and run with the permissions granted to OpenCode; review them before installation.

## Skills

The Windows agent kit includes `computer-control`, `desktop-workspace`, `open-browser-use`, and `open-computer-use`. OpenCode supplies the built-in `customize-opencode` skill, producing five default discovered skills. The skills catalog can also scan and install skills from [Anthropic's public skills repository](https://github.com/anthropics/skills), the [ClawdHub](https://clawdhub.com/) community registry, or a user-provided Git repository.

Installed skills may contain instructions, scripts, references, and assets. Their licenses and security behavior vary by repository and sometimes by individual skill. Review each selected skill's `SKILL.md`, supporting files, source, and license before installing it. A catalog listing is not an endorsement or a claim that the skill is covered by OpenDeputy's MIT License.

## User-added extensions that are not shipped

OpenDeputy can read and manage user- or project-scoped OpenCode configuration. As a result, a running installation may show MCP servers, plugins, commands, agents, skills, models, themes, external executables, or provider integrations that are not present in this repository.

Examples include additional browser or office-automation MCP servers, custom local tools, and personal skills beyond the managed agent kit. OpenDeputy does not bundle an extension merely because a user configured it. Its installation, updates, permissions, network access, data handling, and license obligations remain the user's and the extension publisher's responsibility.

Compatibility is also not inclusion: support for an `opencode-snippets`-compatible file format or discovery of an installed terminal/application does not mean that OpenDeputy copied or distributed that project.

## Development-only components

The source checkout uses tools such as Bun, TypeScript, Vite, Vitest, ESLint, electron-builder, NSIS support downloaded by electron-builder, patch-package, and repository automation. These tools build or validate release artifacts; they are not separate end-user capabilities in the Windows app. Their exact resolved versions are recorded by the lockfile; packages included in the packaged Windows-x64 dependency graph also appear in the generated license inventory.

Repository `.agents/skills` outside `packages/electron/agent-kit/skills`, tests, fixtures, build scripts, and contributor documentation guide development. They are not automatically installed into a user's OpenCode skills directories or included as advertised runtime extensions.

## Sources of truth

When updating a component, update the corresponding record as part of the same change:

- `package.json`, workspace package manifests, and `bun.lock` for JavaScript/native packages.
- `packages/electron/package.json` and its packaging resources for Windows-bundled runtimes.
- `Dockerfile` for Docker base software, OpenCode, and cloudflared pins.
- `packages/web/server/lib/dictation/local/model-catalog.js` for speech model URLs, byte sizes, SHA-256 values, and checksum provenance.
- `scripts/install-optional-windows-tools.ps1` for optional Windows package pins and install identifiers.
- [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) for major acknowledgements and generated [`THIRD_PARTY_LICENSES.txt`](../THIRD_PARTY_LICENSES.txt) for the packaged Windows-x64 JavaScript/native dependency inventory.
- [`legal/third-party`](../legal/third-party/README.md) for pinned manual license texts that the npm inventory cannot retain automatically.
