// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

import { CodeSnippet, TutorialSection, FeatureCard } from '@/components/tutorial'
import Link from 'next/link'

/* ------------------------------------------------------------------------ */
/* Inline terminal mock (matches the live oppmon CLI output)                 */
/* ------------------------------------------------------------------------ */

function TerminalWindow({
  title = 'pwsh — oppmon models',
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

const Err = ({ children }: { children: React.ReactNode }) => (
  <span className="text-red-400">{children}</span>
)

/* ------------------------------------------------------------------------ */

export default function ModelsAdminPage() {
  return (
    <div className="space-y-12">
      {/* ---------------- Header ---------------- */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-medium mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
          Admin Guide · AI Models
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">AI Models Registry</h1>
        <p className="text-gray-400 text-lg max-w-3xl">
          Register, configure, test, and govern every model your tenant can route through —
          Anthropic, OpenAI, Azure, Bedrock, Ollama, Cerebras, or any OpenAI-compatible endpoint.
          Manage them in the UI or with{' '}
          <code className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-300 rounded text-sm">
            pnpm oppmon:models
          </code>
          .
        </p>

        <div className="mt-6 grid sm:grid-cols-3 gap-3">
          <Link
            href="/admin/models"
            className="rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 px-4 py-3 transition-colors"
          >
            <p className="text-xs text-purple-300/80">Live</p>
            <p className="text-purple-300 font-medium">Open Models Page →</p>
          </Link>
          <Link
            href="/docs/admin"
            className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-3 transition-colors"
          >
            <p className="text-xs text-gray-500">Parent</p>
            <p className="text-white font-medium">Admin Guide →</p>
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
          <p className="text-emerald-300 font-medium text-sm">
            Every save triggers a LiteLLM router rebuild
          </p>
          <p className="text-gray-400 text-xs mt-1">
            Creating, updating, deleting, or rotating a model regenerates{' '}
            <code className="px-1 py-0.5 bg-black/40 rounded text-emerald-200">litellm-config.yaml</code>{' '}
            and signals the proxy to reload — no manual restart needed.
          </p>
        </div>
      </div>

      {/* ---------------- Concepts ---------------- */}
      <TutorialSection
        id="concepts"
        icon={
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
        iconBg="bg-purple-500/20"
        title="What a Model is"
        description="A row in the registry that tells LiteLLM how to call a real provider — credentials, identifier, scope, and routing knobs."
      >
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <h4 className="text-white font-semibold mb-2">Provider Template mode</h4>
            <p className="text-sm text-gray-400 mb-3">
              Pick a curated template (anthropic, openai, ollama, …) and fill in form fields. The
              backend renders a LiteLLM block from{' '}
              <code className="text-cyan-300">litellm-config-generator.ts</code>.
            </p>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>• Best for 99% of cases</li>
              <li>• Field-level validation</li>
              <li>• One-click <code className="text-cyan-300">test</code> before save</li>
            </ul>
          </div>
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <h4 className="text-white font-semibold mb-2">YAML Override mode</h4>
            <p className="text-sm text-gray-400 mb-3">
              Paste a raw LiteLLM <code className="text-cyan-300">model_list</code> entry. Use this
              for new providers or routing tricks not yet templated.
            </p>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>• Power-user escape hatch</li>
              <li>• Validated as YAML before persist</li>
              <li>• Secrets must use <code className="text-cyan-300">os.environ/…</code> or the secret vault</li>
            </ul>
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
                  <td className="px-4 py-2">TENANT_ADMIN, SYSTEM_ADMIN</td>
                </tr>
                <tr className="border-t border-white/10">
                  <td className="px-4 py-2"><span className="text-cyan-300 font-mono">TEAM</span></td>
                  <td className="px-4 py-2">Members of <code className="text-cyan-300">teamId</code> only</td>
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
        description="One pnpm shortcut, eight subcommands. All require an active oppmon login session."
      >
        <CodeSnippet
          language="bash"
          title="Quick reference"
          code={`# All shortcuts assume you have run: pnpm oppmon:login
pnpm oppmon:models list                # table of every model you can see
pnpm oppmon:models providers           # which provider templates exist
pnpm oppmon:models show <id>           # full record + public config
pnpm oppmon:models create              # interactive wizard
pnpm oppmon:models test -- -p anthropic -s '{"apiKey":"sk-ant-..."}'
pnpm oppmon:models delete <id>         # soft delete (recoverable)
pnpm oppmon:models rotate <id>         # rotate API keys
pnpm oppmon:models toggle <id> --off   # disable without deleting`}
        />

        <div className="grid md:grid-cols-2 gap-4 mt-6">
          <FeatureCard
            icon={<span className="text-2xl">📋</span>}
            title="list"
            description="Tabular view of all models scoped to your role. Filter with --provider, --scope, --enabled, --disabled, --search."
          />
          <FeatureCard
            icon={<span className="text-2xl">🧩</span>}
            title="providers"
            description="Which provider templates the API exposes. Use --json to script-introspect required fields."
          />
          <FeatureCard
            icon={<span className="text-2xl">🔍</span>}
            title="show"
            description="One model in detail. Includes publicConfig, hasSecret, isYamlMode, lastSyncedAt."
          />
          <FeatureCard
            icon={<span className="text-2xl">✨</span>}
            title="create"
            description="Interactive wizard: pick provider → fill form → test → save. Shortcut every prompt with -p / -n / -m / -s flags."
          />
          <FeatureCard
            icon={<span className="text-2xl">🧪</span>}
            title="test"
            description="Validate credentials and reachability without persisting anything. Accepts --provider+--config+--secrets, or --yaml."
          />
          <FeatureCard
            icon={<span className="text-2xl">🔄</span>}
            title="rotate"
            description="Replace just the secret. Either pipe in --secrets <json> or use the interactive key/value entry loop."
          />
          <FeatureCard
            icon={<span className="text-2xl">🚦</span>}
            title="toggle"
            description="Flip enabled state. --on / --off / no flag = invert current."
          />
          <FeatureCard
            icon={<span className="text-2xl">🗑️</span>}
            title="delete"
            description="Soft delete — sets deletedAt. TENANT_ADMINs can list with includeDeleted=true to recover."
          />
        </div>
      </TutorialSection>

      {/* ---------------- Recipe: end-to-end create ---------------- */}
      <TutorialSection
        id="recipe-create"
        icon={
          <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        }
        iconBg="bg-emerald-500/20"
        title="Recipe — register a new Anthropic model"
        description="Walk through the interactive wizard. Same flow works for OpenAI, Cerebras, Azure, Bedrock, Ollama, OpenAI-compatible."
      >
        <ol className="space-y-4 text-sm text-gray-300">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">1</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Start the wizard</p>
              <CodeSnippet language="bash" code={`pnpm oppmon:models create`} />
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">2</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Pick a provider</p>
              <TerminalWindow title="oppmon models create">
{`1. Choose a provider:

   1. 🔮 `}<span className="text-white">Anthropic</span>{` `}<Dim>(anthropic)</Dim>{`
      `}<Dim>Claude API — Sonnet, Haiku, Opus.</Dim>{`
   2. 🤖 `}<span className="text-white">OpenAI</span>{` `}<Dim>(openai)</Dim>{`
      `}<Dim>GPT-4o, o1, embeddings.</Dim>{`
   3. ⚡ `}<span className="text-white">Cerebras</span>{` `}<Dim>(cerebras)</Dim>{`
   4. 🦙 `}<span className="text-white">Ollama</span>{` `}<Dim>(ollama)</Dim>{`
   5. 🔷 `}<span className="text-white">Azure OpenAI</span>{` `}<Dim>(azure-openai)</Dim>{`
   6. ☁️  `}<span className="text-white">AWS Bedrock</span>{` `}<Dim>(bedrock)</Dim>{`
   7. 🔌 `}<span className="text-white">OpenAI-Compatible</span>{` `}<Dim>(openai-compatible)</Dim>{`

  `}<Cmd>pick a number ▸</Cmd>{` 1
  `}<Dim>using Anthropic (anthropic)</Dim>
              </TerminalWindow>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">3</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Answer the prompts</p>
              <TerminalWindow title="oppmon models create — provider config">
{`  `}<Cmd>display name ▸</Cmd>{` Claude Sonnet 4.5 (prod)
  `}<Cmd>model identifier [claude-sonnet-4-5-20250929] ▸</Cmd>{`
  `}<Cmd>scope (TENANT/TEAM) [TEAM] ▸</Cmd>{` TENANT

2. Provider configuration:

  * `}<Cmd>API Key</Cmd>{` `}<Warn>(secret)</Warn>{` ▸ sk-ant-api03-…
    `}<Cmd>Base URL [https://api.anthropic.com] ▸</Cmd>{`
    `}<Cmd>Max retries [3] ▸</Cmd>{` 5

  `}<Cmd>test connection before saving? (Y/n) ▸</Cmd>{` y
  ⠋ Testing connection...
  `}<Ok>✔ Connection OK (412ms)</Ok>{`

  ⠋ Creating model...
  `}<Ok>✔ Model "Claude Sonnet 4.5 (prod)" created (mdl_…)</Ok>
              </TerminalWindow>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">4</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Verify in the registry</p>
              <CodeSnippet language="bash" code={`pnpm oppmon:models list --provider anthropic`} />
              <p className="text-xs text-gray-500 mt-2">
                The new model now appears for any virtual key allowed to use it. The router rebuild
                runs in the background — within a few seconds, requests routed to its identifier
                will resolve.
              </p>
            </div>
          </li>
        </ol>
      </TutorialSection>

      {/* ---------------- Recipe: scriptable test ---------------- */}
      <TutorialSection
        id="recipe-test"
        icon={
          <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        }
        iconBg="bg-cyan-500/20"
        title="Recipe — scriptable connection test"
        description="One-liner credential validation. Useful in CI, in scripts, or when debugging a flaky provider."
      >
        <CodeSnippet
          language="bash"
          title="Validate an OpenAI key without saving"
          code={`pnpm oppmon:models test -- \\
  --provider openai \\
  --secrets '{"apiKey":"sk-proj-..."}' \\
  --config  '{"baseUrl":"https://api.openai.com/v1"}' \\
  --json`}
        />

        <TerminalWindow title="oppmon models test — JSON output">
{`{
  "success": `}<Ok>true</Ok>{`,
  "latencyMs": 287,
  "message": "OpenAI API reachable; gpt-4o is listed",
  "details": {
    "modelsListed": 47,
    "rateLimitRemaining": "5000"
  }
}`}
        </TerminalWindow>

        <p className="text-sm text-gray-400 mt-4">
          The same endpoint backs the <code className="text-cyan-300">test</code> button on the
          model creation modal. Wire it into any pipeline that needs to fail loudly when a
          credential rotates.
        </p>

        <div className="mt-4 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
          <p className="text-blue-300 text-sm font-medium">YAML mode</p>
          <CodeSnippet
            language="bash"
            code={`pnpm oppmon:models test -- --yaml ./scratch.litellm.yaml --json`}
          />
        </div>
      </TutorialSection>

      {/* ---------------- Provider templates ---------------- */}
      <TutorialSection
        id="providers"
        icon={
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        }
        iconBg="bg-purple-500/20"
        title="Available provider templates"
        description="The seven curated provider templates the registry ships with."
      >
        <div className="grid md:grid-cols-2 gap-4">
          <FeatureCard
            icon={<span className="text-2xl">🔮</span>}
            title="anthropic"
            description="Claude API. Required: apiKey. Optional: baseUrl, maxRetries. Default model: claude-3-5-sonnet-20241022."
          />
          <FeatureCard
            icon={<span className="text-2xl">🤖</span>}
            title="openai"
            description="OpenAI API. Required: apiKey. Optional: baseUrl, organization. Default model: gpt-4o."
          />
          <FeatureCard
            icon={<span className="text-2xl">⚡</span>}
            title="cerebras"
            description="Cerebras inference. Required: apiKey. Default model: llama3.1-70b."
          />
          <FeatureCard
            icon={<span className="text-2xl">🦙</span>}
            title="ollama"
            description="Local Ollama. Required: baseUrl (e.g. http://localhost:11434). No secret. Default: llama3.2:latest."
          />
          <FeatureCard
            icon={<span className="text-2xl">🔷</span>}
            title="azure-openai"
            description="Azure-hosted OpenAI. Required: apiKey, endpoint, deploymentName, apiVersion."
          />
          <FeatureCard
            icon={<span className="text-2xl">☁️</span>}
            title="bedrock"
            description="AWS Bedrock. Required: accessKeyId, secretAccessKey, region. Optional: sessionToken."
          />
          <FeatureCard
            icon={<span className="text-2xl">🔌</span>}
            title="openai-compatible"
            description="Any OpenAI-style API (vLLM, LM Studio, Together, Fireworks, …). Required: baseUrl, apiKey."
          />
        </div>

        <div className="mt-6 p-4 rounded-lg bg-white/5 border border-white/10">
          <p className="text-white font-medium text-sm mb-2">Need a provider that isn&apos;t templated?</p>
          <p className="text-sm text-gray-400">
            Use <span className="text-cyan-300">YAML Override mode</span> in the create modal, or
            paste it into <code className="text-cyan-300">--yaml</code> for the CLI. The schema is
            a single LiteLLM <code className="text-cyan-300">model_list</code> entry.
          </p>
          <CodeSnippet
            language="yaml"
            title="Example YAML override"
            code={`model_name: my-custom-vllm
litellm_params:
  model: openai/Meta-Llama-3.1-70B-Instruct
  api_base: http://vllm.internal:8000/v1
  api_key: os.environ/CUSTOM_VLLM_KEY
  rpm: 600`}
          />
        </div>
      </TutorialSection>

      {/* ---------------- Lifecycle ops ---------------- */}
      <TutorialSection
        id="lifecycle"
        icon={
          <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        }
        iconBg="bg-yellow-500/20"
        title="Day-2 operations"
        description="Rotate, disable, soft-delete, and recover."
      >
        <div className="space-y-5">
          <div>
            <h4 className="text-white font-semibold mb-2">Rotate a secret</h4>
            <p className="text-sm text-gray-400 mb-3">
              Two paths — interactive (no secrets in shell history) or scripted (pipe-friendly).
            </p>
            <CodeSnippet
              language="bash"
              code={`# interactive — prompts for one-or-more key/value pairs
pnpm oppmon:models rotate mdl_abc123

# scripted — pass full secret payload as JSON
pnpm oppmon:models rotate mdl_abc123 -- --secrets '{"apiKey":"sk-ant-NEW..."}'`}
            />
            <p className="text-xs text-gray-500 mt-2">
              Existing virtual keys keep working — only the underlying provider credential
              changes. The audit log captures the rotation but never the value.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2">Disable temporarily</h4>
            <CodeSnippet
              language="bash"
              code={`pnpm oppmon:models toggle mdl_abc123 -- --off    # disable
pnpm oppmon:models toggle mdl_abc123 -- --on     # re-enable
pnpm oppmon:models toggle mdl_abc123              # flip current state`}
            />
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2">Soft delete &amp; recover</h4>
            <CodeSnippet
              language="bash"
              code={`pnpm oppmon:models delete mdl_abc123
# A soft-deleted row keeps its display name reserved.
# TENANT_ADMINs can see tombstoned rows in the UI by toggling
# "include deleted" — useful when a unique-name slot is "stuck".`}
            />
          </div>
        </div>
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
        description="The most common stumbles when registering models."
      >
        <div className="space-y-3">
          {[
            {
              q: 'Test passes, but the router still 404s on the model identifier',
              a: (
                <>
                  The proxy reload is async. Wait 5–10s, then retry. If still failing, check{' '}
                  <code className="text-cyan-300">pnpm docker:logs:api</code> for the line
                  &quot;LiteLLM config rebuilt&quot;. If you see a YAML parse error, your
                  yamlOverride is malformed.
                </>
              ),
            },
            {
              q: '“Either providerTemplateId or yamlOverride is required” on create',
              a: (
                <>
                  You called <code className="text-cyan-300">POST /api/models</code> directly
                  without specifying <em>which</em> kind of model. The CLI wizard prevents this —
                  if you&apos;re scripting, include <code className="text-cyan-300">--provider</code>{' '}
                  or <code className="text-cyan-300">--yaml</code>.
                </>
              ),
            },
            {
              q: '“You are not a member of this team” when creating a TEAM-scoped model',
              a: (
                <>
                  Your JWT&apos;s <code className="text-cyan-300">teamMemberships</code> claim
                  doesn&apos;t include the target team. Check{' '}
                  <code className="text-cyan-300">pnpm oppmon:status</code> — if the team is
                  missing, ask a TENANT_ADMIN to add you and run{' '}
                  <code className="text-cyan-300">pnpm oppmon:login</code> again to refresh.
                </>
              ),
            },
            {
              q: 'Connection test fails with TLS / cert errors against a self-signed endpoint',
              a: (
                <>
                  The validator runs server-side from the API container. Make sure the API trusts
                  the cert — either mount it into{' '}
                  <code className="text-cyan-300">/etc/ssl/certs/</code> or set{' '}
                  <code className="text-cyan-300">NODE_EXTRA_CA_CERTS</code>. Don&apos;t disable
                  TLS verification in production.
                </>
              ),
            },
            {
              q: 'Display name was rejected as duplicate, but I deleted that model',
              a: (
                <>
                  Soft-deleted rows still hold their unique name slot until purged. List with{' '}
                  <code className="text-cyan-300">includeDeleted=true</code> in the UI to find the
                  tombstone, then either hard-purge it (TENANT_ADMIN) or pick a different name.
                </>
              ),
            },
            {
              q: '“Not authenticated. Run "oppmon login" first.”',
              a: (
                <>
                  The CLI&apos;s token cache is empty or stale. Don&apos;t use{' '}
                  <code className="text-yellow-300">pnpm dev:api login</code> — that runs turbo and
                  fails with &quot;Could not find task `login`&quot;. Use{' '}
                  <code className="text-cyan-300">pnpm oppmon:login</code>.
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
        description="What the CLI is calling under the hood. Useful when integrating from another service."
      >
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-white/[0.04] text-gray-400 text-left">
                <th className="px-4 py-2 font-mono text-xs">Method</th>
                <th className="px-4 py-2 font-mono text-xs">Path</th>
                <th className="px-4 py-2 font-medium">CLI equivalent</th>
              </tr>
            </thead>
            <tbody className="text-gray-300 font-mono text-xs">
              {[
                ['GET', '/api/models', 'pnpm oppmon:models list'],
                ['GET', '/api/models/providers', 'pnpm oppmon:models providers'],
                ['GET', '/api/models/:id', 'pnpm oppmon:models show <id>'],
                ['POST', '/api/models', 'pnpm oppmon:models create'],
                ['PATCH', '/api/models/:id', 'pnpm oppmon:models toggle <id>'],
                ['DELETE', '/api/models/:id', 'pnpm oppmon:models delete <id>'],
                ['POST', '/api/models/:id/rotate-secret', 'pnpm oppmon:models rotate <id>'],
                ['POST', '/api/models/test', 'pnpm oppmon:models test'],
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

        <p className="text-xs text-gray-500 mt-3">
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
      <div className="rounded-2xl bg-gradient-to-br from-purple-500/15 via-fuchsia-500/10 to-cyan-500/15 border border-white/10 p-8">
        <h3 className="text-2xl font-bold text-white mb-2">Next: virtual keys</h3>
        <p className="text-gray-400 mb-5 max-w-2xl">
          A registered model is one half of routing. The other is a virtual key that grants
          which agents/teams can use it. Mint one with{' '}
          <code className="text-cyan-300 px-1 py-0.5 bg-black/30 rounded">
            POST /api/virtual-keys
          </code>{' '}
          or in the admin UI.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/virtual-keys"
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors"
          >
            Open Virtual Keys →
          </Link>
          <Link
            href="/docs/admin"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg font-medium transition-colors"
          >
            Back to Admin Guide
          </Link>
        </div>
      </div>
    </div>
  )
}
