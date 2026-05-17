// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

/**
 * API Keys Settings Page
 *
 * Manage virtual API keys for the AI Gateway.
 */

import { useState, useEffect } from 'react'

interface VirtualKey {
  id: string
  keyPrefix: string
  label: string | null
  enabled: boolean
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
  revokedAt: string | null
}

interface CreateKeyResponse {
  data: VirtualKey & { key: string }
  warning: string
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<VirtualKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newKeyLabel, setNewKeyLabel] = useState('')

  const fetchKeys = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/virtual-keys', { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to fetch API keys')

      const data = await response.json()
      setKeys(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchKeys()
  }, [])

  const handleCreate = async () => {
    setCreating(true)
    setError(null)

    try {
      const response = await fetch('/api/virtual-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ label: newKeyLabel || undefined }),
      })

      if (!response.ok) throw new Error('Failed to create API key')

      const data: CreateKeyResponse = await response.json()
      setNewKey(data.data.key)
      setNewKeyLabel('')
      fetchKeys()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key')
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (keyId: string) => {
    if (!confirm('Revoke this API key? This action cannot be undone.')) return

    try {
      const response = await fetch(`/api/virtual-keys/${keyId}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) throw new Error('Failed to revoke key')
      fetchKeys()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke key')
    }
  }

  const handleRotate = async (keyId: string) => {
    if (!confirm('Rotate this API key? The current key will be invalidated.')) return

    try {
      const response = await fetch(`/api/virtual-keys/${keyId}/rotate`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) throw new Error('Failed to rotate key')

      const data: CreateKeyResponse = await response.json()
      setNewKey(data.data.key)
      fetchKeys()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to rotate key')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Copied to clipboard!')
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage API keys for accessing the AI Gateway
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Create New Key
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* New Key Display */}
      {newKey && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-green-800">Your new API key</h3>
            <button
              onClick={() => setNewKey(null)}
              className="text-green-600 hover:text-green-800"
            >
              ×
            </button>
          </div>
          <div className="bg-white border border-green-300 rounded p-3 font-mono text-sm break-all">
            {newKey}
          </div>
          <div className="flex items-center justify-between mt-3">
            <p className="text-sm text-green-700">
              Copy this key now. You won&apos;t be able to see it again!
            </p>
            <button
              onClick={() => copyToClipboard(newKey)}
              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Keys List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Key</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Label</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Used</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading...</td>
              </tr>
            ) : keys.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  <div className="flex flex-col items-center">
                    <span className="text-4xl mb-2">🔑</span>
                    <p className="font-medium">No API keys yet</p>
                    <p className="text-sm">Create a key to access the AI Gateway</p>
                  </div>
                </td>
              </tr>
            ) : (
              keys.map((key) => (
                <tr key={key.id} className={key.revokedAt ? 'opacity-50' : ''}>
                  <td className="px-6 py-4">
                    <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                      sk-tag-{key.keyPrefix}-...
                    </code>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {key.label || <span className="text-gray-400">No label</span>}
                  </td>
                  <td className="px-6 py-4">
                    {key.revokedAt ? (
                      <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                        Revoked
                      </span>
                    ) : key.expiresAt && new Date(key.expiresAt) < new Date() ? (
                      <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">
                        Expired
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {key.lastUsedAt
                      ? new Date(key.lastUsedAt).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(key.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {!key.revokedAt && (
                      <>
                        <button
                          onClick={() => handleRotate(key.id)}
                          className="text-blue-600 hover:text-blue-800 mr-4 text-sm"
                        >
                          Rotate
                        </button>
                        <button
                          onClick={() => handleRevoke(key.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Revoke
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Usage Instructions */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6">
        <h3 className="font-medium text-gray-900 mb-3">Using Your API Key</h3>
        <p className="text-sm text-gray-600 mb-4">
          Use your API key to authenticate requests to the AI Gateway. Include it in the Authorization header:
        </p>
        <div className="bg-gray-900 text-gray-100 rounded p-4 font-mono text-sm overflow-x-auto">
          <pre>{`curl https://gateway.yourdomain.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-tag-xxxxxxxx-..." \\
  -H "Content-Type: application/json" \\
  -d '{"model": "claude-sonnet", "messages": [...]}'`}</pre>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full m-4">
            <div className="flex justify-between items-center border-b px-6 py-4">
              <h2 className="text-xl font-semibold text-gray-900">Create API Key</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <span className="text-2xl">×</span>
              </button>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  placeholder="e.g., Development, Production"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                />
                <p className="text-sm text-gray-500 mt-1">
                  A label helps you identify this key later.
                </p>
              </div>
            </div>

            <div className="border-t px-6 py-4 flex justify-end gap-4">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
