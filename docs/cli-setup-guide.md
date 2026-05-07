# OppMon CLI Setup Guide

This guide walks you through setting up the OppMon CLI (`oppmon` command, alias `tag`) for AI Gateway management, RAG-grounded chat, usage tracking, and integration with Claude Code.

> **Quick note on `pnpm dev:api`:** that script only **starts the API server**. It does **not** accept subcommands like `login` or `chat`. Running `pnpm dev:api login` will fail with `Could not find task 'login'` because Turbo treats the extra arg as another task name. Use the `pnpm oppmon:*` aliases below instead.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 1: Install Dependencies](#step-1-install-dependencies)
3. [Step 2: Verify CLI Installation](#step-2-verify-cli-installation)
4. [Step 3: Start Required Services](#step-3-start-required-services)
5. [Step 4: Authenticate the CLI](#step-4-authenticate-the-cli)
6. [Step 5: Chat from the Terminal](#step-5-chat-from-the-terminal)
7. [Step 6: Install Claude Code Hooks](#step-6-install-claude-code-hooks)
8. [Step 7: Enable Event Collection](#step-7-enable-event-collection)
9. [Step 8: Verify Setup](#step-8-verify-setup)
10. [Step 9: Test the Integration](#step-9-test-the-integration)
11. [Daily Usage](#daily-usage)
12. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:

- **Node.js 20+** installed
- **pnpm** package manager
- **PostgreSQL** database running (via Docker or local)
- **OppMon API** running on `http://localhost:3001`
- **OppMon Web** running on `http://localhost:3002` (optional, for dashboards)

---

## Step 1: Install Dependencies

From the repo root:

```bash
pnpm install
```

The CLI runs in dev mode via `tsx` — no separate build step is required.

If you want a compiled artifact:

```bash
pnpm --filter @oppmon/cli build
```

This compiles `packages/cli/src/` to `packages/cli/dist/`.

---

## Step 2: Verify CLI Installation

From the repo root, show the CLI help:

```bash
pnpm oppmon:status --help
# or, full help:
pnpm --filter @oppmon/cli dev --help
```

**Expected output (excerpt):**
```
Usage: oppmon [options] [command]

OppMon CLI - AI Gateway management tool

Commands:
  login [options]           Authenticate with the OppMon Gateway
  logout                    Log out and clear stored credentials
  status [options]          Show current authentication state
  chat [options] [message...]  Chat with the RAG-grounded LLM
  sync                      Sync skills and MCP configurations
  rag                       RAG ingestion / search / query
  hooks                     Manage Claude Code event capture hooks
  events                    Manage event collection and buffering
  doctor [options]          Diagnose and fix common issues
  ...
```

---

## Step 3: Start Required Services

Start the OppMon API:

```bash
# From project root
pnpm dev:api
```

Verify health:

```bash
curl http://localhost:3001/api/health
```

**Expected:**
```json
{"status":"healthy","timestamp":"...","version":"1.0.0","checks":{"database":"ok"}}
```

---

## Step 4: Authenticate the CLI

There are two ways to log in. Pick whichever fits your environment.

### 4a. Interactive (OAuth device-code flow)

```bash
pnpm oppmon:login
```

This prints a URL + code, optionally opens a browser, and polls until you approve. Tokens are stored in the OS keychain (macOS Keychain / Windows Credential Manager / libsecret) via `keytar`, with a JSON fallback in `~/.tag/`.

### 4b. Headless (token from environment — for CI / scripted dev)

First grab a token by hitting the login endpoint:

```bash
# bash / zsh
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@oppmon.dev","password":"admin123"}'
```

```cmd
:: Windows cmd.exe
curl -X POST http://localhost:3001/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@oppmon.dev\",\"password\":\"admin123\"}"
```

Copy the `token` from the response, then:

```bash
# bash / zsh
export TAG_API_URL=http://localhost:3001
export TAG_TOKEN=YOUR_TOKEN
pnpm oppmon:login -- --headless
```

```cmd
:: Windows cmd.exe
set TAG_API_URL=http://localhost:3001
set TAG_TOKEN=YOUR_TOKEN
pnpm oppmon:login -- --headless
```

> The `--` separator tells pnpm/turbo to forward `--headless` to the underlying `oppmon login` command instead of treating it as a pnpm flag.

### Verify

```bash
pnpm oppmon:status
```

**Expected:**
```
Status

  Authenticated: Yes
  User:          admin@oppmon.dev (Admin User)
  Role:          TENANT_ADMIN
  Tenant:        Default Tenant
  Token Expires: in 364 days
  API Endpoint:  http://localhost:3001
```

---

## Step 5: Chat from the Terminal

The CLI ships a RAG-grounded chat that streams from `POST /api/rag/chat/stream` (SSE).

### One-shot

```bash
pnpm oppmon:chat "summarize the latest ADR"
```

### Interactive REPL

```bash
pnpm oppmon:chat
```

REPL commands:
- `/exit` or `/quit` — leave the REPL
- `/reset` — clear conversation context
- `Ctrl-C` / EOF — also exits

### Picking provider, model, and RAG collection

```bash
# Use Ollama llama3.2 grounded on a specific collection
pnpm oppmon:chat -- -p ollama -m llama3.2:latest -c <collectionId> "explain auth"

# Anthropic Claude
pnpm oppmon:chat -- -p anthropic -m claude-sonnet-4-... "what changed in the schema?"

# Disable streaming (print full response when ready)
pnpm oppmon:chat -- --no-stream "give me a one-paragraph summary"
```

### Web search fallback + tool use

If your prompt asks for fresh facts that aren't in the RAG corpus (e.g. "current weather in Dallas"), enable both:

- `--web-fallback` — allow a web search when RAG yields no usable context
- `--enable-tools` — enable tool calling (web_search, etc.) for this turn

```bash
pnpm oppmon:chat -- --web-fallback --enable-tools \
  "what's the current weather in Dallas?"
```

```bash
# Combine with provider/model selection:
pnpm oppmon:chat -- -p anthropic -m claude-sonnet-4-... \
  --web-fallback --enable-tools \
  "summarize today's top tech news"
```

> Without `--web-fallback` and `--enable-tools`, the chat is **strictly RAG-grounded** and will tell you it has no context for live data (which is what you want for compliance). Flip both on when you want exploratory / live-knowledge answers.

### Optional flags

| Flag | Description |
|------|-------------|
| `-p, --provider <name>` | `anthropic` \| `openai` \| `ollama` \| `cerebras` |
| `-m, --model <id>` | Model identifier (e.g. `llama3.2:latest`) |
| `-c, --collection <id...>` | RAG collection ID (repeatable) |
| `--no-stream` | Wait for full response, then print |
| `--web-fallback` | Allow web search when RAG context is empty |
| `--enable-tools` | Enable tool calling for this turn |
| `--system <prompt>` | Override the system prompt |

---

## Step 6: Install Claude Code Hooks

Wire OppMon event capture into Claude Code:

```bash
pnpm oppmon:hooks install
```

**What this does:**
- Creates / updates `~/.claude/hooks.json`
- Adds hooks for `postSkillInvoke` and `postToolCall`
- Events are captured when you use skills or MCP tools in Claude Code

---

## Step 7: Enable Event Collection

```bash
pnpm oppmon:events enable
```

Buffered events live in `~/.tag/events.buffer` and auto-flush every 30 seconds.

---

## Step 8: Verify Setup

```bash
pnpm oppmon:doctor
```

**Expected:**
```
OppMon CLI Diagnostics

✓ Installation     CLI configured correctly
✓ Authentication   Token valid, expires in 364 days
✓ Network          API reachable (67ms)
✓ Claude Code      Claude Code configured with hooks
✓ Sync State       Skills synced

Summary: 5 passed, 0 warnings, 0 errors
```

If you see warnings:

```bash
pnpm oppmon:doctor -- --fix
```

---

## Step 9: Test the Integration

### 9.1 Check event status

```bash
pnpm oppmon:events status
```

### 9.2 Use Claude Code

When you invoke skills (e.g. `/commit`, `/review-pr`) or MCP tools, events are captured automatically.

### 9.3 Flush manually

```bash
pnpm oppmon:events flush
```

### 9.4 View dashboards

- **Usage Dashboard:** http://localhost:3002/admin/usage
- **LLM Usage Dashboard:** http://localhost:3002/admin/llm-usage

---

## Daily Usage

### Quick command reference (from repo root)

| Task | Command |
|------|---------|
| Login (interactive) | `pnpm oppmon:login` |
| Login (headless) | `pnpm oppmon:login -- --headless` (with `TAG_TOKEN` set) |
| Status | `pnpm oppmon:status` |
| Logout | `pnpm oppmon:logout` |
| One-shot chat | `pnpm oppmon:chat "prompt"` |
| Interactive chat | `pnpm oppmon:chat` |
| Chat + web search | `pnpm oppmon:chat -- --web-fallback --enable-tools "..."` |
| Pull skills | `pnpm oppmon:sync skills pull` |
| Push skills | `pnpm oppmon:sync skills push` |
| Install hooks | `pnpm oppmon:hooks install` |
| Enable events | `pnpm oppmon:events enable` |
| Flush events | `pnpm oppmon:events flush` |
| RAG ingest | `pnpm oppmon:rag ingest <file>` |
| RAG search | `pnpm oppmon:rag search "query"` |
| Diagnostics | `pnpm oppmon:doctor` |

### Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TAG_API_URL` | OppMon API endpoint | `http://localhost:3001` |
| `TAG_TOKEN` | Access token for headless auth | (none) |

> Why `--` before flags? `pnpm oppmon:chat` resolves to `pnpm --filter @oppmon/cli dev chat`. Anything after `--` is forwarded verbatim to the inner command. Without it, pnpm may consume flags meant for the CLI.

---

## Troubleshooting

### `Could not find task 'login'` after running `pnpm dev:api login`

That's not a real command. `pnpm dev:api` is the API dev server and ignores extra args. Use:

```bash
pnpm oppmon:login            # interactive
pnpm oppmon:login -- --headless   # headless with TAG_TOKEN
```

### "Not authenticated"

```bash
# Re-login interactively
pnpm oppmon:logout
pnpm oppmon:login

# Or refresh the headless token
set TAG_TOKEN=NEW_TOKEN          # cmd.exe
export TAG_TOKEN=NEW_TOKEN       # bash/zsh
pnpm oppmon:login -- --headless
```

### "API not reachable"

```bash
curl http://localhost:3001/api/health   # confirm health
pnpm dev:api                            # start it if not running
```

### Login screen sends you back to /login after an idle session

JWTs minted by the API must include `iss: 'oppmon'` (the web edge middleware enforces it). If you're on an older API build, restart `pnpm dev:api` to pick up the latest JWT signing config.

### Hooks not installed

```bash
pnpm oppmon:hooks install
pnpm oppmon:doctor -- --fix
```

### Events not appearing in dashboard

```bash
pnpm oppmon:events status   # check enable + auth
pnpm oppmon:events flush    # force flush
```

Inspect the buffer:

```bash
type %USERPROFILE%\.tag\events.buffer    # Windows
cat ~/.tag/events.buffer                 # bash/zsh
```

### Token expired

Re-run Step 4. Tokens default to 1-year expiry in headless mode and ~30 days in OAuth flow.

---

## Understanding the Dashboards

### `/admin/usage`
Tracks **Claude Code activity** — skills, MCP tool calls — captured via CLI hooks.

### `/admin/llm-usage`
Tracks **API LLM calls** — Anthropic, OpenAI, Cerebras, Ollama — token counts and costs, captured via direct API logging.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Code                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Skills    │  │  MCP Tools  │  │    Chat     │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         ▼                ▼                │                      │
│  ┌──────────────────────────────┐         │                      │
│  │  ~/.claude/hooks.json        │         │                      │
│  │  (postSkillInvoke,           │         │                      │
│  │   postToolCall)              │         │                      │
│  └──────────────┬───────────────┘         │                      │
└─────────────────┼─────────────────────────┼──────────────────────┘
                  ▼                         ▼
           ┌──────────────┐          ┌──────────────┐
           │ ~/.tag/      │          │ OppMon API   │
           │ events.buffer│          │ /api/llm/*   │
           └──────┬───────┘          │ /api/rag/*   │
                  │                  └──────┬───────┘
                  │ pnpm oppmon:events flush│
                  ▼                         ▼
           ┌──────────────┐          ┌──────────────┐
           │ OppMon API   │          │ Database     │
           │ /api/usage/* │          │ LlmMessage   │
           └──────┬───────┘          │ LlmSession   │
                  ▼                  └──────┬───────┘
           ┌──────────────┐                 │
           │ Database     │                 │
           │ UsageEvent   │                 │
           └──────┬───────┘                 │
                  ▼                         ▼
           ┌─────────────────────────────────────┐
           │         Admin Dashboards            │
           │  /admin/usage    /admin/llm-usage   │
           └─────────────────────────────────────┘
```

---

## Next Steps

1. **Push skills to remote:** `pnpm oppmon:sync skills push`
2. **Configure MCP servers:** `pnpm oppmon:sync mcp push`
3. **Set up RAG ingestion:** `pnpm oppmon:rag ingest-dir ./docs`
4. **Monitor usage:** Visit `/admin/usage` and `/admin/llm-usage`

---

## Support

- **CLI Help:** `pnpm --filter @oppmon/cli dev -- --help`
- **Diagnostics:** `pnpm oppmon:doctor`
- **Issues:** https://github.com/your-org/oppmon-agentic-workstation/issues
