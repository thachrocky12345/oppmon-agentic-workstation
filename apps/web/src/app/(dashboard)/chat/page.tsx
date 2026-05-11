'use client'

/**
 * Chat Page
 *
 * Full-page RAG-grounded chat experience with:
 * - Chat history sidebar
 * - Model/collection selectors
 * - Suggested prompts
 * - Streaming responses with citations
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AgentGraphPanel, {
  type AgentGraphState,
  type AdjEdge,
  type AgentNode as AgentNodeT,
} from '@/components/AgentGraphPanel'

// URL of the graph-mode agent (KnowledgeSearchBackend /solve_v2).
// Override with NEXT_PUBLIC_GRAPH_AGENT_URL to point at a different host.
const GRAPH_AGENT_URL =
  process.env.NEXT_PUBLIC_GRAPH_AGENT_URL || 'http://localhost:8002/solve_v2'

// Resizable-panel constraints.
const GRAPH_PANEL_MIN_PX = 320
function clampGraphWidth(px: number): number {
  if (typeof window === 'undefined') return px
  const max = Math.floor(window.innerWidth * 0.7)
  return Math.max(GRAPH_PANEL_MIN_PX, Math.min(max, px))
}

// ============================================================================
// Types
// ============================================================================

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  isStreaming?: boolean
}

interface Citation {
  index: number
  documentTitle: string
  documentId: string
  chunkText: string
  pageNumber?: number
  score: number
  source: 'rag' | 'web'
  url?: string
}

interface ChatSession {
  id: string
  title: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

interface Collection {
  id: string
  name: string
  scope: 'TENANT' | 'TEAM'
  team_name?: string
}

interface Model {
  id: string
  displayName: string
  modelIdentifier: string
  providerTemplateId?: string
  enabled: boolean
}

interface StreamChunk {
  type: 'citation' | 'content' | 'done' | 'error'
  data: Citation | {
    content?: string
    citations?: Citation[]
    message?: string
    source?: string
    citationCount?: number
  }
}

// ============================================================================
// Suggested Prompts
// ============================================================================

const suggestedPrompts = [
  { icon: '📊', text: 'What are the key metrics in my dashboard?' },
  { icon: '🔒', text: 'Explain our security policies' },
  { icon: '📚', text: 'Summarize the documentation' },
  { icon: '🔧', text: 'How do I configure workflows?' },
]

// ============================================================================
// Chat Page Component
// ============================================================================

export default function ChatPage() {
  const router = useRouter()

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Session state
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(true)

  // Model/Collection state
  const [models, setModels] = useState<Model[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [collections, setCollections] = useState<Collection[]>([])
  const [selectedCollections, setSelectedCollections] = useState<string[]>([])
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [showCollectionDropdown, setShowCollectionDropdown] = useState(false)

  // Tools state
  const [enableTools, setEnableTools] = useState(false)
  const [enableWebFallback, setEnableWebFallback] = useState(false)

  // Graph mode — when on, the chat calls /solve_v2 (KnowledgeSearchBackend)
  // and renders a live planner+searcher graph on the right side.
  const [graphMode, setGraphMode] = useState(false)
  const [graphState, setGraphState] = useState<AgentGraphState | null>(null)
  // Resizable graph panel width (px). Default 520, clamped to [320, 70vw].
  // Persisted in localStorage so it survives reloads.
  const [graphPanelWidth, setGraphPanelWidth] = useState<number>(520)
  const isResizingRef = useRef(false)

  // Load saved width on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem('arkon.chat.graphPanelWidth')
    if (saved) {
      const n = parseInt(saved, 10)
      if (!Number.isNaN(n)) setGraphPanelWidth(clampGraphWidth(n))
    }
  }, [])

  // Persist on change (debounced via effect-skip during drag is unnecessary;
  // localStorage writes are cheap).
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('arkon.chat.graphPanelWidth', String(graphPanelWidth))
  }, [graphPanelWidth])

  // Drag handlers — attached at window level so we keep tracking even if
  // the cursor leaves the thin handle div.
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!isResizingRef.current) return
      // Right panel width = viewport width - cursor X (the handle is on the
      // panel's left edge). Clamp to sane bounds.
      const next = clampGraphWidth(window.innerWidth - e.clientX)
      setGraphPanelWidth(next)
    }
    function onUp() {
      if (!isResizingRef.current) return
      isResizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  function startResize() {
    isResizingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)
  const collectionDropdownRef = useRef<HTMLDivElement>(null)

  // ============================================================================
  // Data Fetching
  // ============================================================================

  // Fetch models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch('/api/models?enabled=true', {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          const enabledModels = (data.data || []).filter((m: Model) => m.enabled)
          setModels(enabledModels)
          if (enabledModels.length > 0 && !selectedModel) {
            setSelectedModel(enabledModels[0].id)
          }
        }
      } catch (err) {
        console.error('Failed to fetch models:', err)
      }
    }
    fetchModels()
  }, [])

  // Fetch collections
  useEffect(() => {
    const fetchCollections = async () => {
      try {
        const response = await fetch('/api/rag/collections/accessible', {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          setCollections(data.data || [])
        }
      } catch (err) {
        console.error('Failed to fetch collections:', err)
      }
    }
    fetchCollections()
  }, [])

  // Fetch chat sessions (mock for now - can be connected to backend later)
  useEffect(() => {
    // For now, we'll use localStorage to persist sessions
    const loadSessions = () => {
      try {
        const saved = localStorage.getItem('oppmon-chat-sessions')
        if (saved) {
          setSessions(JSON.parse(saved))
        }
      } catch (err) {
        console.error('Failed to load sessions:', err)
      } finally {
        setLoadingSessions(false)
      }
    }
    loadSessions()
  }, [])

  // Save sessions to localStorage
  useEffect(() => {
    if (!loadingSessions && sessions.length > 0) {
      localStorage.setItem('oppmon-chat-sessions', JSON.stringify(sessions))
    }
  }, [sessions, loadingSessions])

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false)
      }
      if (collectionDropdownRef.current && !collectionDropdownRef.current.contains(event.target as Node)) {
        setShowCollectionDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ============================================================================
  // Session Management
  // ============================================================================

  const createNewSession = useCallback(() => {
    const newSession: ChatSession = {
      id: `session-${Date.now()}`,
      title: 'New Chat',
      messageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setSessions(prev => [newSession, ...prev])
    setCurrentSessionId(newSession.id)
    setMessages([])
    setError(null)
    inputRef.current?.focus()
  }, [])

  const selectSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId)
    // Load messages for this session from localStorage
    try {
      const saved = localStorage.getItem(`oppmon-chat-messages-${sessionId}`)
      if (saved) {
        setMessages(JSON.parse(saved))
      } else {
        setMessages([])
      }
    } catch (err) {
      console.error('Failed to load session messages:', err)
      setMessages([])
    }
    setError(null)
  }, [])

  const deleteSession = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSessions(prev => prev.filter(s => s.id !== sessionId))
    localStorage.removeItem(`oppmon-chat-messages-${sessionId}`)
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null)
      setMessages([])
    }
  }, [currentSessionId])

  // Save messages when they change
  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      localStorage.setItem(`oppmon-chat-messages-${currentSessionId}`, JSON.stringify(messages))

      // Update session title and message count
      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          const firstUserMessage = messages.find(m => m.role === 'user')
          return {
            ...s,
            title: firstUserMessage?.content.slice(0, 30) || 'New Chat',
            messageCount: messages.length,
            updatedAt: new Date().toISOString(),
          }
        }
        return s
      }))
    }
  }, [messages, currentSessionId])

  // ============================================================================
  // Chat Functionality
  // ============================================================================

  const handleSubmit = useCallback(async (promptText?: string) => {
    const messageText = promptText || input.trim()
    if (!messageText || isLoading) return

    // Create session if needed
    if (!currentSessionId) {
      const newSession: ChatSession = {
        id: `session-${Date.now()}`,
        title: messageText.slice(0, 30),
        messageCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setSessions(prev => [newSession, ...prev])
      setCurrentSessionId(newSession.id)
    }

    setError(null)
    setInput('')

    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageText,
    }
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    // Prepare API messages
    // Filter out empty/streaming messages before sending to API
    const apiMessages = [...messages, userMessage]
      .filter(m => m.content && m.content.trim() !== '' && !m.isStreaming)
      .map(m => ({
        role: m.role,
        content: m.content,
      }))

    try {
      // -------------------------------------------------------------------
      // Graph mode: call KnowledgeSearchBackend /solve_v2 and stream a
      // planner+searcher graph into the right-side panel. Final answer is
      // appended to the assistant message just like simple mode.
      // -------------------------------------------------------------------
      if (graphMode) {
        const assistantMessageId = `assistant-${Date.now()}`
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            citations: [],
            isStreaming: true,
          },
        ])
        // Reset graph state at the start of every new query.
        setGraphState({
          nodes: {},
          adj: {},
          references: {},
          currentNode: null,
          done: false,
        })

        const resp = await fetch(GRAPH_AGENT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inputs: messageText,
            web_fallback: enableWebFallback,
            enable_tools: enableTools,
            collection_ids: selectedCollections.length > 0 ? selectedCollections : [],
          }),
        })
        if (!resp.ok || !resp.body) {
          throw new Error(`Graph agent error: ${resp.status} ${resp.statusText}`)
        }

        const reader = resp.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        // Track the last answer text seen so we can update the streaming
        // assistant bubble without flicker (planner emits the same `response`
        // field multiple times during finalize).
        let lastAnswer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          // Split on blank lines (SSE event boundaries) — but be tolerant of
          // single \n separators too.
          const lines = buf.split('\n')
          buf = lines.pop() || ''
          for (const raw of lines) {
            const line = raw.trim()
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (!payload) continue
            let evt: {
              response?: {
                type?: string
                state?: string
                response?: string
                nodes?: Record<string, AgentNodeT>
                adj?: Record<string, AdjEdge[]>
                references?: Record<string, string>
              }
              current_node?: string | null
              error?: { msg: string; details?: string }
            }
            try {
              evt = JSON.parse(payload)
            } catch {
              continue
            }
            if (evt.error) {
              throw new Error(evt.error.msg + (evt.error.details ? `: ${evt.error.details}` : ''))
            }
            const r = evt.response
            if (!r) continue

            // Update graph state if this event carries one.
            if (r.nodes && r.adj) {
              const done = r.state === 'END'
              setGraphState({
                nodes: r.nodes,
                adj: r.adj,
                references: r.references || {},
                currentNode: evt.current_node ?? null,
                done,
              })
            }

            // Surface the latest planner answer text into the chat bubble.
            // Searcher events also carry `response` but we want the planner's
            // synthesis, so we only update on type=planner.
            if (r.type === 'planner' && r.response && r.response !== lastAnswer) {
              lastAnswer = r.response
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId ? { ...m, content: r.response! } : m,
                ),
              )
            }

            if (r.state === 'END') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId ? { ...m, isStreaming: false } : m,
                ),
              )
            }
          }
        }
        return // graph-mode path complete
      }

      const modelConfig = selectedModel ? models.find(m => m.id === selectedModel) : undefined

      const response = await fetch('/api/rag/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: apiMessages,
          collectionIds: selectedCollections.length > 0 ? selectedCollections : undefined,
          model: modelConfig?.modelIdentifier,
          provider: modelConfig?.providerTemplateId || 'anthropic',
          enableTools,
          webFallback: enableWebFallback,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Chat request failed')
      }

      // Create assistant message placeholder
      const assistantMessageId = `assistant-${Date.now()}`
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        citations: [],
        isStreaming: true,
      }
      setMessages(prev => [...prev, assistantMessage])

      // Stream the response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('Response stream not available')
      }

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim()

            if (dataStr === '[DONE]') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMessageId ? { ...m, isStreaming: false } : m
                )
              )
              continue
            }

            // Stream-level errors (e.g. provider unreachable) arrive as
            // {type: 'error', data: {message}}. They must propagate out of the
            // reader loop. The inner try/catch below is only for JSON.parse
            // — recording the error and throwing AFTER the catch keeps
            // parseError from swallowing the real failure.
            let streamErrorMessage: string | null = null
            try {
              const chunk: StreamChunk = JSON.parse(dataStr)

              if (chunk.type === 'content') {
                const contentData = chunk.data as { content?: string }
                if (contentData.content) {
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === assistantMessageId
                        ? { ...m, content: m.content + contentData.content }
                        : m
                    )
                  )
                }
              } else if (chunk.type === 'citation') {
                // Citation data is the citation object directly
                const citation = chunk.data as Citation
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, citations: [...(m.citations || []), citation] }
                      : m
                  )
                )
              } else if (chunk.type === 'done') {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantMessageId
                      ? { ...m, isStreaming: false }
                      : m
                  )
                )
              } else if (chunk.type === 'error') {
                const errorData = chunk.data as { message?: string }
                streamErrorMessage = errorData.message || 'Stream error'
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE chunk:', dataStr)
            }

            if (streamErrorMessage) {
              throw new Error(streamErrorMessage)
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setMessages(prev => prev.filter(m => !m.isStreaming))
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, messages, selectedCollections, selectedModel, models, currentSessionId, graphMode, enableTools, enableWebFallback])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // ============================================================================
  // Helper Functions
  // ============================================================================

  const getSelectedModelName = () => {
    if (models.length === 0) return 'Default Model'
    if (!selectedModel) return 'Select Model'
    const model = models.find(m => m.id === selectedModel)
    return model?.displayName || 'Selected'
  }

  const getSelectedCollectionNames = () => {
    if (selectedCollections.length === 0) return 'All Collections'
    if (selectedCollections.length === 1) {
      return collections.find(c => c.id === selectedCollections[0])?.name || 'Selected'
    }
    return `${selectedCollections.length} collections`
  }

  const formatSessionDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return date.toLocaleDateString()
  }

  const toggleCollection = (collectionId: string) => {
    setSelectedCollections(prev => {
      if (prev.includes(collectionId)) {
        return prev.filter(id => id !== collectionId)
      }
      return [...prev, collectionId]
    })
  }

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-4 sm:-m-6 lg:-m-8">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-72' : 'w-0'} flex-shrink-0 bg-gray-900 text-white overflow-hidden transition-all duration-200`}>
        <div className="flex flex-col h-full w-72">
          {/* New Chat Button */}
          <div className="p-4">
            <button
              onClick={createNewSession}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Chat
            </button>
          </div>

          {/* Chat History */}
          <div className="flex-1 overflow-y-auto px-3">
            {loadingSessions ? (
              <div className="text-center text-gray-500 py-8">Loading...</div>
            ) : sessions.length === 0 ? (
              <div className="text-center text-gray-500 py-8 px-4">
                <p className="text-sm">No conversations yet</p>
                <p className="text-xs mt-1">Start a new chat to begin</p>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-500 uppercase px-3 py-2">
                  Recent Chats
                </div>
                {sessions.map(session => (
                  <div
                    key={session.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectSession(session.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectSession(session.id);
                      }
                    }}
                    className={`w-full cursor-pointer text-left px-3 py-2 rounded-lg group flex items-center justify-between ${
                      currentSessionId === session.id
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm">{session.title}</div>
                      <div className="text-xs text-gray-500">
                        {session.messageCount} messages · {formatSessionDate(session.updatedAt)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteSession(session.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-600 rounded transition-opacity"
                      title="Delete chat"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Chat Area (row: chat column + optional graph panel) */}
      <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col bg-gray-50 text-gray-900 min-w-0">
        {/* Header — flex-wrap so toggles fall to a new row when the column is
            narrow (e.g. when graph mode steals horizontal space). */}
        <header className="flex flex-wrap items-center justify-between gap-y-2 gap-x-3 px-4 py-3 bg-white border-b">
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Sidebar Toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0"
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <h1 className="text-lg font-semibold text-gray-900 whitespace-nowrap">OppMon Chat</h1>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
            {/* Model Selector */}
            <div className="relative" ref={modelDropdownRef}>
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="max-w-[120px] truncate">{getSelectedModelName()}</span>
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showModelDropdown && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-72 overflow-y-auto">
                  {models.length === 0 ? (
                    <div className="px-4 py-3">
                      <p className="text-sm text-gray-500 mb-2">No custom models configured</p>
                      <p className="text-xs text-gray-400 mb-3">Using default Claude model. Add custom models in Admin.</p>
                      <a
                        href="/admin/models"
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Configure Models →
                      </a>
                    </div>
                  ) : (
                    models.map(model => (
                      <button
                        key={model.id}
                        onClick={() => {
                          setSelectedModel(model.id)
                          setShowModelDropdown(false)
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between ${
                          selectedModel === model.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div>
                          <div className="font-medium text-gray-900">{model.displayName}</div>
                          <div className="text-xs text-gray-500">{model.modelIdentifier}</div>
                        </div>
                        {selectedModel === model.id && (
                          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Collection Selector */}
            <div className="relative" ref={collectionDropdownRef}>
              <button
                onClick={() => setShowCollectionDropdown(!showCollectionDropdown)}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span className="max-w-[120px] truncate">{getSelectedCollectionNames()}</span>
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showCollectionDropdown && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-72 overflow-y-auto">
                  {collections.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500">No collections available</div>
                  ) : (
                    <>
                      <div className="px-4 py-2 text-xs font-medium text-gray-500 border-b">
                        Select knowledge bases
                      </div>
                      {collections.map(collection => (
                        <label
                          key={collection.id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedCollections.includes(collection.id)}
                            onChange={() => toggleCollection(collection.id)}
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">{collection.name}</div>
                            <div className="text-xs text-gray-500">
                              {collection.scope === 'TENANT' ? 'Tenant-wide' : collection.team_name || 'Team'}
                            </div>
                          </div>
                        </label>
                      ))}
                      {selectedCollections.length > 0 && (
                        <div className="border-t px-4 py-2">
                          <button
                            onClick={() => setSelectedCollections([])}
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            Clear selection
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Tools Toggle */}
            <label className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={enableTools}
                onChange={(e) => setEnableTools(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-gray-700">Tools</span>
            </label>

            {/* Web Fallback Toggle */}
            <label className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={enableWebFallback}
                onChange={(e) => setEnableWebFallback(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <span className="text-gray-700">Web</span>
            </label>

            {/* Graph-mode Toggle — shows the planner+searcher graph live on the right. */}
            <label
              className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg cursor-pointer transition-colors ${
                graphMode
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
              }`}
              title="Show how the agent thinks: live graph of sub-questions, searches, and synthesis."
            >
              <input
                type="checkbox"
                checked={graphMode}
                onChange={(e) => setGraphMode(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="6" cy="6" r="2" strokeWidth={2} />
                <circle cx="18" cy="6" r="2" strokeWidth={2} />
                <circle cx="12" cy="18" r="2" strokeWidth={2} />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7.5 7.5l3.5 9M16.5 7.5l-3.5 9" />
              </svg>
              <span>Graph</span>
            </label>
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            // Welcome Screen
            <div className="h-full flex flex-col items-center justify-center px-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">How can I help you today?</h2>
              <p className="text-gray-500 mb-8 text-center max-w-md">
                I'm your AI assistant. Ask me anything about your documents, workflows, or platform.
              </p>

              {/* Suggested Prompts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
                {suggestedPrompts.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => handleSubmit(prompt.text)}
                    className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 text-left transition-colors"
                  >
                    <span className="text-xl">{prompt.icon}</span>
                    <span className="text-sm text-gray-700">{prompt.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // Messages
            <div className="max-w-3xl mx-auto px-4 py-6">
              {messages.map(message => (
                <div key={message.id} className={`mb-6 ${message.role === 'user' ? 'flex justify-end' : ''}`}>
                  <div className={`max-w-[85%] ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-3'
                      : 'bg-white text-gray-900 border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm'
                  }`}>
                    <div className="break-words text-inherit">
                      {message.role === 'user' ? (
                        <span className="whitespace-pre-wrap">{message.content}</span>
                      ) : (
                        <div className="markdown-content">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              // Headings
                              h1: ({children}) => <h1 className="text-xl font-bold text-gray-900 mt-4 mb-2 first:mt-0">{children}</h1>,
                              h2: ({children}) => <h2 className="text-lg font-semibold text-gray-900 mt-3 mb-2">{children}</h2>,
                              h3: ({children}) => <h3 className="text-base font-semibold text-gray-900 mt-3 mb-1">{children}</h3>,
                              // Paragraphs
                              p: ({children}) => <p className="text-gray-800 my-2 leading-relaxed">{children}</p>,
                              // Links
                              a: ({href, children}) => (
                                <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                                  {children}
                                </a>
                              ),
                              // Lists
                              ul: ({children}) => <ul className="list-disc list-inside my-2 space-y-1 text-gray-800">{children}</ul>,
                              ol: ({children}) => <ol className="list-decimal list-inside my-2 space-y-1 text-gray-800">{children}</ol>,
                              li: ({children}) => <li className="text-gray-800">{children}</li>,
                              // Code
                              code: ({className, children, ...props}) => {
                                const isInline = !className;
                                if (isInline) {
                                  return (
                                    <code className="bg-gray-100 text-pink-600 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                                      {children}
                                    </code>
                                  );
                                }
                                return (
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                );
                              },
                              // Code blocks
                              pre: ({children}) => (
                                <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 my-3 overflow-x-auto text-sm">
                                  {children}
                                </pre>
                              ),
                              // Blockquotes
                              blockquote: ({children}) => (
                                <blockquote className="border-l-4 border-blue-500 pl-4 my-3 text-gray-600 italic">
                                  {children}
                                </blockquote>
                              ),
                              // Tables
                              table: ({children}) => (
                                <div className="overflow-x-auto my-3">
                                  <table className="min-w-full border border-gray-200 rounded-lg">
                                    {children}
                                  </table>
                                </div>
                              ),
                              th: ({children}) => <th className="bg-gray-100 px-3 py-2 text-left text-sm font-semibold text-gray-900 border-b">{children}</th>,
                              td: ({children}) => <td className="px-3 py-2 text-sm text-gray-800 border-b">{children}</td>,
                              // Horizontal rule
                              hr: () => <hr className="my-4 border-gray-200" />,
                              // Strong/Bold
                              strong: ({children}) => <strong className="font-semibold text-gray-900">{children}</strong>,
                              // Emphasis/Italic
                              em: ({children}) => <em className="italic">{children}</em>,
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      )}
                      {message.isStreaming && (
                        <span className="inline-block w-2 h-5 ml-1 bg-current animate-pulse" />
                      )}
                    </div>

                    {/* Citations - Clickable to open documents */}
                    {message.citations && message.citations.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="text-xs font-medium text-gray-500 mb-2">Sources</div>
                        <div className="space-y-2">
                          {message.citations.map((citation, idx) => {
                            const isWebSource = citation.source === 'web'
                            const href = isWebSource
                              ? citation.url
                              : `/admin/rag/documents/${citation.documentId}`

                            return (
                              <a
                                key={idx}
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-2 text-xs p-2 -mx-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group"
                              >
                                <span className="font-medium text-blue-600 group-hover:text-blue-800">[{citation.index}]</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-700 group-hover:text-blue-700 flex items-center gap-1">
                                    {isWebSource ? (
                                      <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                      </svg>
                                    ) : (
                                      <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                    )}
                                    <span className="truncate">{citation.documentTitle}</span>
                                    {citation.pageNumber && (
                                      <span className="text-gray-400 flex-shrink-0">p.{citation.pageNumber}</span>
                                    )}
                                  </div>
                                  {citation.chunkText && (
                                    <div className="text-gray-500 line-clamp-2 mt-0.5">{citation.chunkText}</div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <span className="text-green-600 font-medium">
                                    {Math.round(citation.score * 100)}%
                                  </span>
                                  <svg className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </div>
                              </a>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 bg-white border-t">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question..."
                disabled={isLoading}
                rows={1}
                className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 text-gray-900"
                style={{ maxHeight: '120px' }}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
      {/* Drag handle + right-side agent graph panel — visible only in graph mode. */}
      {graphMode && (
        <>
          {/* Resize handle. Always-visible 4px gray bar with grip dots so
              users can actually find and grab it. Hover/active swaps to indigo. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize agent graph panel"
            onMouseDown={(e) => {
              e.preventDefault()
              startResize()
            }}
            onDoubleClick={() => setGraphPanelWidth(clampGraphWidth(520))}
            title="Drag to resize · double-click to reset to 520px"
            className="group relative w-1 flex-shrink-0 cursor-col-resize bg-gray-300 hover:bg-indigo-400 active:bg-indigo-500 transition-colors"
          >
            {/* Wider invisible hit-target on top of the visible 4px bar — easier to grab. */}
            <span className="absolute inset-y-0 -left-1.5 -right-1.5" aria-hidden />
            {/* Always-visible grip dots, centered vertically. */}
            <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1">
              <span className="block w-1 h-1 rounded-full bg-white shadow-sm" />
              <span className="block w-1 h-1 rounded-full bg-white shadow-sm" />
              <span className="block w-1 h-1 rounded-full bg-white shadow-sm" />
            </div>
          </div>
          <aside
            className="flex-shrink-0 border-l border-gray-200 bg-white flex flex-col"
            style={{ width: `${graphPanelWidth}px` }}
          >
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-900">Agent Graph</h2>
                <p className="text-[11px] text-gray-500 truncate">
                  Live planner → searcher decomposition · {graphPanelWidth}px
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setGraphPanelWidth(clampGraphWidth(graphPanelWidth - 80))}
                  className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                  title="Narrower"
                  aria-label="Make graph panel narrower"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setGraphPanelWidth(clampGraphWidth(graphPanelWidth + 80))}
                  className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                  title="Wider"
                  aria-label="Make graph panel wider"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    graphState?.done
                      ? 'bg-emerald-100 text-emerald-700'
                      : graphState
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {graphState?.done ? 'done' : graphState ? 'live' : 'idle'}
                </span>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <AgentGraphPanel
                state={graphState}
                emptyHint="Ask a multi-part question (e.g. 'compare CRISPR-Cas9 and Cas12') to see the agent decompose it."
              />
            </div>
          </aside>
        </>
      )}
      </div>
    </div>
  )
}
