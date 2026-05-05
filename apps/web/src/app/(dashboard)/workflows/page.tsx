'use client'

/**
 * Workflows Page
 *
 * Create and manage automation workflows.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Workflow {
  id: string
  name: string
  description?: string
  trigger: {
    type: string
    config: Record<string, unknown>
  }
  actions: Array<{
    type: string
    config: Record<string, unknown>
  }>
  active: boolean
  lastRun?: string
  runCount: number
  createdAt: string
  updatedAt: string
}

interface WorkflowsResponse {
  data: Workflow[]
  meta: {
    total: number
    limit: number
    offset: number
  }
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const limit = 10

  const fetchWorkflows = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      })

      const response = await fetch(`/api/workflows?${params}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to fetch workflows')

      const data: WorkflowsResponse = await response.json()
      setWorkflows(data.data || [])
      setTotal(data.meta?.total || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWorkflows()
  }, [page])

  const handleToggle = async (workflowId: string, active: boolean) => {
    try {
      const endpoint = active ? 'activate' : 'deactivate'
      const response = await fetch(`/api/workflows/${workflowId}/${endpoint}`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error(`Failed to ${endpoint} workflow`)
      fetchWorkflows()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update workflow')
    }
  }

  const handleRun = async (workflowId: string) => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}/run`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to run workflow')
      alert('Workflow triggered successfully')
      fetchWorkflows()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to run workflow')
    }
  }

  const handleDelete = async (workflowId: string) => {
    if (!confirm('Delete this workflow? This action cannot be undone.')) return

    try {
      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to delete workflow')
      fetchWorkflows()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete workflow')
    }
  }

  const getTriggerIcon = (type: string): string => {
    switch (type) {
      case 'schedule': return '🕐'
      case 'event': return '📡'
      case 'webhook': return '🔗'
      case 'threshold': return '📊'
      default: return '⚡'
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          <p className="text-gray-500">Automate tasks and responses</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Create Workflow
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Workflows Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading workflows...</div>
        </div>
      ) : workflows.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <span className="text-6xl block mb-4">⚡</span>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No workflows yet</h2>
          <p className="text-gray-500 mb-4">Create your first workflow to automate tasks</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Create Workflow
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map((workflow) => (
            <div key={workflow.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getTriggerIcon(workflow.trigger.type)}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">{workflow.name}</h3>
                    <p className="text-sm text-gray-500">{workflow.trigger.type} trigger</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle(workflow.id, !workflow.active)}
                  className={`px-3 py-1 text-xs rounded-full ${
                    workflow.active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {workflow.active ? 'Active' : 'Inactive'}
                </button>
              </div>

              {workflow.description && (
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{workflow.description}</p>
              )}

              <div className="text-sm text-gray-500 mb-4">
                <p>{workflow.actions.length} action{workflow.actions.length !== 1 ? 's' : ''}</p>
                <p>Run {workflow.runCount} times</p>
                {workflow.lastRun && (
                  <p>Last run: {new Date(workflow.lastRun).toLocaleString()}</p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-4 border-t">
                <button
                  onClick={() => handleRun(workflow.id)}
                  disabled={!workflow.active}
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
                >
                  Run Now
                </button>
                <Link
                  href={`/workflows/${workflow.id}`}
                  className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                >
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(workflow.id)}
                  className="px-3 py-1 text-sm text-red-600 hover:text-red-800 ml-auto"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
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

      {showCreateModal && (
        <CreateWorkflowModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchWorkflows() }}
        />
      )}
    </div>
  )
}

function CreateWorkflowModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [triggerType, setTriggerType] = useState('event')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          description: description || undefined,
          trigger: { type: triggerType, config: {} },
          actions: [],
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create workflow')
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
          <h2 className="text-lg font-semibold text-gray-900">Create Workflow</h2>
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
              placeholder="My Workflow"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Type</label>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
            >
              <option value="event">Event-based</option>
              <option value="schedule">Scheduled</option>
              <option value="webhook">Webhook</option>
              <option value="threshold">Threshold</option>
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
              {saving ? 'Creating...' : 'Create Workflow'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
