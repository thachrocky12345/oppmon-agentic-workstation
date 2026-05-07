# create-oppmon

Bootstrap a new [OppMon AI Gateway](https://github.com/thachrocky12345/oppmon-agentic-workstation) workstation in one command.

## Usage

```bash
npx create-oppmon
# or
npx create-oppmon my-gateway
```

That's it. The script will:

1. Clone the OppMon monorepo into `my-gateway/`
2. Detach `.git` so the project is yours
3. Copy `.env.example` → `.env` for root, API, and web
4. Optionally prompt for `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` and write them to `apps/api/.env`
5. Run `pnpm install`
6. Start the dev database with `docker compose up -d db`
7. Print next steps

## Options

```bash
npx create-oppmon my-gateway --branch dev      # use the dev branch
npx create-oppmon my-gateway --no-install      # skip pnpm install
npx create-oppmon my-gateway --no-docker       # skip docker compose up
npx create-oppmon --help
```

## Requirements

- Node 18+
- git
- pnpm (recommended; the workspace needs it for dev scripts)
- Docker Desktop (optional but recommended; needed for the local Postgres + pgvector)

## After bootstrap

```bash
cd my-gateway
pnpm db:push       # apply Prisma schema
pnpm db:seed       # seed sample data
pnpm dev           # start api + web together
```

Open http://localhost:3002 for the web UI; API is on http://localhost:3001.

## License

[MIT](./LICENSE)
