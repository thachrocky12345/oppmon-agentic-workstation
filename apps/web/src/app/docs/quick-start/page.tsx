// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

import { CodeSnippet, TutorialSection, StepList } from '@/components/tutorial'
import Link from 'next/link'

export default function QuickStartPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Quick Start</h1>
        <p className="text-gray-400">
          Get OppMon running in 5 minutes. Perfect for trying out the platform.
        </p>
      </div>

      {/* Prerequisites */}
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
        <ul className="space-y-2 text-gray-400">
          <li className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <strong className="text-white">Node.js 20+</strong>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <strong className="text-white">pnpm 9+</strong>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <strong className="text-white">Docker</strong> (for PostgreSQL)
          </li>
        </ul>
      </TutorialSection>

      {/* Installation */}
      <TutorialSection
        id="installation"
        icon={
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        }
        iconBg="bg-green-500/20"
        title="Installation"
      >
        <StepList
          steps={[
            {
              number: 1,
              title: 'Clone and install',
              content: (
                <CodeSnippet
                  code={`git clone https://github.com/your-org/oppmon-workstation.git
cd oppmon-workstation
pnpm install`}
                  language="bash"
                />
              )
            },
            {
              number: 2,
              title: 'Start the development stack',
              description: 'This starts PostgreSQL, pushes the database schema, and seeds sample data.',
              content: (
                <CodeSnippet
                  code="pnpm setup"
                  language="bash"
                />
              )
            },
            {
              number: 3,
              title: 'Start the application',
              description: 'API runs on port 3001, Web runs on port 3002.',
              content: (
                <CodeSnippet
                  code="pnpm dev"
                  language="bash"
                />
              )
            },
            {
              number: 4,
              title: 'Open the dashboard',
              description: 'Login with admin@oppmon.dev / admin123',
              content: (
                <div className="flex gap-4">
                  <a
                    href="http://localhost:3002"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Open Dashboard
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                  <a
                    href="http://localhost:3002/admin"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Open Admin Panel
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )
            }
          ]}
        />
      </TutorialSection>

      {/* What's Included */}
      <TutorialSection
        id="whats-included"
        icon={
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        }
        iconBg="bg-purple-500/20"
        title="What's Included"
      >
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-white font-medium mb-3">Seed Data</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Default tenant with admin user
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Engineering and Marketing teams
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Sample AI models configured
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Example skills and MCP servers
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Default Credentials</h4>
            <div className="bg-black/30 rounded-lg p-4 border border-white/10">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Email:</span>
                  <code className="text-green-400">admin@oppmon.dev</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Password:</span>
                  <code className="text-green-400">admin123</code>
                </div>
              </div>
            </div>
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
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Link
            href="/docs/cli-setup"
            className="block p-4 bg-white/5 rounded-xl border border-white/10 hover:border-green-500/50 hover:bg-green-500/5 transition-all group"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">⌨️</span>
              <h4 className="font-semibold text-white group-hover:text-green-400 transition-colors">
                Set up the CLI
              </h4>
            </div>
            <p className="text-sm text-gray-500">
              Install the <code className="text-green-400">tag</code> command for syncing skills and tracking usage.
            </p>
          </Link>

          <Link
            href="/docs/admin"
            className="block p-4 bg-white/5 rounded-xl border border-white/10 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">⚙️</span>
              <h4 className="font-semibold text-white group-hover:text-blue-400 transition-colors">
                Configure teams
              </h4>
            </div>
            <p className="text-sm text-gray-500">
              Set up teams, configure AI models, and manage permissions.
            </p>
          </Link>

          <Link
            href="/docs/workflows"
            className="block p-4 bg-white/5 rounded-xl border border-white/10 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🔄</span>
              <h4 className="font-semibold text-white group-hover:text-purple-400 transition-colors">
                Learn workflows
              </h4>
            </div>
            <p className="text-sm text-gray-500">
              Practical patterns for using OppMon with Claude Code daily.
            </p>
          </Link>

          <Link
            href="/docs/features/rag"
            className="block p-4 bg-white/5 rounded-xl border border-white/10 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all group"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🔍</span>
              <h4 className="font-semibold text-white group-hover:text-cyan-400 transition-colors">
                Try RAG chat
              </h4>
            </div>
            <p className="text-sm text-gray-500">
              Ask questions grounded in your team&apos;s documents.
            </p>
          </Link>
        </div>
      </TutorialSection>

      {/* Troubleshooting */}
      <TutorialSection
        id="troubleshooting"
        icon={
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        }
        iconBg="bg-red-500/20"
        title="Troubleshooting"
      >
        <div className="space-y-4">
          <div className="bg-black/30 rounded-lg p-4 border border-white/10">
            <h4 className="text-white font-medium mb-2">Docker not running?</h4>
            <CodeSnippet
              code={`# Start Docker first, then run:
pnpm docker:up
pnpm db:push
pnpm db:seed`}
              language="bash"
            />
          </div>

          <div className="bg-black/30 rounded-lg p-4 border border-white/10">
            <h4 className="text-white font-medium mb-2">Port already in use?</h4>
            <p className="text-gray-400 text-sm mb-2">Check for existing processes:</p>
            <CodeSnippet
              code={`# Windows
netstat -ano | findstr :3001
netstat -ano | findstr :3002`}
              language="bash"
            />
          </div>

          <div className="bg-black/30 rounded-lg p-4 border border-white/10">
            <h4 className="text-white font-medium mb-2">Database connection failed?</h4>
            <CodeSnippet
              code={`# Reset and re-seed
pnpm db:reset`}
              language="bash"
            />
          </div>
        </div>
      </TutorialSection>
    </div>
  )
}
