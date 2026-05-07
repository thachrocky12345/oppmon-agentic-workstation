'use client'

import { CodeSnippet, TutorialSection, FeatureCard } from '@/components/tutorial'
import Link from 'next/link'

/* ------------------------------------------------------------------------ */
/* Inline terminal mock (matches the live oppmon CLI output)                 */
/* ------------------------------------------------------------------------ */

function TerminalWindow({
  title = 'pwsh — oppmon analytics',
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

const Bad = ({ children }: { children: React.ReactNode }) => (
  <span className="text-red-400">{children}</span>
)

/* ------------------------------------------------------------------------ */

export default function AnalyticsPage() {
  return (
    <div className="space-y-12">
      {/* ---------------- Header ---------------- */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Features · Analytics &amp; Audit
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">Analytics &amp; Audit</h1>
        <p className="text-gray-400 text-lg max-w-3xl">
          Three streams of telemetry — <span className="text-white font-medium">LLM activity</span>{' '}
          (requests, tokens, cost), <span className="text-white font-medium">privacy-first usage events</span>{' '}
          (skill / MCP / RAG invocations bucketed without user identifiers), and{' '}
          <span className="text-white font-medium">an append-only audit log</span> (every CRUD on
          gateway resources). All three are queryable from the dashboard or with{' '}
          <code className="px-1.5 py-0.5 bg-amber-500/10 text-amber-300 rounded text-sm">
            pnpm oppmon:analytics
          </code>
          .
        </p>

        <div className="mt-6 grid sm:grid-cols-3 gap-3">
          <Link
            href="/analytics"
            className="rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-4 py-3 transition-colors"
          >
            <p className="text-xs text-amber-300/80">Live</p>
            <p className="text-amber-300 font-medium">Open Analytics →</p>
          </Link>
          <Link
            href="/costs"
            className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-3 transition-colors"
          >
            <p className="text-xs text-gray-500">Live</p>
            <p className="text-white font-medium">Open Costs →</p>
          </Link>
          <Link
            href="/compliance"
            className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-3 transition-colors"
          >
            <p className="text-xs text-gray-500">Live</p>
            <p className="text-white font-medium">Audit Log →</p>
          </Link>
        </div>

        <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
          <p className="text-emerald-300 font-medium text-sm">
            Privacy-first by default: usage events carry no user identifiers
          </p>
          <p className="text-gray-400 text-xs mt-1">
            The{' '}
            <code className="px-1 py-0.5 bg-black/40 rounded text-emerald-200">usage_events</code>{' '}
            table intentionally omits{' '}
            <code className="px-1 py-0.5 bg-black/40 rounded text-emerald-200">user_id</code> and
            buckets timestamps to a 15-minute granularity. This means you get accurate{' '}
            <em>aggregate</em> insights (how often a skill is used, which MCP servers are popular)
            without ever building a per-user invocation profile. Disable collection anytime with{' '}
            <code className="px-1 py-0.5 bg-black/40 rounded text-emerald-200">
              oppmon analytics disable
            </code>
            .
          </p>
        </div>
      </div>

      {/* ---------------- Three streams ---------------- */}
      <TutorialSection
        id="three-streams"
        iconBg="bg-amber-500/20"
        icon={
          <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        }
        title="Three telemetry streams"
        description="Each stream answers a different operational question. Pick the right one for the job."
      >
        <div className="grid md:grid-cols-3 gap-4">
          <FeatureCard
            icon={<span className="text-2xl">📊</span>}
            title="LLM analytics"
            description="Requests, tokens, latency, cost — derived from llm_sessions and llm_messages. Per-agent and per-model breakdowns. Best for capacity planning and provider comparisons."
          />
          <FeatureCard
            icon={<span className="text-2xl">🔒</span>}
            title="Usage events"
            description="Privacy-respecting counters for skills, MCP servers, and RAG queries. 15-minute time buckets, no user_id stored. Best for 'is anyone actually using this skill?' questions."
          />
          <FeatureCard
            icon={<span className="text-2xl">📜</span>}
            title="Audit log"
            description="Append-only WHO did WHAT to WHICH resource WHEN, with before/after JSON. Tied to compliance dashboards. Best for security review and change forensics."
          />
        </div>

        <div className="mt-6 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] text-gray-400">
              <tr>
                <th className="text-left p-3 font-medium">Stream</th>
                <th className="text-left p-3 font-medium">Source table</th>
                <th className="text-left p-3 font-medium">User-identifying?</th>
                <th className="text-left p-3 font-medium">Retention</th>
                <th className="text-left p-3 font-medium">Toggleable</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <tr className="border-t border-white/10">
                <td className="p-3 font-medium text-amber-300">LLM analytics</td>
                <td className="p-3 font-mono text-xs">llm_sessions, llm_messages</td>
                <td className="p-3 text-yellow-400">Yes (agent + tenant)</td>
                <td className="p-3 text-gray-400">Tenant-controlled</td>
                <td className="p-3 text-gray-400">Tied to traffic</td>
              </tr>
              <tr className="border-t border-white/10 bg-white/[0.02]">
                <td className="p-3 font-medium text-emerald-300">Usage events</td>
                <td className="p-3 font-mono text-xs">usage_events</td>
                <td className="p-3 text-emerald-400">No (no user_id)</td>
                <td className="p-3 text-gray-400">90 days default</td>
                <td className="p-3 text-emerald-400">Yes — settings</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="p-3 font-medium text-purple-300">Audit log</td>
                <td className="p-3 font-mono text-xs">audit_log</td>
                <td className="p-3 text-yellow-400">Yes (actor + resource)</td>
                <td className="p-3 text-gray-400">Compliance-controlled</td>
                <td className="p-3 text-red-400">No (always on)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TutorialSection>

      {/* ---------------- CLI overview ---------------- */}
      <TutorialSection
        id="cli-overview"
        iconBg="bg-cyan-500/20"
        icon={
          <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
        title="The oppmon analytics CLI"
        description="Eleven verbs covering all three streams."
      >
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <p className="text-xs uppercase text-gray-500 mb-2">Recommended</p>
            <p className="text-white font-medium mb-3">
              <code className="px-1.5 py-0.5 bg-amber-500/10 text-amber-300 rounded text-sm">
                pnpm oppmon:analytics
              </code>{' '}
              ⇄ dashboard
            </p>
            <p className="text-sm text-gray-400">
              Same data the <code className="text-white">/analytics</code>,{' '}
              <code className="text-white">/costs</code>, and{' '}
              <code className="text-white">/compliance</code> pages render — pulled through the
              REST API with your JWT and your tenant scope.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <p className="text-xs uppercase text-gray-500 mb-2">Use it for</p>
            <ul className="text-sm text-gray-400 space-y-1.5">
              <li>• Dashboards in your terminal during incident response</li>
              <li>• <code className="text-white">--json</code> output piped to jq / a script</li>
              <li>• Auditor-friendly exports (audit log query + filters)</li>
              <li>• Cron jobs that flag spend or error spikes</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          <FeatureCard
            icon={<span className="text-2xl">⭐</span>}
            title="analytics summary"
            description="Tenant-wide overview: total requests, tokens, cost, top agents, 14-day trend chart. The fastest way to spot anomalies."
          />
          <FeatureCard
            icon={<span className="text-2xl">🤖</span>}
            title="analytics agents"
            description="Per-agent breakdown — requests, tokens, average latency, error rate."
          />
          <FeatureCard
            icon={<span className="text-2xl">🧠</span>}
            title="analytics models"
            description="Per-model usage — calls, tokens, share of overall traffic."
          />
          <FeatureCard
            icon={<span className="text-2xl">⚠️</span>}
            title="analytics errors"
            description="Recent failed requests, error rate, and error-class distribution."
          />
          <FeatureCard
            icon={<span className="text-2xl">📈</span>}
            title="analytics usage"
            description="Privacy-first event totals over last 7 days (skill / MCP / RAG)."
          />
          <FeatureCard
            icon={<span className="text-2xl">🏆</span>}
            title="analytics top"
            description="Top resources of a given type. --type skill | mcp_server | rag_query."
          />
          <FeatureCard
            icon={<span className="text-2xl">💰</span>}
            title="analytics costs"
            description="Spend overview. Add --by-model for per-model breakdown."
          />
          <FeatureCard
            icon={<span className="text-2xl">🔎</span>}
            title="analytics audit"
            description="Filter audit log by --action, --actor, --resource-type, time window."
          />
          <FeatureCard
            icon={<span className="text-2xl">⚙️</span>}
            title="analytics settings"
            description="Show whether usage events are currently being collected for this tenant."
          />
          <FeatureCard
            icon={<span className="text-2xl">🟢</span>}
            title="analytics enable"
            description="Turn usage event collection on (TENANT_ADMIN+ required)."
          />
          <FeatureCard
            icon={<span className="text-2xl">🔴</span>}
            title="analytics disable"
            description="Turn usage event collection off — already-stored events are not deleted."
          />
        </div>
      </TutorialSection>

      {/* ---------------- Recipe 1 — Daily summary ---------------- */}
      <TutorialSection
        id="recipe-summary"
        iconBg="bg-emerald-500/20"
        icon={
          <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
        title="Recipe — your daily 30-second pulse"
        description="What did the gateway do yesterday? Three commands, no dashboard."
      >
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-6 space-y-6">
          {/* Step 1 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-full bg-emerald-500 text-white text-sm font-bold flex items-center justify-center">
                1
              </span>
              <h3 className="text-white font-semibold">Tenant overview</h3>
            </div>
            <CodeSnippet language="bash" code={`pnpm oppmon:analytics summary --period 7d`} />
            <TerminalWindow>
              <Dim>{'$ '}</Dim>
              <Cmd>{'pnpm oppmon:analytics summary --period 7d\n'}</Cmd>
              {'\n'}
              <span className="text-amber-300">{'Tenant analytics · last 7d\n'}</span>
              {'─────────────────────────────────────────────\n'}
              {'  Total requests       '}<span className="text-white">{'      18,422\n'}</span>
              {'  Total tokens         '}<span className="text-white">{'   3,981,206\n'}</span>
              {'  Estimated cost       '}<span className="text-white">{'      $3.98\n'}</span>
              {'  Avg latency          '}<span className="text-white">{'      812 ms\n'}</span>
              {'  Error rate           '}<Warn>{'        2.3%\n'}</Warn>
              {'\n'}
              <span className="text-amber-300">{'Top agents\n'}</span>
              {'  1.  rag-chat-prod        '}<Dim>{'  9,144 reqs ·  $1.91\n'}</Dim>
              {'  2.  triage-bot           '}<Dim>{'  5,103 reqs ·  $1.04\n'}</Dim>
              {'  3.  ops-runbook          '}<Dim>{'  2,118 reqs ·  $0.61\n'}</Dim>
              {'  4.  qa-companion         '}<Dim>{'  1,402 reqs ·  $0.30\n'}</Dim>
              {'  5.  doc-summarizer       '}<Dim>{'    655 reqs ·  $0.12\n'}</Dim>
              {'\n'}
              <span className="text-amber-300">{'Daily trend (req/day)\n'}</span>
              {'  Mon  ████████████████████  3,201\n'}
              {'  Tue  ██████████████████    2,889\n'}
              {'  Wed  ██████████████████████ 3,402\n'}
              {'  Thu  ████████████████████  3,118\n'}
              {'  Fri  ███████████████       2,401\n'}
              {'  Sat  ████████              1,205\n'}
              {'  Sun  ██████████            2,206\n'}
            </TerminalWindow>
          </div>

          {/* Step 2 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-full bg-emerald-500 text-white text-sm font-bold flex items-center justify-center">
                2
              </span>
              <h3 className="text-white font-semibold">Spot-check error rate</h3>
            </div>
            <CodeSnippet language="bash" code={`pnpm oppmon:analytics errors --period 7d`} />
            <TerminalWindow>
              <Dim>{'$ '}</Dim>
              <Cmd>{'pnpm oppmon:analytics errors --period 7d\n'}</Cmd>
              {'\n'}
              <span className="text-amber-300">{'Errors · last 7d\n'}</span>
              {'─────────────────────────────────────────────\n'}
              {'  Total failed         '}<Bad>{'         425 (2.3%)\n'}</Bad>
              {'\n'}
              {'  By class\n'}
              {'    rate_limit_exceeded  '}<Bad>{'     188\n'}</Bad>
              {'    upstream_5xx         '}<Bad>{'     142\n'}</Bad>
              {'    invalid_input        '}<Warn>{'      71\n'}</Warn>
              {'    timeout              '}<Warn>{'      24\n'}</Warn>
            </TerminalWindow>
          </div>

          {/* Step 3 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-full bg-emerald-500 text-white text-sm font-bold flex items-center justify-center">
                3
              </span>
              <h3 className="text-white font-semibold">Pipe to a dashboard or jq</h3>
            </div>
            <CodeSnippet
              language="bash"
              code={`# Cost-by-model breakdown as JSON, top 10
pnpm oppmon:analytics costs --by-model --period 30d --json | jq '.byModel[:10]'

# Quick alarm: error-rate above 5% triggers exit code 1
pnpm oppmon:analytics summary --period 1d --json \\
  | jq -e '.errorRate < 0.05' >/dev/null \\
  || curl -X POST "$SLACK_URL" -d 'errors above threshold'`}
            />
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Recipe 2 — Usage / privacy ---------------- */}
      <TutorialSection
        id="recipe-usage"
        iconBg="bg-purple-500/20"
        icon={
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        }
        title="Recipe — privacy-first usage tracking"
        description="Who actually uses our skills? Without ever knowing who 'who' is."
      >
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/[0.04] p-6 space-y-6">
          {/* Step 1 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-full bg-purple-500 text-white text-sm font-bold flex items-center justify-center">
                1
              </span>
              <h3 className="text-white font-semibold">Confirm collection is on</h3>
            </div>
            <CodeSnippet language="bash" code={`pnpm oppmon:analytics settings`} />
            <TerminalWindow>
              <Dim>{'$ '}</Dim>
              <Cmd>{'pnpm oppmon:analytics settings\n'}</Cmd>
              {'\n'}
              <span className="text-amber-300">{'Usage event collection\n'}</span>
              {'  status              '}<Ok>{' enabled\n'}</Ok>
              {'  retention days      '}<Dim>{' 90\n'}</Dim>
              {'  bucket granularity  '}<Dim>{' 15 minutes\n'}</Dim>
              {'  user_id stored      '}<Bad>{' false\n'}</Bad>
              {'\n'}
              <Dim>{'  Toggle with:  oppmon analytics disable / enable\n'}</Dim>
            </TerminalWindow>
          </div>

          {/* Step 2 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-full bg-purple-500 text-white text-sm font-bold flex items-center justify-center">
                2
              </span>
              <h3 className="text-white font-semibold">Find your most-used skills</h3>
            </div>
            <CodeSnippet language="bash" code={`pnpm oppmon:analytics top --type skill --limit 10`} />
            <TerminalWindow>
              <Dim>{'$ '}</Dim>
              <Cmd>{'pnpm oppmon:analytics top --type skill --limit 10\n'}</Cmd>
              {'\n'}
              <span className="text-amber-300">{'Top skills · last 7d\n'}</span>
              {'─────────────────────────────────────────────\n'}
              {'   1.  pr-review-fix         '}<Dim>{' 1,442 invocations\n'}</Dim>
              {'   2.  build-check           '}<Dim>{'   918\n'}</Dim>
              {'   3.  dev-status            '}<Dim>{'   612\n'}</Dim>
              {'   4.  hipaa-compliance      '}<Dim>{'   311\n'}</Dim>
              {'   5.  to-issues             '}<Dim>{'   202\n'}</Dim>
              {'   6.  visual-pr-audit       '}<Dim>{'   181\n'}</Dim>
              {'   7.  prod-swarm-deploy     '}<Dim>{'   155\n'}</Dim>
              {'   8.  whats-up              '}<Dim>{'   122\n'}</Dim>
              {'   9.  proof-of-fix          '}<Dim>{'    98\n'}</Dim>
              {'  10.  scope-audit           '}<Dim>{'    76\n'}</Dim>
            </TerminalWindow>
          </div>

          {/* Step 3 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-full bg-purple-500 text-white text-sm font-bold flex items-center justify-center">
                3
              </span>
              <h3 className="text-white font-semibold">Disable collection if requested</h3>
            </div>
            <CodeSnippet language="bash" code={`pnpm oppmon:analytics disable`} />
            <TerminalWindow>
              <Dim>{'$ '}</Dim>
              <Cmd>{'pnpm oppmon:analytics disable\n'}</Cmd>
              {'\n'}
              <Ok>{'✔ Usage event collection disabled\n'}</Ok>
              <Dim>{'  New events will return 204 with no row written.\n'}</Dim>
              <Dim>{'  Already-stored events are preserved (purge separately if required).\n'}</Dim>
            </TerminalWindow>
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Recipe 3 — Audit ---------------- */}
      <TutorialSection
        id="recipe-audit"
        iconBg="bg-cyan-500/20"
        icon={
          <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        }
        title="Recipe — audit log forensics"
        description="Who changed which skill, model, or MCP server, when, and what was the diff?"
      >
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/[0.04] p-6 space-y-6">
          {/* Step 1 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-full bg-cyan-500 text-white text-sm font-bold flex items-center justify-center">
                1
              </span>
              <h3 className="text-white font-semibold">All UPDATE actions in the last day</h3>
            </div>
            <CodeSnippet
              language="bash"
              code={`pnpm oppmon:analytics audit --action UPDATE --limit 20`}
            />
            <TerminalWindow>
              <Dim>{'$ '}</Dim>
              <Cmd>{'pnpm oppmon:analytics audit --action UPDATE --limit 20\n'}</Cmd>
              {'\n'}
              <span className="text-amber-300">{'Audit log · 14 entries\n'}</span>
              {'─────────────────────────────────────────────\n'}
              {'  2026-05-07T14:22  '}<span className="text-yellow-400">{'UPDATE'}</span>{'  alice@acme.com   model:gpt-4o-mini\n'}
              {'                    '}<Dim>{'    enabled: true → false\n'}</Dim>
              {'  2026-05-07T13:55  '}<span className="text-yellow-400">{'UPDATE'}</span>{'  alice@acme.com   skill:pr-review-fix\n'}
              {'                    '}<Dim>{'    version: 7 → 8 (auto)\n'}</Dim>
              {'  2026-05-07T11:08  '}<span className="text-yellow-400">{'UPDATE'}</span>{'  bob@acme.com     mcp:github-issues\n'}
              {'                    '}<Dim>{'    args: changed (3 fields)\n'}</Dim>
            </TerminalWindow>
          </div>

          {/* Step 2 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-full bg-cyan-500 text-white text-sm font-bold flex items-center justify-center">
                2
              </span>
              <h3 className="text-white font-semibold">Drill into one resource</h3>
            </div>
            <CodeSnippet
              language="bash"
              code={`pnpm oppmon:analytics audit \\
  --resource-type skill \\
  --resource-id pr-review-fix \\
  --json | jq '.data[].after'`}
            />
            <p className="text-sm text-gray-400 mt-3">
              Combine <code className="text-white">--resource-type</code> and{' '}
              <code className="text-white">--resource-id</code> to walk the full version history of
              one resource. The <code className="text-white">before</code> /{' '}
              <code className="text-white">after</code> JSON columns let you reconstruct any
              previous state.
            </p>
          </div>

          {/* Step 3 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-full bg-cyan-500 text-white text-sm font-bold flex items-center justify-center">
                3
              </span>
              <h3 className="text-white font-semibold">Quarterly compliance export</h3>
            </div>
            <CodeSnippet
              language="bash"
              code={`pnpm oppmon:analytics audit \\
  --start 2026-01-01 \\
  --end   2026-04-01 \\
  --limit 10000 \\
  --json > q1-2026-audit.json`}
            />
            <p className="text-sm text-gray-400 mt-3">
              The audit log is append-only — there is no UPDATE or DELETE on the table itself.
              That guarantee plus the JSON before/after columns is what makes this stream usable
              as a SOC 2 / HIPAA evidence source.
            </p>
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- Cost model ---------------- */}
      <TutorialSection
        id="cost-model"
        iconBg="bg-amber-500/20"
        icon={
          <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        title="How cost is computed"
        description="It's an estimate, not a billing system."
      >
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <p className="text-amber-300 font-medium mb-3">The formula</p>
            <CodeSnippet
              language="text"
              code={`cost ≈ Σ tokens × $0.000001
            (per llm_message row)`}
            />
            <p className="text-sm text-gray-400 mt-3">
              Every row in <code className="text-white">llm_messages</code> records token counts.
              We multiply by a flat <code className="text-white">$0.000001/token</code> to give a
              rough order-of-magnitude estimate. This understates premium models and overstates
              cheap ones.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <p className="text-amber-300 font-medium mb-3">Reconcile with provider invoices</p>
            <ul className="text-sm text-gray-400 space-y-2">
              <li>
                <span className="text-white">Use this for:</span> trend lines, per-agent / per-model
                relative weight, runaway-prompt detection.
              </li>
              <li>
                <span className="text-white">Don&apos;t use this for:</span> chargeback,
                finance-grade reporting, true-up against your Anthropic / OpenAI bill.
              </li>
              <li>
                For accurate billing, plug in real per-model prices in your model registry and the
                figures will recalibrate automatically once configurable rates ship.
              </li>
            </ul>
          </div>
        </div>
      </TutorialSection>

      {/* ---------------- REST endpoints ---------------- */}
      <TutorialSection
        id="rest-endpoints"
        iconBg="bg-blue-500/20"
        icon={
          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        }
        title="REST endpoints under the hood"
        description="Every CLI verb is a thin wrapper over the public REST API. Same JWT, same RBAC."
      >
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] text-gray-400">
              <tr>
                <th className="text-left p-3 font-medium">CLI</th>
                <th className="text-left p-3 font-medium">REST</th>
                <th className="text-left p-3 font-medium">RBAC</th>
              </tr>
            </thead>
            <tbody className="text-gray-300 font-mono text-xs">
              <tr className="border-t border-white/10">
                <td className="p-3">analytics summary</td>
                <td className="p-3">GET /api/analytics/overview</td>
                <td className="p-3">MEMBER</td>
              </tr>
              <tr className="border-t border-white/10 bg-white/[0.02]">
                <td className="p-3">analytics agents</td>
                <td className="p-3">GET /api/analytics/agents</td>
                <td className="p-3">MEMBER</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="p-3">analytics models</td>
                <td className="p-3">GET /api/analytics/models</td>
                <td className="p-3">MEMBER</td>
              </tr>
              <tr className="border-t border-white/10 bg-white/[0.02]">
                <td className="p-3">analytics errors</td>
                <td className="p-3">GET /api/analytics/errors</td>
                <td className="p-3">MEMBER</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="p-3">analytics usage</td>
                <td className="p-3">GET /api/usage/events</td>
                <td className="p-3">MEMBER</td>
              </tr>
              <tr className="border-t border-white/10 bg-white/[0.02]">
                <td className="p-3">analytics top</td>
                <td className="p-3">GET /api/usage/top-resources</td>
                <td className="p-3">MEMBER</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="p-3">analytics costs</td>
                <td className="p-3">GET /api/costs/overview, /by-model</td>
                <td className="p-3">MEMBER</td>
              </tr>
              <tr className="border-t border-white/10 bg-white/[0.02]">
                <td className="p-3">analytics audit</td>
                <td className="p-3">GET /api/compliance/audit-log</td>
                <td className="p-3">TENANT_ADMIN</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="p-3">analytics settings</td>
                <td className="p-3">GET /api/usage/settings</td>
                <td className="p-3">MEMBER</td>
              </tr>
              <tr className="border-t border-white/10 bg-white/[0.02]">
                <td className="p-3">analytics enable / disable</td>
                <td className="p-3">PATCH /api/usage/settings</td>
                <td className="p-3">TENANT_ADMIN</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TutorialSection>

      {/* ---------------- Troubleshooting ---------------- */}
      <TutorialSection
        id="troubleshooting"
        iconBg="bg-yellow-500/20"
        icon={
          <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        }
        title="Troubleshooting"
        description="The most common gotchas, ordered by frequency seen in support."
      >
        <div className="space-y-3">
          <details className="group rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <summary className="cursor-pointer font-medium text-white flex items-center justify-between">
              <span>“analytics summary returns 0 requests but I know we&apos;re using the gateway”</span>
              <span className="text-gray-500 text-sm group-open:rotate-180 transition">▾</span>
            </summary>
            <div className="mt-3 text-sm text-gray-400 space-y-2">
              <p>
                Three things to check, in order:
              </p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>
                  Are you logged in as the right tenant?{' '}
                  <code className="text-white">oppmon status</code> shows the tenant_id encoded in
                  your JWT.
                </li>
                <li>
                  Are requests actually flowing through the LiteLLM router (not directly to
                  Anthropic / OpenAI)? Only proxied traffic creates{' '}
                  <code className="text-white">llm_sessions</code> rows.
                </li>
                <li>
                  Is the period right?{' '}
                  <code className="text-white">--period 7d</code> won&apos;t show traffic from 8
                  days ago.
                </li>
              </ol>
            </div>
          </details>

          <details className="group rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <summary className="cursor-pointer font-medium text-white flex items-center justify-between">
              <span>“analytics top --type skill is empty”</span>
              <span className="text-gray-500 text-sm group-open:rotate-180 transition">▾</span>
            </summary>
            <div className="mt-3 text-sm text-gray-400 space-y-2">
              <p>
                Two likely causes:
              </p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>
                  Usage event collection is disabled —{' '}
                  <code className="text-white">oppmon analytics settings</code> will tell you.
                </li>
                <li>
                  No skill invocations have been recorded yet. Skills emit usage events when
                  invoked from the CLI hook or the chat surface; an unused skill won&apos;t appear.
                </li>
              </ol>
            </div>
          </details>

          <details className="group rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <summary className="cursor-pointer font-medium text-white flex items-center justify-between">
              <span>“analytics costs disagrees with my Anthropic invoice”</span>
              <span className="text-gray-500 text-sm group-open:rotate-180 transition">▾</span>
            </summary>
            <div className="mt-3 text-sm text-gray-400 space-y-2">
              <p>
                Expected. The flat{' '}
                <code className="text-white">$0.000001/token</code> rate is intentional — see the{' '}
                <a href="#cost-model" className="text-amber-300 hover:underline">
                  cost model
                </a>{' '}
                section. Use the figure as a relative comparison across agents/models, not a
                billing source.
              </p>
            </div>
          </details>

          <details className="group rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <summary className="cursor-pointer font-medium text-white flex items-center justify-between">
              <span>“analytics audit returns 403”</span>
              <span className="text-gray-500 text-sm group-open:rotate-180 transition">▾</span>
            </summary>
            <div className="mt-3 text-sm text-gray-400 space-y-2">
              <p>
                Audit log read requires{' '}
                <code className="text-white">TENANT_ADMIN</code> or{' '}
                <code className="text-white">SYSTEM_ADMIN</code>. Members can see their own
                analytics and usage data, but not the full audit trail — that&apos;s by design.
              </p>
            </div>
          </details>

          <details className="group rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <summary className="cursor-pointer font-medium text-white flex items-center justify-between">
              <span>“I disabled events but old rows are still in the table”</span>
              <span className="text-gray-500 text-sm group-open:rotate-180 transition">▾</span>
            </summary>
            <div className="mt-3 text-sm text-gray-400 space-y-2">
              <p>
                Disabling stops <em>writes</em> — no new rows are appended. Already-stored rows are
                preserved so historical aggregates remain consistent. To purge old data, use{' '}
                <code className="text-white">/api/compliance/purge</code> or its admin UI
                equivalent — it has its own RBAC + reason-required workflow.
              </p>
            </div>
          </details>

          <details className="group rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <summary className="cursor-pointer font-medium text-white flex items-center justify-between">
              <span>“Numbers in the dashboard don&apos;t match the CLI”</span>
              <span className="text-gray-500 text-sm group-open:rotate-180 transition">▾</span>
            </summary>
            <div className="mt-3 text-sm text-gray-400 space-y-2">
              <p>
                Both surfaces hit the same REST endpoints — if they disagree it is almost always a
                period mismatch. The dashboard often defaults to <code className="text-white">30d</code>{' '}
                while the CLI defaults vary per command. Pass an explicit{' '}
                <code className="text-white">--period</code> to align them.
              </p>
            </div>
          </details>
        </div>
      </TutorialSection>

      {/* ---------------- Footer CTA ---------------- */}
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-8">
        <h3 className="text-2xl font-bold text-white mb-2">Next steps</h3>
        <p className="text-gray-300 mb-5 max-w-2xl">
          Run <code className="text-amber-300">pnpm oppmon:analytics summary</code> against a live
          tenant, then use the dashboard for a side-by-side. Once the shape of your traffic feels
          familiar, the CLI is faster than the UI for everything except cost charts.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/analytics"
            className="rounded-lg bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 font-medium transition-colors"
          >
            Open Analytics dashboard
          </Link>
          <Link
            href="/docs/cli-setup"
            className="rounded-lg bg-white/10 hover:bg-white/20 text-white px-4 py-2 font-medium transition-colors"
          >
            CLI Setup Guide
          </Link>
          <Link
            href="/docs/features/mcp"
            className="rounded-lg bg-white/10 hover:bg-white/20 text-white px-4 py-2 font-medium transition-colors"
          >
            MCP guide
          </Link>
          <Link
            href="/docs/features/rag"
            className="rounded-lg bg-white/10 hover:bg-white/20 text-white px-4 py-2 font-medium transition-colors"
          >
            RAG guide
          </Link>
        </div>
      </div>
    </div>
  )
}
