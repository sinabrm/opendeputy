# OpenDeputy Workspace Tools

## Purpose

This module provides local, user-controlled workspace capabilities to the managed OpenCode process through the OpenDeputy agent plugin. It owns durable SQLite memory, document conversion and previews, offline Piper speech, and optional ActivityWatch history.

## Boundaries

- `service.js` owns validation, local storage, optional executable discovery, and action execution.
- `../agent-tool/runtime.js` exposes the fixed action allowlist as `opendeputy_workspace` and forwards calls over its authenticated loopback callback.
- `../../index.js` routes workspace actions to this service. No workspace action is available to an external OpenCode server because the plugin is injected only into an OpenCode process managed by OpenDeputy.
- The managed agent kit also supplies `workspace_tools` for compatibility with the default desktop skill set. The first-party `opendeputy_workspace` tool remains the owning implementation for OpenDeputy's UI and managed callback path.
- Open Computer Use and the other default desktop MCP entries are packaged separately. Browser actions remain available through the first-party `opendeputy_web` tool as well.

## Safety invariants

- Memory is local to the OpenDeputy data directory. The tool description forbids secrets and requires explicit approval before durable writes or deletion.
- The default data directory is `.opendeputy`. On first use, a prior hyphenated directory is moved automatically; if Windows blocks the move, OpenDeputy continues using the existing directory without deleting data.
- Document conversion writes a separate output and refuses to replace an existing file unless `overwrite` is explicitly true.
- ActivityWatch remains optional and off until the user asks to start it. Reading history and stopping collection also require an explicit user request.
- Piper creates a WAV file but never plays or uploads it.
- Optional executables can be provided through `OPENDEPUTY_LIBREOFFICE_BINARY`, `OPENDEPUTY_PIPER_BINARY`, `OPENDEPUTY_PIPER_VOICES_DIR`, and `OPENDEPUTY_ACTIVITYWATCH_BINARY`. Legacy `OPENCHAMBER_*` overrides remain accepted for migration.

## Actions

- `workspace.status`
- `memory.add`, `memory.search`, `memory.delete`
- `document.convert`, `document.preview`
- `voice.list`, `voice.synthesize`
- `history.status`, `history.start`, `history.recent`, `history.stop`

## Platform behavior

Memory works anywhere the supported Node runtime provides `node:sqlite`. LibreOffice and Piper work when their local binaries are installed. ActivityWatch discovery includes standard Windows locations; stopping its process is Windows-only and returns an explicit unsupported error elsewhere.
