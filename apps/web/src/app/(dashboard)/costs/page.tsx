'use client'

/**
 * Costs Page
 *
 * Cost tracking, budget management, and spending analysis.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface CostOverview {
  totalCost: number
  costToday: number
  costThisWeek: number
  costThisMonth: number
  projectedMonthly: number
  trend: number // percentage change
}

interface AgentCost {
  agentId: string
  agentName: string
  cost: number
  percentage: number
  tokens: number
  requests: number
}

interface ModelCost {
  model: string
  provider: string
  cost: number
  percentage: number
  tokens: number
}

interface Budget {
  id: string
  name: string
  limit: number
  spent: number
  percentage: number
  period: 'daily' | 'weekly' | 'monthly'
  alertThreshold: number
  alertTriggered: boolean
}

export default function CostsPage() {
  const [overview, setOverview] = useState<CostOverview | null>(null)
  const [agentCosts, setAgentCosts] = useState<AgentCost[]>([])
  const [modelCosts, setModelCosts] = useState<ModelCost[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      const [overviewRes, agentsRes, modelsRes, budgetsRes] = await Promise.all([
        fetch('/api/costs/overview', { credentials: 'include' }),
        fetch('/api/costs/by-agent', { credentials: 'include' }),
        fetch('/api/costs/by-model', { credentials: 'include' }),
        fetch('/api/costs/budgets', { credentials: 'include' }),
      ])

      if (overviewRes.ok) {
        const data = await overviewRes.json()
        setOverview(data.data)
      }
      if (agentsRes.ok) {
        const data = await agentsRes.json()
        setAgentCosts(data.data || [])
      }
      if (modelsRes.ok) {
        const data = await modelsRes.json()
        setModelCosts(data.data || [])
      }
      if (budgetsRes.ok) {
        const data = await budgetsRes.json()
        setBudgets(data.data || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cost data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const formatCurrency = (n: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(n)
  }

  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toLocaleString()
  }

  const getBudgetColor = (percentage: number, alertTriggered: boolean): string => {
    if (alertTriggered || percentage >= 100) return 'bg-red-500'
    if (percentage >= 80) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading cost data...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Costs</h1>
          <p className="text-gray-500">Track spending and manage budgets</p>
        </div>
        <Link
          href="/admin"
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          Manage Budgets
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Today</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(overview?.costToday || 0)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">This Week</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(overview?.costThisWeek || 0)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">This Month</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(overview?.costThisMonth || 0)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Projected Monthly</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(overview?.projectedMonthly || 0)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Trend</p>
          <p className={`text-2xl font-bold ${(overview?.trend || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {(overview?.trend || 0) > 0 ? '+' : ''}{overview?.trend || 0}%
          </p>
        </div>
      </div>

      {/* Budgets */}
      {budgets.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Budget Status</h2>
          <div className="space-y-4">
            {budgets.map((budget) => (
              <div key={budget.id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-900">{budget.name}</span>
                  <span className="text-gray-500">
                    {formatCurrency(budget.spent)} / {formatCurrency(budget.limit)}
                    {budget.alertTriggered && (
                      <span className="ml-2 text-red-600">Alert!</span>
                    )}
                  </span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${getBudgetColor(budget.percentage, budget.alertTriggered)}`}
                    style={{ width: `${Math.min(budget.percentage, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {budget.period} budget • {budget.percentage.toFixed(1)}% used
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Agent */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Cost by Agent</h2>
          {agentCosts.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No cost data available</p>
          ) : (
            <div className="space-y-3">
              {agentCosts.slice(0, 10).map((agent) => (
                <div key={agent.agentId}>
                  <div className="flex justify-between text-sm mb-1">
                    <Link href={`/agents/${agent.agentId}`} className="font-medium text-blue-600 hover:text-blue-800">
                      {agent.agentName}
                    </Link>
                    <span className="text-gray-900">{formatCurrency(agent.cost)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${agent.percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatNumber(agent.requests)} requests • {formatNumber(agent.tokens)} tokens
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Model */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Cost by Model</h2>
          {modelCosts.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No model cost data available</p>
          ) : (
            <div className="space-y-3">
              {modelCosts.map((model) => (
                <div key={model.model}>
                  <div className="flex justify-between text-sm mb-1">
                    <div>
                      <span className="font-medium text-gray-900">{model.model}</span>
                      <span className="text-gray-500 ml-2">({model.provider})</span>
                    </div>
                    <span className="text-gray-900">{formatCurrency(model.cost)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${model.percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatNumber(model.tokens)} tokens • {model.percentage.toFixed(1)}% of total
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Total Cost Card */}
      <div className="mt-6 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium opacity-80">Total All-Time Cost</p>
            <p className="text-3xl font-bold">{formatCurrency(overview?.totalCost || 0)}</p>
          </div>
          <div className="text-6xl opacity-20">💰</div>
        </div>
      </div>
    </div>
  )
}
