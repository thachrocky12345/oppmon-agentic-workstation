'use client'

/**
 * Agents List Page
 *
 * Manage AI agents with CRUD operations.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Agent {
  id: string
  name: string
  description?: string
  status: 'active' | 'inactive' | 'error'
  type: string
  model?: string
  lastSeen?: string
  totalEvents: number
  totalCost: number
  createdAt: string
  updatedAt: string
}

interface AgentsResponse {
  data: Agent[]
  meta: {
    total: number
    limit: number
    offset: number
  }
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const limit = 10

  const fetchAgents = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      })
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)

      const response = await fetch(`/api/agents?${params}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to fetch agents')

      const data: AgentsResponse = await response.json()
      setAgents(data.data || [])
      setTotal(data.meta?.total || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAgents()
  }, [page, search, statusFilter])

  const handleDelete = async (agentId: string) => {
    if (!confirm('Delete this agent? This action cannot be undone.')) return

    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to delete agent')
      fetchAgents()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete agent')
    }
  }

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'inactive': return 'bg-gray-100 text-gray-600'
      case 'error': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const formatCurrency = (n: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(n)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
          <p className="text-gray-500">Manage your AI agents</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Register Agent
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <input
          type="text"
          placeholder="Search agents..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0) }}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="error">Error</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Agents Table - Desktop */}
      <div className="bg-white rounded-lg shadow overflow-hidden hidden md:block">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Events</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Seen</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">Loading...</td>
              </tr>
            ) : agents.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  <div className="flex flex-col items-center">
                    <span className="text-4xl mb-2">🤖</span>
                    <p className="font-medium">No agents yet</p>
                    <p className="text-sm">Register your first AI agent to get started</p>
                  </div>
                </td>
              </tr>
            ) : (
              agents.map((agent) => (
                <tr key={agent.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link href={`/agents/${agent.id}`} className="text-blue-600 hover:text-blue-800 font-medium">
                      {agent.name}
                    </Link>
                    {agent.description && (
                      <p className="text-sm text-gray-500 truncate max-w-xs">{agent.description}</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(agent.status)}`}>
                      {agent.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{agent.type}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{agent.totalEvents.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatCurrency(agent.totalCost)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {agent.lastSeen ? new Date(agent.lastSeen).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/agents/${agent.id}`} className="text-blue-600 hover:text-blue-800 mr-4 text-sm">
                      View
                    </Link>
                    <button onClick={() => handleDelete(agent.id)} className="text-red-600 hover:text-red-800 text-sm">
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

      {/* Agents Cards - Mobile */}
      <div className="md:hidden space-y-4">
        {loading ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">Loading...</div>
        ) : agents.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <span className="text-4xl mb-2 block">🤖</span>
            <p className="font-medium text-gray-900">No agents yet</p>
            <p className="text-sm text-gray-500">Register your first AI agent</p>
          </div>
        ) : (
          agents.map((agent) => (
            <div key={agent.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-start justify-between">
                <div>
                  <Link href={`/agents/${agent.id}`} className="text-blue-600 hover:text-blue-800 font-medium">
                    {agent.name}
                  </Link>
                  {agent.description && (
                    <p className="text-sm text-gray-500 line-clamp-2">{agent.description}</p>
                  )}
                </div>
                <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(agent.status)}`}>
                  {agent.status}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Type:</span>
                  <span className="ml-1">{agent.type}</span>
                </div>
                <div>
                  <span className="text-gray-500">Events:</span>
                  <span className="ml-1">{agent.totalEvents}</span>
                </div>
                <div>
                  <span className="text-gray-500">Cost:</span>
                  <span className="ml-1">{formatCurrency(agent.totalCost)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t">
                <span className="text-xs text-gray-500">
                  Last seen: {agent.lastSeen ? new Date(agent.lastSeen).toLocaleString() : 'Never'}
                </span>
                <div className="flex gap-4">
                  <Link href={`/agents/${agent.id}`} className="text-blue-600 text-sm">View</Link>
                  <button onClick={() => handleDelete(agent.id)} className="text-red-600 text-sm">Delete</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchAgents() }}
        />
      )}
    </div>
  )
}

function CreateAgentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('claude-code')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          description: description || undefined,
          type,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create agent')
      }

      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Register Agent</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
              placeholder="My Agent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white resize-none"
              rows={3}
              placeholder="Optional description"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
            >
              <option value="claude-code">Claude Code</option>
              <option value="custom">Custom</option>
              <option value="langchain">LangChain</option>
              <option value="autogpt">AutoGPT</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
