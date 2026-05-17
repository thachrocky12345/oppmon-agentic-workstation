// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

/**
 * Chat Message Component
 *
 * Displays a single chat message with optional citations.
 */

import { useState } from 'react'
import { CitationCard, Citation } from './CitationCard'

export interface ChatMessageData {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  citations?: Citation[]
  isStreaming?: boolean
}

interface ChatMessageProps {
  message: ChatMessageData
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [showCitations, setShowCitations] = useState(false)
  const isUser = message.role === 'user'
  const hasCitations = message.citations && message.citations.length > 0

  // Parse citation references [1], [2], etc. in content
  const renderContent = (content: string) => {
    if (!hasCitations) return content

    // Replace [n] with styled citation links
    const parts = content.split(/(\[\d+\])/g)
    return parts.map((part, index) => {
      const match = part.match(/\[(\d+)\]/)
      if (match) {
        const citationIndex = parseInt(match[1], 10) - 1
        const citation = message.citations?.[citationIndex]
        if (citation) {
          return (
            <button
              key={index}
              onClick={() => setShowCitations(true)}
              className="text-blue-600 hover:text-blue-800 font-medium"
              title={citation.title}
            >
              {part}
            </button>
          )
        }
      }
      return part
    })
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-900'
        }`}
      >
        {/* Message content */}
        <div className="whitespace-pre-wrap break-words text-sm">
          {renderContent(message.content)}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
          )}
        </div>

        {/* Citations toggle */}
        {hasCitations && !isUser && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <button
              onClick={() => setShowCitations(!showCitations)}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <span>{showCitations ? '▼' : '▶'}</span>
              <span>{message.citations!.length} source{message.citations!.length !== 1 ? 's' : ''}</span>
            </button>

            {showCitations && (
              <div className="mt-2 space-y-2">
                {message.citations!.map((citation, index) => (
                  <CitationCard
                    key={citation.id || index}
                    citation={citation}
                    index={index + 1}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Loading message with animated dots
 */
export function LoadingMessage() {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-gray-100 text-gray-900 rounded-lg px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}
