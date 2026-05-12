Two products throughout:
  - OppMon Cloud — the SaaS at oppmon.com. Fast onboarding, managed, multi-tenant.                                                                                                                                                                                                                                  
  - OppMon On-Prem — the same product deployed inside the customer's VPC or air-gapped network. Same code, same UI, your data never leaves.                                                                                                                                                                       
                                                                                                                                                                                                                                                                                                                    
  ---                                                                               
  Section 1 — Hook (use this when you have 10 seconds)                                                                                                                                                                                                                                                              
                                                                                                                                                                                                                                                                                                                    
  ▎ "Your security team won't let your engineers use ChatGPT. OppMon lets them have it anyway — on your infrastructure, with your data, against your models. The whole governance plane comes with it."                                                                                                             
                                                                                                                                                                                                                                                                                                                    
  Variations for different audiences:                                                                                                                                                                                                                                                                               
                                                                                                                                                                                                                                                                                                                    
  - Engineering Leader: "OppMon is the chat + agent platform your engineers want, with the audit trail your CISO needs. Self-hosted in your VPC if compliance demands it."                                                                                                                                          
  - CISO / Security: "Every prompt, tool call, and retrieval routes through one auditable gateway. You decide which models, which teams, which data. We never see prompts."                                                                                                                                         
  - CTO: "Replace seven shadow-IT AI tools with one platform. Skills, RAG, MCP, observability, and the chat UI — yours to self-host."                                                                                                                                                                               
                                                                                                                                                                                                                                                                                                                    
  ---                                                                                                                                                                                                                                                                                                               
  Section 2 — Problem (the actual pain you're selling against)                                                                                                                                                                                                                                                      
                                                                                                                                                                                                                                                                                                                    
  Engineers want Cursor, Claude Desktop, and ChatGPT. Security teams blocked them. The compromise — Copilot — sends code to a vendor cloud and doesn't extend to RAG/agent/MCP use cases. Meanwhile:

  1. Shadow IT is rampant. Engineers paste code into personal ChatGPT accounts. Procurement has no idea, security can't audit, IP exposure is uncapped.
  2. Existing tools don't compose. Langfuse observes. Portkey routes. OpenWebUI chats. Continue.dev codes. None of them give one team a governed AI workspace.
  3. On-prem is a desert. Customers running Ollama, vLLM, or LM Studio internally have model weights but no enterprise UI, no team RAG, no audit log, no skills marketplace. They're building it themselves badly.
  4. Cloud LLM contracts are tense. Legal won't sign Anthropic/OpenAI BAAs for everything. Healthcare, finance, defense, EU public sector — many use cases can't go to a vendor cloud at all.

  OppMon fixes all four.

  ---
  Section 3 — Product, in 60 seconds

  OppMon is a self-hostable AI gateway and agent workspace with five components, sold as one product:

  1. Chat with a live agent graph. Engineers ask multi-step questions; the agent decomposes into sub-questions, runs each through web search or your private RAG, and synthesizes — with the reasoning visible on a side panel.
  2. Tenant-aware RAG. Vector search with row-level tenancy at the SQL layer. Cross-tenant data leakage is structurally impossible, not just policy-enforced.
  3. Skill & MCP registry. Versioned skill bundles and MCP servers, scoped to teams. One oppmon sync and every developer's Claude Code, Cursor, or terminal picks them up.
  4. Privacy-first analytics. We track which resources (skills, MCP servers, RAG queries) get used — never the prompt or response content. CISO-safe by design.
  5. Model gateway. Bring your own — Anthropic, OpenAI, Cerebras, AWS Bedrock, Azure OpenAI, local Ollama, vLLM. Per-team routing rules, cost budgets, audit log per call.

  All of it is source-available (BSL 1.1) so security teams can read the code before they buy.

  ---
  Section 4 — The two editions, side by side

  ┌─────────────────────┬─────────────────────────────────────┬───────────────────────────────────────────────────┐
  │                     │            OppMon Cloud             │                  OppMon On-Prem                   │
  ├─────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────┤
  │ Deployment          │ Multi-tenant SaaS at oppmon.com     │ Customer's VPC, air-gap supported                 │
  ├─────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────┤
  │ Time to value       │ 5 minutes                           │ 1–3 days (with our help)                          │
  ├─────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────┤
  │ Data residency      │ Our infrastructure (US, EU options) │ Customer-controlled                               │
  ├─────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────┤
  │ Model routing       │ Public LLMs + customer BYOK         │ Public LLMs + private (Ollama/vLLM/Bedrock/Azure) │
  ├─────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────┤
  │ Skills/MCP registry │ Per-tenant                          │ Per-tenant, fully offline                         │
  ├─────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────┤
  │ Audit log           │ 90 days included, longer via add-on │ Unbounded, customer-controlled                    │
  ├─────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────┤
  │ SSO/SAML/SCIM       │ Pro tier and up                     │ Always available                                  │
  ├─────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────┤
  │ Compliance          │ SOC 2 (in progress)                 │ HIPAA / SOC 2 / FedRAMP ready (customer-owned)    │
  ├─────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────┤
  │ Pricing             │ Per-user subscription               │ Annual contract                                   │
  └─────────────────────┴─────────────────────────────────────┴───────────────────────────────────────────────────┘

  ---
  Section 5 — Four concrete buyer profiles you can target

  For each: the trigger, the wedge, what you sell first.

  A. Mid-market engineering org (200–1500 engineers)

  - Trigger: "Procurement just denied Cursor for the third time."
  - Wedge: OppMon Cloud Pro for one team, 30-day pilot. They get the chat + graph + skills registry. Security gets the per-call audit log.
  - Expansion: Roll out to all engineering. Add MCP registry for internal API access. Upsell to per-team RAG.
  - Land: $50/user/mo. Expand: $200/team/mo + per-user.

  B. Regulated industry (healthcare, finance, legal)

  - Trigger: "We need AI productivity but legal won't approve sending records to OpenAI."
  - Wedge: OppMon On-Prem in their VPC, connected to their existing Azure OpenAI or AWS Bedrock instance, RAG against their internal docs (HIPAA-shaped if healthcare).
  - Expansion: Add more teams. Add audit retention for compliance. Add air-gapped Ollama for the most sensitive workflows.
  - Land: $80k–$150k year one. Expand: $250k+ ARR by year two.

  C. Defense / public sector / sovereign cloud

  - Trigger: "We have GPUs and Llama-70B running. Now what?"
  - Wedge: OppMon On-Prem connected to their existing vLLM cluster. Full air-gap install. Skills registry seeded with their playbooks.
  - Expansion: Add second tenant org. Add FedRAMP-relevant audit features. Multi-classification routing.
  - Land: $150k–$500k. Expand: Multi-year contract.

  D. AI-native startup (Series A–B, 20–80 engineers)

  - Trigger: "We're shipping AI features and our prompt engineering chaos is unmanageable."
  - Wedge: OppMon Cloud Team plan. Skills registry for prompt versioning. RAG for product docs. Observability for cost.
  - Expansion: Move to On-Prem once they have a real product + enterprise customers asking for it.
  - Land: $1k–$3k/mo. Expand: $30k+ when they hit enterprise sales motion.

  ---
  Section 6 — Competitive positioning (when buyers ask "isn't this Langfuse/Cursor/Bedrock?")

  ┌───────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │         If they say…          │                                                                                                          You say…                                                                                                          │
  ├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ "We already have Langfuse"    │ "Langfuse observes. OppMon governs and serves. We have a chat UI, RAG, MCP registry, skills bundles. Langfuse can sit behind OppMon as your trace destination."                                                            │
  ├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ "We use Cursor / Copilot"     │ "Those are IDE plugins. OppMon is the platform behind them — the RAG, skills, MCP servers, audit log, and team policies. They consume from OppMon."                                                                        │
  ├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ "We're on AWS Bedrock"        │ "Use it as a provider. OppMon routes to Bedrock just like it routes to Anthropic. We add the team/tenant/skills/audit layer Bedrock doesn't."                                                                              │
  ├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ "We're using OpenWebUI"       │ "OpenWebUI is single-user chat. OppMon is team chat + governance + skills + MCP. When you grow past 10 users, you'll want what we have."                                                                                   │
  ├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ "We can build this ourselves" │ "Sure — Langfuse + Helicone + a homegrown skill bundle system + an MCP shim + per-team RAG with RLS is 12 months of work. We've done it. The BSL license means you can read every line first."                             │
  ├───────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ "Why not OpenAI Enterprise?"  │ "OpenAI Enterprise gives you the LLM. OppMon gives you the workspace around it — agents, RAG, skills, MCP. We work with OpenAI Enterprise. We also work without it, for customers who can't or won't send data to OpenAI." │
  └───────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  ---
  Section 7 — The "why now" (the macro hook)

  Use one or two of these depending on audience:

  - "MCP is becoming the de-facto standard for AI tool access. Companies need a place to register, version, and govern their MCP servers. OppMon is that place."
  - "The post-Cursor wave: every engineering team wants an agent stack, but only 5% of them want to build it. The next 95% will buy."
  - "EU AI Act enforcement (Aug 2026) plus GDPR plus HIPAA plus state-level US AI laws — compliance teams are about to demand audit-on-prompt logging. OppMon ships with it."
  - "On-prem LLMs are now genuinely competitive (Llama 3.3, Qwen, DeepSeek). The blocker is no longer model quality — it's the missing platform around them."

  ---
  Section 8 — Ready-to-send artifacts

  Cold email (Cloud — engineering leader)

  ▎ Subject: A workaround for the Cursor procurement block
  ▎
  ▎ Hi {first},
  ▎
  ▎ A lot of engineering orgs I talk to are stuck in the same loop right now: engineers want Cursor / Claude / ChatGPT, security blocks it, leadership tells everyone to "find a way." Meanwhile productivity stalls.
  ▎
  ▎ We built OppMon for exactly that gap. It's the AI workspace your engineers want — chat with live agent reasoning, team-scoped RAG, a skills registry, MCP server catalog — with the audit log and per-team policies your security team is asking for. Same product runs as SaaS or in your own VPC.
  ▎
  ▎ The code is source-available (BSL 1.1) so security can read it before approval.
  ▎
  ▎ Worth a 20-minute look? I can show you a 5-minute demo and a live agent graph that makes the difference instantly obvious. Calendly: {link}
  ▎
  ▎ {sig}

  Cold email (On-Prem — CISO / compliance officer)

  ▎ Subject: AI productivity and a clean audit trail (yes, both)
  ▎
  ▎ Hi {first},
  ▎
  ▎ Most AI tools force you to pick: ship productivity with a vendor cloud and accept the data exfiltration risk, or block everything and watch shadow-IT bloom anyway.
  ▎
  ▎ OppMon On-Prem is a different shape. It deploys inside your VPC (air-gap optional), routes to whichever models you allow — Anthropic, Azure OpenAI, AWS Bedrock, or local Ollama/vLLM — and logs every prompt, tool call, and retrieval through a single auditable gateway. Privacy-first analytics by default:
  ▎ we track resource usage, never content.
  ▎
  ▎ Source-available (BSL 1.1). Your security team reads the code first. We've worked with {2 named customers / verticals} on similar deployments.
  ▎
  ▎ Worth a call? Happy to send our security one-pager + SOC 2 status ahead of time.
  ▎
  ▎ {sig}

  Demo script (5-minute version)

  1. 0:00–0:30 — "Watch this. The agent is going to decompose the question, search the web for each sub-piece, and show you the reasoning." Type compound question. Graph grows live. Final answer renders.
  2. 0:30–1:30 — Switch to Skills view. "Here's our internal API skill, versioned, scoped to the platform team. One oppmon sync and every developer's Cursor and Claude Code can call this skill from their terminal."
  3. 1:30–2:30 — Switch to RAG admin. Show three collections, each with team-level access. "Customer support team can RAG against the support docs. Engineering team can't see it. SQL-layer enforcement, not policy-enforced."
  4. 2:30–3:30 — Switch to Analytics. "Resource usage by team. Cost by model. Note what's not here: prompts. We don't see them. Your CISO doesn't need to trust us with content."
  5. 3:30–4:30 — Switch to Models. "Anthropic, OpenAI, Cerebras, your local Ollama — same UI. Per-team routing rules. Budget caps. Audit per call."
  6. 4:30–5:00 — Close: "Cloud trial in 5 minutes. On-prem deployment in 1–3 days with us. License is BSL — your team reads the code first."

  Pricing (placeholder ranges — sanity-check before quoting)

  OppMon Cloud
  - Free: 1 user, public LLMs only, no SSO. Goal: hook individual devs.
  - Pro: $50/user/mo. All features. Up to 3 teams. Goal: small teams self-serve.
  - Team: $200/team/mo + $30/user/mo. SSO, audit, custom RAG retention. Goal: 50–500 user orgs.
  - Enterprise: custom. SAML, SCIM, SLA, dedicated CSM, custom audit retention. Goal: F2000 land.

  OppMon On-Prem
  - Starter: $50k/yr. Up to 100 users, single environment. Goal: regulated mid-market.
  - Enterprise: $120k–$300k/yr. Unlimited users, multiple environments, 24/7 support, FedRAMP/HIPAA assistance.
  - Sovereign / Air-gap: $300k+ / yr. Includes deployment services, custom integration, classified networking compatibility.

  Objection handlers (top 5)

  1. "BSL isn't real open source." → "Correct. Source-available — fully readable, fully self-hostable for your internal use. The only thing BSL forbids is reselling OppMon as a competing managed service. Every release converts to Apache 2.0 after four years. The Sentry / HashiCorp / CockroachDB playbook."
  2. "What if you go out of business?" → "Source-available means you keep running it forever. Every release converts to Apache 2.0 after four years automatically — no rug pulls possible. We can also do a code-escrow arrangement for Enterprise contracts."
  3. "How is this different from Bedrock + a Streamlit app?" → "Tenant-aware RAG with SQL-level isolation, a skills registry with versioning, an MCP catalog, per-team policy, audit logging, privacy-first analytics, a graph agent UI. Building that on Bedrock is 6–12 months of engineering. We're 3 days to
  deploy."
  4. "Can you handle our compliance requirements?" → "On-Prem deploys in your VPC with your existing compliance posture. We provide the SOC 2 / HIPAA / FedRAMP architecture docs. The Cloud product is SOC 2 in progress; we can defer to On-Prem for your most sensitive workflows."
  5. "What happens to my data?" → Cloud: "Stored encrypted in our infrastructure. We don't train on prompts. Privacy-first analytics by design — we track resource usage, not content." On-Prem: "Never leaves your network. We don't even have access."

  ---
  Section 9 — What I'd flesh out if you give me the inputs

  A few things I deliberately punted on because they need your real data:

  1. Pricing benchmarks. I gave ranges. Tighten by quoting where you've actually landed customers, or where the comparable product (Helicone Pro is $1k/mo, Langfuse Enterprise starts ~$60k, etc.) anchors.
  2. Logos / case studies. If you have any pilot customers — even one — putting their logo on slide 1 is worth more than all the rest combined.
  3. Cost-of-ownership math. Pre-built spreadsheet: "Cursor for 200 engineers = $80k/yr. Cursor + Langfuse + custom RAG + Copilot for Business = $250k/yr and you still don't have MCP. OppMon Team = $120k/yr. Or self-host for $0."
  4. The investor deck cut. Different beast — the seed pitch leads with market timing and team rather than product. I can build that variant if you're raising.

  Want me to:
  - (a) Tighten this into a 10-slide deck outline (titles + 3 bullets each)
  - (b) Build the cost-of-ownership ROI sheet
  - (c) Cut a different version (founder-investor, customer success email, partner deck, etc.)
  - (d) Build a landing-page hero block (copy + suggested layout) for oppmon.com itself