# Changelog

## [Unreleased]

- **Self-hosting:** Docker deployments can now keep projects, schedules, OpenCode sessions, and a persistent server browser running without an open desktop client.
- **Built-in agent tools:** Windows installations now include eight managed MCP entries and five skills by default, with their commands resolved from the installed OpenDeputy package instead of user-specific paths.
- **Open-source transparency and release integrity:** Distribution boundaries, exact runtime pins, downloadable model provenance and checksums, generated dependency licenses, and packaged legal notices are now documented and enforced by release checks.

## [1.19.0] - 2026-08-15

- **Windows installer:** OpenDeputy now ships as a self-contained Windows app with the matching OpenCode CLI and computer-use runtime included.
- **First run:** New installations guide users to connect a provider and choose a model without requiring a separate OpenCode installation.
- **Windows setup:** Contributors can install prerequisites, dependencies, and run checks from one PowerShell command.
- **Branding:** Application, installer, tray, browser, and PWA assets now use the supplied OpenDeputy logo.
- **Release safety:** Windows CI validates the app and creates draft release candidates with SHA-256 checksums.
- **Product scope:** The monorepo now focuses on Electron, web, and shared UI; mobile, VS Code, macOS, and Linux release products are deferred.
- **Optional tools:** LibreOffice, Piper, and ActivityWatch use explicit opt-in setup and are not silently started.

Earlier upstream history is preserved in [UPSTREAM_CHANGELOG.md](UPSTREAM_CHANGELOG.md).
