<img src="docs/icon-readme.png" width="32" height="32" alt="CodePilot" style="vertical-align: middle; margin-right: 8px;" /> CodePilot
===

**A unified desktop client for Claude Code** -- multi-provider support, MCP extensions, custom skills, cross-platform bridge, and an assistant workspace that understands your projects.

[![GitHub release](https://img.shields.io/github/v/release/op7418/CodePilot)](https://github.com/op7418/CodePilot/releases)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)](https://github.com/op7418/CodePilot/releases)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[中文文档](./README_CN.md) | [日本語](./README_JA.md)

![CodePilot](docs/screenshot.png)

---

[Download](#platform--installation) | [Quick Start](#quick-start) | [Documentation](#documentation) | [Contributing](#contributing) | [Community](#community)

---

## Why CodePilot

**Multi-provider, one interface.** Connect to Anthropic, OpenRouter, Bedrock, Vertex, or any custom endpoint. Switch providers and models mid-conversation without losing context.

**MCP + Skills extensibility.** Add MCP servers (stdio / sse / http) with runtime status monitoring. Define reusable prompt-based skills -- global or per-project -- and invoke them as slash commands. Browse and install community skills from skills.sh.

**Control from anywhere.** Bridge connects CodePilot to Telegram, Feishu, Discord, and QQ. Send a message from your phone, get the response on your desktop.

**An assistant that knows your project.** The .assistant workspace stores persona files, onboarding flows, daily check-ins, and persistent memory. Claude adapts to your project's conventions over time.

**Built for daily use.** Pause, resume, and rewind sessions to any checkpoint. Work in split-screen with two conversations side by side. Track token usage and costs. Import CLI session history. Switch between dark and light themes.

---

## Quick Start

### Path A: Download a release (most users)

1. Install the Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
2. Authenticate: `claude login`
3. Download the installer for your platform from the [Releases](https://github.com/op7418/CodePilot/releases) page
4. Launch CodePilot

### Path B: Build from source (developers)

| Prerequisite | Minimum version |
|---|---|
| Node.js | 18+ |
| Claude Code CLI | Installed and authenticated |
| npm | 9+ (ships with Node 18) |

```bash
git clone https://github.com/op7418/CodePilot.git
cd CodePilot
npm install
npm run dev              # browser mode at http://localhost:3000
# -- or --
npm run electron:dev     # full desktop app
```

---

## First Launch

1. **Authenticate Claude** -- Run `claude login` in your terminal if you haven't already.
2. **Configure a Provider** -- Open Settings > Providers. Add an API key or use the CLI's default authentication.
3. **Create a conversation** -- Pick a working directory, select a mode (Code / Plan / Ask), and choose a model.
4. **Set up Assistant Workspace** (optional) -- Enable Onboarding, daily check-ins, and persona files under the .assistant directory.
5. **Add MCP servers** (optional) -- Go to the Extensions page to connect external tools and services.

---

## Core Capabilities

### Conversation & Coding

| Capability | Details |
|---|---|
| Interaction modes | Code / Plan / Ask |
| Reasoning effort | Low / Medium / High / Max + Thinking mode |
| Permission control | Default / Full Access, per-action approval |
| Session control | Pause, resume, rewind to checkpoint, archive |
| Model switching | Change model mid-conversation |
| Split screen | Side-by-side dual sessions |
| Attachments | Files and images with multimodal vision support |
| Slash commands | /help /clear /cost /compact /doctor /review and more |

### Extensions & Integrations

| Capability | Details |
|---|---|
| Providers | Anthropic / OpenRouter / Bedrock / Vertex / custom endpoints |
| MCP servers | stdio / sse / http, runtime status monitoring |
| Skills | Custom / project / global skills, skills.sh marketplace |
| Bridge | Telegram / Feishu / Discord / QQ remote control |
| CLI import | Import Claude Code CLI .jsonl session history |
| Image generation | Gemini / Anthropic image gen, batch tasks, gallery |

### Data & Workspace

| Capability | Details |
|---|---|
| Assistant Workspace | .assistant directory, persona, onboarding, check-in, memory |
| File browser | Project file tree with syntax-highlighted preview |
| Usage analytics | Token counts, cost estimates, daily usage charts |
| Local storage | SQLite (WAL mode), all data stays on your machine |
| i18n | English + Chinese |
| Themes | Dark / Light, one-click toggle |

---

## Platform & Installation

| Platform | Format | Architecture |
|---|---|---|
| macOS | .dmg | arm64 (Apple Silicon) + x64 (Intel) |
| Windows | .exe (NSIS) | x64 + arm64 |
| Linux | .AppImage / .deb / .rpm | x64 + arm64 |

Download from the [Releases](https://github.com/op7418/CodePilot/releases) page.

CodePilot is not code-signed yet, so your OS will show a security warning on first launch.

<details>
<summary>macOS: "Apple cannot check it for malicious software"</summary>

**Option 1** -- Right-click `CodePilot.app` in Finder > Open > confirm.

**Option 2** -- System Settings > Privacy & Security > scroll to Security > click Open Anyway.

**Option 3** -- Run in Terminal:
```bash
xattr -cr /Applications/CodePilot.app
```
</details>

<details>
<summary>Windows: SmartScreen blocks the installer</summary>

**Option 1** -- Click "More info" on the SmartScreen dialog, then "Run anyway".

**Option 2** -- Settings > Apps > Advanced app settings > set App Install Control to allow apps from anywhere.
</details>

---

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) -- Architecture, tech stack, directory structure, data flow
- [docs/handover/](./docs/handover/) -- Design decisions and handover documents
- [docs/exec-plans/](./docs/exec-plans/) -- Execution plans and tech debt tracker

---

## Community

<img src="docs/wechat-group-qr.png" width="240" alt="WeChat Group QR Code" />

Scan the QR code to join the WeChat user group for discussions, feedback, and updates.

- [GitHub Issues](https://github.com/op7418/CodePilot/issues) -- Bug reports and feature requests
- [GitHub Discussions](https://github.com/op7418/CodePilot/discussions) -- Questions and general discussion

---

## Contributing

1. Fork the repository and create a feature branch
2. `npm install` and `npm run electron:dev` to develop locally
3. Run `npm run test` before opening a PR
4. Submit a PR against `main` with a clear description

Keep PRs focused -- one feature or fix per pull request.

<details>
<summary>Development commands</summary>

```bash
npm run dev                    # Next.js dev server (browser)
npm run electron:dev           # Full Electron app (dev mode)
npm run build                  # Production build
npm run electron:build         # Build Electron distributable
npm run electron:pack:mac      # macOS DMG (arm64 + x64)
npm run electron:pack:win      # Windows NSIS installer
npm run electron:pack:linux    # Linux AppImage, deb, rpm
```

**CI/CD:** Pushing a `v*` tag triggers a full multi-platform build and creates a GitHub Release automatically.

**Notes:**
- Electron forks a Next.js standalone server on `127.0.0.1` with a random free port
- Chat data is stored in `~/.codepilot/codepilot.db` (dev mode: `./data/`)
- SQLite uses WAL mode for fast concurrent reads
</details>

---

## License

MIT
