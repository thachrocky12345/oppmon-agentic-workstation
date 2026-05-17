// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

/**
 * Quick Upload Modal
 *
 * Modal for uploading documents to any collection from the collections list page.
 */

import { useState, useEffect, useCallback } from 'react'

interface Collection {
  id: string
  name: string
  scope: 'TENANT' | 'TEAM'
  team_name?: string
}

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

interface UploadingFile {
  file: File
  status: UploadStatus
  progress: number
  error?: string
}

interface UploadModalProps {
  onClose: () => void
  onUploaded: () => void
}

export function UploadModal({ onClose, onUploaded }: UploadModalProps) {
  const [collections, setCollections] = useState<Collection[]>([])
  const [selectedCollectionId, setSelectedCollectionId] = useState('')
  const [loadingCollections, setLoadingCollections] = useState(true)
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const [isDragging, setIsDragging] = useState(false)

  // Fetch collections
  useEffect(() => {
    const fetchCollections = async () => {
      try {
        const response = await fetch('/api/admin/rag/collections?limit=100', {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          setCollections(data.data || [])
          if (data.data?.length > 0) {
            setSelectedCollectionId(data.data[0].id)
          }
        }
      } catch {
        console.error('Failed to fetch collections')
      } finally {
        setLoadingCollections(false)
      }
    }
    fetchCollections()
  }, [])

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (!selectedCollectionId) {
      alert('Please select a collection first')
      return
    }

    const fileArray = Array.from(files)
    const newUploads: UploadingFile[] = fileArray.map(file => ({
      file,
      status: 'idle' as UploadStatus,
      progress: 0,
    }))

    setUploadingFiles(prev => [...prev, ...newUploads])

    // Upload files sequentially
    for (let i = 0; i < newUploads.length; i++) {
      const startIndex = uploadingFiles.length + i
      await uploadFile(newUploads[i].file, startIndex)
    }

    // Notify parent after all uploads
    onUploaded()
  }, [selectedCollectionId, uploadingFiles.length, onUploaded])

  const uploadFile = async (file: File, index: number) => {
    setUploadingFiles(prev => prev.map((u, i) =>
      i === index ? { ...u, status: 'uploading', progress: 0 } : u
    ))

    try {
      const formData = new FormData()
      formData.append('file', file)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `/api/admin/rag/collections/${selectedCollectionId}/documents`)
      xhr.withCredentials = true

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100)
          setUploadingFiles(prev => prev.map((u, i) =>
            i === index ? { ...u, progress } : u
          ))
        }
      }

      return new Promise<void>((resolve) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadingFiles(prev => prev.map((u, i) =>
              i === index ? { ...u, status: 'processing' } : u
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
            resolve()
          }
        }

        xhr.onerror = () => {
          setUploadingFiles(prev => prev.map((u, i) =>
            i === index ? { ...u, status: 'error', error: 'Network error' } : u
          ))
          resolve()
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
    e.target.value = ''
  }

  const getFileIcon = (type: string) => {
    if (type === 'application/pdf') return '📄'
    if (type.includes('word')) return '📝'
    if (type === 'text/markdown') return '📋'
    if (type === 'text/html') return '🌐'
    return '📃'
  }

  const allDone = uploadingFiles.length > 0 && uploadingFiles.every(
    u => u.status === 'done' || u.status === 'error'
  )

  const hasUploading = uploadingFiles.some(
    u => u.status === 'uploading' || u.status === 'processing'
  )

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Quick Upload</h2>
          <button
            onClick={onClose}
            disabled={hasUploading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Collection selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Collection
            </label>
            {loadingCollections ? (
              <div className="px-4 py-2 border border-gray-300 rounded-lg text-gray-500">
                Loading collections...
              </div>
            ) : collections.length === 0 ? (
              <div className="px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
                No collections found. Create a collection first.
              </div>
            ) : (
              <select
                value={selectedCollectionId}
                onChange={(e) => setSelectedCollectionId(e.target.value)}
                disabled={hasUploading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white disabled:bg-gray-100"
              >
                {collections.map(collection => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name} ({collection.scope === 'TENANT' ? 'Tenant-wide' : collection.team_name || 'Team'})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Upload zone */}
          {collections.length > 0 && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
              } ${hasUploading ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <div className="text-4xl mb-3">📤</div>
              <div className="text-gray-900 font-medium mb-1">
                Drop files here or click to upload
              </div>
              <div className="text-gray-500 text-sm mb-4">
                Supports PDF, DOCX, MD, TXT, HTML (max 50MB)
              </div>
              <label className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">
                Browse Files
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.md,.txt,.html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain,text/html"
                  onChange={handleFileInput}
                  disabled={hasUploading}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {/* Uploading files */}
          {uploadingFiles.length > 0 && (
            <div className="divide-y border rounded-lg">
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
                      <div className="text-sm text-yellow-600">Processing...</div>
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
                    <span className="text-sm text-green-600">✓ Done</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-lg flex justify-end">
          <button
            onClick={onClose}
            disabled={hasUploading}
            className="px-4 py-2 text-gray-700 hover:text-gray-900 disabled:opacity-50"
          >
            {allDone ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
