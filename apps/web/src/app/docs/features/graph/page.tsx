// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

import { CodeSnippet, TutorialSection, FeatureCard } from '@/components/tutorial'
import Link from 'next/link'

export default function GraphPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Features · Graph Mode
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">Graph Mode</h1>
        <p className="text-gray-400 text-lg max-w-3xl">
          Watch the agent think. Graph mode decomposes a multi-part question
          into sub-questions, dispatches a searcher to each one, and synthesizes
          the answer — all rendered as a live DAG on the right side of the chat.
        </p>

        <div className="mt-6 grid sm:grid-cols-3 gap-3">
          <Link
            href="/chat"
            className="rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 px-4 py-3 transition-colors"
          >
            <p className="text-xs text-indigo-300/80">Live</p>
            <p className="text-indigo-300 font-medium">Open Chat (Graph) →</p>
          </Link>
          <a
            href="https://github.com/thachrocky12345/oppmon-agentic-workstation/blob/main/docs/solve-v2.md"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-3 transition-colors"
          >
            <p className="text-xs text-gray-500">Reference</p>
            <p className="text-white font-medium">/solve_v2 contract →</p>
          </a>
          <Link
            href="/docs/features/rag"
            className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-3 transition-colors"
          >
            <p className="text-xs text-gray-500">Compare</p>
            <p className="text-white font-medium">Simple RAG mode →</p>
          </Link>
        </div>

        <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <p className="text-amber-300 font-medium text-sm">Graph mode is opt-in</p>
          <p className="text-gray-400 text-xs mt-1">
            It depends on the FastAPI service{' '}
            <code className="px-1 py-0.5 bg-black/40 rounded text-amber-200">apps/agent_graph_backend</code>
            {' '}(formerly{' '}
            <code className="px-1 py-0.5 bg-black/40 rounded text-amber-200">apps/KnowledgeSearchBackend</code>)
            {' '}and is disabled by default. The toggle in the chat header only renders when{' '}
            <code className="px-1 py-0.5 bg-black/40 rounded text-amber-200">
              NEXT_PUBLIC_GRAPH_ENABLED=true
            </code>{' '}
            is baked into the web image at build time.
          </p>
        </div>

        <div className="mt-3 p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
          <p className="text-indigo-300 font-medium text-sm">New: authenticated /solve route (TAG-50 epic)</p>
          <p className="text-gray-400 text-xs mt-1">
            Behind the feature flag{' '}
            <code className="px-1 py-0.5 bg-black/40 rounded text-indigo-200">ENABLE_SOLVE_V3=true</code>,
            the Python service exposes a tenant-aware{' '}
            <code className="px-1 py-0.5 bg-black/40 rounded text-indigo-200">POST /solve</code>{' '}
            that verifies the user&apos;s JWT, opens an asyncpg pool with row-level security GUCs,
            and resolves per-tenant LLM credentials via a PyNaCl-encrypted vault. The legacy
            unauthenticated{' '}
            <code className="px-1 py-0.5 bg-black/40 rounded text-indigo-200">POST /solve_v2</code>{' '}
            remains available for backwards compatibility.
          </p>
        </div>
      </div>

      {/* How it works */}
      <TutorialSection
        id="how-it-works"
        icon={
          <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <circle cx="6" cy="6" r="2" strokeWidth={2} />
            <circle cx="18" cy="6" r="2" strokeWidth={2} />
            <circle cx="12" cy="18" r="2" strokeWidth={2} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7.5 7.5l3.5 9M16.5 7.5l-3.5 9" />
          </svg>
        }
        iconBg="bg-indigo-500/20"
        title="What happens when you ask a question"
        description="Planner → searchers → synthesis. Streamed over SSE, drawn live."
      >
        <ol className="space-y-3 text-sm text-gray-300">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs font-bold">1</span>
            <div>
              <p className="font-medium text-white">Planner expands</p>
              <p className="text-gray-400 text-xs">
                The user&apos;s question becomes the <code className="text-indigo-300">root</code>
                {' '}node. The planner decomposes it into N sub-questions, each represented as a{' '}
                <code className="text-indigo-300">searcher</code> child node.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs font-bold">2</span>
            <div>
              <p className="font-medium text-white">Searchers retrieve</p>
              <p className="text-gray-400 text-xs">
                Each searcher hits RAG (your collections) first, optionally falls back to web
                search, and writes its findings back into its node. Edges flip from gray
                (queued) to blue (in-flight) to green (done).
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs font-bold">3</span>
            <div>
              <p className="font-medium text-white">Planner synthesizes</p>
              <p className="text-gray-400 text-xs">
                Once searchers complete, the planner merges their answers into a single response
                and emits a final <code className="text-indigo-300">state: &quot;END&quot;</code> event.
                The chat bubble shows the running synthesis as it grows.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs font-bold">4</span>
            <div>
              <p className="font-medium text-white">Citations resolve</p>
              <p className="text-gray-400 text-xs">
                A cumulative <code className="text-indigo-300">references</code> map ties each
                citation index back to a URL or document chunk. Same chat-bubble format as
                simple mode.
              </p>
            </div>
          </li>
        </ol>

        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <FeatureCard
            icon={<span className="text-2xl">🕸️</span>}
            title="Live DAG"
            description="React Flow renders the planner+searcher graph as you wait. Hover to read sub-question state, source (RAG/web/both), and per-node detail."
          />
          <FeatureCard
            icon={<span className="text-2xl">📡</span>}
            title="SSE streaming"
            description="One persistent POST, many JSON events. Same-origin proxy at /api/graph/solve forwards to the agent_graph_backend FastAPI container."
          />
          <FeatureCard
            icon={<span className="text-2xl">📈</span>}
            title="Audit-friendly"
            description="See exactly which sub-questions ran, what each retrieved, and where each citation came from. Better than 'trust me, the LLM said so.'"
          />
        </div>
      </TutorialSection>

      {/* When to use it */}
      <TutorialSection
        id="when-to-use"
        icon={
          <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        }
        iconBg="bg-emerald-500/20"
        title="When to use graph mode vs simple mode"
        description="Graph is more expensive and slower — pick it deliberately."
      >
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-white/[0.04] text-gray-400 text-left">
                <th className="px-4 py-2 font-medium">Question shape</th>
                <th className="px-4 py-2 font-medium">Pick</th>
                <th className="px-4 py-2 font-medium">Why</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <tr className="border-t border-white/10">
                <td className="px-4 py-2">Multi-part / comparison</td>
                <td className="px-4 py-2"><span className="text-indigo-300 font-mono">graph</span></td>
                <td className="px-4 py-2">Each clause becomes its own searcher — better coverage of all sub-asks.</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2">&quot;Compare X and Y on A, B, C&quot;</td>
                <td className="px-4 py-2"><span className="text-indigo-300 font-mono">graph</span></td>
                <td className="px-4 py-2">Decomposition makes the comparison structurally explicit.</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2">Mixes RAG + current events</td>
                <td className="px-4 py-2"><span className="text-indigo-300 font-mono">graph</span></td>
                <td className="px-4 py-2">Some sub-questions route to RAG, others to web — planner mixes sources.</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2">Single-fact lookup</td>
                <td className="px-4 py-2"><span className="text-cyan-300 font-mono">simple</span></td>
                <td className="px-4 py-2">Decomposition overhead is wasted — one retrieval is enough.</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2">Latency-sensitive (sub-2s)</td>
                <td className="px-4 py-2"><span className="text-cyan-300 font-mono">simple</span></td>
                <td className="px-4 py-2">Graph mode is 3–5× slower because of N parallel searchers + a final synthesis.</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2">Cost-sensitive bulk Q&amp;A</td>
                <td className="px-4 py-2"><span className="text-cyan-300 font-mono">simple</span></td>
                <td className="px-4 py-2">Each graph run uses N+1 LLM calls; simple mode uses 1.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TutorialSection>

      {/* Architecture */}
      <TutorialSection
        id="architecture"
        icon={
          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        }
        iconBg="bg-blue-500/20"
        title="How the pieces fit together"
        description="One external service, one same-origin proxy, one feature flag."
      >
        <div className="rounded-lg border border-white/10 bg-black/30 p-5 font-mono text-xs text-gray-300 overflow-x-auto">
{`Browser  ──POST /api/graph/solve──▶  apps/web (Next.js proxy)  ──▶  apps/agent_graph_backend
              ▲                            │                          (FastAPI · Python 3.11)
              │                            │
              │                            │ ENABLE_SOLVE_V3=true  → POST /solve     (SSE, JWT auth)
              │                            └ legacy / public       → POST /solve_v2  (SSE, no auth)
              └────────── SSE ─────────────┘  container :8002 · host :7002 (graph profile)`}
        </div>

        <ul className="text-sm text-gray-400 space-y-2 mt-4">
          <li>•{' '}
            <span className="text-white font-medium">agent_graph_backend</span>{' '}
            is a first-class service in this repo at{' '}
            <code className="text-cyan-300">apps/agent_graph_backend/</code>. Python module{' '}
            <code className="text-cyan-300">agent_search/agent_v2/</code>. Built and shipped
            alongside <code className="text-cyan-300">oppmon-api</code> and{' '}
            <code className="text-cyan-300">oppmon-web</code> (image tag convention{' '}
            <code className="text-cyan-300">v2.x</code>).
          </li>
          <li>•{' '}
            <span className="text-white font-medium">The Next.js proxy</span> at{' '}
            <code className="text-cyan-300">apps/web/src/app/api/graph/solve/route.ts</code>{' '}
            forwards POSTs from the browser to{' '}
            <code className="text-cyan-300">${'{'}GRAPH_BACKEND_URL{'}'}/solve</code>{' '}
            (or <code className="text-cyan-300">/solve_v2</code> for the legacy path) and pipes
            the SSE stream back unmodified.
          </li>
          <li>•{' '}
            <span className="text-white font-medium">JWT bearer forwarding</span> —{' '}
            when <code className="text-cyan-300">ENABLE_SOLVE_V3=true</code>, the proxy reads the
            user&apos;s JWT from the{' '}
            <code className="text-cyan-300">Authorization: Bearer ...</code> header (preferred)
            or the <code className="text-cyan-300">auth_token</code> cookie (fallback) and
            forwards it to the FastAPI service. Requests without a valid JWT get 401.
          </li>
          <li>•{' '}
            <span className="text-white font-medium">No CORS, no exposed backend URL</span> —
            the browser only ever sees <code className="text-cyan-300">/api/graph/solve</code>.
          </li>
          <li>•{' '}
            <span className="text-white font-medium">Stateless service</span> — the FastAPI
            container does not write to Postgres for the legacy{' '}
            <code className="text-cyan-300">/solve_v2</code> path. The new{' '}
            <code className="text-cyan-300">/solve</code> path opens a read-only asyncpg pool to
            resolve the tenant model registry under RLS, but does not persist conversation
            state.
          </li>
        </ul>
      </TutorialSection>

      {/* Configure */}
      <TutorialSection
        id="configure"
        icon={
          <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
        iconBg="bg-yellow-500/20"
        title="Configuration"
        description="Env vars split between the web proxy and the FastAPI agent_graph_backend service."
      >
        <p className="text-sm text-gray-400 mb-3">
          <span className="text-white font-medium">Web (apps/web)</span> —
          controls whether the proxy is wired up and where it points.
        </p>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-white/[0.04] text-gray-400 text-left">
                <th className="px-4 py-2 font-mono">Var</th>
                <th className="px-4 py-2 font-medium">Scope</th>
                <th className="px-4 py-2 font-medium">Purpose</th>
              </tr>
            </thead>
            <tbody className="text-gray-300 font-mono">
              <tr className="border-t border-white/10">
                <td className="px-4 py-2 text-cyan-300">NEXT_PUBLIC_GRAPH_ENABLED</td>
                <td className="px-4 py-2 text-amber-300">build-time</td>
                <td className="px-4 py-2 text-gray-400 font-sans">Renders the Graph toggle in the chat header. Must be the string &quot;true&quot;.</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2 text-cyan-300">GRAPH_BACKEND_URL</td>
                <td className="px-4 py-2 text-purple-300">runtime (server)</td>
                <td className="px-4 py-2 text-gray-400 font-sans">Where the proxy forwards. e.g. <code className="text-cyan-300">http://graph-agent:8002</code> (overlay) or <code className="text-cyan-300">http://localhost:7002</code> (host). Empty = proxy returns 503.</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2 text-cyan-300">GRAPH_BACKEND_TOKEN</td>
                <td className="px-4 py-2 text-purple-300">runtime (server)</td>
                <td className="px-4 py-2 text-gray-400 font-sans">Optional shared-secret bearer token for the legacy <code className="text-cyan-300">/solve_v2</code> path. Ignored when the proxy forwards the user&apos;s JWT to <code className="text-cyan-300">/solve</code>.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-sm text-gray-400 mt-6 mb-3">
          <span className="text-white font-medium">FastAPI (apps/agent_graph_backend)</span> —
          required when <code className="text-cyan-300">ENABLE_SOLVE_V3=true</code>; the
          container fails fast on boot (TAG-65) if any of these are missing.
        </p>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-white/[0.04] text-gray-400 text-left">
                <th className="px-4 py-2 font-mono">Var</th>
                <th className="px-4 py-2 font-medium">Required for</th>
                <th className="px-4 py-2 font-medium">Purpose</th>
              </tr>
            </thead>
            <tbody className="text-gray-300 font-mono">
              <tr className="border-t border-white/10">
                <td className="px-4 py-2 text-cyan-300">ENABLE_SOLVE_V3</td>
                <td className="px-4 py-2 text-emerald-300">flag</td>
                <td className="px-4 py-2 text-gray-400 font-sans">Mounts the authenticated <code className="text-cyan-300">POST /solve</code> router. Default <code className="text-cyan-300">false</code>.</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2 text-cyan-300">JWT_SECRET</td>
                <td className="px-4 py-2 text-amber-300">/solve</td>
                <td className="px-4 py-2 text-gray-400 font-sans">HS256 secret shared with the Express API and the Next.js middleware. PyJWT verifies the incoming bearer.</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2 text-cyan-300">DATABASE_URL</td>
                <td className="px-4 py-2 text-amber-300">/solve</td>
                <td className="px-4 py-2 text-gray-400 font-sans">Postgres DSN. The asyncpg pool sets <code className="text-cyan-300">app.tenant_id</code> + <code className="text-cyan-300">app.current_actor_id</code> GUCs so RLS policies apply.</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2 text-cyan-300">TAG_ENCRYPTION_MASTER_KEY</td>
                <td className="px-4 py-2 text-amber-300">/solve</td>
                <td className="px-4 py-2 text-gray-400 font-sans">32-byte (base64) master key. PyNaCl XSalsa20-Poly1305 derives per-tenant data keys to decrypt provider API keys from the vault. Must match the Express API&apos;s value.</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2 text-cyan-300">OPENAI_EMBED_API_KEY</td>
                <td className="px-4 py-2 text-amber-300">/solve</td>
                <td className="px-4 py-2 text-gray-400 font-sans">Dedicated embedding key (falls back to <code className="text-cyan-300">OPENAI_API_KEY</code>). Used by the prompt-warmup cache (TAG-72) and corpus search.</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2 text-cyan-300">ANTHROPIC_API_KEY</td>
                <td className="px-4 py-2 text-gray-500">optional</td>
                <td className="px-4 py-2 text-gray-400 font-sans">Default planner/searcher LLM. Per-tenant overrides resolved from the vault.</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2 text-cyan-300">CEREBRAS_API_KEY</td>
                <td className="px-4 py-2 text-gray-500">optional</td>
                <td className="px-4 py-2 text-gray-400 font-sans">Alternative LLM provider (OpenAI-compatible SDK against <code className="text-cyan-300">api.cerebras.ai</code>).</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2 text-cyan-300">WEB_SEARCH_PROVIDER</td>
                <td className="px-4 py-2 text-gray-500">optional</td>
                <td className="px-4 py-2 text-gray-400 font-sans">One of <code className="text-cyan-300">tavily</code>, <code className="text-cyan-300">google</code>, <code className="text-cyan-300">ddg</code>. The chain falls through on failure.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500 mt-3">
          <code className="text-cyan-300">NEXT_PUBLIC_*</code> is baked in at{' '}
          <code className="text-cyan-300">docker build</code> time — flipping it requires a
          rebuild of the web image. Runtime env changes are not enough. The FastAPI service
          reads its env at container start; see{' '}
          <code className="text-cyan-300">agent_search/agent_v2/config.py</code>{' '}
          (<code className="text-cyan-300">Settings</code>) for the canonical list.
        </p>
      </TutorialSection>

      {/* Bring it up locally */}
      <TutorialSection
        id="local-setup"
        icon={
          <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        }
        iconBg="bg-emerald-500/20"
        title="Bring it up locally"
        description="One profile flag and three env vars."
      >
        <ol className="space-y-4 text-sm text-gray-300">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">1</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Set the graph image + env</p>
              <CodeSnippet
                language="bash"
                code={`# bash / zsh
export GRAPH_AGENT_IMAGE=thachrocky/agent-graph-backend:latest
export GRAPH_BACKEND_URL=http://graph-agent:8002   # overlay DNS inside compose
export NEXT_PUBLIC_GRAPH_ENABLED=true

# Optional: enable the authenticated /solve route
export ENABLE_SOLVE_V3=true
export JWT_SECRET=<same value as apps/api/.env>
export DATABASE_URL=postgres://oppmon:oppmon@db:5432/oppmon
export TAG_ENCRYPTION_MASTER_KEY=<base64 32-byte key, same as apps/api/.env>`}
              />
              <p className="text-xs text-gray-500 mt-2">
                The graph-agent container listens on <code className="text-cyan-300">8002</code>{' '}
                internally and is mapped to host <code className="text-cyan-300">7002</code> by
                <code className="text-cyan-300"> docker-compose.override.yml</code> (graph profile).
                Use the overlay name <code className="text-cyan-300">graph-agent:8002</code>{' '}
                from inside the compose network and{' '}
                <code className="text-cyan-300">localhost:7002</code> from your host shell.
              </p>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">2</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Bring up the dev stack with the graph profile</p>
              <CodeSnippet
                language="bash"
                code={`docker compose --profile dev --profile graph up`}
              />
              <p className="text-xs text-gray-500 mt-2">
                Without <code className="text-cyan-300">--profile graph</code>, the graph-agent
                container is skipped and the rest of the stack works as usual.
              </p>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">3</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Smoke-test the proxy</p>
              <CodeSnippet
                language="bash"
                code={`curl -N -X POST http://localhost:3002/api/graph/solve \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":"hello","web_fallback":false,"enable_tools":false,"collection_ids":[]}'`}
              />
              <p className="text-xs text-gray-500 mt-2">
                Expect a stream of <code className="text-cyan-300">data: {'{...}'}</code> lines.
                A <code className="text-cyan-300">503 graph_backend_not_configured</code> means{' '}
                <code className="text-cyan-300">GRAPH_BACKEND_URL</code> didn&apos;t reach the
                Next.js process.
              </p>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">4</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Try it in the UI</p>
              <p className="text-xs text-gray-500">
                Open <Link href="/chat" className="text-emerald-300 hover:underline">/chat</Link>,
                toggle <strong className="text-white">Graph</strong> on, and ask a multi-part
                question like &quot;Compare CRISPR-Cas9 and CRISPR-Cas12 on mechanism, PAM, and
                applications.&quot; The right-hand panel renders the live DAG.
              </p>
            </div>
          </li>
        </ol>
      </TutorialSection>

      {/* Troubleshooting */}
      <TutorialSection
        id="troubleshooting"
        icon={
          <svg className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        }
        iconBg="bg-orange-500/20"
        title="Troubleshooting"
        description="Common failure modes when wiring up graph mode."
      >
        <div className="space-y-3">
          {[
            {
              q: 'Graph toggle is missing from /chat',
              a: (
                <>
                  The web image was built without{' '}
                  <code className="text-cyan-300">NEXT_PUBLIC_GRAPH_ENABLED=true</code>. Setting
                  it at runtime in Compose has no effect — <code className="text-cyan-300">NEXT_PUBLIC_*</code> is
                  baked in at <code className="text-cyan-300">docker build</code> time. Rebuild
                  the web image with the build-arg and redeploy.
                </>
              ),
            },
            {
              q: '“Graph agent error: 503 graph_backend_not_configured”',
              a: (
                <>
                  <code className="text-cyan-300">GRAPH_BACKEND_URL</code> is empty inside the
                  web container. In dev, forgetting to export the var before{' '}
                  <code className="text-cyan-300">docker compose up</code> is the usual cause.
                  In prod, you forgot{' '}
                  <code className="text-cyan-300">set -a &amp;&amp; . apps/api/.env &amp;&amp; set +a</code>{' '}
                  before <code className="text-cyan-300">docker stack deploy</code>.
                </>
              ),
            },
            {
              q: '“Graph agent error: 502 graph_backend_unreachable”',
              a: (
                <>
                  The proxy reached the URL but the connection failed — usually the graph-agent
                  container is down or the service name in{' '}
                  <code className="text-cyan-300">GRAPH_BACKEND_URL</code> doesn&apos;t match.
                  In dev: <code className="text-cyan-300">docker compose ps graph-agent</code>.
                  In prod: <code className="text-cyan-300">docker service ps oppmon_graph-agent</code>.
                </>
              ),
            },
            {
              q: 'Toggle clicks but the graph panel never updates',
              a: (
                <>
                  The proxy connected but no SSE events are arriving. Check the upstream backend
                  emits <code className="text-cyan-300">data:</code> lines (no trailing colon,
                  blank-line separators). Look at the browser network panel — you should see a
                  POST to <code className="text-cyan-300">/api/graph/solve</code> stuck on
                  &quot;pending&quot; while events stream in.
                </>
              ),
            },
            {
              q: 'Port 7002 already allocated on host',
              a: (
                <>
                  The graph-agent container listens on <strong className="text-amber-300">8002</strong>{' '}
                  internally and is exposed on host port <strong className="text-amber-300">7002</strong>{' '}
                  by the compose override. If host 7002 is taken by another local tool, edit{' '}
                  <code className="text-cyan-300">docker-compose.override.yml</code> to map a
                  different host port — the container port (8002) and the in-network DNS
                  (<code className="text-cyan-300">graph-agent:8002</code>) stay the same.
                </>
              ),
            },
            {
              q: '“agent_graph_backend exited with code 1 on startup”',
              a: (
                <>
                  Fail-fast init (TAG-65) — when <code className="text-cyan-300">ENABLE_SOLVE_V3=true</code>,
                  the container refuses to start if{' '}
                  <code className="text-cyan-300">JWT_SECRET</code>,{' '}
                  <code className="text-cyan-300">DATABASE_URL</code>,{' '}
                  <code className="text-cyan-300">TAG_ENCRYPTION_MASTER_KEY</code>, or an
                  embedding key is missing. Check the logs — the error names the missing var.
                  Either export the missing var and redeploy, or temporarily unset{' '}
                  <code className="text-cyan-300">ENABLE_SOLVE_V3</code> to fall back to the
                  public <code className="text-cyan-300">/solve_v2</code> path.
                </>
              ),
            },
            {
              q: '"/solve returns 401 invalid_token" but I\'m logged in',
              a: (
                <>
                  <code className="text-cyan-300">JWT_SECRET</code> on the FastAPI container
                  doesn&apos;t match the one used by the Express API to sign the cookie. Compare{' '}
                  <code className="text-cyan-300">docker service inspect oppmon_api</code>{' '}
                  vs <code className="text-cyan-300">oppmon_graph-agent</code> — both must be
                  byte-identical. Same fix applies to the web middleware{' '}
                  <code className="text-cyan-300">jose</code> verifier.
                </>
              ),
            },
          ].map((item, i) => (
            <details key={i} className="group rounded-lg border border-white/10 bg-white/[0.03] p-4 open:bg-white/[0.05]">
              <summary className="cursor-pointer flex items-center justify-between text-white font-medium text-sm">
                <span>{item.q}</span>
                <svg className="w-4 h-4 text-gray-500 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="mt-3 text-sm text-gray-400">{item.a}</div>
            </details>
          ))}
        </div>
      </TutorialSection>

      {/* Footer */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-500/15 via-purple-500/10 to-fuchsia-500/15 border border-white/10 p-8">
        <h3 className="text-2xl font-bold text-white mb-2">Next: deep-dive the protocol</h3>
        <p className="text-gray-400 mb-5 max-w-2xl">
          The SSE envelope, node state machine, and the full lifecycle live in the engineering
          reference. Read it if you&apos;re building against <code className="text-indigo-300">/solve_v2</code>{' '}
          directly or extending the planner.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="https://github.com/thachrocky12345/oppmon-agentic-workstation/blob/main/docs/solve-v2.md"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors"
          >
            /solve_v2 reference →
          </a>
          <Link
            href="/docs/features/rag"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg font-medium transition-colors"
          >
            Compare with simple RAG →
          </Link>
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg font-medium transition-colors"
          >
            Open the chat →
          </Link>
        </div>
      </div>
    </div>
  )
}
