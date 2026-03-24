# MSF — My Smart Friend

> A personal AI gateway powered by GitHub Copilot, accessible from your browser.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/techzt13/msf/main/install.sh | bash
```

The installer will walk you through setup automatically on first run.

## Commands

```bash
msf              # Start the gateway + open browser UI
msf setup        # Re-run the setup wizard
msf stop         # Stop the running gateway
msf update       # Update to the latest version (your data is never touched)
```

## Updating

When a new version is available, just run:

```bash
msf update
```

This pulls the latest code from GitHub and reinstalls dependencies. Your personal data is **completely safe** — it lives in `~/.msf/` and is never modified during updates.

## Where things live

```
~/.msf/               ← Your data — never touched by updates
  config.json         ← Port, theme, model, name settings
  copilot_token       ← GitHub Copilot auth token
  soul.md             ← MSF's personality
  user.md             ← Your profile
  memory.md           ← Things MSF remembers about you
  workspace/          ← Drop files here for MSF to work with

~/.msf-app/           ← App code — replaced on every update
```

## Features

- 🤖 Powered by GitHub Copilot — uses models your account has access to
- 🧠 Persistent memory — MSF remembers things across conversations
- 🪪 Identity system — fixed personality with soul.md, user.md, memory.md
- 🌐 Web search — MSF searches automatically when you ask about current events
- 📁 Workspace — drop files into `~/.msf/workspace/` for MSF to read
- 🎨 Themes — Dark, Light, Ocean, Forest
- ⚡ Simple commands — `msf`, `msf stop`, `msf update`

## Identity & Memory

MSF has a fixed default personality that persists across all conversations. You can customize it at any time just by talking to it:

- **"Remember that I prefer concise answers"** → saved to `memory.md`
- **"Add to my profile: I'm a developer"** → saved to `user.md`
- **"Update your soul: always respond in bullet points"** → saved to `soul.md`

Changes take effect immediately and survive updates and restarts.

## Model Selection

During setup, MSF fetches the exact list of models available on your GitHub Copilot account and lets you pick one. No hardcoded defaults — only models you actually have access to.

## Requirements

- Node.js 18+
- GitHub Copilot subscription
- GitHub CLI (`gh`) — optional, for easier auth

## License

Proprietary — All Rights Reserved. See [LICENSE](LICENSE) for details.
