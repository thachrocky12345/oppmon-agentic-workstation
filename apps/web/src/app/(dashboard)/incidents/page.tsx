// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

/**
 * Incidents Page
 *
 * Incident management and tracking.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Incident {
  id: string
  title: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'investigating' | 'identified' | 'monitoring' | 'resolved'
  agentId?: string
  agentName?: string
  assignee?: string
  createdAt: string
  updatedAt: string
  resolvedAt?: string
}

interface IncidentUpdate {
  id: string
  message: string
  status?: string
  createdAt: string
  createdBy: string
}

interface IncidentsResponse {
  data: Incident[]
  meta: {
    total: number
    limit: number
    offset: number
  }
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const limit = 10

  const fetchIncidents = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      })
      if (statusFilter) params.set('status', statusFilter)
      if (severityFilter) params.set('severity', severityFilter)

      const response = await fetch(`/api/incidents?${params}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to fetch incidents')

      const data: IncidentsResponse = await response.json()
      setIncidents(data.data || [])
      setTotal(data.meta?.total || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchIncidents()
  }, [page, statusFilter, severityFilter])

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800'
      case 'high': return 'bg-orange-100 text-orange-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-blue-100 text-blue-800'
    }
  }

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'resolved': return 'bg-green-100 text-green-800'
      case 'monitoring': return 'bg-blue-100 text-blue-800'
      case 'identified': return 'bg-purple-100 text-purple-800'
      case 'investigating': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-red-100 text-red-800'
    }
  }

  const totalPages = Math.ceil(total / limit)
  const openCount = incidents.filter(i => i.status !== 'resolved').length

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incidents</h1>
          <p className="text-gray-500">{openCount} open incident{openCount !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Report Incident
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0) }}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
        >
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="identified">Identified</option>
          <option value="monitoring">Monitoring</option>
          <option value="resolved">Resolved</option>
        </select>
        <select
          value={severityFilter}
          onChange={(e) => { setSeverityFilter(e.target.value); setPage(0) }}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Incidents List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading incidents...</div>
        ) : incidents.length === 0 ? (
          <div className="p-12 text-center">
            <span className="text-6xl block mb-4">✅</span>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No incidents</h2>
            <p className="text-gray-500">All systems operating normally</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {incidents.map((incident) => (
              <div
                key={incident.id}
                className="p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedIncident(incident)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-xs rounded ${getSeverityColor(incident.severity)}`}>
                        {incident.severity.toUpperCase()}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded ${getStatusColor(incident.status)}`}>
                        {incident.status}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900">{incident.title}</h3>
                    <p className="text-sm text-gray-500 line-clamp-2 mt-1">{incident.description}</p>
                    {incident.agentName && (
                      <p className="text-xs text-gray-400 mt-1">Agent: {incident.agentName}</p>
                    )}
                  </div>
                  <div className="text-right text-xs text-gray-500 ml-4">
                    <p>{new Date(incident.createdAt).toLocaleDateString()}</p>
                    <p>{new Date(incident.createdAt).toLocaleTimeString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

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

      {showCreateModal && (
        <CreateIncidentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchIncidents() }}
        />
      )}

      {selectedIncident && (
        <IncidentDetailModal
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
          onUpdated={fetchIncidents}
        />
      )}
    </div>
  )
}

function CreateIncidentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title, description, severity }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create incident')
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
          <h2 className="text-lg font-semibold text-gray-900">Report Incident</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
              placeholder="Brief description of the incident"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white resize-none"
              rows={4}
              placeholder="Detailed description of the incident"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as typeof severity)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title || !description}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Incident'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function IncidentDetailModal({
  incident,
  onClose,
  onUpdated,
}: {
  incident: Incident
  onClose: () => void
  onUpdated: () => void
}) {
  const [updates, setUpdates] = useState<IncidentUpdate[]>([])
  const [newUpdate, setNewUpdate] = useState('')
  const [newStatus, setNewStatus] = useState(incident.status)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fetchUpdates = async () => {
      try {
        const response = await fetch(`/api/incidents/${incident.id}/updates`, { credentials: 'include' })
        if (response.ok) {
          const data = await response.json()
          setUpdates(data.data || [])
        }
      } catch {
        // Ignore
      }
    }
    fetchUpdates()
  }, [incident.id])

  const handleAddUpdate = async () => {
    if (!newUpdate.trim()) return
    setSaving(true)

    try {
      const response = await fetch(`/api/incidents/${incident.id}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: newUpdate, status: newStatus }),
      })

      if (!response.ok) throw new Error('Failed to add update')

      setNewUpdate('')
      onUpdated()

      // Refresh updates
      const updatesRes = await fetch(`/api/incidents/${incident.id}/updates`, { credentials: 'include' })
      if (updatesRes.ok) {
        const data = await updatesRes.json()
        setUpdates(data.data || [])
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add update')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">{incident.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <p className="text-gray-600 mb-4">{incident.description}</p>

          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div>
              <span className="text-gray-500">Status:</span>
              <span className="ml-2 font-medium">{incident.status}</span>
            </div>
            <div>
              <span className="text-gray-500">Severity:</span>
              <span className="ml-2 font-medium">{incident.severity}</span>
            </div>
            <div>
              <span className="text-gray-500">Created:</span>
              <span className="ml-2">{new Date(incident.createdAt).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-gray-500">Updated:</span>
              <span className="ml-2">{new Date(incident.updatedAt).toLocaleString()}</span>
            </div>
          </div>

          <h3 className="font-semibold text-gray-900 mb-3">Updates</h3>
          <div className="space-y-3 mb-4">
            {updates.length === 0 ? (
              <p className="text-gray-500 text-sm">No updates yet</p>
            ) : (
              updates.map((update) => (
                <div key={update.id} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm">{update.message}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {update.createdBy} • {new Date(update.createdAt).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Add Update</h4>
            <textarea
              value={newUpdate}
              onChange={(e) => setNewUpdate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white resize-none"
              rows={2}
              placeholder="Update message..."
            />
            <div className="flex items-center gap-2 mt-2">
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as typeof newStatus)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
              >
                <option value="open">Open</option>
                <option value="investigating">Investigating</option>
                <option value="identified">Identified</option>
                <option value="monitoring">Monitoring</option>
                <option value="resolved">Resolved</option>
              </select>
              <button
                onClick={handleAddUpdate}
                disabled={saving || !newUpdate.trim()}
                className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Adding...' : 'Add Update'}
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
