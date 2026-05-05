'use client'

/**
 * Dashboard Page
 *
 * Main overview with key metrics, activity feed, trends, and anomalies.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Overview {
  totalAgents: number
  activeAgents: number
  totalEvents: number
  eventsToday: number
  totalCost: number
  costToday: number
  openIncidents: number
  threats: number
}

interface Activity {
  id: string
  type: string
  message: string
  timestamp: string
  agentId?: string
  agentName?: string
}

interface Trend {
  date: string
  events: number
  cost: number
}

interface Anomaly {
  id: string
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  timestamp: string
  agentId?: string
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [trends, setTrends] = useState<Trend[]>([])
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        const [overviewRes, activityRes, trendsRes, anomaliesRes] = await Promise.all([
          fetch('/api/dashboard/overview', { credentials: 'include' }),
          fetch('/api/dashboard/activity', { credentials: 'include' }),
          fetch('/api/dashboard/trends', { credentials: 'include' }),
          fetch('/api/dashboard/anomalies', { credentials: 'include' }),
        ])

        if (overviewRes.ok) {
          const data = await overviewRes.json()
          setOverview(data.data)
        }
        if (activityRes.ok) {
          const data = await activityRes.json()
          setActivity(data.data || [])
        }
        if (trendsRes.ok) {
          const data = await trendsRes.json()
          setTrends(data.data || [])
        }
        if (anomaliesRes.ok) {
          const data = await anomaliesRes.json()
          setAnomalies(data.data || [])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toString()
  }

  const formatCurrency = (n: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(n)
  }

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200'
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      default: return 'bg-blue-100 text-blue-800 border-blue-200'
    }
  }

  const maxTrendEvents = trends.length > 0 ? Math.max(...trends.map(t => t.events), 1) : 1

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Overview of your AI agent platform</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Agents</p>
              <p className="text-2xl font-bold text-gray-900">{formatNumber(overview?.totalAgents || 0)}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-2xl">🤖</span>
            </div>
          </div>
          <p className="text-sm text-green-600 mt-2">
            {overview?.activeAgents || 0} active now
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Events Today</p>
              <p className="text-2xl font-bold text-gray-900">{formatNumber(overview?.eventsToday || 0)}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <span className="text-2xl">📡</span>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {formatNumber(overview?.totalEvents || 0)} total
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Cost Today</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(overview?.costToday || 0)}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center">
              <span className="text-2xl">💰</span>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {formatCurrency(overview?.totalCost || 0)} total
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Open Incidents</p>
              <p className="text-2xl font-bold text-gray-900">{overview?.openIncidents || 0}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
              <span className="text-2xl">🚨</span>
            </div>
          </div>
          <p className="text-sm text-orange-600 mt-2">
            {overview?.threats || 0} threats detected
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Trend Chart */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity Trend</h2>
          {trends.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-500">
              No trend data available
            </div>
          ) : (
            <div className="h-48 flex items-end gap-1">
              {trends.map((point, i) => {
                const height = (point.events / maxTrendEvents) * 100
                const date = new Date(point.date)
                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center"
                    title={`${date.toLocaleDateString()}: ${point.events} events`}
                  >
                    <div
                      className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-pointer"
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                    {i % Math.ceil(trends.length / 7) === 0 && (
                      <div className="text-xs text-gray-400 mt-2 whitespace-nowrap">
                        {date.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Anomalies */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Anomalies</h2>
            <Link href="/security" className="text-sm text-blue-600 hover:text-blue-800">
              View all
            </Link>
          </div>
          {anomalies.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <span className="text-4xl block mb-2">✅</span>
              No anomalies detected
            </div>
          ) : (
            <div className="space-y-3">
              {anomalies.slice(0, 5).map((anomaly) => (
                <div
                  key={anomaly.id}
                  className={`p-3 rounded-lg border ${getSeverityColor(anomaly.severity)}`}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-medium uppercase">{anomaly.severity}</span>
                    <span className="text-xs">{new Date(anomaly.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-sm mt-1">{anomaly.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-6 bg-white rounded-lg shadow">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          <Link href="/events" className="text-sm text-blue-600 hover:text-blue-800">
            View all
          </Link>
        </div>
        {activity.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No recent activity
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {activity.slice(0, 10).map((item) => (
              <div key={item.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">{item.message}</p>
                    {item.agentName && (
                      <Link
                        href={`/agents/${item.agentId}`}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        {item.agentName}
                      </Link>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap ml-4">
                    {new Date(item.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Link
          href="/agents"
          className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow flex items-center gap-3"
        >
          <span className="text-2xl">🤖</span>
          <span className="font-medium text-gray-900">Manage Agents</span>
        </Link>
        <Link
          href="/workflows"
          className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow flex items-center gap-3"
        >
          <span className="text-2xl">⚡</span>
          <span className="font-medium text-gray-900">Workflows</span>
        </Link>
        <Link
          href="/analytics"
          className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow flex items-center gap-3"
        >
          <span className="text-2xl">📈</span>
          <span className="font-medium text-gray-900">Analytics</span>
        </Link>
        <Link
          href="/costs"
          className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow flex items-center gap-3"
        >
          <span className="text-2xl">💰</span>
          <span className="font-medium text-gray-900">Cost Report</span>
        </Link>
      </div>
    </div>
  )
}
