# Self-host OpenDeputy

OpenDeputy's supported self-hosted path is one private Docker deployment for one
person or one trusted team. The server keeps OpenCode, projects, scheduled
tasks, and an optional Chromium profile running independently of a laptop.

## Requirements

- A Linux x64 server or VPS with Docker Engine and Docker Compose
- Enough memory for OpenCode plus Chromium; avoid heavily constrained shared hosts
- An AI provider account or a model available through OpenCode
- A reverse proxy with HTTPS for internet access

The container is intentionally single-tenant. Do not use one deployment as a
security boundary between unrelated users: projects, terminal access, provider
credentials, and the server browser profile belong to the same trusted runtime.

## Start the server

```sh
git clone https://github.com/sinabrm/opendeputy.git
cd opendeputy
cp .env.example .env
```

Generate a long password and place it in `.env` as
`OPENCHAMBER_UI_PASSWORD`. For example:

```sh
openssl rand -base64 32
```

Build and start the deployment:

```sh
docker compose up -d --build
docker compose ps
```

By default, port 3000 binds to `127.0.0.1`. Put an HTTPS reverse proxy on the
same server in front of `http://127.0.0.1:3000`. To use a private LAN or a
separately protected firewall rule instead, set
`OPENDEPUTY_BIND_ADDRESS=0.0.0.0` in `.env` and restart the deployment.

Open the URL, sign in with the UI password, add a project from the mounted
workspace, and connect an OpenCode model provider in Settings.

## Persistent data

The Compose deployment stores all durable state on the host:

| Host path | Container path | Contents |
| --- | --- | --- |
| `./workspaces` | `/home/openchamber/workspaces` | Project checkouts and generated files |
| `./data/openchamber` | `/home/openchamber/.config/openchamber` | OpenDeputy settings, tasks, memory, and the Chromium profile |
| `./data/opencode/share` | `/home/openchamber/.local/share/opencode` | OpenCode sessions and authentication |
| `./data/opencode/state` | `/home/openchamber/.local/state/opencode` | OpenCode runtime state |
| `./data/opencode/config` | `/home/openchamber/.config/opencode` | OpenCode configuration |
| `./data/ssh` | `/home/openchamber/.ssh` | SSH keys and known hosts |

Back up `workspaces` and `data` together. Do not commit either directory.

## Background and browser behavior

`OPENDEPUTY_HEADLESS_BROWSER=true` enables a server-owned Chromium instance.
The existing `opendeputy_web` actions then use that browser even when no desktop
or web client is open. Its cookies and browser state persist under the
OpenDeputy data volume and are shared by every agent using this one deployment.

The server browser blocks common cloud metadata endpoints. Chromium keeps its
normal sandbox by default. Compose applies the reviewed Playwright seccomp
profile in `scripts/chromium-seccomp-profile.json`, which extends Docker's
default syscall policy only with the namespace operations that Chromium's
non-root sandbox needs. Do not set
`OPENDEPUTY_HEADLESS_BROWSER_NO_SANDBOX=true` unless the host cannot run
Chromium otherwise and you understand the reduced isolation.

The container runs the server on Node.js 22 and uses Bun for dependency and
build tooling. Scheduled tasks run while the container is healthy. The Compose
service uses `restart: unless-stopped`, a health check, an init process, and a
graceful stop window. Stopping the container or the VPS stops new work;
restarting it restores persisted projects, sessions, schedules, and browser
state.

The server cannot control applications or files on somebody's powered-off
Windows computer. Desktop control remains a separate local capability.

## Operate and update

```sh
docker compose logs -f opendeputy
docker compose restart opendeputy
git pull --ff-only
docker compose up -d --build
```

Before an update, back up `workspaces` and `data`. After an update, wait until
`docker compose ps` reports the service as healthy before starting new work.

## Security checklist

- Use HTTPS for every connection that leaves the server.
- Keep port 3000 on loopback unless a private network or firewall protects it.
- Use a unique, long UI password.
- Keep provider keys and SSH material only in the mounted data directories or
  supported secret stores, never in the repository or Compose file.
- Treat every project and website as untrusted input; keep approvals enabled for
  writes, publishing, deletion, purchases, and production changes.
- Run separate deployments for users who should not share files or credentials.
