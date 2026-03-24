# MSF — My Smart Friend

> A personal AI gateway powered by GitHub Copilot, accessible from your terminal or browser.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/msf/main/install.sh | bash
```

## Usage

```bash
# Start the MSF gateway (always-running web UI)
msf

# Or run setup again
msf setup
```

Then open your browser at `http://localhost:3000`

## Features

- 🤖 GitHub Copilot as your AI backend
- 🌐 Always-running web gateway UI
- ⚡ Terminal launcher — just type `msf`
- 🎨 Modern terminal setup wizard
- 🔐 Secure local config storage

## Requirements

- Node.js 18+
- GitHub Copilot subscription
- GitHub CLI (`gh`) — for auth

## How it works

1. Run the install script
2. A beautiful TUI setup wizard walks you through GitHub Copilot auth
3. The gateway starts as a local web server
4. Type `msf` anytime to open the UI in your browser

## License

MIT