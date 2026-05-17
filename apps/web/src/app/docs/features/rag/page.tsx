// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

import { CodeSnippet, TutorialSection, FeatureCard } from '@/components/tutorial'
import Link from 'next/link'

/* ------------------------------------------------------------------------ */
/* Inline terminal mock (matches the live oppmon CLI output)                 */
/* ------------------------------------------------------------------------ */

function TerminalWindow({
  title = 'pwsh — oppmon rag',
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
      <div className="p-5 font-mono text-[13px] leading-relaxed text-gray-200 overflow-x-auto whitespace-pre">
        {children}
      </div>
    </div>
  )
}

const Dim = ({ children }: { children: React.ReactNode }) => (
  <span className="text-gray-500">{children}</span>
)

const Cmd = ({ children }: { children: React.ReactNode }) => (
  <span className="text-cyan-400">{children}</span>
)

const Ok = ({ children }: { children: React.ReactNode }) => (
  <span className="text-green-400">{children}</span>
)

const Warn = ({ children }: { children: React.ReactNode }) => (
  <span className="text-yellow-400">{children}</span>
)

/* ------------------------------------------------------------------------ */

export default function RAGPage() {
  return (
    <div className="space-y-12">
      {/* ---------------- Header ---------------- */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-medium mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          Features · RAG &amp; Chat
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">RAG &amp; Chat</h1>
        <p className="text-gray-400 text-lg max-w-3xl">
          Retrieval-Augmented Generation grounds every chat answer in your tenant&apos;s documents.
          Upload PDFs, markdown, or text into a collection — then query it from the web chat,
          the API, or{' '}
          <code className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-300 rounded text-sm">
            pnpm oppmon:rag
          </code>
          .
        </p>

        <div className="mt-6 grid sm:grid-cols-3 gap-3">
          <Link
            href="/chat"
            className="rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-4 py-3 transition-colors"
          >
            <p className="text-xs text-cyan-300/80">Live</p>
            <p className="text-cyan-300 font-medium">Open RAG Chat →</p>
          </Link>
          <Link
            href="/admin/rag"
            className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-3 transition-colors"
          >
            <p className="text-xs text-gray-500">Admin</p>
            <p className="text-white font-medium">Collections page →</p>
          </Link>
          <Link
            href="/docs/cli-setup"
            className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-3 transition-colors"
          >
            <p className="text-xs text-gray-500">Prereq</p>
            <p className="text-white font-medium">CLI Setup →</p>
          </Link>
        </div>

        <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
          <p className="text-emerald-300 font-medium text-sm">Tenant isolation is enforced at the SQL layer</p>
          <p className="text-gray-400 text-xs mt-1">
            Every query runs with{' '}
            <code className="px-1 py-0.5 bg-black/40 rounded text-emerald-200">tenant_id = $1</code>{' '}
            in the where clause and team-scoped collections add{' '}
            <code className="px-1 py-0.5 bg-black/40 rounded text-emerald-200">team_id = ANY(...)</code>.
            Cross-tenant access is architecturally impossible — it is not a permission you can grant.
          </p>
        </div>
      </div>

      {/* ---------------- How it works ---------------- */}
      <TutorialSection
        id="how-it-works"
        icon={
          <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        }
        iconBg="bg-cyan-500/20"
        title="What happens when you ask a question"
        description="Hybrid retrieval first, generation second. Citations always."
      >
        <ol className="space-y-3 text-sm text-gray-300">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-xs font-bold">1</span>
            <div>
              <p className="font-medium text-white">Embed the question</p>
              <p className="text-gray-400 text-xs">
                Your prompt is converted into a vector (default 1536-dim, OpenAI-compatible). The
                embedding never leaves your tenant.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-xs font-bold">2</span>
            <div>
              <p className="font-medium text-white">Hybrid search</p>
              <p className="text-gray-400 text-xs">
                BM25 (keyword) and pgvector (semantic) run in parallel, then are fused with{' '}
                Reciprocal Rank Fusion. Optional MMR diversity selection drops near-duplicate chunks.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-xs font-bold">3</span>
            <div>
              <p className="font-medium text-white">Build the context block</p>
              <p className="text-gray-400 text-xs">
                The top-K chunks are formatted into a context block with chunk-id markers. The LLM
                is instructed to answer only from the context and to cite the markers it uses.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-xs font-bold">4</span>
            <div>
              <p className="font-medium text-white">Generate &amp; cite</p>
              <p className="text-gray-400 text-xs">
                The selected model (per virtual key) generates the answer. Citations are mapped
                back to <code className="text-cyan-300">RagDocument</code> rows so the UI can link
                straight to the source file.
              </p>
            </div>
          </li>
        </ol>

        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <FeatureCard
            icon={<span className="text-2xl">🔤</span>}
            title="BM25"
            description="PostgreSQL full-text search via tsvector + ts_rank_cd. Catches exact strings — error codes, identifiers, file names."
          />
          <FeatureCard
            icon={<span className="text-2xl">🧭</span>}
            title="Vector"
            description="pgvector cosine similarity (HNSW index). Catches paraphrases, synonyms, multilingual matches."
          />
          <FeatureCard
            icon={<span className="text-2xl">⚖️</span>}
            title="RRF Fusion"
            description="Reciprocal Rank Fusion (Cormack et al., 2009) merges both rankings. Tunable presets: default, keyword_focused, semantic_focused, agreement_focused."
          />
        </div>
      </TutorialSection>

      {/* ---------------- Concepts ---------------- */}
      <TutorialSection
        id="concepts"
        icon={
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        }
        iconBg="bg-purple-500/20"
        title="Collections, Documents, Chunks"
        description="Three database tables, one mental model."
      >
        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <h4 className="text-white font-semibold mb-2">RagCollection</h4>
            <p className="text-xs text-gray-400">
              A bucket. Has a name, description, and scope (TENANT or TEAM). Users only see
              collections their JWT lets them see — no application-layer filtering.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <h4 className="text-white font-semibold mb-2">RagDocument</h4>
            <p className="text-xs text-gray-400">
              An uploaded file inside a collection. Tracks{' '}
              <code className="text-cyan-300">extractionStatus</code> (PENDING / EXTRACTING /
              EXTRACTED / FAILED), <code className="text-cyan-300">fileSha256</code> for dedup,
              and the chunk count.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <h4 className="text-white font-semibold mb-2">RagChunk</h4>
            <p className="text-xs text-gray-400">
              An 800-char window of text (with 100-char overlap) plus a 1536-dim vector. The
              chunk is what retrieval actually finds and what the LLM cites.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-white font-semibold mb-2">Scope: TENANT vs TEAM</h4>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-white/[0.04] text-gray-400 text-left">
                  <th className="px-4 py-2 font-medium">Scope</th>
                  <th className="px-4 py-2 font-medium">Visible to</th>
                  <th className="px-4 py-2 font-medium">Who can create</th>
                </tr>
              </thead>
              <tbody className="text-gray-300">
                <tr className="border-t border-white/10">
                  <td className="px-4 py-2"><span className="text-purple-300 font-mono">TENANT</span></td>
                  <td className="px-4 py-2">Every user in the tenant</td>
                  <td className="px-4 py-2">TENANT_ADMIN</td>
                </tr>
                <tr className="border-t border-white/10">
                  <td className="px-4 py-2"><span className="text-cyan-300 font-mono">TEAM</span></td>
                  <td className="px-4 py-2">Members of the linked team only</td>
                  <td className="px-4 py-2">TEAM_ADMIN of that team (and above)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- CLI command grid ---------------- */}
      <TutorialSection
        id="cli"
        icon={
          <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
        iconBg="bg-cyan-500/20"
        title="Every CLI subcommand"
        description="Two surfaces: pnpm oppmon:rag for embeddings + queries, and pnpm oppmon:rag collections for the document admin."
      >
        <CodeSnippet
          language="bash"
          title="Quick reference"
          code={`# All shortcuts assume you have run: pnpm oppmon:login

# --- Embeddings & queries -------------------------------------------------
pnpm oppmon:rag ingest README.md                  # embed a single file
pnpm oppmon:rag ingest-dir ./docs                 # embed every supported doc
pnpm oppmon:rag search "how does auth work"       # raw similarity search
pnpm oppmon:rag query  "explain the database"     # full RAG: retrieve + LLM
pnpm oppmon:rag list                              # browse stored embeddings
pnpm oppmon:rag stats                             # totals by type/provider/model
pnpm oppmon:rag coverage                          # skill / agent embed coverage
pnpm oppmon:rag reindex -- --types skill          # re-embed all skills
pnpm oppmon:rag delete <embeddingId>              # remove one embedding
pnpm oppmon:rag status                            # pipeline + provider health

# --- Document Collections (admin) ----------------------------------------
pnpm oppmon:rag collections list                  # see every collection you can read
pnpm oppmon:rag collections show <name>           # collection + its documents
pnpm oppmon:rag collections create -- \\
  -n eng-runbooks -d "Oncall + runbooks" -s TEAM --team t_eng
pnpm oppmon:rag collections delete <name> -- --yes`}
        />

        <div className="grid md:grid-cols-2 gap-4 mt-6">
          <FeatureCard
            icon={<span className="text-2xl">📥</span>}
            title="ingest / ingest-dir"
            description="Read local files, chunk them, embed each chunk, and POST to /api/embedding/embed-batch. Supports .md, .txt, .pdf, .docx, .html."
          />
          <FeatureCard
            icon={<span className="text-2xl">🔍</span>}
            title="search"
            description="Raw vector similarity — no LLM in the loop. Returns chunk IDs, scores, and (optionally) content. --json for scripting."
          />
          <FeatureCard
            icon={<span className="text-2xl">💬</span>}
            title="query"
            description="The full RAG pipeline: retrieve, build context, call LLM, return answer + sources. Pick a model with --llm-provider/--llm-model."
          />
          <FeatureCard
            icon={<span className="text-2xl">📊</span>}
            title="stats / coverage"
            description="stats = totals by source / provider / model. coverage = % of skills + agents that already have embeddings — the canary metric."
          />
          <FeatureCard
            icon={<span className="text-2xl">♻️</span>}
            title="reindex"
            description="Re-embed every skill/agent. Use --dry-run first. The job runs server-side — the CLI just kicks it off and reports counts."
          />
          <FeatureCard
            icon={<span className="text-2xl">📚</span>}
            title="collections list / show"
            description="List every collection you can read (TENANT-scope + your TEAM-scope ones). show prints documents with extraction status dots."
          />
          <FeatureCard
            icon={<span className="text-2xl">➕</span>}
            title="collections create"
            description="Create a new bucket. TENANT scope needs TENANT_ADMIN; TEAM scope needs TEAM_ADMIN of the target team."
          />
          <FeatureCard
            icon={<span className="text-2xl">🗑️</span>}
            title="collections delete"
            description="Soft-delete the bucket and cascade-soft-delete its documents. Requires --yes. The unique-name slot is held until purged."
          />
        </div>

        <div className="mt-6 p-4 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
          <p className="text-yellow-300 text-sm font-medium">Document upload is web-only</p>
          <p className="text-xs text-gray-400 mt-1">
            File upload uses multipart/form-data and ships through the admin UI at{' '}
            <Link href="/admin/rag" className="text-yellow-300 hover:underline">/admin/rag</Link>.
            Use the CLI to <em>create the collection</em>, then upload via the web — or hit{' '}
            <code className="text-cyan-300">POST /api/admin/rag/collections/:id/documents</code> directly.
          </p>
        </div>
      </TutorialSection>

      {/* ---------------- Recipe: ingest a doc tree ---------------- */}
      <TutorialSection
        id="recipe-ingest"
        icon={
          <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        }
        iconBg="bg-emerald-500/20"
        title="Recipe — embed a doc tree from the CLI"
        description="The shortest path from a folder of markdown to a queryable knowledge base."
      >
        <ol className="space-y-4 text-sm text-gray-300">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">1</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Dry run to check the chunking</p>
              <CodeSnippet
                language="bash"
                code={`pnpm oppmon:rag ingest-dir ./docs -- --dry-run`}
              />
              <p className="text-xs text-gray-500 mt-2">
                Prints which files would be embedded, the chunk count per file, and the embedding
                provider that would be used. Nothing leaves your machine.
              </p>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">2</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Run the ingest</p>
              <CodeSnippet
                language="bash"
                code={`pnpm oppmon:rag ingest-dir ./docs \\
  -- --chunk-size 1500 --overlap 150`}
              />
              <TerminalWindow title="oppmon rag ingest-dir">
{`  `}<Cmd>scanning</Cmd>{` ./docs `}<Dim>(34 supported files)</Dim>{`

  `}<Ok>✔</Ok>{` docs/architecture.md       `}<Dim>11 chunks · 18.2 KB</Dim>{`
  `}<Ok>✔</Ok>{` docs/database-conventions  `}<Dim>4 chunks  ·  6.0 KB</Dim>{`
  `}<Ok>✔</Ok>{` docs/cli-setup-guide.md    `}<Dim>9 chunks  · 14.7 KB</Dim>{`
  `}<Ok>✔</Ok>{` docs/flows/auth-flow.md    `}<Dim>3 chunks  ·  4.1 KB</Dim>{`
  …

  `}<Ok>✔ embedded 217 chunks across 34 files in 11.4s</Ok>{`
  `}<Dim>provider: openai · model: text-embedding-3-small · dim: 1536</Dim>
              </TerminalWindow>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">3</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Sanity-check it</p>
              <CodeSnippet
                language="bash"
                code={`pnpm oppmon:rag search "how does multi-tenant isolation work" -- -l 3 --content`}
              />
              <TerminalWindow title="oppmon rag search">
{`  `}<Cmd>1.</Cmd>{`  `}<Ok>92.4%</Ok>{`  document/architecture/tenant-isolation
      `}<Dim>"All queries are scoped by tenantId at the SQL layer..."</Dim>{`

  `}<Cmd>2.</Cmd>{`  `}<Ok>87.1%</Ok>{`  document/database-conventions/snake_case
      `}<Dim>"Database columns use snake_case for Go/Rust compatibility..."</Dim>{`

  `}<Cmd>3.</Cmd>{`  `}<Warn>71.0%</Warn>{`  document/architecture/auth
      `}<Dim>"JWT contains tenantId and teamMemberships claims..."</Dim>
              </TerminalWindow>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">4</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Ask a real question</p>
              <CodeSnippet
                language="bash"
                code={`pnpm oppmon:rag query "explain how snake_case maps to camelCase" \\
  -- --llm-provider anthropic --llm-model claude-sonnet-4-5-20250929`}
              />
              <p className="text-xs text-gray-500 mt-2">
                The CLI prints the answer and a numbered list of sources you can audit. Add{' '}
                <code className="text-cyan-300">--json</code> if you want to feed it into another
                tool.
              </p>
            </div>
          </li>
        </ol>
      </TutorialSection>

      {/* ---------------- Recipe: collection workflow ---------------- */}
      <TutorialSection
        id="recipe-collections"
        icon={
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        }
        iconBg="bg-purple-500/20"
        title="Recipe — set up a team collection"
        description="Create from CLI, upload from the web, query from chat."
      >
        <ol className="space-y-4 text-sm text-gray-300">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold">1</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Create the collection</p>
              <CodeSnippet
                language="bash"
                code={`pnpm oppmon:rag collections create -- \\
  --name eng-runbooks \\
  --description "Engineering oncall runbooks and incident playbooks" \\
  --scope TEAM \\
  --team t_eng_xyz`}
              />
              <TerminalWindow title="oppmon rag collections create">
{`  ⠋ Creating collection "eng-runbooks"...
  `}<Ok>✔ Created collection "eng-runbooks"</Ok>{` `}<Dim>(c01h…q3a)</Dim>
              </TerminalWindow>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold">2</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Upload documents</p>
              <p className="text-xs text-gray-500 mb-2">
                File upload is web-only. Open{' '}
                <Link href="/admin/rag" className="text-purple-300 hover:underline">/admin/rag</Link>,
                pick the new collection, drag in PDFs / .docx / .md. Up to 50&nbsp;MB per file.
              </p>
              <p className="text-xs text-gray-500">
                Or hit the API directly with multipart/form-data:
              </p>
              <CodeSnippet
                language="bash"
                code={`curl -X POST http://localhost:3001/api/admin/rag/collections/<id>/documents \\
  -H "Authorization: Bearer $TAG_TOKEN" \\
  -F "file=@./oncall.pdf"`}
              />
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold">3</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Watch extraction land</p>
              <CodeSnippet
                language="bash"
                code={`pnpm oppmon:rag collections show eng-runbooks`}
              />
              <TerminalWindow title="oppmon rag collections show">
{`  eng-runbooks
  `}<Dim>Engineering oncall runbooks and incident playbooks</Dim>{`

  ID:           `}<Dim>c01h2b9p…q3a</Dim>{`
  Scope:        `}<span className="text-cyan-300">TEAM</span>{`
  Team:         t_eng_xyz

  Documents (3):
    `}<Ok>●</Ok>{`  oncall.pdf                        14 chunks  `}<Dim>c0docPDF…</Dim>{`
    `}<Warn>●</Warn>{`  postmortem-template.docx          0 chunks   `}<Dim>c0docDOC…</Dim>{`
    `}<Ok>●</Ok>{`  rollback-runbook.md               6 chunks   `}<Dim>c0docMD…</Dim>
              </TerminalWindow>
              <p className="text-xs text-gray-500 mt-2">
                <Ok>●</Ok> = EXTRACTED, <Warn>●</Warn> = PENDING / EXTRACTING,{' '}
                <span className="text-red-400">●</span> = FAILED. The pipeline is async — it
                returns 202 immediately and chunks land within seconds.
              </p>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold">4</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Query from chat</p>
              <p className="text-xs text-gray-500">
                Open <Link href="/chat" className="text-purple-300 hover:underline">/chat</Link>,
                pick the new collection in the sidebar, and ask. Citations link straight back to
                the source documents.
              </p>
            </div>
          </li>
        </ol>
      </TutorialSection>

      {/* ---------------- Search internals ---------------- */}
      <TutorialSection
        id="search-internals"
        icon={
          <svg className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
        iconBg="bg-orange-500/20"
        title="Tuning hybrid search"
        description="The retrieval strategy and scoring preset are both per-request knobs."
      >
        <div className="space-y-4">
          <div>
            <h4 className="text-white font-semibold mb-2">Strategy</h4>
            <ul className="text-sm text-gray-400 space-y-1.5 ml-4">
              <li>• <code className="text-cyan-300">vector</code> — pgvector only. Best when the user uses different words than the docs.</li>
              <li>• <code className="text-cyan-300">bm25</code> — full-text only. Best for exact terms (error codes, names, IDs).</li>
              <li>• <code className="text-cyan-300">hybrid</code> — both, fused with RRF. Default. Almost always the right choice.</li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2">Scoring presets</h4>
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.04] text-gray-400 text-left">
                    <th className="px-4 py-2 font-mono text-xs">preset</th>
                    <th className="px-4 py-2 font-medium">When to use it</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  <tr className="border-t border-white/10">
                    <td className="px-4 py-2 text-cyan-300 font-mono text-xs">default</td>
                    <td className="px-4 py-2">Balanced. Start here.</td>
                  </tr>
                  <tr className="border-t border-white/10">
                    <td className="px-4 py-2 text-cyan-300 font-mono text-xs">keyword_focused</td>
                    <td className="px-4 py-2">User mentions a literal token (404, SIGTERM, a function name).</td>
                  </tr>
                  <tr className="border-t border-white/10">
                    <td className="px-4 py-2 text-cyan-300 font-mono text-xs">semantic_focused</td>
                    <td className="px-4 py-2">User describes a problem in their own words; docs use jargon.</td>
                  </tr>
                  <tr className="border-t border-white/10">
                    <td className="px-4 py-2 text-cyan-300 font-mono text-xs">agreement_focused</td>
                    <td className="px-4 py-2">Both lists must surface the same chunk for it to rank — high precision.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <CodeSnippet
            language="bash"
            title="Tweak the strategy from the API"
            code={`curl -X POST http://localhost:3001/api/rag/retrieve \\
  -H "Authorization: Bearer $TAG_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "how does multi-tenant isolation work",
    "strategy": "hybrid",
    "scoringPreset": "agreement_focused",
    "topK": 5
  }'`}
          />
        </div>
      </TutorialSection>

      {/* ---------------- Web chat ---------------- */}
      <TutorialSection
        id="chat"
        icon={
          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        }
        iconBg="bg-blue-500/20"
        title="Chat from the web"
        description="The /chat route uses the same pipeline as the CLI but adds streaming, tools, and session history."
      >
        <ul className="text-sm text-gray-400 space-y-2">
          <li>• <span className="text-white font-medium">Collection picker</span> — multi-select from the collections you can read.</li>
          <li>• <span className="text-white font-medium">Model picker</span> — every model your virtual key permits.</li>
          <li>• <span className="text-white font-medium">Streaming</span> — SSE via <code className="text-cyan-300">POST /api/rag/chat/stream</code>.</li>
          <li>• <span className="text-white font-medium">Tool calling</span> — opt-in tools the agent can run. History at{' '}
            <code className="text-cyan-300">GET /api/rag/tools/history</code>.</li>
          <li>• <span className="text-white font-medium">Web fallback</span> — when nothing relevant is found, optional Bing fallback (controlled per-request).</li>
          <li>• <span className="text-white font-medium">Session history</span> — every turn is persisted so you can resume.</li>
        </ul>

        <CodeSnippet
          language="bash"
          title="Drive the chat from curl"
          code={`curl -X POST http://localhost:3001/api/rag/chat \\
  -H "Authorization: Bearer $TAG_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      { "role": "user", "content": "What is our oncall escalation policy?" }
    ],
    "collectionIds": ["c01h…q3a"],
    "provider": "anthropic",
    "model": "claude-sonnet-4-5-20250929"
  }'`}
        />
      </TutorialSection>

      {/* ---------------- Troubleshooting ---------------- */}
      <TutorialSection
        id="troubleshooting"
        icon={
          <svg className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        }
        iconBg="bg-orange-500/20"
        title="Troubleshooting"
        description="The most common stumbles when running RAG."
      >
        <div className="space-y-3">
          {[
            {
              q: '“Embedding provider not configured” when running ingest or query',
              a: (
                <>
                  Check <code className="text-cyan-300">pnpm oppmon:rag status</code> — if{' '}
                  <code className="text-cyan-300">embeddingAvailable</code> is false, the API
                  doesn&apos;t have an embedding model registered. A TENANT_ADMIN needs to add one
                  in <Link href="/admin/models" className="text-blue-300 hover:underline">/admin/models</Link>{' '}
                  with at least one OpenAI-compatible model that exposes{' '}
                  <code className="text-cyan-300">/embeddings</code>.
                </>
              ),
            },
            {
              q: 'Query answers nothing useful, but search returns the right chunks',
              a: (
                <>
                  The retrieval is fine but generation is weak. Try a smarter LLM:{' '}
                  <code className="text-cyan-300">--llm-provider anthropic --llm-model claude-sonnet-4-5-20250929</code>.
                  If the right chunk is at rank 3+, lower{' '}
                  <code className="text-cyan-300">--threshold</code> or raise{' '}
                  <code className="text-cyan-300">--top-k</code>.
                </>
              ),
            },
            {
              q: 'Document stuck on PENDING / EXTRACTING for minutes',
              a: (
                <>
                  Look at the API logs (<code className="text-cyan-300">pnpm docker:logs:api</code>).
                  If you see a parse error, the file is unsupported in practice — re-export the
                  PDF, or convert .doc to .docx. To force a retry from the UI use the document
                  detail&apos;s reindex button (calls{' '}
                  <code className="text-cyan-300">POST /api/admin/rag/documents/:id/reindex</code>).
                </>
              ),
            },
            {
              q: '“coverage” shows 0% even though I just embedded skills',
              a: (
                <>
                  Coverage looks at the canonical sources of truth (skills + agents). Document
                  embeddings are tracked separately. Run{' '}
                  <code className="text-cyan-300">pnpm oppmon:rag stats</code> to see the
                  per-source-type totals — a freshly ingested folder shows up under{' '}
                  <code className="text-cyan-300">document</code>.
                </>
              ),
            },
            {
              q: '“You are not a member of this team” when creating a TEAM collection',
              a: (
                <>
                  Your JWT&apos;s <code className="text-cyan-300">teamMemberships</code> claim
                  doesn&apos;t include the target team. Check{' '}
                  <code className="text-cyan-300">pnpm oppmon:status</code>. If the team is
                  missing, ask a TENANT_ADMIN to add you and run{' '}
                  <code className="text-cyan-300">pnpm oppmon:login</code> again.
                </>
              ),
            },
            {
              q: '“Not authenticated. Run "oppmon login" first.”',
              a: (
                <>
                  Don&apos;t use{' '}
                  <code className="text-yellow-300">pnpm dev:api login</code> — that runs turbo and
                  fails with &quot;Could not find task `login`&quot;. Use{' '}
                  <code className="text-cyan-300">pnpm oppmon:login</code>. To verify the cache,{' '}
                  <code className="text-cyan-300">pnpm oppmon:status</code>.
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

      {/* ---------------- API reference ---------------- */}
      <TutorialSection
        id="api"
        icon={
          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        }
        iconBg="bg-blue-500/20"
        title="REST endpoints"
        description="The full surface, grouped by responsibility."
      >
        <div className="space-y-5">
          <div>
            <h4 className="text-white font-semibold mb-2 text-sm">Embeddings</h4>
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.04] text-gray-400 text-left">
                    <th className="px-4 py-2 font-mono">Method</th>
                    <th className="px-4 py-2 font-mono">Path</th>
                    <th className="px-4 py-2 font-medium">CLI equivalent</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300 font-mono">
                  {[
                    ['POST', '/api/embedding/embed-batch', 'pnpm oppmon:rag ingest / ingest-dir'],
                    ['POST', '/api/embedding/search', 'pnpm oppmon:rag search'],
                    ['GET', '/api/embedding', 'pnpm oppmon:rag list'],
                    ['GET', '/api/embedding/stats', 'pnpm oppmon:rag stats'],
                    ['GET', '/api/embedding/coverage', 'pnpm oppmon:rag coverage'],
                    ['POST', '/api/embedding/reindex', 'pnpm oppmon:rag reindex'],
                    ['DELETE', '/api/embedding/:id', 'pnpm oppmon:rag delete <id>'],
                  ].map(([m, p, c]) => (
                    <tr key={p as string} className="border-t border-white/10">
                      <td className="px-4 py-2 text-cyan-300">{m}</td>
                      <td className="px-4 py-2 text-purple-300">{p}</td>
                      <td className="px-4 py-2 text-gray-400 font-sans">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2 text-sm">RAG (query / retrieve / sessions)</h4>
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.04] text-gray-400 text-left">
                    <th className="px-4 py-2 font-mono">Method</th>
                    <th className="px-4 py-2 font-mono">Path</th>
                    <th className="px-4 py-2 font-medium">CLI equivalent</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300 font-mono">
                  {[
                    ['POST', '/api/rag/query', 'pnpm oppmon:rag query'],
                    ['POST', '/api/rag/retrieve', '— (use search for raw retrieval)'],
                    ['GET', '/api/rag/status', 'pnpm oppmon:rag status'],
                    ['GET', '/api/rag/sessions', '— (web only)'],
                    ['DELETE', '/api/rag/sessions/:id', '— (web only)'],
                    ['POST', '/api/rag/chat', '— (web only — streaming chat)'],
                    ['POST', '/api/rag/chat/stream', '— (web only — SSE)'],
                  ].map(([m, p, c]) => (
                    <tr key={p as string} className="border-t border-white/10">
                      <td className="px-4 py-2 text-cyan-300">{m}</td>
                      <td className="px-4 py-2 text-purple-300">{p}</td>
                      <td className="px-4 py-2 text-gray-400 font-sans">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2 text-sm">Collections / Documents (admin)</h4>
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.04] text-gray-400 text-left">
                    <th className="px-4 py-2 font-mono">Method</th>
                    <th className="px-4 py-2 font-mono">Path</th>
                    <th className="px-4 py-2 font-medium">CLI equivalent</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300 font-mono">
                  {[
                    ['GET', '/api/admin/rag/collections', 'pnpm oppmon:rag collections list'],
                    ['GET', '/api/admin/rag/collections/:id', 'pnpm oppmon:rag collections show'],
                    ['POST', '/api/admin/rag/collections', 'pnpm oppmon:rag collections create'],
                    ['PATCH', '/api/admin/rag/collections/:id', '— (web only)'],
                    ['DELETE', '/api/admin/rag/collections/:id', 'pnpm oppmon:rag collections delete'],
                    ['POST', '/api/admin/rag/collections/:id/documents', '— (web upload)'],
                    ['GET', '/api/admin/rag/documents/:id', '— (web only)'],
                    ['POST', '/api/admin/rag/documents/:id/reindex', '— (web only)'],
                    ['DELETE', '/api/admin/rag/documents/:id', '— (web only)'],
                  ].map(([m, p, c]) => (
                    <tr key={p as string} className="border-t border-white/10">
                      <td className="px-4 py-2 text-cyan-300">{m}</td>
                      <td className="px-4 py-2 text-purple-300">{p}</td>
                      <td className="px-4 py-2 text-gray-400 font-sans">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          All endpoints require a Bearer token (UI cookie or{' '}
          <code className="text-cyan-300">Authorization: Bearer &lt;jwt&gt;</code>). RBAC is
          enforced via the{' '}
          <code className="text-cyan-300">rbac</code> middleware — see{' '}
          <Link href="/docs/admin#roles" className="text-blue-300 hover:underline">
            Roles &amp; RBAC
          </Link>
          .
        </p>
      </TutorialSection>

      {/* ---------------- Footer ---------------- */}
      <div className="rounded-2xl bg-gradient-to-br from-cyan-500/15 via-purple-500/10 to-fuchsia-500/15 border border-white/10 p-8">
        <h3 className="text-2xl font-bold text-white mb-2">Next: bind a model to your collections</h3>
        <p className="text-gray-400 mb-5 max-w-2xl">
          A collection is just text + vectors — it doesn&apos;t answer anything. Pair it with a
          registered model and a virtual key to ship a chat experience your team can actually use.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/docs/admin/models"
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors"
          >
            AI Models guide →
          </Link>
          <Link
            href="/docs/admin/skills"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg font-medium transition-colors"
          >
            Skills guide →
          </Link>
          <Link
            href="/admin/rag"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg font-medium transition-colors"
          >
            Open Collections page →
          </Link>
        </div>
      </div>
    </div>
  )
}
