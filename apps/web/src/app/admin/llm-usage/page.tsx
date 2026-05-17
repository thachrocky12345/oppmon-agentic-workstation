// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

'use client'

/**
 * Admin LLM Usage Dashboard
 *
 * Shows LLM usage statistics across all users and models.
 */

import { useState, useEffect } from 'react'

interface UsageSummary {
  totalCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  uniqueUsers: number
}

interface ModelUsage {
  provider: string
  model: string
  calls: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

interface DailyUsage {
  date: string
  provider: string
  calls: number
  inputTokens: number
  outputTokens: number
}

interface RecentMessage {
  id: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  createdAt: string
  user: { name: string; email: string }
}

interface Provider {
  id: string
  name: string
  available: boolean
  isDefault: boolean
  source: 'registry' | 'env' | 'none'
}

interface UserUsage {
  userId: string
  userName: string
  userEmail: string
  sessions: number
  messages: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

interface UsageData {
  summary: UsageSummary
  byModel: ModelUsage[]
  dailyUsage: DailyUsage[]
  recentMessages: RecentMessage[]
  providers: Provider[]
}

export default function LLMUsagePage() {
  const [data, setData] = useState<UsageData | null>(null)
  const [users, setUsers] = useState<UserUsage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'activity'>('overview')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      const [usageRes, usersRes] = await Promise.all([
        fetch('/api/admin/llm-usage', { credentials: 'include' }),
        fetch('/api/admin/llm-usage/users', { credentials: 'include' }),
      ])

      if (!usageRes.ok) throw new Error('Failed to fetch usage data')
      if (!usersRes.ok) throw new Error('Failed to fetch user data')

      const usageData = await usageRes.json()
      const usersData = await usersRes.json()

      setData(usageData.data)
      setUsers(usersData.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const formatNumber = (n: number) => n.toLocaleString()
  const formatDate = (d: string) => new Date(d).toLocaleString()

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'anthropic': return 'bg-orange-100 text-orange-800'
      case 'cerebras': return 'bg-purple-100 text-purple-800'
      case 'ollama': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'registry': return 'bg-blue-100 text-blue-800'
      case 'env': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-500'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading usage data...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error}
      </div>
    )
  }

  if (!data) return null

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">LLM Usage Dashboard</h1>
          <p className="text-gray-500 text-sm">Monitor AI model usage across your organization</p>
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-gray-900">{formatNumber(data.summary.totalCalls)}</div>
          <div className="text-sm text-gray-500">Total Calls</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-blue-600">{formatNumber(data.summary.totalInputTokens)}</div>
          <div className="text-sm text-gray-500">Input Tokens</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-green-600">{formatNumber(data.summary.totalOutputTokens)}</div>
          <div className="text-sm text-gray-500">Output Tokens</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-purple-600">{formatNumber(data.summary.totalTokens)}</div>
          <div className="text-sm text-gray-500">Total Tokens</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-gray-900">{data.summary.uniqueUsers}</div>
          <div className="text-sm text-gray-500">Active Users</div>
        </div>
      </div>

      {/* Providers Status */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Configured Providers</h2>
        <div className="flex flex-wrap gap-3">
          {data.providers.map((provider) => (
            <div
              key={provider.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                provider.available ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${provider.available ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className="font-medium text-gray-900">{provider.name}</span>
              {provider.isDefault && (
                <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">Default</span>
              )}
              <span className={`px-2 py-0.5 text-xs rounded ${getSourceBadge(provider.source)}`}>
                {provider.source === 'registry' ? 'Registry' : provider.source === 'env' ? 'Env Var' : 'Not Set'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          {(['overview', 'users', 'activity'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'overview' && 'Usage by Model'}
              {tab === 'users' && 'Usage by User'}
              {tab === 'activity' && 'Recent Activity'}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Provider</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Calls</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Input Tokens</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Output Tokens</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.byModel.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No usage data yet
                  </td>
                </tr>
              ) : (
                data.byModel.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded ${getProviderColor(row.provider)}`}>
                        {row.provider}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 font-mono">{row.model}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">{formatNumber(row.calls)}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">{formatNumber(row.inputTokens)}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">{formatNumber(row.outputTokens)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 text-right">{formatNumber(row.totalTokens)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sessions</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Messages</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Input Tokens</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Output Tokens</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No user data yet
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.userId} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{user.userName || 'Unknown'}</div>
                      <div className="text-sm text-gray-500">{user.userEmail}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">{user.sessions}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">{user.messages}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">{formatNumber(user.inputTokens)}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">{formatNumber(user.outputTokens)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 text-right">{formatNumber(user.totalTokens)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Provider</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tokens</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.recentMessages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No recent activity
                  </td>
                </tr>
              ) : (
                data.recentMessages.map((msg) => (
                  <tr key={msg.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDate(msg.createdAt)}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{msg.user?.name || msg.user?.email || 'Unknown'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded ${getProviderColor(msg.provider)}`}>
                        {msg.provider}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 font-mono">{msg.model}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">
                      {msg.inputTokens} / {msg.outputTokens}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
