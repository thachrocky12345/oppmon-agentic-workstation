'use client'

import { useState } from 'react'

interface CodeSnippetProps {
  code: string
  language?: string
  title?: string
  showLineNumbers?: boolean
}

export function CodeSnippet({
  code,
  language = 'bash',
  title,
  showLineNumbers = false
}: CodeSnippetProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const lines = code.split('\n')

  return (
    <div className="rounded-xl overflow-hidden bg-[#0c0e10] border border-white/10">
      {title && (
        <div className="px-4 py-2 bg-white/5 border-b border-white/10 flex items-center justify-between">
          <span className="text-sm text-gray-400 font-mono">{title}</span>
          <span className="text-xs text-gray-500">{language}</span>
        </div>
      )}
      <div className="relative group">
        <pre className={`p-4 overflow-x-auto text-sm font-mono ${showLineNumbers ? 'pl-12' : ''}`}>
          {showLineNumbers ? (
            <code className="text-gray-300">
              {lines.map((line, i) => (
                <div key={i} className="flex">
                  <span className="absolute left-0 w-8 text-right pr-4 text-gray-600 select-none">
                    {i + 1}
                  </span>
                  <span>{line}</span>
                </div>
              ))}
            </code>
          ) : (
            <code className="text-gray-300">{code}</code>
          )}
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-3 right-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all opacity-0 group-hover:opacity-100"
          title="Copy to clipboard"
        >
          {copied ? (
            <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
