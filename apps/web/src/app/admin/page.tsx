/**
 * Admin Dashboard
 *
 * Overview page for admin section with quick access to all admin features.
 */

import Link from 'next/link'

interface AdminCard {
  title: string
  description: string
  href: string
  icon: string
  badge?: string
}

const adminCards: AdminCard[] = [
  {
    title: 'AI Models',
    description: 'Configure AI providers and models for your AI Gateway.',
    href: '/admin/models',
    icon: '🤖',
    badge: 'New',
  },
  {
    title: 'Teams',
    description: 'Manage teams, add members, and configure team settings.',
    href: '/admin/teams',
    icon: '👥',
  },
  {
    title: 'Skills',
    description: 'Create and manage skills that can be synced to Claude Code.',
    href: '/admin/skills',
    icon: '⚡',
  },
  {
    title: 'MCP Servers',
    description: 'Register and manage MCP servers for tools and integrations.',
    href: '/admin/mcp',
    icon: '🔌',
  },
  {
    title: 'Usage Analytics',
    description: 'View privacy-first usage metrics and trends.',
    href: '/admin/usage',
    icon: '📊',
  },
  {
    title: 'Audit Log',
    description: 'View activity logs and track changes across the system.',
    href: '/admin/audit',
    icon: '📋',
  },
]

export default function AdminPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Manage your organization&apos;s teams, skills, and integrations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {adminCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                {card.title}
              </h2>
              <span className="text-2xl">{card.icon}</span>
            </div>
            <p className="text-gray-600 text-sm">{card.description}</p>
            {card.badge && (
              <span className="inline-block mt-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                {card.badge}
              </span>
            )}
          </Link>
        ))}

        {/* Settings Card - Coming Soon */}
        <div className="bg-white rounded-lg shadow p-6 opacity-50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
            <span className="text-2xl">⚙️</span>
          </div>
          <p className="text-gray-600 text-sm">
            Configure organization settings and preferences.
          </p>
          <span className="text-xs text-gray-400 mt-2 block">Coming soon</span>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-8 bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Start</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2">1. Create a Team</h3>
            <p className="text-sm text-gray-600 mb-3">
              Organize your users into teams with role-based access.
            </p>
            <Link
              href="/admin/teams"
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              Go to Teams →
            </Link>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2">2. Add Skills</h3>
            <p className="text-sm text-gray-600 mb-3">
              Create skills that users can sync to their Claude Code.
            </p>
            <Link
              href="/admin/skills"
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              Go to Skills →
            </Link>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2">3. Monitor Usage</h3>
            <p className="text-sm text-gray-600 mb-3">
              Track how your team uses skills and tools.
            </p>
            <Link
              href="/admin/usage"
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              View Analytics →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
