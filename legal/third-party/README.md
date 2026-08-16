# Manually retained third-party licenses

This directory contains license texts for bundled binaries and adapted assets
that are not fully represented by the installed npm package roots scanned into
`THIRD_PARTY_LICENSES.txt`.

The source revision is part of each record. License files are copied verbatim
from the linked revision, with line endings normalized to LF for deterministic
verification.

| Component | Shipped/adapted version | Upstream license source | Retained file |
| --- | --- | --- | --- |
| OpenCode CLI and SDK | `1.18.18` | [`anomalyco/opencode@v1.18.18`](https://github.com/anomalyco/opencode/blob/v1.18.18/LICENSE) | `OpenCode-1.18.18-LICENSE.txt` |
| sherpa-onnx runtime | npm API package `1.12.28`; Windows x64 native package resolved as `1.13.3` by its upstream `^1.12.28` optional range | [`k2-fsa/sherpa-onnx@v1.12.28`](https://github.com/k2-fsa/sherpa-onnx/blob/v1.12.28/LICENSE) | `Apache-2.0-LICENSE.txt` |
| cloudflared | `2026.3.0` | [`cloudflare/cloudflared@2026.3.0`](https://github.com/cloudflare/cloudflared/blob/2026.3.0/LICENSE) | `Apache-2.0-LICENSE.txt` |
| Flexoki | adapted theme data; license snapshot `8d723bac4a9ac46adfdf99d42155286977aac72a` | [`kepano/flexoki`](https://github.com/kepano/flexoki/blob/8d723bac4a9ac46adfdf99d42155286977aac72a/LICENSE) | `Flexoki-8d723bac-LICENSE.txt` |
| Vitesse Theme | adapted theme data; license snapshot `2862595c3d5d05fabfd5aeb50bcbb79ea2f8d85f` | [`antfu/vscode-theme-vitesse`](https://github.com/antfu/vscode-theme-vitesse/blob/2862595c3d5d05fabfd5aeb50bcbb79ea2f8d85f/LICENSE.md) | `Vitesse-2862595c-LICENSE.txt` |
| Remix Icon | React package `4.9.0` | [`Remix-Design/RemixIcon@v4.9.0`](https://github.com/Remix-Design/RemixIcon/blob/v4.9.0/License) | `Remix-Icon-4.9.0-LICENSE.txt` |

OpenCode and the UI assets retain their component-specific notices. The
Apache License 2.0 text is shared because the pinned sherpa-onnx and
cloudflared revisions distribute the same standard license text and neither
revision contains a separate root `NOTICE` file.
