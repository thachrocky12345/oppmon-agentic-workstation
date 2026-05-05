'use client'

/**
 * Skill Detail Page
 *
 * View and edit skill with version history and audit timeline.
 */

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Skill {
  id: string
  name: string
  description?: string
  content: string
  scope: 'TENANT' | 'TEAM'
  teamId?: string
  version: number
  enabled: boolean
  sha256: string
  createdAt: string
  updatedAt: string
}

interface SkillVersion {
  version: number
  sha256: string
  createdAt: string
  createdBy?: string
}

export default function SkillDetailPage() {
  const params = useParams()
  const router = useRouter()
  const skillId = params.id as string

  const [skill, setSkill] = useState<Skill | null>(null)
  const [versions, setVersions] = useState<SkillVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit state
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editScope, setEditScope] = useState<'TENANT' | 'TEAM'>('TENANT')
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Version comparison
  const [compareVersion, setCompareVersion] = useState<number | null>(null)
  const [compareContent, setCompareContent] = useState<string | null>(null)

  const fetchSkill = async () => {
    try {
      const response = await fetch(`/api/admin/skills/${skillId}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to fetch skill')
      const data = await response.json()
      setSkill(data.data)
      setEditName(data.data.name)
      setEditDescription(data.data.description || '')
      setEditContent(data.data.content)
      setEditScope(data.data.scope)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const fetchVersions = async () => {
    try {
      const response = await fetch(`/api/admin/skills/${skillId}/versions`, { credentials: 'include' })
      if (!response.ok) return
      const data = await response.json()
      setVersions(data.data || [])
    } catch {
      // Versions are optional
    }
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchSkill(), fetchVersions()]).finally(() => setLoading(false))
  }, [skillId])

  const handleSave = async () => {
    setSaving(true)
    setEditErrors({})

    try {
      const response = await fetch(`/api/admin/skills/${skillId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: editName,
          description: editDescription || undefined,
          content: editContent,
          scope: editScope,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update skill')
      }

      const data = await response.json()
      setSkill(data.data)
      setIsEditing(false)
      fetchVersions()
    } catch (err) {
      setEditErrors({ server: err instanceof Error ? err.message : 'An error occurred' })
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async () => {
    if (!skill) return
    try {
      await fetch(`/api/admin/skills/${skillId}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: !skill.enabled }),
      })
      fetchSkill()
    } catch (err) {
      alert('Failed to toggle skill')
    }
  }

  const handleRollback = async (version: number) => {
    if (!confirm(`Rollback to version ${version}? This will create a new version.`)) return

    try {
      const response = await fetch(`/api/admin/skills/${skillId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetVersion: version }),
      })

      if (!response.ok) throw new Error('Failed to rollback')

      fetchSkill()
      fetchVersions()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to rollback')
    }
  }

  const loadVersionContent = async (version: number) => {
    try {
      const response = await fetch(`/api/admin/skills/${skillId}/versions/${version}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to load version')
      const data = await response.json()
      setCompareVersion(version)
      setCompareContent(data.data.content)
    } catch (err) {
      alert('Failed to load version content')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="text-gray-500">Loading...</div></div>
  }

  if (error || !skill) {
    return <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error || 'Skill not found'}</div>
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/skills" className="text-blue-600 hover:text-blue-800 text-sm">← Back to Skills</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{skill.name}</h1>
                <p className="text-gray-500">{skill.description || 'No description'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggle}
                  className={`px-3 py-1 text-sm rounded-full ${
                    skill.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {skill.enabled ? 'Enabled' : 'Disabled'}
                </button>
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
              <div className="space-y-4">
                {editErrors.server && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                    {editErrors.server}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                    <select
                      value={editScope}
                      onChange={(e) => setEditScope(e.target.value as 'TENANT' | 'TEAM')}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                    >
                      <option value="TENANT">Tenant-wide</option>
                      <option value="TEAM">Team-specific</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm resize-none text-gray-900 bg-white"
                    rows={16}
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setIsEditing(false)
                      setEditName(skill.name)
                      setEditDescription(skill.description || '')
                      setEditContent(skill.content)
                      setEditScope(skill.scope)
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
                    {saving ? 'Saving...' : 'Save (creates new version)'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-4 mb-4 text-sm text-gray-500">
                  <span className={`px-2 py-1 rounded ${skill.scope === 'TENANT' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                    {skill.scope}
                  </span>
                  <span>Version {skill.version}</span>
                  <span>Updated {new Date(skill.updatedAt).toLocaleDateString()}</span>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <pre className="whitespace-pre-wrap text-sm font-mono">{skill.content}</pre>
                </div>

                {compareVersion && compareContent && (
                  <div className="mt-4 border-t pt-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-medium">Comparing with Version {compareVersion}</h3>
                      <button onClick={() => { setCompareVersion(null); setCompareContent(null) }} className="text-sm text-blue-600">
                        Close Comparison
                      </button>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-4">
                      <pre className="whitespace-pre-wrap text-sm font-mono">{compareContent}</pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Version History */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Version History</h2>
            {versions.length === 0 ? (
              <p className="text-gray-500 text-sm">No version history available</p>
            ) : (
              <div className="space-y-3">
                {versions.map((v) => (
                  <div key={v.version} className={`p-3 rounded-lg border ${v.version === skill.version ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-medium">v{v.version}</span>
                        {v.version === skill.version && (
                          <span className="ml-2 text-xs text-blue-600">Current</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">{new Date(v.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="text-xs text-gray-500 font-mono mt-1">{v.sha256.slice(0, 16)}...</div>
                    {v.version !== skill.version && (
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => loadVersionContent(v.version)}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Compare
                        </button>
                        <button
                          onClick={() => handleRollback(v.version)}
                          className="text-xs text-orange-600 hover:text-orange-800"
                        >
                          Rollback
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="bg-white rounded-lg shadow p-6 mt-6">
            <h2 className="text-lg font-semibold mb-4">Details</h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-500">ID</dt>
                <dd className="font-mono">{skill.id}</dd>
              </div>
              <div>
                <dt className="text-gray-500">SHA256</dt>
                <dd className="font-mono text-xs break-all">{skill.sha256}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Created</dt>
                <dd>{new Date(skill.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Updated</dt>
                <dd>{new Date(skill.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
