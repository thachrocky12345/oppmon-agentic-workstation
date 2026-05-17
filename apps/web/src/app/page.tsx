// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function Home() {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => {
        if (cancelled) return
        setIsAuthed(res.ok)
      })
      .catch(() => {
        if (!cancelled) setIsAuthed(false)
      })
    return () => { cancelled = true }
  }, [])

  // Brand: when authenticated, click goes to /dashboard. When not, anchor to top of page.
  const brandHref = isAuthed ? '/dashboard' : '/'

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      {/* Header */}
      <header className="container mx-auto px-4 py-6 flex justify-between items-center">
        <Link
          href={brandHref}
          className="text-2xl font-bold hover:text-gray-200 transition-colors"
          title={isAuthed ? 'Go to Dashboard' : 'OppMon Dashboard'}
        >
          OppMon Dashboard
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/docs" className="text-gray-300 hover:text-white">
            Tutorial
          </Link>
          {isAuthed ? (
            <Link
              href="/dashboard"
              className="text-gray-300 hover:text-white"
            >
              Dashboard
            </Link>
          ) : (
            <Link href="/login" className="text-gray-300 hover:text-white">
              Sign in
            </Link>
          )}
          <Link
            href={isAuthed ? '/dashboard' : '/register'}
            className="px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700"
          >
            {isAuthed ? 'Open Dashboard' : 'Get Started'}
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="inline-block px-4 py-1 bg-green-600/20 rounded-full text-green-400 text-sm font-medium mb-6">
          Give every team a secure AI toolbox
        </div>
        <h2 className="text-5xl font-bold mb-6">
          AI Gateway for Claude Code Teams
        </h2>
        <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-4">
          Skills. RAG. MCP. Distributed by team. Owned by you.
        </p>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-8">
          One CLI command. Five minutes from install to working with team RAG inside Claude Code.
          Privacy-first — see what resources are used, not what users ask.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href={isAuthed ? '/dashboard' : '/register'}
            className="px-6 py-3 bg-green-600 rounded-lg font-semibold hover:bg-green-700 transition-colors"
          >
            {isAuthed ? 'Go to Dashboard' : 'Start Free Trial'}
          </Link>
          <Link
            href="/docs"
            className="px-6 py-3 border border-gray-600 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
          >
            View Tutorial
          </Link>
        </div>
        <p className="text-gray-500 text-sm mt-4">
          No credit card required. Get started in 5 minutes.
        </p>
      </section>

      {/* Features */}
      <section id="features" className="container mx-auto px-4 py-20">
        <h3 className="text-3xl font-bold text-center mb-4">The Complete AI Toolbox</h3>
        <p className="text-gray-400 text-center mb-12 max-w-2xl mx-auto">
          Everything your engineering team needs to share AI tools safely, without becoming surveillance.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-green-500/50 transition-colors">
            <span className="text-4xl mb-4 block">📦</span>
            <h4 className="text-xl font-semibold mb-2">Skill Registry</h4>
            <p className="text-gray-400">
              Versioned skill bundles, scoped to team. One <code className="text-green-400">tag sync</code> to install.
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-purple-500/50 transition-colors">
            <span className="text-4xl mb-4 block">🔌</span>
            <h4 className="text-xl font-semibold mb-2">MCP Catalog</h4>
            <p className="text-gray-400">
              Register internal API/Jira/RAG servers once. Every developer&apos;s Claude Code picks them up.
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-blue-500/50 transition-colors">
            <span className="text-4xl mb-4 block">🔒</span>
            <h4 className="text-xl font-semibold mb-2">Tenant-aware RAG</h4>
            <p className="text-gray-400">
              Vector search with tenant_id at SQL layer. Cross-tenant leak is impossible by construction.
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-yellow-500/50 transition-colors">
            <span className="text-4xl mb-4 block">👁️</span>
            <h4 className="text-xl font-semibold mb-2">Privacy Analytics</h4>
            <p className="text-gray-400">
              See which resources are getting value — not what users ask. No prompts stored. By design.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16 text-center">
        <h3 className="text-3xl font-bold mb-4">
          {isAuthed ? 'Welcome back' : 'Ready to get started?'}
        </h3>
        <p className="text-gray-400 mb-8 max-w-xl mx-auto">
          {isAuthed
            ? 'Jump back into your workspace to see live agent activity and spend.'
            : 'Join teams using OppMon to manage their AI infrastructure with confidence.'}
        </p>
        <Link
          href={isAuthed ? '/dashboard' : '/register'}
          className="inline-block px-8 py-4 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          {isAuthed ? 'Open Dashboard' : 'Create Free Account'}
        </Link>
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 border-t border-gray-700">
        <div className="flex justify-between items-center">
          <p className="text-gray-400">OppMon - AI Agent Gateway Platform</p>
          <div className="flex gap-4">
            {isAuthed ? (
              <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm">
                Dashboard
              </Link>
            ) : (
              <Link href="/login" className="text-gray-400 hover:text-white text-sm">
                Sign In
              </Link>
            )}
            <Link href="/admin" className="text-gray-400 hover:text-white text-sm">
              Admin
            </Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
