# Team AI Gateway — 33-Day Demo-Ready Plan (Revised)

**Change vs. the 28-day plan**: 5 days inserted to make the system demo-ready for a partner/investor pitch.

- **Days 16-17 → "Signup Days"**: self-serve GitHub signup, auto-tenant creation, trial timer (cosmetic, no billing)
- **Days 24-26 → "Routing Days"**: LiteLLM sidecar, models table, per-team model routing, admin UI page

**Total**: 33 days. Same Sundays-off rule. Buffer days unchanged.

**The demo narrative we're building toward** (rehearse this; it shapes everything):

> "Watch this. I'm going to sign up with GitHub, create a team, add my engineer Bob to the team. As tenant admin, I'll configure that this team uses Bedrock for compliance reasons. I'll register a RAG endpoint pointing at our internal docs. Now Bob, on his laptop, runs `tag sync` and opens Claude Code — but it's actually routed to Bedrock under the hood, with our docs available as RAG. He asks a question, gets an answer grounded in our internal knowledge, and as tenant admin I can see usage analytics — but never see what Bob personally typed. That last part matters: we're infrastructure, not surveillance."

That's the 4-minute story. Every day's work either supports that story or doesn't.

---

## Days 1-15: Unchanged from original plan

Refer to the original 28-day plan for days 1-15. They're identical:

- **Week 1 (Days 1-7)**: Foundation — repo, DB, auth, registry CRUD, RAG with isolation, CLI scaffold
- **Week 2 (Days 8-14)**: CLI is the product — sync, RAG ingestion, init, smoke test
- **Day 15**: Admin UI — teams, members, audit log

By end of Day 15, you have: working auth, registry APIs, RAG with proven tenant isolation, a working CLI, and the first admin UI page (teams).

---

## NEW: Day 16 (Mon) — Self-serve signup + tenant auto-creation

**Why now**: Before building skill/MCP admin pages, we make the entry door public. This way the rest of week 3 polishes a system anyone can sign up to.

