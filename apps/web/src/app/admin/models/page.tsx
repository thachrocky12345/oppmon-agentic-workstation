// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

/**
 * Models Registry Page
 *
 * List all AI models with provider info, test status, and CRUD operations.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { CreateModelModal } from './CreateModelModal'

interface Model {
  id: string
  displayName: string
  providerTemplateId: string | null
  modelIdentifier: string
  scope: 'TENANT' | 'TEAM'
  teamId: string | null
  hasSecret: boolean
  isYamlMode: boolean
  enabled: boolean
  lastSyncedAt: string | null
  createdAt: string
  updatedAt: string
}

interface ModelsResponse {
  data: Model[]
  meta: {
    total: number
    limit: number
    offset: number
  }
}

const providerIcons: Record<string, string> = {
  anthropic: '🔮',
  bedrock: '☁️',
  'azure-openai': '🔷',
  openai: '🤖',
  ollama: '🦙',
  cerebras: '⚡',
  'openai-compatible': '🔌',
}

const providerNames: Record<string, string> = {
  anthropic: 'Anthropic',
  bedrock: 'AWS Bedrock',
  'azure-openai': 'Azure OpenAI',
  openai: 'OpenAI',
  ollama: 'Ollama',
  cerebras: 'Cerebras',
  'openai-compatible': 'OpenAI-Compatible',
}

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const limit = 10

  const fetchModels = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      })
      if (search) params.set('search', search)
      if (providerFilter) params.set('providerTemplateId', providerFilter)

      const response = await fetch(`/api/models?${params}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to fetch models')

      const data: ModelsResponse = await response.json()
      setModels(data.data)
      setTotal(data.meta.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchModels()
  }, [page, search, providerFilter])

  const handleToggle = async (modelId: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/models/${modelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled }),
      })

      if (!response.ok) throw new Error('Failed to toggle model')
      fetchModels()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to toggle model')
    }
  }

  const handleDelete = async (modelId: string) => {
    if (!confirm('Delete this model? This action cannot be undone.')) return

    try {
      const response = await fetch(`/api/models/${modelId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to delete model')
      fetchModels()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete model')
    }
  }

  const handleTestConnection = async (modelId: string) => {
    const model = models.find(m => m.id === modelId)
    if (!model) return

    // TODO: Open test modal or inline test
    alert('Connection test coming soon!')
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Models</h1>
          <p className="text-gray-500 text-sm mt-1">
            Configure AI providers and models for your AI Gateway
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Add Model
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <input
          type="text"
          placeholder="Search models..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
        />
        <select
          value={providerFilter}
          onChange={(e) => { setProviderFilter(e.target.value); setPage(0) }}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
        >
          <option value="">All Providers</option>
          <option value="anthropic">Anthropic</option>
          <option value="bedrock">AWS Bedrock</option>
          <option value="azure-openai">Azure OpenAI</option>
          <option value="openai">OpenAI</option>
          <option value="ollama">Ollama</option>
          <option value="cerebras">Cerebras</option>
          <option value="openai-compatible">OpenAI-Compatible</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Models Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Provider</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scope</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Synced</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading...</td>
              </tr>
            ) : models.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  <div className="flex flex-col items-center">
                    <span className="text-4xl mb-2">🤖</span>
                    <p className="font-medium">No models configured</p>
                    <p className="text-sm">Add your first AI model to get started</p>
                  </div>
                </td>
              </tr>
            ) : (
              models.map((model) => (
                <tr key={model.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <span className="text-xl mr-3">
                        {model.isYamlMode ? '📝' : providerIcons[model.providerTemplateId || ''] || '🔧'}
                      </span>
                      <div>
                        <p className="font-medium text-gray-900">{model.displayName}</p>
                        <p className="text-sm text-gray-500">{model.modelIdentifier}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-700">
                      {model.isYamlMode ? 'Custom YAML' : providerNames[model.providerTemplateId || ''] || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded ${
                      model.scope === 'TENANT' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {model.scope}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggle(model.id, !model.enabled)}
                      className={`px-3 py-1 text-xs rounded-full ${
                        model.enabled
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {model.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {model.lastSyncedAt
                      ? new Date(model.lastSyncedAt).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleTestConnection(model.id)}
                      className="text-green-600 hover:text-green-800 mr-4 text-sm"
                    >
                      Test
                    </button>
                    <Link
                      href={`/admin/models/${model.id}`}
                      className="text-blue-600 hover:text-blue-800 mr-4 text-sm"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(model.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
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

      {showCreateModal && (
        <CreateModelModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchModels() }}
        />
      )}
    </div>
  )
}
