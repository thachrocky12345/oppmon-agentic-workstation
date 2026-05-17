// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

/**
 * RAG Document Detail Page
 *
 * View document content, metadata, and extracted chunks.
 * Accessed from chat citations to view source documents.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface RagDocument {
  id: string
  collectionId: string
  collection_name: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
  extractionStatus: 'PENDING' | 'EXTRACTING' | 'EXTRACTED' | 'FAILED'
  extractionError?: string
  chunkCount: number
  scope: 'TENANT' | 'TEAM'
  teamId?: string
  createdAt: string
  updatedAt: string
}

interface RagChunk {
  id: string
  chunkIndex: number
  content: string
  tokenCount: number
  pageNumber?: number
  createdAt: string
}

interface ChunksMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function DocumentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const documentId = params.documentId as string

  const [document, setDocument] = useState<RagDocument | null>(null)
  const [chunks, setChunks] = useState<RagChunk[]>([])
  const [chunksMeta, setChunksMeta] = useState<ChunksMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'chunks' | 'preview'>('chunks')
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  const fetchDocument = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/rag/documents/${documentId}`, { credentials: 'include' })
      if (!response.ok) {
        if (response.status === 404) {
          setError('Document not found')
          return
        }
        throw new Error('Failed to fetch document')
      }
      const data = await response.json()
      setDocument(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [documentId])

  const fetchChunks = useCallback(async (page = 1) => {
    try {
      const response = await fetch(`/api/admin/rag/documents/${documentId}/chunks?page=${page}&limit=20`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to fetch chunks')
      const data = await response.json()
      setChunks(data.data)
      setChunksMeta(data.meta)
    } catch (err) {
      console.error('Failed to fetch chunks:', err)
    }
  }, [documentId])

  useEffect(() => {
    fetchDocument()
    fetchChunks()
  }, [fetchDocument, fetchChunks])

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadge = (status: RagDocument['extractionStatus']) => {
    switch (status) {
      case 'EXTRACTED':
        return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Ready</span>
      case 'EXTRACTING':
        return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 animate-pulse">Processing...</span>
      case 'PENDING':
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">Pending</span>
      case 'FAILED':
        return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">Failed</span>
    }
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/pdf') return '📄'
    if (mimeType.includes('word')) return '📝'
    if (mimeType === 'text/markdown') return '📋'
    if (mimeType === 'text/html') return '🌐'
    return '📃'
  }

  const toggleChunkExpanded = (chunkId: string) => {
    setExpandedChunks(prev => {
      const next = new Set(prev)
      if (next.has(chunkId)) {
        next.delete(chunkId)
      } else {
        next.add(chunkId)
      }
      return next
    })
  }

  const highlightSearchTerm = (text: string) => {
    if (!searchQuery.trim()) return text
    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    )
  }

  const filteredChunks = searchQuery.trim()
    ? chunks.filter(c => c.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : chunks

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading document...</div>
      </div>
    )
  }

  if (error || !document) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error || 'Document not found'}</span>
          </div>
          <Link href="/admin/rag" className="inline-block mt-4 text-sm text-blue-600 hover:text-blue-800">
            ← Back to RAG Collections
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/admin/rag" className="hover:text-blue-600">RAG Collections</Link>
        <span>/</span>
        <Link href={`/admin/rag/${document.collectionId}`} className="hover:text-blue-600">
          {document.collection_name}
        </Link>
        <span>/</span>
        <span className="text-gray-900">{document.originalFilename}</span>
      </div>

      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="text-4xl">{getFileIcon(document.mimeType)}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-xl font-bold text-gray-900 truncate">{document.originalFilename}</h1>
              {getStatusBadge(document.extractionStatus)}
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-gray-500">
              <span>{formatBytes(document.sizeBytes)}</span>
              <span>•</span>
              <span>{document.chunkCount} chunks</span>
              <span>•</span>
              <span>Uploaded {formatDate(document.createdAt)}</span>
            </div>
            {document.extractionError && (
              <div className="mt-2 text-sm text-red-600">{document.extractionError}</div>
            )}
          </div>
          <div className="flex gap-2">
            <a
              href={`/api/admin/rag/documents/${document.id}/view`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View Original
            </a>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('chunks')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'chunks'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Chunks ({document.chunkCount})
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'preview'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Preview
        </button>
      </div>

      {/* Content */}
      {activeTab === 'chunks' && (
        <div>
          {/* Search */}
          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search in chunks..."
                className="w-full px-4 py-2 pl-10 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Chunks List */}
          <div className="space-y-3">
            {filteredChunks.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                {searchQuery ? 'No chunks match your search' : 'No chunks extracted yet'}
              </div>
            ) : (
              filteredChunks.map(chunk => {
                const isExpanded = expandedChunks.has(chunk.id)
                const contentPreview = chunk.content.length > 300 && !isExpanded
                  ? chunk.content.slice(0, 300) + '...'
                  : chunk.content

                return (
                  <div
                    key={chunk.id}
                    className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="font-medium text-gray-900">Chunk {chunk.chunkIndex + 1}</span>
                        {chunk.pageNumber && (
                          <span className="text-gray-500">Page {chunk.pageNumber}</span>
                        )}
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-500">{chunk.tokenCount} tokens</span>
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText(chunk.content)}
                        className="text-gray-400 hover:text-gray-600 p-1"
                        title="Copy content"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                    <div className="p-4">
                      <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                        {highlightSearchTerm(contentPreview)}
                      </div>
                      {chunk.content.length > 300 && (
                        <button
                          onClick={() => toggleChunkExpanded(chunk.id)}
                          className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                        >
                          {isExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Pagination */}
          {chunksMeta && chunksMeta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => fetchChunks(chunksMeta.page - 1)}
                disabled={chunksMeta.page <= 1}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {chunksMeta.page} of {chunksMeta.totalPages}
              </span>
              <button
                onClick={() => fetchChunks(chunksMeta.page + 1)}
                disabled={chunksMeta.page >= chunksMeta.totalPages}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'preview' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="text-center py-8">
            <div className="text-4xl mb-4">{getFileIcon(document.mimeType)}</div>
            <p className="text-gray-500 mb-4">
              Preview is not available for this file type.
            </p>
            <a
              href={`/api/admin/rag/documents/${document.id}/view`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Original File
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
