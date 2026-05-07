'use client'

import { CodeSnippet, TutorialSection } from '@/components/tutorial'

/* ------------------------------------------------------------------------ */
/* Inline terminal mock — mirrors the live `oppmon chat` REPL output         */
/* ------------------------------------------------------------------------ */

function TerminalWindow({
  title = 'pwsh — oppmon chat',
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

/* ------------------------------------------------------------------------ */

export default function CLISetupPage() {
  return (
    <div className="space-y-12">
      {/* ---------------- Header ---------------- */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-medium mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          OppMon CLI v0.1.0
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">CLI Setup Guide</h1>
        <p className="text-gray-400 text-lg max-w-3xl">
          Everything you need to run the OppMon CLI (
          <code className="text-green-400 px-1.5 py-0.5 rounded bg-white/5">oppmon</code> command,
          alias <code className="text-green-400 px-1.5 py-0.5 rounded bg-white/5">tag</code>) — auth,
          RAG-grounded chat, Claude Code event capture, and skill / MCP sync.
        </p>

        <div className="mt-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex gap-3">
          <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-yellow-400 font-medium text-sm">Don&apos;t use <code>pnpm dev:api login</code></p>
            <p className="text-gray-300 text-sm mt-1">
              <code className="text-green-400">pnpm dev:api</code> is the API dev server — it does
              not accept subcommands and will fail with{' '}
              <em>Could not find task &apos;login&apos;</em>. Use the{' '}
              <code className="text-green-400">pnpm oppmon:*</code> aliases (defined in root{' '}
              <code>package.json</code>) instead.
            </p>
          </div>
        </div>
      </div>

      {/* ---------------- Featured: Interactive Chat ---------------- */}
      <TutorialSection
        id="featured-chat"
        icon={
          <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        }
        iconBg="bg-emerald-500/20"
        title="✨ Interactive RAG chat in your terminal"
        description="Streams from /api/rag/chat/stream — same model, same citations, same retrieval as the dashboard."
      >
        <div className="space-y-5">
          <p className="text-gray-300">
            Launch the REPL with no message argument:
          </p>
          <CodeSnippet code={`pnpm oppmon:chat`} language="bash" />

          <TerminalWindow>
            <div className="text-white font-bold">  oppmon chat — interactive</div>
            <div className="mt-3"><Dim>  Type a message and press Enter. /exit to quit, /reset to clear context.</Dim></div>

            <div className="mt-5"><You />Hello</div>
            <div><Bot />Hello! I&apos;m here to help you with questions about your documents and knowledge base. I can see from the context that you have materials related to a team AI gateway demo plan, procedures, technical implementation notes, and demo narratives.</div>
            <div className="mt-2 text-gray-300">Is there something specific you&apos;d like to know about the demo plan, technical implementation, or any other topic from your documents? I can help explain concepts, clarify procedures based on the information available in your knowledge base.</div>
            <div className="mt-2"><Dim>  citations: 5</Dim></div>

            <div className="mt-5"><You />What is genetic?</div>
            <div><Bot />I don&apos;t have any relevant information about genetics in the current knowledge base, which appears to focus on AI gateway demo plans and technical implementation materials.</div>
            <div className="mt-2 text-gray-300">Based on general knowledge, &quot;genetic&quot; typically refers to:</div>
            <ol className="mt-1 ml-4 list-decimal text-gray-300 space-y-0.5">
              <li><span className="text-white font-semibold">Genetics as a field</span>: The study of genes, heredity, and genetic variation in living organisms</li>
              <li><span className="text-white font-semibold">Genetic traits</span>: Characteristics passed from parents to offspring through DNA</li>
              <li><span className="text-white font-semibold">Genetic material</span>: DNA and RNA that carry hereditary information</li>
              <li><span className="text-white font-semibold">Genetic processes</span>: How traits are inherited, expressed, and can change over time</li>
            </ol>
            <div className="mt-2 text-gray-300">However, since this information isn&apos;t grounded in your document knowledge base, I&apos;d recommend adding relevant genetics materials if you need detailed, citable information on this topic.</div>

            <div className="mt-5"><You /><span className="text-white">/exit</span></div>
            <div><Dim>  goodbye</Dim></div>
          </TerminalWindow>

          <div className="grid md:grid-cols-3 gap-3 pt-2">
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <p className="text-cyan-400 font-mono text-sm font-bold">/exit</p>
              <p className="text-gray-400 text-xs mt-1">or <code>/quit</code> · leaves the REPL</p>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <p className="text-cyan-400 font-mono text-sm font-bold">/reset</p>
              <p className="text-gray-400 text-xs mt-1">clears conversation context, keeps session</p>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <p className="text-cyan-400 font-mono text-sm font-bold">Ctrl-C</p>
              <p className="text-gray-400 text-xs mt-1">EOF / interrupt also exits cleanly</p>
            </div>
          </div>

          <div className="pt-2">
            <h4 className="text-white font-semibold mb-2">Interactive with provider, model, RAG collection</h4>
            <CodeSnippet
              code={`# Ollama llama3.2 grounded on a collection
pnpm oppmon:chat -- -p ollama -m llama3.2:latest -c <collectionId>

# Anthropic Claude with web search + tool calling
pnpm oppmon:chat -- -p anthropic --web-fallback --enable-tools

# Disable streaming (each reply prints in full when ready)
pnpm oppmon:chat -- --no-stream`}
              language="bash"
            />
          </div>

          <div className="pt-2">
            <h4 className="text-white font-semibold mb-2">One-shot (no REPL)</h4>
            <CodeSnippet code={`pnpm oppmon:chat "summarize the latest ADR"`} language="bash" />
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-100">
            <strong className="text-blue-300">Why the <code>--</code> separator?</strong>{' '}
            <code>pnpm oppmon:chat</code> resolves to{' '}
            <code>pnpm --filter @oppmon/cli dev chat</code>. Anything after <code>--</code> is
            forwarded verbatim to the inner CLI; without it, pnpm may consume flags meant for{' '}
            <code>oppmon</code>.
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Prerequisites ---------------- */}
      <TutorialSection
        id="prerequisites"
        icon={
          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        iconBg="bg-blue-500/20"
        title="Prerequisites"
      >
        <div className="grid md:grid-cols-2 gap-3">
          {[
            { label: 'Node.js 20+', hint: 'runtime' },
            { label: 'pnpm', hint: 'package manager' },
            { label: 'PostgreSQL', hint: 'docker or local' },
            { label: 'OppMon API @ :3001', hint: 'pnpm dev:api' },
          ].map((p) => (
            <div key={p.label} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
              <span className="text-green-400">✓</span>
              <div>
                <div className="text-white font-medium">{p.label}</div>
                <div className="text-gray-500 text-xs">{p.hint}</div>
              </div>
            </div>
          ))}
        </div>
      </TutorialSection>

      {/* ---------------- Step 1: Install ---------------- */}
      <TutorialSection
        id="step-1"
        icon={<span className="text-lg font-bold text-green-400">1</span>}
        iconBg="bg-green-500/20"
        title="Install Dependencies"
      >
        <div className="space-y-4">
          <p className="text-gray-300">From the repo root:</p>
          <CodeSnippet code={`pnpm install`} language="bash" />
          <p className="text-gray-500 text-sm">
            The CLI runs in dev mode via <code>tsx</code> — no build step required. For a compiled
            artifact:
          </p>
          <CodeSnippet code={`pnpm --filter @oppmon/cli build`} language="bash" />
        </div>
      </TutorialSection>

      {/* ---------------- Step 2: Verify ---------------- */}
      <TutorialSection
        id="step-2"
        icon={<span className="text-lg font-bold text-green-400">2</span>}
        iconBg="bg-green-500/20"
        title="Verify Installation"
      >
        <div className="space-y-4">
          <p className="text-gray-300">Show the CLI help:</p>
          <CodeSnippet code={`pnpm --filter @oppmon/cli dev -- --help`} language="bash" />
          <TerminalWindow title="oppmon --help">
            <div className="text-gray-300">Usage: oppmon [options] [command]</div>
            <div className="mt-2 text-gray-300">OppMon CLI - AI Gateway management tool</div>
            <div className="mt-3 text-gray-400">Commands:</div>
            <div className="text-gray-300">  <span className="text-emerald-400">login</span>     Authenticate with the OppMon Gateway</div>
            <div className="text-gray-300">  <span className="text-emerald-400">logout</span>    Log out and clear stored credentials</div>
            <div className="text-gray-300">  <span className="text-emerald-400">status</span>    Show current authentication state</div>
            <div className="text-gray-300">  <span className="text-emerald-400">chat</span>      Chat with the RAG-grounded LLM</div>
            <div className="text-gray-300">  <span className="text-emerald-400">sync</span>      Sync skills and MCP configurations</div>
            <div className="text-gray-300">  <span className="text-emerald-400">rag</span>       RAG ingestion / search / query</div>
            <div className="text-gray-300">  <span className="text-emerald-400">hooks</span>     Manage Claude Code event capture hooks</div>
            <div className="text-gray-300">  <span className="text-emerald-400">events</span>    Manage event collection and buffering</div>
            <div className="text-gray-300">  <span className="text-emerald-400">doctor</span>    Diagnose and fix common issues</div>
          </TerminalWindow>
        </div>
      </TutorialSection>

      {/* ---------------- Step 3: Services ---------------- */}
      <TutorialSection
        id="step-3"
        icon={<span className="text-lg font-bold text-green-400">3</span>}
        iconBg="bg-green-500/20"
        title="Start Required Services"
      >
        <div className="space-y-4">
          <p className="text-gray-300">Start the OppMon API:</p>
          <CodeSnippet code={`# From project root\npnpm dev:api`} language="bash" />
          <p className="text-gray-300 mt-4">Verify health:</p>
          <CodeSnippet code="curl http://localhost:3001/api/health" language="bash" />
          <TerminalWindow title="health">
            <div className="text-gray-300">{'{"status":"healthy","timestamp":"...","version":"1.0.0","checks":{"database":"ok"}}'}</div>
          </TerminalWindow>
        </div>
      </TutorialSection>

      {/* ---------------- Step 4: Auth ---------------- */}
      <TutorialSection
        id="step-4"
        icon={<span className="text-lg font-bold text-green-400">4</span>}
        iconBg="bg-green-500/20"
        title="Authenticate the CLI"
      >
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-300">RECOMMENDED</span>
                <h4 className="text-white font-semibold">Option A — Interactive</h4>
              </div>
              <p className="text-gray-400 text-sm mb-3">OAuth device-code flow. Opens browser, polls until you approve.</p>
              <CodeSnippet code={`pnpm oppmon:login`} language="bash" />
              <p className="text-gray-500 text-xs mt-3">
                Tokens stored in OS keychain via <code>keytar</code> with JSON fallback at{' '}
                <code>~/.tag/</code>.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-white/10 text-gray-300">CI / SCRIPTED</span>
                <h4 className="text-white font-semibold">Option B — Headless</h4>
              </div>
              <p className="text-gray-400 text-sm mb-3">Token from environment variable.</p>
              <CodeSnippet
                code={`# Windows cmd.exe
set TAG_API_URL=http://localhost:3001
set TAG_TOKEN=YOUR_TOKEN
pnpm oppmon:login -- --headless

# bash / zsh
export TAG_API_URL=http://localhost:3001
export TAG_TOKEN=YOUR_TOKEN
pnpm oppmon:login -- --headless`}
                language="bash"
              />
            </div>
          </div>

          <div>
            <p className="text-gray-300 text-sm mb-2">First grab a token from the API:</p>
            <CodeSnippet
              code={`curl -X POST http://localhost:3001/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\\"email\\":\\"admin@oppmon.dev\\",\\"password\\":\\"admin123\\"}"`}
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2">Verify</h4>
            <CodeSnippet code={`pnpm oppmon:status`} language="bash" />
            <TerminalWindow title="status">
              <div className="text-white font-bold">Status</div>
              <div className="mt-2 text-gray-300">  Authenticated: <span className="text-green-400">Yes</span></div>
              <div className="text-gray-300">  User:          admin@oppmon.dev (Admin User)</div>
              <div className="text-gray-300">  Role:          <span className="text-yellow-400">TENANT_ADMIN</span></div>
              <div className="text-gray-300">  Tenant:        Default Tenant</div>
              <div className="text-gray-300">  Token Expires: in 364 days</div>
              <div className="text-gray-300">  API Endpoint:  http://localhost:3001</div>
            </TerminalWindow>
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Step 5: Web search + tools ---------------- */}
      <TutorialSection
        id="step-5"
        icon={
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
        }
        iconBg="bg-purple-500/20"
        title="Beyond RAG — web search & tool calling"
      >
        <div className="space-y-4">
          <p className="text-gray-300">
            For prompts that need fresh facts not in your RAG corpus (e.g. live weather, current
            news), enable both:
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <code className="text-purple-300 font-mono text-sm font-bold">--web-fallback</code>
              <p className="text-gray-400 text-xs mt-2">
                Allow the backend to fall back to a web search when RAG yields no usable context.
              </p>
            </div>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <code className="text-purple-300 font-mono text-sm font-bold">--enable-tools</code>
              <p className="text-gray-400 text-xs mt-2">
                Enable tool calling for the turn so the model can invoke <code>web_search</code>{' '}
                and other registered tools.
              </p>
            </div>
          </div>
          <CodeSnippet
            code={`pnpm oppmon:chat -- --web-fallback --enable-tools \\
  "what's the current weather in Dallas?"

# Combine with provider/model selection:
pnpm oppmon:chat -- -p anthropic -m claude-sonnet-4-... \\
  --web-fallback --enable-tools \\
  "summarize today's top tech news"`}
            language="bash"
          />
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-100">
            <strong className="text-blue-300">Strict mode is the safe default.</strong> Without
            these flags, chat is RAG-only and will tell you it has no context for live data — which
            is what you want for compliance. Flip both on for exploratory / live-knowledge answers.
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Step 6: Hooks ---------------- */}
      <TutorialSection
        id="step-6"
        icon={<span className="text-lg font-bold text-green-400">6</span>}
        iconBg="bg-green-500/20"
        title="Install Claude Code Hooks"
      >
        <div className="space-y-4">
          <p className="text-gray-300">Wire OppMon event capture into Claude Code:</p>
          <CodeSnippet code={`pnpm oppmon:hooks install`} language="bash" />
          <ul className="text-gray-400 text-sm space-y-1 mt-3 ml-1">
            <li>• Creates / updates <code>~/.claude/hooks.json</code></li>
            <li>• Adds <code>postSkillInvoke</code> and <code>postToolCall</code> hooks</li>
            <li>• Captures events when you use skills or MCP tools in Claude Code</li>
          </ul>
        </div>
      </TutorialSection>

      {/* ---------------- Step 7: Events ---------------- */}
      <TutorialSection
        id="step-7"
        icon={<span className="text-lg font-bold text-green-400">7</span>}
        iconBg="bg-green-500/20"
        title="Enable Event Collection"
      >
        <div className="space-y-4">
          <CodeSnippet code={`pnpm oppmon:events enable`} language="bash" />
          <p className="text-gray-400 text-sm">
            Buffered events live in <code>~/.tag/events.buffer</code> and auto-flush every 30
            seconds.
          </p>
        </div>
      </TutorialSection>

      {/* ---------------- Step 8: Doctor ---------------- */}
      <TutorialSection
        id="step-8"
        icon={<span className="text-lg font-bold text-green-400">8</span>}
        iconBg="bg-green-500/20"
        title="Verify Setup"
      >
        <div className="space-y-4">
          <CodeSnippet code={`pnpm oppmon:doctor`} language="bash" />
          <TerminalWindow title="oppmon doctor">
            <div className="text-white font-bold">OppMon CLI Diagnostics</div>
            <div className="mt-3"><span className="text-green-400">✓</span> <span className="text-white">Installation</span>     <Dim>CLI configured correctly</Dim></div>
            <div><span className="text-green-400">✓</span> <span className="text-white">Authentication</span>   <Dim>Token valid, expires in 364 days</Dim></div>
            <div><span className="text-green-400">✓</span> <span className="text-white">Network</span>          <Dim>API reachable (67ms)</Dim></div>
            <div><span className="text-green-400">✓</span> <span className="text-white">Claude Code</span>      <Dim>Claude Code configured with hooks</Dim></div>
            <div><span className="text-green-400">✓</span> <span className="text-white">Sync State</span>       <Dim>Skills synced</Dim></div>
            <div className="mt-3"><Dim>Summary: 5 passed, 0 warnings, 0 errors</Dim></div>
          </TerminalWindow>
          <p className="text-gray-500 text-sm">
            If you see warnings: <code className="text-green-400">pnpm oppmon:doctor -- --fix</code>
          </p>
        </div>
      </TutorialSection>

      {/* ---------------- Step 9: Test ---------------- */}
      <TutorialSection
        id="step-9"
        icon={<span className="text-lg font-bold text-green-400">9</span>}
        iconBg="bg-green-500/20"
        title="Test the Integration"
      >
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-lg bg-white/5 border border-white/10 p-4">
            <h4 className="text-white font-semibold mb-2">Check event status</h4>
            <CodeSnippet code={`pnpm oppmon:events status`} language="bash" />
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-4">
            <h4 className="text-white font-semibold mb-2">Flush manually</h4>
            <CodeSnippet code={`pnpm oppmon:events flush`} language="bash" />
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-4">
            <h4 className="text-white font-semibold mb-2">Use Claude Code</h4>
            <p className="text-gray-400 text-sm">
              Invoke skills (e.g. <code className="text-green-400">/commit</code>) or MCP tools —
              events captured automatically.
            </p>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-4">
            <h4 className="text-white font-semibold mb-2">View dashboards</h4>
            <div className="flex flex-col gap-1">
              <a href="/admin/usage" className="text-green-400 hover:underline text-sm">→ Usage Dashboard</a>
              <a href="/admin/llm-usage" className="text-green-400 hover:underline text-sm">→ LLM Usage Dashboard</a>
            </div>
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Command Reference ---------------- */}
      <TutorialSection
        id="command-reference"
        icon={
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        }
        iconBg="bg-purple-500/20"
        title="Command Reference"
        description="All commands run from the repo root."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 text-gray-400 font-medium">Task</th>
                <th className="text-left py-2 text-gray-400 font-medium">Command</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {[
                ['Login (interactive)', 'pnpm oppmon:login'],
                ['Login (headless)', 'pnpm oppmon:login -- --headless'],
                ['Status', 'pnpm oppmon:status'],
                ['Logout', 'pnpm oppmon:logout'],
                ['Chat (one-shot)', 'pnpm oppmon:chat "prompt"'],
                ['Chat (interactive REPL)', 'pnpm oppmon:chat'],
                ['Chat + web search + tools', 'pnpm oppmon:chat -- --web-fallback --enable-tools "..."'],
                ['Run diagnostics', 'pnpm oppmon:doctor'],
                ['Pull skills', 'pnpm oppmon:sync skills pull'],
                ['Push skills', 'pnpm oppmon:sync skills push'],
                ['Install hooks', 'pnpm oppmon:hooks install'],
                ['Enable events', 'pnpm oppmon:events enable'],
                ['Flush events', 'pnpm oppmon:events flush'],
                ['Ingest doc', 'pnpm oppmon:rag ingest <file>'],
                ['Search RAG', 'pnpm oppmon:rag search "query"'],
              ].map(([task, cmd]) => (
                <tr key={cmd} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="py-2.5 pr-4">{task}</td>
                  <td className="py-2.5 font-mono text-green-400 text-xs md:text-sm">{cmd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TutorialSection>

      {/* ---------------- Troubleshooting ---------------- */}
      <TutorialSection
        id="troubleshooting"
        icon={
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
        iconBg="bg-red-500/20"
        title="Troubleshooting"
      >
        <div className="space-y-4">
          {[
            {
              q: '“Could not find task `login`” after running pnpm dev:api login',
              a: <>That&apos;s not a real command. <code>pnpm dev:api</code> only starts the API server. Use <code className="text-green-400">pnpm oppmon:login</code> (or <code className="text-green-400">pnpm oppmon:login -- --headless</code>).</>,
            },
            {
              q: '“Not authenticated”',
              a: <>Re-login: <code className="text-green-400">pnpm oppmon:logout</code> then <code className="text-green-400">pnpm oppmon:login</code>. For headless, refresh <code>TAG_TOKEN</code>.</>,
            },
            {
              q: '“API not reachable”',
              a: <>Confirm health with <code className="text-green-400">curl http://localhost:3001/api/health</code>. If the API is down, run <code className="text-green-400">pnpm dev:api</code>.</>,
            },
            {
              q: 'Login bounces back to /login after idle',
              a: <>The web edge middleware requires <code>iss: &apos;oppmon&apos;</code> in JWTs. If you&apos;re on an older API build, restart <code>pnpm dev:api</code> to pick up the latest signing config.</>,
            },
            {
              q: 'REPL stalls or replies always say “no context”',
              a: <>You&apos;re in strict RAG mode with no matching chunks. Pass <code>-c &lt;collectionId&gt;</code> for a corpus that has the answer, or add <code className="text-green-400">--web-fallback --enable-tools</code>.</>,
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

      {/* ---------------- Footer ---------------- */}
      <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-white/10 p-6 flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold mb-1">Need a deep-dive?</h3>
          <p className="text-gray-400 text-sm">
            Read the full markdown guide at{' '}
            <code className="text-green-400">docs/cli-setup-guide.md</code> in the repo.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/docs/quick-start"
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm transition-colors"
          >
            Quick Start →
          </a>
          <a
            href="/admin/usage"
            className="px-4 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-sm transition-colors"
          >
            Open Dashboard →
          </a>
        </div>
      </div>
    </div>
  )
}
