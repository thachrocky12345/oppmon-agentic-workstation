/**
 * Admin Dashboard
 *
 * Overview page for admin section.
 */

import Link from 'next/link'

export default function AdminPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Admin Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Teams Card */}
        <Link
          href="/admin/teams"
          className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Teams</h2>
            <span className="text-2xl">👥</span>
          </div>
          <p className="text-gray-600 text-sm">
            Manage teams, add members, and configure team settings.
          </p>
        </Link>

        {/* Audit Log Card */}
        <Link
          href="/admin/audit"
          className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Audit Log</h2>
            <span className="text-2xl">📋</span>
          </div>
          <p className="text-gray-600 text-sm">
            View activity logs and track changes across the system.
          </p>
        </Link>

        {/* Settings Card */}
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
    </div>
  )
}
