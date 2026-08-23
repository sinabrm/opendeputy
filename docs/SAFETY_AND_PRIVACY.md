# Safety and privacy

OpenDeputy can change files, run terminal commands, browse websites, and control Windows applications. Those abilities require the same care as giving a person access to the computer.

## Approval boundaries

- Computer and browser actions are permission-gated.
- Remote web pages do not receive privileged Electron APIs.
- Camera, microphone, location, and device-picker requests from the embedded browser are denied.
- Destructive file operations and overwrites require explicit approval.
- ActivityWatch history is read only after a user request.

## Data locations

Chats, settings, project state, memory, browser storage, and optional speech files are stored locally in OpenDeputy/OpenChamber-compatible application data directories. Provider prompts and files included in prompts are sent to the selected model provider according to that provider's terms. The managed visual-grounding tool reads the locally configured NVIDIA credential and sends task-relevant supported screenshots, images, audio, or video to `nvidia/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` for text/code analysis.

OpenDeputy does not bundle a model. Provider credentials are handled by OpenCode and must never be committed to this repository. Local memory instructions prohibit passwords, API keys, tokens, financial details, and other secrets.

## Remote access

Services bind to localhost by default. Before exposing a server to a LAN or the internet, enable authentication, TLS, and firewall restrictions. Treat connection URLs, client tokens, and tunnel credentials as secrets.

## Release verification

Unsigned release candidates may trigger SmartScreen. Download the checksum from the same draft/release and verify the installer's SHA-256 hash before running it.
