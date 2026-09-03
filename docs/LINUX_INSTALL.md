# Install OpenDeputy on Linux

OpenDeputy currently ships Linux x64 desktop artifacts in two formats:

- **AppImage**: portable; download, make executable, and launch.
- **`.deb`**: Debian/Ubuntu package; install with `apt`.

## Requirements

- A modern 64-bit Linux desktop (Ubuntu 22.04+ or Debian 12+ recommended).
- X11 or Wayland with a graphical user session.
- An OpenCode-compatible provider account, API key, or subscription.
- For source development only: Node.js 22+ and Bun 1.3.14.

The desktop artifact includes Electron, the matching OpenCode CLI, the web UI,
Open Computer Use, the managed agent kit, and Linux native browser/computer
helpers. TouchPoint and its portable Python runtime are Windows-only and are
not included in the Linux artifact.

## Install an AppImage

```bash
chmod +x OpenDeputy-<version>-linux-x86_64.AppImage
./OpenDeputy-<version>-linux-x86_64.AppImage
```

On Ubuntu 24.04, install `libfuse2t64` for the normal mounted AppImage
launcher (the menu-registration helper below works without it):

```bash
sudo apt install libfuse2t64
```

Keep the AppImage in a writable location if you want in-app updates. The
`.deb` installation is updated by installing a newer `.deb` manually.

To add a portable AppImage to **Show Applications**, run this once from the
repository (or pass the AppImage path as the first argument):

```bash
bun run electron:install:linux
```

The helper copies the icon and creates a per-user desktop entry. If FUSE is
not installed, the entry automatically uses AppImage extraction mode.

## Install the Debian package

```bash
sudo apt install ./OpenDeputy-<version>-linux-amd64.deb
opendeputy
```

The package declares the desktop runtime libraries it needs. If your desktop
does not expose the `opendeputy` launcher immediately, start it from the
application menu or log out and back in.

## Run from source

```bash
git clone https://github.com/sinabrm/opendeputy.git
cd opendeputy
bun install
bun run electron:dev
```

For the compiled UI without Vite HMR, use `bun run electron:dev:bundled`.
On machines that have reached Linux's inotify watcher limit, use polling:

```bash
OPENCHAMBER_HMR_POLLING=1 bun run electron:dev
```

Build both installable artifacts with:

```bash
sudo apt install binutils   # provides `ar` for the .deb target
bun run electron:build:linux
```

The files are written to `packages/electron/dist/`. Run
`bun run test:linux-package` to validate the AppImage runtime, Debian metadata,
bundled OpenCode CLI, Linux agent helpers, and legal inventory.

After launch, connect a provider under **Settings → Providers**. OpenDeputy
does not include model weights or provider credentials.
