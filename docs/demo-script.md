# Team AI Gateway — 4-Minute Demo Script

**Goal**: Move audience from "I get the problem" (slide 4) to "I see how this solves it" (slide 7) in under 5 minutes.

**Pre-demo setup checklist** — run this 30 minutes before:

- [ ] Run `scripts/seed-demo.sh` — creates fresh tenant "Acme Corp", seed data
- [ ] Browser tabs open: (1) public landing page, (2) `/admin` already logged in as Alice (Acme admin), (3) about:blank to switch to Bob's view
- [ ] Two terminal windows pre-opened: left = "Bob's laptop" (cleaned, no Tag installed), right = backup terminal in case left breaks
- [ ] Claude Code installed on demo laptop, version pinned
- [ ] Internet stable (test ping). If using LiteLLM with Bedrock, AWS creds working — test with a curl
- [ ] Ollama running locally (optional fallback if Bedrock has issues)
- [ ] OBS recording in background (insurance)
- [ ] Phone on Do Not Disturb. Slack quit. Email quit. Mic working.
- [ ] Backup video at `~/Desktop/demo-fallback.mp4` ready to play if anything breaks

**Energy and pacing**: Demos die from being slow more than from being broken. Talk while typing. Never let dead air linger longer than 3 seconds. If something breaks, narrate it ("OK, this is being slow, let me skip ahead — here's what would have happened") and keep moving.

---

## ACT 1 — Sign up (60 seconds)

### What you do

Switch screen to a fresh browser tab on the public landing page (`https://app/`).

### What the audience sees

Clean landing page. Hero: "Give your team a secure, permission-aware AI toolbox." A "Sign up with GitHub" button.

### What you say

> "OK, here's what this looks like. I'm imagining I'm Alice, the engineering manager at Acme Corp. My team just got Claude Code seats. I land on Team AI Gateway."

Click "Sign up with GitHub." OAuth flow. Returns to a fresh `/onboarding` page.

> "GitHub OAuth. I'm in. Auto-provisioned a tenant — 'Alice's workspace' by default, I'll rename it to Acme Corp in a sec. The 14-day trial banner up top is informational, no credit card."

Quickly rename workspace to "Acme Corp" via the settings dropdown.

> "Now here's the onboarding checklist. Three steps: install the CLI, log in, sync. I'll come back to this from Bob's terminal in two minutes — but first, I want to set up what my team will actually pull down."

### Key beats

- Don't dwell on the landing page; it's not the product
- Make the OAuth flow visible — it builds confidence that this isn't fake
- Mention the 14-day trial briefly to defuse "what does this cost" thinking

---

## ACT 2 — Configure as admin (90 seconds)

### What you do

Click into `/admin`. The audience now sees what an admin sees.

### What the audience sees

Tabs: Teams, Skills, MCP Servers, Models, Usage, Settings.

### What you say

> "This is the admin view. I'm tenant admin. Let me set up what Acme's engineering team needs."

**Click into Teams.** Show two pre-seeded teams: Engineering, Marketing. Click Engineering.

> "I've already created two teams — Engineering and Marketing. Different teams get different AI tools and different model defaults. Let's say I want my engineers to use Bedrock for compliance reasons — our security team requires data stays in our AWS account."

**Click Models.** Show pre-seeded models list with Anthropic Direct + Bedrock + Ollama.

> "On the Models page, I've configured three providers: Anthropic direct, Bedrock with our AWS keys, and a local Ollama instance for experimentation. Notice — secrets are write-only. I can rotate them but I can't see them after creation."

**Click Engineering team's "Default Model" setting, change to "Bedrock Claude Sonnet."**

> "I'm setting Bedrock as the default for the Engineering team. Anyone in this team, when they run `tag sync`, gets routing through Bedrock automatically. Marketing keeps the default — Anthropic direct."

**Click Skills.** Show pre-seeded skills.

> "Skills — these are the Anthropic-format markdown bundles my team can share. We've got a code-review skill, a postgres-migration helper, and an internal API style guide. Each one is scoped to a team. The Engineering team gets all three."

**Click MCP Servers.** Show pre-seeded servers.

> "MCP servers — internal tools accessible by Claude Code. Jira, our internal API, and our company RAG endpoint."

**Click into the RAG entry, briefly.**

> "The RAG is interesting — it's just an MCP server with a search_docs tool, pointed at our internal docs. Tenant_id is enforced at the SQL layer. Acme's docs are *physically inaccessible* to any other tenant. We can show that test passes if anyone wants to dig in."

### Key beats

- Move fast through the admin UI; don't dwell on any single page more than 15 seconds
- The "secrets are write-only" comment lands well — security people notice
- The "tenant_id at SQL layer" comment preempts the obvious privacy question

---

## ACT 3 — Use as a developer (90 seconds)

### What you do

Switch to the left terminal — Bob's clean laptop. Don't switch users in the browser; just narrate the role change.

### What the audience sees

A clean terminal with prompt `bob@laptop ~ %`.

### What you say

> "OK, now I'm Bob. New engineer at Acme. I just got my onboarding email."

Type:
```
$ npm install -g @tag/cli
```

> "One command — install the CLI. I'll skip the install spinner. Done."

(If install is slow, have it pre-installed and pretend; or use a fake snippet showing "installed".)

Type:
```
$ tag login
```

> "OAuth flow. GitHub, same as Alice."

Browser opens, Bob's GitHub auth, returns. Terminal shows "Logged in as bob@acme.com, tenant: Acme Corp."

```
$ cd ~/projects/acme-backend
$ tag init
```

> "I cd into our backend repo and run `tag init`. It asks which team this project belongs to."

Interactive prompt: choose "Engineering."

