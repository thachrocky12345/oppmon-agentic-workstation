'use client'

import Link from 'next/link'

export default function TeamsAdminPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-medium mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
          Admin Guide · Teams
        </div>
        <h1 className="text-5xl font-bold text-white mb-4">Coming soon!</h1>
        <p className="text-gray-400 mb-8">
          The Teams admin tutorial is on its way.
        </p>
        <Link
          href="/docs/admin"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg font-medium transition-colors"
        >
          ← Back to Admin Guide
        </Link>
      </div>
    </div>
  )
}
