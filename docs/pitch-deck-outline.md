# Team AI Gateway — 10-Slide Pitch Deck Outline

**Pitch context**: 4-7 minutes verbal + slides, partner/investor audience. Demo follows the deck.

**The core narrative arc** (memorize this; everything serves it):

> Every company is rushing to give engineers Claude Code. None of them have a way to govern it. The competitors observe LLM calls, but Claude Code is different — it's a tool-calling agent that needs *skills, MCP servers, and RAG distributed and permissioned at the team level*. We're the infrastructure for that. Like Auth0 was for SaaS auth, we are for AI tool sharing.

**Tone notes**: Confident but not grandiose. The product is real (you'll demo it). The market is huge but you'll prove it with specifics, not adjectives. No "AI is the future" platitudes — your audience knows.

---

## Slide 1 — Title

**Visual**: Clean. Logo, product name, tagline, your name + role + date.

**Tagline**: *"Give every team a secure, permission-aware AI toolbox."*

**Subhead** (smaller): *Skills. RAG. MCP. Distributed by team. Owned by you.*

**Don't put**: "Disrupting", "Revolutionary", "AI-powered" (everything is). Save the verbs for slide 3.

**What you say**: Just introduce yourself and the product in one sentence. "I'm building Team AI Gateway — infrastructure for teams adopting Claude Code and AI agents." 10 seconds, then advance.

---

## Slide 2 — The problem in one image

**Visual**: A split screen.

- **Left side**: a chaotic diagram showing one company with 40 developer laptops, each with their own random `.mcp.json`, each with their own credentials, each connected to GitHub/Jira/Postgres/internal-API in slightly different ways. Caption: *"What every Claude Code adopter has today."*
- **Right side**: a clean diagram showing the same 40 developers, all pulling skills/MCP/RAG from a central registry, scoped by team. Caption: *"What they need."*

**The opening line that lands**: *"In six weeks, a team of 40 engineers can have 200+ MCP connections to internal systems. Nobody knows what they are."*

**What you say** (45 seconds):

> "Claude Code is shipping in every Anthropic Team and Enterprise plan. Engineers love it. They're connecting it to GitHub, Jira, internal APIs, production databases — sometimes within hours of installing it. Each developer configures their own setup, with their own credentials, on their own laptop. Six weeks in, IT looks up and realizes they have what Microsoft now calls Shadow MCP — 200+ undocumented connections to internal systems, zero visibility, zero ability to revoke. The same pattern that created Shadow IT, but faster and with broader access."

**Why this slide works**: It names a problem your audience already feels (or will, soon) and ties it to a recent Microsoft announcement (Agent 365). Establishes you've done your homework.

---

## Slide 3 — Why now

**Visual**: Three data points, large type, sourced.

- **98%** of organizations report unsanctioned AI use *(Vectra, 2026)*
- **40%** of enterprise applications will have task-specific AI agents by end of 2026, up from <5% in 2025 *(Gartner)*
- **$492M → $1B** AI governance spending forecast, 2026 → 2030 *(Gartner)*

**Why now in one line**: *"Anthropic just shipped Claude Code to every Team and Enterprise seat. Microsoft just GA'd Agent 365 to govern it. The category is forming this quarter."*

**What you say** (45 seconds):

> "Three things just happened. Anthropic put Claude Code in every paid seat — instant adoption pressure on every IT team. Microsoft launched Agent 365 to govern AI agents across cloud platforms — they ratified the category. And Gartner says AI governance spending doubles in three years. The timing isn't 'someday' — it's this quarter, and the buyers are organizing budget right now."

**The unstated subtext**: You're saying "I'm not early; I'm on time. The buyers are forming."

---

## Slide 4 — Why the existing players don't solve this

**Visual**: A 2x2 matrix.

- X-axis: *Observe LLM calls* ↔ *Distribute AI tools*
- Y-axis: *App developers* ↔ *Engineering teams using Claude Code*

Plot:
- **Bottom left** (LLM observability for app builders): Langfuse, Helicone, Braintrust, Phoenix
- **Bottom right** (Gateways for app builders): Portkey, OpenRouter, LiteLLM
- **Top left** (Claude Code observability): Anthropic's own Compliance API
- **Top right** (THE EMPTY QUADRANT): **You**. Caption: *"Distribution + permissions for teams using AI agents. No incumbent."*

**The line that lands**: *"Langfuse, Helicone, Portkey are excellent — for developers building LLM products. They're the wrong tool for engineering teams adopting Claude Code. Different buyer, different problem."*

**What you say** (60 seconds):

> "There are great tools in this space. Langfuse and Helicone do LLM observability — they assume you're building an LLM app and want to trace your traffic. Portkey is a routing gateway for app developers. They all sell to the same buyer: the engineer building an LLM-powered product. That's not who we serve. Our buyer is the engineering manager whose team just got Claude Code seats and is trying to share skills, RAG, and MCP servers safely. We're not competing with Langfuse — we're a different layer for a different buyer. The closest competitor is Anthropic's own Compliance API, which is observability-only, no distribution. The distribution + permissions quadrant is empty."

**Honest caveat to acknowledge if asked**: Anthropic could build this. They've shown signs (Compliance API, managed policy settings). Your bet is they'll focus on *their own surface* (Claude Code-only governance) while you cover the cross-tool reality (Claude Code + Cursor + Windsurf + custom agents — anything that speaks the protocol).

---

## Slide 5 — The product (live, in three sentences)

**Visual**: Three boxes, each one screenshot from your actual product.

1. **Skill Registry** — *Versioned skill bundles, scoped to team. One `tag sync` to install.*
2. **MCP Catalog** — *Register internal API/Jira/RAG servers once. Every developer's Claude Code picks them up.*
3. **Tenant-aware RAG** — *Vector search with tenant_id enforced at the SQL layer. Cross-tenant leak is impossible by construction.*

**The product summary line**: *"One CLI command. Five minutes from install to working with team RAG inside Claude Code."*

**What you say** (30 seconds, brief because the demo is next):

> "The product is three things. A registry for AI skills — the Anthropic-format markdown bundles teams want to share. A catalog for MCP servers — internal tools accessible by Claude Code. And tenant-aware RAG — your private knowledge base, scoped by team. All distributed via one CLI command. Let me show you."

**Then transition to the demo.** This slide hands off to the live walkthrough.

---

## Slide 6 — DEMO HOLD

**Visual**: Just your logo and "Demo" in big letters. Or skip the slide entirely and switch screens.

**This is where the 4-minute demo plays.** Refer to the demo script document for narration. Total time including return: 5 minutes.

**On return**: "OK, back to the deck."

---

## Slide 7 — How we win: positioning vs. the field

**Visual**: A clean comparison table. 4 columns, 6 rows.

| | **Team AI Gateway** | Langfuse | Portkey | Anthropic Compliance API |
|---|---|---|---|---|
| **Primary buyer** | Eng team adopting Claude Code | App developer | App developer | Eng + compliance team |
| **Distributes skills** | ✅ | ❌ | ❌ | ❌ |
| **Distributes MCP servers** | ✅ | ❌ | ❌ | ❌ (config only) |
| **Tenant-aware RAG** | ✅ built-in | ❌ | ❌ | ❌ |
| **Multi-model routing** | ✅ via LiteLLM | ❌ | ✅ | ❌ |
| **Self-hostable, MIT-ish** | ✅ | ✅ | ❌ | ❌ |
| **Works without Anthropic plan** | ✅ | ✅ | ✅ | ❌ |

**The bottom line**: *"We're the only product that distributes skills + MCP + RAG by team, self-hostable, and works across model providers."*

**What you say** (45 seconds):

> "Here's how we line up. Langfuse is the leading open-source observability tool — but it doesn't distribute anything. Portkey routes traffic but doesn't manage skills or RAG. Anthropic's own compliance product is observability-only and locks you to their plan. We're the distribution layer — and we're the only ones who solve the cross-tool reality of Claude Code plus Cursor plus custom agents. We're also self-hostable, which kills the data residency objection that closes deals in regulated industries."

**Why this slide is critical**: Investors and partners do their own competitive research. If you don't preempt the comparison, they'll fill in their own (often wrong) version.

---

## Slide 8 — Go-to-market and pricing

**Visual**: Two columns side by side.

**Left column — "Two motions, two markets":**

- **Bottom-up (US)**: Open-source self-host on GitHub. Engineering managers find it. Land at $0, expand to paid hosted version when they hit team scale.
- **Services-led (VN, SE Asia)**: Implementation + support contracts. $5K–10K project setup + $100/hr maintenance. Managed deployment for teams who want zero-ops.

**Right column — "Pricing":**

- **Open source**: Free forever, MIT-licensed core
- **Hosted (per seat)**: $15/dev/mo. Compare: Helicone $79/mo flat, Portkey $49/mo Pro, Anthropic premium seats $30+/dev/mo
- **Enterprise**: Custom. SSO, SAML, audit export, SLA. ~$2K–10K/mo range, in line with the gateway category.

**The line that lands**: *"Open source for adoption, services for SE Asia, hosted SaaS once we have signal — the same playbook that worked for GitLab, Sentry, Langfuse."*

**What you say** (45 seconds):

> "Two motions. In the US: open-source on GitHub, bottom-up adoption by engineering managers, conversion to hosted when teams hit scale. Pricing benchmarked against the category — $15 per developer per month, half of Anthropic's premium seat add-on. In Vietnam and Southeast Asia: services-led. Implementation contracts, $5–10K to get a team set up, $100/hr ongoing. Different markets, different trust patterns, same product. The playbook is GitLab, Sentry, Langfuse — and Langfuse is now valued at over $100M."

**Honest caveat**: If asked "why $15", say it's a starting position based on competitive benchmarks; you'll refine with market data once you have 10+ paying customers.

---

## Slide 9 — Roadmap and what we need

**Visual**: A 3-column timeline.

**Now (Day 0–33)**: MVP. Skill + MCP + RAG registry. Claude Code CLI. LiteLLM routing. Self-hostable. *Status: building, demoable today.*

**Next (Q3 2026)**: Cursor + Windsurf integration. Bundle signing. SSO/SAML. Enterprise audit export. Hosted SaaS launch. *Status: planned.*

**Later (Q4 2026 +)**: Eval harness. Server-side workflow remix (composing MCP servers). Multi-region. Compliance certifications.

**The ask** (be specific):
- *"Looking for"*: 5–10 design partner teams (engineering teams of 5+ devs adopting Claude Code), feedback over a 30-day window in exchange for a free Pro tier for 2 years.
- *"Or"*: Pre-seed conversation, $250K–500K, 18-month runway to hosted GA + first 50 paying customers.

(Adjust the ask based on whether the audience is partner or investor — partner emphasizes design partner slot; investor emphasizes the funding ask.)

**What you say** (30 seconds):

> "Here's the roadmap. The MVP I'm demoing is shipping in 33 days. Q3 we add Cursor and Windsurf, ship hosted SaaS, get SSO. Q4 we go after eval and compliance. What I'm looking for: [tailor to audience]. If you know teams adopting Claude Code who'd benefit from being design partners, that's the highest-value intro right now."

---

## Slide 10 — Why us, why now, last slide

**Visual**: Big, simple. Three bullets, your contact info.

- **Why this works**: Open-source distribution + permissions is a proven category playbook (GitLab, Sentry, Langfuse). New context: AI agents instead of code/errors/LLM traces.
- **Why now**: Claude Code shipped to every paid seat. Shadow MCP just got named by Microsoft. Buyers are forming budgets this quarter.
- **Why me** *(adjust to your actual story)*: [Your background — e.g., "built X at Y, shipped Z to N users, deep in Claude Code workflows since alpha"]. If background is light, lean on velocity: "I built a working demo in 33 days solo. I can ship the next 33 days the same way."

**The closing line**: *"The first 5 design partners shape the product. I'd like you to be one of them."* *(or for investor: "I have the working product. What I need is the runway to land the first 50 customers.")*

**Contact**: Email, GitHub, Calendly link.

**What you say** (30 seconds):

> "I'll close with three things. The category playbook — open-source distribution plus permissions — is well understood; the new context is AI agents. The timing is rare — three signals (Anthropic, Microsoft, Gartner) converging in a single quarter. And I'm building this fast — 33 days from zero to working multi-tenant SaaS, solo. I'd love your help finding the first design partners. Happy to take questions."

---

## What this deck is NOT

A few things this deck doesn't try to do, by design:

- **Not a feature list.** Slide 5 has three boxes. The demo carries the feature story.
- **Not a TAM calculation.** TAM math is fragile; concrete signals (Anthropic + Microsoft + Gartner numbers) carry more weight with sophisticated audiences.
- **Not a defensibility moat slide.** You don't have a moat yet. Honesty serves you better than fake moats. Your moat is execution speed and being first to fill the empty quadrant.
- **Not 20 slides.** 10 is the right length for a 7-minute slot. If they want more, they'll ask for an appendix.

## Common questions and your prepared answers

These will come up. Have crisp answers ready.

**Q: "Why won't Anthropic just build this?"**
A: They might — for Claude Code only. We work across Claude Code, Cursor, Windsurf, custom agents. The cross-tool reality is where most teams actually live. Also: Anthropic optimizes for their plan upsell; we work even if you're on Bedrock or Azure.

**Q: "How is this different from Langfuse?"**
A: Different buyer entirely. Langfuse is for app developers tracing LLM traffic. We're for engineering teams sharing AI tools. We could integrate — pipe our event data to Langfuse if a customer wants their observability there.

**Q: "What's your moat?"**
A: Network effects on the registry — once a tenant has 50 skills and 20 MCP servers configured, switching cost is real. But honestly, in this category, the moat is execution velocity and trust. We win by being usable in 5 minutes and shipping faster than incumbents.

**Q: "What about prompt injection through your RAG?"**
A: Tenant_id is enforced at the SQL layer, not at the LLM layer. A malicious query through the LLM cannot bypass it because the parameter binding happens before the LLM is involved. We have tests that prove cross-tenant queries return zero results.

**Q: "Pricing seems low."**
A: Starting position based on competitive benchmarks. Self-host first, hosted later, paid features (SSO, audit export, SLA) ratchet pricing to $50+/dev/mo at enterprise tier. We're not pricing-led; we're adoption-led.

**Q: "What's your traction?"**
A: [Honest answer — depends on when you pitch.] If pre-launch: "Working product, demoing today. Looking for design partners." If post-launch with users: "X teams, Y developers, Z weeks of usage data. Here's what they're doing differently."

**Q: "Why solo? Where's the team?"**
A: Solo through MVP by design — keeps me close to the user problem. Hiring engineer #2 starts at first paid customer. If you have a great cofounder candidate, I'd love an intro.
