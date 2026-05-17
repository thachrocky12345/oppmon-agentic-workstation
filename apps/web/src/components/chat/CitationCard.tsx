// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

/**
 * Citation Card Component
 *
 * Displays a single citation with document info, snippet, and confidence score.
 */

export interface Citation {
  id?: string
  title: string
  documentId?: string
  pageNumber?: number
  confidence: number
  snippet?: string
  sourceUrl?: string
}

interface CitationCardProps {
  citation: Citation
  index: number
}

export function CitationCard({ citation, index }: CitationCardProps) {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600'
    if (confidence >= 0.6) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getFileIcon = (title: string) => {
    const ext = title.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'pdf':
        return '📄'
      case 'docx':
      case 'doc':
        return '📝'
      case 'md':
        return '📋'
      case 'html':
        return '🌐'
      case 'txt':
        return '📃'
      default:
        return '📄'
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <span className="text-lg flex-shrink-0">{getFileIcon(citation.title)}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 truncate">
                [{index}] {citation.title}
              </span>
              {citation.pageNumber && (
                <span className="text-gray-500 flex-shrink-0">
                  p.{citation.pageNumber}
                </span>
              )}
            </div>
            {citation.snippet && (
              <p className="mt-1 text-gray-600 line-clamp-2">
                {citation.snippet}
              </p>
            )}
          </div>
        </div>
        <span className={`font-medium flex-shrink-0 ${getConfidenceColor(citation.confidence)}`}>
          {Math.round(citation.confidence * 100)}%
        </span>
      </div>

      {citation.documentId && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <a
            href={`/api/admin/rag/documents/${citation.documentId}/view`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800"
          >
            View Document →
          </a>
        </div>
      )}
    </div>
  )
}
