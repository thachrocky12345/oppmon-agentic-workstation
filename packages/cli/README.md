# @arkon/cli

Command-line interface for the Arkon AI Gateway platform.

## Installation

```bash
# Install globally
npm install -g @arkon/cli

# Or run directly with npx
npx @arkon/cli --help
```

## Quick Start

```bash
# 1. Authenticate with your Arkon account
tag login

# 2. Initialize a project
tag init

# 3. Sync skills from your team
tag sync skills pull

# 4. Check status
tag status
```

## Commands

### Authentication

```bash
tag login                # Authenticate with OAuth device flow
tag login --headless     # Authenticate using TAG_TOKEN env var
tag logout               # Clear stored credentials
tag status               # Show current auth status
```

### Project Setup

```bash
tag init                 # Interactive project setup wizard
tag init --team my-team  # Initialize with specific team
tag init --yes           # Accept all defaults (non-interactive)
```

### Skills Sync

```bash
tag sync skills list     # Show sync status of all skills
tag sync skills push     # Push all local skills to remote
tag sync skills pull     # Pull all remote skills to local
```

### MCP Servers

```bash
tag sync mcp list        # Show MCP server sync status
tag sync mcp push        # Push local MCP servers to remote
tag sync mcp pull        # Pull remote MCP servers to local
```

### RAG Ingestion

```bash
tag rag ingest FILE      # Ingest a single document
tag rag ingest-dir DIR   # Ingest all documents in directory
tag rag search "query"   # Semantic search across embeddings
tag rag query "question" # Full RAG query with LLM response
tag rag list             # List all embeddings
tag rag stats            # Show embedding statistics
```

### Event Collection

```bash
tag hooks install        # Install Claude Code event hook
tag hooks uninstall      # Remove event hook
tag hooks status         # Check hook installation
tag events enable        # Enable event collection
tag events disable       # Disable event collection
tag events status        # Show event collection status
```

### Diagnostics

```bash
tag doctor               # Run all diagnostic checks
tag doctor auth          # Check authentication only
tag doctor network       # Check API connectivity
tag doctor claude        # Check Claude Code integration
tag doctor sync          # Check sync state
tag doctor --fix         # Attempt to auto-fix issues
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TAG_API_URL` | API endpoint URL | `http://localhost:3001` |
| `TAG_TOKEN` | Access token for headless auth | - |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error |
| 2 | Authentication required |

## Troubleshooting

### Connection refused

If you see "ECONNREFUSED" errors:

1. Make sure the API server is running
2. Check `TAG_API_URL` is set correctly
3. Run `tag doctor network` for diagnostics

### Authentication issues

If you see "Unauthorized" or "401" errors:

1. Run `tag login` to re-authenticate
2. Check if your token has expired with `tag status`
3. Run `tag doctor auth` for diagnostics

### Sync issues

If sync commands fail:

1. Run `tag doctor sync` to check state
2. Use `tag doctor --fix` to repair corrupted state
3. Check network connectivity with `tag doctor network`

## Development

```bash
# Build
pnpm build

# Run locally
node dist/index.js --help

# Run tests
pnpm test
```
