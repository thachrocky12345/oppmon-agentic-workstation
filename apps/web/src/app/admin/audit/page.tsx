// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

/**
 * Audit Log Page
 *
 * View and filter audit log entries.
 */

import { useState, useEffect } from 'react'

interface AuditEntry {
  id: string
  action: string
  resourceType: string
  resourceId: string
  actorId: string
  actorEmail?: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  metadata?: Record<string, unknown>
  createdAt: string
}

interface AuditResponse {
  data: AuditEntry[]
  meta: {
    total: number
    limit: number
    offset: number
  }
}

const RESOURCE_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'team', label: 'Team' },
  { value: 'user', label: 'User' },
  { value: 'skill', label: 'Skill' },
  { value: 'mcp', label: 'MCP Server' },
  { value: 'agent', label: 'Agent' },
]

const ACTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
]

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [resourceType, setResourceType] = useState('')
  const [action, setAction] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Pagination
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const limit = 20

  // Selected entry for detail view
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null)

  const fetchAuditLog = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      })

      if (resourceType) params.set('resourceType', resourceType)
      if (action) params.set('action', action)
      if (startDate) params.set('startDate', new Date(startDate).toISOString())
      if (endDate) params.set('endDate', new Date(endDate).toISOString())

      const response = await fetch(`/api/admin/audit?${params}`, { credentials: 'include' })
      if (!response.ok) {
        throw new Error('Failed to fetch audit log')
      }

      const data: AuditResponse = await response.json()
      setEntries(data.data)
      setTotal(data.meta.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAuditLog()
  }, [page, resourceType, action, startDate, endDate])

  const getActionColor = (action: string): string => {
    switch (action.toLowerCase()) {
      case 'create':
        return 'bg-green-100 text-green-800'
      case 'update':
        return 'bg-blue-100 text-blue-800'
      case 'delete':
        return 'bg-red-100 text-red-800'
      case 'login':
        return 'bg-purple-100 text-purple-800'
      case 'logout':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Audit Log</h1>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Resource Type
            </label>
            <select
              value={resourceType}
              onChange={(e) => {
                setResourceType(e.target.value)
                setPage(0)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              {RESOURCE_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Action
            </label>
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value)
                setPage(0)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              {ACTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                setPage(0)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value)
                setPage(0)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Audit Log Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Timestamp
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Resource
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actor
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No audit entries found
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${getActionColor(entry.action)}`}>
                      {entry.action.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="font-medium text-gray-900">{entry.resourceType}</span>
                    <span className="text-gray-500 ml-1">#{entry.resourceId.slice(0, 8)}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {entry.actorEmail || entry.actorId.slice(0, 8)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => setSelectedEntry(entry)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-gray-50 px-6 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="text-sm text-gray-500">
              Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedEntry && (
        <AuditDetailModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  )
}

function AuditDetailModal({
  entry,
  onClose,
}: {
  entry: AuditEntry
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Audit Entry Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-500">Action</label>
              <p className="text-gray-900">{entry.action}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">Timestamp</label>
              <p className="text-gray-900">{new Date(entry.createdAt).toLocaleString()}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">Resource Type</label>
              <p className="text-gray-900">{entry.resourceType}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">Resource ID</label>
              <p className="text-gray-900 font-mono text-sm">{entry.resourceId}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">Actor</label>
              <p className="text-gray-900">{entry.actorEmail || entry.actorId}</p>
            </div>
          </div>

          {entry.before && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-500 mb-2">Before</label>
              <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono">
                {JSON.stringify(entry.before, null, 2)}
              </pre>
            </div>
          )}

          {entry.after && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-500 mb-2">After</label>
              <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono">
                {JSON.stringify(entry.after, null, 2)}
              </pre>
            </div>
          )}

          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-2">Metadata</label>
              <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
