'use client'

import { CodeSnippet, TutorialSection } from '@/components/tutorial'
import Link from 'next/link'

export default function RAGPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">RAG & Chat</h1>
        <p className="text-gray-400">
          Retrieval-Augmented Generation for team knowledge. Ask questions grounded in your documents.
        </p>
      </div>

      {/* Overview */}
      <TutorialSection
        id="overview"
        icon={
          <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        }
        iconBg="bg-cyan-500/20"
        title="What is RAG?"
      >
        <div className="space-y-4">
          <p className="text-gray-400">
            RAG (Retrieval-Augmented Generation) combines semantic search with LLM responses.
            When you ask a question, the system:
          </p>
          <ol className="space-y-2 text-gray-400">
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 font-medium">1.</span>
              <span>Converts your question into a vector embedding</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 font-medium">2.</span>
              <span>Searches for similar content in your team&apos;s documents</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 font-medium">3.</span>
              <span>Passes the relevant context to the LLM</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 font-medium">4.</span>
              <span>Returns an answer grounded in your actual documentation</span>
            </li>
          </ol>

          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mt-4">
            <p className="text-green-400 font-medium">Tenant Isolation</p>
            <p className="text-gray-400 text-sm mt-1">
              The <code className="text-green-400">tenant_id</code> filter is applied at the SQL layer,
              not in application code. Cross-tenant access is architecturally impossible.
            </p>
          </div>
        </div>
      </TutorialSection>

      {/* Using RAG Chat */}
      <TutorialSection
        id="using-rag"
        icon={
          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        }
        iconBg="bg-blue-500/20"
        title="Using RAG Chat"
      >
        <div className="space-y-6">
          <div>
            <h4 className="text-white font-medium mb-3">Via Web Interface</h4>
            <p className="text-gray-400 text-sm mb-3">
              Navigate to <Link href="/chat" className="text-green-400 hover:underline">/chat</Link> to
              use the RAG-powered chat interface. The chat widget is also available on any dashboard page.
            </p>
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Via CLI</h4>
            <CodeSnippet
              code={`# Search for information
node dist/index.js rag search "how does authentication work"

# Get an AI-generated answer
node dist/index.js rag query "explain the database schema"`}
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Via API</h4>
            <CodeSnippet
              code={`curl -X POST http://localhost:3001/api/rag/chat \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -d '{
    "message": "What is the API rate limit policy?",
    "collectionId": "optional-collection-id"
  }'`}
              language="bash"
            />
          </div>
        </div>
      </TutorialSection>

      {/* Ingesting Documents */}
      <TutorialSection
        id="ingesting"
        icon={
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        }
        iconBg="bg-purple-500/20"
        title="Ingesting Documents"
      >
        <div className="space-y-6">
          <div>
            <h4 className="text-white font-medium mb-3">Via CLI</h4>
            <CodeSnippet
              code={`# Single file
node dist/index.js rag ingest README.md

# Entire directory
node dist/index.js rag ingest-dir ./docs

# Specific file types
node dist/index.js rag ingest-dir ./docs --pattern "*.md"`}
              language="bash"
            />
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Via Admin Dashboard</h4>
            <p className="text-gray-400 text-sm">
              Navigate to <Link href="/admin/rag" className="text-green-400 hover:underline">/admin/rag</Link> to
              manage RAG collections, upload documents, and view ingestion status.
            </p>
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Supported Formats</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white/5 rounded-lg p-3 border border-white/10 text-center">
                <span className="text-2xl block mb-1">📝</span>
                <span className="text-gray-400 text-sm">.md</span>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/10 text-center">
                <span className="text-2xl block mb-1">📄</span>
                <span className="text-gray-400 text-sm">.txt</span>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/10 text-center">
                <span className="text-2xl block mb-1">📜</span>
                <span className="text-gray-400 text-sm">.pdf</span>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/10 text-center">
                <span className="text-2xl block mb-1">📊</span>
                <span className="text-gray-400 text-sm">.docx</span>
              </div>
            </div>
          </div>
        </div>
      </TutorialSection>

      {/* Hybrid Search */}
      <TutorialSection
        id="hybrid-search"
        icon={
          <svg className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        }
        iconBg="bg-orange-500/20"
        title="Hybrid Search"
      >
        <div className="space-y-4">
          <p className="text-gray-400">
            OppMon uses a hybrid search approach combining three methods for optimal results:
          </p>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h5 className="text-white font-medium mb-2">BM25 (Keyword)</h5>
              <p className="text-gray-500 text-sm">
                Traditional keyword matching for exact terms and technical vocabulary.
              </p>
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h5 className="text-white font-medium mb-2">Vector (Semantic)</h5>
              <p className="text-gray-500 text-sm">
                Embedding-based similarity for understanding meaning and context.
              </p>
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h5 className="text-white font-medium mb-2">RRF (Fusion)</h5>
              <p className="text-gray-500 text-sm">
                Reciprocal Rank Fusion combines results from both methods optimally.
              </p>
            </div>
          </div>

          <div className="bg-black/30 rounded-lg p-4 border border-white/10 mt-4">
            <p className="text-gray-400 text-sm">
              <strong className="text-white">Why hybrid?</strong> Pure vector search can miss exact matches
              (like error codes), while pure keyword search misses semantic similarity. Combining both
              gives the best of both worlds.
            </p>
          </div>
        </div>
      </TutorialSection>

      {/* Collections */}
      <TutorialSection
        id="collections"
        icon={
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        }
        iconBg="bg-green-500/20"
        title="Collections"
      >
        <div className="space-y-4">
          <p className="text-gray-400">
            Organize documents into collections for better organization and scoped queries.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h5 className="text-white font-medium mb-2">Team-Scoped</h5>
              <p className="text-gray-500 text-sm">
                Collections can be scoped to specific teams, ensuring developers only see relevant docs.
              </p>
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h5 className="text-white font-medium mb-2">Query Targeting</h5>
              <p className="text-gray-500 text-sm">
                Search within specific collections or across all your documents.
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">Managing Collections</h4>
            <p className="text-gray-400 text-sm">
              Use the <Link href="/admin/rag" className="text-green-400 hover:underline">RAG Admin</Link> to
              create, edit, and delete collections. You can also set default collections per team.
            </p>
          </div>
        </div>
      </TutorialSection>
    </div>
  )
}
