# Team AI Gateway — 28-Day Solo Build Plan

**Stack**: TypeScript end-to-end. Next.js (App Router) + Node + Postgres (with pgvector) + Drizzle ORM + Tailwind + shadcn/ui. Anthropic SDK via Vercel AI SDK for week-1 LLM hooks. Multi-cloud model routing (Bedrock/Azure/Ollama) deferred to v2 via LiteLLM.

**Build agent**: Claude Code (terminal).

**Project name placeholder**: `tag` (Team AI Gateway). Rename later if you like ContextHub better.

**Repo layout** (decided day 1, never revisited):
```
tag/
├── apps/
│   ├── api/           # Next.js API routes (or standalone Hono — see day 1)
│   └── web/           # Next.js admin UI
├── packages/
│   ├── cli/           # @tag/cli — the `tag` command
│   ├── shared/        # types, zod schemas, manifest spec
│   └── rag-mcp/       # reference RAG MCP server
├── docs/
│   ├── manifest-spec.md
│   └── onboarding.md
└── docker-compose.yml # postgres + pgvector for local dev
```

**The non-negotiable rules**:
1. Tests for cross-tenant isolation written *before* the feature, not after.
2. Audit log every registry mutation from day 1.
3. End every day by running the review prompt. Don't skip it because you're tired.
4. Sundays off. Real rule. Burnout kills more solo projects than bugs.
5. If a day's "complete means" isn't met, do not start the next day. Fix or descope.

---

## Week 1 — Foundation

### Day 1 (Mon) — Repo + DB + auth shell

**Complete means**:
- Monorepo created with pnpm workspaces, all four packages stubbed.
- Postgres with pgvector running locally via docker-compose.
- Drizzle schema written for: `tenants`, `users`, `teams`, `team_members`, `audit_log`. Migrations applied cleanly to a fresh DB.
- GitHub OAuth callback works end-to-end: clicking "Login with GitHub" creates or finds a user, returns a JWT.
- A protected `GET /api/me` returns the authenticated user's tenant and teams.
- `pnpm dev` starts the whole stack. README has 3 commands to get running.

**Start prompt** (paste into Claude Code in the empty `tag/` directory):
> I'm building Team AI Gateway — a permission-aware registry for AI skills, MCP servers, and RAG endpoints, primarily targeting Claude Code users in teams. Today is day 1 of a 28-day solo build. Set up the monorepo with pnpm workspaces. Use Next.js 15 App Router for both `apps/api` and `apps/web` (separate apps, share types via `packages/shared`). Postgres with pgvector via docker-compose. Drizzle ORM. Set up GitHub OAuth using Auth.js (NextAuth) — store users in our DB, issue our own JWTs for the CLI to use later. Create the schema for tenants, users, teams, team_members (with roles: tenant_admin, team_admin, member), and audit_log. Every audit_log entry needs actor_user_id, tenant_id, action, resource_type, resource_id, before_json, after_json, created_at. Write the migration, apply it. Build a `GET /api/me` route that returns the user with their tenant and team memberships. Don't build any registry endpoints yet — that's day 2. By end of day I want `pnpm dev` to start everything and me to be able to log in with GitHub.

**Review prompt** (paste at end of day):
> Review what we built today against the day-1 complete criteria: monorepo structure, docker-compose with pgvector, Drizzle schema for tenants/users/teams/team_members/audit_log, GitHub OAuth working, /api/me returning user+tenant+teams, README with 3 setup commands. For each item, tell me: is it actually done, partially done, or skipped? List anything you cut corners on. Then run a fresh-clone test mentally: if I deleted node_modules and the database right now, would `pnpm install && docker compose up && pnpm dev` get me back to working? If not, what would break?

---

### Day 2 (Tue) — Registry CRUD for skills

**Complete means**:
- Schema added: `skills` table with `id, tenant_id, scope (enum: tenant/team), team_id (nullable), name, version, description, manifest_json, bundle_url, enabled, created_by, created_at, updated_at`.
- Endpoints: `POST /api/skills`, `GET /api/skills` (returns scoped list), `GET /api/skills/:id`, `PATCH /api/skills/:id`, `DELETE /api/skills/:id`. All write actions log to `audit_log`.
- RBAC middleware enforces: tenant_admin can do anything in tenant; team_admin can manage team-scoped skills for their teams; member can only read.
- Zod validation on all inputs in `packages/shared`.
- Manifest format documented at `docs/manifest-spec.md` — fields: `name`, `version` (semver), `description`, `entry`, `requires`, `signed_sha256`.

**Start prompt**:
> Day 2. Today: skill registry CRUD. Add the `skills` table to the Drizzle schema with id, tenant_id, scope ('tenant'|'team'), team_id (nullable, only set when scope='team'), name, version (semver string), description, manifest_json (jsonb), bundle_url, enabled (boolean default true), created_by, created_at, updated_at. Migrate. Build five endpoints under /api/skills: list (filtered by tenant + caller's team memberships), get one, create, update, delete (soft delete preferred — add deleted_at). Every mutation writes to audit_log with before/after json. Implement RBAC middleware that reads the JWT, looks up role, and enforces: tenant_admin all-access in their tenant; team_admin can CRUD skills scoped to teams they admin; member read-only. Validate every input with zod schemas defined in packages/shared. Write the manifest spec to docs/manifest-spec.md — fields: name, version, description, entry, requires (array), signed_sha256. Write integration tests for the RBAC rules — at least the negative cases (member trying to write, team_admin from team A trying to edit team B's skill).

