'use client'

/**
 * Agent Detail Page
 *
 * View and manage individual agent with stats and configuration.
 */

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Agent {
  id: string
  name: string
  description?: string
  status: 'active' | 'inactive' | 'error'
  type: string
  model?: string
  config?: Record<string, unknown>
  lastSeen?: string
  totalEvents: number
  totalCost: number
  createdAt: string
  updatedAt: string
}

interface AgentStats {
  eventsToday: number
  eventsTrend: number[]
  costToday: number
  costTrend: number[]
  errorRate: number
  avgResponseTime: number
}

export default function AgentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const agentId = params.id as string

  const [agent, setAgent] = useState<Agent | null>(null)
  const [stats, setStats] = useState<AgentStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit mode
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [agentRes, statsRes] = await Promise.all([
          fetch(`/api/agents/${agentId}`, { credentials: 'include' }),
          fetch(`/api/dashboard/agent/${agentId}`, { credentials: 'include' }),
        ])

        if (!agentRes.ok) throw new Error('Agent not found')

        const agentData = await agentRes.json()
        setAgent(agentData.data)
        setEditName(agentData.data.name)
        setEditDescription(agentData.data.description || '')

        if (statsRes.ok) {
          const statsData = await statsRes.json()
          setStats(statsData.data)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load agent')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [agentId])

  const handleSave = async () => {
    setSaving(true)
    setEditError(null)

    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: editName,
          description: editDescription || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update agent')
      }

      const data = await response.json()
      setAgent(data.data)
      setIsEditing(false)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this agent? This action cannot be undone.')) return

    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to delete agent')
      router.push('/agents')
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
    }).format(n)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading agent...</div>
      </div>
    )
  }

  if (error || !agent) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error || 'Agent not found'}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/agents" className="text-blue-600 hover:text-blue-800 text-sm">
          ← Back to Agents
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-2xl">🤖</span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{agent.name}</h1>
                  <p className="text-gray-500">{agent.description || 'No description'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 text-sm rounded-full ${getStatusColor(agent.status)}`}>
                  {agent.status}
                </span>
                {!isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-4 border-t pt-4">
                {editError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {editError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white resize-none"
                    rows={3}
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setIsEditing(false)
                      setEditName(agent.name)
                      setEditDescription(agent.description || '')
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div>
                  <span className="text-sm text-gray-500">Type</span>
                  <p className="font-medium text-gray-900">{agent.type}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Model</span>
                  <p className="font-medium text-gray-900">{agent.model || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Last Seen</span>
                  <p className="font-medium text-gray-900">
                    {agent.lastSeen ? new Date(agent.lastSeen).toLocaleString() : 'Never'}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Created</span>
                  <p className="font-medium text-gray-900">{new Date(agent.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Events Today</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.eventsToday || 0}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Cost Today</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats?.costToday || 0)}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Error Rate</p>
              <p className="text-2xl font-bold text-gray-900">{((stats?.errorRate || 0) * 100).toFixed(1)}%</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Avg Response</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.avgResponseTime || 0}ms</p>
            </div>
          </div>

          {/* Total Stats */}
          <div className="mt-6 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Lifetime Statistics</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-gray-500">Total Events</span>
                <p className="text-xl font-bold text-gray-900">{agent.totalEvents.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Total Cost</span>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(agent.totalCost)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
            <div className="space-y-2">
              <Link
                href={`/events?agentId=${agent.id}`}
                className="block w-full px-4 py-2 text-left border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                View Events
              </Link>
              <Link
                href={`/journal?agentId=${agent.id}`}
                className="block w-full px-4 py-2 text-left border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                View Journal
              </Link>
              <button
                onClick={handleDelete}
                className="w-full px-4 py-2 text-left border border-red-300 rounded-lg text-red-700 hover:bg-red-50"
              >
                Delete Agent
              </button>
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-500">ID</dt>
                <dd className="font-mono text-gray-900">{agent.id}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Created</dt>
                <dd className="text-gray-900">{new Date(agent.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Updated</dt>
                <dd className="text-gray-900">{new Date(agent.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