**Complete means**:
- Public marketing landing page at `/` (apps/web): hero, 3-feature grid, "Sign up with GitHub" CTA. Boring but professional, shadcn components only.
- "Sign up with GitHub" flow: OAuth → if no tenant exists for this user, auto-create one (`tenant.name = user.name + "'s workspace"`, user becomes `tenant_admin`).
- Trial timer: `tenants.trial_ends_at` defaults to NOW + 14 days. Shown in admin header. Not enforced (cosmetic for demo). A "Trial expires in X days" banner shows in admin UI.
- Approval gate (optional, demo-friendly): a tenant flag `requires_approval` that can be flipped on; when true, signup creates tenant in `pending` status until you SQL-flip it. For your demo, you'd leave this OFF, but it's there if you suddenly get attention.
- A second-user flow: when an invitee accepts a team invite (from day 15's admin UI), they DON'T create a new tenant — they join the inviter's tenant. This is the bug to test for: don't accidentally create two tenants for the same person.

**Start prompt**:
> Day 16. Self-serve signup. Build apps/web `/` (root) — a public marketing landing page using shadcn-only components: hero with one-line value prop ("Give your team a secure, permission-aware AI toolbox"), a 3-feature grid (Skill registry / Tenant-aware RAG / Multi-model routing), and a single "Sign up with GitHub" CTA. Don't try to make it pretty — just clean and professional. Add OAuth signup flow: if a user logs in via GitHub and has no associated user/tenant in our DB, auto-create them — create a Tenant row with name `<github_login>'s workspace` and trial_ends_at = NOW() + INTERVAL '14 days', create the User row, link them as tenant_admin via team_members in a default "All Members" team. If they DO have an existing user (e.g., they were invited to an existing tenant), DON'T create a new tenant — log them into the existing one. Show a "Trial expires in X days" banner in /admin pages, calculated from trial_ends_at. Don't enforce expiry — it's cosmetic for the demo. Add a tenants.requires_approval column (default false); if true at signup time, create the tenant with status='pending' and don't grant access. We won't use this for the demo but it's good to have. Test: (1) Sign up with GitHub account A, verify new tenant created. (2) From A's admin UI, invite B (different GitHub account) to a team. (3) B clicks invite link, OAuth's with GitHub, verify B is added to A's tenant — NOT given a new tenant. (4) Sign up with GitHub account C (no invite), verify a third independent tenant is created.

**Review prompt**:
> Review day 16. (1) The "invited user lands in inviter's tenant, not their own" path — is it actually tested or did I assume? Walk through the code. (2) Does the landing page have any text that's aspirational vs. accurate? Demos die on overpromise. (3) Trial banner — does it disappear cleanly when trial_ends_at is null (e.g., for paid tenants in v2)? (4) If someone signs up while requires_approval=true, what error message do they see? Is it dignified? (5) Is the GitHub OAuth callback URL configurable per env, or hardcoded?

---

## NEW: Day 17 (Tue) — Polish signup flow + email touchpoints

**Complete means**:
- Welcome page after first signup: "Welcome to Tag — let's get you set up in 3 steps." Step 1: Install CLI (with copy-paste command). Step 2: Run `tag login`. Step 3: Run `tag sync`. Each step has a "Mark as done" link, persisted in user state.
- Invite emails: when an admin invites a user via /admin/teams, the system sends an email with the invite link. For demo, you can use Resend or Postmark free tier (cheap and reliable). Don't build SMTP yourself.
- Invite link page: clean public page that says "Alice invited you to join Acme Corp on Tag" → "Sign in with GitHub to accept."
- A `/settings/profile` page where the user can see their tenant, leave it (if not the only admin), and view trial status.

**Start prompt**:
> Day 17. Polish the signup-and-onboarding flow. After first signup, redirect to /onboarding — a checklist page with 3 steps: "Install the CLI" (shows `npm i -g @tag/cli` with a copy button), "Log in" (shows `tag login` with copy), "Sync your first skill" (shows `tag sync` with copy). Each step has a "Mark as done" toggle persisted to user.onboarding_state JSON column. When all 3 checked, show a "You're all set" with a link to /admin. Build email integration using Resend (sign up for their free tier, store API key in env). When an admin sends an invite from /admin/teams/:id, generate a one-time-use invite token (insert into invites table: token, tenant_id, team_id, role, email, expires_at, used_at), send an email with link `https://app/invite/<token>`. The /invite/<token> page is public, shows "Alice invited you to join Acme Corp on Tag", has a "Sign in with GitHub" button that proceeds to OAuth → on callback, validates token, adds user to tenant + team. Build /settings/profile: show user info, current tenant name, role, trial expiry, "Leave tenant" button (disabled if user is sole admin). Test: full invite loop with two different GitHub accounts, including the email actually arriving.

**Review prompt**:
> Review day 17. (1) Did Resend's email actually arrive in inbox or spam? Test on a fresh Gmail account. (2) Invite token security: can it be guessed? Is it long enough? Does it expire? Is it single-use enforced server-side? (3) Onboarding checklist — does "Mark as done" actually persist and survive logout? (4) The "Leave tenant" button — what happens if I'm the sole tenant_admin? Does it block me with a useful message or just break? (5) What does /invite/<expired-token> show? An ugly stack trace or a clean "this invite has expired"?

---

## Days 18-23: Renumbered from original plan

These are the original days 16-21 with new numbers:

- **Day 18 (was 16)**: Skills + MCP servers admin UI with disable toggle
- **Day 19 (was 17)**: Opt-in resource-centric event logging
- **Day 20 (was 18)**: Claude Code hook integration for events
- **Day 21 (was 19)**: Top resources view + admin polish
- **Day 22 (was 20)**: Buffer + week-3 retro
- **Day 23 (was 21)**: Sunday off

The prompts and complete-criteria are unchanged from the original plan. Just the day numbers shifted.

---

## NEW: Day 24 (Mon) — LiteLLM sidecar + models table

**Why now**: Going into week 4, you have a working full-stack product. Now you bolt on the differentiator. Doing it before user testing means the demo includes routing — but it's also low-risk because it's additive.

**Complete means**:
- LiteLLM added to `docker-compose.yml` as a sidecar service (port 4000, internal network only). Config file mounted from disk so it can be regenerated.
- `models` table: `id, tenant_id, scope (tenant|team), team_id, name (display), provider (anthropic|bedrock|azure|ollama), config_json, enabled, created_*`.
- Backend service that, on any change to `models` table, regenerates LiteLLM config YAML and restarts (or reloads) LiteLLM. Use file watch + LiteLLM's `/model/info` reload endpoint.
- Smoke test: configure an Anthropic model AND an Ollama model (run a local Ollama instance), verify both work end-to-end via LiteLLM's `/v1/messages` endpoint.

**Start prompt**:
> Day 24. Add LiteLLM as a sidecar. In docker-compose.yml, add a service `litellm` using `ghcr.io/berriai/litellm:main-latest`, port 4000, mount `./litellm-config.yaml` as `/app/config.yaml`, env var `LITELLM_MASTER_KEY` (random string). Internal network only — don't expose port 4000 to host in production, but for dev expose to localhost. Add `models` table: id, tenant_id, scope ('tenant'|'team'), team_id (nullable), display_name, provider ('anthropic'|'bedrock'|'azure'|'ollama'), config_json (jsonb — provider-specific config like AWS region, API key, base URL), enabled, timestamps. Migrate. Build a service `apps/api/src/services/litellm-config.ts` that: queries all enabled models, generates a litellm-config.yaml mapping each as a model_list entry with proper litellm_params for the provider, writes the file, calls LiteLLM's `/model/info` reload endpoint (or restarts via Docker API as fallback). Trigger this service on any models table mutation. Smoke test: insert a model row for Anthropic claude-sonnet-4-5 with the API key from env. Insert another for Ollama llama3.1 with api_base http://host.docker.internal:11434 (assuming user has Ollama running). curl LiteLLM /v1/messages with model=claude-sonnet-4-5, then with model=llama3.1, verify both return responses. (For demo purposes, you can keep Ollama optional — Anthropic + Bedrock is enough story-wise.)

**Review prompt**:
> Review day 24. (1) Is LITELLM_MASTER_KEY actually random per deployment, or hardcoded? (2) The config regeneration — what happens if it's called concurrently from two requests? Lock file? Atomic rename? (3) If LiteLLM fails to reload, does the API surface that error or silently fail? (4) Are provider API keys in config_json encrypted at rest, or stored plaintext in jsonb? (Real answer for demo: probably plaintext — note as a v2 issue.) (5) What if a tenant has zero models configured — does LiteLLM crash or run with empty config?

---

## NEW: Day 25 (Tue) — Admin UI for models + per-team routing

**Complete means**:
- `/admin/models` page: list, create, edit, delete, toggle enabled. Provider-specific form fields (Bedrock needs region; Azure needs endpoint; Ollama needs base URL).
- API key fields are write-only (POST shows input, GET returns redacted).
- A model can be scoped to tenant (all teams) or to specific teams.
- The CLI's `tag sync` now also fetches the models the user is entitled to (via team membership) and writes them to `~/.tag/litellm-routes.json` (or directly to a project `.envrc` setting `ANTHROPIC_BASE_URL`).
- A `default_model` setting per team — when present, sync writes the env var pointing to that model.

**Start prompt**:
> Day 25. /admin/models UI + per-team routing. Build /admin/models page in apps/web: table with columns name, provider, scope, team, enabled, actions. Create/edit dialog with provider dropdown — show different form fields based on provider: Anthropic (just an API key), Bedrock (region, AWS access key, AWS secret key), Azure (endpoint URL, API key, deployment name), Ollama (base URL, e.g., http://host.docker.internal:11434). API key fields render as <input type="password"> on create; on edit, show "[set]" with a "Change" button instead of the value. Backend: POST /api/models accepts these, encrypts secret fields with a server-side key (or note as TODO for demo), inserts row, triggers LiteLLM config regen. GET /api/models returns config_json with secret fields redacted. Per-team routing: add a `default_model_id` column to teams table (nullable). When set, that team's users get that model as their default. Update `tag sync`: also fetch GET /api/models?for_user=true (returns models the caller can use via tenant or team membership), write to ~/.tag/litellm-routes.json. If the user's current project (.tag.config.yaml) has a team with a default_model, write `ANTHROPIC_BASE_URL=http://localhost:4000` and `ANTHROPIC_AUTH_TOKEN=<litellm-master-key>` to project .envrc (with marker comments like .mcp.json). Print to user: "Routing claude calls to Bedrock via LiteLLM proxy". Test the full demo loop: tenant admin configures a Bedrock model, scopes it to team Engineering, sets it as default for Engineering, dev runs tag sync in an Engineering project, opens Claude Code, asks a question — verify it actually goes to Bedrock (check Bedrock logs).

**Review prompt**:
> Review day 25. (1) Are API keys actually encrypted, or just "redacted on GET" while stored plaintext? Either is OK for demo but be honest in your CHANGELOG. (2) The .envrc auto-write — does it require direnv or does the user have to source it manually? Document this. (3) When a user is in two teams with different default models, which one wins? Is the precedence rule documented? (4) Does the demo actually work end-to-end — Claude Code call → LiteLLM → Bedrock → response? Or only theoretically? Test, don't assume. (5) If LiteLLM is down when the user runs Claude Code, what error do they see? Helpful or cryptic?

---

## NEW: Day 26 (Wed) — Demo polish + practice

**Why this matters**: A working demo is different from a *good* demo. Today is rehearsal day. It will feel low-output but it's the highest-leverage day for partner/investor success.

**Complete means**:
- A scripted demo flow document at `docs/demo-script.md` — exact clicks, exact terminal commands, expected outputs, fallbacks if something breaks live.
- A demo seed script (`scripts/seed-demo.sh`) that: creates a fresh tenant "Acme Corp", creates 2 teams (Engineering, Marketing), seeds 3 skills, 2 MCP servers, 1 RAG collection with sample docs, configures Anthropic + Bedrock models, creates a fake "Bob" user.
- Run the demo end-to-end **3 times today**, in front of a webcam if possible. Note every place you stumbled, fix or note.
- Backup plan: if live demo breaks, you have a 2-minute pre-recorded screencast as a fallback. Record it today.
- A clean dev environment that matches what you'll demo on: same OS, same browser, same terminal, same Claude Code version. No surprises.

**Start prompt**:
> Day 26. Demo polish day. Don't build new features. Tasks: (1) Write docs/demo-script.md — the actual narration script. Open with the problem ("teams want to use AI safely"), then the solution arc: live signup → invite Bob → configure Bedrock as default model for Engineering → register a RAG endpoint with internal docs → switch to Bob's terminal → tag login → tag sync → open Claude Code → ask a question that triggers RAG → show Claude Code's answer is grounded → switch back to admin → show usage analytics page → emphasize "I can see *what* was used, but not *what Bob typed*". 4 minutes max. Time it. (2) Build scripts/seed-demo.sh — sets up the entire demo state in 30 seconds. Tenant "Acme Corp", users alice@demo.com (admin) and bob@demo.com (member), teams Engineering and Marketing, 3 sample skills, 2 MCP servers, RAG collection seeded with 5 markdown files about a fictional Acme product, models for Anthropic and Bedrock configured, default model set for Engineering team. Idempotent — running twice doesn't double anything. (3) Run the demo end-to-end 3 times. Time it. Note every glitch in a list. Fix the top 3 critical glitches today. (4) Record a backup video walkthrough using OBS or QuickTime — 4 minutes, narrated. This is your insurance policy. (5) Finalize the demo environment: which laptop, which browser, which terminal config, screen resolution. Test on the actual machine you'll demo on.

**Review prompt**:
> Review day 26. (1) Time the demo — under 5 minutes? (2) What's the most likely thing to break live? Have you mitigated it or just hoped? (3) Is the seed script truly idempotent? Run it twice in a row. (4) Backup video — actually recorded, or "I'll do it later"? Do it now. (5) The narrative — does it answer "what does this do" in the first 30 seconds, or does the value land at minute 3? It needs to land in 30 seconds. (6) Have you scripted answers to the obvious questions: "How is this different from Langfuse?", "What about prompt injection?", "Pricing?", "What if my data is sensitive?", "Why not just use Claude Code directly?"

---

## Days 27-33: Renumbered from original

These map to original days 22-28 (real users week + retrospective):

- **Day 27 (Sun)**: Off
- **Day 28 (Mon, was 22)**: First user onboarding — but here, it's also the demo dry run with a friendly partner
- **Day 29 (Tue, was 23)**: Fix top critical friction
- **Day 30 (Wed, was 24)**: Onboard 3-5 more users (or do real partner demo here)
- **Day 31 (Thu, was 25)**: Polish + fix annoying friction
- **Day 32 (Fri, was 26)**: Stability pass + changelog
- **Day 33 (Sat, was 27)**: Final smoke + retrospective + decide v2

The prompts are unchanged from the original plan.

**One adjustment for demo-readiness**: in Day 28, the "first user" should be someone who's a stand-in for your investor/partner — not a randomly friendly dev. Use them to stress-test the demo flow, not the dev experience. On Day 30, do the real partner demo. By then you've practiced 4-5 times.

---

## What's still missing (be honest)

Things this 33-day plan does NOT include, even with the inserts:

- **Real billing.** Stripe integration is another 3-5 days. Trial timer is cosmetic only.
- **Email verification.** GitHub OAuth verifies the email implicitly, but a custom email/password flow doesn't exist.
- **Password reset.** N/A because we're GitHub-only.
- **SSO (SAML/OIDC enterprise).** Two weeks of work minimum. Defer to v3 or first paid customer.
- **Encryption at rest for stored credentials.** Day 25's `config_json` likely stores Bedrock keys plaintext. Note as a known issue.
- **Rate limiting on signup endpoint.** A motivated attacker could create thousands of tenants. For a demo this is fine; for real launch it's not.
- **Multi-region deployment.** Single-server still. The Hetzner sizing from earlier conversation still applies.
- **A real marketing site.** The landing page from Day 16 is functional, not converting.

These are all reasonable to defer. Just know what you're deferring so you can answer honestly when asked.

## The single most important demo lesson

The plan above will get you a working demo. What it cannot give you: a believable narrative.

**Spend at least one full day on the pitch deck**, separate from the product. You can't show a working product without a story for *why it matters*. The 4-minute demo answers "what does it do." A good pitch answers "why does this win, why now, why us, what's the wedge into a $X billion market." Without that, even a flawless demo lands as "neat tool, good luck."

If you want, I can sketch the pitch-deck outline next — it's a 10-slide format that fits this product specifically (against Langfuse, Helicone, Portkey as comparables). Or if you prefer to focus on building, I can draft the Day 16 OAuth + tenant auto-creation code as a starter.