**Review prompt**:
> Review day 2 against complete criteria. Critical questions: (1) Does the list endpoint actually scope correctly? Run through this scenario in code: tenant T has teams A and B. Skill X is scoped to team A. User U is a member of team B in tenant T. When U calls GET /api/skills, is X excluded? Show me the SQL or query that proves it. (2) Does every write hit audit_log, including failed attempts? (3) Are the RBAC negative tests actually testing forbidden cases or just the happy path? (4) Is the manifest spec written down somewhere I can reference next week, or only in code?

---

### Day 3 (Wed) — Registry CRUD for MCP servers + bundle storage

**Complete means**:
- `mcp_servers` table: `id, tenant_id, scope, team_id, name, url, transport (enum: http/sse/stdio), auth_method (enum: none/bearer/oauth), description, enabled, created_*, updated_*`. Same RBAC + audit pattern as skills.
- Bundle upload working: `POST /api/skills/:id/bundle` accepts a tarball, stores it (local disk for dev, S3-compatible for prod — use a single abstraction), computes sha256, updates `bundle_url` and `manifest.signed_sha256`.
- Bundle download: `GET /api/skills/:id/bundle` returns the tarball, gated by RBAC + scope check.
- A test that uploads a tarball, downloads it, verifies sha256 round-trip.

**Start prompt**:
> Day 3. Two parts: (1) MCP server registry — same shape as skills. Add `mcp_servers` table with id, tenant_id, scope, team_id, name, url, transport ('http'|'sse'|'stdio'), auth_method ('none'|'bearer'|'oauth'), description, enabled, timestamps. Build the same five CRUD endpoints under /api/mcp-servers, same RBAC middleware, same audit logging. (2) Bundle storage for skills. Create a storage abstraction in packages/shared with two implementations: local-disk (for dev) and s3-compatible (for prod, use the AWS SDK v3 with an endpoint override so it works with MinIO or Cloudflare R2). Add POST /api/skills/:id/bundle that accepts multipart upload of a tarball, computes sha256, stores it, updates the skill's bundle_url and manifest.signed_sha256. Add GET /api/skills/:id/bundle that streams the tarball back, RBAC-gated. Write a test that uploads, downloads, and verifies the sha256 matches. Don't worry about signing yet — that's v2.

**Review prompt**:
> Review day 3. Specific checks: (1) Is the storage abstraction actually swappable, or did S3 details leak into the API layer? Show me the interface. (2) When a tarball is uploaded, is the file size limited? What happens if I upload 10GB? (3) Does the download endpoint enforce the same RBAC as the metadata endpoint, or is there a path where someone who can't see the skill can still download its bundle? (4) Is sha256 verified on download or only computed on upload? (5) Are MCP server URLs validated — could someone register `file:///etc/passwd` as a URL and have the CLI fetch it later?

---

### Day 4 (Thu) — RAG MCP server scaffold + ingestion

**Complete means**:
- `packages/rag-mcp` is a working HTTP MCP server (use the `@modelcontextprotocol/sdk` TypeScript package).
- It exposes one tool: `search_docs(query: string, top_k?: number)`.
- Schema added: `rag_documents` (id, tenant_id, source, title, body, embedding vector(1536), created_at) and `rag_collections` (id, tenant_id, name, scope, team_id).
- An ingestion CLI: `tsx scripts/ingest.ts <collection-name> <path-to-docs/>` reads markdown files, chunks them, generates embeddings (OpenAI text-embedding-3-small for now — cheapest, fine quality), inserts with `tenant_id`.
- The `search_docs` tool validates the JWT, extracts `tenant_id`, and the SQL query has `WHERE tenant_id = $1` enforced — never optional.
- **Cross-tenant isolation test exists and passes**: ingest tenant A's docs, ingest tenant B's docs, query with tenant B's JWT, verify zero tenant A docs returned even when query matches them lexically.

**Start prompt**:
> Day 4. The most security-critical day of the whole project. Build packages/rag-mcp — a standalone HTTP MCP server using @modelcontextprotocol/sdk. It exposes ONE tool: search_docs(query: string, top_k?: number = 5). Schema additions: rag_collections (id, tenant_id, name, scope, team_id, created_at) and rag_documents (id, tenant_id, collection_id, source, title, body, embedding vector(1536), chunk_index, created_at). Migrate. Build scripts/ingest.ts that takes a collection name and a directory, reads all .md files, chunks them at ~800 tokens with 100 token overlap, calls OpenAI text-embedding-3-small, inserts rows with the right tenant_id. The MCP server itself: validates incoming JWTs (same JWT format as the main API), extracts tenant_id, and for every search query runs `SELECT * FROM rag_documents WHERE tenant_id = $1 AND embedding <=> $2 LIMIT $3` — tenant_id is non-negotiable, baked into the query template, never derived from user input. WRITE THE TESTS FIRST: ingest 3 docs into tenant A, ingest 3 into tenant B, run search with tenant B's JWT for a phrase that ONLY appears in tenant A's docs, assert zero results. Run it. Make it pass. Then write the rest.

