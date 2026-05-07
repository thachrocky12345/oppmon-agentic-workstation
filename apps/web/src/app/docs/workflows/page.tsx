'use client'

import { CodeSnippet, TutorialSection } from '@/components/tutorial'

/* ------------------------------------------------------------------------ */
/* Inline terminal mock (matches the live oppmon CLI output)                 */
/* ------------------------------------------------------------------------ */

function TerminalWindow({
  title = 'pwsh — oppmon',
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

const You = () => <span className="text-cyan-400">you ▸ </span>
const Bot = () => <span className="text-green-400">bot ▸ </span>
const Dim = ({ children }: { children: React.ReactNode }) => (
  <span className="text-gray-500">{children}</span>
)
const Prompt = () => <span className="text-purple-400">$ </span>
const Cmd = ({ children }: { children: React.ReactNode }) => (
  <span className="text-emerald-400">{children}</span>
)

/* ------------------------------------------------------------------------ */

export default function WorkflowsPage() {
  return (
    <div className="space-y-12">
      {/* ---------------- Header ---------------- */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-medium mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          Coding Workflows
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">Coding Workflows</h1>
        <p className="text-gray-400 text-lg max-w-3xl">
          Practical workflows for using the OppMon CLI together with Claude Code — from initial
          setup through bug-fix loops, RAG-grounded research, and end-of-day cleanup.
        </p>

        <div className="mt-6 grid sm:grid-cols-3 gap-3">
          <a href="/docs/cli-setup" className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-3 transition-colors">
            <p className="text-xs text-gray-500">Start here</p>
            <p className="text-white font-medium">CLI Setup →</p>
          </a>
          <a href="/docs/admin" className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-3 transition-colors">
            <p className="text-xs text-gray-500">For admins</p>
            <p className="text-white font-medium">Admin Guide →</p>
          </a>
          <a href="/admin/usage" className="rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-4 py-3 transition-colors">
            <p className="text-xs text-emerald-300/80">Live</p>
            <p className="text-emerald-300 font-medium">Usage Dashboard →</p>
          </a>
        </div>
      </div>

      {/* ---------------- Quick Setup ---------------- */}
      <TutorialSection
        id="quick-setup"
        icon={
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
        iconBg="bg-green-500/20"
        title="Quick Setup (One-Time)"
        description="Five commands from a clean clone."
      >
        <CodeSnippet
          code={`# 1. Install deps
pnpm install

# 2. Start the API in another terminal
pnpm dev:api

# 3. Authenticate (interactive OAuth device-code)
pnpm oppmon:login

# 4. Wire Claude Code hooks + enable event collection
pnpm oppmon:hooks install
pnpm oppmon:events enable

# 5. Verify everything is healthy
pnpm oppmon:doctor`}
          language="bash"
          title="Initial setup"
        />
        <p className="text-gray-500 text-sm mt-3">
          Need headless / CI auth? Set <code className="text-green-400">TAG_TOKEN</code> in the
          environment and run <code className="text-green-400">pnpm oppmon:login -- --headless</code>.
          See <a href="/docs/cli-setup" className="text-green-400 hover:underline">CLI Setup</a> for
          details.
        </p>
      </TutorialSection>

      {/* ---------------- Workflow 1: Start a session ---------------- */}
      <TutorialSection
        id="workflow-1"
        icon={<span className="text-lg font-bold text-blue-400">1</span>}
        iconBg="bg-blue-500/20"
        title="Starting a New Coding Session"
      >
        <div className="space-y-5">
          <div>
            <h4 className="text-white font-semibold mb-2">Confirm you&apos;re authenticated</h4>
            <CodeSnippet code={`pnpm oppmon:status`} language="bash" />
            <TerminalWindow title="status">
              <div className="text-white font-bold">Status</div>
              <div className="mt-2 text-gray-300">  Authenticated: <span className="text-green-400">Yes</span></div>
              <div className="text-gray-300">  User:          admin@oppmon.dev (Admin User)</div>
              <div className="text-gray-300">  Role:          <span className="text-yellow-400">TENANT_ADMIN</span></div>
              <div className="text-gray-300">  Token Expires: in 364 days</div>
            </TerminalWindow>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2">Pull latest skills + MCP configs</h4>
            <CodeSnippet code={`pnpm oppmon:sync skills pull
pnpm oppmon:sync mcp pull`} language="bash" />
            <p className="text-gray-500 text-sm mt-2">
              Downloads any new server-managed skills + MCP server configs into your local checkout.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2">Open Claude Code in your project</h4>
            <p className="text-gray-400 text-sm">
              Skill invocations (e.g. <code className="text-green-400">/commit</code>,{' '}
              <code className="text-green-400">/review-pr</code>) and MCP tool calls are captured
              automatically via the installed hooks.
            </p>
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Workflow 2: Bug fixing ---------------- */}
      <TutorialSection
        id="workflow-2"
        icon={<span className="text-lg font-bold text-red-400">2</span>}
        iconBg="bg-red-500/20"
        title="Bug-Fix Loop"
      >
        <div className="space-y-5">
          <div className="grid md:grid-cols-2 gap-3">
            {[
              { n: 1, title: 'Identify', desc: 'Ask Claude Code to triage the failing file/line.' },
              { n: 2, title: 'Locate context', desc: 'Use git log / git status to see what changed recently.' },
              { n: 3, title: 'Fix', desc: 'Have Claude Code apply a focused patch.' },
              { n: 4, title: 'Verify', desc: 'Run tests + smoke endpoints; flush events when done.' },
            ].map((s) => (
              <div key={s.n} className="rounded-lg bg-white/5 border border-white/10 p-4">
                <div className="text-xs text-red-400 font-mono">STEP {s.n}</div>
                <div className="text-white font-semibold mt-1">{s.title}</div>
                <div className="text-gray-400 text-sm mt-1">{s.desc}</div>
              </div>
            ))}
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2">Step 1 — Ask Claude Code to investigate</h4>
            <TerminalWindow title="claude code">
              <div><Prompt /><span className="text-white">Explain the error in apps/api/src/routes/auth.ts:108</span></div>
            </TerminalWindow>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2">Step 2 — See what changed recently</h4>
            <CodeSnippet code={`git log --oneline -10
git status
git diff apps/api/src/routes/auth.ts`} language="bash" />
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2">Step 3 — Apply the fix</h4>
            <TerminalWindow title="claude code">
              <div><Prompt /><span className="text-white">Add `iss: &apos;oppmon&apos;` to all jwt.sign calls in auth.ts so the web edge middleware accepts them</span></div>
            </TerminalWindow>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2">Step 4 — Test &amp; flush</h4>
            <CodeSnippet code={`# Run tests
pnpm --filter @oppmon/api test

# Smoke the API
curl -s http://localhost:3001/api/health

# Send today's tracked work to the dashboard
pnpm oppmon:events flush`} language="bash" />
            <p className="text-gray-500 text-sm mt-2">
              View activity at{' '}
              <a href="/admin/usage" className="text-green-400 hover:underline">/admin/usage</a>.
            </p>
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Workflow 3: RAG-grounded chat ---------------- */}
      <TutorialSection
        id="workflow-3"
        icon={<span className="text-lg font-bold text-emerald-400">3</span>}
        iconBg="bg-emerald-500/20"
        title="Ask Your Codebase — RAG Chat"
        description="Faster than scrolling through docs."
      >
        <div className="space-y-5">
          <p className="text-gray-300">
            Once your docs/ADRs/RFCs are ingested, the CLI chat answers from them with citations.
          </p>

          <div>
            <h4 className="text-white font-semibold mb-2">One-shot</h4>
            <CodeSnippet code={`pnpm oppmon:chat "what does ADR-0008 say about the agent engine?"`} language="bash" />
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2">Interactive REPL</h4>
            <CodeSnippet code={`pnpm oppmon:chat`} language="bash" />
            <TerminalWindow title="oppmon chat — interactive">
              <div className="text-white font-bold">  oppmon chat — interactive</div>
              <div className="mt-3"><Dim>  Type a message and press Enter. /exit to quit, /reset to clear context.</Dim></div>
              <div className="mt-5"><You />where is JWT issued?</div>
              <div><Bot />JWTs are minted in <span className="text-emerald-300">apps/api/src/routes/auth.ts</span> at three sites: login (~line 108), register (~line 175), and the device-code token exchange (~line 423). All three include <span className="text-emerald-300">iss: &apos;oppmon&apos;</span> so the web edge middleware accepts them.</div>
              <div className="mt-2"><Dim>  citations: 3</Dim></div>
              <div className="mt-5"><You /><span className="text-white">/exit</span></div>
              <div><Dim>  goodbye</Dim></div>
            </TerminalWindow>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2">Pin to a specific collection</h4>
            <CodeSnippet code={`pnpm oppmon:chat -- -c <collectionId> "summarize the data ingestion pipeline"`} language="bash" />
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Workflow 4: Web search + tools ---------------- */}
      <TutorialSection
        id="workflow-4"
        icon={<span className="text-lg font-bold text-purple-400">4</span>}
        iconBg="bg-purple-500/20"
        title="When You Need Fresh Facts — Web Search + Tools"
      >
        <div className="space-y-4">
          <p className="text-gray-300">
            Strict RAG mode refuses live data. For exploratory questions, enable both flags:
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <code className="text-purple-300 font-mono text-sm font-bold">--web-fallback</code>
              <p className="text-gray-400 text-xs mt-2">
                Backend may fall back to web search when RAG yields no usable context.
              </p>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <code className="text-purple-300 font-mono text-sm font-bold">--enable-tools</code>
              <p className="text-gray-400 text-xs mt-2">
                Model can invoke <code>web_search</code> and other registered tools.
              </p>
            </div>
          </div>
          <CodeSnippet
            code={`pnpm oppmon:chat -- --web-fallback --enable-tools \\
  "what's the current weather in Dallas?"

# Combine with a stronger model
pnpm oppmon:chat -- -p anthropic -m claude-sonnet-4-... \\
  --web-fallback --enable-tools \\
  "summarize today's top tech news"`}
            language="bash"
          />
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-100">
            <strong className="text-blue-300">Compliance note:</strong> strict mode (default) is the
            safer choice for regulated workflows because answers are citable. Flip these flags on
            only when you actually need live data.
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Workflow 5: Skill development ---------------- */}
      <TutorialSection
        id="workflow-5"
        icon={<span className="text-lg font-bold text-orange-400">5</span>}
        iconBg="bg-orange-500/20"
        title="Skill Development"
      >
        <div className="space-y-5">
          <div>
            <h4 className="text-white font-semibold mb-2">Scaffold a new skill</h4>
            <CodeSnippet
              code={`# Windows
mkdir .claude\\skills\\my-new-skill

# bash / zsh
mkdir -p .claude/skills/my-new-skill`}
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2">Write SKILL.md with YAML frontmatter</h4>
            <CodeSnippet
              code={`---
name: my-new-skill
description: One-line description used by the skill registry
trigger: /my-new-skill
---

# My New Skill

Detailed instructions go here. Use \`\${args}\` to interpolate the user's input.

## Steps

1. Read context from CLAUDE.md
2. Apply the workflow described below
3. Report back to the user`}
              language="markdown"
              title=".claude/skills/my-new-skill/SKILL.md"
            />
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2">Push to the registry</h4>
            <CodeSnippet code={`pnpm oppmon:sync skills push my-new-skill
pnpm oppmon:sync skills list`} language="bash" />
            <p className="text-gray-500 text-sm mt-2">
              Once pushed, anyone with access to the team can{' '}
              <code className="text-green-400">pnpm oppmon:sync skills pull</code> and use it.
            </p>
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Workflow 6: RAG ingestion ---------------- */}
      <TutorialSection
        id="workflow-6"
        icon={<span className="text-lg font-bold text-cyan-400">6</span>}
        iconBg="bg-cyan-500/20"
        title="Build Your RAG Corpus"
      >
        <div className="space-y-5">
          <div>
            <h4 className="text-white font-semibold mb-2">Ingest a single doc</h4>
            <CodeSnippet code={`pnpm oppmon:rag ingest README.md`} language="bash" />
          </div>
          <div>
            <h4 className="text-white font-semibold mb-2">Ingest a whole directory</h4>
            <CodeSnippet code={`pnpm oppmon:rag ingest-dir ./docs`} language="bash" />
            <p className="text-gray-500 text-sm mt-2">
              Files are chunked (~800 tokens, 100-token overlap), embedded, and stored against the
              tenant&apos;s collections. PDFs use <code>pdf-parse</code>, DOCX uses{' '}
              <code>mammoth</code>, plain text is read directly.
            </p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-2">Search & query</h4>
            <CodeSnippet
              code={`# Pure semantic search (returns chunks)
pnpm oppmon:rag search "how does authentication work?"

# Full RAG → LLM answer with citations
pnpm oppmon:rag query "explain the database schema"

# List all embeddings + stats
pnpm oppmon:rag list
pnpm oppmon:rag stats`}
              language="bash"
            />
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Workflow 7: Debugging ---------------- */}
      <TutorialSection
        id="workflow-7"
        icon={<span className="text-lg font-bold text-yellow-400">7</span>}
        iconBg="bg-yellow-500/20"
        title="Debugging the CLI"
      >
        <div className="space-y-5">
          <div>
            <h4 className="text-white font-semibold mb-2">Run all checks</h4>
            <CodeSnippet code={`pnpm oppmon:doctor`} language="bash" />
            <TerminalWindow title="oppmon doctor">
              <div className="text-white font-bold">OppMon CLI Diagnostics</div>
              <div className="mt-3"><span className="text-green-400">✓</span> <span className="text-white">Installation</span>     <Dim>CLI configured correctly</Dim></div>
              <div><span className="text-green-400">✓</span> <span className="text-white">Authentication</span>   <Dim>Token valid, expires in 364 days</Dim></div>
              <div><span className="text-green-400">✓</span> <span className="text-white">Network</span>          <Dim>API reachable (67ms)</Dim></div>
              <div><span className="text-green-400">✓</span> <span className="text-white">Claude Code</span>      <Dim>Claude Code configured with hooks</Dim></div>
              <div><span className="text-green-400">✓</span> <span className="text-white">Sync State</span>       <Dim>Skills synced</Dim></div>
            </TerminalWindow>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <p className="text-yellow-400 font-mono text-sm font-bold mb-1">auth only</p>
              <CodeSnippet code={`pnpm oppmon:doctor auth`} language="bash" />
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <p className="text-yellow-400 font-mono text-sm font-bold mb-1">network only</p>
              <CodeSnippet code={`pnpm oppmon:doctor network`} language="bash" />
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <p className="text-yellow-400 font-mono text-sm font-bold mb-1">auto-fix</p>
              <CodeSnippet code={`pnpm oppmon:doctor -- --fix`} language="bash" />
            </div>
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Workflow 8: End of day ---------------- */}
      <TutorialSection
        id="workflow-8"
        icon={<span className="text-lg font-bold text-gray-300">8</span>}
        iconBg="bg-gray-500/20"
        title="End of Day"
      >
        <div className="space-y-4">
          <CodeSnippet
            code={`# Push any skill changes you made
pnpm oppmon:sync skills push

# Flush remaining buffered events to the server
pnpm oppmon:events flush

# Sanity-check today's count
pnpm oppmon:events status`}
            language="bash"
          />
          <div className="grid md:grid-cols-2 gap-3">
            <a href="/admin/usage" className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-3 transition-colors">
              <p className="text-xs text-gray-500">Skills + MCP</p>
              <p className="text-white font-medium">Usage Dashboard →</p>
            </a>
            <a href="/admin/llm-usage" className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-3 transition-colors">
              <p className="text-xs text-gray-500">Token + cost</p>
              <p className="text-white font-medium">LLM Usage Dashboard →</p>
            </a>
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Tips ---------------- */}
      <TutorialSection
        id="tips"
        icon={
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        }
        iconBg="bg-green-500/20"
        title="Tips & Best Practices"
      >
        <div className="grid md:grid-cols-2 gap-5">
          <div className="rounded-lg bg-white/5 border border-white/10 p-4">
            <h4 className="text-white font-semibold mb-2">1. Always run from repo root</h4>
            <p className="text-gray-400 text-sm">
              <code className="text-green-400">pnpm oppmon:*</code> aliases live in root{' '}
              <code>package.json</code> and call{' '}
              <code className="text-green-400">pnpm --filter @oppmon/cli dev …</code> under the
              hood. Running from a sub-directory may break the workspace filter.
            </p>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-4">
            <h4 className="text-white font-semibold mb-2">2. Forward CLI flags with <code>--</code></h4>
            <p className="text-gray-400 text-sm">
              pnpm consumes flags it recognizes. Use{' '}
              <code className="text-green-400">pnpm oppmon:chat -- --web-fallback &quot;...&quot;</code>{' '}
              to send <code>--web-fallback</code> to the inner <code>oppmon</code> command.
            </p>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-4">
            <h4 className="text-white font-semibold mb-2">3. Re-install hooks after CLI updates</h4>
            <CodeSnippet code={`pnpm oppmon:hooks install`} language="bash" />
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-4">
            <h4 className="text-white font-semibold mb-2">4. Ingest before asking</h4>
            <p className="text-gray-400 text-sm mb-2">
              Faster + citable answers when your corpus is fresh:
            </p>
            <CodeSnippet code={`pnpm oppmon:rag ingest-dir ./docs`} language="bash" />
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-4">
            <h4 className="text-white font-semibold mb-2">5. Avoid <code>pnpm dev:api login</code></h4>
            <p className="text-gray-400 text-sm">
              <code>pnpm dev:api</code> is a Turbo task that boots the API server. Trailing args
              are interpreted as additional task names → <em>Could not find task &apos;login&apos;</em>.
              Use <code className="text-green-400">pnpm oppmon:login</code> instead.
            </p>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-4">
            <h4 className="text-white font-semibold mb-2">6. Wire it into your shell</h4>
            <p className="text-gray-400 text-sm mb-2">Optional alias:</p>
            <CodeSnippet
              code={`# bash / zsh — append to ~/.bashrc or ~/.zshrc
alias om="pnpm oppmon:"
# usage: om login | om status | om chat`}
              language="bash"
            />
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Footer ---------------- */}
      <div className="rounded-xl bg-gradient-to-br from-cyan-500/10 to-emerald-500/10 border border-white/10 p-6 flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold mb-1">Next stop</h3>
          <p className="text-gray-400 text-sm">
            Admins: head to the Admin Guide for tenant, team, model, and skill governance.
          </p>
        </div>
        <a
          href="/docs/admin"
          className="px-4 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-sm transition-colors"
        >
          Admin Guide →
        </a>
      </div>
    </div>
  )
}
