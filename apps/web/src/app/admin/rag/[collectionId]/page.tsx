'use client'

/**
 * RAG Collection Detail Page
 *
 * View documents in a collection, upload new documents, manage existing ones.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface RagCollection {
  id: string
  name: string
  description?: string
  scope: 'TENANT' | 'TEAM'
  team_name?: string
  documents: RagDocument[]
}

interface RagDocument {
  id: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
  extractionStatus: 'PENDING' | 'EXTRACTING' | 'EXTRACTED' | 'FAILED'
  extractionError?: string
  chunkCount: number
  createdAt: string
  updatedAt: string
}

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

interface UploadingFile {
  file: File
  status: UploadStatus
  progress: number
  documentId?: string
  error?: string
}

export default function CollectionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const collectionId = params.collectionId as string

  const [collection, setCollection] = useState<RagCollection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const fetchCollection = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/rag/collections/${collectionId}`, { credentials: 'include' })
      if (!response.ok) {
        if (response.status === 404) {
          router.push('/admin/rag')
          return
        }
        throw new Error('Failed to fetch collection')
      }
      const data = await response.json()
      setCollection(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [collectionId, router])

  useEffect(() => {
    fetchCollection()
  }, [fetchCollection])

  // Poll for status updates on pending/extracting documents
  useEffect(() => {
    const hasPending = collection?.documents?.some(
      d => d.extractionStatus === 'PENDING' || d.extractionStatus === 'EXTRACTING'
    )
    if (!hasPending) return

    const interval = setInterval(fetchCollection, 3000)
    return () => clearInterval(interval)
  }, [collection, fetchCollection])

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const newUploads: UploadingFile[] = fileArray.map(file => ({
      file,
      status: 'idle' as UploadStatus,
      progress: 0,
    }))

    setUploadingFiles(prev => [...prev, ...newUploads])

    // Upload files sequentially
    for (let i = 0; i < newUploads.length; i++) {
      const upload = newUploads[i]
      await uploadFile(upload.file, uploadingFiles.length + i)
    }

    // Refresh collection after all uploads
    fetchCollection()
  }

  const uploadFile = async (file: File, index: number) => {
    setUploadingFiles(prev => prev.map((u, i) =>
      i === index ? { ...u, status: 'uploading', progress: 0 } : u
    ))

    try {
      const formData = new FormData()
      formData.append('file', file)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `/api/admin/rag/collections/${collectionId}/documents`)
      xhr.withCredentials = true

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100)
          setUploadingFiles(prev => prev.map((u, i) =>
            i === index ? { ...u, progress } : u
          ))
        }
      }

      return new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText)
            setUploadingFiles(prev => prev.map((u, i) =>
              i === index ? { ...u, status: 'processing', documentId: data.data?.id } : u
            ))
            setTimeout(() => {
              setUploadingFiles(prev => prev.map((u, i) =>
                i === index ? { ...u, status: 'done' } : u
              ))
              resolve()
            }, 1000)
          } else {
            const error = JSON.parse(xhr.responseText)?.error || 'Upload failed'
            setUploadingFiles(prev => prev.map((u, i) =>
              i === index ? { ...u, status: 'error', error } : u
            ))
            reject(new Error(error))
          }
        }

        xhr.onerror = () => {
          setUploadingFiles(prev => prev.map((u, i) =>
            i === index ? { ...u, status: 'error', error: 'Network error' } : u
          ))
          reject(new Error('Network error'))
        }

        xhr.send(formData)
      })
    } catch (err) {
      setUploadingFiles(prev => prev.map((u, i) =>
        i === index ? { ...u, status: 'error', error: String(err) } : u
      ))
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      handleFiles(e.target.files)
    }
    e.target.value = '' // Reset for same file selection
  }

  const handleReindex = async (documentId: string) => {
    try {
      const response = await fetch(`/api/admin/rag/documents/${documentId}/reindex`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to reindex')
      fetchCollection()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reindex')
    }
  }

  const handleDelete = async (documentId: string, filename: string) => {
    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) return

    try {
      const response = await fetch(`/api/admin/rag/documents/${documentId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to delete')
      fetchCollection()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

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
        return <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">Ready</span>
      case 'EXTRACTING':
        return <span className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-800 animate-pulse">Processing...</span>
      case 'PENDING':
        return <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-800">Pending</span>
      case 'FAILED':
        return <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-800">Failed</span>
    }
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/pdf') return '📄'
    if (mimeType.includes('word')) return '📝'
    if (mimeType === 'text/markdown') return '📋'
    if (mimeType === 'text/html') return '🌐'
    return '📃'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading collection...</div>
      </div>
    )
  }

  if (error || !collection) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error || 'Collection not found'}
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/admin/rag" className="hover:text-blue-600">RAG Collections</Link>
          <span>/</span>
          <span className="text-gray-900">{collection.name}</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{collection.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className={`px-2 py-1 text-xs rounded ${
                collection.scope === 'TENANT' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
              }`}>
                {collection.scope === 'TENANT' ? 'Tenant-wide' : collection.team_name || 'Team'}
              </span>
              {collection.description && (
                <span className="text-gray-500 text-sm">{collection.description}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Upload Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center mb-6 transition-colors ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <div className="text-4xl mb-3">📤</div>
        <div className="text-gray-900 font-medium mb-1">
          Drop files here or click to upload
        </div>
        <div className="text-gray-500 text-sm mb-4">
          Supports PDF, DOCX, Markdown, TXT, HTML (max 50MB)
        </div>
        <label className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">
          Browse Files
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.md,.txt,.html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain,text/html"
            onChange={handleFileInput}
            className="hidden"
          />
        </label>
      </div>

      {/* Uploading Files */}
      {uploadingFiles.length > 0 && (
        <div className="bg-white rounded-lg shadow mb-6 divide-y">
          {uploadingFiles.map((upload, index) => (
            <div key={index} className="px-4 py-3 flex items-center gap-4">
              <span className="text-xl">{getFileIcon(upload.file.type)}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{upload.file.name}</div>
                {upload.status === 'uploading' && (
                  <div className="w-full h-1 bg-gray-200 rounded-full mt-1">
                    <div
                      className="h-1 bg-blue-600 rounded-full transition-all"
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                )}
                {upload.status === 'processing' && (
                  <div className="text-sm text-yellow-600">Processing document...</div>
                )}
                {upload.status === 'error' && (
                  <div className="text-sm text-red-600">{upload.error}</div>
                )}
              </div>
              {upload.status === 'uploading' && (
                <span className="text-sm text-gray-500">{upload.progress}%</span>
              )}
              {upload.status === 'processing' && (
                <span className="text-sm text-yellow-600 animate-pulse">⏳</span>
              )}
              {upload.status === 'done' && (
                <span className="text-sm text-green-600">✓</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Documents Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Documents ({collection.documents?.length || 0})</h2>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Document</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chunks</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {!collection.documents?.length ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  <div className="flex flex-col items-center">
                    <span className="text-4xl mb-2">📂</span>
                    <p className="font-medium">No documents yet</p>
                    <p className="text-sm">Upload your first document to get started</p>
                  </div>
                </td>
              </tr>
            ) : (
              collection.documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{getFileIcon(doc.mimeType)}</span>
                      <div>
                        <div className="font-medium text-gray-900">{doc.originalFilename}</div>
                        {doc.extractionError && (
                          <div className="text-xs text-red-600 mt-1">{doc.extractionError}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatBytes(doc.sizeBytes)}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{doc.chunkCount}</td>
                  <td className="px-6 py-4">{getStatusBadge(doc.extractionStatus)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(doc.createdAt)}</td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <a
                      href={`/api/admin/rag/documents/${doc.id}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      View
                    </a>
                    {doc.extractionStatus === 'FAILED' && (
                      <button
                        onClick={() => handleReindex(doc.id)}
                        className="text-yellow-600 hover:text-yellow-800 text-sm"
                      >
                        Retry
                      </button>
                    )}
                    {doc.extractionStatus === 'EXTRACTED' && (
                      <button
                        onClick={() => handleReindex(doc.id)}
                        className="text-gray-600 hover:text-gray-800 text-sm"
                      >
                        Reindex
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(doc.id, doc.originalFilename)}
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
      </div>
    </div>
  )
}
