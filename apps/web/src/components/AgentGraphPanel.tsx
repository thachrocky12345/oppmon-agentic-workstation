'use client'

/**
 * AgentGraphPanel
 *
 * Renders the live "how the agent thinks" graph for the chat page in graph
 * mode. Consumes the SSE state from KnowledgeSearchBackend's /solve_v2
 * (or any source that emits the same {response: {nodes, adj, references},
 * current_node} envelope) and draws it as a top-down DAG using @xyflow/react.
 *
 * Visual contract:
 *   - root node at top, searcher children below, optional `response` node
 *     at the bottom once the planner finalizes.
 *   - Per-node state colors:
 *       pending      (state 2)  — dashed gray
 *       in-progress  (state 1)  — pulsing blue (also when current_node matches)
 *       complete     (state 3)  — solid green
 *   - Source badge on searchers: rag / web / both / none.
 *
 * No backend calls — pure presentation. The parent (chat page) owns the
 * graph state and updates it as SSE events arrive.
 */

import { useMemo, memo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

// ============================================================================
// Public types — mirror /solve_v2 payload shape
// ============================================================================

export type NodeState = 1 | 2 | 3 // 1=in-progress, 2=pending, 3=complete
export type AgentNodeType = 'root' | 'searcher' | 'end'
export type AgentSource = 'rag' | 'web' | 'both' | 'none' | null

export interface AgentNode {
  content: string
  type: AgentNodeType
  response?: string
  source?: AgentSource
  citations?: Array<{
    index: number
    source?: string
    title?: string
    url?: string
  }>
  detail?: {
    iterations?: number
    tool_errors?: string[]
  }
}

export interface AdjEdge {
  id: string
  name: string // child node id
  state: NodeState
}

export interface AgentGraphState {
  nodes: Record<string, AgentNode>
  /** Flat adjacency: parent -> children edges */
  adj: Record<string, AdjEdge[]>
  references: Record<string, string>
  currentNode: string | null
  /** True once the planner emits state=END */
  done: boolean
}

interface AgentGraphPanelProps {
  state: AgentGraphState | null
  /** Show empty-state hint when the graph hasn't started yet. */
  emptyHint?: string
}

// ============================================================================
// Layout — simple BFS levels, evenly spaced per level
// ============================================================================

const NODE_WIDTH = 240
const LEVEL_HEIGHT = 130
const COL_GAP = 16

interface Positioned {
  id: string
  x: number
  y: number
  level: number
}

function layoutGraph(adj: Record<string, AdjEdge[]>, nodes: Record<string, AgentNode>): Positioned[] {
  const known = new Set(Object.keys(nodes))
  if (!known.has('root')) return []

  // BFS to assign levels.
  const level: Record<string, number> = { root: 0 }
  const queue: string[] = ['root']
  while (queue.length) {
    const cur = queue.shift()!
    for (const e of adj[cur] || []) {
      if (!known.has(e.name)) continue
      if (level[e.name] === undefined) {
        level[e.name] = level[cur] + 1
        queue.push(e.name)
      }
    }
  }

  // Catch detached nodes (e.g. `response` added by finalize without an edge).
  for (const id of known) {
    if (level[id] === undefined) {
      // place under the deepest existing level so it shows up at the bottom
      const maxLevel = Math.max(0, ...Object.values(level))
      level[id] = maxLevel + (id === 'response' ? 1 : 0) || 1
    }
  }

  // Group by level, then assign x positions evenly.
  const byLevel: Record<number, string[]> = {}
  for (const [id, lvl] of Object.entries(level)) {
    byLevel[lvl] ||= []
    byLevel[lvl].push(id)
  }

  const positioned: Positioned[] = []
  const sortedLevels = Object.keys(byLevel).map(Number).sort((a, b) => a - b)
  for (const lvl of sortedLevels) {
    const ids = byLevel[lvl]
    const totalWidth = ids.length * NODE_WIDTH + (ids.length - 1) * COL_GAP
    const startX = -totalWidth / 2
    ids.forEach((id, i) => {
      positioned.push({
        id,
        x: startX + i * (NODE_WIDTH + COL_GAP),
        y: lvl * LEVEL_HEIGHT,
        level: lvl,
      })
    })
  }
  return positioned
}

// ============================================================================
// Custom node renderer
// ============================================================================

interface NodeData {
  label: string
  nodeType: AgentNodeType
  state: NodeState
  source?: AgentSource
  isCurrent: boolean
  answer?: string
  citations?: AgentNode['citations']
}

const stateClasses: Record<NodeState, string> = {
  1: 'border-blue-400 bg-blue-50 shadow-blue-200 animate-pulse',
  2: 'border-gray-300 bg-gray-50 border-dashed',
  3: 'border-emerald-400 bg-emerald-50',
}

const sourceBadge: Record<NonNullable<AgentSource>, { label: string; cls: string }> = {
  rag: { label: 'RAG', cls: 'bg-violet-100 text-violet-700 border-violet-300' },
  web: { label: 'WEB', cls: 'bg-sky-100 text-sky-700 border-sky-300' },
  both: { label: 'BOTH', cls: 'bg-amber-100 text-amber-700 border-amber-300' },
  none: { label: 'NONE', cls: 'bg-gray-100 text-gray-500 border-gray-300' },
}

const AgentGraphNode = memo(function AgentGraphNode({ data }: NodeProps) {
  // NodeProps's data type is unknown at compile time; assert via cast.
  const d = data as unknown as NodeData

  const isRoot = d.nodeType === 'root'
  const isEnd = d.nodeType === 'end'

  const borderCls = isRoot
    ? 'border-indigo-500 bg-indigo-50'
    : isEnd
      ? 'border-emerald-500 bg-emerald-100 ring-2 ring-emerald-200'
      : stateClasses[d.state] || stateClasses[2]

  const ringCls = d.isCurrent ? 'ring-2 ring-blue-400 ring-offset-1' : ''

  return (
    <div
      className={`rounded-lg border-2 ${borderCls} ${ringCls} p-3 shadow-sm`}
      style={{ width: NODE_WIDTH }}
    >
      {!isRoot && <Handle type="target" position={Position.Top} className="!bg-gray-400" />}
      <div className="flex items-center justify-between gap-2 mb-1">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider ${
            isRoot ? 'text-indigo-700' : isEnd ? 'text-emerald-700' : 'text-gray-500'
          }`}
        >
          {isRoot ? 'question' : isEnd ? 'answer' : d.state === 3 ? 'done' : d.state === 1 ? 'searching…' : 'queued'}
        </span>
        {d.source && d.source !== null && sourceBadge[d.source] && (
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${sourceBadge[d.source].cls}`}
            title={`Grounding source: ${d.source}`}
          >
            {sourceBadge[d.source].label}
          </span>
        )}
      </div>
      <div className="text-xs text-gray-900 leading-snug line-clamp-3" title={d.label}>
        {d.label}
      </div>
      {d.answer && d.state === 3 && !isRoot && (
        <div
          className="mt-2 pt-2 border-t border-gray-200 text-[11px] text-gray-600 leading-snug line-clamp-3"
          title={d.answer}
        >
          {d.answer}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  )
})

