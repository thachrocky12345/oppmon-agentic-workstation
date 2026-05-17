// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

import { CodeSnippet, TutorialSection, FeatureCard } from '@/components/tutorial'
import Link from 'next/link'

/* ------------------------------------------------------------------------ */
/* Inline terminal mock (matches the live oppmon CLI output)                 */
/* ------------------------------------------------------------------------ */

function TerminalWindow({
  title = 'pwsh — admin',
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0a0c0e] shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.04] border-b border-white/10">
        <span className="w-3 h-3 rounded-full bg-red-500/80" />
        <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
        <span className="w-3 h-3 rounded-full bg-green-500/80" />
        <span className="ml-3 text-xs text-gray-400 font-mono">{title}</span>
      </div>
      <div className="p-5 font-mono text-[13px] leading-relaxed text-gray-200 overflow-x-auto">
        {children}
      </div>
    </div>
  )
}

const Dim = ({ children }: { children: React.ReactNode }) => (
  <span className="text-gray-500">{children}</span>
)

/* ------------------------------------------------------------------------ */

export default function AdminGuidePage() {
  return (
    <div className="space-y-12">
      {/* ---------------- Header ---------------- */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-medium mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
          Admin Guide
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">Admin Guide</h1>
        <p className="text-gray-400 text-lg max-w-3xl">
          Govern the OppMon AI Gateway — tenants &amp; teams, model routing, virtual keys, skills
          &amp; MCP servers, RAG collections, audit, and usage. Everything has both a UI and a CLI
          path.
        </p>

        <div className="mt-6 grid sm:grid-cols-3 gap-3">
          <Link href="/admin" className="rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 px-4 py-3 transition-colors">
            <p className="text-xs text-purple-300/80">Live</p>
            <p className="text-purple-300 font-medium">Open Admin Panel →</p>
          </Link>
          <Link href="/docs/cli-setup" className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-3 transition-colors">
            <p className="text-xs text-gray-500">Prereq</p>
            <p className="text-white font-medium">CLI Setup →</p>
          </Link>
          <Link href="/docs/workflows" className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-3 transition-colors">
            <p className="text-xs text-gray-500">Daily use</p>
            <p className="text-white font-medium">Coding Workflows →</p>
          </Link>
        </div>
      </div>

      {/* ---------------- Roles overview ---------------- */}
      <TutorialSection
        id="roles"
        icon={
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        }
        iconBg="bg-purple-500/20"
        title="Roles & RBAC"
        description="Who can do what — enforced by JWT claims and the rbac middleware."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 text-gray-400 font-medium">Role</th>
                <th className="text-left py-2 text-gray-400 font-medium">Scope</th>
                <th className="text-left py-2 text-gray-400 font-medium">Capabilities</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <tr className="border-b border-white/5">
                <td className="py-3 font-medium text-red-300">SYSTEM_ADMIN</td>
                <td className="py-3 text-gray-400">Cross-tenant</td>
                <td className="py-3 text-gray-400">Full platform — manage tenants, infra, all settings.</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 font-medium text-orange-300">TENANT_ADMIN</td>
                <td className="py-3 text-gray-400">Single tenant</td>
                <td className="py-3 text-gray-400">Teams, models, virtual keys, skills, MCP, RAG, audit within their tenant.</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 font-medium text-yellow-300">TEAM_ADMIN</td>
                <td className="py-3 text-gray-400">Single team</td>
                <td className="py-3 text-gray-400">Manage team members, team-scoped skills, team RAG collections.</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 font-medium text-blue-300">DEVELOPER</td>
                <td className="py-3 text-gray-400">Self</td>
                <td className="py-3 text-gray-400">Use models &amp; skills, run RAG queries, see own usage.</td>
              </tr>
              <tr>
                <td className="py-3 font-medium text-gray-300">VIEWER</td>
                <td className="py-3 text-gray-400">Read-only</td>
                <td className="py-3 text-gray-400">Dashboards and audit logs, no mutations.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-gray-500 text-xs mt-4">
          The web edge middleware redirects admin roles (<code>SYSTEM_ADMIN</code>,{' '}
          <code>TENANT_ADMIN</code>, <code>TEAM_ADMIN</code>) to <code>/admin</code> after login;
          everyone else lands on <code>/dashboard</code>.
        </p>
      </TutorialSection>

      {/* ---------------- Accessing admin panel ---------------- */}
      <TutorialSection
        id="accessing-admin"
        icon={
          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        }
        iconBg="bg-blue-500/20"
        title="Accessing the Admin Panel"
      >
        <div className="space-y-5">
          <ol className="space-y-2 text-gray-300">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-xs font-bold flex items-center justify-center">1</span>
              <span>
                Navigate to{' '}
                <Link href="/admin" className="text-green-400 hover:underline">/admin</Link>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-xs font-bold flex items-center justify-center">2</span>
              <span>Log in with an admin role (<code>SYSTEM_ADMIN</code> / <code>TENANT_ADMIN</code> / <code>TEAM_ADMIN</code>)</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-xs font-bold flex items-center justify-center">3</span>
              <span>You&apos;re routed to the admin dashboard — the sidebar shows every section your role can manage</span>
            </li>
          </ol>

          <div>
            <h4 className="text-white font-semibold mb-2">Sections at a glance</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 text-gray-400 font-medium">Section</th>
                    <th className="text-left py-2 text-gray-400 font-medium">Path</th>
                    <th className="text-left py-2 text-gray-400 font-medium">Purpose</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  {[
                    ['Overview', '/admin', 'Platform health + quick links'],
                    ['Teams', '/admin/teams', 'Create teams, manage members and team-level defaults'],
                    ['AI Models', '/admin/models', 'Configure providers (Anthropic / OpenAI / Cerebras / Ollama / Bedrock / Azure)'],
                    ['Virtual Keys', '/admin/virtual-keys', 'Mint scoped keys for downstream services'],
                    ['Skills', '/admin/skills', 'Skill registry — create, version, scope, publish'],
                    ['MCP Servers', '/admin/mcp', 'Register and distribute MCP server configs'],
                    ['RAG', '/admin/rag', 'Collections, documents, chunks, embeddings'],
                    ['Usage', '/admin/usage', 'Skill + MCP tool invocation analytics'],
                    ['LLM Usage', '/admin/llm-usage', 'Token counts and costs per provider/model'],
                    ['Audit Log', '/admin/audit', 'Append-only activity trail per tenant'],
                  ].map(([name, path, desc]) => (
                    <tr key={path} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2.5 font-medium">{name}</td>
                      <td className="py-2.5"><Link href={path} className="text-green-400 hover:underline font-mono text-xs">{path}</Link></td>
                      <td className="py-2.5 text-gray-400">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Feature cards ---------------- */}
      <TutorialSection
        id="features"
        icon={
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
        iconBg="bg-green-500/20"
        title="Capabilities"
        description="Quick jump to deeper docs"
      >
        <div className="grid md:grid-cols-2 gap-4">
          <FeatureCard
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
            iconColor="text-blue-400"
            title="Teams"
            description="Create teams, invite members, set quotas, and pick default models / skills."
            href="/admin/teams"
          />
          <FeatureCard
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
            iconColor="text-purple-400"
            title="AI Models"
            description="Wire up providers, validate credentials, set fallback chains, expose models to teams."
            href="/admin/models"
          />
          <FeatureCard
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7h3a5 5 0 015 5v.5a4.5 4.5 0 01-4.5 4.5H15M9 17H6a5 5 0 01-5-5v-.5A4.5 4.5 0 015.5 7H9m-3 5h12" />
              </svg>
            }
            iconColor="text-emerald-400"
            title="Virtual Keys"
            description="Per-team / per-service keys that proxy through the LiteLLM router with budgets and usage tracking."
            href="/admin/virtual-keys"
          />
          <FeatureCard
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            }
            iconColor="text-orange-400"
            title="Skills Registry"
            description="Author, version, and scope skills (team / tenant / public)."
            href="/admin/skills"
          />
          <FeatureCard
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            }
            iconColor="text-cyan-400"
            title="RAG Collections"
            description="Upload documents, manage chunks/embeddings, control collection scope."
            href="/admin/rag"
          />
          <FeatureCard
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
            iconColor="text-pink-400"
            title="Usage Analytics"
            description="Skills + MCP invocations, LLM token consumption, per-team cost breakdowns."
            href="/admin/usage"
          />
        </div>
      </TutorialSection>

      {/* ---------------- Provisioning a team ---------------- */}
      <TutorialSection
        id="provision-team"
        icon={<span className="text-lg font-bold text-blue-400">A</span>}
        iconBg="bg-blue-500/20"
        title="Provision a New Team"
      >
        <div className="space-y-5">
          <div className="grid md:grid-cols-3 gap-3">
            {[
              { n: 1, t: 'Create', d: '/admin/teams → New team. Pick a slug, default model, and quota.' },
              { n: 2, t: 'Invite', d: 'Add members by email; assign DEVELOPER / TEAM_ADMIN.' },
              { n: 3, t: 'Defaults', d: 'Pin a default model + skill set; members inherit them.' },
            ].map((s) => (
              <div key={s.n} className="rounded-lg bg-white/5 border border-white/10 p-4">
                <div className="text-xs text-blue-400 font-mono">STEP {s.n}</div>
                <div className="text-white font-semibold mt-1">{s.t}</div>
                <div className="text-gray-400 text-sm mt-1">{s.d}</div>
              </div>
            ))}
          </div>
          <div>
            <h4 className="text-white font-semibold mb-2">Or via API (scripted)</h4>
            <CodeSnippet
              code={`curl -X POST http://localhost:3001/api/teams \\
  -H "Authorization: Bearer $TAG_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Platform Eng",
    "slug": "platform-eng",
    "defaultModelId": "<modelId>",
    "monthlyTokenQuota": 5000000
  }'`}
              language="bash"
            />
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Configuring a model ---------------- */}
      <TutorialSection
        id="configure-model"
        icon={<span className="text-lg font-bold text-purple-400">B</span>}
        iconBg="bg-purple-500/20"
        title="Configure an AI Model"
      >
        <div className="space-y-5">
          <ol className="space-y-3 text-gray-300">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 text-xs font-bold flex items-center justify-center">1</span>
              <div>
                <p className="text-white font-medium">Go to <Link href="/admin/models" className="text-green-400 hover:underline">/admin/models</Link></p>
                <p className="text-gray-400 text-sm">Pick a provider — Anthropic, OpenAI, Cerebras, Ollama, Bedrock, Azure, or any OpenAI-compatible endpoint.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 text-xs font-bold flex items-center justify-center">2</span>
              <div>
                <p className="text-white font-medium">Paste credentials &amp; validate</p>
                <p className="text-gray-400 text-sm">The connection-validator hits a provider-specific health endpoint and reports success/failure before the model is enabled.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 text-xs font-bold flex items-center justify-center">3</span>
              <div>
                <p className="text-white font-medium">Set rate limits + fallback</p>
                <p className="text-gray-400 text-sm">Tokens/min and requests/min. Optionally pick a fallback model for when this one errors or rate-limits.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 text-xs font-bold flex items-center justify-center">4</span>
              <div>
                <p className="text-white font-medium">Expose to teams</p>
                <p className="text-gray-400 text-sm">Allow-list teams that can consume this model.</p>
              </div>
            </li>
          </ol>

          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-sm text-emerald-100">
            <strong className="text-emerald-300">Auto-rebuilt:</strong> when you save a model, the
            backend regenerates the LiteLLM config and reloads the proxy router so virtual keys
            pick up the change immediately. (See{' '}
            <code>litellm-config-generator.ts</code> + <code>litellm-orchestrator.ts</code>.)
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Virtual keys ---------------- */}
      <TutorialSection
        id="virtual-keys"
        icon={<span className="text-lg font-bold text-emerald-400">C</span>}
        iconBg="bg-emerald-500/20"
        title="Mint a Virtual Key"
      >
        <div className="space-y-4">
          <p className="text-gray-300">
            Virtual keys are per-team / per-service tokens routed through the LiteLLM proxy. They
            carry budget caps and are revocable from the UI.
          </p>
          <ol className="space-y-2 text-gray-300 text-sm">
            <li>1. <Link href="/admin/virtual-keys" className="text-green-400 hover:underline">/admin/virtual-keys</Link> → New key</li>
            <li>2. Pick the team, allowed models, monthly budget</li>
            <li>3. Copy the key once — it&apos;s shown one time and stored hashed</li>
          </ol>
          <CodeSnippet
            code={`# Use the virtual key against the gateway
curl -X POST http://localhost:3001/api/llm/chat \\
  -H "Authorization: Bearer vk_..." \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Hello"}],"model":"<modelId>"}'`}
            language="bash"
          />
        </div>
      </TutorialSection>

      {/* ---------------- Skills + MCP via CLI ---------------- */}
      <TutorialSection
        id="skills-mcp"
        icon={<span className="text-lg font-bold text-orange-400">D</span>}
        iconBg="bg-orange-500/20"
        title="Manage Skills & MCP Servers (CLI)"
      >
        <div className="space-y-5">
          <p className="text-gray-300">
            Admins typically curate the skill + MCP set from a single dev machine, push to the
            registry, and let team members pull. From the repo root:
          </p>
          <CodeSnippet
            code={`# Skills
pnpm oppmon:sync skills list      # show local vs remote diff
pnpm oppmon:sync skills push      # upload all local skills
pnpm oppmon:sync skills pull      # download all remote skills

# MCP servers
pnpm oppmon:sync mcp list
pnpm oppmon:sync mcp push
pnpm oppmon:sync mcp pull`}
            language="bash"
          />
          <TerminalWindow title="oppmon sync skills list">
            <div className="text-white font-bold">Skill Sync Status</div>
            <div className="mt-3 text-gray-300">  <span className="text-green-400">✓ in-sync</span>     /commit                <Dim>(v3, 2 days ago)</Dim></div>
            <div className="text-gray-300">  <span className="text-green-400">✓ in-sync</span>     /review-pr             <Dim>(v7, 5 days ago)</Dim></div>
            <div className="text-gray-300">  <span className="text-yellow-400">↑ local-only</span>  /spec-driven-coding    <Dim>(unpublished draft)</Dim></div>
            <div className="text-gray-300">  <span className="text-cyan-400">↓ remote-only</span> /audit-pipeline        <Dim>(v1)</Dim></div>
          </TerminalWindow>
          <p className="text-gray-500 text-sm">
            Use <Link href="/admin/skills" className="text-green-400 hover:underline">/admin/skills</Link>{' '}
            to set scope (team / tenant / public) and freeze a version once published.
          </p>
        </div>
      </TutorialSection>

      {/* ---------------- RAG admin ---------------- */}
      <TutorialSection
        id="rag-admin"
        icon={<span className="text-lg font-bold text-cyan-400">E</span>}
        iconBg="bg-cyan-500/20"
        title="RAG — Collections & Documents"
      >
        <div className="space-y-5">
          <ol className="space-y-3 text-gray-300">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-bold flex items-center justify-center">1</span>
              <div>
                <p className="text-white font-medium">Create a collection at <Link href="/admin/rag" className="text-green-400 hover:underline">/admin/rag</Link></p>
                <p className="text-gray-400 text-sm">Pick scope: <code>tenant</code> (all teams in your tenant) or <code>team</code> (single team).</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-bold flex items-center justify-center">2</span>
              <div>
                <p className="text-white font-medium">Upload documents</p>
                <p className="text-gray-400 text-sm">PDF / DOCX / Markdown / plain-text. Files are saved to the API&apos;s document volume; chunks + embeddings live in Postgres.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-bold flex items-center justify-center">3</span>
              <div>
                <p className="text-white font-medium">Or bulk-ingest from CLI</p>
                <CodeSnippet
                  code={`pnpm oppmon:rag ingest README.md              # single file
pnpm oppmon:rag ingest-dir ./docs             # whole tree
pnpm oppmon:rag list                          # what's indexed
pnpm oppmon:rag stats                         # chunk + embedding counts`}
                  language="bash"
                />
              </div>
            </li>
          </ol>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-100">
            <strong className="text-blue-300">Re-index when content changes.</strong> Updating a
            file in the UI rebuilds chunks + embeddings; deletions cascade to chunks and remove
            the on-disk file.
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Usage + audit ---------------- */}
      <TutorialSection
        id="usage-audit"
        icon={<span className="text-lg font-bold text-pink-400">F</span>}
        iconBg="bg-pink-500/20"
        title="Usage Analytics & Audit"
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Link href="/admin/usage" className="rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 p-5 transition-colors block">
            <p className="text-xs text-pink-300 font-mono">CLAUDE CODE ACTIVITY</p>
            <p className="text-white font-semibold mt-1">Usage Dashboard →</p>
            <p className="text-gray-400 text-sm mt-2">Skill invocations, MCP tool calls, captured via CLI hooks. Filter by user / team / time range.</p>
          </Link>
          <Link href="/admin/llm-usage" className="rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 p-5 transition-colors block">
            <p className="text-xs text-pink-300 font-mono">LLM CONSUMPTION</p>
            <p className="text-white font-semibold mt-1">LLM Usage Dashboard →</p>
            <p className="text-gray-400 text-sm mt-2">Per-provider / per-model token counts and cost. Captured server-side by the API.</p>
          </Link>
          <Link href="/admin/audit" className="rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 p-5 transition-colors block md:col-span-2">
            <p className="text-xs text-pink-300 font-mono">COMPLIANCE</p>
            <p className="text-white font-semibold mt-1">Audit Log →</p>
            <p className="text-gray-400 text-sm mt-2">Append-only record of admin mutations (model edits, key rotations, member changes). Tenant-scoped, signed at write-time.</p>
          </Link>
        </div>
      </TutorialSection>

      {/* ---------------- Best practices ---------------- */}
      <TutorialSection
        id="best-practices"
        icon={
          <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        }
        iconBg="bg-yellow-500/20"
        title="Best Practices"
      >
        <div className="grid md:grid-cols-2 gap-5">
          <div className="rounded-lg bg-white/5 border border-white/10 p-5">
            <h4 className="text-white font-semibold mb-3">🔒 Security</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li className="flex items-start gap-2"><span className="text-green-400">•</span>Review the audit log weekly</li>
              <li className="flex items-start gap-2"><span className="text-green-400">•</span>Rotate provider credentials and virtual keys quarterly</li>
              <li className="flex items-start gap-2"><span className="text-green-400">•</span>Keep <code>SYSTEM_ADMIN</code> count ≤ 2 per environment</li>
              <li className="flex items-start gap-2"><span className="text-green-400">•</span>Use OAuth login over password whenever possible</li>
            </ul>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-5">
            <h4 className="text-white font-semibold mb-3">👥 Teams</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li className="flex items-start gap-2"><span className="text-green-400">•</span>One <code>TEAM_ADMIN</code> per team minimum, two preferred</li>
              <li className="flex items-start gap-2"><span className="text-green-400">•</span>Set monthly token quotas — fail loud, not silently</li>
              <li className="flex items-start gap-2"><span className="text-green-400">•</span>Review inactive members quarterly; archive dead teams</li>
              <li className="flex items-start gap-2"><span className="text-green-400">•</span>Pin team default model so usage is predictable</li>
            </ul>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-5">
            <h4 className="text-white font-semibold mb-3">🤖 Models</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li className="flex items-start gap-2"><span className="text-green-400">•</span>Validate credentials before exposing to teams</li>
              <li className="flex items-start gap-2"><span className="text-green-400">•</span>Always configure a fallback model</li>
              <li className="flex items-start gap-2"><span className="text-green-400">•</span>Start rate limits low; raise after observing real traffic</li>
              <li className="flex items-start gap-2"><span className="text-green-400">•</span>Monitor <Link href="/admin/llm-usage" className="text-green-400 hover:underline">LLM Usage</Link> for drift</li>
            </ul>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-5">
            <h4 className="text-white font-semibold mb-3">📚 RAG &amp; Skills</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li className="flex items-start gap-2"><span className="text-green-400">•</span>Re-ingest docs on schema or major doc changes</li>
              <li className="flex items-start gap-2"><span className="text-green-400">•</span>Version skills before publishing (no silent overrides)</li>
              <li className="flex items-start gap-2"><span className="text-green-400">•</span>Use <code>team</code> scope for proprietary content, <code>tenant</code> for shared</li>
              <li className="flex items-start gap-2"><span className="text-green-400">•</span>Archive outdated skills rather than deleting (audit trail)</li>
            </ul>
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Troubleshooting ---------------- */}
      <TutorialSection
        id="admin-troubleshooting"
        icon={
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
        iconBg="bg-red-500/20"
        title="Admin Troubleshooting"
      >
        <div className="space-y-3">
          {[
            {
              q: 'Login bounces back to /login after idle',
              a: <>JWTs must include <code>iss: &apos;oppmon&apos;</code> for the web edge middleware to accept them. Restart <code>pnpm dev:api</code> if you&apos;re on an older build.</>,
            },
            {
              q: 'Admin redirects to /dashboard after login',
              a: <>The user lacks an admin role. Check <Link href="/admin/teams" className="text-green-400 hover:underline">/admin/teams</Link> and grant <code>TENANT_ADMIN</code> or <code>TEAM_ADMIN</code>.</>,
            },
            {
              q: 'Model save succeeds but virtual keys still hit the old config',
              a: <>The LiteLLM router reload is async. Wait 5-10s, or restart <code>apps/router</code>. If the issue persists, inspect <code>litellm-orchestrator.ts</code> logs for reload errors.</>,
            },
            {
              q: 'CLI shows skills as out-of-sync after I edited them in the UI',
              a: <>Run <code className="text-green-400">pnpm oppmon:sync skills pull</code> to refresh the local checkout, or <code className="text-green-400">pnpm oppmon:sync skills push</code> to overwrite remote with local.</>,
            },
            {
              q: 'RAG queries return “no relevant context”',
              a: <>Confirm the user has access to the collection (team scope) and that documents were embedded successfully — check <code>pnpm oppmon:rag stats</code> or <Link href="/admin/rag" className="text-green-400 hover:underline">/admin/rag</Link>.</>,
            },
            {
              q: 'LLM Usage shows zero despite active chat',
              a: <>Make sure the chat traffic is going through <code>/api/llm/*</code> (not direct to provider). LiteLLM proxy logs are the source of truth.</>,
            },
          ].map((item) => (
            <details key={item.q} className="rounded-lg bg-white/5 border border-white/10 group">
              <summary className="cursor-pointer px-4 py-3 text-white font-medium flex items-center justify-between">
                <span>{item.q}</span>
                <svg className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-4 pb-4 text-gray-400 text-sm">{item.a}</div>
            </details>
          ))}
        </div>
      </TutorialSection>

      {/* ---------------- Keyboard shortcuts ---------------- */}
      <TutorialSection
        id="keyboard-shortcuts"
        icon={
          <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
          </svg>
        }
        iconBg="bg-cyan-500/20"
        title="Keyboard Shortcuts (Admin)"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 text-gray-400 font-medium">Shortcut</th>
                <th className="text-left py-2 text-gray-400 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {[
                ['g t', 'Go to Teams'],
                ['g m', 'Go to Models'],
                ['g v', 'Go to Virtual Keys'],
                ['g s', 'Go to Skills'],
                ['g p', 'Go to MCP Servers'],
                ['g r', 'Go to RAG'],
                ['g u', 'Go to Usage'],
                ['g l', 'Go to LLM Usage'],
                ['g a', 'Go to Audit Log'],
                ['?',   'Show all shortcuts'],
              ].map(([k, label]) => (
                <tr key={k} className="border-b border-white/5">
                  <td className="py-2"><kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono">{k}</kbd></td>
                  <td className="py-2 text-gray-400">{label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TutorialSection>

      {/* ---------------- Footer ---------------- */}
      <div className="rounded-xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-white/10 p-6 flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold mb-1">Need to dig deeper?</h3>
          <p className="text-gray-400 text-sm">
            Architecture and ADRs live in <code className="text-green-400">docs/architecture.md</code>{' '}
            and <code className="text-green-400">docs/decisions/</code>.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/docs/architecture"
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm transition-colors"
          >
            Architecture →
          </Link>
          <Link
            href="/admin"
            className="px-4 py-2 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-sm transition-colors"
          >
            Open Admin →
          </Link>
        </div>
      </div>
    </div>
  )
}