**Review prompt**:
> Review day 4 with paranoia. (1) Show me the SQL query for search_docs. Is tenant_id pulled from the JWT or anywhere else? Could a malicious query string influence it? (2) Did the cross-tenant isolation test actually run and pass? Show me the output. (3) What happens if the JWT is missing, expired, or malformed? Does it fail closed (no results) or open (all results)? (4) What happens if tenant_id is null in the JWT? (5) Is the embedding API key in env vars and never logged? (6) If I drop the WHERE tenant_id = $1 clause by mistake in a future refactor, do any tests catch it?

---

### Day 5 (Fri) — CLI scaffold: login + status

**Complete means**:
- `packages/cli` is a working CLI installable via `pnpm link` or `npm link`. Binary name: `tag`.
- `tag login` runs GitHub device-flow OAuth, exchanges for a Tag JWT, stores in OS keychain (use `keytar`).
- `tag logout` removes credentials.
- `tag status` shows: logged in user, tenant, teams, current API endpoint, JWT expiry. Pretty terminal output (use `chalk` or similar).
- `tag --help` works and is informative.
- All CLI commands respect a `TAG_API_URL` env var that defaults to `http://localhost:3001`.

**Start prompt**:
> Day 5. The CLI starts taking shape. In packages/cli, set up a TypeScript CLI using commander (or yargs). Binary name: `tag`. Build three commands today: `tag login` does GitHub OAuth device flow — show user the code, poll for completion, exchange GitHub token for our JWT via a new POST /api/auth/cli-exchange endpoint on the API side, store the JWT in OS keychain via keytar (handle the case where keytar isn't available — fall back to ~/.tag/credentials with mode 0600). `tag logout` clears credentials. `tag status` calls /api/me and pretty-prints user, tenant, teams, JWT expiry, API URL. Use chalk for color. Respect TAG_API_URL env var (default http://localhost:3001). Make `tag --help` actually helpful — show examples not just flag lists. Build instructions in packages/cli/README.md so I can `pnpm link` it and run `tag` globally.

**Review prompt**:
> Review day 5. (1) Walk me through what happens if I run `tag login` while already logged in — does it warn me, force re-auth, or silently overwrite? (2) What if keytar fails to install (common on Linux without libsecret)? Does the fallback actually work? (3) If TAG_API_URL points to a server that's down, what does `tag status` show? Hopefully a useful error, not a stack trace. (4) Is the JWT exchange endpoint /api/auth/cli-exchange protected against CSRF or replay? (5) Run `tag --help` and tell me if a new user could figure out what to do next.

---

### Day 6 (Sat) — Buffer day / catch-up / docs

**Complete means**:
- Anything not finished from Mon–Fri is finished.
- `docs/onboarding.md` exists with: prereqs, setup commands, login flow, what to do next. Tested by reading it fresh and following it.
- A 5-minute "did week 1 actually work" smoke test is documented and run end-to-end.

**Start prompt**:
> Day 6 is buffer. Don't start anything new. First, run through every day-1 to day-5 complete criteria and tell me which are actually met versus partially met. Fix the partials. Second, write docs/onboarding.md as if a new developer joined the team today: prereqs (Node version, pnpm, Docker), setup steps, how to log in, how to verify it worked. Third, write a smoke test script at scripts/smoke-week1.sh that: starts docker-compose, runs migrations, starts API, creates a tenant via SQL, creates a user (or tells me to log in), creates a skill via API, uploads a bundle, downloads it back, verifies sha256. Run it. Fix what breaks.

**Review prompt**:
> Week 1 retrospective. Honest answers: (1) What's still partially done from week 1? (2) What did I build that wasn't on the plan? (3) What's the single biggest risk going into week 2 — is the foundation solid enough to put the CLI on top of it? (4) If a friend cloned this repo right now and ran the onboarding doc, would they succeed? (5) How am I feeling — energized, neutral, or burnt? Don't sugarcoat.

---

### Day 7 (Sun) — Off

No prompt. Don't open the laptop. This rule pays for itself by week 3.

---

## Week 2 — The CLI is the product

### Day 8 (Mon) — `tag sync` skills

**Complete means**:
- `tag sync` fetches the caller's entitled skills from `/api/skills`, downloads bundles, extracts to `~/.claude/skills/<skill-name>/` (or `--scope project` to `.claude/skills/`).
- Manifest sha256 is verified before extraction. Mismatch = abort, no partial state.
- A `~/.tag/state.json` tracks installed skills + versions for diff/uninstall later.
- `tag sync --dry-run` shows what would change without doing it.
- Extracted skills are immediately usable by Claude Code (test: cd into a project, run `claude`, ask it about a skill you just synced — it should know).

**Start prompt**:
> Day 8. The flagship command: `tag sync`. It fetches GET /api/skills (returns scoped list), downloads each enabled skill's bundle (tarball), verifies sha256 against the manifest, extracts to ~/.claude/skills/<skill-name>/ by default OR ./.claude/skills/<skill-name>/ if --scope project. Track installed state in ~/.tag/state.json: { skills: { name: { version, sha256, installed_at, scope } } }. Implement --dry-run that prints the action plan but doesn't write files. If sha256 mismatch on any bundle, abort the entire sync — don't leave partial state. If a skill was previously installed but is no longer in the registry response (admin disabled it), remove it from disk. Print a clear summary at the end: "Installed 3 (added: foo, bar, baz). Removed 1 (gone: old-skill)." Test end-to-end: upload a skill via API, run `tag sync`, verify it lands in ~/.claude/skills/, run Claude Code in a project, ask it to use the skill, confirm it works.

**Review prompt**:
> Review day 8. (1) What happens if `tag sync` is interrupted mid-download — Ctrl+C during bundle 2 of 5? Is state.json consistent? (2) If sha256 fails for one bundle, does it really abort everything or does it leave partial files behind? Test by corrupting a bundle on the server. (3) `tag sync --dry-run` — does it actually hit the network or is it fully offline? (4) Did Claude Code pick up the skill without restart? (5) Is the path to ~/.claude/skills/ portable across macOS/Linux/Windows or did we hardcode `/`? (6) What if the user has a skill they put there manually that conflicts with one in the registry?

---

### Day 9 (Tue) — `tag sync` MCP servers + `.mcp.json` writer

**Complete means**:
- `tag sync` also fetches MCP servers and writes them into the project's `.mcp.json` (Claude Code format).
- If `.mcp.json` already exists with non-Tag entries, they're preserved. Tag-managed entries are wrapped in a marker comment block.
- `tag diff` shows current installed state vs registry — what would `sync` do.
- MCP server entries include the right transport config (http/sse/stdio).
- For `auth_method: bearer`, the CLI writes a placeholder for the user's token; for `none`, no auth header.

**Start prompt**:
> Day 9. Extend `tag sync` to also handle MCP servers. Fetch from GET /api/mcp-servers (already RBAC-scoped). For each enabled MCP server, write an entry to .mcp.json in the current directory (the Claude Code project-scoped MCP config format). Critical: if .mcp.json already exists with user-added servers, PRESERVE them. Use a marker convention: tag-managed entries go between `// --- tag managed (do not edit) ---` and `// --- end tag managed ---` comments. On each sync, regenerate only the section between markers. For transport: 'http' → `{ "url": "..." }`, 'sse' → `{ "url": "...", "transport": "sse" }`, 'stdio' → `{ "command": "...", "args": [...] }` (we'll need the API to return command/args for stdio servers — add those columns now if missing). For auth_method 'bearer', use the user's tag JWT as the Authorization header value (this is fine because the MCP server validates it the same way the API does). Add `tag diff` command — shows pending changes without applying. Make sure existing user MCP entries (a server they added by hand, like a personal Postgres MCP) are never touched.

**Review prompt**:
> Review day 9. (1) Create a .mcp.json with a hand-added entry, run `tag sync`, verify the hand-added entry is still there. (2) Run sync twice in a row — is the second sync a no-op or does it churn the file? (3) Is the user's JWT being written into .mcp.json a security concern given .mcp.json gets committed to git? Should we instead reference an env var? Talk through the tradeoff. (4) `tag diff` — does it show MCP changes too, or just skills? (5) For stdio MCP servers, where does the command actually run from — the user's PATH? Are we documenting that?

---

### Day 10 (Wed) — RAG ingestion CLI + admin upload

**Complete means**:
- `tag rag ingest <collection> <path>` (CLI) sends docs to the API, which forwards to the RAG service for embedding + storage.
- Admin UI page (placeholder, will polish week 3): upload markdown files for a collection, see ingest progress.
- A collection is automatically registered as an MCP server entry (`url` pointing to the rag-mcp server with the collection ID), so syncing picks it up.
- Ingestion is idempotent: re-uploading the same file with the same content updates rather than duplicates.

**Start prompt**:
> Day 10. Make RAG actually usable end-to-end. Add `tag rag ingest <collection-name> <path>` to the CLI — uploads files in the path to a new endpoint POST /api/rag/ingest (multipart, with collection name + tenant scope). The API forwards to packages/rag-mcp's ingestion routine — same embedding, chunking, tenant_id stamping as day 4, but now exposed via HTTP. Idempotency: hash each file's content; if same content + same path was ingested before, update timestamps but skip re-embedding. When a new collection is created, automatically insert an mcp_servers row pointing at the rag-mcp service with `?collection=<id>` query param so search_docs can scope to that collection. This means after `tag rag ingest`, the next `tag sync` will pick up the new RAG MCP entry. Build a placeholder admin UI page at /admin/rag — drag-drop file upload, list of collections with doc counts. Don't polish, just functional. Test the full loop: ingest some docs, run `tag sync` in a project, open Claude Code, ask it to search the docs, confirm it works AND that a query for tenant B's content from tenant A's session returns nothing.

**Review prompt**:
> Review day 10. (1) Re-ingest the same file twice — was it deduplicated or did chunks pile up? (2) The auto-registration of MCP server for new collections — what scope does it use (tenant or team)? Is that the right default? (3) The admin upload page — does it work for someone who isn't tenant_admin? Should it? (4) End-to-end test: did Claude Code actually retrieve a doc you ingested 5 minutes earlier? (5) Cross-tenant test still passing after today's changes?

---

### Day 11 (Thu) — `tag init` + project bundles

**Complete means**:
- `tag init` creates a `tag.config.yaml` in the current directory, prompts for team scope, writes `.mcp.json` skeleton.
- `tag.config.yaml` declares: `team: "<team-name>"`, optional `bundles: ["<bundle-name>"]` for v2.
- `tag sync` reads `tag.config.yaml` if present and uses the team scope from it (overrides default which is "all my entitled stuff").
- Adding `tag.config.yaml` and `.mcp.json` to .gitignore is suggested in the init flow (tokens leak risk if committed).

**Start prompt**:
> Day 11. Project-aware sync. `tag init` is interactive: prompts which team this project belongs to (lists teams the user is in), writes tag.config.yaml with `team: <name>` and a commented-out `bundles: []` section (for v2 — bundles aren't built yet, just reserve the syntax). Also creates .mcp.json with the tag-managed marker block. After init, asks if it should add the files to .gitignore — recommend yes for .mcp.json (because it'll contain the JWT) and no for tag.config.yaml (it's just a team reference, safe to commit). Update `tag sync` to read tag.config.yaml if present in cwd: when team is specified, only fetch skills/MCP servers scoped to that team or to the tenant — not to other teams the user happens to be in. This is important because a user might be in 5 teams but in this repo only wants the backend team's tools. Add a test: user in teams A and B, runs `tag init` in a repo with team=A specified, runs sync, verifies team B's skills are NOT installed.

**Review prompt**:
> Review day 11. (1) Walk through `tag init` interactively — is the prompt sequence sensible or does it ask things in a confusing order? (2) If tag.config.yaml says `team: nonexistent-team`, what happens on sync? Hopefully a clear error. (3) The .gitignore recommendation — did we explain *why* in the prompt, or just suggest it? (4) Is there a way to override tag.config.yaml from the CLI flag for one-off cases? (5) Does the team-scoped sync correctly include tenant-wide skills (which apply to everyone) plus team-A skills, but exclude team-B skills?

---

### Day 12 (Fri) — End-to-end smoke + onboarding doc

**Complete means**:
- `scripts/smoke-week2.sh` runs the full loop: clean DB → create tenant → create user → create team → upload skill → upload MCP entry → ingest RAG → run `tag login` → `tag init` → `tag sync` → verify files exist → verify Claude Code can use them.
- `docs/onboarding.md` updated: a new dev can go from `npm i -g @tag/cli` to using a team RAG inside Claude Code in under 5 minutes. Time it. Actually time it.
- All week-2 review prompts have been run and findings logged.

**Start prompt**:
> Day 12. Integration day, no new features. Write scripts/smoke-week2.sh that runs the entire loop in one go: starts services, resets DB, creates tenant + admin user via API (with a test JWT), creates a team, uploads a skill bundle, registers an MCP server, ingests 3 markdown files into a RAG collection, simulates a user running `tag login` (use a pre-baked test JWT to skip OAuth), `tag init` with the team, `tag sync`, then asserts files exist on disk where expected and the Claude Code project setup is valid. Run it. Then update docs/onboarding.md to be the actual flow: install CLI, login, cd into a project, init, sync, open Claude Code, ask a question that uses the RAG. Time yourself doing this fresh on your laptop. Goal: under 5 minutes from `npm i` to working RAG. If it's slower, what's slow?

**Review prompt**:
> Week 2 retrospective. (1) The 5-minute onboarding goal — actual time? (2) What's the most embarrassing rough edge a new user would hit? (3) Did week 2 increase or decrease confidence the product works? (4) Anything I built this week that was outside the plan — and was it worth it? (5) Energy check — am I still good for two more weeks?

---

### Day 13 (Sat) — Buffer

**Start prompt**:
> Day 13 buffer. Same drill as day 6: review all week 2 complete criteria, fix partials, no new features. If everything is solid, spend the day on developer experience — better error messages, clearer CLI output, faster local dev loop. The kind of stuff that matters to vibes but doesn't show up on a checklist.

**Review prompt**:
> What did I improve today that I'll thank myself for in week 4? What did I leave broken that will bite me?

---

### Day 14 (Sun) — Off

---

## Week 3 — Admin UI + disable switch + observability

### Day 15 (Mon) — Admin UI: tenants, teams, members

**Complete means**:
- `apps/web` admin UI at `/admin`. Auth-gated: only tenant_admin sees admin pages.
- Three pages: `/admin/teams` (list, create, edit), `/admin/teams/:id` (members + roles), `/admin/audit` (paginated audit log with filters).
- Uses shadcn/ui components. Tailwind. No custom CSS.
- Forms have proper validation (zod + react-hook-form), loading states, error toasts.

**Start prompt**:
> Day 15. Admin UI begins. In apps/web, build /admin pages using Next.js App Router + shadcn/ui + Tailwind. Pages: /admin/teams (table of teams in tenant, create/edit dialog), /admin/teams/[id] (members table with role dropdowns, invite-by-email or invite-by-username form), /admin/audit (paginated table of audit_log with filters by actor, resource_type, date range). Auth-gate: only tenant_admin role gets through. Use react-hook-form + zod for all forms. Use shadcn's Table, Dialog, Select, Toast components. Don't build custom anything. Server components for data fetching, client components only where interactivity is needed. Make it look clean — boring but professional. Solo founders ship the most boring possible UI in v1.

**Review prompt**:
> Review day 15 admin UI. (1) Did I accidentally use any custom CSS or am I 100% Tailwind + shadcn? (2) What happens if a non-admin user navigates to /admin directly — clean redirect or 500 error? (3) Are forms accessible — keyboard navigation, focus states, screen reader labels? (4) The audit log — is it actually queryable for "what did Alice change last Tuesday" or only chronological? (5) Did I add any features beyond the day's scope?

---

### Day 16 (Tue) — Admin UI: skills + MCP server registry editor

**Complete means**:
- `/admin/skills` — list of skills with enabled toggle (toggle = registry mutation, immediate). Create/edit dialog with bundle upload.
- `/admin/mcp-servers` — list with enabled toggle. Create/edit dialog for url, transport, auth_method.
- Toggling `enabled = false` is the "disable switch" — next user `tag sync` removes it from their machines.
- A note in the UI: "Disabling propagates within ~60s on next user sync. For immediate revocation, rotate credentials at the MCP server."

**Start prompt**:
> Day 16. Skills and MCP server admin pages. /admin/skills — table with columns: name, version, scope, team, enabled toggle, actions. Create/edit dialog: name, version, scope, team (if scope=team), description, manifest fields, bundle file upload. Toggling enabled = PATCH /api/skills/:id with enabled=false, audit logged. Same shape for /admin/mcp-servers — table + create/edit, toggle. In the UI, near the toggle, show a small info text: "Disabling propagates within ~60s on next user sync. For immediate revocation, rotate credentials at the MCP server itself." This is important — we're being honest about the eventual-consistency model rather than promising a real-time kill switch. Don't fake it.

**Review prompt**:
> Review day 16. (1) Did I add the propagation-delay disclaimer in the UI, or did I quietly ship a toggle that lies about what it does? (2) Bundle upload — does it show progress for large files? (3) If admin disables a skill while a user has it open in Claude Code, what happens — is there any cleanup or just removal on next sync? (4) The create dialog for MCP servers — does it validate the URL format? (5) Are these admin actions all in audit_log with sufficient detail to debug "who disabled the foo skill last week"?

---

### Day 17 (Wed) — Opt-in resource-centric event logging

**Complete means**:
- Schema: `usage_events` table — `id, tenant_id, team_id, resource_type (skill|mcp_tool|rag_query), resource_id, count, period_start, period_end`. Aggregated, NOT per-event-per-user.
- Endpoint: `POST /api/events` accepts a batch from CLI/MCP servers, validates JWT, increments aggregate counters.
- A tenant setting `events_enabled` (default false). When false, /api/events returns 204 no-op. Privacy by default.
- Hook script in CLI: when events enabled, posts aggregated counts every 5 min from a local buffer.

**Start prompt**:
> Day 17. The most important framing day. We're building usage logging — but it's RESOURCE-centric, not PEOPLE-centric. Schema: usage_events with id, tenant_id, team_id (nullable for tenant-wide resources), resource_type ('skill'|'mcp_tool'|'rag_query'), resource_id, count (integer), period_start, period_end (15-min buckets). NO user_id field. Even at the database level, we can't answer "what did Alice do" — only "how often was skill X used in team Y last week". POST /api/events accepts a batch: [{resource_type, resource_id, count, period_start, period_end}]. Validates JWT, extracts tenant_id, team_id from JWT/scope, upserts into the bucket. Add tenant setting `events_enabled` (boolean, default FALSE). When false, the endpoint accepts and discards (returns 204). When true, persists. CLI side: add a hook script that Claude Code can call (we'll wire this up tomorrow), buffers locally, flushes every 5 min. The non-negotiable: NO PER-USER LOGGING. If anyone (me, future contributor, customer request) asks for it, the answer is "v2 maybe, with a different product positioning." This is the core trust commitment.

**Review prompt**:
> Review day 17. (1) Is there ANY way the schema or endpoints can be used to answer "what did user X do"? Look hard. JWT contains user_id — is it ever stored? (2) Is events_enabled actually false by default for new tenants? (3) When events_enabled is false, is the endpoint truly a no-op or does it secretly log somewhere? (4) Is the framing clear in the admin UI — does it call this "usage analytics" not "user activity"? (5) What's the marketing story: "we don't track users" — does the implementation back that up?

---

### Day 18 (Thu) — Claude Code hook integration for events

**Complete means**:
- `tag init` (when events_enabled is true at tenant level) writes a hook config into `.claude/settings.json` — PostToolUse hook that calls a local helper script.
- The helper script aggregates locally (no per-call network), flushes every 5 min to `/api/events`.
- Hook does not block Claude Code execution, ever. Failures are silent (logged to ~/.tag/logs/).
- A "this project has Tag observability enabled" notice is shown in `tag status` so users always know.

**Start prompt**:
> Day 18. Wire up the event hook. When `tag init` runs in a tenant where events_enabled is true, it adds a Claude Code PostToolUse hook to .claude/settings.json that calls `tag _record-event` (a hidden CLI subcommand). This subcommand: takes the tool name + tokens used as args, buffers to ~/.tag/event-buffer.ndjson, returns immediately. A separate flush process (started by `tag login` and runs in background) reads the buffer every 5 min, aggregates by resource_type+resource_id+15-min-bucket, POSTs to /api/events, clears flushed entries. The hook NEVER blocks Claude Code — if `tag _record-event` errors, it exits 0 and logs to ~/.tag/logs/events.log. CRITICAL: surface to the user that observability is on. `tag status` should clearly show "Usage analytics: enabled by tenant admin (resource-level only, no per-user data)." Users should never be surprised. If the user wants to opt out personally, support `tag opt-out` which removes the hook from this project. Document this loudly.

**Review prompt**:
> Review day 18. (1) Did the hook ever block Claude Code in testing — kill the API mid-call and see what happens. (2) Is "events on" visible in tag status, or did I hide it? (3) Does `tag opt-out` actually work and persist across syncs? Or does the next sync re-add the hook? (4) The buffer file ~/.tag/event-buffer.ndjson — what if it grows huge because the API is down for a week? Is there a cap or rotation? (5) Privacy audit: I'm Alice. I run claude code with this hook. What ends up on the server? List every field.

---

### Day 19 (Fri) — Top resources view + admin polish

**Complete means**:
- `/admin/usage` page: "Top skills this week", "Top MCP tools", "RAG queries by collection". Charts using shadcn-charts or simple bar visualizations.
- Time range filter (last 24h, 7d, 30d).
- Empty state when events disabled: "Usage analytics is off for this tenant. Enable in settings."
- Mobile-responsive admin UI (test on phone width — it should at least not break).

**Start prompt**:
> Day 19. Build /admin/usage with three sections: Top Skills (bar chart of skill name vs count), Top MCP Tools (same), RAG Activity (queries per collection over time, line chart). Use Recharts (already a dep) or shadcn-charts. Time range selector: 24h, 7d, 30d. The data comes from usage_events aggregations — no user fields anywhere in the response. Empty state when events_enabled is false: a clear card explaining what this would show, with a link to settings to enable it. Test responsiveness on phone width — the admin UI should be usable on mobile (it's a B2B tool but admins check stuff from phones too). End the day with a cleanup pass: error toasts everywhere mutations can fail, loading skeletons on tables, empty states on every list view that could be empty.

**Review prompt**:
> Review day 19. (1) On a fresh tenant with events disabled, does /admin/usage show a useful empty state or a broken-looking page? (2) Does any field in the API response leak user info (user_id, email, name)? Show me a sample response. (3) On mobile width, is the admin UI usable or just not crashing? (4) Are there any forms in the admin UI that don't show errors when they fail? Click through and find one.

---

### Day 20 (Sat) — Buffer + week-3 retro

**Start prompt**:
> Day 20 buffer. Run all week-3 review questions. Fix partials. Then write a week-3 retro: what shipped, what's deferred to v2, what surprised me.

**Review prompt**:
> The crucial week-3 question: would I, as a developer, want to use this product right now? Not "would I find it useful in theory" — would I actually run `tag login` Monday morning if my team adopted it? Be honest. If no, what's missing?

---

### Day 21 (Sun) — Off

---

## Week 4 — Real users, fix what breaks, ship

### Day 22 (Mon) — First user onboarding (round 1)

**Complete means**:
- 2 friendly users (teammates, friends, or hand-picked early-access folks) onboarded over a screen share.
- A list of friction points captured — every "wait, what?" moment, every command they had to ask about.
- No new features built today. Only observation.

**Start prompt**:
> Day 22. STOP BUILDING. Today I'm onboarding 2 real users on a screen share. Don't help them — watch them. Take notes on every: (a) moment they got confused, (b) command that failed or behaved unexpectedly, (c) doc they had to look up, (d) terminology that didn't match their mental model, (e) thing they tried that didn't exist. After both sessions, organize the notes into: critical (blocks them from using it), annoying (works but rough), nice-to-have (would be cool eventually). Don't fix anything yet — just capture. Resist the urge to live-fix during the screen share. If they're stuck, give them a workaround, note it, move on.

**Review prompt**:
> Day 22 review. (1) How many friction points are critical vs annoying vs nice? (2) What was the most surprising thing — something I assumed was obvious but wasn't? (3) Did either user ask for something we don't have? Was it on the v2 list or genuinely new? (4) Are these users likely to keep using it on their own, or only when I'm watching? Honest answer.

---

### Day 23 (Tue) — Fix the top critical friction points

**Complete means**:
- Top 3 critical issues from day 22 are fixed.
- Each fix has a regression test or at minimum a smoke test.
- Re-run the onboarding flow myself; time it. Should be faster than day 22.

**Start prompt**:
> Day 23. Fix the top 3 CRITICAL friction points from yesterday's notes. Not annoying, not nice-to-have — only the ones that blocked users from succeeding. For each fix: write the change, write a test that proves it stays fixed, manually re-run the failing flow. After all 3 are fixed, run the full onboarding myself end-to-end on a clean machine (or fresh Docker container) — time it. Goal: 5 minutes or less. If still longer, what's slow?

**Review prompt**:
> (1) Did each fix actually solve the problem or did I sidestep with a workaround? (2) Did I add any regression tests, or am I trusting myself not to break it again? (3) Time on clean onboarding — actual minutes? (4) Did I scope-creep into fixing annoying stuff while I was in there?

---

### Day 24 (Wed) — Onboard 3-5 more users

**Complete means**:
- 3-5 additional users onboarded. Most should succeed without you on a screen share — async via docs only, with you available in chat.
- Failure modes documented. If anyone got stuck, why?
- A `tag doctor` command exists that runs diagnostic checks (API reachable, JWT valid, ~/.claude/skills/ writable, .mcp.json parseable) and prints a status report.

**Start prompt**:
> Day 24. Async onboarding — send 3-5 more users the docs, see if they can self-serve. You're available on chat but don't proactively help. Note who got stuck and where. Build `tag doctor` while waiting — runs a battery of checks: API reachable, JWT valid + not expired, ~/.claude/skills/ exists and is writable, .mcp.json parses, OS keychain accessible, Node version OK, Claude Code installed and version >= some minimum. Output a clean status report with green/yellow/red per check and remediation hints. This becomes the first thing users run when something goes wrong. Document `tag doctor` prominently in onboarding.

**Review prompt**:
> (1) How many users self-served vs needed help? (2) Of the ones who needed help, would `tag doctor` have caught the issue? If not, what should it check that it doesn't? (3) Are people coming back to use it on day 2, or did they try it once and forget? (4) Anyone refer it to a teammate without prompting? That's the actual product-market-fit signal.

---

### Day 25 (Thu) — Fix annoying friction + polish

**Complete means**:
- All "annoying" friction points from day 22-24 either fixed or explicitly punted to v2.
- CLI output reviewed end-to-end for clarity — every error message helpful, every success message accurate.
- README and onboarding doc updated with anything new.

**Start prompt**:
> Day 25. Polish day. Go through all "annoying" friction points from days 22-24. For each: fix it OR explicitly mark it v2. No middle ground. Then do a CLI output audit — run every `tag` command in success and failure modes. For each error message, ask: would a user know what to do? If not, fix it. For each success message, ask: does it actually confirm what happened or is it vague? Fix. Update README with the current command surface. Update onboarding doc with anything new.

**Review prompt**:
> (1) How many "annoying" issues were fixed vs deferred? Was the deferral list rationalized or just laziness? (2) Pick three error messages at random — would my mom (a non-engineer) get the gist? (3) Is the README current or out of date? Test by following it.

---

### Day 26 (Fri) — Stability pass + first-week-of-real-use

**Complete means**:
- Logs reviewed for the past week — any errors users hit that didn't surface as support requests?
- Top error patterns either fixed or have better error messages.
- A `CHANGELOG.md` exists with what shipped and what's known broken.
- Communication to users: "thanks for trying this, here's what changed this week, here's what's coming."

**Start prompt**:
> Day 26. Look at every error logged in the past week — server logs, ~/.tag/logs/ on user machines if they shared them, audit_log for anomalies. What errors are happening that nobody told me about? For each pattern, decide: fix the bug, or improve the error message, or accept and document. Write CHANGELOG.md with what shipped in week 4 and what's known broken. Send a short message to the users you onboarded: thanks, here's what changed, here's what's coming. Don't ask them for testimonials yet — too early.

**Review prompt**:
> (1) What error pattern did I find that I was unaware of? (2) Was anyone hitting bugs and silently giving up? How would I know? (3) Is the CHANGELOG honest, or did I omit known issues to look better?

---

### Day 27 (Sat) — Final smoke + retrospective

**Complete means**:
- A full smoke test: clean DB, clean machine, run through onboarding from scratch, every feature exercised.
- 28-day retrospective written: what shipped, what didn't, what to do next.
- A v2 backlog file ranked by user pain and effort.

**Start prompt**:
> Day 27. The 28-day finale. Run a complete smoke test: nuke local DB, nuke ~/.tag, nuke ~/.claude/skills (back up first if real). From scratch: docker compose up, migrate, create tenant via SQL, GitHub login, become tenant admin, create team, invite a second user, upload a skill, register an MCP server, ingest RAG docs, log in as second user, run init+sync, open Claude Code, exercise everything. Note every glitch. Then write docs/retro-week4.md: what shipped (concrete list), what didn't ship (concrete list with reasons), what 5-20 users actually do with it (data, not opinions), v2 backlog ranked by (user pain × frequency) ÷ effort. Be honest. Future-me will thank present-me.

**Review prompt**:
> (1) Did the smoke test pass cleanly or did I find new issues? (2) Is the v2 backlog actually ranked, or just a brain dump? (3) The honest question: is this product worth continuing, pivoting, or shelving? What's the data say?

---

### Day 28 (Sun) — Off, then decide

The last day off before week 5. Don't open the laptop until you've decided one thing: **is this worth four more weeks?** If yes, what's week-5's most important shippable. If no, what's the kindest way to wind down for users who started using it.

---

## What "complete" never means

Three things that look like completeness but aren't:

1. **"It works on my machine."** Doesn't count unless smoke-tested on a clean environment.
2. **"The happy path works."** Doesn't count unless the unhappy paths fail with helpful errors.
3. **"I'll add the test later."** Almost always becomes "I never add the test." Either write it now or admit you won't.

## How to use the prompts

- Paste the **start prompt** into Claude Code at the beginning of the day. Let it ask clarifying questions before writing code. If it doesn't ask any, that's a yellow flag — push back with "what's ambiguous about this?"
- Paste the **review prompt** at the end of the day. Claude Code reviews its own work. This catches "looks done" failures.
- If a day's complete criteria isn't met, **do not advance**. Roll the unfinished items into the next buffer day (Sat). If buffers fill, descope the rest of the week — not the foundation.
- Read each next-day prompt the night before so your morning brain doesn't have to plan. Just paste and go.

## When the plan breaks (it will)

Likely failure modes and what to do:

- **Day 4 RAG isolation tests fail in a hard way** → add a buffer day. This is the day worth slipping the plan for.
- **Day 8-9 sync conflicts on real filesystems** → expected. The Saturday buffer absorbs this.
- **Week 3 admin UI takes longer than 3 days** → cut /admin/usage entirely; move to v2. The product still ships without it.
- **No real users available week 4** → use yourself + 2 fake personas. Worse than real users but better than no testing.
- **Burnout by day 18** → take an unscheduled day off. Adjust the rest of the plan. The plan serves you, not vice versa.
