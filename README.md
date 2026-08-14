# OpenDeputy

![OpenDeputy logo](docs/brand/open-deputy-logo.svg)

OpenDeputy is an open-source AI coworker that can work with projects, files, terminals, websites, and desktop applications from one visual workspace. It uses [OpenCode](https://opencode.ai) for agents and models, and is built from the MIT-licensed [OpenChamber](https://github.com/openchamber/openchamber) project.

## What it can do

- Run OpenCode agents with any provider and model configured in OpenCode.
- Read and change project files, run terminal commands, use Git, and maintain project notes.
- Open a real Chromium page inside the desktop app, read its semantic snapshot, click, type, scroll, inspect styles, resize the viewport, and save screenshots.
- Control Windows, macOS, and Linux applications through the bundled MIT-licensed [Open Computer Use](https://github.com/iFurySt/open-codex-computer-use) accessibility runtime. Read-only app discovery is automatic; actions remain approval-gated.
- Store user-approved facts in local SQLite memory.
- Create document previews and converted copies with an optional LibreOffice installation.
- Create local English or Persian WAV speech with optional Piper voices.
- Read optional local ActivityWatch history only when the user asks.
- Run multiple agents, persistent goals, scheduled tasks, remote instances, notifications, voice input, desktop, web/PWA, mobile, and VS Code surfaces inherited from OpenChamber.

OpenDeputy does not include a proprietary model. Model availability, speed, vision, and pricing come from the OpenCode provider the user selects. The built-in browser usually uses DOM/accessibility structure, so text-only reasoning models can click reliably without understanding a screenshot. Vision remains useful as a fallback for canvas, video, remote desktops, and other structureless interfaces.

## Run from source

Requirements: Git, Node.js 22 or newer, and Bun 1.3.14.

```bash
git clone https://github.com/GhostBlinkCode/open-deputy.git
cd open-deputy
bun install
bun run electron:dev
```

Build the desktop installer:

```bash
bun run electron:build
```

The web CLI keeps the upstream `openchamber` command as a compatibility alias and also provides:

```bash
open-deputy --port 3000
```

## Optional local capabilities

Memory and the in-app browser need no API key. Open Computer Use is bundled with desktop builds. These optional executables are discovered automatically from common Windows locations or can be set explicitly:

- `OPENDEPUTY_LIBREOFFICE_BINARY`
- `OPENDEPUTY_PIPER_BINARY`
- `OPENDEPUTY_PIPER_VOICES_DIR`
- `OPENDEPUTY_ACTIVITYWATCH_BINARY`

Activity history stays off until the user requests it. Document conversion preserves the source, and the agent refuses to overwrite an output without explicit approval. Memory instructions prohibit storing passwords, API keys, tokens, financial details, or other secrets.

## Development

```bash
bun run type-check
bun run test
bun run build
bun run dead-code
```

Regenerate app, web, and tray images from the canonical OpenDeputy vector logo:

```bash
bun run brand:assets
```

The `upstream` Git remote should point to `https://github.com/openchamber/openchamber.git` so upstream fixes can be reviewed and merged without erasing OpenDeputy-specific changes.

## Security

- Desktop computer actions are permission-gated.
- Browser pages do not receive OpenDeputy's privileged Electron APIs.
- Remote access binds to localhost by default. Network exposure requires authentication.
- No API keys, tokens, model credentials, personal paths, memory databases, speech output, browser data, or ActivityWatch history belong in this repository.

Please report security issues privately before publishing exploit details.

## Attribution and license

OpenDeputy is a modified distribution of OpenChamber. The original MIT copyright notice remains in [LICENSE](LICENSE), and bundled third-party components are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

OpenDeputy is released under the MIT License.