```
$ tag sync
```

> "And here's the magic. `tag sync` — fetches everything I'm entitled to. Three skills installed to ~/.claude/skills. MCP servers written to project .mcp.json. Bedrock routing configured to a local LiteLLM proxy. The whole team's AI toolbox, in one command."

Show the terminal output: "Installed 3 skills, registered 3 MCP servers, routing claude calls via Bedrock."

```
$ ls ~/.claude/skills/
$ cat .mcp.json
```

> "Skills are real files. MCP config is real config. If Tag goes down tomorrow, this all keeps working — we never sit in the path."

```
$ claude
```

> "Now — Claude Code. Watch this."

Inside Claude Code, type:
```
> Search our internal docs for the API rate limit policy and summarize.
```

Wait for response. Claude Code uses the company RAG MCP server, retrieves chunks, answers grounded in Acme's docs.

> "Notice — that answer came from Acme's RAG, scoped to my team. Cross-tenant inaccessible. Routed through Bedrock under the hood. Bob didn't configure any of that — Alice did, once."

### Key beats

- The `tag sync` line is the wow moment. Slow down. Let it land.
- The "Claude Code uses company RAG, grounded in Acme docs" beat is the payoff. If you only nail one thing, nail this.
- The "if Tag goes down, this keeps working" line is critical — it preempts the "single point of failure" objection

---

## ACT 4 — Switch back to admin: the trust commitment (45 seconds)

### What you do

Switch back to Alice's browser. Click `/admin/usage`.

### What the audience sees

A dashboard showing "Top Skills This Week", "Top MCP Tools", "RAG Queries by Collection." Charts are populated with seed data.

### What you say

> "Last thing. Here's what I, as Alice the admin, can see. Top skills used this week. Top MCP tools called. RAG query volume by collection. I can see *which resources* are getting used."

Pause for emphasis.

> "Notice what I cannot see. I cannot see Bob's prompts. I cannot see what specific question he asked Claude Code. I cannot see his tool call arguments. I cannot answer 'what did Bob do at 3pm yesterday'. The schema doesn't have user_id on usage events. By design."

> "This is the trust commitment. We're infrastructure for sharing AI tools — not surveillance for monitoring engineers. Bob's team lead can see the team is getting value from the postgres-migration skill. Bob doesn't feel watched. Both things are true at once."

### Key beats

- This is the most important narrative beat in the whole demo. **Slow down here.** Make eye contact with the audience.
- The phrase "by design" is doing a lot of work — it implies "we made the architectural choice; competitors didn't"
- This is what differentiates you from Arkon/Datadog-for-AI positioning. Land it cleanly.

---

## ACT 5 — Land it (15 seconds)

### What you say

Return to slide 7 (the comparison table) or stay on the dashboard.

> "That's the demo. Five-minute install for a developer. One-time setup for an admin. Bedrock-routed, RAG-grounded Claude Code, with team-level permissions, no surveillance, self-hostable. Questions?"

Stop talking. Let them respond.

---

## Common demo failure modes and recovery

These will happen. Know your lines.

**Failure: Claude Code response is slow**

> "While that processes, [keep narrating what's about to happen]."

If it takes >30s, abandon: "OK, the LLM is slow today — let me show you what the response looks like." Switch to a pre-recorded screenshot.

**Failure: `tag sync` errors**

> "Ah, this is dev. Let me run it again."

If it errors twice: "OK, looks like my Bedrock cred rotated. Let me show you what the synced state looks like" → switch to a pre-staged terminal screenshot.

**Failure: Bedrock returns 4xx**

Have Ollama running as fallback. Pre-configure a "Bob switches to Ollama for this demo" path.

> "Compliance team is testing failover — let me show with our local Ollama backend. Same flow, different inference."

**Failure: Internet drops**

Switch to OBS recording instantly. "Let me play the recording — same flow, slightly older snapshot." Don't apologize more than once.

**Failure: Live audience question mid-demo**

If short answer: answer in <10 seconds, return.
If long answer: "Great question — let me park that for after the demo so we keep the flow."

---

## What NOT to do during the demo

- **Don't** apologize for rough edges. They're not rough; they're the right level of polish for an MVP.
- **Don't** explain the architecture during the demo. Save it for Q&A. The demo is for narrative, not technical depth.
- **Don't** click into anything you didn't rehearse. Off-script clicks reveal half-finished pages.
- **Don't** show the codebase. Investors/partners care about user experience, not your repo.
- **Don't** linger on any one screen more than 15 seconds. Keep moving.
- **Don't** read the screen aloud. Audience can read. Add commentary, not narration.
- **Don't** check your phone, your notes, or the clock during the demo. The audience reads anxiety as "this isn't ready."

## What to rehearse

The demo gets 3 full rehearsals on day 26. Rehearse with:

1. **A friend on Zoom**, watching silently, giving feedback after.
2. **A timer**, hitting under 5 minutes total. If you're at 6, cut Act 4 to 30 seconds.
3. **Yourself, recorded**, watching the playback. The third rehearsal is the most painful and most useful — you see your own pacing problems.

The goal isn't memorization — it's flow. You should be able to do the demo if the slides break, if a key click misfires, if a question interrupts. That comes from rehearsal, not from script-reading.

## The single most important thing about demos

**The demo is a story, not a tour.** Every act connects to the previous one. Alice signs up (Act 1) so she can configure (Act 2) so Bob can use it (Act 3) so Alice can see it working without surveillance (Act 4). If any act doesn't serve the narrative, cut it.

The narrative is: *"Engineering teams want to give their devs Claude Code with team context, safely, without becoming surveillance — here's the thing that does that."*

Every word you say during the demo should earn its place against that sentence.
