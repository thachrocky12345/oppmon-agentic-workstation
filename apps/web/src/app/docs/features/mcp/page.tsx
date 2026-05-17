// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

import { CodeSnippet, TutorialSection, FeatureCard } from '@/components/tutorial'
import Link from 'next/link'

/* ------------------------------------------------------------------------ */
/* Inline terminal mock (matches the live oppmon CLI output)                 */
/* ------------------------------------------------------------------------ */

function TerminalWindow({
  title = 'pwsh — oppmon mcp',
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

export default function MCPPage() {
  return (
    <div className="space-y-12">
      {/* ---------------- Header ---------------- */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-medium mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          Features · MCP Servers
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">MCP Servers</h1>
        <p className="text-gray-400 text-lg max-w-3xl">
          Register Model Context Protocol servers — stdio commands like{' '}
          <code className="px-1.5 py-0.5 bg-white/[0.06] text-gray-200 rounded text-sm">
            npx -y @modelcontextprotocol/server-filesystem
          </code>{' '}
          — once, and let your whole team pull them down. Manage them from the web, the CLI
          (
          <code className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-300 rounded text-sm">
            pnpm oppmon:mcp
          </code>
          ), or sync a local{' '}
          <code className="px-1.5 py-0.5 bg-white/[0.06] text-gray-200 rounded text-sm">
            .mcp.json
          </code>
          .
        </p>

        <div className="mt-6 grid sm:grid-cols-3 gap-3">
          <Link
            href="/admin/mcp"
            className="rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-4 py-3 transition-colors"
          >
            <p className="text-xs text-cyan-300/80">Live</p>
            <p className="text-cyan-300 font-medium">Open Admin · MCP →</p>
          </Link>
          <Link
            href="/docs/cli-setup"
            className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-3 transition-colors"
          >
            <p className="text-xs text-gray-500">Prereq</p>
            <p className="text-white font-medium">CLI Setup →</p>
          </Link>
          <Link
            href="/docs/admin/skills"
            className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-3 transition-colors"
          >
            <p className="text-xs text-gray-500">Related</p>
            <p className="text-white font-medium">Skills guide →</p>
          </Link>
        </div>

        <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
          <p className="text-emerald-300 font-medium text-sm">
            Tenant isolation is enforced at the SQL layer
          </p>
          <p className="text-gray-400 text-xs mt-1">
            Every read and write to{' '}
            <code className="px-1 py-0.5 bg-black/40 rounded text-emerald-200">mcp_servers</code>{' '}
            is scoped by{' '}
            <code className="px-1 py-0.5 bg-black/40 rounded text-emerald-200">tenant_id</code>,
            and TEAM-scoped servers add{' '}
            <code className="px-1 py-0.5 bg-black/40 rounded text-emerald-200">team_id = ANY(...)</code>{' '}
            from the JWT&apos;s teamMemberships claim. Cross-tenant access is architecturally
            impossible — it is not a permission you can grant.
          </p>
        </div>
      </div>

      {/* ---------------- What is an MCP server ---------------- */}
      <TutorialSection
        id="what-is-mcp"
        icon={
          <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
        iconBg="bg-cyan-500/20"
        title="What an MCP server is"
        description="A standardized way to plug tools into a model context."
      >
        <p className="text-gray-300 text-sm leading-relaxed mb-4">
          MCP (Model Context Protocol) is Anthropic&apos;s open spec for letting an AI agent talk to
          tools running on your machine — file systems, databases, browsers, internal APIs. The
          server is just a long-lived stdio process that exposes a JSON-RPC tool interface; the
          model calls{' '}
          <code className="px-1.5 py-0.5 bg-white/[0.06] text-gray-200 rounded text-xs">
            tools/list
          </code>{' '}
          to discover what it can do and{' '}
          <code className="px-1.5 py-0.5 bg-white/[0.06] text-gray-200 rounded text-xs">
            tools/call
          </code>{' '}
          to actually do it.
        </p>

        <div className="grid md:grid-cols-3 gap-3 mt-4">
          <FeatureCard
            icon={<span className="text-2xl">⌨️</span>}
            title="Transport: stdio"
            description="Spawned as a child process. The host pipes JSON-RPC over stdin/stdout. We store the command, args, and environment to recreate the spawn anywhere."
          />
          <FeatureCard
            icon={<span className="text-2xl">🧰</span>}
            title="Catalog of tools"
            description="One server can expose many tools (e.g. read_file, list_dir, execute_query). The server itself is the unit of registration; tool discovery happens at runtime."
          />
          <FeatureCard
            icon={<span className="text-2xl">🔁</span>}
            title="Reproducible everywhere"
            description="Every server is hashed (sha256 of {command, args, env, version}). Push from one workstation, pull on another, hashes match — same spawn, every machine."
          />
        </div>
      </TutorialSection>

      {/* ---------------- Concepts ---------------- */}
      <TutorialSection
        id="concepts"
        icon={
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        }
        iconBg="bg-purple-500/20"
        title="The data model"
        description="One row per registered server. Soft-delete preserves history."
      >
        <div className="grid md:grid-cols-3 gap-3">
          <FeatureCard
            icon={<span className="text-2xl">🪪</span>}
            title="name (unique per tenant)"
            description="Lowercase identifier, used wherever the server is referenced — CLI, sync metadata, .mcp.json keys. Renaming is a delete + recreate."
          />
          <FeatureCard
            icon={<span className="text-2xl">⚙️</span>}
            title="command + args + env"
            description="The literal argv to spawn the child process. Env values are encrypted at rest; secrets stay in the database, not in your shell history."
          />
          <FeatureCard
            icon={<span className="text-2xl">🏷️</span>}
            title="scope: TENANT or TEAM"
            description="TENANT = visible to every user in the tenant. TEAM = visible only to members of one team. The default for new servers is TEAM."
          />
        </div>

        <div className="mt-6 overflow-x-auto rounded-lg border border-white/10">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-white/[0.04] text-gray-400 text-left">
                <th className="px-4 py-2 font-medium">Scope</th>
                <th className="px-4 py-2 font-medium">teamId</th>
                <th className="px-4 py-2 font-medium">Visible to</th>
                <th className="px-4 py-2 font-medium">Who can write</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <tr className="border-t border-white/10">
                <td className="px-4 py-2"><span className="text-fuchsia-300">TENANT</span></td>
                <td className="px-4 py-2 text-gray-500 font-mono">null</td>
                <td className="px-4 py-2">Every authenticated user in the tenant</td>
                <td className="px-4 py-2">TENANT_ADMIN or higher</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2"><span className="text-cyan-300">TEAM</span></td>
                <td className="px-4 py-2 text-gray-300 font-mono">set</td>
                <td className="px-4 py-2">Members of that team only</td>
                <td className="px-4 py-2">TEAM_ADMIN of that team, TENANT_ADMIN, or above</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500 mt-3">
          Soft-delete sets{' '}
          <code className="text-cyan-300">deleted_at</code> rather than dropping the row. The
          unique-name slot is held until purge; a recreated server with the same name will fail
          until the old row is hard-deleted (admin-only).
        </p>
      </TutorialSection>

      {/* ---------------- CLI reference ---------------- */}
      <TutorialSection
        id="cli"
        icon={
          <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
        iconBg="bg-cyan-500/20"
        title="Two CLIs, two workflows"
        description="Direct CRUD via oppmon:mcp · local-file sync via oppmon sync mcp."
      >
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4">
            <p className="text-cyan-300 font-medium mb-1">
              <code className="text-cyan-200">pnpm oppmon:mcp</code>
            </p>
            <p className="text-xs text-gray-400">
              Talk to the registry directly. Good for: registering a server you only have on one
              workstation, scripting CI workflows, listing what other team members have shared,
              flipping a misbehaving server off without touching local files.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <p className="text-white font-medium mb-1">
              <code className="text-gray-200">pnpm oppmon:sync mcp</code>
            </p>
            <p className="text-xs text-gray-400">
              Treat your local{' '}
              <code className="text-cyan-300">.mcp.json</code> as the source of truth and push /
              pull / diff against the registry. Good for: onboarding a new dev, mirroring config
              into git, resolving conflicts after two people edited the same server.
            </p>
          </div>
        </div>

        <h3 className="text-white font-semibold mb-3 text-base">Direct CRUD subcommands</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          <FeatureCard
            icon={<span className="text-2xl">📋</span>}
            title="list"
            description="One row per visible server: name · scope · on/off · version · command · sha256(8). Filter with --scope, --search, --enabled, --disabled. Add --json for tooling."
          />
          <FeatureCard
            icon={<span className="text-2xl">🔍</span>}
            title="show"
            description="Full record by id or name — id, scope, team, sha256, the spawn command, and every env key. Use --json to feed the output into another tool."
          />
          <FeatureCard
            icon={<span className="text-2xl">➕</span>}
            title="create"
            description="Interactive wizard prompts for name, command, args, env, and scope. Every flag (-n/-c/-a/-e/-s/--team/--off) can be passed up-front to skip prompts."
          />
          <FeatureCard
            icon={<span className="text-2xl">✏️</span>}
            title="update"
            description="Patch any field by id or name. Use --command/--args/--env/--scope/--team. Args and env accept either KEY=VAL pairs or a JSON literal."
          />
          <FeatureCard
            icon={<span className="text-2xl">🟢</span>}
            title="toggle"
            description="Flip --on or --off. Quick way to disable a flaky server without losing its config — re-enable later and the spawn command is unchanged."
          />
          <FeatureCard
            icon={<span className="text-2xl">🗑️</span>}
            title="delete"
            description="Soft-delete by id or name. History preserved (audit log + deleted_at). Requires --yes to skip the confirmation prompt."
          />
        </div>

        <h3 className="text-white font-semibold mb-3 mt-8 text-base">Local-file sync subcommands</h3>
        <div className="grid md:grid-cols-3 gap-3">
          <FeatureCard
            icon={<span className="text-2xl">📊</span>}
            title="sync mcp list"
            description="Diff between .mcp.json (local), the registry (remote), and the last-synced state. Each row is tagged: synced · local-only · remote-only · modified · conflict."
          />
          <FeatureCard
            icon={<span className="text-2xl">⬆️</span>}
            title="sync mcp push"
            description="Walk every entry in .mcp.json and upsert into the registry. sha256 short-circuit: if local hash matches remote, the row is skipped (override with --force)."
          />
          <FeatureCard
            icon={<span className="text-2xl">⬇️</span>}
            title="sync mcp pull"
            description="Hydrate .mcp.json from the registry. If your local copy is dirty and the remote has changed, you get a conflict — pass --force to overwrite local."
          />
        </div>

        <div className="mt-6 p-4 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
          <p className="text-yellow-300 text-sm font-medium">
            Tool discovery is runtime, not registry-side
          </p>
          <p className="text-xs text-gray-400 mt-1">
            We persist the spawn config — not the list of tools the server exposes. Your client
            (Claude Desktop, the agent runtime, or whatever) calls{' '}
            <code className="text-cyan-300">tools/list</code> on connect to find out what&apos;s
            actually available. If a server adds a new tool tomorrow, you don&apos;t need to
            re-register.
          </p>
        </div>
      </TutorialSection>

      {/* ---------------- Recipe: register stdio server ---------------- */}
      <TutorialSection
        id="recipe-stdio"
        icon={
          <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        }
        iconBg="bg-emerald-500/20"
        title="Recipe — register a server from the CLI"
        description="From `npm install` to a row in the registry that everyone on your team can pull."
      >
        <ol className="space-y-4 text-sm text-gray-300">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">1</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Pick the package and verify it spawns</p>
              <CodeSnippet
                language="bash"
                code={`# Filesystem MCP, scoped to the project root
npx -y @modelcontextprotocol/server-filesystem ./`}
              />
              <p className="text-xs text-gray-500 mt-2">
                Smoke-test before registering. If the package can&apos;t install or the binary
                exits immediately, you&apos;ll see it here — not later when an agent tries to call
                a tool.
              </p>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">2</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Register it in one command</p>
              <CodeSnippet
                language="bash"
                code={`pnpm oppmon:mcp create -- \\
  --name fs-project \\
  --description "Filesystem MCP scoped to repo root" \\
  --command npx \\
  --args "-y @modelcontextprotocol/server-filesystem ./" \\
  --scope TEAM --team t_eng_xyz \\
  --yes`}
              />
              <TerminalWindow title="oppmon mcp create">
{`  ⠋ Creating MCP server "fs-project"...
  `}<Ok>✔ MCP server "fs-project" registered</Ok>{`
    `}<Dim>id:      cmcp01h9p7…q3a</Dim>{`
    `}<Dim>sha256:  4e1a8c2f9d3b6e5a…</Dim>
              </TerminalWindow>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">3</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Inspect what landed</p>
              <CodeSnippet
                language="bash"
                code={`pnpm oppmon:mcp show fs-project`}
              />
              <TerminalWindow title="oppmon mcp show">
{`  fs-project
  `}<Dim>------------------------------------------------------------</Dim>{`
    `}<Dim>id             </Dim>{` cmcp01h9p7…q3a
    `}<Dim>scope          </Dim>{` `}<span className="text-cyan-300">TEAM</span>{`
    `}<Dim>teamId         </Dim>{` t_eng_xyz
    `}<Dim>enabled        </Dim>{` `}<Ok>● on </Ok>{`
    `}<Dim>version        </Dim>{` v1.0.0
    `}<Dim>sha256         </Dim>{` `}<Dim>4e1a8c2f9d3b6e5a…</Dim>{`
    `}<Dim>description    </Dim>{` Filesystem MCP scoped to repo root

    `}<Dim>command:</Dim>{`
      `}<Cmd>npx</Cmd>{` `}<Dim>-y @modelcontextprotocol/server-filesystem ./</Dim>{`

    `}<Dim>env:</Dim>{`
      `}<Dim>(empty)</Dim>
              </TerminalWindow>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">4</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Pull it onto another machine</p>
              <CodeSnippet
                language="bash"
                code={`# On a teammate's box — assumes they're a member of t_eng_xyz
pnpm oppmon:sync mcp pull fs-project`}
              />
              <p className="text-xs text-gray-500 mt-2">
                The pull writes the entry into their{' '}
                <code className="text-cyan-300">.mcp.json</code>. Claude Desktop / the local
                runtime picks it up next time it scans for MCP servers — no reboot of the
                workstation required.
              </p>
            </div>
          </li>
        </ol>
      </TutorialSection>

      {/* ---------------- Recipe: secret-bearing server ---------------- */}
      <TutorialSection
        id="recipe-env"
        icon={
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        }
        iconBg="bg-purple-500/20"
        title="Recipe — register a server that needs secrets"
        description="When env vars carry API keys, do the registration on one machine and let everyone else just pull."
      >
        <ol className="space-y-4 text-sm text-gray-300">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold">1</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Register with env baked in</p>
              <CodeSnippet
                language="bash"
                code={`pnpm oppmon:mcp create -- \\
  --name github-issues \\
  --description "Read-only GitHub MCP for issue triage" \\
  --command npx \\
  --args "-y @modelcontextprotocol/server-github" \\
  --env '{"GITHUB_TOKEN":"ghp_REPLACE_ME","GITHUB_TOOLSETS":"issues,pull_requests"}' \\
  --scope TEAM --team t_eng_xyz \\
  --yes`}
              />
              <p className="text-xs text-gray-500 mt-2">
                The <code className="text-cyan-300">--env</code> flag accepts JSON or{' '}
                <code className="text-cyan-300">KEY=VAL</code> pairs. Either way, env values are
                encrypted at rest with the server-side vault. They never go into a git repo,
                shell history, or the audit log.
              </p>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold">2</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Rotate the secret in place</p>
              <CodeSnippet
                language="bash"
                code={`pnpm oppmon:mcp update github-issues -- \\
  --env GITHUB_TOKEN=ghp_NEW_VALUE,GITHUB_TOOLSETS=issues,pull_requests`}
              />
              <p className="text-xs text-gray-500 mt-2">
                Update is full-replace on a field. Pass every key you want to keep — anything
                missing is dropped. The sha256 changes; teammates&apos; next sync pull will pick
                up the new spawn.
              </p>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold">3</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Disable without deleting</p>
              <CodeSnippet
                language="bash"
                code={`pnpm oppmon:mcp toggle github-issues -- --off`}
              />
              <TerminalWindow title="oppmon mcp toggle">
{`  ⠋ Disabling github-issues...
  `}<Ok>{`✔ MCP server "github-issues" `}</Ok><span className="text-red-400">disabled</span>
              </TerminalWindow>
              <p className="text-xs text-gray-500 mt-2">
                The row stays. Pulls will still hydrate it locally so config drift is detectable,
                but the registry-side flag tells your runtime to skip it. Re-enable with{' '}
                <code className="text-cyan-300">--on</code>.
              </p>
            </div>
          </li>
        </ol>
      </TutorialSection>

      {/* ---------------- Sync flow ---------------- */}
      <TutorialSection
        id="sync"
        icon={
          <svg className="w-6 h-6 text-fuchsia-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        }
        iconBg="bg-fuchsia-500/20"
        title="How sync resolves conflicts"
        description="Three states per server: local sha256, remote sha256, last-synced sha256."
      >
        <p className="text-gray-300 text-sm leading-relaxed mb-4">
          Each side computes a sha256 over <code className="text-cyan-300">{`{ command, args, env, version }`}</code>.
          Sync also tracks the hash that was current at the last successful push or pull
          (stored in{' '}
          <code className="text-cyan-300">.claude/config/.oppmon/mcp-servers.json</code>). The
          three values together tell us what to do:
        </p>

        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-white/[0.04] text-gray-400 text-left">
                <th className="px-4 py-2 font-medium">Local</th>
                <th className="px-4 py-2 font-medium">Remote</th>
                <th className="px-4 py-2 font-medium">Synced</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">push</th>
                <th className="px-4 py-2 font-medium">pull</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <tr className="border-t border-white/10">
                <td className="px-4 py-2">A</td>
                <td className="px-4 py-2">A</td>
                <td className="px-4 py-2">A</td>
                <td className="px-4 py-2"><Ok>synced</Ok></td>
                <td className="px-4 py-2 text-gray-500">skip</td>
                <td className="px-4 py-2 text-gray-500">skip</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2">A</td>
                <td className="px-4 py-2 text-gray-500">—</td>
                <td className="px-4 py-2 text-gray-500">—</td>
                <td className="px-4 py-2"><span className="text-cyan-300">local-only</span></td>
                <td className="px-4 py-2 text-cyan-300">create</td>
                <td className="px-4 py-2 text-gray-500">no-op</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2 text-gray-500">—</td>
                <td className="px-4 py-2">B</td>
                <td className="px-4 py-2 text-gray-500">—</td>
                <td className="px-4 py-2"><span className="text-fuchsia-300">remote-only</span></td>
                <td className="px-4 py-2 text-gray-500">no-op</td>
                <td className="px-4 py-2 text-fuchsia-300">create local</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2">A&apos;</td>
                <td className="px-4 py-2">A</td>
                <td className="px-4 py-2">A</td>
                <td className="px-4 py-2"><Warn>modified (local)</Warn></td>
                <td className="px-4 py-2 text-yellow-300">update remote</td>
                <td className="px-4 py-2 text-gray-500">skip (use --force)</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2">A</td>
                <td className="px-4 py-2">B</td>
                <td className="px-4 py-2">A</td>
                <td className="px-4 py-2"><Warn>modified (remote)</Warn></td>
                <td className="px-4 py-2 text-gray-500">skip (use --force)</td>
                <td className="px-4 py-2 text-yellow-300">overwrite local</td>
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2">A&apos;</td>
                <td className="px-4 py-2">B</td>
                <td className="px-4 py-2">X</td>
                <td className="px-4 py-2"><span className="text-red-400">conflict</span></td>
                <td className="px-4 py-2 text-red-400">refuse (--force to overwrite)</td>
                <td className="px-4 py-2 text-red-400">refuse (--force to overwrite)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <CodeSnippet
          language="bash"
          code={`# See current state without changing anything
pnpm oppmon:sync mcp list

# Push everything (errors out on conflicts)
pnpm oppmon:sync mcp push

# Resolve a conflict in your favor
pnpm oppmon:sync mcp push fs-project -- --force`}
        />
      </TutorialSection>

      {/* ---------------- Troubleshooting ---------------- */}
      <TutorialSection
        id="troubleshooting"
        icon={
          <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        }
        iconBg="bg-yellow-500/20"
        title="Troubleshooting"
        description="The four things that go wrong, in order of frequency."
      >
        <div className="space-y-3">
          <details className="group rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
            <summary className="cursor-pointer p-4 text-sm text-gray-300 list-none flex items-center justify-between">
              <span>
                <strong className="text-white">EACCES / npx not found</strong> — registration
                succeeds, but spawn fails on a teammate&apos;s machine
              </span>
              <span className="text-gray-500 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="px-4 pb-4 text-xs text-gray-400 space-y-2">
              <p>
                We don&apos;t bundle binaries — we just store the command string. If{' '}
                <code className="text-cyan-300">npx</code> isn&apos;t on PATH, or the package
                hasn&apos;t been installed yet, the spawn explodes.
              </p>
              <p>
                Fix: pin a fully-qualified path (<code className="text-cyan-300">node /Users/.../server.js</code>),
                or document the prerequisite (<code className="text-cyan-300">npm i -g X</code>) in the
                server&apos;s <code className="text-cyan-300">description</code>.
              </p>
            </div>
          </details>

          <details className="group rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
            <summary className="cursor-pointer p-4 text-sm text-gray-300 list-none flex items-center justify-between">
              <span>
                <strong className="text-white">409 Conflict</strong> — &quot;name already exists&quot;
                on create
              </span>
              <span className="text-gray-500 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="px-4 pb-4 text-xs text-gray-400 space-y-2">
              <p>
                Names are unique per tenant. If you previously soft-deleted a server with the
                same name, the slot is held until purge. Either pick a new name, or have a
                tenant admin hard-delete the orphan via{' '}
                <code className="text-cyan-300">/admin/mcp</code>.
              </p>
            </div>
          </details>

          <details className="group rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
            <summary className="cursor-pointer p-4 text-sm text-gray-300 list-none flex items-center justify-between">
              <span>
                <strong className="text-white">Sync says &quot;conflict&quot;</strong> after I edited
                <code className="ml-1 text-cyan-300">.mcp.json</code> by hand
              </span>
              <span className="text-gray-500 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="px-4 pb-4 text-xs text-gray-400 space-y-2">
              <p>
                Both sides drifted from the last-synced sha256. Sync refuses to silently lose
                changes. Decide who wins:{' '}
                <code className="text-cyan-300">
                  pnpm oppmon:sync mcp push fs-project -- --force
                </code>{' '}
                (local wins) or the matching{' '}
                <code className="text-cyan-300">pull --force</code> (remote wins).
              </p>
            </div>
          </details>

          <details className="group rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
            <summary className="cursor-pointer p-4 text-sm text-gray-300 list-none flex items-center justify-between">
              <span>
                <strong className="text-white">403 Forbidden</strong> — I see the server in{' '}
                <code className="ml-1 text-cyan-300">list</code>, but
                <code className="ml-1 text-cyan-300">update</code> fails
              </span>
              <span className="text-gray-500 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="px-4 pb-4 text-xs text-gray-400 space-y-2">
              <p>
                Read and write are different RBAC checks. A MEMBER role can list/show every
                server in its tenant + teams, but only TEAM_ADMIN+ can mutate, and only
                TENANT_ADMIN+ can move servers across teams or change scope to TENANT.
              </p>
              <p>
                Check{' '}
                <code className="text-cyan-300">pnpm oppmon:status</code> — it prints your role
                and team memberships.
              </p>
            </div>
          </details>

          <details className="group rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
            <summary className="cursor-pointer p-4 text-sm text-gray-300 list-none flex items-center justify-between">
              <span>
                <strong className="text-white">Env var didn&apos;t apply</strong> — server runs but
                authenticates as wrong identity
              </span>
              <span className="text-gray-500 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="px-4 pb-4 text-xs text-gray-400 space-y-2">
              <p>
                <code className="text-cyan-300">--env</code> is full-replace, not merge. If you
                update with <code className="text-cyan-300">--env GITHUB_TOKEN=...</code> alone,
                you wipe every other env key. Always pass the full set, or use the JSON form to
                make the intent visible.
              </p>
            </div>
          </details>

          <details className="group rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
            <summary className="cursor-pointer p-4 text-sm text-gray-300 list-none flex items-center justify-between">
              <span>
                <strong className="text-white">Hash mismatch every push</strong> — &quot;modified
                (local)&quot; even after a fresh pull
              </span>
              <span className="text-gray-500 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="px-4 pb-4 text-xs text-gray-400 space-y-2">
              <p>
                The local <code className="text-cyan-300">.mcp.json</code> serializer might be
                normalising whitespace or argument order differently from the server. Check the{' '}
                <code className="text-cyan-300">args</code> array element-for-element — a single
                trailing-space difference produces a different sha256.
              </p>
              <p>
                Easy fix: <code className="text-cyan-300">pnpm oppmon:sync mcp pull --force</code>{' '}
                to take whatever the registry has, then verify the local file looks right.
              </p>
            </div>
          </details>
        </div>
      </TutorialSection>

      {/* ---------------- REST endpoints ---------------- */}
      <TutorialSection
        id="rest"
        icon={
          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        }
        iconBg="bg-blue-500/20"
        title="REST endpoints"
        description="Same handler is mounted at /api/mcp and /api/admin/mcp."
      >
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-white/[0.04] text-gray-400 text-left">
                <th className="px-4 py-2 font-mono">Method</th>
                <th className="px-4 py-2 font-mono">Path</th>
                <th className="px-4 py-2 font-medium">RBAC</th>
                <th className="px-4 py-2 font-medium">CLI equivalent</th>
              </tr>
            </thead>
            <tbody className="text-gray-300 font-mono">
              {[
                ['GET', '/api/mcp', 'read', 'pnpm oppmon:mcp list'],
                ['GET', '/api/mcp/:id', 'read', 'pnpm oppmon:mcp show'],
                ['POST', '/api/mcp', 'create', 'pnpm oppmon:mcp create'],
                ['PUT', '/api/mcp/:id', 'update', 'pnpm oppmon:mcp update'],
                ['PATCH', '/api/mcp/:id/toggle', 'update', 'pnpm oppmon:mcp toggle'],
                ['DELETE', '/api/mcp/:id', 'delete', 'pnpm oppmon:mcp delete'],
              ].map(([m, p, r, c]) => (
                <tr key={p as string} className="border-t border-white/10">
                  <td className="px-4 py-2 text-cyan-300">{m}</td>
                  <td className="px-4 py-2 text-purple-300">{p}</td>
                  <td className="px-4 py-2 text-gray-400 font-sans">{r}</td>
                  <td className="px-4 py-2 text-gray-400 font-sans">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          All endpoints require a Bearer token (UI cookie or{' '}
          <code className="text-cyan-300">Authorization: Bearer &lt;jwt&gt;</code>). RBAC is
          enforced via the{' '}
          <code className="text-cyan-300">rbac</code> middleware — see{' '}
          <Link href="/docs/admin#roles" className="text-blue-300 hover:underline">
            Roles &amp; RBAC
          </Link>
          . Every CREATE / UPDATE / DELETE writes an{' '}
          <code className="text-cyan-300">audit_logs</code> row with the before/after state.
        </p>
      </TutorialSection>

      {/* ---------------- Footer ---------------- */}
      <div className="rounded-2xl bg-gradient-to-br from-cyan-500/15 via-purple-500/10 to-fuchsia-500/15 border border-white/10 p-8">
        <h3 className="text-2xl font-bold text-white mb-2">Next: pair MCP servers with skills</h3>
        <p className="text-gray-400 mb-5 max-w-2xl">
          An MCP server is a stack of tools. A skill is the playbook that tells an agent when to
          reach for them. Register the server here, then ship a skill that calls it — your team
          gets a reproducible workflow instead of a wiki page full of copy-paste.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/docs/admin/skills"
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors"
          >
            Skills guide →
          </Link>
          <Link
            href="/docs/features/rag"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg font-medium transition-colors"
          >
            RAG &amp; Chat guide →
          </Link>
          <Link
            href="/admin/mcp"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg font-medium transition-colors"
          >
            Open Admin · MCP →
          </Link>
        </div>
      </div>
    </div>
  )
}
