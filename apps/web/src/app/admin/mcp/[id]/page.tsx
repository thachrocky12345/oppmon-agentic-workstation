'use client'

/**
 * MCP Server Detail Page
 *
 * View and edit MCP server configuration.
 */

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

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

export default function McpDetailPage() {
  const params = useParams()
  const router = useRouter()
  const serverId = params.id as string

  const [server, setServer] = useState<McpServer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit state
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editCommand, setEditCommand] = useState('')
  const [editArgs, setEditArgs] = useState('')
  const [editEnv, setEditEnv] = useState('')
  const [editScope, setEditScope] = useState<'TENANT' | 'TEAM'>('TENANT')
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const fetchServer = async () => {
    try {
      const response = await fetch(`/api/admin/mcp/${serverId}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to fetch MCP server')
      const data = await response.json()
      setServer(data.data)
      setEditName(data.data.name)
      setEditDescription(data.data.description || '')
      setEditCommand(data.data.command)
      setEditArgs(data.data.args.join(' '))
      setEditEnv(JSON.stringify(data.data.env, null, 2))
      setEditScope(data.data.scope)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchServer()
  }, [serverId])

  const handleSave = async () => {
    setSaving(true)
    setEditErrors({})

    try {
      let envObj = {}
      if (editEnv.trim()) {
        try {
          envObj = JSON.parse(editEnv)
        } catch {
          setEditErrors({ env: 'Invalid JSON format' })
          setSaving(false)
          return
        }
      }

      const response = await fetch(`/api/admin/mcp/${serverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: editName,
          description: editDescription || undefined,
          command: editCommand,
          args: editArgs.split(/\s+/).filter(Boolean),
          env: envObj,
          scope: editScope,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update server')
      }

      const data = await response.json()
      setServer(data.data)
      setIsEditing(false)
    } catch (err) {
      setEditErrors({ server: err instanceof Error ? err.message : 'An error occurred' })
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async () => {
    if (!server) return
    try {
      await fetch(`/api/admin/mcp/${serverId}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: !server.enabled }),
      })
      fetchServer()
    } catch (err) {
      alert('Failed to toggle server')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="text-gray-500">Loading...</div></div>
  }

  if (error || !server) {
    return <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error || 'Server not found'}</div>
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/mcp" className="text-blue-600 hover:text-blue-800 text-sm">← Back to MCP Servers</Link>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{server.name}</h1>
            <p className="text-gray-500">{server.description || 'No description'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggle}
              className={`px-3 py-1 text-sm rounded-full ${
                server.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {server.enabled ? 'Enabled' : 'Disabled'}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Command</label>
              <input
                type="text"
                value={editCommand}
                onChange={(e) => setEditCommand(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-gray-900 bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Arguments</label>
              <input
                type="text"
                value={editArgs}
                onChange={(e) => setEditArgs(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-gray-900 bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Environment Variables (JSON)</label>
              <textarea
                value={editEnv}
                onChange={(e) => setEditEnv(e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg font-mono text-sm text-gray-900 bg-white ${
                  editErrors.env ? 'border-red-500' : 'border-gray-300'
                }`}
                rows={4}
                placeholder='{"KEY": "value"}'
              />
              {editErrors.env && <p className="mt-1 text-sm text-red-600">{editErrors.env}</p>}
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setIsEditing(false)
                  setEditName(server.name)
                  setEditDescription(server.description || '')
                  setEditCommand(server.command)
                  setEditArgs(server.args.join(' '))
                  setEditEnv(JSON.stringify(server.env, null, 2))
                  setEditScope(server.scope)
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
          <div className="space-y-6">
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className={`px-2 py-1 rounded ${server.scope === 'TENANT' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                {server.scope}
              </span>
              <span>Version {server.version}</span>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Command</h3>
              <code className="text-sm font-mono">
                {server.command} {server.args.join(' ')}
              </code>
            </div>

            {Object.keys(server.env).length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Environment Variables</h3>
                <pre className="text-sm font-mono">{JSON.stringify(server.env, null, 2)}</pre>
              </div>
            )}

            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Details</h3>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-gray-500">ID</dt>
                  <dd className="font-mono">{server.id}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">SHA256</dt>
                  <dd className="font-mono text-xs">{server.sha256.slice(0, 32)}...</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Created</dt>
                  <dd>{new Date(server.createdAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Updated</dt>
                  <dd>{new Date(server.updatedAt).toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
