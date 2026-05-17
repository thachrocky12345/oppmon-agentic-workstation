// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

/**
 * RAG Collections Management Page
 *
 * Admin interface for managing document collections and RAG documents.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { CreateCollectionModal } from './CreateCollectionModal'
import { UploadModal } from './UploadModal'

interface RagCollection {
  id: string
  name: string
  description?: string
  scope: 'TENANT' | 'TEAM'
  teamId?: string
  team_name?: string
  document_count: number
  total_chunks: number
  createdAt: string
  updatedAt: string
}

interface CollectionsResponse {
  data: RagCollection[]
  meta: {
    total: number
    limit: number
    offset: number
  }
}

export default function RagCollectionsPage() {
  const [collections, setCollections] = useState<RagCollection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scopeFilter, setScopeFilter] = useState<string>('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const limit = 10

  const fetchCollections = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      })
      if (scopeFilter) params.set('scope', scopeFilter)

      const response = await fetch(`/api/admin/rag/collections?${params}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to fetch collections')

      const data: CollectionsResponse = await response.json()
      setCollections(data.data)
      setTotal(data.meta.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCollections()
  }, [page, scopeFilter])

  const handleDelete = async (collectionId: string, name: string) => {
    const confirmName = prompt(`Type "${name}" to confirm deletion. This will delete all documents in the collection.`)
    if (confirmName !== name) return

    try {
      const response = await fetch(`/api/admin/rag/collections/${collectionId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to delete collection')
      fetchCollections()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete collection')
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">RAG Collections</h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage document collections for RAG-grounded chat
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50"
          >
            Quick Upload
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Create Collection
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <select
          value={scopeFilter}
          onChange={(e) => { setScopeFilter(e.target.value); setPage(0) }}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
        >
          <option value="">All Scopes</option>
          <option value="TENANT">Tenant-wide</option>
          <option value="TEAM">Team-specific</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Collections Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Collection</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scope</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Documents</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chunks</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading...</td>
              </tr>
            ) : collections.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  <div className="flex flex-col items-center">
                    <span className="text-4xl mb-2">📚</span>
                    <p className="font-medium">No collections yet</p>
                    <p className="text-sm">Create a collection to start uploading documents</p>
                  </div>
                </td>
              </tr>
            ) : (
              collections.map((collection) => (
                <tr key={collection.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link href={`/admin/rag/${collection.id}`} className="text-blue-600 hover:text-blue-800 font-medium">
                      {collection.name}
                    </Link>
                    {collection.description && (
                      <p className="text-sm text-gray-500 truncate max-w-xs">{collection.description}</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded ${
                      collection.scope === 'TENANT' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {collection.scope === 'TENANT' ? 'Tenant-wide' : collection.team_name || 'Team'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {collection.document_count}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {collection.total_chunks?.toLocaleString() || 0}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(collection.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/admin/rag/${collection.id}`} className="text-blue-600 hover:text-blue-800 mr-4 text-sm">
                      Manage
                    </Link>
                    <button
                      onClick={() => handleDelete(collection.id, collection.name)}
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
        <CreateCollectionModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchCollections() }}
        />
      )}

      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onUploaded={() => fetchCollections()}
        />
      )}
    </div>
  )
}
