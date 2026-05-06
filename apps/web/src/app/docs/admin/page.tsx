'use client'

import { TutorialSection, FeatureCard } from '@/components/tutorial'
import Link from 'next/link'

export default function AdminGuidePage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Admin Guide</h1>
        <p className="text-gray-400">
          Comprehensive guide for administrators managing the OppMon AI Gateway platform.
        </p>
      </div>

      {/* Accessing Admin Panel */}
      <TutorialSection
        id="accessing-admin"
        icon={
          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        }
        iconBg="bg-blue-500/20"
        title="Accessing Admin Panel"
      >
        <div className="space-y-4">
          <ol className="space-y-2 text-gray-400">
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-medium">1.</span>
              <span>Navigate to <Link href="/admin" className="text-green-400 hover:underline">/admin</Link></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-medium">2.</span>
              <span>Login with admin credentials</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 font-medium">3.</span>
              <span>You&apos;ll see the admin dashboard with navigation</span>
            </li>
          </ol>

          <div className="mt-6">
            <h4 className="text-white font-medium mb-3">Admin Navigation</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 text-gray-400 font-medium">Section</th>
                    <th className="text-left py-2 text-gray-400 font-medium">Purpose</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  <tr className="border-b border-white/5">
                    <td className="py-2 font-medium">Teams</td>
                    <td className="py-2 text-gray-400">Team management</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 font-medium">AI Models</td>
                    <td className="py-2 text-gray-400">Model configuration</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 font-medium">LLM Usage</td>
                    <td className="py-2 text-gray-400">Usage analytics</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 font-medium">Skills</td>
                    <td className="py-2 text-gray-400">Skills registry</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 font-medium">MCP Servers</td>
                    <td className="py-2 text-gray-400">MCP server management</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 font-medium">Usage</td>
                    <td className="py-2 text-gray-400">Platform usage metrics</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">Audit Log</td>
                    <td className="py-2 text-gray-400">Activity audit trail</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </TutorialSection>

      {/* Quick Links */}
      <TutorialSection
        id="quick-links"
        icon={
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
        iconBg="bg-green-500/20"
        title="Admin Features"
        description="Quick access to admin capabilities"
      >
        <div className="grid md:grid-cols-2 gap-4">
          <FeatureCard
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
            iconColor="text-blue-400"
            title="Team Management"
            description="Create teams, manage members, assign roles, and set team-level permissions."
            href="/docs/admin/teams"
          />
          <FeatureCard
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
            iconColor="text-purple-400"
            title="AI Models"
            description="Configure LLM providers (Anthropic, OpenAI, Cerebras, Ollama), set defaults, manage routing."
            href="/docs/admin/models"
          />
          <FeatureCard
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            }
            iconColor="text-orange-400"
            title="Skills Registry"
            description="Create, version, and distribute AI skills with scope-based visibility controls."
            href="/docs/admin/skills"
          />
          <FeatureCard
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
            iconColor="text-cyan-400"
            title="Usage Analytics"
            description="Monitor usage, set quotas, view cost breakdowns, and generate reports."
            href="/docs/features/analytics"
          />
        </div>
      </TutorialSection>

      {/* Team Roles */}
      <TutorialSection
        id="team-roles"
        icon={
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        }
        iconBg="bg-purple-500/20"
        title="Team Roles"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 text-gray-400 font-medium">Role</th>
                <th className="text-left py-2 text-gray-400 font-medium">Permissions</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <tr className="border-b border-white/5">
                <td className="py-3 font-medium text-green-400">Member</td>
                <td className="py-3 text-gray-400">Use team resources, view dashboards</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-3 font-medium text-blue-400">Admin</td>
                <td className="py-3 text-gray-400">Manage team settings, add/remove members</td>
              </tr>
              <tr>
                <td className="py-3 font-medium text-purple-400">Owner</td>
                <td className="py-3 text-gray-400">Full control, delete team, transfer ownership</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TutorialSection>

      {/* Best Practices */}
      <TutorialSection
        id="best-practices"
        icon={
          <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        }
        iconBg="bg-yellow-500/20"
        title="Best Practices"
      >
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-white font-medium mb-3">Security</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Regularly review admin access
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Use strong passwords and MFA
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Review audit logs weekly
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Rotate API keys quarterly
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Team Management</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Document team purposes
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Set appropriate quotas
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Review member access periodically
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Archive inactive teams
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Model Management</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Test new models in staging first
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Set conservative rate limits initially
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Monitor costs closely
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Have fallback models configured
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Skills</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Version skill content
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Test skills before publishing
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Gather usage feedback
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">•</span>
                Archive outdated skills
              </li>
            </ul>
          </div>
        </div>
      </TutorialSection>

      {/* Keyboard Shortcuts */}
      <TutorialSection
        id="keyboard-shortcuts"
        icon={
          <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        }
        iconBg="bg-cyan-500/20"
        title="Keyboard Shortcuts"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 text-gray-400 font-medium">Shortcut</th>
                <th className="text-left py-2 text-gray-400 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <tr className="border-b border-white/5">
                <td className="py-2"><kbd className="px-2 py-1 bg-white/10 rounded text-xs">g t</kbd></td>
                <td className="py-2 text-gray-400">Go to Teams</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2"><kbd className="px-2 py-1 bg-white/10 rounded text-xs">g m</kbd></td>
                <td className="py-2 text-gray-400">Go to Models</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2"><kbd className="px-2 py-1 bg-white/10 rounded text-xs">g s</kbd></td>
                <td className="py-2 text-gray-400">Go to Skills</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2"><kbd className="px-2 py-1 bg-white/10 rounded text-xs">g u</kbd></td>
                <td className="py-2 text-gray-400">Go to Usage</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-2"><kbd className="px-2 py-1 bg-white/10 rounded text-xs">g a</kbd></td>
                <td className="py-2 text-gray-400">Go to Audit</td>
              </tr>
              <tr>
                <td className="py-2"><kbd className="px-2 py-1 bg-white/10 rounded text-xs">?</kbd></td>
                <td className="py-2 text-gray-400">Show shortcuts</td>
              </tr>
            </tbody>
          </table>
        </div>
      </TutorialSection>
    </div>
  )
}
