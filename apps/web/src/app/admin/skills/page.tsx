'use client'

/**
 * Skills Registry Page
 *
 * List all skills with search, filter, toggle, and CRUD operations.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { CreateSkillModal } from './CreateSkillModal'

interface Skill {
  id: string
  name: string
  description?: string
  scope: 'TENANT' | 'TEAM'
  teamId?: string
  version: number
  enabled: boolean
  sha256: string
  createdAt: string
  updatedAt: string
}

interface SkillsResponse {
  data: Skill[]
  meta: {
    total: number
    limit: number
    offset: number
  }
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [scopeFilter, setScopeFilter] = useState<string>('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const limit = 10

  const fetchSkills = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      })
      if (search) params.set('search', search)
      if (scopeFilter) params.set('scope', scopeFilter)

      const response = await fetch(`/api/admin/skills?${params}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to fetch skills')

      const data: SkillsResponse = await response.json()
      setSkills(data.data)
      setTotal(data.meta.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSkills()
  }, [page, search, scopeFilter])

  const handleToggle = async (skillId: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/admin/skills/${skillId}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled }),
      })

      if (!response.ok) throw new Error('Failed to toggle skill')
      fetchSkills()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to toggle skill')
    }
  }

  const handleBulkToggle = async (enabled: boolean) => {
    if (selectedIds.size === 0) return
    if (!confirm(`${enabled ? 'Enable' : 'Disable'} ${selectedIds.size} selected skills?`)) return

    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          fetch(`/api/admin/skills/${id}/toggle`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ enabled }),
          })
        )
      )
      setSelectedIds(new Set())
      fetchSkills()
    } catch (err) {
      alert('Some toggles failed')
    }
  }

  const handleDelete = async (skillId: string) => {
    if (!confirm('Archive this skill? It will no longer be synced to clients.')) return

    try {
      const response = await fetch(`/api/admin/skills/${skillId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to delete skill')
      fetchSkills()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete skill')
    }
  }

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === skills.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(skills.map(s => s.id)))
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Skills Registry</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Create Skill
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <input
          type="text"
          placeholder="Search skills..."
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
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-center gap-4">
          <span className="text-blue-800">{selectedIds.size} selected</span>
          <button
            onClick={() => handleBulkToggle(true)}
            className="px-3 py-1 bg-green-600 text-white rounded text-sm"
          >
            Enable All
          </button>
          <button
            onClick={() => handleBulkToggle(false)}
            className="px-3 py-1 bg-gray-600 text-white rounded text-sm"
          >
            Disable All
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-blue-600 text-sm"
          >
            Clear Selection
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Skills - Desktop Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden hidden md:block">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.size === skills.length && skills.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scope</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading...</td>
              </tr>
            ) : skills.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  <div className="flex flex-col items-center">
                    <span className="text-4xl mb-2">📦</span>
                    <p className="font-medium">No skills yet</p>
                    <p className="text-sm">Create your first skill to get started</p>
                  </div>
                </td>
              </tr>
            ) : (
              skills.map((skill) => (
                <tr key={skill.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(skill.id)}
                      onChange={() => toggleSelect(skill.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/admin/skills/${skill.id}`} className="text-blue-600 hover:text-blue-800 font-medium">
                      {skill.name}
                    </Link>
                    {skill.description && (
                      <p className="text-sm text-gray-500 truncate max-w-xs">{skill.description}</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded ${
                      skill.scope === 'TENANT' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {skill.scope}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">v{skill.version}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggle(skill.id, !skill.enabled)}
                      className={`px-3 py-1 text-xs rounded-full ${
                        skill.enabled
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {skill.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/admin/skills/${skill.id}`} className="text-blue-600 hover:text-blue-800 mr-4 text-sm">
                      Edit
                    </Link>
                    <button onClick={() => handleDelete(skill.id)} className="text-red-600 hover:text-red-800 text-sm">
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
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                Previous
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
      </div>

      {/* Skills - Mobile Card View */}
      <div className="md:hidden space-y-4">
        {loading ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">Loading...</div>
        ) : skills.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <span className="text-4xl mb-2 block">📦</span>
            <p className="font-medium text-gray-900">No skills yet</p>
            <p className="text-sm text-gray-500">Create your first skill to get started</p>
          </div>
        ) : (
          <>
            {skills.map((skill) => (
              <div key={skill.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(skill.id)}
                      onChange={() => toggleSelect(skill.id)}
                      className="rounded mt-1"
                    />
                    <div>
                      <Link href={`/admin/skills/${skill.id}`} className="text-blue-600 hover:text-blue-800 font-medium">
                        {skill.name}
                      </Link>
                      {skill.description && (
                        <p className="text-sm text-gray-500 line-clamp-2">{skill.description}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggle(skill.id, !skill.enabled)}
                    className={`px-3 py-1 text-xs rounded-full flex-shrink-0 ${
                      skill.enabled
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {skill.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                <div className="flex items-center gap-4 mt-3 text-sm">
                  <span className={`px-2 py-1 text-xs rounded ${
                    skill.scope === 'TENANT' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {skill.scope}
                  </span>
                  <span className="text-gray-500">v{skill.version}</span>
                  <div className="flex-1" />
                  <Link href={`/admin/skills/${skill.id}`} className="text-blue-600 hover:text-blue-800 text-sm">
                    Edit
                  </Link>
                  <button onClick={() => handleDelete(skill.id)} className="text-red-600 hover:text-red-800 text-sm">
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
        <CreateSkillModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchSkills() }}
        />
      )}
    </div>
  )
}
