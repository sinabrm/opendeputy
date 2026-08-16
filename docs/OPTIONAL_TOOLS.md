# Optional Windows tools

OpenDeputy's Windows installer already includes the browser, file, terminal, OpenCode, and computer-use capabilities. The tools on this page are separate products: they are not inside the OpenDeputy installer, they are not installed or started silently, and their own licenses and privacy behavior apply.

From a source checkout, run `bun run tools:windows` for an interactive installer, or pass switches directly to `scripts/install-optional-windows-tools.ps1`. The script uses `winget` for LibreOffice and ActivityWatch and a user-local Python virtual environment for Piper.

## LibreOffice

[LibreOffice](https://www.libreoffice.org/) adds previews and converted copies for supported Office documents. OpenDeputy invokes the locally installed `soffice` command, preserves the source file, and refuses an unapproved overwrite.

- Installation: `winget` package `TheDocumentFoundation.LibreOffice`.
- Version: selected by `winget`; OpenDeputy does not pin or redistribute it.
- Source: [LibreOffice/core](https://github.com/LibreOffice/core).
- License: LibreOffice is made available under the Mozilla Public License 2.0 and contains separately licensed components; use the license information included with the installed LibreOffice build.
- Data: document conversion is local, but the converted output may contain the original document's content. Review it before sharing.

## Piper

[Piper](https://github.com/OHF-Voice/piper1-gpl) adds local WAV speech synthesis. The script creates `.open-deputy\workspace-tools\.venv` in the current Windows user profile and installs [`piper-tts==1.7.0`](https://pypi.org/project/piper-tts/1.7.0/), licensed under GPL-3.0-or-later. OpenDeputy does not redistribute Piper.

The pinned Piper release provides a Windows `win_amd64` wheel, so OpenDeputy's supported optional-tools installation path is Windows x64. The script rejects other Windows architectures before installation because it does not provide an ARM64 Piper build. Users with another architecture may instead supply a compatible external executable through `OPENDEPUTY_PIPER_BINARY`.

This optional workspace tool is separate from OpenDeputy's built-in sherpa-onnx speech runtime and its on-demand Kokoro model.

A compatible `.onnx` voice and its `.json` file must be placed in `.open-deputy\workspace-tools\voices` separately. Voice models have their own model cards and licenses. Do not assume that Piper's software license also licenses a selected voice; check the voice's `MODEL_CARD` before downloading, using, or sharing it.

Piper runs locally and OpenDeputy writes a WAV file; OpenDeputy does not automatically play or upload that file.

## ActivityWatch

[ActivityWatch](https://github.com/ActivityWatch/activitywatch) adds access to local application and window history when the user explicitly requests it.

- Installation: `winget` package `ActivityWatch.ActivityWatch`.
- Version: selected by `winget`; OpenDeputy does not pin or redistribute it.
- License: MPL-2.0; its distribution can contain separately licensed components.
- Data: ActivityWatch may record active applications, window titles, browser activity, and AFK status while its watchers are running. Its data is stored and controlled by ActivityWatch on the local machine.

The optional-tools script warns about collection and does not start ActivityWatch. OpenDeputy checks, starts, reads, or stops it only after an explicit user request. Stopping it does not delete existing ActivityWatch history.

## Advanced paths

OpenDeputy checks normal installation locations. Advanced installations can override executable or voice paths with:

- `OPENDEPUTY_LIBREOFFICE_BINARY`
- `OPENDEPUTY_PIPER_BINARY`
- `OPENDEPUTY_PIPER_VOICES_DIR`
- `OPENDEPUTY_ACTIVITYWATCH_BINARY`

Legacy `OPENCHAMBER_*` equivalents remain accepted for migration compatibility.

## Other optional extensions

AI providers, OpenCode plugins, skills, MCP servers, Cloudflare Tunnel, and ngrok are configured separately and are not installed by `bun run tools:windows`. See [Open-source components](OPEN_SOURCE_COMPONENTS.md) for their distribution boundary. Provider accounts, subscriptions, API charges, privacy policies, acceptable-use policies, and other service terms are agreements between the user and the selected provider; OpenDeputy's MIT license does not replace them.
