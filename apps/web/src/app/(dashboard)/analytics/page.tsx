'use client'

/**
 * Analytics Page
 *
 * Comprehensive analytics for agents, models, errors, and performance.
 */

import { useState, useEffect } from 'react'

interface AnalyticsOverview {
  totalRequests: number
  totalTokens: number
  totalCost: number
  avgLatency: number
  errorRate: number
}

interface AgentAnalytics {
  agentId: string
  agentName: string
  requests: number
  tokens: number
  cost: number
  errorRate: number
}

interface ModelAnalytics {
  model: string
  provider: string
  requests: number
  tokens: number
  cost: number
  avgLatency: number
}

interface ErrorAnalytics {
  type: string
  count: number
  percentage: number
  lastOccurred: string
}

interface PerformanceData {
  timestamp: string
  latency: number
  throughput: number
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [agentStats, setAgentStats] = useState<AgentAnalytics[]>([])
  const [modelStats, setModelStats] = useState<ModelAnalytics[]>([])
  const [errorStats, setErrorStats] = useState<ErrorAnalytics[]>([])
  const [performance, setPerformance] = useState<PerformanceData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('7d')

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      const [overviewRes, agentsRes, modelsRes, errorsRes, perfRes] = await Promise.all([
        fetch(`/api/analytics/overview?period=${period}`, { credentials: 'include' }),
        fetch(`/api/analytics/agents?period=${period}`, { credentials: 'include' }),
        fetch(`/api/analytics/models?period=${period}`, { credentials: 'include' }),
        fetch(`/api/analytics/errors?period=${period}`, { credentials: 'include' }),
        fetch(`/api/analytics/performance?period=${period}`, { credentials: 'include' }),
      ])

      if (overviewRes.ok) {
        const data = await overviewRes.json()
        setOverview(data.data)
      }
      if (agentsRes.ok) {
        const data = await agentsRes.json()
        setAgentStats(data.data || [])
      }
      if (modelsRes.ok) {
        const data = await modelsRes.json()
        setModelStats(data.data || [])
      }
      if (errorsRes.ok) {
        const data = await errorsRes.json()
        setErrorStats(data.data || [])
      }
      if (perfRes.ok) {
        const data = await perfRes.json()
        setPerformance(data.data || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [period])

  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toLocaleString()
  }

  const formatCurrency = (n: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(n)
  }

  const maxLatency = performance.length > 0 ? Math.max(...performance.map(p => p.latency), 1) : 1

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading analytics...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500">Platform usage and performance metrics</p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as '24h' | '7d' | '30d')}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
        >
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Total Requests</p>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(overview?.totalRequests || 0)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Total Tokens</p>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(overview?.totalTokens || 0)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Total Cost</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(overview?.totalCost || 0)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Avg Latency</p>
          <p className="text-2xl font-bold text-gray-900">{overview?.avgLatency || 0}ms</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Error Rate</p>
          <p className="text-2xl font-bold text-gray-900">{((overview?.errorRate || 0) * 100).toFixed(2)}%</p>
        </div>
      </div>

      {/* Performance Chart */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Latency Over Time</h2>
        {performance.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-gray-500">
            No performance data available
          </div>
        ) : (
          <div className="h-48 flex items-end gap-1">
            {performance.map((point, i) => {
              const height = (point.latency / maxLatency) * 100
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center"
                  title={`${new Date(point.timestamp).toLocaleString()}: ${point.latency}ms`}
                >
                  <div
                    className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-pointer"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Agent */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">By Agent</h2>
          {agentStats.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No agent data available</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                    <th className="pb-3">Agent</th>
                    <th className="pb-3 text-right">Requests</th>
                    <th className="pb-3 text-right">Cost</th>
                    <th className="pb-3 text-right">Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {agentStats.slice(0, 10).map((agent) => (
                    <tr key={agent.agentId}>
                      <td className="py-3 text-sm font-medium text-gray-900">{agent.agentName}</td>
                      <td className="py-3 text-sm text-gray-500 text-right">{formatNumber(agent.requests)}</td>
                      <td className="py-3 text-sm text-gray-500 text-right">{formatCurrency(agent.cost)}</td>
                      <td className="py-3 text-sm text-right">
                        <span className={agent.errorRate > 0.05 ? 'text-red-600' : 'text-gray-500'}>
                          {(agent.errorRate * 100).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* By Model */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">By Model</h2>
          {modelStats.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No model data available</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                    <th className="pb-3">Model</th>
                    <th className="pb-3 text-right">Requests</th>
                    <th className="pb-3 text-right">Tokens</th>
                    <th className="pb-3 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {modelStats.map((model) => (
                    <tr key={model.model}>
                      <td className="py-3">
                        <div className="text-sm font-medium text-gray-900">{model.model}</div>
                        <div className="text-xs text-gray-500">{model.provider}</div>
                      </td>
                      <td className="py-3 text-sm text-gray-500 text-right">{formatNumber(model.requests)}</td>
                      <td className="py-3 text-sm text-gray-500 text-right">{formatNumber(model.tokens)}</td>
                      <td className="py-3 text-sm text-gray-500 text-right">{formatCurrency(model.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Errors */}
      <div className="mt-6 bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Error Breakdown</h2>
        {errorStats.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <span className="text-4xl block mb-2">✅</span>
            <p>No errors recorded in this period</p>
          </div>
        ) : (
          <div className="space-y-3">
            {errorStats.map((err) => (
              <div key={err.type} className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-900">{err.type}</span>
                    <span className="text-gray-500">{err.count} ({err.percentage.toFixed(1)}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full"
                      style={{ width: `${err.percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
