'use client'

/**
 * Journal Page
 *
 * Agent journal entries and activity logs.
 */

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface JournalEntry {
  id: string
  agentId: string
  agentName: string
  type: 'task' | 'thought' | 'action' | 'result' | 'error'
  content: string
  metadata?: Record<string, unknown>
  tags: string[]
  createdAt: string
}

interface JournalResponse {
  data: JournalEntry[]
  meta: {
    total: number
    limit: number
    offset: number
  }
}

function JournalContent() {
  const searchParams = useSearchParams()
  const initialAgentId = searchParams.get('agentId') || ''

  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agentFilter, setAgentFilter] = useState(initialAgentId)
  const [typeFilter, setTypeFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const limit = 20

  const fetchEntries = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      })
      if (agentFilter) params.set('agentId', agentFilter)
      if (typeFilter) params.set('type', typeFilter)
      if (tagFilter) params.set('tag', tagFilter)

      const response = await fetch(`/api/journal/entries?${params}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to fetch journal entries')

      const data: JournalResponse = await response.json()
      setEntries(data.data || [])
      setTotal(data.meta?.total || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const fetchTags = async () => {
    try {
      const response = await fetch('/api/journal/tags', { credentials: 'include' })
      if (response.ok) {
        const data = await response.json()
        setTags(data.data || [])
      }
    } catch {
      // Ignore
    }
  }

  useEffect(() => {
    fetchEntries()
    fetchTags()
  }, [page, agentFilter, typeFilter, tagFilter])

  const getTypeColor = (type: string): string => {
    switch (type) {
      case 'task': return 'bg-blue-100 text-blue-800'
      case 'thought': return 'bg-purple-100 text-purple-800'
      case 'action': return 'bg-green-100 text-green-800'
      case 'result': return 'bg-yellow-100 text-yellow-800'
      case 'error': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getTypeIcon = (type: string): string => {
    switch (type) {
      case 'task': return '📋'
      case 'thought': return '💭'
      case 'action': return '⚡'
      case 'result': return '✅'
      case 'error': return '❌'
      default: return '📝'
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Journal</h1>
          <p className="text-gray-500">Agent activity and thought logs</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <input
          type="text"
          placeholder="Filter by Agent ID"
          value={agentFilter}
          onChange={(e) => { setAgentFilter(e.target.value); setPage(0) }}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
        />
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(0) }}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
        >
          <option value="">All Types</option>
          <option value="task">Task</option>
          <option value="thought">Thought</option>
          <option value="action">Action</option>
          <option value="result">Result</option>
          <option value="error">Error</option>
        </select>
        {tags.length > 0 && (
          <select
            value={tagFilter}
            onChange={(e) => { setTagFilter(e.target.value); setPage(0) }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
          >
            <option value="">All Tags</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Journal Entries */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading journal entries...</div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center">
            <span className="text-6xl block mb-4">📓</span>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No journal entries</h2>
            <p className="text-gray-500">Journal entries will appear as agents execute tasks</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedEntry(entry)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl">{getTypeIcon(entry.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-xs rounded ${getTypeColor(entry.type)}`}>
                        {entry.type}
                      </span>
                      <Link
                        href={`/agents/${entry.agentId}`}
                        className="text-xs text-blue-600 hover:text-blue-800"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {entry.agentName}
                      </Link>
                      <span className="text-xs text-gray-400">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900 line-clamp-2">{entry.content}</p>
                    {entry.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {entry.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
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

      {/* Entry Detail Modal */}
      {selectedEntry && (
        <EntryDetailModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  )
}

function EntryDetailModal({
  entry,
  onClose,
}: {
  entry: JournalEntry
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <span className="text-xl">{entry.type === 'task' ? '📋' : entry.type === 'thought' ? '💭' : entry.type === 'action' ? '⚡' : entry.type === 'result' ? '✅' : '❌'}</span>
            <h2 className="text-lg font-semibold text-gray-900">{entry.type.charAt(0).toUpperCase() + entry.type.slice(1)} Entry</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="p-6 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <span className="text-sm text-gray-500">Agent</span>
              <p className="font-medium text-gray-900">{entry.agentName}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Timestamp</span>
              <p className="font-medium text-gray-900">{new Date(entry.createdAt).toLocaleString()}</p>
            </div>
          </div>

          <div className="mb-4">
            <span className="text-sm text-gray-500">Content</span>
            <div className="mt-1 p-4 bg-gray-50 rounded-lg">
              <p className="whitespace-pre-wrap text-gray-900">{entry.content}</p>
            </div>
          </div>

          {entry.tags.length > 0 && (
            <div className="mb-4">
              <span className="text-sm text-gray-500">Tags</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {entry.tags.map((tag) => (
                  <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <div>
              <span className="text-sm text-gray-500">Metadata</span>
              <pre className="mt-1 p-4 bg-gray-100 rounded-lg overflow-x-auto text-sm font-mono">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </div>
          )}
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

export default function JournalPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="text-gray-500">Loading...</div></div>}>
      <JournalContent />
    </Suspense>
  )
}
