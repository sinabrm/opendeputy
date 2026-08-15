# Optional Windows tools

OpenDeputy's installer includes the core browser, file, terminal, OpenCode, and computer-use capabilities. The tools below are optional and are never installed or started silently.

Run `bun run tools:windows` from a source checkout for an interactive installer, or pass switches directly to `scripts/install-optional-windows-tools.ps1`.

## LibreOffice

Adds previews and converted copies for Office documents. OpenDeputy preserves the source file and refuses an unapproved overwrite.

## Piper

Adds local WAV speech synthesis. The script creates `.open-deputy\workspace-tools\.venv` in the current Windows user profile and installs `piper-tts`. A compatible `.onnx` voice plus its `.json` file must be placed in `.open-deputy\workspace-tools\voices` separately.

## ActivityWatch

Adds access to local application/window history when the user explicitly requests it. ActivityWatch collects history only while its own service is running. The installer warns about this behavior and does not start it.

Advanced installations can set `OPENDEPUTY_LIBREOFFICE_BINARY`, `OPENDEPUTY_PIPER_BINARY`, `OPENDEPUTY_PIPER_VOICES_DIR`, or `OPENDEPUTY_ACTIVITYWATCH_BINARY`.
