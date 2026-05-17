// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

/**
 * Infrastructure Page
 *
 * Monitor infrastructure nodes and topology.
 */

import { useState, useEffect } from 'react'

interface Node {
  id: string
  name: string
  type: 'gateway' | 'worker' | 'database' | 'cache'
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  region: string
  metrics: {
    cpu: number
    memory: number
    disk: number
    connections: number
  }
  lastCheck: string
}

interface Topology {
  nodes: Array<{
    id: string
    name: string
    type: string
    x: number
    y: number
  }>
  edges: Array<{
    source: string
    target: string
    type: string
  }>
}

export default function InfrastructurePage() {
  const [nodes, setNodes] = useState<Node[]>([])
  const [topology, setTopology] = useState<Topology | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [view, setView] = useState<'list' | 'topology'>('list')

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      const [nodesRes, topoRes] = await Promise.all([
        fetch('/api/infra/nodes', { credentials: 'include' }),
        fetch('/api/infra/topology', { credentials: 'include' }),
      ])

      if (nodesRes.ok) {
        const data = await nodesRes.json()
        setNodes(data.data || [])
      }
      if (topoRes.ok) {
        const data = await topoRes.json()
        setTopology(data.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load infrastructure data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'healthy': return 'bg-green-100 text-green-800'
      case 'degraded': return 'bg-yellow-100 text-yellow-800'
      case 'unhealthy': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const getStatusDot = (status: string): string => {
    switch (status) {
      case 'healthy': return 'bg-green-500'
      case 'degraded': return 'bg-yellow-500'
      case 'unhealthy': return 'bg-red-500'
      default: return 'bg-gray-400'
    }
  }

  const getTypeIcon = (type: string): string => {
    switch (type) {
      case 'gateway': return '🌐'
      case 'worker': return '⚙️'
      case 'database': return '🗄️'
      case 'cache': return '💾'
      default: return '📦'
    }
  }

  const healthyCount = nodes.filter(n => n.status === 'healthy').length
  const totalCount = nodes.length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading infrastructure...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Infrastructure</h1>
          <p className="text-gray-500">
            {healthyCount}/{totalCount} nodes healthy
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('list')}
            className={`px-4 py-2 rounded-lg ${view === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            List
          </button>
          <button
            onClick={() => setView('topology')}
            className={`px-4 py-2 rounded-lg ${view === 'topology' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            Topology
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Status Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-green-500"></div>
            <span className="text-sm text-gray-500">Healthy</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {nodes.filter(n => n.status === 'healthy').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
            <span className="text-sm text-gray-500">Degraded</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {nodes.filter(n => n.status === 'degraded').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-500"></div>
            <span className="text-sm text-gray-500">Unhealthy</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {nodes.filter(n => n.status === 'unhealthy').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-gray-400"></div>
            <span className="text-sm text-gray-500">Unknown</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {nodes.filter(n => n.status === 'unknown').length}
          </p>
        </div>
      </div>

      {view === 'list' ? (
        /* Nodes List */
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {nodes.length === 0 ? (
            <div className="p-12 text-center">
              <span className="text-6xl block mb-4">🏗️</span>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No infrastructure nodes</h2>
              <p className="text-gray-500">Infrastructure nodes will appear here when registered</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Node</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Region</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">CPU</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Memory</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Check</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {nodes.map((node) => (
                  <tr
                    key={node.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedNode(node)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{getTypeIcon(node.type)}</span>
                        <div>
                          <p className="font-medium text-gray-900">{node.name}</p>
                          <p className="text-xs text-gray-500">{node.type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(node.status)}`}>
                        {node.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{node.region}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${node.metrics.cpu > 80 ? 'bg-red-500' : node.metrics.cpu > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                            style={{ width: `${node.metrics.cpu}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-500">{node.metrics.cpu}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${node.metrics.memory > 80 ? 'bg-red-500' : node.metrics.memory > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                            style={{ width: `${node.metrics.memory}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-500">{node.metrics.memory}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(node.lastCheck).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        /* Topology View */
        <div className="bg-white rounded-lg shadow p-6">
          <div className="h-96 flex items-center justify-center bg-gray-50 rounded-lg">
            {topology ? (
              <div className="text-center">
                <p className="text-gray-500 mb-4">Topology visualization</p>
                <p className="text-sm text-gray-400">
                  {topology.nodes.length} nodes, {topology.edges.length} connections
                </p>
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  {topology.nodes.map((node) => (
                    <div
                      key={node.id}
                      className="px-3 py-2 bg-white rounded-lg shadow border"
                    >
                      <span className="text-lg mr-2">{getTypeIcon(node.type)}</span>
                      <span className="text-sm">{node.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-gray-500">No topology data available</p>
            )}
          </div>
        </div>
      )}

      {/* Node Detail Modal */}
      {selectedNode && (
        <NodeDetailModal
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  )
}

function NodeDetailModal({
  node,
  onClose,
}: {
  node: Node
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">{node.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-500">Type</p>
              <p className="font-medium text-gray-900">{node.type}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <p className="font-medium text-gray-900">{node.status}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Region</p>
              <p className="font-medium text-gray-900">{node.region}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Last Check</p>
              <p className="font-medium text-gray-900">{new Date(node.lastCheck).toLocaleString()}</p>
            </div>
          </div>

          <h3 className="font-semibold text-gray-900 mb-3">Metrics</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">CPU</span>
                <span className="text-gray-900">{node.metrics.cpu}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${node.metrics.cpu > 80 ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${node.metrics.cpu}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">Memory</span>
                <span className="text-gray-900">{node.metrics.memory}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${node.metrics.memory > 80 ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${node.metrics.memory}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">Disk</span>
                <span className="text-gray-900">{node.metrics.disk}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${node.metrics.disk > 80 ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${node.metrics.disk}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Connections</span>
                <span className="text-gray-900">{node.metrics.connections}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
