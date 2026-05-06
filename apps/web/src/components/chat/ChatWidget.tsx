'use client'

/**
 * Chat Widget Component
 *
 * A floating button that links to the full chat page.
 * Hidden on the chat page itself.
 */

import { usePathname } from 'next/navigation'
import Link from 'next/link'

export function ChatWidget() {
  const pathname = usePathname()

  // Don't show on the chat page
  if (pathname === '/chat') {
    return null
  }

  return (
    <Link
      href="/chat"
      className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 flex items-center justify-center z-50 transition-transform hover:scale-105"
      aria-label="Open chat"
      title="Open Chat"
    >
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    </Link>
  )
}