const nodeTypes = { agentNode: AgentGraphNode }

// ============================================================================
// Panel component
// ============================================================================

export default function AgentGraphPanel({ state, emptyHint }: AgentGraphPanelProps) {
  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (!state) return { nodes: [], edges: [] }
    const positioned = layoutGraph(state.adj, state.nodes)

    const rfNodes: Node[] = positioned.map((p) => {
      const n = state.nodes[p.id]
      // For root we display the user's question. For searchers, the sub-question.
      const label = n?.content || p.id

      // Determine state for searcher nodes by looking up incoming edge state.
      // Default to 2 (queued). The planner finalize uses type='end'.
      let nodeState: NodeState = 2
      if (n?.type === 'root') nodeState = 3
      else if (n?.type === 'end') nodeState = 3
      else {
        // find any parent edge pointing at p.id
        outer: for (const parent of Object.keys(state.adj)) {
          for (const e of state.adj[parent]) {
            if (e.name === p.id) {
              nodeState = e.state as NodeState
              break outer
            }
          }
        }
        // If the node has a `response` filled, treat as complete.
        if (n?.response) nodeState = 3
      }

      const data: NodeData = {
        label,
        nodeType: (n?.type as AgentNodeType) || 'searcher',
        state: nodeState,
        source: (n?.source ?? null) as AgentSource,
        isCurrent: state.currentNode === p.id,
        answer: n?.response,
        citations: n?.citations,
      }
      return {
        id: p.id,
        type: 'agentNode',
        position: { x: p.x, y: p.y },
        data: data as unknown as Record<string, unknown>,
        draggable: false,
      }
    })

    const rfEdges: Edge[] = []
    for (const parent of Object.keys(state.adj)) {
      for (const e of state.adj[parent]) {
        rfEdges.push({
          id: e.id,
          source: parent,
          target: e.name,
          animated: e.state === 1,
          style: {
            stroke: e.state === 3 ? '#10b981' : e.state === 1 ? '#3b82f6' : '#cbd5e1',
            strokeWidth: 2,
          },
        })
      }
    }
    return { nodes: rfNodes, edges: rfEdges }
  }, [state])

  if (!state || Object.keys(state.nodes).length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-center px-6 text-gray-500">
        <div>
          <div className="text-3xl mb-2">🕸️</div>
          <p className="text-sm">{emptyHint || 'Ask a question to see how the agent thinks.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-gray-50 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.0 }}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="#e2e8f0" />
        <Controls showInteractive={false} className="!shadow-md" />
      </ReactFlow>
      {state.done && (
        <div className="absolute top-3 right-3 px-2 py-1 rounded bg-emerald-100 border border-emerald-300 text-[11px] font-semibold text-emerald-700">
          ✓ Done
        </div>
      )}
    </div>
  )
}
