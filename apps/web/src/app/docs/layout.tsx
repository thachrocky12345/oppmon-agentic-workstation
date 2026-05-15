'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'

const navSections = [
  {
    title: 'Getting Started',
    items: [
      { id: 'getting-started', title: 'Getting Started', href: '/docs' },
      { id: 'quick-start', title: 'Quick Start', href: '/docs/quick-start' },
      { id: 'architecture', title: 'Architecture', href: '/docs/architecture' },
    ]
  },
  {
    title: 'CLI & Integration',
    items: [
      { id: 'cli-setup', title: 'CLI Setup', href: '/docs/cli-setup' },
      { id: 'workflows', title: 'Coding Workflows', href: '/docs/workflows' },
    ]
  },
  {
    title: 'Admin Guide',
    items: [
      { id: 'admin-guide', title: 'Admin Overview', href: '/docs/admin' },
      { id: 'teams', title: 'Team Management', href: '/docs/admin/teams' },
      { id: 'models', title: 'AI Models', href: '/docs/admin/models' },
      { id: 'skills', title: 'Skills Registry', href: '/docs/admin/skills' },
    ]
  },
  {
    title: 'Features',
    items: [
      { id: 'rag', title: 'RAG & Chat', href: '/docs/features/rag' },
      { id: 'graph', title: 'Graph Mode', href: '/docs/features/graph' },
      { id: 'mcp', title: 'MCP Servers', href: '/docs/features/mcp' },
      { id: 'analytics', title: 'Usage Analytics', href: '/docs/features/analytics' },
    ]
  },
]

export default function DocsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gray-900/80 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/" className="text-xl font-bold text-white">
                OppMon
              </Link>
              <nav className="hidden md:flex items-center gap-6">
                <Link href="/" className="text-gray-400 hover:text-white text-sm">
                  Home
                </Link>
                <Link href="/docs" className="text-green-400 text-sm font-medium">
                  Tutorial
                </Link>
                <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm">
                  Dashboard
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/login"
                className="text-gray-400 hover:text-white text-sm"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="border-b border-white/10 bg-gradient-to-r from-gray-900 to-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-center text-gray-400">
            Everything you need to set up, configure, and manage your AI Gateway.
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky top-24 space-y-6">
              {navSections.map((section) => (
                <div key={section.title}>
                  <h4 className="text-sm font-semibold text-white mb-3">{section.title}</h4>
                  <nav className="space-y-1">
                    {section.items.map((item) => {
                      const isActive = pathname === item.href
                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                            isActive
                              ? 'bg-green-500 text-white font-medium'
                              : 'text-gray-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {item.title}
                        </Link>
                      )
                    })}
                  </nav>
                </div>
              ))}
            </div>
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0">
            {children}
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <p className="text-gray-500 text-sm">OppMon AI Gateway Platform</p>
            <div className="flex gap-4">
              <Link href="/" className="text-gray-500 hover:text-white text-sm">
                Home
              </Link>
              <Link href="/dashboard" className="text-gray-500 hover:text-white text-sm">
                Dashboard
              </Link>
              <Link href="/admin" className="text-gray-500 hover:text-white text-sm">
                Admin
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
