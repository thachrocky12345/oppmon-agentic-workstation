'use client'

import { CodeSnippet, TutorialSection, FeatureCard } from '@/components/tutorial'
import Link from 'next/link'

/* ------------------------------------------------------------------------ */
/* Inline terminal mock (matches the live oppmon CLI output)                 */
/* ------------------------------------------------------------------------ */

function TerminalWindow({
  title = 'pwsh — oppmon skills',
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

export default function SkillsAdminPage() {
  return (
    <div className="space-y-12">
      {/* ---------------- Header ---------------- */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-medium mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
          Admin Guide · Skills
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">Skills Registry</h1>
        <p className="text-gray-400 text-lg max-w-3xl">
          Skills are reusable agent playbooks expressed as <code className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-300 rounded text-sm">SKILL.md</code> files
          with YAML frontmatter. The registry stores them with versioning, scope, and tenant
          isolation. Manage them in the UI or with{' '}
          <code className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-300 rounded text-sm">
            pnpm oppmon:skills
          </code>
          .
        </p>

        <div className="mt-6 grid sm:grid-cols-3 gap-3">
          <Link
            href="/admin/skills"
            className="rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 px-4 py-3 transition-colors"
          >
            <p className="text-xs text-purple-300/80">Live</p>
            <p className="text-purple-300 font-medium">Open Skills Page →</p>
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
            Every save is auto-versioned and SHA-256 fingerprinted
          </p>
          <p className="text-gray-400 text-xs mt-1">
            Each content change writes a new <code className="px-1 py-0.5 bg-black/40 rounded text-emerald-200">SkillVersion</code>{' '}
            row, computes a sha256 of the body, and surfaces history through{' '}
            <code className="px-1 py-0.5 bg-black/40 rounded text-emerald-200">pnpm oppmon:skills versions</code>.
            Nothing is ever overwritten in place.
          </p>
        </div>
      </div>

      {/* ---------------- Concepts ---------------- */}
      <TutorialSection
        id="concepts"
        icon={
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        }
        iconBg="bg-purple-500/20"
        title="What a Skill is"
        description="A SKILL.md file with YAML frontmatter that an agent can load on demand. The registry stores it with scope, version history, and audit log."
      >
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <h4 className="text-white font-semibold mb-2">Required frontmatter</h4>
            <ul className="text-xs text-gray-400 space-y-1.5">
              <li>• <code className="text-cyan-300">name</code> — kebab-case, e.g. <code className="text-cyan-300">code-review</code></li>
              <li>• <code className="text-cyan-300">description</code> — ≥ 50 chars; what + when</li>
              <li>• <code className="text-cyan-300">version</code> — semver, e.g. <code className="text-cyan-300">1.0.0</code></li>
              <li>• <code className="text-cyan-300">author</code> — owning person or team</li>
              <li>• <code className="text-cyan-300">category</code> — research / security / development / operations / compliance / automation</li>
              <li>• <code className="text-cyan-300">triggers</code> — 1-15 keyword phrases</li>
            </ul>
          </div>
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <h4 className="text-white font-semibold mb-2">Optional frontmatter</h4>
            <ul className="text-xs text-gray-400 space-y-1.5">
              <li>• <code className="text-cyan-300">tags</code> — free-form labels for search</li>
              <li>• <code className="text-cyan-300">dependencies</code> — other skill names this one needs</li>
              <li>• <code className="text-cyan-300">mandatoryTools</code> — tool names the skill must call</li>
            </ul>
            <p className="text-xs text-gray-500 mt-3">
              Below the closing <code className="text-cyan-300">---</code> goes the body —
              instructions, examples, code snippets. This is what the agent reads.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-white font-semibold mb-2">File convention</h4>
          <CodeSnippet
            language="text"
            code={`.claude/
  skills/
    code-review/
      SKILL.md          ← the file the registry stores
    incident-triage/
      SKILL.md
    rag-quality-audit/
      SKILL.md`}
          />
          <p className="text-xs text-gray-500 mt-2">
            One folder per skill, one <code className="text-cyan-300">SKILL.md</code> inside.
            <code className="text-cyan-300"> oppmon sync skills</code> uses this layout to mirror
            local ⇄ remote.
          </p>
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
        description="Top-level CRUD lives at oppmon skills. (Bulk push/pull is still under oppmon sync skills.)"
      >
        <CodeSnippet
          language="bash"
          title="Quick reference"
          code={`# All shortcuts assume you have run: pnpm oppmon:login
pnpm oppmon:skills list                                # table of every skill you can see
pnpm oppmon:skills show <name>                         # full record + frontmatter
pnpm oppmon:skills show <name> -- --content            # also print the body
pnpm oppmon:skills create .claude/skills/foo/SKILL.md  # push from a local file
pnpm oppmon:skills update <name> SKILL.md              # bump content (auto-versioned)
pnpm oppmon:skills versions <name>                     # version history with sha256
pnpm oppmon:skills toggle <name> -- --off              # disable without deleting
pnpm oppmon:skills lint  ./SKILL.md                    # validate locally (no API call)
pnpm oppmon:skills delete <name>                       # soft delete (recoverable)`}
        />

        <div className="grid md:grid-cols-2 gap-4 mt-6">
          <FeatureCard
            icon={<span className="text-2xl">📋</span>}
            title="list"
            description="Tabular view of all skills scoped to your role. Filter with --scope, --search, --limit. --json for scripting."
          />
          <FeatureCard
            icon={<span className="text-2xl">🔍</span>}
            title="show"
            description="One skill in detail — frontmatter, scope, version, sha256, enabled, createdBy. Add --content to print the body."
          />
          <FeatureCard
            icon={<span className="text-2xl">✨</span>}
            title="create"
            description="Push a local SKILL.md. The CLI parses frontmatter, computes the hash, and POSTs. Override name/description/scope with flags."
          />
          <FeatureCard
            icon={<span className="text-2xl">⬆️</span>}
            title="update"
            description="Update an existing skill. Without a file you can patch description/scope/team only; with a file the body + version are bumped."
          />
          <FeatureCard
            icon={<span className="text-2xl">🕒</span>}
            title="versions"
            description="Read-only history. Every save creates a SkillVersion row with sha256, author, and timestamp."
          />
          <FeatureCard
            icon={<span className="text-2xl">🚦</span>}
            title="toggle"
            description="Flip enabled state. --on / --off / no flag = invert current. Disabled skills disappear from agent loaders without losing history."
          />
          <FeatureCard
            icon={<span className="text-2xl">🧪</span>}
            title="lint"
            description="Local-only — never touches the API. Validates frontmatter shape, length rules, scope value, and computes the sha256 you'll see remotely."
          />
          <FeatureCard
            icon={<span className="text-2xl">🗑️</span>}
            title="delete"
            description="Soft delete — sets deletedAt. The unique-name slot is held; recover from the admin UI by toggling include-deleted."
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
        title="Recipe — author, lint, publish"
        description="From an empty folder to a published skill in four steps."
      >
        <ol className="space-y-4 text-sm text-gray-300">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">1</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Scaffold the skill folder</p>
              <CodeSnippet
                language="bash"
                code={`mkdir -p .claude/skills/incident-triage
$EDITOR .claude/skills/incident-triage/SKILL.md`}
              />
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">2</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Write the frontmatter + body</p>
              <CodeSnippet
                language="markdown"
                title=".claude/skills/incident-triage/SKILL.md"
                code={`---
name: incident-triage
description: |
  Walk a responder through the first 15 minutes of an incident — assess blast
  radius, capture artefacts, decide on rollback, and post the comms update.
version: 0.1.0
author: platform-team
category: operations
triggers:
  - incident
  - outage
  - sev-1
  - rollback
tags:
  - oncall
  - runbook
---

## When to use

Trigger this skill when an alert fires that an oncall engineer needs to act on
within minutes. It assumes Sentry, Grafana, and the deploy log are already
linked from the alert.

## Procedure

1. Capture timestamps + the alert payload.
2. Open the suspect deploy in the deploy log.
3. ...`}
              />
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">3</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Lint locally before pushing</p>
              <CodeSnippet
                language="bash"
                code={`pnpm oppmon:skills lint .claude/skills/incident-triage/SKILL.md`}
              />
              <TerminalWindow title="oppmon skills lint">
{`  `}<Cmd>SKILL.md</Cmd>{` `}<Dim>(.claude/skills/incident-triage/SKILL.md)</Dim>{`

  name        `}<Ok>✔</Ok>{`  incident-triage
  description `}<Ok>✔</Ok>{`  168 chars
  version     `}<Ok>✔</Ok>{`  0.1.0
  author      `}<Ok>✔</Ok>{`  platform-team
  category    `}<Ok>✔</Ok>{`  operations
  triggers    `}<Ok>✔</Ok>{`  4 keyword(s)
  body        `}<Ok>✔</Ok>{`  1 247 chars
  sha256      `}<Dim>3b1a98c2…d017</Dim>{`

  `}<Ok>✔ ready to publish</Ok>
              </TerminalWindow>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">4</span>
            <div className="flex-1">
              <p className="font-medium text-white mb-2">Publish &amp; verify</p>
              <CodeSnippet
                language="bash"
                code={`pnpm oppmon:skills create .claude/skills/incident-triage/SKILL.md \\
  -- --scope TENANT --yes

pnpm oppmon:skills show incident-triage`}
              />
              <p className="text-xs text-gray-500 mt-2">
                The first save creates version <code className="text-cyan-300">1</code>. Every later
                <code className="text-cyan-300"> update</code> bumps the version monotonically — the
                semver in the frontmatter is for humans, the integer is for the registry.
              </p>
            </div>
          </li>
        </ol>
      </TutorialSection>

      {/* ---------------- Recipe: bulk sync ---------------- */}
      <TutorialSection
        id="recipe-sync"
        icon={
          <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        }
        iconBg="bg-cyan-500/20"
        title="Recipe — bulk sync from .claude/skills/"
        description="When you have many skills under .claude/skills/, use sync — it diffs by sha256 and only pushes/pulls what changed."
      >
        <CodeSnippet
          language="bash"
          code={`# What's drifted between local and remote?
pnpm oppmon:sync skills list

# Push everything local that's newer (or new)
pnpm oppmon:sync skills push

# Pull everything remote into .claude/skills/
pnpm oppmon:sync skills pull`}
        />
        <p className="text-sm text-gray-400 mt-3">
          The two surfaces compose:{' '}
          <code className="text-cyan-300">oppmon skills</code> is the per-skill CRUD,{' '}
          <code className="text-cyan-300">oppmon sync skills</code> is the directory-level
          mirror. Both share the same auth and the same sha256.
        </p>
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
        description="Update, disable, soft-delete, and audit history."
      >
        <div className="space-y-5">
          <div>
            <h4 className="text-white font-semibold mb-2">Update content</h4>
            <CodeSnippet
              language="bash"
              code={`# bump the body — auto-creates a new SkillVersion
pnpm oppmon:skills update incident-triage .claude/skills/incident-triage/SKILL.md

# patch only metadata (no new version row)
pnpm oppmon:skills update incident-triage -- --description "Updated wording" --scope TENANT`}
            />
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2">Inspect history</h4>
            <CodeSnippet
              language="bash"
              code={`pnpm oppmon:skills versions incident-triage`}
            />
            <TerminalWindow title="oppmon skills versions">
{`  v `}<Cmd>3</Cmd>{`   `}<Dim>2026-05-07 14:22</Dim>{`   sha256 `}<Dim>3b1a98c2…d017</Dim>{`   `}<Dim>by maya@oppmon.dev</Dim>{`
  v `}<Cmd>2</Cmd>{`   `}<Dim>2026-05-06 09:11</Dim>{`   sha256 `}<Dim>4e7c12fa…81a9</Dim>{`   `}<Dim>by maya@oppmon.dev</Dim>{`
  v `}<Cmd>1</Cmd>{`   `}<Dim>2026-05-05 17:48</Dim>{`   sha256 `}<Dim>9d2e44b1…6c00</Dim>{`   `}<Dim>by ethan@oppmon.dev</Dim>
            </TerminalWindow>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2">Disable temporarily</h4>
            <CodeSnippet
              language="bash"
              code={`pnpm oppmon:skills toggle incident-triage -- --off    # disable
pnpm oppmon:skills toggle incident-triage -- --on     # re-enable
pnpm oppmon:skills toggle incident-triage              # flip current state`}
            />
            <p className="text-xs text-gray-500 mt-2">
              Disabled skills no longer load into agent contexts but their history is preserved.
              Use this for noisy or deprecated playbooks before deciding to delete.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-2">Soft delete &amp; recover</h4>
            <CodeSnippet
              language="bash"
              code={`pnpm oppmon:skills delete incident-triage -- --yes
# Tombstone holds the unique name slot.
# TENANT_ADMINs can list with includeDeleted=true in the UI to recover.`}
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
        description="The most common stumbles when authoring skills."
      >
        <div className="space-y-3">
          {[
            {
              q: '"Frontmatter validation failed: description must be at least 50 characters"',
              a: (
                <>
                  The description is what an agent loader uses to decide whether to load the skill.
                  Short ones cause false-negatives. Aim for one or two sentences explaining{' '}
                  <em>what the skill does</em> and <em>when to use it</em>. Lint locally with{' '}
                  <code className="text-cyan-300">pnpm oppmon:skills lint</code> before pushing.
                </>
              ),
            },
            {
              q: '"name must match /^[a-z][a-z0-9-]*$/"',
              a: (
                <>
                  Skill names are kebab-case ASCII. No spaces, capitals, underscores, or
                  emoji. The folder under <code className="text-cyan-300">.claude/skills/</code>{' '}
                  must match the frontmatter name.
                </>
              ),
            },
            {
              q: 'Lint passes locally, but the API rejects with "skill name already exists"',
              a: (
                <>
                  Either an active or soft-deleted skill is holding that slot. Check{' '}
                  <code className="text-cyan-300">pnpm oppmon:skills list --search &lt;name&gt;</code>
                  . If you see nothing, ask a TENANT_ADMIN to look at the admin UI with{' '}
                  <Warn>include-deleted</Warn> turned on — there&apos;s probably a tombstone.
                </>
              ),
            },
            {
              q: 'Updated locally but the agent is still loading the old version',
              a: (
                <>
                  Agent loaders cache by sha256. Confirm the new hash with{' '}
                  <code className="text-cyan-300">pnpm oppmon:skills show &lt;name&gt;</code>{' '}
                  and check it matches your{' '}
                  <code className="text-cyan-300">lint</code> output. If they differ, the
                  update didn&apos;t land — re-run{' '}
                  <code className="text-cyan-300">update &lt;name&gt; SKILL.md</code>.
                </>
              ),
            },
            {
              q: 'TEAM-scoped skill is invisible to teammates',
              a: (
                <>
                  Their JWT&apos;s <code className="text-cyan-300">teamMemberships</code> claim
                  must include the team. Have them run{' '}
                  <code className="text-cyan-300">pnpm oppmon:status</code> — if the team is
                  missing, a TENANT_ADMIN needs to add them and they need to{' '}
                  <code className="text-cyan-300">pnpm oppmon:login</code> again to refresh.
                </>
              ),
            },
            {
              q: '"Not authenticated. Run \\"oppmon login\\" first."',
              a: (
                <>
                  The CLI&apos;s token cache is empty or stale. Don&apos;t use{' '}
                  <code className="text-yellow-300">pnpm dev:api login</code> — that runs turbo
                  and fails with &quot;Could not find task `login`&quot;. Use{' '}
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
                ['GET', '/api/skills', 'pnpm oppmon:skills list'],
                ['GET', '/api/skills/:id', 'pnpm oppmon:skills show <name>'],
                ['GET', '/api/skills/:id/versions', 'pnpm oppmon:skills versions <name>'],
                ['POST', '/api/skills', 'pnpm oppmon:skills create <file>'],
                ['PATCH', '/api/skills/:id', 'pnpm oppmon:skills update <name>'],
                ['DELETE', '/api/skills/:id', 'pnpm oppmon:skills delete <name>'],
                ['PATCH', '/api/admin/skills/:id/toggle', 'pnpm oppmon:skills toggle <name>'],
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
        <h3 className="text-2xl font-bold text-white mb-2">Next: register the models that will run them</h3>
        <p className="text-gray-400 mb-5 max-w-2xl">
          A skill describes <em>what</em> the agent should do. A model describes <em>which</em>{' '}
          provider answers the call. Wire them together in the Models registry and gate them with
          virtual keys.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/docs/admin/models"
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors"
          >
            AI Models guide →
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
