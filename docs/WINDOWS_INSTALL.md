# Install OpenDeputy on Windows

## Requirements

- Windows 10 or Windows 11, x64.
- An internet connection for provider sign-in and model requests.
- An OpenCode-compatible provider account or API key.

## Install

1. Download `OpenDeputy-<version>-win-x64.exe` and `SHA256SUMS.txt` from the same GitHub release.
2. In PowerShell, run `Get-FileHash .\OpenDeputy-<version>-win-x64.exe -Algorithm SHA256` and compare the result.
3. Run the installer. An unsigned release candidate may show a Windows SmartScreen warning.
4. Start OpenDeputy. The bundled OpenCode service starts automatically.
5. Open **Settings → Providers**, connect a provider, then choose a model in chat.

The installer already contains Electron, OpenCode CLI, Open Computer Use, the portable TouchPoint/Python runtime, the web interface, eight enabled managed MCPs, and four managed skills. OpenCode contributes the fifth built-in skill. Do not install those components separately. Open Browser Use still requires its Chrome extension to be installed and connected before it can control the user's real Chrome profile.

## If startup fails

- Restart OpenDeputy once after an update.
- Open the first-run advanced section only if the bundled OpenCode CLI cannot start; a custom native `opencode.exe` path is a recovery option.
- Review logs under the Windows application log directory for OpenDeputy.
- Reinstall the same version if a packaged resource is missing.

Provider/model names and availability come from the provider. OpenDeputy can send Persian and other Unicode text, but response quality and language support depend on the selected model.
