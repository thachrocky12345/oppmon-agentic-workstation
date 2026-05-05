'use client'

/**
 * Usage Dashboard Page
 *
 * Display usage analytics with charts and aggregation.
 * CRITICAL: Shows counts only, no user-level data.
 */

import { useState, useEffect } from 'react'

interface UsageData {
  period: string
  totalEvents: number
  timeSeries: Array<{
    timestamp: string
    count: number
  }>
  byResourceType: Array<{
    resourceType: string
    count: number
  }>
  byAction: Array<{
    action: string
    count: number
  }>
}

interface TopResource {
  resourceType: string
  resourceId: string
  count: number
}

interface UsageSettings {
  eventsEnabled: boolean
}

type Period = '24h' | '7d' | '30d'

export default function UsageDashboardPage() {
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [topResources, setTopResources] = useState<TopResource[]>([])
  const [settings, setSettings] = useState<UsageSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('7d')
  const [updatingSettings, setUpdatingSettings] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      const [usageRes, topRes, settingsRes] = await Promise.all([
        fetch(`/api/usage?period=${period}`, { credentials: 'include' }),
        fetch(`/api/usage/top-resources?period=${period}&limit=10`, { credentials: 'include' }),
        fetch('/api/usage/settings', { credentials: 'include' }),
      ])

      if (!usageRes.ok || !topRes.ok || !settingsRes.ok) {
        throw new Error('Failed to fetch usage data')
      }

      const usageData = await usageRes.json()
      const topData = await topRes.json()
      const settingsData = await settingsRes.json()

      setUsage(usageData.data)
      setTopResources(topData.data)
      setSettings(settingsData.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [period])

  const handleToggleEvents = async () => {
    if (!settings) return
    setUpdatingSettings(true)

    try {
      const response = await fetch('/api/usage/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ eventsEnabled: !settings.eventsEnabled }),
      })

      if (!response.ok) throw new Error('Failed to update settings')
      const data = await response.json()
      setSettings(data.data)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update settings')
    } finally {
      setUpdatingSettings(false)
    }
  }

  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toString()
  }

  const getResourceTypeIcon = (type: string): string => {
    switch (type) {
      case 'skill': return '⚡'
      case 'mcp_server': return '🔌'
      case 'rag_query': return '🔍'
      default: return '📊'
    }
  }

  const getResourceTypeLabel = (type: string): string => {
    switch (type) {
      case 'skill': return 'Skills'
      case 'mcp_server': return 'MCP Servers'
      case 'rag_query': return 'RAG Queries'
      default: return type
    }
  }

  // Calculate max for chart scaling
  const maxCount = usage?.timeSeries.length
    ? Math.max(...usage.timeSeries.map(t => t.count), 1)
    : 1

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usage Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            Privacy-first analytics - no user-level tracking
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Period Selector */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>

          {/* Events Toggle */}
          {settings && (
            <button
              onClick={handleToggleEvents}
              disabled={updatingSettings}
              className={`px-4 py-2 rounded-lg font-medium ${
                settings.eventsEnabled
                  ? 'bg-green-100 text-green-800 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } disabled:opacity-50`}
            >
              {updatingSettings ? 'Updating...' : settings.eventsEnabled ? 'Events Enabled' : 'Events Disabled'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading usage data...</div>
        </div>
      ) : !usage || usage.totalEvents === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-6xl mb-4">📊</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No usage data yet</h2>
          <p className="text-gray-500 mb-4">
            {settings?.eventsEnabled
              ? 'Events are enabled but no data has been recorded yet.'
              : 'Enable event collection to start tracking usage.'}
          </p>
          {!settings?.eventsEnabled && (
            <button
              onClick={handleToggleEvents}
              disabled={updatingSettings}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Enable Events
            </button>
          )}
          <div className="mt-8 text-left max-w-md mx-auto bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2">How to collect events:</h3>
            <ol className="text-sm text-gray-600 space-y-2">
              <li>1. Enable events above or via API</li>
              <li>2. Install the Claude Code hook: <code className="bg-gray-200 px-1 rounded">tag hooks install</code></li>
              <li>3. Enable event collection: <code className="bg-gray-200 px-1 rounded">tag events enable</code></li>
              <li>4. Use skills and MCP tools - events are recorded automatically</li>
            </ol>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm font-medium text-gray-500 mb-1">Total Events</div>
              <div className="text-3xl font-bold text-gray-900">{formatNumber(usage.totalEvents)}</div>
              <div className="text-xs text-gray-400 mt-1">in {period}</div>
            </div>

            {usage.byResourceType.slice(0, 3).map(rt => (
              <div key={rt.resourceType} className="bg-white rounded-lg shadow p-6">
                <div className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-2">
                  <span>{getResourceTypeIcon(rt.resourceType)}</span>
                  <span>{getResourceTypeLabel(rt.resourceType)}</span>
                </div>
                <div className="text-3xl font-bold text-gray-900">{formatNumber(rt.count)}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {((rt.count / usage.totalEvents) * 100).toFixed(1)}% of total
                </div>
              </div>
            ))}
          </div>

          {/* Time Series Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Events Over Time</h2>
            <div className="h-48 flex items-end gap-1">
              {usage.timeSeries.map((point, i) => {
                const height = (point.count / maxCount) * 100
                const date = new Date(point.timestamp)
                const label = period === '24h'
                  ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : date.toLocaleDateString([], { month: 'short', day: 'numeric' })

                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center"
                    title={`${label}: ${point.count} events`}
                  >
                    <div
                      className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-pointer"
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                    {i % Math.ceil(usage.timeSeries.length / 8) === 0 && (
                      <div className="text-xs text-gray-400 mt-2 -rotate-45 origin-top-left whitespace-nowrap">
                        {label}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* By Resource Type */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">By Resource Type</h2>
              <div className="space-y-3">
                {usage.byResourceType.map(rt => {
                  const percentage = (rt.count / usage.totalEvents) * 100
                  return (
                    <div key={rt.resourceType}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="flex items-center gap-2">
                          <span>{getResourceTypeIcon(rt.resourceType)}</span>
                          <span>{getResourceTypeLabel(rt.resourceType)}</span>
                        </span>
                        <span className="text-gray-500">{formatNumber(rt.count)}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* By Action */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">By Action</h2>
              <div className="space-y-3">
                {usage.byAction.map(action => {
                  const percentage = (action.count / usage.totalEvents) * 100
                  return (
                    <div key={action.action}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{action.action}</span>
                        <span className="text-gray-500">{formatNumber(action.count)}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Top Resources */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Resources</h2>
            {topResources.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No resource data available</p>
            ) : (
              <table className="min-w-full">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                    <th className="pb-3">#</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Resource</th>
                    <th className="pb-3 text-right">Events</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {topResources.map((resource, i) => (
                    <tr key={`${resource.resourceType}-${resource.resourceId}`}>
                      <td className="py-3 text-gray-400">{i + 1}</td>
                      <td className="py-3">
                        <span className={`px-2 py-1 text-xs rounded ${
                          resource.resourceType === 'skill'
                            ? 'bg-purple-100 text-purple-800'
                            : resource.resourceType === 'mcp_server'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {resource.resourceType}
                        </span>
                      </td>
                      <td className="py-3 font-medium text-gray-900">{resource.resourceId}</td>
                      <td className="py-3 text-right text-gray-500">{formatNumber(resource.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Privacy Notice */}
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
            <strong>Privacy Notice:</strong> This dashboard shows aggregate usage counts only.
            No user identifiers are collected or stored. Events are bucketed into 15-minute
            intervals for aggregation. Individual user activity cannot be tracked.
          </div>
        </div>
      )}
    </div>
  )
}
