// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

/**
 * Events Stream Page
 *
 * Real-time event monitoring and management.
 */

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface Event {
  id: string
  type: string
  level: 'info' | 'warning' | 'error' | 'critical'
  message: string
  agentId?: string
  agentName?: string
  metadata?: Record<string, unknown>
  dismissed: boolean
  createdAt: string
}

interface EventsResponse {
  data: Event[]
  meta: {
    total: number
    limit: number
    offset: number
  }
}

function EventsContent() {
  const searchParams = useSearchParams()
  const initialAgentId = searchParams.get('agentId') || ''

  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [levelFilter, setLevelFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [agentFilter, setAgentFilter] = useState(initialAgentId)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const limit = 20

  const fetchEvents = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      })
      if (levelFilter) params.set('level', levelFilter)
      if (typeFilter) params.set('type', typeFilter)
      if (agentFilter) params.set('agentId', agentFilter)

      const response = await fetch(`/api/events?${params}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to fetch events')

      const data: EventsResponse = await response.json()
      setEvents(data.data || [])
      setTotal(data.meta?.total || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEvents()
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchEvents, 10000)
    return () => clearInterval(interval)
  }, [page, levelFilter, typeFilter, agentFilter])

  const handleDismiss = async (eventId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/dismiss`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to dismiss event')
      fetchEvents()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to dismiss event')
    }
  }

  const getLevelColor = (level: string): string => {
    switch (level) {
      case 'critical': return 'bg-red-100 text-red-800 border-l-4 border-l-red-500'
      case 'error': return 'bg-red-50 text-red-700 border-l-4 border-l-red-400'
      case 'warning': return 'bg-yellow-50 text-yellow-700 border-l-4 border-l-yellow-400'
      default: return 'bg-gray-50 text-gray-700 border-l-4 border-l-gray-300'
    }
  }

  const getLevelBadge = (level: string): string => {
    switch (level) {
      case 'critical': return 'bg-red-600 text-white'
      case 'error': return 'bg-red-500 text-white'
      case 'warning': return 'bg-yellow-500 text-white'
      default: return 'bg-gray-400 text-white'
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Events</h1>
          <p className="text-gray-500">Real-time event stream and monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <span className="text-sm text-gray-500">Live</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <select
          value={levelFilter}
          onChange={(e) => { setLevelFilter(e.target.value); setPage(0) }}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
        >
          <option value="">All Levels</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
          <option value="critical">Critical</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(0) }}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
        >
          <option value="">All Types</option>
          <option value="agent_start">Agent Start</option>
          <option value="agent_stop">Agent Stop</option>
          <option value="llm_request">LLM Request</option>
          <option value="tool_call">Tool Call</option>
          <option value="error">Error</option>
          <option value="security">Security</option>
        </select>
        <input
          type="text"
          placeholder="Filter by Agent ID"
          value={agentFilter}
          onChange={(e) => { setAgentFilter(e.target.value); setPage(0) }}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Events List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading && events.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Loading events...</div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <span className="text-4xl block mb-2">📡</span>
            <p className="font-medium">No events found</p>
            <p className="text-sm">Events will appear here as they occur</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {events.map((event) => (
              <div
                key={event.id}
                className={`p-4 hover:bg-gray-50 ${event.dismissed ? 'opacity-50' : ''} ${getLevelColor(event.level)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-xs rounded ${getLevelBadge(event.level)}`}>
                        {event.level.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500">{event.type}</span>
                      {event.agentName && (
                        <Link
                          href={`/agents/${event.agentId}`}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          {event.agentName}
                        </Link>
                      )}
                    </div>
                    <p className="text-sm text-gray-900">{event.message}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {new Date(event.createdAt).toLocaleTimeString()}
                    </span>
                    <button
                      onClick={() => setSelectedEvent(event)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Details
                    </button>
                    {!event.dismissed && (
                      <button
                        onClick={() => handleDismiss(event.id)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Dismiss
                      </button>
                    )}
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

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  )
}

function EventDetailModal({
  event,
  onClose,
}: {
  event: Event
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Event Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="p-6 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-500">Level</label>
              <p className="text-gray-900">{event.level}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">Type</label>
              <p className="text-gray-900">{event.type}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">Timestamp</label>
              <p className="text-gray-900">{new Date(event.createdAt).toLocaleString()}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500">Agent</label>
              <p className="text-gray-900">{event.agentName || event.agentId || 'N/A'}</p>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-500 mb-2">Message</label>
            <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">{event.message}</p>
          </div>

          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-2">Metadata</label>
              <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t bg-gray-50">
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

export default function EventsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="text-gray-500">Loading...</div></div>}>
      <EventsContent />
    </Suspense>
  )
}
