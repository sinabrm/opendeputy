# OpenDeputy Web Runtime

This package provides the in-process server and built web interface used by OpenDeputy Desktop. It retains the upstream `openchamber` CLI and package name as compatibility aliases for existing automation and remote-server deployments.

The Windows desktop release starts this server inside Electron and bundles the matching OpenCode CLI. A standalone remote server may connect to an external OpenCode instance or start an installed OpenCode CLI.

## Development

```powershell
bun run dev
bun run build:web
bun run type-check:web
bun run lint:web
```

Start a development server with `bun run start:web`. Defaults bind to loopback. Protect any LAN or internet exposure with authentication, TLS, and firewall rules.

The supported persistent Docker deployment is documented in
[`docs/SELF_HOSTING.md`](../../docs/SELF_HOSTING.md). Docker enables the
server-owned Chromium runtime. Non-Docker servers must run the web server on
Node.js 22 or newer, then can opt in with
`OPENDEPUTY_HEADLESS_BROWSER=true` and an `OPENDEPUTY_BROWSER_EXECUTABLE` path.

## Compatibility

The package remains `@openchamber/web`, the CLI alias remains `openchamber`, and existing `OPENCHAMBER_*` environment variables remain supported. These identifiers are runtime contracts; visible desktop branding and release artifacts use OpenDeputy.

## Security

- Never expose an unauthenticated server outside localhost.
- Connection links and client tokens are credentials.
- Provider secrets belong to OpenCode auth/config, not repository files.
- Browser and computer actions remain permission-gated.

See module `DOCUMENTATION.md` files under `server/lib` and `bin/lib` before changing their contracts.
