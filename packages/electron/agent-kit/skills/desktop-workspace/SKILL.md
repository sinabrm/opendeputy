---
name: desktop-workspace
description: Use local OpenDeputy workspace tools for durable SQLite memory, LibreOffice document conversion and previews, offline English or Persian Piper speech, and optional ActivityWatch history. Trigger for remembering approved facts, reading or converting Office documents, generating spoken audio, or answering a user request from local computer activity history.
---

# Desktop Workspace

Use the `workspace_tools` MCP for local memory, documents, speech, and optional activity history.

## Memory

- Use `memory_search` when an earlier user-approved preference or fact may help.
- Use `memory_add` only for facts the user explicitly asks to remember or clearly approves as durable memory.
- Never store passwords, API keys, authentication tokens, financial details, or other secrets.
- Ask before using `memory_delete` on anything except a test record created in the same task.

## Documents

- Use `document_preview` to make a PDF or HTML preview of an Office document.
- Use `document_convert` when the user requests PDF, HTML, DOCX, XLSX, or PPTX output.
- Preserve the source file. Treat the returned output as a separate copy and verify it exists.
- Ask before replacing an existing user file.

## Voice

- Call `voice_list` first when the exact installed voice name is unknown.
- Use `voice_synthesize` for English or Persian speech. It creates a WAV file and does not play it automatically.
- Do not play audio or send it anywhere unless the user asks.

## Optional History

- ActivityWatch is opt-in. Call `history_status` before using it.
- Call `history_start` only after the user asks to enable tracking.
- Call `history_recent` only when the user asks to use their activity history for the current task.
- Call `history_stop` when the user asks to stop tracking. Stopping does not delete collected data.

## Screen Understanding

For screen inspection and clicking, use `$computer-control`. It tries browser structure or Windows accessibility first, then local OCR/OmniParser, then `opencode/mimo-v2.5-free` vision for unresolved screenshot targets. The main DeepSeek planner receives coordinates and should verify the screen after each action.
