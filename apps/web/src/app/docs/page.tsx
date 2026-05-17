// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

import { CodeSnippet, TutorialSection, StepList, FeatureCard } from '@/components/tutorial'

export default function DocsPage() {
  return (
    <div className="space-y-12">
      {/* Getting Started */}
      <TutorialSection
        id="getting-started"
        icon={
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
        iconBg="bg-green-500/20"
        title="Getting Started"
        description="Set up OppMon in 5 minutes and start managing your AI agents"
      >
        <div className="space-y-8">
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">What is OppMon?</h3>
            <p className="text-gray-400 mb-4">
              OppMon is an AI Gateway platform that provides your engineering team with:
            </p>
            <ul className="space-y-2 text-gray-400">
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">✓</span>
                <span><strong className="text-white">Skill Registry</strong> — Versioned skill bundles, scoped to team. One <code className="text-green-400">tag sync</code> to install.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">✓</span>
                <span><strong className="text-white">MCP Catalog</strong> — Register internal API/Jira/RAG servers once. Every developer&apos;s Claude Code picks them up.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">✓</span>
                <span><strong className="text-white">Tenant-aware RAG</strong> — Vector search with tenant_id enforced at the SQL layer. Cross-tenant leak is impossible by construction.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">✓</span>
                <span><strong className="text-white">Privacy-first Analytics</strong> — See what resources are getting used without surveillance. No user prompts stored.</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Quick Install</h3>
            <StepList
              steps={[
                {
                  number: 1,
                  title: 'Clone the repository',
                  content: (
                    <CodeSnippet
                      code="git clone https://github.com/your-org/oppmon-workstation.git
cd oppmon-workstation"
                      language="bash"
                    />
                  )
                },
                {
                  number: 2,
                  title: 'Install dependencies',
                  content: (
                    <CodeSnippet
                      code="pnpm install"
                      language="bash"
                    />
                  )
                },
                {
                  number: 3,
                  title: 'Start the development stack',
                  content: (
                    <CodeSnippet
                      code="pnpm setup  # Starts PostgreSQL, pushes schema, seeds data"
                      language="bash"
                    />
                  )
                },
                {
                  number: 4,
                  title: 'Start the application',
                  content: (
                    <CodeSnippet
                      code="pnpm dev  # Starts API on :3001 and Web on :3002"
                      language="bash"
                    />
                  )
                }
              ]}
            />
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Default Credentials</h3>
            <div className="bg-black/30 rounded-lg p-4 border border-white/10">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Email:</span>
                  <span className="text-white ml-2 font-mono">admin@oppmon.dev</span>
                </div>
                <div>
                  <span className="text-gray-500">Password:</span>
                  <span className="text-white ml-2 font-mono">admin123</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </TutorialSection>

      {/* Platform Overview */}
      <TutorialSection
        id="platform-overview"
        icon={
          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        }
        iconBg="bg-blue-500/20"
        title="Platform Overview"
        description="Understand the key components of OppMon"
      >
        <div className="grid md:grid-cols-2 gap-4">
          <FeatureCard
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
            iconColor="text-green-400"
            title="CLI Tool (tag)"
            description="Install skills, sync configurations, and manage your Claude Code setup from the command line."
            href="/docs/cli-setup"
          />
          <FeatureCard
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            }
            iconColor="text-purple-400"
            title="Admin Dashboard"
            description="Manage teams, configure AI models, monitor usage, and control permissions from the web UI."
            href="/docs/admin"
          />
          <FeatureCard
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            }
            iconColor="text-orange-400"
            title="Skills Registry"
            description="Create, version, and distribute AI skills across your team with scope-based permissions."
            href="/docs/admin/skills"
          />
          <FeatureCard
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            }
            iconColor="text-cyan-400"
            title="RAG Chat"
            description="Ask questions grounded in your team&apos;s documents with tenant-isolated vector search."
            href="/docs/features/rag"
          />
        </div>
      </TutorialSection>

      {/* The Demo Flow */}
      <TutorialSection
        id="demo-flow"
        icon={
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        iconBg="bg-purple-500/20"
        title="The 5-Minute Demo"
        description="See the complete flow from sign-up to RAG-grounded Claude Code"
      >
        <div className="space-y-6">
          <p className="text-gray-400">
            The typical setup flow involves two personas: <strong className="text-white">Alice (Admin)</strong> who
            configures the team&apos;s AI tools, and <strong className="text-white">Bob (Developer)</strong> who uses them.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-500/10 rounded-xl p-5 border border-blue-500/20">
              <h4 className="text-lg font-semibold text-blue-400 mb-3">Alice (Admin)</h4>
              <ol className="space-y-2 text-gray-400 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-medium">1.</span>
                  <span>Signs up with GitHub OAuth</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-medium">2.</span>
                  <span>Creates teams (Engineering, Marketing)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-medium">3.</span>
                  <span>Configures AI models (Bedrock, Anthropic, Ollama)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-medium">4.</span>
                  <span>Uploads skills and registers MCP servers</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-medium">5.</span>
                  <span>Sets team defaults and permissions</span>
                </li>
              </ol>
            </div>

            <div className="bg-green-500/10 rounded-xl p-5 border border-green-500/20">
              <h4 className="text-lg font-semibold text-green-400 mb-3">Bob (Developer)</h4>
              <ol className="space-y-2 text-gray-400 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-green-400 font-medium">1.</span>
                  <span>Installs CLI: <code className="text-green-400">npm install -g @tag/cli</code></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 font-medium">2.</span>
                  <span>Authenticates: <code className="text-green-400">tag login</code></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 font-medium">3.</span>
                  <span>Syncs everything: <code className="text-green-400">tag sync</code></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 font-medium">4.</span>
                  <span>Uses Claude Code with team RAG</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400 font-medium">5.</span>
                  <span>Gets answers grounded in team docs</span>
                </li>
              </ol>
            </div>
          </div>

          <div className="bg-gray-800/50 rounded-xl p-5 border border-white/10">
            <h4 className="text-lg font-semibold text-white mb-3">The Trust Commitment</h4>
            <p className="text-gray-400 text-sm">
              <strong className="text-green-400">What admins CAN see:</strong> Top skills used, top MCP tools called,
              RAG query volume by collection — <em>which resources</em> are getting value.
            </p>
            <p className="text-gray-400 text-sm mt-2">
              <strong className="text-red-400">What admins CANNOT see:</strong> Individual prompts, specific questions
              asked, tool call arguments. No &quot;what did Bob do at 3pm&quot; surveillance. <em>By design.</em>
            </p>
          </div>
        </div>
      </TutorialSection>

      {/* Next Steps */}
      <TutorialSection
        id="next-steps"
        icon={
          <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        }
        iconBg="bg-yellow-500/20"
        title="Next Steps"
        description="Where to go from here"
      >
        <div className="grid md:grid-cols-3 gap-4">
          <a
            href="/docs/cli-setup"
            className="block p-4 bg-white/5 rounded-xl border border-white/10 hover:border-green-500/50 hover:bg-green-500/5 transition-all group"
          >
            <div className="text-green-400 mb-2 text-lg">→</div>
            <h4 className="font-semibold text-white group-hover:text-green-400 transition-colors">CLI Setup Guide</h4>
            <p className="text-sm text-gray-500 mt-1">Complete 9-step guide</p>
          </a>
          <a
            href="/docs/admin"
            className="block p-4 bg-white/5 rounded-xl border border-white/10 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
          >
            <div className="text-blue-400 mb-2 text-lg">→</div>
            <h4 className="font-semibold text-white group-hover:text-blue-400 transition-colors">Admin Guide</h4>
            <p className="text-sm text-gray-500 mt-1">Configure your team</p>
          </a>
          <a
            href="/docs/workflows"
            className="block p-4 bg-white/5 rounded-xl border border-white/10 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group"
          >
            <div className="text-purple-400 mb-2 text-lg">→</div>
            <h4 className="font-semibold text-white group-hover:text-purple-400 transition-colors">Coding Workflows</h4>
            <p className="text-sm text-gray-500 mt-1">Practical patterns</p>
          </a>
        </div>
      </TutorialSection>
    </div>
  )
}
