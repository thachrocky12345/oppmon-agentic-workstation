// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

/**
 * MCP Server Registry Page
 *
 * List all MCP servers with search, filter, toggle, and CRUD operations.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { CreateMcpModal } from './CreateMcpModal'

interface McpServer {
  id: string
  name: string
  description?: string
  command: string
  args: string[]
  env: Record<string, string>
  scope: 'TENANT' | 'TEAM'
  teamId?: string
  version: string
  enabled: boolean
  sha256: string
  createdAt: string
  updatedAt: string
}

interface McpResponse {
  data: McpServer[]
  meta: {
    total: number
    limit: number
    offset: number
  }
}

export default function McpServersPage() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [scopeFilter, setScopeFilter] = useState<string>('')
  const [enabledFilter, setEnabledFilter] = useState<string>('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const limit = 10

  const fetchServers = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      })
      if (search) params.set('search', search)
      if (scopeFilter) params.set('scope', scopeFilter)
      if (enabledFilter) params.set('enabled', enabledFilter)

      const response = await fetch(`/api/admin/mcp?${params}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to fetch MCP servers')

      const data: McpResponse = await response.json()
      setServers(data.data)
      setTotal(data.meta.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchServers()
  }, [page, search, scopeFilter, enabledFilter])

  const handleToggle = async (serverId: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/admin/mcp/${serverId}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled }),
      })

      if (!response.ok) throw new Error('Failed to toggle server')
      fetchServers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to toggle server')
    }
  }

  const handleBulkToggle = async (enabled: boolean) => {
    if (selectedIds.size === 0) return
    if (!confirm(`${enabled ? 'Enable' : 'Disable'} ${selectedIds.size} selected servers?`)) return

    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          fetch(`/api/admin/mcp/${id}/toggle`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ enabled }),
          })
        )
      )
      setSelectedIds(new Set())
      fetchServers()
    } catch (err) {
      alert('Some toggles failed')
    }
  }

  const handleDelete = async (serverId: string) => {
    if (!confirm('Archive this MCP server? It will no longer be synced to clients.')) return

    try {
      const response = await fetch(`/api/admin/mcp/${serverId}`, { method: 'DELETE', credentials: 'include' })
      if (!response.ok) throw new Error('Failed to delete server')
      fetchServers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete server')
    }
  }

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) newSelected.delete(id)
    else newSelected.add(id)
    setSelectedIds(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === servers.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(servers.map(s => s.id)))
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">MCP Server Registry</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Add Server
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <input
          type="text"
          placeholder="Search servers..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
        />
        <select
          value={scopeFilter}
          onChange={(e) => { setScopeFilter(e.target.value); setPage(0) }}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
        >
          <option value="">All Scopes</option>
          <option value="TENANT">Tenant</option>
          <option value="TEAM">Team</option>
        </select>
        <select
          value={enabledFilter}
          onChange={(e) => { setEnabledFilter(e.target.value); setPage(0) }}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
        >
          <option value="">All Status</option>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-center gap-4">
          <span className="text-blue-800">{selectedIds.size} selected</span>
          <button onClick={() => handleBulkToggle(true)} className="px-3 py-1 bg-green-600 text-white rounded text-sm">
            Enable All
          </button>
          <button onClick={() => handleBulkToggle(false)} className="px-3 py-1 bg-gray-600 text-white rounded text-sm">
            Disable All
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-blue-600 text-sm">
            Clear Selection
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">{error}</div>
      )}

      {/* Servers - Desktop Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden hidden md:block">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.size === servers.length && servers.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Command</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scope</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading...</td>
              </tr>
            ) : servers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  <div className="flex flex-col items-center">
                    <span className="text-4xl mb-2">🔌</span>
                    <p className="font-medium">No MCP servers yet</p>
                    <p className="text-sm">Add your first MCP server to get started</p>
                  </div>
                </td>
              </tr>
            ) : (
              servers.map((server) => (
                <tr key={server.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(server.id)}
                      onChange={() => toggleSelect(server.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/admin/mcp/${server.id}`} className="text-blue-600 hover:text-blue-800 font-medium">
                      {server.name}
                    </Link>
                    {server.description && (
                      <p className="text-sm text-gray-500 truncate max-w-xs">{server.description}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 font-mono text-sm text-gray-600">
                    {server.command} {server.args.slice(0, 2).join(' ')}
                    {server.args.length > 2 && '...'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded ${
                      server.scope === 'TENANT' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {server.scope}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggle(server.id, !server.enabled)}
                      className={`px-3 py-1 text-xs rounded-full ${
                        server.enabled
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {server.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/admin/mcp/${server.id}`} className="text-blue-600 hover:text-blue-800 mr-4 text-sm">
                      Edit
                    </Link>
                    <button onClick={() => handleDelete(server.id)} className="text-red-600 hover:text-red-800 text-sm">
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="bg-gray-50 px-6 py-3 flex items-center justify-between border-t">
            <div className="text-sm text-gray-500">
              Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total}
            </div>
            <div className="flex space-x-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 border rounded text-sm disabled:opacity-50">
                Previous
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1 border rounded text-sm disabled:opacity-50">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Servers - Mobile Card View */}
      <div className="md:hidden space-y-4">
        {loading ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">Loading...</div>
        ) : servers.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <span className="text-4xl mb-2 block">🔌</span>
            <p className="font-medium text-gray-900">No MCP servers yet</p>
            <p className="text-sm text-gray-500">Add your first MCP server to get started</p>
          </div>
        ) : (
          <>
            {servers.map((server) => (
              <div key={server.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(server.id)}
                      onChange={() => toggleSelect(server.id)}
                      className="rounded mt-1"
                    />
                    <div>
                      <Link href={`/admin/mcp/${server.id}`} className="text-blue-600 hover:text-blue-800 font-medium">
                        {server.name}
                      </Link>
                      {server.description && (
                        <p className="text-sm text-gray-500 line-clamp-2">{server.description}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggle(server.id, !server.enabled)}
                    className={`px-3 py-1 text-xs rounded-full flex-shrink-0 ${
                      server.enabled
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {server.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                <div className="mt-2 text-sm font-mono text-gray-600 truncate">
                  {server.command} {server.args.slice(0, 2).join(' ')}
                  {server.args.length > 2 && '...'}
                </div>
                <div className="flex items-center gap-4 mt-3 text-sm">
                  <span className={`px-2 py-1 text-xs rounded ${
                    server.scope === 'TENANT' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {server.scope}
                  </span>
                  <div className="flex-1" />
                  <Link href={`/admin/mcp/${server.id}`} className="text-blue-600 hover:text-blue-800 text-sm">
                    Edit
                  </Link>
                  <button onClick={() => handleDelete(server.id)} className="text-red-600 hover:text-red-800 text-sm">
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {totalPages > 1 && (
              <div className="flex items-center justify-between py-2">
                <div className="text-sm text-gray-500">
                  {page * limit + 1}-{Math.min((page + 1) * limit, total)} of {total}
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreateModal && (
        <CreateMcpModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchServers() }}
        />
      )}
    </div>
  )
}
